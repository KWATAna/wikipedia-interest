import test from 'node:test';
import assert from 'node:assert/strict';
import { monthRange } from '../scripts/core.ts';
import { runAnalysis, suggestNextValidationStep } from '../scripts/pipeline.ts';
import moveFixture from './fixtures/phase3-twitter-move.json' with { type: 'json' };

test('pipeline exposes screening reasons, ranks, and a concrete validation step', async () => {
  const months = monthRange('2026-12', 24);
  const client = {
    async resolveArticle(language, title) { return { title, pageId: 1, wikidataId: 'Q1',
      url: `https://${language}.wikipedia.org/wiki/Topic`, sourceUrl: 'https://wiki.example/title' }; },
    async fetchArticleViews(language) { return {
      series: Object.fromEntries(months.map((month, index) => [month, index < 12 ? 100
        : language === 'uk' ? 150
          : language === 'pl' ? (index < 20 ? 110 : 100)
            : (index < 19 ? 110 : 90)])),
      url: 'https://wiki.example/views', status: 200, fetchedAt: '2026-12-31T00:00:00Z', cacheHit: false }; },
    async fetchProjectViews() { return { series: Object.fromEntries(months.map(month => [month, 100000])),
      url: 'https://wiki.example/project', status: 200, fetchedAt: '2026-12-31T00:00:00Z', cacheHit: false }; },
  };
  const base = { topic: 'English learning', editions: ['uk', 'pl', 'en'].map(language =>
    ({ language, articles: ['Topic'] })) };
  const analysis = await runAnalysis(base, client, '2026-12');
  assert.equal(analysis.selectedCandidate, 'uk');
  assert.deepEqual(analysis.results.map(result => result.screeningAssessment.eligibleRank), [1, 2, null]);
  assert.deepEqual(analysis.results[2].screeningAssessment.checks.map(check => check.status),
    ['pass', 'pass', 'pass', 'pass', 'fail']);
  const checks = analysis.results[2].screeningAssessment.checks;
  assert.deepEqual(checks.map(check => check.criterion),
    ['recent-volume', 'signal-quality', 'raw-growth', 'share-growth', 'monthly-direction']);
  assert.deepEqual(checks.map(check => check.observed).filter((_, index) => [0, 1, 4].includes(index)),
    [1220, 'medium', 'mixed']);
  assert.deepEqual(checks.map(check => check.requirement),
    ['>=200 recent views', '>=medium signal quality', '>0%', '>0%', 'rising']);
  assert.ok(Math.abs(checks[2].observed - (1220 / 1200 - 1) * 100) < 1e-9);
  assert.ok(Math.abs(checks[3].observed - (1220 / 1200 - 1) * 100) < 1e-9);
  assert.match(analysis.results[2].screeningAssessment.checks[4].explanation, /mixed.*rising/i);
  assert.match(analysis.methodology.signalQuality, /confidence.*demand/i);
  assert.match(analysis.nextValidationStep, /uk.*interview.*sign-up/i);
  const overridden = await runAnalysis({ ...base, screening: { requireRisingDirection: false } }, client, '2026-12');
  assert.equal(overridden.results[2].screeningAssessment.checks[4].status, 'not-required');
  assert.equal(overridden.results[2].screeningAssessment.eligible, true);
  assert.equal(overridden.results[2].screeningAssessment.eligibleRank, 3);
});

test('no passing edition gets an article-fit validation step', () => {
  assert.match(suggestNextValidationStep('English learning', null), /five.*article.*rerun/i);
});

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

test('metrics expose opposing article trends and the edition denominator', async () => {
  const months = monthRange('2024-12', 24);
  const client = {
    async resolveArticle(language, title) { return { title, pageId: title === 'Rising' ? 1 : 2,
      url: `https://${language}.wikipedia.org/wiki/${title}`, sourceUrl: 'https://wiki.example/title' }; },
    async fetchArticleViews(_language, title) { return {
      series: Object.fromEntries(months.map((month, i) =>
        [month, title === 'Rising' ? (i < 12 ? 100 : 160) : (i < 12 ? 100 : 40)])),
      url: `https://wiki.example/views/${title}`, status: 200,
      fetchedAt: '2025-01-01T00:00:00Z', cacheHit: false }; },
    async fetchProjectViews() { return {
      series: Object.fromEntries(months.map(month => [month, 2_000_000])),
      url: 'https://wiki.example/project', status: 200,
      fetchedAt: '2025-01-01T00:00:00Z', cacheHit: false }; },
  };
  const analysis = await runAnalysis({ topic: 'Topic', editions: [
    { language: 'uk', articles: ['Rising', 'Falling'] }] }, client, '2024-12');
  const result = analysis.results[0];
  assert.equal(result.articleMonthlyViews.Rising[months[0]], 100);
  assert.equal(result.articleMonthlyViews.Rising[months[12]], 160);
  assert.equal(result.articleMonthlyViews.Falling[months[0]], 100);
  assert.equal(result.articleMonthlyViews.Falling[months[12]], 40);
  assert.equal(result.editionMonthlyViews[months[12]], 2_000_000);
  assert.equal(result.monthlyViews[months[12]], 200);
  assert.equal(result.shareRecentPerMillion, 100);
  assert.equal(result.viewsYoyPct, 0);
});

