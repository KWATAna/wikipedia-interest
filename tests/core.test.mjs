import test from 'node:test';
import assert from 'node:assert/strict';
import { assessScreening, evaluateLanguage, lastCompleteMonth, monthRange, parseManifest,
  screenCandidates, selectCandidate } from '../scripts/core.ts';

test('monthRange and lastCompleteMonth use calendar months', () => {
  assert.deepEqual(monthRange('2024-03', 4), ['2023-12', '2024-01', '2024-02', '2024-03']);
  assert.equal(lastCompleteMonth(new Date('2024-04-17T12:00:00Z')), '2024-03');
  assert.equal(lastCompleteMonth(new Date('2024-04-01T12:00:00Z')), '2024-02');
  assert.equal(lastCompleteMonth(new Date('2024-04-02T12:00:00Z')), '2024-02');
});

test('matched-year growth differs from edition-relative growth', () => {
  const months = monthRange('2024-12', 24);
  const page = Object.fromEntries(months.map((month, i) => [month, i < 12 ? 100 : 150]));
  const project = Object.fromEntries(months.map((month, i) => [month, i < 12 ? 10000 : 20000]));
  const result = evaluateLanguage('cs', { Astronomie: page }, project, months);
  assert.equal(result.viewsPrior, 1200);
  assert.equal(result.viewsRecent, 1800);
  assert.equal(result.viewsYoyPct, 50);
  assert.equal(result.shareYoyPct, -25);
  assert.equal(result.positiveYoyMonths, 12);
});

test('opposing article trends remain visible when combined growth is flat', () => {
  const months = monthRange('2026-12', 24);
  const rising = Object.fromEntries(months.map((month, index) => [month, index < 12 ? 100 : 160]));
  const falling = Object.fromEntries(months.map((month, index) => [month, index < 12 ? 100 : 40]));
  const edition = Object.fromEntries(months.map(month => [month, 10000]));
  const result = evaluateLanguage('en', { Rising: rising, Falling: falling }, edition, months);
  assert.equal(result.viewsYoyPct, 0);
  assert.equal(result.confidence, 'low');
  assert.equal(selectCandidate([result]), null);
  assert.deepEqual(result.articleTrends.map(({ viewsYoyPct, ...rest }) => rest), [
    { title: 'Rising', viewsPrior: 1200, viewsRecent: 1920, direction: 'rising' },
    { title: 'Falling', viewsPrior: 1200, viewsRecent: 480, direction: 'falling' },
  ]);
  assert.ok(Math.abs(result.articleTrends[0].viewsYoyPct - 60) < 1e-9);
  assert.ok(Math.abs(result.articleTrends[1].viewsYoyPct + 60) < 1e-9);
  assert.equal(result.peakPairSensitivity.status, 'available');
});

test('an unknown article month affects its trend and blocks the paired check', () => {
  const months = monthRange('2026-12', 24);
  const known = Object.fromEntries(months.map(month => [month, 100]));
  const unknown = Object.fromEntries(months.map(month => [month, 50]));
  unknown['2026-06'] = null;
  const edition = Object.fromEntries(months.map(month => [month, 10000]));
  const result = evaluateLanguage('en', { Known: known, Unknown: unknown }, edition, months);
  assert.equal(result.peakPairSensitivity.status, 'incomplete-data');
  assert.equal(result.articleTrends[0].direction, 'flat');
  assert.deepEqual(result.articleTrends[1], { title: 'Unknown', viewsPrior: null,
    viewsRecent: null, viewsYoyPct: null, direction: 'unavailable' });
});

test('a missing edition month does not erase a reported article trend', () => {
  const months = monthRange('2026-12', 24);
  const page = Object.fromEntries(months.map((month, index) => [month, index < 12 ? 100 : 150]));
  const edition = Object.fromEntries(months.map(month => [month, 10000]));
  delete edition['2026-06'];
  const result = evaluateLanguage('en', { Topic: page }, edition, months);
  assert.equal(result.peakPairSensitivity.status, 'incomplete-data');
  assert.deepEqual(result.articleTrends[0], { title: 'Topic', viewsPrior: 1200,
    viewsRecent: 1800, viewsYoyPct: 50, direction: 'rising' });
});

test('an article rising from zero has a direction but no percentage', () => {
  const months = monthRange('2026-12', 24);
  const page = Object.fromEntries(months.map((month, index) => [month, index < 12 ? 0 : 20]));
  const edition = Object.fromEntries(months.map(month => [month, 10000]));
  const result = evaluateLanguage('en', { New: page }, edition, months);
  assert.deepEqual(result.articleTrends[0], { title: 'New', viewsPrior: 0,
    viewsRecent: 240, viewsYoyPct: null, direction: 'rising' });
});

