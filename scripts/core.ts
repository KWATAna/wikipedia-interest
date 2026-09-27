/** Deterministic calculations for monthly Wikipedia interest signals. */

import type { Confidence, Direction, LanguageResult, Manifest, ManifestEdition,
  MonthlySeries, NullableMonthlySeries, Screening, ScreeningAssessment, ScreeningCheck } from './types.ts';
import { calculateArticleTrends, calculatePeakPairSensitivity } from './diagnostics.ts';
import { formatPercent } from './format.ts';

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
    const rawFormer = edition.formerTitles ?? {};
    if (!isRecord(rawFormer)) throw new Error('former titles must map selected articles to title lists');
    const formerTitles: Record<string, string[]> = {};
    for (const [rawTitle, rawList] of Object.entries(rawFormer)) {
      const title = rawTitle.trim().replaceAll('_', ' ');
      if (!articles.includes(title)) throw new Error(`former titles key is not a selected article: ${rawTitle}`);
      if (!Array.isArray(rawList) || rawList.length < 1 || rawList.length > 6
        || rawList.some(item => typeof item !== 'string' || !item.trim())) {
        throw new Error(`former titles for ${title} must be 1 to 6 nonempty strings`);
      }
      const titles = rawList.map((item: string) => item.trim().replaceAll('_', ' '));
      if (new Set(titles.map(item => item.toLocaleLowerCase())).size !== titles.length
        || titles.some(item => item.toLocaleLowerCase() === title.toLocaleLowerCase())) {
        throw new Error(`duplicate former title for ${title}`);
      }
      formerTitles[title] = titles;
    }
    return { language, articles, rationale: String(edition.rationale ?? '').trim(), formerTitles };
  });
  const overrides = raw.screening ?? {};
  if (!isRecord(overrides)) throw new Error('invalid screening criteria');
  const minRecentViews = overrides.minRecentViews ?? 200;
  const minConfidence = overrides.minConfidence ?? 'medium';
  const requireRawGrowth = overrides.requireRawGrowth ?? true;
  const requireShareGrowth = overrides.requireShareGrowth ?? true;
  const requireRisingDirection = overrides.requireRisingDirection === undefined
    ? true : overrides.requireRisingDirection;
  if (typeof minRecentViews !== 'number' || !Number.isSafeInteger(minRecentViews) || minRecentViews < 0
    || typeof minConfidence !== 'string' || !['low', 'medium', 'high'].includes(minConfidence)
    || typeof requireRawGrowth !== 'boolean' || typeof requireShareGrowth !== 'boolean'
    || typeof requireRisingDirection !== 'boolean') {
    throw new Error('invalid screening criteria');
  }
  const screening: Screening = { minRecentViews, minConfidence: minConfidence as Screening['minConfidence'],
    requireRawGrowth, requireShareGrowth, requireRisingDirection };
  const assumptions = raw.assumptions ?? [];
  if (!Array.isArray(assumptions) || assumptions.length > 4
    || assumptions.some((item: unknown) => typeof item !== 'string' || !item.trim())) {
    throw new Error('assumptions must be up to four nonempty strings');
  }
  const conceptMismatchRationale = raw.conceptMismatchRationale;
  if (conceptMismatchRationale !== undefined
    && (typeof conceptMismatchRationale !== 'string' || !conceptMismatchRationale.trim())) {
    throw new Error('concept mismatch review rationale must be a nonempty string');
  }
  return { topic: raw.topic.trim(), question: String(raw.question ?? '').trim(), editions,
    screening, assumptions: assumptions.map((item: string) => item.trim()),
    conceptMismatchRationale: conceptMismatchRationale?.trim() };
}

const pctChange = (now: number, prior: number): number | null => prior > 0 ? (now / prior - 1) * 100 : null;