test('a 404 for one of two articles makes the edition ineligible without losing observed counts', async () => {
  const months = monthRange('2024-12', 24);
  const client = {
    async resolveArticle(language, title) { return {
      title, pageId: title === 'Known' ? 1 : 2, requestedTitle: title,
      url: `https://${language}.wikipedia.org/wiki/${title}`, sourceUrl: 'https://wiki.example/title' }; },
    async fetchArticleViews(language, title) { return {
      series: title === 'Known' ? Object.fromEntries(months.map((month, i) =>
        [month, i < 12 ? 100 : 150])) : {},
      url: `https://wiki.example/views/${title}`, status: title === 'Known' ? 200 : 404,
      fetchedAt: '2025-01-01T00:00:00Z', cacheHit: false }; },
    async fetchProjectViews() { return {
      series: Object.fromEntries(months.map(month => [month, 100000])),
      url: 'https://wiki.example/project', status: 200,
      fetchedAt: '2025-01-01T00:00:00Z', cacheHit: false }; },
  };
  const analysis = await runAnalysis({ topic: 'Topic', editions: [
    { language: 'uk', articles: ['Known', 'Unknown'] }] }, client, '2024-12');
  const result = analysis.results[0];
  assert.equal(result.coverageComplete, false);
  assert.equal(result.observedViewsPrior, 1200);
  assert.equal(result.observedViewsRecent, 1800);
  assert.equal(result.viewsYoyPct, null);
  assert.equal(result.monthlyViews[months[0]], null);
  assert.equal(analysis.selectedCandidate, null);
  assert.ok(result.flags.some(flag => flag.includes('Unknown') && flag.includes(months[0])));
  assert.equal(analysis.sources[0].articles[1].analyticsStatus, 404);
  assert.equal(analysis.sources[0].articles[1].monthStatus[months[0]], 'unknown');
  assert.equal(analysis.sources[0].articles[0].monthStatus[months[0]], 'reported');
  assert.equal(result.articleMonthlyViews.Known[months[0]], 100);
  assert.equal(result.articleMonthlyViews.Unknown[months[0]], null);
  assert.equal(result.editionMonthlyViews[months[0]], 100000);
});

test('a successful sparse article response marks omitted loaded months as zero', async () => {
  const months = monthRange('2024-12', 24);
  const client = {
    async resolveArticle(language, title) { return {
      title, pageId: 1, requestedTitle: title,
      url: `https://${language}.wikipedia.org/wiki/${title}`, sourceUrl: 'https://wiki.example/title' }; },
    async fetchArticleViews() { return {
      series: { [months[0]]: 100, [months[12]]: 150 },
      url: 'https://wiki.example/views', status: 200,
      fetchedAt: '2025-01-01T00:00:00Z', cacheHit: false }; },
    async fetchProjectViews() { return {
      series: Object.fromEntries(months.map(month => [month, 100000])),
      url: 'https://wiki.example/project', status: 200,
      fetchedAt: '2025-01-01T00:00:00Z', cacheHit: false }; },
  };
  const analysis = await runAnalysis({ topic: 'Topic', editions: [
    { language: 'uk', articles: ['Sparse'] }] }, client, '2024-12');
  assert.equal(analysis.results[0].coverageComplete, true);
  assert.equal(analysis.results[0].monthlyViews[months[1]], 0);
  assert.equal(analysis.sources[0].articles[0].monthStatus[months[0]], 'reported');
  assert.equal(analysis.sources[0].articles[0].monthStatus[months[1]], 'zero');
  assert.equal(analysis.results[0].articleMonthlyViews.Sparse[months[1]], 0);
});

