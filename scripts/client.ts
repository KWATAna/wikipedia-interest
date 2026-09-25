/** Small sequential Wikimedia client with a disk cache and traceable URLs. */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MonthlySeries } from './types.ts';

interface CachedRecord {
  status: number;
  data: unknown;
  fetchedAt: string;
}

interface ApiResult extends CachedRecord {
  url: string;
  cacheHit: boolean;
}

export interface ArticleResolution {
  title: string;
  pageId: number;
  url: string;
  requestedTitle: string;
  sourceUrl: string;
}

export interface TrafficResult extends ApiResult {
  series: MonthlySeries;
}

interface WikimediaClientOptions {
  cacheDir: string;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  refresh?: boolean;
}

interface MediaWikiResponse {
  query?: {
    pages?: Array<{ title: string; pageid: number; ns: number; missing?: boolean;
      langlinks?: Array<{ lang: string; title: string }> }>;
    search?: Array<{ title: string; pageid: number }>;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ROOT = 'https://wikimedia.org/api/rest_v1/metrics/pageviews';
const DAY = 24 * 60 * 60 * 1000;
const pad = (value: number): string => String(value).padStart(2, '0');

function assertContactAgent(userAgent: unknown): asserts userAgent is string {
  const contact = /\([^)]*(?:https?:\/\/[^\s)]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|User:[^\s)]+)[^)]*\)/;
  if (typeof userAgent !== 'string' || !/^\S+\/\S+\s+\(/.test(userAgent) || !contact.test(userAgent)) {
    throw new Error('Operator contact is required in Wikimedia User-Agent (email, URL, or wiki User:)');
  }
}

export function assertLanguageCode(language: unknown): string {
  if (typeof language !== 'string' || !/^[a-z][a-z0-9-]{1,11}$/.test(language)) {
    throw new Error(`invalid language code: ${language}`);
  }
  return language;
}

function endpointDates(first: string, last: string, withHour = false): [string, string] {
  const [year, month] = last.split('-').map(Number);
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [`${first.replace('-', '')}01${withHour ? '00' : ''}`,
    `${last.replace('-', '')}${pad(endDay)}${withHour ? '00' : ''}`];
}

export function articleViewsUrl(language: string, title: string, first: string, last: string): string {
  assertLanguageCode(language);
  const [start, end] = endpointDates(first, last);
  return `${ROOT}/per-article/${language}.wikipedia.org/all-access/user/${encodeURIComponent(title.replaceAll(' ', '_'))}/monthly/${start}/${end}`;
}

export function projectViewsUrl(language: string, first: string, last: string): string {
  assertLanguageCode(language);
  const [start, end] = endpointDates(first, last, true);
  return `${ROOT}/aggregate/${language}.wikipedia.org/all-access/user/monthly/${start}/${end}`;
}

function mediaWikiUrl(language: string, params: Record<string, string>): string {
  assertLanguageCode(language);
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  for (const [name, value] of Object.entries({ ...params, format: 'json', formatversion: '2' })) {
    url.searchParams.set(name, value);
  }
  return url.href;
}

function monthlySeries(data: unknown): MonthlySeries {
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error('Wikimedia response has no items array');
  const series: MonthlySeries = {};
  for (const item of data.items) {
    if (!isRecord(item) || typeof item.timestamp !== 'string' || typeof item.views !== 'number') {
      throw new Error('Wikimedia response has an invalid monthly item');
    }
    const month = /^\d{4}(0[1-9]|1[0-2])01\d{2}$/.test(item.timestamp)
      ? `${item.timestamp.slice(0, 4)}-${item.timestamp.slice(4, 6)}` : null;
    if (!month || !Number.isSafeInteger(item.views) || item.views < 0) {
      throw new Error('Wikimedia response has an invalid monthly item');
    }
    if (Object.hasOwn(series, month)) throw new Error(`duplicate monthly item: ${month}`);
    series[month] = item.views;
  }
  return series;
}

export class WikimediaClient {
  readonly cacheDir: string;
  readonly userAgent: string | undefined;
  readonly fetchImpl: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly refresh: boolean;

  constructor({ cacheDir, userAgent = process.env.WIKIMEDIA_USER_AGENT,
  fetchImpl = globalThis.fetch, sleep = ms => new Promise<void>(resolve => setTimeout(resolve, ms)),
  refresh = false }: WikimediaClientOptions) {
    if (!cacheDir) throw new Error('cacheDir is required');
    this.cacheDir = cacheDir;
    this.userAgent = userAgent;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.refresh = refresh;
  }