test('page gaps become zero only when the edition month exists', () => {
  const months = monthRange('2024-12', 24);
  const page = { [months[0]]: 12, [months[12]]: 24 };
  const project = Object.fromEntries(months.map(month => [month, 1000]));
  delete project[months.at(-1)];
  const result = evaluateLanguage('cs', { Astronomie: page }, project, months);
  assert.equal(result.loadedMonths, 23);
  assert.equal(result.viewsRecent, null);
  assert.equal(result.observedViewsRecent, 24);
  assert.equal(result.viewsYoyPct, null);
  assert.equal(result.shareYoyPct, null);
  assert.equal(result.direction, 'insufficient');
  assert.equal(result.confidence, 'insufficient');
  assert.ok(result.flags.includes('project month missing'));
  assert.equal(result.monthlyViews[months.at(-1)], null);
  assert.equal(result.editionMonthlyViews[months.at(-1)], null);
  assert.equal(result.articleMonthlyViews.Astronomie[months[1]], 0);
  assert.equal(result.articleMonthlyViews.Astronomie[months.at(-1)], null);
});

test('observed totals retain reported article views when edition traffic is missing', () => {
  const months = monthRange('2024-12', 24);
  const page = Object.fromEntries(months.map((month, i) => [month, i < 12 ? 100 : 150]));
  const project = Object.fromEntries(months.map(month => [month, 100000]));
  delete project[months.at(-1)];
  const result = evaluateLanguage('cs', { Astronomie: page }, project, months);
  assert.equal(result.monthlyViews[months.at(-1)], null);
  assert.equal(result.observedViewsRecent, 1800);
  assert.equal(result.viewsRecent, null);
  assert.equal(result.articleMonthlyViews.Astronomie[months.at(-1)], 150);
  assert.equal(result.editionMonthlyViews[months.at(-1)], null);
});

test('an unverified article month names its article and month in a flag', () => {
  const months = monthRange('2024-12', 24);
  const page = Object.fromEntries(months.map(month => [month, 100]));
  const project = Object.fromEntries(months.map(month => [month, 100000]));
  delete page[months.at(-1)];
  delete project[months.at(-1)];
  const result = evaluateLanguage('cs', { Astronomie: page }, project, months);
  assert.ok(result.flags.some(flag => flag.includes('Astronomie') && flag.includes(months.at(-1))));
});

test('an unknown article month blocks complete growth but preserves observed views', () => {
  const months = monthRange('2024-12', 24);
  const known = Object.fromEntries(months.map((month, i) => [month, i < 12 ? 100 : 150]));
  const second = Object.fromEntries(months.map(month => [month, 20]));
  second[months[0]] = null;
  const project = Object.fromEntries(months.map(month => [month, 100000]));
  const result = evaluateLanguage('uk', { Known: known, Second: second }, project, months);
  assert.equal(result.monthlyViews[months[0]], null);
  assert.equal(result.monthlyViews[months[1]], 120);
  assert.equal(result.observedViewsPrior, 1420);
  assert.equal(result.observedViewsRecent, 2040);
  assert.equal(result.coverageComplete, false);
  assert.equal(result.viewsPrior, null);
  assert.equal(result.viewsYoyPct, null);
  assert.equal(result.shareYoyPct, null);
  assert.equal(result.comparableYoyMonths, 11);
  assert.equal(result.confidence, 'insufficient');
  assert.ok(result.flags.some(flag => flag.includes('Second') && flag.includes(months[0])));
  assert.equal(selectCandidate([result]), null);
});

test('one-off spike reduces reliability', () => {
  const months = monthRange('2024-12', 24);
  const page = Object.fromEntries(months.map(month => [month, 100]));
  page[months[12]] = 2000;
  const project = Object.fromEntries(months.map(month => [month, 100000]));
  const result = evaluateLanguage('uk', { 'Астрономія': page }, project, months);
  assert.equal(result.confidence, 'low');
  assert.ok(result.flags.includes('spike dominated'));
});

test('consistent decline can have a reliable direction', () => {
  const months = monthRange('2024-12', 24);
  const page = Object.fromEntries(months.map((month, i) => [month, i < 12 ? 150 : 100]));
  const project = Object.fromEntries(months.map(month => [month, 100000]));
  const result = evaluateLanguage('uk', { 'Астрономія': page }, project, months);
  assert.equal(result.confidence, 'high');
  assert.equal(result.direction, 'falling');
  assert.ok(!result.flags.includes('mixed monthly direction'));
});

