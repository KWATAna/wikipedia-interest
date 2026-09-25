import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WikimediaClient, articleViewsUrl, projectViewsUrl } from '../scripts/client.ts';

const TEST_AGENT = 'WikipediaInterestTest/1.0 (qa@example.com)';

test('article URL encodes Unicode, slashes and punctuation', () => {
  assert.match(articleViewsUrl('uk', 'ДНК/C++', '2024-01', '2024-03'), /uk\.wikipedia\.org\/all-access\/user\/%D0%94%D0%9D%D0%9A%2FC%2B%2B\/monthly\/20240101\/20240331$/);
  assert.match(projectViewsUrl('cs', '2024-01', '2024-03'), /cs\.wikipedia\.org\/all-access\/user\/monthly\/2024010100\/2024033100$/);
});

test('language codes cannot redirect MediaWiki requests to another host', async () => {
  assert.throws(() => articleViewsUrl('@example.com/', 'A', '2024-01', '2024-03'), /invalid language/);
  assert.throws(() => projectViewsUrl('@example.com/', '2024-01', '2024-03'), /invalid language/);
  const client = new WikimediaClient({ cacheDir: '/tmp/unused-wiki-test-cache',
    fetchImpl: async () => { throw new Error('network must not be reached'); } });
  await assert.rejects(client.searchArticles('@example.com/', 'astronomy'), /invalid language/);
  await assert.rejects(client.discoverLanguages('en', 'Astronomy', ['@example.com/']), /invalid language/);
});

test('a live Wikimedia request requires an identifying contact in User-Agent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-interest-'));
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response('{}', { status: 200 }); };
  try {
    for (const userAgent of ['', 'WikipediaInterestSkill/1.0 (local research tool)']) {
      const client = new WikimediaClient({ cacheDir: dir, userAgent, fetchImpl });
      await assert.rejects(client.searchArticles('en', 'astronomy'), /contact.*User-Agent/i);
    }
    assert.equal(calls, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('cached API response is reused on follow-up', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-interest-'));
  let calls = 0;
  const client = new WikimediaClient({ cacheDir: dir, userAgent: TEST_AGENT, fetchImpl: async () => {
    calls++;
    return new Response(JSON.stringify({ items: [{ timestamp: '2024010100', views: 12 }] }), { status: 200 });
  } });
  try {
    const a = await client.fetchArticleViews('en', 'Jupiter', '2024-01', '2024-03');
    const b = await client.fetchArticleViews('en', 'Jupiter', '2024-01', '2024-03');
    assert.deepEqual(a.series, { '2024-01': 12 });
    assert.equal(b.cacheHit, true);
    assert.equal(calls, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('refresh ignores a cached response when Wikimedia data may have arrived later', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-interest-'));
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response(JSON.stringify({ items: [{ timestamp: '2024010100', views: calls }] }), { status: 200 });
  };
  try {
    const first = new WikimediaClient({ cacheDir: dir, userAgent: TEST_AGENT, fetchImpl });
    const fresh = new WikimediaClient({ cacheDir: dir, userAgent: TEST_AGENT, fetchImpl, refresh: true });
    await first.fetchArticleViews('en', 'Jupiter', '2024-01', '2024-01');
    const result = await fresh.fetchArticleViews('en', 'Jupiter', '2024-01', '2024-01');
    assert.equal(calls, 2);
    assert.equal(result.series['2024-01'], 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('404 is preserved as no observations, not invented traffic', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-interest-'));
  const client = new WikimediaClient({ cacheDir: dir, userAgent: TEST_AGENT,
    fetchImpl: async () => new Response('{}', { status: 404 }) });
  try {
    const result = await client.fetchArticleViews('en', 'Absent', '2024-01', '2024-03');
    assert.deepEqual(result.series, {});
    assert.equal(result.status, 404);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('title resolution follows redirects and rejects missing pages', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-interest-'));
  const client = new WikimediaClient({ cacheDir: dir, userAgent: TEST_AGENT, fetchImpl: async url => {
    const title = new URL(url).searchParams.get('titles');
    return new Response(JSON.stringify({ query: { pages: title === 'Nope'
      ? [{ title: 'Nope', missing: true }]
      : [{ pageid: 123, ns: 0, title: 'Intermittent fasting' }] } }), { status: 200 });
  } });
  try {
    assert.equal((await client.resolveArticle('en', 'Intermittent_fasting')).title, 'Intermittent fasting');
    await assert.rejects(client.resolveArticle('en', 'Nope'), /not found/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