export function evaluateLanguage(language: string, articleSeries: Record<string, NullableMonthlySeries>,
  projectSeries: MonthlySeries, months: string[]): LanguageResult {
  if (months.length < 24) throw new Error('at least 24 months are needed for matched-year comparison');
  const window = months.slice(-24);
  const prior = window.slice(0, 12);
  const recent = window.slice(12);
  const loaded = new Set(window.filter(month => Number.isFinite(projectSeries[month]) && projectSeries[month] > 0));
  const articles = Object.entries(articleSeries);
  const articleMonthlyViews: Record<string, NullableMonthlySeries> = Object.fromEntries(articles.map(([title, series]) =>
    [title, Object.fromEntries(window.map(month => [month, series[month] === null ? null
      : Object.hasOwn(series, month) ? series[month] : loaded.has(month) ? 0 : null]))]));
  const editionMonthlyViews: NullableMonthlySeries = Object.fromEntries(window.map(month =>
    [month, loaded.has(month) ? projectSeries[month] : null]));
  const observed: MonthlySeries = Object.fromEntries(window.map(month => [month,
    articles.reduce((sum, [, series]) => sum + (series[month] ?? 0), 0)]));
  const values: NullableMonthlySeries = Object.fromEntries(window.map(month => [month,
    loaded.has(month) && articles.every(([, series]) => series[month] !== null) ? observed[month] : null]));
  if (Object.values(values).some(value => value !== null && value < 0)) throw new Error('negative pageviews');
  const sumViews = (period: string[]) => period.reduce((sum, month) => sum + observed[month], 0);
  const sumProject = (period: string[]) => period.reduce((sum, month) => sum + (loaded.has(month) ? projectSeries[month] : 0), 0);
  const observedViewsPrior = sumViews(prior);
  const observedViewsRecent = sumViews(recent);
  const projectPrior = sumProject(prior);
  const projectRecent = sumProject(recent);
  const articleObservations = articles.reduce((sum, [, series]) => sum
    + Object.values(series).filter(value => value !== null).length, 0);
  const complete = loaded.size === 24 && articleObservations > 0
    && Object.values(values).every(value => value !== null);
  const viewsPrior = complete ? observedViewsPrior : null;
  const viewsRecent = complete ? observedViewsRecent : null;
  const sharePriorPerMillion = complete && projectPrior > 0 ? observedViewsPrior / projectPrior * 1e6 : null;
  const shareRecentPerMillion = complete && projectRecent > 0 ? observedViewsRecent / projectRecent * 1e6 : null;
  const pairs = prior.map((month, i) => [month, recent[i]] as const)
    .filter(([a, b]) => values[a] !== null && values[b] !== null);
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
  for (const [title, series] of articles) {
    const unknown = window.filter(month => series[month] === null
      || (!loaded.has(month) && !Object.hasOwn(series, month)));
    if (unknown.length) flags.push(`article views unknown: ${title} (${unknown.join(', ')})`);
  }
  if (articleObservations === 0) flags.push('no article observations');
  if (complete && observedViewsPrior < 200) flags.push('low baseline');
  if (complete && peakMonthShare !== null && peakMonthShare > .35) flags.push('spike dominated');
  if (direction === 'mixed') flags.push('mixed monthly direction');
  let confidence: Confidence = 'low';
  if (!complete || !projectPrior || !projectRecent) confidence = 'insufficient';
  else if (observedViewsPrior >= 1000 && observedViewsRecent >= 1000 && directionalMonths >= 9 && peakMonthShare !== null && peakMonthShare <= .25) confidence = 'high';
  else if (observedViewsPrior >= 200 && observedViewsRecent >= 200 && directionalMonths >= 7 && peakMonthShare !== null && peakMonthShare <= .35) confidence = 'medium';
  const viewsYoyPct = complete ? pctChange(observedViewsRecent, observedViewsPrior) : null;
  const shareYoyPct = shareRecentPerMillion === null || sharePriorPerMillion === null
    ? null : pctChange(shareRecentPerMillion, sharePriorPerMillion);
  return { language, articles: Object.keys(articleSeries), months: window, monthlyViews: values,
    articleMonthlyViews, editionMonthlyViews,
    loadedMonths: loaded.size, articleObservations, coverageComplete: complete,
    observedViewsPrior, observedViewsRecent, viewsPrior, viewsRecent,
    viewsYoyPct, sharePriorPerMillion, shareRecentPerMillion, shareYoyPct,
    positiveYoyMonths, negativeYoyMonths, comparableYoyMonths: pairs.length, direction,
    peakMonthShare, confidence, flags,
    peakPairSensitivity: calculatePeakPairSensitivity(window, values, editionMonthlyViews, viewsYoyPct, shareYoyPct),
    articleTrends: calculateArticleTrends(window, articleMonthlyViews) };
}

type CandidateMetric = Pick<LanguageResult, 'language' | 'confidence' | 'viewsYoyPct'
  | 'shareYoyPct' | 'viewsRecent' | 'direction'>;