test('a spike in the prior year also reduces reliability', () => {
  const months = monthRange('2024-12', 24);
  const page = Object.fromEntries(months.map(month => [month, 100]));
  page[months[0]] = 2000;
  const project = Object.fromEntries(months.map(month => [month, 100000]));
  const result = evaluateLanguage('uk', { 'Астрономія': page }, project, months);
  assert.equal(result.confidence, 'low');
  assert.ok(result.flags.includes('spike dominated'));
});

test('manifest rejects duplicate titles and language editions', () => {
  assert.throws(() => parseManifest({ topic: 'x', editions: [{ language: 'en', articles: ['A', 'A'] }] }), /duplicate/);
  assert.throws(() => parseManifest({ topic: 'x', editions: [
    { language: 'en', articles: ['A'] }, { language: 'en', articles: ['B'] }
  ] }), /duplicate/);
});

test('candidate requires positive raw and relative growth with reliable data', () => {
  const good = { language: 'cs', confidence: 'high', viewsYoyPct: 20,
    shareYoyPct: 8, viewsRecent: 5000, direction: 'rising' };
  const bad = { language: 'pl', confidence: 'medium', viewsYoyPct: 60,
    shareYoyPct: -10, viewsRecent: 10000, direction: 'rising' };
  assert.equal(selectCandidate([bad, good]), 'cs');
  assert.equal(selectCandidate([bad]), null);
  assert.equal(selectCandidate([bad], { requireShareGrowth: false }), 'pl');
  assert.equal(selectCandidate([good], { minRecentViews: 10000 }), null);
});

test('manifest requires rising monthly direction by default and validates its override', () => {
  const base = { topic: 'English learning', editions: [{ language: 'uk', articles: ['English language'] }] };
  assert.equal(parseManifest(base).screening.requireRisingDirection, true);
  assert.equal(parseManifest({ ...base, screening: { requireRisingDirection: false } })
    .screening.requireRisingDirection, false);
  assert.throws(() => parseManifest({ ...base, screening: { requireRisingDirection: 'false' } }),
    /screening/i);
  assert.throws(() => parseManifest({ ...base, screening: { requireRisingDirection: 0 } }), /screening/i);
  assert.throws(() => parseManifest({ ...base, screening: { requireRisingDirection: null } }), /screening/i);
});

test('steady decline has high signal quality but fails growth and direction checks', () => {
  const months = monthRange('2026-12', 24);
  const page = Object.fromEntries(months.map((month, index) => [month, index < 12 ? 150 : 100]));
  const edition = Object.fromEntries(months.map(month => [month, 100000]));
  const result = evaluateLanguage('uk', { Topic: page }, edition, months);
  const assessment = screenCandidates([result])[0].assessment;
  assert.equal(result.confidence, 'high');
  assert.equal(result.direction, 'falling');
  assert.deepEqual(assessment.checks.map(check => check.status), ['pass', 'pass', 'fail', 'fail', 'fail']);
  assert.match(assessment.checks[1].explanation, /high.*signal quality/i);
  assert.match(assessment.checks[4].explanation, /falling.*rising/i);
  assert.equal(assessment.eligible, false);
  assert.equal(assessment.eligibleRank, null);
  assert.equal(selectCandidate([result]), null);
});

test('mixed monthly direction blocks annual growth unless explicitly overridden', () => {
  const months = monthRange('2026-12', 24);
  const recent = [110, 110, 110, 110, 110, 110, 90, 90, 90, 90, 90, 200];
  const page = Object.fromEntries(months.map((month, index) =>
    [month, index < 12 ? 100 : recent[index - 12]]));
  const edition = Object.fromEntries(months.map(month => [month, 100000]));
  const result = evaluateLanguage('en', { Topic: page }, edition, months);
  assert.equal(result.viewsPrior, 1200);
  assert.equal(result.viewsRecent, 1310);
  assert.equal(result.direction, 'mixed');
  assert.equal(result.confidence, 'medium');
  assert.deepEqual(screenCandidates([result])[0].assessment.checks.map(check => check.status),
    ['pass', 'pass', 'pass', 'pass', 'fail']);
  assert.equal(selectCandidate([result]), null);
  assert.equal(selectCandidate([result], { requireRisingDirection: undefined }), null);
  const allowed = screenCandidates([result], { requireRisingDirection: false })[0].assessment;
  assert.equal(allowed.checks[4].status, 'not-required');
  assert.equal(allowed.eligibleRank, 1);
  assert.equal(selectCandidate([result], { requireRisingDirection: false }), 'en');
});

