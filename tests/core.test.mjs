import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLanguage, lastCompleteMonth, monthRange, parseManifest, selectCandidate } from '../scripts/core.ts';

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
    shareYoyPct: 8, viewsRecent: 5000 };
  const bad = { language: 'pl', confidence: 'medium', viewsYoyPct: 60,
    shareYoyPct: -10, viewsRecent: 10000 };
  assert.equal(selectCandidate([bad, good]), 'cs');
  assert.equal(selectCandidate([bad]), null);
  assert.equal(selectCandidate([bad], { requireShareGrowth: false }), 'pl');
  assert.equal(selectCandidate([good], { minRecentViews: 10000 }), null);
});

test('manifest preserves valid screening criteria and assumptions', () => {
  const manifest = parseManifest({ topic: 'Astronomy', editions: [{ language: 'uk', articles: ['Астрономія'] }],
    screening: { minRecentViews: 500, minConfidence: 'high', requireShareGrowth: false },
    assumptions: ['This page represents broad interest.'] });
  assert.equal(manifest.screening.minRecentViews, 500);
  assert.equal(manifest.screening.requireShareGrowth, false);
  assert.deepEqual(manifest.assumptions, ['This page represents broad interest.']);
});
