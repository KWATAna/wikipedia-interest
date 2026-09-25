import test from 'node:test';
import assert from 'node:assert/strict';
import { monthRange } from '../scripts/core.ts';
import { runAnalysis } from '../scripts/pipeline.ts';

test('pipeline resolves canonical titles and preserves request provenance', async () => {
  const calls = [];
  const months = monthRange('2024-12', 24);
  const client = {
    async resolveArticle(language, title) { calls.push(['resolve', language, title]); return {
      title: 'Astronomy', pageId: 3, url: `https://${language}.wikipedia.org/wiki/Astronomy`, requestedTitle: title,
      sourceUrl: 'https://wiki.example/title' }; },
    async fetchArticleViews(language, title) { calls.push(['article', language, title]); return {
      series: Object.fromEntries(months.map((month, i) => [month, i < 12 ? 100 : 150])),
      url: 'https://wiki.example/views', status: 200, fetchedAt: '2025-01-01T00:00:00Z', cacheHit: false }; },
    async fetchProjectViews(language) { calls.push(['project', language]); return {
      series: Object.fromEntries(months.map(month => [month, 100000])),
      url: 'https://wiki.example/project', status: 200, fetchedAt: '2025-01-01T00:00:00Z', cacheHit: false }; },
  };
  const result = await runAnalysis({ topic: 'Astronomy', editions: [
    { language: 'uk', articles: ['Astronomy'] }] }, client, '2024-12');
  assert.deepEqual(calls.map(call => call[0]), ['resolve', 'article', 'project']);
  assert.equal(result.results[0].viewsYoyPct, 50);
  assert.equal(result.sources[0].articles[0].analyticsUrl, 'https://wiki.example/views');
  assert.equal(result.selectedCandidate, 'uk');
});
