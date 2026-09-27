/** End-to-end analysis orchestration; all API fetches remain sequential. */

import { evaluateLanguage, monthRange, parseManifest, screenCandidates } from './core.ts';
import type { ArticleResolution, WikimediaClient } from './client.ts';
import type { Analysis, ArticleMonthStatus, ConceptCheck, LanguageResult, NullableMonthlySeries, SourceArticle, SourceEdition } from './types.ts';
import { assignMonthlyTitles } from './title-history.ts';

type AnalysisClient = Pick<WikimediaClient, 'resolveArticle' | 'fetchArticleViews' | 'fetchProjectViews' | 'fetchMoveEvents'>;

export function suggestNextValidationStep(topic: string, selectedCandidate: string | null): string {
  return selectedCandidate
    ? `For the ${selectedCandidate}-language audience, interview five potential users about ${topic}; test sign-up intent on a small landing page.`
    : `Ask five potential users whether the chosen articles represent ${topic}, revise the article proxies, then rerun the screen.`;
}

function titleSegments(byMonth: Record<string, string | null>, months: string[]) {
  const segments: Array<{ title: string; first: string; last: string; months: string[] }> = [];
  for (const [index, month] of months.entries()) {
    const title = byMonth[month];
    if (title === null) continue;
    const last = segments.at(-1);
    if (last?.title === title && months[index - 1] === last.last) {
      last.last = month;
      last.months.push(month);
    } else segments.push({ title, first: month, last: month, months: [month] });
  }
  return segments;
}

