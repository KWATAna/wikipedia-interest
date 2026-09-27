import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateLanguage, monthRange, screenCandidates } from '../scripts/core.ts';
import { articleTrendLabel, chartTicks, fontRuns, pdfLayout, recentArticleSummary,
  pct, renderChartSvg, reportHeadline, screeningCriteriaLabel, screeningOutcomeLabel,
  sensitivityTableValue, writePdf } from '../scripts/report.ts';

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

test('report headline explains unavailable article views instead of implying a weak trend', () => {
  const analysis = fixture();
  analysis.selectedCandidate = null;
  analysis.results[0].flags = ['article views unknown: Astronomy (2024-01)'];
  const headline = reportHeadline(analysis);
  assert.match(headline, /Article views unavailable/);
  assert.match(headline, /metrics\.json/);
});

test('report headline names title uncertainty and reviewed concept mismatch', () => {
  const moved = fixture();
  moved.selectedCandidate = null;
  moved.results[0].flags = ['title move month uncertain: X (social network) (2026-02)'];
  assert.match(reportHeadline(moved), /page move.*unknown.*metrics\.json/i);
  const reviewed = fixture();
  reviewed.conceptCheck = { status: 'mismatch-reviewed', editions: [],
    reviewRationale: 'Different article scope was reviewed.' };
  assert.match(reportHeadline(reviewed), /concept IDs differ.*metrics\.json/i);
});

test('PDF helpers compare ordinary and paired growth and name the excluded months', () => {
  const months = monthRange('2026-12', 24);
  const page = Object.fromEntries(months.map((month, index) => [month,
    month === '2026-06' ? 1100 : 100]));
  const edition = Object.fromEntries(months.map(month => [month, 10000]));
  const result = evaluateLanguage('en', { Topic: page }, edition, months);
  assert.ok(Math.abs(result.viewsYoyPct - 83.33333333333333) < 1e-9);
  assert.deepEqual(sensitivityTableValue(result), { growth: '+0.0% / +0.0%*', pair: 'Jun 25/26' });
  const analysis = { ...fixture(), results: [result], selectedCandidate: null };
  assert.match(reportHeadline(analysis), /12-month.*changes direction.*metrics\.json/i);
});

test('PDF helper names a prior-year peak and opposing article directions', () => {
  const months = monthRange('2026-12', 24);
  const page = Object.fromEntries(months.map(month => [month, month === '2025-06' ? 1100 : 100]));
  const edition = Object.fromEntries(months.map(month => [month, 10000]));
  assert.deepEqual(sensitivityTableValue(evaluateLanguage('en', { Topic: page }, edition, months)),
    { growth: '+0.0% / +0.0%*', pair: 'Jun 25/26' });
  const rising = Object.fromEntries(months.map((month, index) => [month, index < 12 ? 100 : 160]));
  const falling = Object.fromEntries(months.map((month, index) => [month, index < 12 ? 100 : 40]));
  const opposite = evaluateLanguage('en', { Rising: rising, Falling: falling }, edition, months);
  assert.match(articleTrendLabel(opposite), /Rising \+60\.0%.*Falling -60\.0%/);
});

test('PDF helper labels missing sensitivity and legacy metrics without invented results', () => {
  const incomplete = fixture().results[0];
  incomplete.monthlyViews[incomplete.months[0]] = null;
  incomplete.peakPairSensitivity = { status: 'incomplete-data', peakMonth: null, excludedMonths: null,
    viewsPrior: null, viewsRecent: null, viewsYoyPct: null, sharePriorPerMillion: null,
    shareRecentPerMillion: null, shareYoyPct: null,
    rawDirectionChanged: null, shareDirectionChanged: null };
  assert.deepEqual(sensitivityTableValue(incomplete), { growth: 'n/a', pair: 'unknown months' });
  const legacy = { ...incomplete, peakPairSensitivity: undefined, articleTrends: undefined };
  assert.deepEqual(sensitivityTableValue(legacy), { growth: 'not run', pair: '' });
  assert.match(articleTrendLabel(legacy), /Астрономія/);
});

