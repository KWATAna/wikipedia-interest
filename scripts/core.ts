/** Deterministic calculations for monthly Wikipedia interest signals. */

import type { Confidence, Direction, LanguageResult, Manifest, ManifestEdition,
  MonthlySeries, NullableMonthlySeries, Screening } from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function monthRange(endMonth: string, count: number): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth)) throw new Error('end month must be YYYY-MM');
  if (!Number.isInteger(count) || count < 1 || count > 120) throw new Error('months must be 1 to 120');
  const [year, month] = endMonth.split('-').map(Number);
  const endIndex = year * 12 + month - 1;
  return Array.from({ length: count }, (_, i) => {
    const index = endIndex - count + i + 1;
    return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
  });
}

export function lastCompleteMonth(today: Date = new Date()): string {
  const index = today.getUTCFullYear() * 12 + today.getUTCMonth()
    - (today.getUTCDate() <= 2 ? 2 : 1);
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
}

export function parseManifest(raw: unknown): Manifest {
  if (!isRecord(raw) || typeof raw.topic !== 'string' || !raw.topic.trim()) throw new Error('manifest needs a nonempty topic');
  if (!Array.isArray(raw.editions) || raw.editions.length < 1 || raw.editions.length > 6) {
    throw new Error('manifest needs 1 to 6 editions');
  }
  const seen = new Set<string>();
  const editions = raw.editions.map((edition: unknown): ManifestEdition => {
    if (!isRecord(edition)) throw new Error('edition must be an object');
    const language = edition.language;
    if (typeof language !== 'string' || !/^[a-z][a-z0-9-]{1,11}$/.test(language)) {
      throw new Error('language must be a Wikipedia language code');
    }
    if (seen.has(language)) throw new Error(`duplicate edition: ${language}`);
    seen.add(language);
    const rawArticles = edition.articles;
    if (!Array.isArray(rawArticles) || rawArticles.length < 1 || rawArticles.length > 6) {
      throw new Error(`${language} needs 1 to 6 article titles`);
    }
    if (rawArticles.some((title: unknown) => typeof title !== 'string' || !title.trim())) {
      throw new Error(`${language} contains an empty title`);
    }
    const articles = rawArticles.map((title: string) => title.trim().replaceAll('_', ' '));
    if (new Set(articles.map((title: string) => title.toLocaleLowerCase())).size !== articles.length) {
      throw new Error(`duplicate article in ${language}`);
    }
    return { language, articles, rationale: String(edition.rationale ?? '').trim() };
  });
  const overrides = raw.screening ?? {};
  if (!isRecord(overrides)) throw new Error('invalid screening criteria');
  const minRecentViews = overrides.minRecentViews ?? 200;
  const minConfidence = overrides.minConfidence ?? 'medium';
  const requireRawGrowth = overrides.requireRawGrowth ?? true;
  const requireShareGrowth = overrides.requireShareGrowth ?? true;
  if (typeof minRecentViews !== 'number' || !Number.isSafeInteger(minRecentViews) || minRecentViews < 0
    || typeof minConfidence !== 'string' || !['low', 'medium', 'high'].includes(minConfidence)
    || typeof requireRawGrowth !== 'boolean' || typeof requireShareGrowth !== 'boolean') {
    throw new Error('invalid screening criteria');
  }
  const screening: Screening = { minRecentViews, minConfidence: minConfidence as Screening['minConfidence'],
    requireRawGrowth, requireShareGrowth };
  const assumptions = raw.assumptions ?? [];
  if (!Array.isArray(assumptions) || assumptions.length > 4
    || assumptions.some((item: unknown) => typeof item !== 'string' || !item.trim())) {
    throw new Error('assumptions must be up to four nonempty strings');
  }
  return { topic: raw.topic.trim(), question: String(raw.question ?? '').trim(), editions,
    screening, assumptions: assumptions.map((item: string) => item.trim()) };
}

const pctChange = (now: number, prior: number): number | null => prior > 0 ? (now / prior - 1) * 100 : null;

