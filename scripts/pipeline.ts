/** End-to-end analysis orchestration; all API fetches remain sequential. */

import { evaluateLanguage, monthRange, parseManifest, selectCandidate } from './core.ts';
import type { WikimediaClient } from './client.ts';
import type { Analysis, LanguageResult, MonthlySeries, SourceArticle, SourceEdition } from './types.ts';

type AnalysisClient = Pick<WikimediaClient, 'resolveArticle' | 'fetchArticleViews' | 'fetchProjectViews'>;

export async function runAnalysis(rawManifest: unknown, client: AnalysisClient, endMonth: string): Promise<Analysis> {
  const manifest = parseManifest(rawManifest);
  const months = monthRange(endMonth, 24);
  const lastMonth = months[months.length - 1];
  const results: LanguageResult[] = [];
  const sources: SourceEdition[] = [];
  for (const edition of manifest.editions) {
    const articleSeries: Record<string, MonthlySeries> = {};
    const sourceArticles: SourceArticle[] = [];
    for (const requested of edition.articles) {
      const resolved = await client.resolveArticle(edition.language, requested);
      if (Object.hasOwn(articleSeries, resolved.title)) {
        throw new Error(`duplicate canonical article in ${edition.language}: ${resolved.title}`);
      }
      const traffic = await client.fetchArticleViews(edition.language, resolved.title, months[0], lastMonth);
      articleSeries[resolved.title] = traffic.series;
      sourceArticles.push({ title: resolved.title, requestedTitle: requested, pageId: resolved.pageId,
        url: resolved.url, analyticsUrl: traffic.url, analyticsStatus: traffic.status,
        fetchedAt: traffic.fetchedAt, cacheHit: traffic.cacheHit, resolutionUrl: resolved.sourceUrl });
    }
    const project = await client.fetchProjectViews(edition.language, months[0], lastMonth);
    const result = evaluateLanguage(edition.language, articleSeries, project.series, months);
    if (sourceArticles.some(article => article.title !== article.requestedTitle)) result.flags.push('title normalized or redirected');
    results.push(result);
    sources.push({ language: edition.language, rationale: edition.rationale, articles: sourceArticles,
      projectAnalyticsUrl: project.url, projectFetchedAt: project.fetchedAt,
      projectCacheHit: project.cacheHit });
  }
  return { topic: manifest.topic, question: manifest.question, assumptions: manifest.assumptions,
    screening: manifest.screening, period: { first: months[0], last: lastMonth },
    generatedAt: new Date().toISOString(), selectedCandidate: selectCandidate(results, manifest.screening),
    results, sources, methodology: {
      access: 'all-access', agent: 'user', granularity: 'monthly', comparison: 'recent 12 months vs preceding 12 months',
      share: 'sum of selected article views per million edition pageviews',
      missingArticleMonths: 'zero only when edition aggregate exists',
      reliability: 'heuristic: complete edition data, volume, matched-month directional consistency, spike concentration',
    } };
}