test('PDF summary names the largest recent article only when all article counts are known', () => {
  const months = monthRange('2024-12', 24);
  const project = Object.fromEntries(months.map(month => [month, 100000]));
  const rising = Object.fromEntries(months.map((month, i) => [month, i < 12 ? 100 : 160]));
  const falling = Object.fromEntries(months.map((month, i) => [month, i < 12 ? 100 : 40]));
  const complete = evaluateLanguage('uk', { Rising: rising, Falling: falling }, project, months);
  assert.match(recentArticleSummary(complete), /Rising.*1,920.*metrics\.json/);
  falling[months.at(-1)] = null;
  const incomplete = evaluateLanguage('uk', { Rising: rising, Falling: falling }, project, months);
  assert.match(recentArticleSummary(incomplete), /incomplete.*metrics\.json/i);
  assert.doesNotMatch(recentArticleSummary(incomplete), /Top recent/);
});

test('PDF labels selected, lower-ranked, failed, and legacy screening outcomes', () => {
  const base = { confidence: 'high', viewsRecent: 500, viewsYoyPct: 20,
    shareYoyPct: 10, direction: 'rising' };
  const candidates = [
    { ...base, language: 'uk' },
    { ...base, language: 'pl', confidence: 'medium' },
    { ...base, language: 'cs', confidence: 'low', viewsRecent: 100,
      viewsYoyPct: -5, shareYoyPct: -8, direction: 'mixed' },
  ];
  const screened = screenCandidates(candidates);
  const results = screened.map((entry, index) => ({ ...candidates[index], screeningAssessment: entry.assessment }));
  assert.match(screeningOutcomeLabel(results[0]), /selected.*rank 1/i);
  assert.match(screeningOutcomeLabel(results[1]), /passed.*rank 2/i);
  for (const reason of ['views', 'quality', 'raw growth', 'share growth', 'monthly trend']) {
    assert.match(screeningOutcomeLabel(results[2]), new RegExp(reason, 'i'));
  }
  assert.match(screeningOutcomeLabel({ ...results[0], screeningAssessment: undefined }),
    /screen details not recorded/i);
});

test('PDF screening rule says signal quality and records the direction override', () => {
  const analysis = fixture();
  analysis.screening = { minRecentViews: 200, minConfidence: 'medium',
    requireRawGrowth: true, requireShareGrowth: true, requireRisingDirection: true };
  assert.match(screeningCriteriaLabel(analysis), /signal quality.*monthly direction rising/i);
  analysis.screening.requireRisingDirection = false;
  assert.match(screeningCriteriaLabel(analysis), /monthly direction optional/i);
  delete analysis.screening.requireRisingDirection;
  assert.match(screeningCriteriaLabel(analysis), /monthly direction not recorded/i);
});

test('PDF percentages do not round tiny positive and negative changes to zero', () => {
  assert.equal(pct(0.04), '+0.04%');
  assert.equal(pct(-0.004), '-0.004%');
  assert.equal(pct(0), '+0.0%');
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
      requireRawGrowth: true, requireShareGrowth: true, requireRisingDirection: true };
    const screened = screenCandidates(analysis.results);
    analysis.results.forEach((result, index) => { result.screeningAssessment = screened[index].assessment; });
    analysis.nextValidationStep = 'For the uk-language audience, interview five potential users; test sign-up intent on a small landing page.';
    const layout = pdfLayout(analysis);
    assert.ok(layout.sourcesBottom + 5 <= layout.notesY);
    assert.ok(layout.nextStepBottom + 2 <= layout.assumptionsY);
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
    analysis.nextValidationStep = 'Interview five users about تعلم الإنجليزية; test sign-up intent.';
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