export function evaluateLanguage(language: string, articleSeries: Record<string, MonthlySeries>,
  projectSeries: MonthlySeries, months: string[]): LanguageResult {
  if (months.length < 24) throw new Error('at least 24 months are needed for matched-year comparison');
  const window = months.slice(-24);
  const prior = window.slice(0, 12);
  const recent = window.slice(12);
  const loaded = new Set(window.filter(month => Number.isFinite(projectSeries[month]) && projectSeries[month] > 0));
  const values: NullableMonthlySeries = Object.fromEntries(window.map(month => [month, loaded.has(month)
    ? Object.values(articleSeries).reduce((sum, series) => sum + (series[month] ?? 0), 0) : null]));
  if (Object.values(values).some(value => value !== null && value < 0)) throw new Error('negative pageviews');
  const sumViews = (period: string[]) => period.reduce((sum, month) => sum + (values[month] ?? 0), 0);
  const sumProject = (period: string[]) => period.reduce((sum, month) => sum + (loaded.has(month) ? projectSeries[month] : 0), 0);
  const observedViewsPrior = sumViews(prior);
  const observedViewsRecent = sumViews(recent);
  const projectPrior = sumProject(prior);
  const projectRecent = sumProject(recent);
  const articleObservations = Object.values(articleSeries).reduce((sum, series) => sum + Object.keys(series).length, 0);
  const complete = loaded.size === 24 && articleObservations > 0;
  const viewsPrior = complete ? observedViewsPrior : null;
  const viewsRecent = complete ? observedViewsRecent : null;
  const sharePriorPerMillion = complete && projectPrior > 0 ? observedViewsPrior / projectPrior * 1e6 : null;
  const shareRecentPerMillion = complete && projectRecent > 0 ? observedViewsRecent / projectRecent * 1e6 : null;
  const pairs = prior.map((month, i) => [month, recent[i]] as const)
    .filter(([a, b]) => loaded.has(a) && loaded.has(b));
  const positiveYoyMonths = pairs.filter(([a, b]) => values[b]! > values[a]!).length;
  const negativeYoyMonths = pairs.filter(([a, b]) => values[b]! < values[a]!).length;
  const directionalMonths = Math.max(positiveYoyMonths, negativeYoyMonths);
  const direction: Direction = !complete ? 'insufficient'
    : positiveYoyMonths >= 8 ? 'rising' : negativeYoyMonths >= 8 ? 'falling' : 'mixed';
  const recentPeak = observedViewsRecent > 0 ? Math.max(...recent.map(month => values[month] ?? 0)) / observedViewsRecent : 0;
  const priorPeak = observedViewsPrior > 0 ? Math.max(...prior.map(month => values[month] ?? 0)) / observedViewsPrior : 0;
  const peakMonthShare = complete ? Math.max(recentPeak, priorPeak) : null;
  const flags: string[] = [];
  if (loaded.size < 24) flags.push('project month missing');
  if (articleObservations === 0) flags.push('no article observations');
  if (complete && observedViewsPrior < 200) flags.push('low baseline');
  if (complete && peakMonthShare !== null && peakMonthShare > .35) flags.push('spike dominated');
  if (direction === 'mixed') flags.push('mixed monthly direction');
  let confidence: Confidence = 'low';
  if (!complete || !projectPrior || !projectRecent) confidence = 'insufficient';
  else if (observedViewsPrior >= 1000 && observedViewsRecent >= 1000 && directionalMonths >= 9 && peakMonthShare !== null && peakMonthShare <= .25) confidence = 'high';
  else if (observedViewsPrior >= 200 && observedViewsRecent >= 200 && directionalMonths >= 7 && peakMonthShare !== null && peakMonthShare <= .35) confidence = 'medium';
  return { language, articles: Object.keys(articleSeries), months: window, monthlyViews: values,
    loadedMonths: loaded.size, articleObservations, coverageComplete: complete,
    observedViewsPrior, observedViewsRecent, viewsPrior, viewsRecent,
    viewsYoyPct: complete ? pctChange(observedViewsRecent, observedViewsPrior) : null, sharePriorPerMillion, shareRecentPerMillion,
    shareYoyPct: shareRecentPerMillion === null || sharePriorPerMillion === null
      ? null : pctChange(shareRecentPerMillion, sharePriorPerMillion),
    positiveYoyMonths, negativeYoyMonths, comparableYoyMonths: pairs.length, direction,
    peakMonthShare, confidence, flags };
}

type CandidateMetric = Pick<LanguageResult, 'language' | 'confidence' | 'viewsYoyPct' | 'shareYoyPct' | 'viewsRecent'>;

export function selectCandidate(results: CandidateMetric[], options: Partial<Screening> = {}): string | null {
  const criteria: Screening = { minRecentViews: 200, minConfidence: 'medium',
    requireRawGrowth: true, requireShareGrowth: true, ...options };
  const grades: Record<Confidence, number> = { insufficient: -1, low: 0, medium: 1, high: 2 };
  const eligible = results.filter(result => grades[result.confidence] >= grades[criteria.minConfidence]
    && result.viewsRecent !== null && result.viewsRecent >= criteria.minRecentViews
    && (!criteria.requireRawGrowth || (result.viewsYoyPct ?? -Infinity) > 0)
    && (!criteria.requireShareGrowth || (result.shareYoyPct ?? -Infinity) > 0));
  eligible.sort((a, b) => Number(b.confidence === 'high') - Number(a.confidence === 'high')
    || (b.shareYoyPct ?? -Infinity) - (a.shareYoyPct ?? -Infinity) || (b.viewsRecent ?? 0) - (a.viewsRecent ?? 0));
  return eligible[0]?.language ?? null;
}
