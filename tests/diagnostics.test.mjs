import test from 'node:test';
import assert from 'node:assert/strict';
import { monthRange } from '../scripts/core.ts';
import { calculatePeakPairSensitivity } from '../scripts/diagnostics.ts';

const months = monthRange('2026-12', 24);
const series = (value) => Object.fromEntries(months.map(month => [month, value]));

test('one recent June spike disappears after excluding its matched pair', () => {
  const selected = series(100);
  selected['2026-06'] = 1100;
  const result = calculatePeakPairSensitivity(months, selected, series(10000),
    83.33333333333333, 83.33333333333333);
  assert.equal(result.status, 'available');
  assert.equal(result.peakMonth, '2026-06');
  assert.deepEqual(result.excludedMonths, { prior: '2025-06', recent: '2026-06' });
  assert.equal(result.viewsPrior, 1100);
  assert.equal(result.viewsRecent, 1100);
  assert.equal(result.viewsYoyPct, 0);
  assert.equal(result.sharePriorPerMillion, 10000);
  assert.equal(result.shareRecentPerMillion, 10000);
  assert.equal(result.shareYoyPct, 0);
  assert.equal(result.rawDirectionChanged, true);
  assert.equal(result.shareDirectionChanged, true);
});

test('a prior-year spike also removes its matched recent month', () => {
  const selected = series(100);
  selected['2025-06'] = 1100;
  const result = calculatePeakPairSensitivity(months, selected, series(10000), -45.45454545454545,
    -45.45454545454545);
  assert.equal(result.peakMonth, '2025-06');
  assert.deepEqual(result.excludedMonths, { prior: '2025-06', recent: '2026-06' });
  assert.equal(result.viewsPrior, 1100);
  assert.equal(result.viewsRecent, 1100);
  assert.equal(result.viewsYoyPct, 0);
  assert.equal(result.rawDirectionChanged, true);
});

test('equal peaks choose the first occurrence in chronological order', () => {
  const selected = series(100);
  selected['2025-03'] = 300;
  selected['2026-05'] = 300;
  const result = calculatePeakPairSensitivity(months, selected, series(10000), 0, 0);
  assert.equal(result.peakMonth, '2025-03');
  assert.deepEqual(result.excludedMonths, { prior: '2025-03', recent: '2026-03' });
});

test('unknown article or edition month blocks the sensitivity calculation', () => {
  const articleUnknown = series(100);
  articleUnknown['2026-06'] = null;
  const editionUnknown = series(10000);
  editionUnknown['2025-09'] = null;
  for (const [article, edition] of [[articleUnknown, series(10000)], [series(100), editionUnknown]]) {
    const result = calculatePeakPairSensitivity(months, article, edition, null, null);
    assert.equal(result.status, 'incomplete-data');
    assert.equal(result.peakMonth, null);
    assert.equal(result.viewsYoyPct, null);
    assert.equal(result.rawDirectionChanged, null);
  }
});

test('all-zero traffic does not invent a peak month', () => {
  const result = calculatePeakPairSensitivity(months, series(0), series(10000), null, null);
  assert.equal(result.status, 'zero-traffic');
  assert.equal(result.peakMonth, null);
  assert.equal(result.excludedMonths, null);
  assert.equal(result.viewsYoyPct, null);
});

test('zero prior total after exclusion keeps counts without invented growth', () => {
  const selected = series(0);
  selected['2025-06'] = 100;
  for (const month of months.slice(12)) selected[month] = 100;
  const result = calculatePeakPairSensitivity(months, selected, series(10000), 1100, 1100);
  assert.equal(result.status, 'zero-baseline');
  assert.deepEqual(result.excludedMonths, { prior: '2025-06', recent: '2026-06' });
  assert.equal(result.viewsPrior, 0);
  assert.equal(result.viewsRecent, 1100);
  assert.equal(result.sharePriorPerMillion, 0);
  assert.equal(result.shareRecentPerMillion, 10000);
  assert.equal(result.viewsYoyPct, null);
  assert.equal(result.shareYoyPct, null);
  assert.equal(result.rawDirectionChanged, null);
  assert.equal(result.shareDirectionChanged, null);
});