const grades: Record<Confidence, number> = { insufficient: -1, low: 0, medium: 1, high: 2 };
const percentLabel = (value: number | null): string => formatPercent(value, 'unavailable');

export function assessScreening(result: CandidateMetric, criteria: Screening): ScreeningAssessment {
  const views = Number.isFinite(result.viewsRecent) ? result.viewsRecent : null;
  const quality = result.confidence ?? 'insufficient';
  const rawGrowth = Number.isFinite(result.viewsYoyPct) ? result.viewsYoyPct : null;
  const shareGrowth = Number.isFinite(result.shareYoyPct) ? result.shareYoyPct : null;
  const direction = result.direction ?? null;
  const volumePass = views !== null && views >= criteria.minRecentViews;
  const qualityPass = grades[quality] >= grades[criteria.minConfidence];
  const growthCheck = (criterion: 'raw-growth' | 'share-growth', value: number | null,
    required: boolean, label: string): ScreeningCheck => ({
    criterion, status: !required ? 'not-required' : value !== null && value > 0 ? 'pass' : 'fail',
    observed: value, requirement: required ? '>0%' : 'not required',
    explanation: !required ? `${label} check not required (observed ${percentLabel(value)}).`
      : value === null ? `${label} is unavailable; positive growth is required.`
        : `${label} is ${percentLabel(value)}; ${value > 0 ? 'passes' : 'does not meet'} the positive-growth rule.`
  });
  const checks: ScreeningCheck[] = [
    { criterion: 'recent-volume', status: volumePass ? 'pass' : 'fail', observed: views,
      requirement: `>=${criteria.minRecentViews} recent views`,
      explanation: views === null ? `Recent article views are unavailable; at least ${criteria.minRecentViews} are required.`
        : `${views} recent article views ${volumePass ? 'meet' : 'fall below'} the ${criteria.minRecentViews}-view minimum.` },
    { criterion: 'signal-quality', status: qualityPass ? 'pass' : 'fail', observed: quality,
      requirement: `>=${criteria.minConfidence} signal quality`,
      explanation: `${quality} signal quality ${qualityPass ? 'meets' : 'does not meet'} the ${criteria.minConfidence} minimum; this describes the pageview pattern, not demand.` },
    growthCheck('raw-growth', rawGrowth, criteria.requireRawGrowth, 'Raw article-view growth'),
    growthCheck('share-growth', shareGrowth, criteria.requireShareGrowth, 'Edition-relative share growth'),
    { criterion: 'monthly-direction',
      status: !criteria.requireRisingDirection ? 'not-required' : direction === 'rising' ? 'pass' : 'fail',
      observed: direction, requirement: criteria.requireRisingDirection ? 'rising' : 'not required',
      explanation: !criteria.requireRisingDirection ? `Rising monthly direction not required (observed ${direction ?? 'unavailable'}).`
        : `Monthly direction is ${direction ?? 'unavailable'}; ${direction === 'rising' ? 'meets' : 'does not meet'} the rising rule.` }
  ];
  return { eligible: checks.every(check => check.status !== 'fail'), eligibleRank: null, checks };
}

export function screenCandidates(results: CandidateMetric[], options: Partial<Screening> = {})
  : Array<{ language: string; assessment: ScreeningAssessment }> {
  const criteria: Screening = { minRecentViews: options.minRecentViews ?? 200,
    minConfidence: options.minConfidence ?? 'medium',
    requireRawGrowth: options.requireRawGrowth ?? true,
    requireShareGrowth: options.requireShareGrowth ?? true,
    requireRisingDirection: options.requireRisingDirection ?? true };
  const entries = results.map((result, index) => ({ result, index,
    assessment: assessScreening(result, criteria) }));
  const eligible = entries.filter(entry => entry.assessment.eligible);
  eligible.sort((a, b) => Number(b.result.confidence === 'high') - Number(a.result.confidence === 'high')
    || (b.result.shareYoyPct ?? -Infinity) - (a.result.shareYoyPct ?? -Infinity)
    || (b.result.viewsRecent ?? 0) - (a.result.viewsRecent ?? 0) || a.index - b.index);
  eligible.forEach((entry, index) => { entry.assessment.eligibleRank = index + 1; });
  return entries.map(({ result, assessment }) => ({ language: result.language, assessment }));
}

export function selectCandidate(results: CandidateMetric[], options: Partial<Screening> = {}): string | null {
  return screenCandidates(results, options).find(entry => entry.assessment.eligibleRank === 1)?.language ?? null;
}