test('a failed article request is recorded without blocking a complete second edition', async () => {
  const months = monthRange('2024-12', 24);
  const client = {
    async resolveArticle(language, title) { return {
      title, pageId: 1, requestedTitle: title,
      url: `https://${language}.wikipedia.org/wiki/${title}`, sourceUrl: 'https://wiki.example/title' }; },
    async fetchArticleViews(language) { return {
      series: language === 'uk' ? {} : Object.fromEntries(months.map((month, i) =>
        [month, i < 12 ? 100 : 150])),
      url: `https://wiki.example/views/${language}`, status: language === 'uk' ? 503 : 200,
      error: language === 'uk' ? 'Wikimedia HTTP 503' : undefined,
      fetchedAt: '2025-01-01T00:00:00Z', cacheHit: false }; },
    async fetchProjectViews() { return {
      series: Object.fromEntries(months.map(month => [month, 100000])),
      url: 'https://wiki.example/project', status: 200,
      fetchedAt: '2025-01-01T00:00:00Z', cacheHit: false }; },
  };
  const analysis = await runAnalysis({ topic: 'Topic', editions: [
    { language: 'uk', articles: ['Unavailable'] },
    { language: 'pl', articles: ['Known'] }] }, client, '2024-12');
  assert.equal(analysis.results[0].confidence, 'insufficient');
  assert.equal(analysis.results[1].viewsYoyPct, 50);
  assert.equal(analysis.selectedCandidate, 'pl');
  assert.equal(analysis.sources[0].articles[0].analyticsStatus, 503);
  assert.equal(analysis.sources[0].articles[0].analyticsError, 'Wikimedia HTTP 503');
  assert.equal(analysis.sources[0].articles[0].monthStatus[months[0]], 'unknown');
});

test('known concept mismatch pauses before any traffic request', async () => {
  const calls = [];
  const client = {
    async resolveArticle(language, title) { calls.push(`resolve:${language}`); return {
      title, pageId: 1, wikidataId: language === 'uk' ? 'Q100' : 'Q200', redirectFrom: [],
      url: `https://${language}.wikipedia.org/wiki/${title}`, sourceUrl: 'https://wiki.example/title' }; },
    async fetchArticleViews() { calls.push('article'); throw new Error('traffic should not load'); },
    async fetchProjectViews() { calls.push('project'); throw new Error('traffic should not load'); },
  };
  await assert.rejects(runAnalysis({ topic: 'Topic', editions: [
    { language: 'uk', articles: ['One'] }, { language: 'pl', articles: ['Two'] }
  ] }, client, '2024-12'), /concept.*Q100.*Q200|concept.*Q200.*Q100/i);
  assert.deepEqual(calls, ['resolve:uk', 'resolve:pl']);
});

test('reviewed mismatch proceeds and missing concept ID stays unverified', async () => {
  const months = monthRange('2024-12', 24);
  const client = {
    async resolveArticle(language, title) { return { title, pageId: 1,
      wikidataId: language === 'uk' ? 'Q100' : language === 'pl' ? 'Q200' : null,
      redirectFrom: [], url: `https://${language}.wikipedia.org/wiki/${title}`,
      sourceUrl: 'https://wiki.example/title' }; },
    async fetchArticleViews() { return { series: Object.fromEntries(months.map(month => [month, 100])),
      url: 'https://wiki.example/views', status: 200, fetchedAt: '2025-01-01T00:00:00Z', cacheHit: false }; },
    async fetchProjectViews() { return { series: Object.fromEntries(months.map(month => [month, 100000])),
      url: 'https://wiki.example/project', status: 200, fetchedAt: '2025-01-01T00:00:00Z', cacheHit: false }; },
  };
  const reviewed = await runAnalysis({ topic: 'Topic', conceptMismatchRationale: 'Reviewed different scopes.',
    editions: [{ language: 'uk', articles: ['One'] }, { language: 'pl', articles: ['Two'] }] }, client, '2024-12');
  assert.equal(reviewed.conceptCheck.status, 'mismatch-reviewed');
  assert.equal(reviewed.conceptCheck.reviewRationale, 'Reviewed different scopes.');
  assert.equal(reviewed.sources[0].articles[0].wikidataId, 'Q100');
  const missing = await runAnalysis({ topic: 'Topic', editions: [
    { language: 'uk', articles: ['One'] }, { language: 'cs', articles: ['Three'] }] }, client, '2024-12');
  assert.equal(missing.conceptCheck.status, 'unverified');
  assert.equal(missing.sources[1].articles[0].wikidataId, null);
});