export async function runAnalysis(rawManifest: unknown, client: AnalysisClient, endMonth: string): Promise<Analysis> {
  const manifest = parseManifest(rawManifest);
  const months = monthRange(endMonth, 24);
  const lastMonth = months[months.length - 1];
  const results: LanguageResult[] = [];
  const sources: SourceEdition[] = [];
  const prepared: Array<{ edition: typeof manifest.editions[number]; pages: ArticleResolution[] }> = [];
  for (const edition of manifest.editions) {
    const pages: ArticleResolution[] = [];
    for (const requested of edition.articles) {
      const resolved = await client.resolveArticle(edition.language, requested);
      if (pages.some(page => page.title === resolved.title)) {
        throw new Error(`duplicate canonical article in ${edition.language}: ${resolved.title}`);
      }
      pages.push(resolved);
    }
    prepared.push({ edition, pages });
  }
  const conceptEditions = prepared.map(({ edition, pages }) => ({ language: edition.language,
    articles: pages.map(page => ({ title: page.title, wikidataId: page.wikidataId ?? null })) }));
  const allHaveId = conceptEditions.every(edition => edition.articles.every(article => article.wikidataId !== null));
  const idSets = conceptEditions.map(edition => edition.articles.map(article => article.wikidataId!).sort().join('|'));
  const mismatch = allHaveId && new Set(idSets).size > 1;
  if (mismatch && !manifest.conceptMismatchRationale) {
    const details = conceptEditions.map(edition => `${edition.language}: ${edition.articles.map(article =>
      `${article.title} ${article.wikidataId}`).join(', ')}`).join('; ');
    throw new Error(`concept ID mismatch: ${details}; review page selection or add conceptMismatchRationale`);
  }
  const conceptCheck: ConceptCheck = { status: !allHaveId ? 'unverified'
    : conceptEditions.length === 1 ? 'single-edition' : mismatch ? 'mismatch-reviewed' : 'matched',
  editions: conceptEditions, ...(mismatch ? { reviewRationale: manifest.conceptMismatchRationale } : {}) };
  for (const { edition, pages } of prepared) {
    const articleSeries: Record<string, NullableMonthlySeries> = {};
    const sourceArticles: SourceArticle[] = [];
    for (const [index, resolved] of pages.entries()) {
      const requested = edition.articles[index];
      const formerTitles = [...new Set([...(edition.formerTitles?.[requested] ?? []),
        ...(resolved.redirectFrom ?? [])])].filter(title => title !== resolved.title);
      const moveEvents = [];
      const moveLookupUrls: string[] = [];
      let historyError: string | undefined;
      for (const formerTitle of formerTitles) {
        try {
          const lookup = await client.fetchMoveEvents(edition.language, formerTitle, resolved.pageId);
          moveEvents.push(...lookup.events);
          moveLookupUrls.push(...lookup.urls);
          if (!lookup.complete) { historyError = `move history pagination incomplete: ${formerTitle}`; break; }
        } catch (error) {
          historyError = error instanceof Error ? error.message : String(error);
          break;
        }
      }
      const assignment = assignMonthlyTitles(resolved.title, resolved.pageId, formerTitles,
        historyError ? [] : moveEvents, months);
      if (assignment.status === 'uncertain' && !historyError) historyError = 'known former titles could not be verified as one move chain';
      const series: NullableMonthlySeries = Object.fromEntries(assignment.uncertainMonths.map(month => [month, null]));
      const trafficSegments: NonNullable<SourceArticle['trafficSegments']> = [];
      for (const segment of titleSegments(assignment.byMonth, months)) {
        const traffic = await client.fetchArticleViews(edition.language, segment.title, segment.first, segment.last);
        trafficSegments.push({ title: segment.title, first: segment.first, last: segment.last,
          analyticsUrl: traffic.url, analyticsStatus: traffic.status, analyticsError: traffic.error,
          fetchedAt: traffic.fetchedAt, cacheHit: traffic.cacheHit });
        for (const month of segment.months) {
          if (traffic.status !== 200) series[month] = null;
          else if (Object.hasOwn(traffic.series, month)) series[month] = traffic.series[month];
        }
      }
      articleSeries[resolved.title] = series;
      const onlySegment = trafficSegments.length === 1 ? trafficSegments[0] : undefined;
      sourceArticles.push({ title: resolved.title, requestedTitle: requested, pageId: resolved.pageId,
        wikidataId: resolved.wikidataId ?? null,
        url: resolved.url, analyticsUrl: onlySegment?.analyticsUrl, analyticsStatus: onlySegment?.analyticsStatus,
        analyticsError: onlySegment?.analyticsError, fetchedAt: onlySegment?.fetchedAt, cacheHit: onlySegment?.cacheHit,
        resolutionUrl: resolved.sourceUrl, historyStatus: assignment.status, historyError,
        moveEvents: assignment.events, moveLookupUrls, uncertainMonths: assignment.uncertainMonths,
        trafficSegments });
    }
    const project = await client.fetchProjectViews(edition.language, months[0], lastMonth);
    for (const article of sourceArticles) {
      const series = articleSeries[article.title];
      article.monthStatus = Object.fromEntries(months.map(month => {
        const status: ArticleMonthStatus = series[month] === null ? 'unknown'
          : Object.hasOwn(series, month) ? 'reported'
            : project.series[month] > 0 ? 'zero' : 'unknown';
        return [month, status];
      }));
    }
    const result = evaluateLanguage(edition.language, articleSeries, project.series, months);
    if (sourceArticles.some(article => article.title !== article.requestedTitle)) result.flags.push('title normalized or redirected');
    for (const article of sourceArticles) {
      if (article.historyStatus === 'uncertain') result.flags.push(`title history uncertain: ${article.title}`);
      else if (article.uncertainMonths?.length) result.flags.push(
        `title move month uncertain: ${article.title} (${article.uncertainMonths.join(', ')})`);
    }
    results.push(result);
    sources.push({ language: edition.language, rationale: edition.rationale, articles: sourceArticles,
      projectAnalyticsUrl: project.url, projectFetchedAt: project.fetchedAt,
      projectCacheHit: project.cacheHit });
  }
  const screened = screenCandidates(results, manifest.screening);
  for (const [index, result] of results.entries()) result.screeningAssessment = screened[index].assessment;
  const selectedCandidate = screened.find(entry => entry.assessment.eligibleRank === 1)?.language ?? null;
  return { topic: manifest.topic, question: manifest.question, assumptions: manifest.assumptions,
    screening: manifest.screening, period: { first: months[0], last: lastMonth },
    generatedAt: new Date().toISOString(), selectedCandidate,
    nextValidationStep: suggestNextValidationStep(manifest.topic, selectedCandidate),
    results, sources, conceptCheck, methodology: {
      access: 'all-access', agent: 'user', granularity: 'monthly', comparison: 'recent 12 months vs preceding 12 months',
      share: 'sum of selected article views per million edition pageviews',
      missingArticleMonths: 'zero only for a successful article response when edition aggregate exists; unavailable article responses are unknown',
      reliability: 'heuristic: complete edition data, volume, matched-month directional consistency, spike concentration',
      signalQuality: 'The confidence JSON field measures signal quality from coverage, views, matched-month consistency and spikes; it does not measure customer demand.',
    } };
}