test('screening keeps required unknowns out and explains optional checks', () => {
  const candidate = { language: 'en', confidence: 'medium', viewsRecent: 200,
    viewsYoyPct: null, shareYoyPct: null, direction: 'rising' };
  const criteria = parseManifest({ topic: 'Topic', editions: [{ language: 'en', articles: ['Topic'] }] }).screening;
  const required = assessScreening(candidate, criteria);
  assert.equal(required.checks[0].status, 'pass');
  assert.deepEqual(required.checks.slice(2, 4).map(check => check.status), ['fail', 'fail']);
  const optional = screenCandidates([candidate], { requireRawGrowth: false, requireShareGrowth: false });
  assert.deepEqual(optional[0].assessment.checks.slice(2, 4).map(check => check.status),
    ['not-required', 'not-required']);
  assert.equal(optional[0].assessment.eligibleRank, 1);
  assert.equal(screenCandidates([{ ...candidate, direction: undefined }])[0].assessment.checks[4].observed, null);
});

test('tiny positive growth stays visibly positive in screening explanations', () => {
  const candidate = { language: 'en', confidence: 'high', viewsRecent: 1000,
    viewsYoyPct: 0.04, shareYoyPct: 0.004, direction: 'rising' };
  const assessment = screenCandidates([candidate])[0].assessment;
  assert.equal(assessment.eligibleRank, 1);
  assert.match(assessment.checks[2].explanation, /\+0\.04%/);
  assert.match(assessment.checks[3].explanation, /\+0\.004%/);
});

test('multiple passing editions have stable ranks from the existing ordering', () => {
  const medium = { language: 'pl', confidence: 'medium', viewsRecent: 500,
    viewsYoyPct: 20, shareYoyPct: 12, direction: 'rising' };
  const high = { language: 'uk', confidence: 'high', viewsRecent: 400,
    viewsYoyPct: 10, shareYoyPct: 5, direction: 'rising' };
  const screened = screenCandidates([medium, high]);
  assert.deepEqual(screened.map(entry => entry.assessment.eligibleRank), [2, 1]);
  assert.equal(selectCandidate([medium, high]), 'uk');
  const tie = screenCandidates([medium, { ...medium, language: 'cs' }]);
  assert.deepEqual(tie.map(entry => entry.assessment.eligibleRank), [1, 2]);
});

test('manifest preserves valid screening criteria and assumptions', () => {
  const manifest = parseManifest({ topic: 'Astronomy', editions: [{ language: 'uk', articles: ['Астрономія'] }],
    screening: { minRecentViews: 500, minConfidence: 'high', requireShareGrowth: false },
    assumptions: ['This page represents broad interest.'] });
  assert.equal(manifest.screening.minRecentViews, 500);
  assert.equal(manifest.screening.requireShareGrowth, false);
  assert.deepEqual(manifest.assumptions, ['This page represents broad interest.']);
});

test('manifest keeps a nonempty concept mismatch review reason', () => {
  const base = { topic: 'English learning', editions: [{ language: 'uk', articles: ['English'] }] };
  assert.equal(parseManifest({ ...base, conceptMismatchRationale: 'Different proxies were reviewed.' })
    .conceptMismatchRationale, 'Different proxies were reviewed.');
  assert.throws(() => parseManifest({ ...base, conceptMismatchRationale: '   ' }), /concept.*review|concept.*rationale/i);
});

test('manifest accepts only selected nonduplicate former titles', () => {
  const base = { topic: 'X', editions: [{ language: 'en', articles: ['X (social network)'],
    formerTitles: { 'X (social network)': ['Twitter'] } }] };
  assert.deepEqual(parseManifest(base).editions[0].formerTitles, { 'X (social network)': ['Twitter'] });
  assert.deepEqual(parseManifest({ topic: 'X', editions: [{ language: 'en', articles: ['X'] }] })
    .editions[0].formerTitles, {});
  assert.throws(() => parseManifest({ topic: 'X', editions: [{ language: 'en', articles: ['X'],
    formerTitles: { Y: ['Old'] } }] }), /former.*selected/i);
  assert.throws(() => parseManifest({ topic: 'X', editions: [{ language: 'en', articles: ['X'],
    formerTitles: { X: ['Old', 'old'] } }] }), /duplicate.*former/i);
});