function movedPageClient(months, calls, lookup = 'complete') {
  const event = moveFixture.events[0];
  return {
    async resolveArticle(_language, title) { return { title: 'X (social network)', pageId: moveFixture.resolvedPageId,
      requestedTitle: title, wikidataId: 'Q918', redirectFrom: title === 'Twitter' ? ['Twitter'] : [],
      url: 'https://en.wikipedia.org/wiki/X_(social_network)', sourceUrl: 'https://wiki.example/resolve' }; },
    async fetchMoveEvents(_language, title, pageId) {
      calls.push(['move', title, pageId]);
      if (lookup === 'fail') throw new Error('move log unavailable');
      return { events: [{ from: event.title, to: event.params.target_title,
        timestamp: event.timestamp, logId: event.logid, logpage: event.logpage,
        ns: event.ns, targetNs: event.params.target_ns }],
      urls: [moveFixture.sources.move], complete: lookup === 'complete' };
    },
    async fetchArticleViews(_language, title, first, last) {
      calls.push(['article', title, first, last]);
      return { series: Object.fromEntries(months.map(month => [month, title === 'Twitter' ? 100 : 150])),
        url: `https://wiki.example/views/${title}`, status: 200,
        fetchedAt: '2026-09-26T00:00:00Z', cacheHit: false };
    },
    async fetchProjectViews() { return { series: Object.fromEntries(months.map(month => [month, 100000])),
      url: 'https://wiki.example/project', status: 200,
      fetchedAt: '2026-09-26T00:00:00Z', cacheHit: false }; },
  };
}

test('verified move uses disjoint title periods and leaves the move month unknown', async () => {
  const months = monthRange('2026-03', 24);
  const calls = [];
  const analysis = await runAnalysis({ topic: 'X', editions: [{ language: 'en', articles: ['Twitter'] }] },
    movedPageClient(months, calls), '2026-03');
  const result = analysis.results[0];
  const source = analysis.sources[0].articles[0];
  assert.equal(result.articleMonthlyViews['X (social network)']['2026-01'], 100);
  assert.equal(result.articleMonthlyViews['X (social network)']['2026-02'], null);
  assert.equal(result.articleMonthlyViews['X (social network)']['2026-03'], 150);
  assert.equal(result.monthlyViews['2026-02'], null);
  assert.equal(result.viewsYoyPct, null);
  assert.equal(analysis.selectedCandidate, null);
  assert.equal(source.monthStatus['2026-02'], 'unknown');
  assert.deepEqual(source.uncertainMonths, ['2026-02']);
  assert.equal(source.historyStatus, 'verified-move');
  assert.deepEqual(source.trafficSegments.map(({ title, first, last }) => ({ title, first, last })), [
    { title: 'Twitter', first: months[0], last: '2026-01' },
    { title: 'X (social network)', first: '2026-03', last: '2026-03' },
  ]);
  assert.deepEqual(calls.filter(call => call[0] === 'article'), [
    ['article', 'Twitter', months[0], '2026-01'],
    ['article', 'X (social network)', '2026-03', '2026-03'],
  ]);
  assert.equal(source.moveEvents[0].logId, eventLogId());
  assert.deepEqual(source.moveLookupUrls, [moveFixture.sources.move]);
});

function eventLogId() { return moveFixture.events[0].logid; }

test('a manifest former-title hint keeps overlapping API data disjoint', async () => {
  const months = monthRange('2026-03', 24);
  const calls = [];
  const analysis = await runAnalysis({ topic: 'X', editions: [{ language: 'en',
    articles: ['X (social network)'], formerTitles: { 'X (social network)': ['Twitter'] } }] },
    movedPageClient(months, calls), '2026-03');
  assert.equal(analysis.results[0].articleMonthlyViews['X (social network)']['2026-01'], 100);
  assert.equal(analysis.results[0].articleMonthlyViews['X (social network)']['2026-03'], 150);
  assert.equal(calls.filter(call => call[0] === 'article').length, 2);
});

test('failed or incomplete move lookup makes history uncertain without traffic requests', async () => {
  const months = monthRange('2026-03', 24);
  for (const lookup of ['fail', 'incomplete']) {
    const calls = [];
    const analysis = await runAnalysis({ topic: 'X', editions: [{ language: 'en', articles: ['Twitter'] }] },
      movedPageClient(months, calls, lookup), '2026-03');
    const source = analysis.sources[0].articles[0];
    assert.equal(source.historyStatus, 'uncertain');
    assert.equal(source.trafficSegments.length, 0);
    assert.equal(source.uncertainMonths.length, 24);
    assert.equal(analysis.results[0].confidence, 'insufficient');
    assert.equal(analysis.selectedCandidate, null);
    assert.equal(calls.filter(call => call[0] === 'article').length, 0);
  }
});