  async getJson(url: string): Promise<ApiResult> {
    const key = createHash('sha256').update(url).digest('hex');
    const file = join(this.cacheDir, `${key}.json`);
    try {
      const cached = JSON.parse(await readFile(file, 'utf8')) as CachedRecord;
      const ttl = cached.status === 404 ? DAY / 24 : 7 * DAY;
      if (!this.refresh && Date.now() - Date.parse(cached.fetchedAt) < ttl) return { ...cached, url, cacheHit: true };
    } catch (error) {
      if (!(error instanceof SyntaxError)
        && !(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    const userAgent = this.userAgent;
    assertContactAgent(userAgent);
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await this.fetchImpl(url, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
          signal: AbortSignal.timeout(15000),
        });
      } catch (error) {
        if (attempt === 2) throw new Error(`Wikimedia request failed: ${url}: ${error instanceof Error ? error.message : String(error)}`);
        await this.sleep(500 * 2 ** attempt);
        continue;
      }
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
      const retryAfter = Number(response.headers.get('retry-after'));
      await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 30000) : 500 * 2 ** attempt);
    }
    if (!response || (response.status !== 200 && response.status !== 404)) {
      throw new Error(`Wikimedia HTTP ${response?.status ?? 'no response'}: ${url}`);
    }
    const record: CachedRecord = { status: response.status, data: response.status === 404 ? null : await response.json(),
      fetchedAt: new Date().toISOString() };
    await mkdir(this.cacheDir, { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(record));
    await rename(temporary, file);
    return { ...record, url, cacheHit: false };
  }

  async resolveArticle(language: string, title: string): Promise<ArticleResolution> {
    const url = mediaWikiUrl(language, { action: 'query', titles: title,
      redirects: '1', prop: 'info' });
    const result = await this.getJson(url);
    const page = (result.data as MediaWikiResponse | null)?.query?.pages?.[0];
    if (!page || page.missing || typeof page.title !== 'string' || !Number.isSafeInteger(page.pageid)) {
      throw new Error(`article not found: ${language}:${title}`);
    }
    if (page.ns !== 0) throw new Error(`not a main-namespace article: ${language}:${title}`);
    return { title: page.title, pageId: page.pageid,
      url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`,
      requestedTitle: title, sourceUrl: url };
  }

  async discoverLanguages(sourceLanguage: string, title: string, languages: string[]) {
    assertLanguageCode(sourceLanguage);
    languages.forEach(assertLanguageCode);
    const resolved = await this.resolveArticle(sourceLanguage, title);
    const url = mediaWikiUrl(sourceLanguage, { action: 'query', titles: resolved.title,
      prop: 'langlinks', lllimit: 'max' });
    const result = await this.getJson(url);
    const links = (result.data as MediaWikiResponse | null)?.query?.pages?.[0]?.langlinks ?? [];
    return { source: { language: sourceLanguage, ...resolved }, sourceUrl: url,
      editions: languages.map(language => ({ language,
        title: language === sourceLanguage ? resolved.title
          : links.find(link => link.lang === language)?.title ?? null })) };
  }

  async searchArticles(language: string, query: string) {
    const url = mediaWikiUrl(language, { action: 'query', list: 'search', srsearch: query,
      srnamespace: '0', srlimit: '5' });
    const result = await this.getJson(url);
    return { language, query, sourceUrl: url,
      candidates: ((result.data as MediaWikiResponse | null)?.query?.search ?? []).map(item => ({ title: item.title,
        pageId: item.pageid, url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(' ', '_'))}` })) };
  }

  async fetchArticleViews(language: string, title: string, first: string, last: string): Promise<TrafficResult> {
    const result = await this.getJson(articleViewsUrl(language, title, first, last));
    return { ...result, series: result.status === 404 ? {} : monthlySeries(result.data) };
  }

  async fetchProjectViews(language: string, first: string, last: string): Promise<TrafficResult> {
    const result = await this.getJson(projectViewsUrl(language, first, last));
    if (result.status === 404) throw new Error(`project traffic unavailable: ${language} ${first}..${last}`);
    return { ...result, series: monthlySeries(result.data) };
  }
}
