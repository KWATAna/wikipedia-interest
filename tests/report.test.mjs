import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateLanguage, monthRange } from '../scripts/core.ts';
import { chartTicks, fontRuns, pdfLayout, renderChartSvg, writePdf } from '../scripts/report.ts';

function fixture() {
  const months = monthRange('2024-12', 24);
  const page = Object.fromEntries(months.map((month, i) => [month, i < 12 ? 100 : 150]));
  const project = Object.fromEntries(months.map(month => [month, 100000]));
  return { topic: 'Astronomy', question: 'Is interest growing?', period: { first: months[0], last: months.at(-1) },
    selectedCandidate: 'uk', results: [evaluateLanguage('uk', { 'Астрономія': page }, project, months)],
    sources: [{ language: 'uk', articles: [{ title: 'Астрономія', url: 'https://uk.wikipedia.org/wiki/%D0%90' }] }] };
}

test('chart is valid SVG with visible legend and data line', () => {
  const svg = renderChartSvg(fixture());
  assert.match(svg, /<svg[^>]+xmlns=/);
  assert.match(svg, /Indexed monthly views/);
  assert.match(svg, /<polyline/);
  assert.match(svg, /uk/);
});

test('chart ticks remain bounded for a tiny baseline and large spike', () => {
  const ticks = chartTicks(12_000_000);
  assert.ok(ticks.length <= 7);
  assert.equal(ticks[0], 0);
  assert.ok(ticks.at(-1) >= 12_000_000);
});

test('chart explains when an indexed trend cannot be calculated', () => {
  const analysis = fixture();
  analysis.results[0].viewsPrior = null;
  assert.match(renderChartSvg(analysis), /Indexed trend unavailable/);
});

test('PDF font selection covers common Wikipedia writing systems', () => {
  for (const [label, title] of [
    ['arabic', 'علم الفلك'], ['hebrew', 'אסטרונומיה'],
    ['devanagari', 'खगोल विज्ञान'], ['cjk', '天文学']
  ]) {
    assert.ok(fontRuns(`Article: ${title}`).some(run => run.font === label), title);
  }
  assert.throws(() => fontRuns('🚀'), /unsupported PDF glyph/);
});

test('PDF report stays on one page for a basic analysis', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-interest-'));
  try {
    assert.ok(pdfLayout(fixture()).assumptionsHeight >= 60);
    const file = join(dir, 'report.pdf');
    await writePdf(fixture(), file);
    const pdf = await readFile(file);
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('PDF report stays on one page at the six-edition limit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-interest-'));
  try {
    const analysis = fixture();
    const languages = ['uk', 'pl', 'cs', 'de', 'fr', 'es'];
    analysis.results = languages.map(language => ({ ...analysis.results[0], language }));
    analysis.sources = languages.map(language => ({ language,
      articles: [{ title: 'Astronomy', url: 'https://en.wikipedia.org/wiki/Astronomy' }] }));
    analysis.assumptions = ['An article is a narrow proxy for education demand.'];
    analysis.screening = { minRecentViews: 200, minConfidence: 'medium',
      requireRawGrowth: true, requireShareGrowth: true };
    const layout = pdfLayout(analysis);
    assert.ok(layout.sourcesBottom + 5 <= layout.notesY);
    assert.ok(layout.notesBottom + 5 <= layout.methodY);
    assert.ok(layout.limitsBottom + 5 <= layout.footerY);
    const file = join(dir, 'report.pdf');
    await writePdf(analysis, file);
    const pdf = await readFile(file);
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('PDF renders mixed Arabic, Hebrew, Devanagari and CJK text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-interest-'));
  try {
    const analysis = fixture();
    analysis.topic = 'علم الفلك / 天文学';
    analysis.question = 'هل الاهتمام يتزايد؟ האם העניין גובר? क्या रुचि बढ़ रही है?';
    analysis.assumptions = ['مقالات ويكيبيديا हैं बस संकेतक. 天文学は市場需要を示しません.'];
    const examples = [['ar', 'علم الفلك'], ['he', 'אסטרונומיה'],
      ['hi', 'खगोल विज्ञान'], ['zh', '天文学']];
    analysis.results = examples.map(([language]) => ({ ...analysis.results[0], language }));
    analysis.sources = examples.map(([language, title]) => ({ language,
      articles: [{ title, url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title)}` }] }));
    const file = join(dir, 'report.pdf');
    await writePdf(analysis, file);
    const pdf = await readFile(file);
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
