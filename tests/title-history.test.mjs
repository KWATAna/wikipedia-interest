import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { monthRange } from '../scripts/core.ts';
import { assignMonthlyTitles } from '../scripts/title-history.ts';

test('verified move assigns old and new titles to disjoint full months', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/phase3-twitter-move.json', import.meta.url)));
  const months = monthRange('2026-03', 24);
  const result = assignMonthlyTitles('X (social network)', 9988187, ['Twitter'], fixture.events.map(event => ({
    from: event.title, to: event.params.target_title, timestamp: event.timestamp,
    logId: event.logid, logpage: event.logpage, ns: event.ns, targetNs: event.params.target_ns
  })), months);
  assert.equal(result.byMonth['2026-01'], 'Twitter');
  assert.equal(result.byMonth['2026-02'], null);
  assert.equal(result.byMonth['2026-03'], 'X (social network)');
  assert.deepEqual(result.uncertainMonths, ['2026-02']);
  assert.equal(result.status, 'verified-move');
});

test('broken move chain cannot silently use the current title', () => {
  const months = monthRange('2026-03', 24);
  const result = assignMonthlyTitles('New', 7, ['Old'], [{ from: 'Old', to: 'Unrelated',
    timestamp: '2026-02-15T12:00:00Z', logId: 1, logpage: 7, ns: 0, targetNs: 0 }], months);
  assert.equal(result.status, 'uncertain');
  assert.ok(months.every(month => result.byMonth[month] === null));
});

test('two verified moves preserve one active title per full month', () => {
  const months = monthRange('2026-03', 24);
  const result = assignMonthlyTitles('New', 7, ['Old', 'Middle'], [
    { from: 'Old', to: 'Middle', timestamp: '2025-06-15T12:00:00Z', logId: 1, logpage: 7, ns: 0, targetNs: 0 },
    { from: 'Middle', to: 'New', timestamp: '2026-02-15T12:00:00Z', logId: 2, logpage: 7, ns: 0, targetNs: 0 }
  ], months);
  assert.equal(result.byMonth['2025-05'], 'Old');
  assert.equal(result.byMonth['2025-06'], null);
  assert.equal(result.byMonth['2025-07'], 'Middle');
  assert.equal(result.byMonth['2026-02'], null);
  assert.equal(result.byMonth['2026-03'], 'New');
});
