/** Vector chart and one-page PDF report. */

import PDFDocument from 'pdfkit';
import * as fontkit from 'fontkit';
import type { Font } from 'fontkit';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Analysis } from './types.ts';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const FONTS = {
  regular: join(ASSETS, 'NotoSans-Regular.ttf'),
  arabic: join(ASSETS, 'NotoSansArabic-Regular.ttf'),
  hebrew: join(ASSETS, 'NotoSansHebrew-Regular.ttf'),
  devanagari: join(ASSETS, 'NotoSerifDevanagari-Regular.ttf'),
  cjk: join(ASSETS, 'NotoSansCJKsc-Regular.otf')
};
const FONT = FONTS.regular;
type FontName = keyof typeof FONTS;
type FontRun = { font: FontName; text: string };
type ChartLine = { language: string; color: string; values: Array<number | null> };
type ChartData = { months: string[]; lines: ChartLine[]; max: number; ticks: number[] };
const loadedFonts = new Map<FontName, Font>();
const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });
function hasGlyphs(fontName: FontName, segment: string): boolean {
  if (!loadedFonts.has(fontName)) loadedFonts.set(fontName, fontkit.openSync(FONTS[fontName]) as Font);
  const font = loadedFonts.get(fontName)!;
  return Array.from(segment).every(character => /\s/u.test(character)
    || font.hasGlyphForCodePoint(character.codePointAt(0)!));
}

/** Divide mixed-script text into PDFKit font runs without silently dropping glyphs. */
export function fontRuns(value: unknown): FontRun[] {
  const runs: FontRun[] = [];
  for (const { segment } of graphemes.segment(String(value))) {
    const font = (Object.keys(FONTS) as FontName[]).find(name => hasGlyphs(name, segment));
    if (!font) throw new Error(`unsupported PDF glyph U+${segment.codePointAt(0)!.toString(16).toUpperCase()}; add a licensed font for this writing system`);
    const last = runs.at(-1);
    if (last?.font === font) last.text += segment;
    else runs.push({ font, text: segment });
  }
  return runs;
}

function drawMixedText(doc: PDFKit.PDFDocument, value: unknown, x: number, y: number,
  options: PDFKit.Mixins.TextOptions): void {
  const runs = fontRuns(value);
  if (!runs.length) return;
  runs.forEach((run, index) => {
    doc.font(FONTS[run.font]);
    const runOptions = { ...options, continued: index < runs.length - 1 };
    if (index === 0) doc.text(run.text, x, y, runOptions);
    else doc.text(run.text, runOptions);
  });
  doc.font(FONT);
}
const COLORS = ['#2563eb', '#d97706', '#059669', '#a855f7', '#e11d48', '#0891b2'];
const xml = (value: unknown): string => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const number = (value: number | null | undefined): string => value === null || value === undefined ? 'n/a'
  : new Intl.NumberFormat('en-US').format(value);
const pct = (value: number | null): string => value === null || !Number.isFinite(value) ? 'n/a' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
const axisNumber = (value: number): string => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export function chartTicks(maximum: number): number[] {
  if (!Number.isFinite(maximum) || maximum < 0) throw new Error('invalid chart maximum');
  if (maximum === 0) return [0, 1];
  const rough = maximum / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const ratio = rough / magnitude;
  const step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * magnitude;
  const count = Math.ceil(maximum / step);
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

function chartData(analysis: Analysis): ChartData {
  const months = analysis.results[0]?.months ?? [];
  const lines: ChartLine[] = analysis.results.map((result, index) => {
    const baseline = (result.viewsPrior ?? 0) / 12;
    return { language: result.language, color: COLORS[index % COLORS.length],
      values: months.map(month => {
        const value = result.monthlyViews[month];
        return baseline > 0 && value !== null && value !== undefined ? value / baseline * 100 : null;
      }) };
  });
  const observed = lines.flatMap(line => line.values).filter((value): value is number => value !== null);
  const ticks = chartTicks(Math.max(200, ...observed));
  return { months, lines, max: ticks.at(-1) ?? 1, ticks };
}

function segments<T>(values: Array<number | null>, point: (index: number, value: number) => T): T[][] {
  const output: T[][] = [];
  let current: T[] = [];
  values.forEach((value, i) => {
    if (value === null) {
      if (current.length > 1) output.push(current);
      current = [];
    } else current.push(point(i, value));
  });
  if (current.length > 1) output.push(current);
  return output;
}

export function renderChartSvg(analysis: Analysis): string {
  const { months, lines, max, ticks } = chartData(analysis);
  const width = 960, height = 330, left = 66, right = 22, top = 48, bottom = 64;
  const plotW = width - left - right, plotH = height - top - bottom;
  const x = (i: number) => left + i * plotW / Math.max(1, months.length - 1);
  const y = (value: number) => top + (1 - value / max) * plotH;
  const grid = ticks.map(value => `<line x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}" stroke="#e2e8f0"/><text x="${left - 12}" y="${y(value) + 4}" text-anchor="end" fill="#64748b" font-size="12">${axisNumber(value)}</text>`).join('');
  const monthTicks = months.map((month, i) => i % 3 === 0 || i === months.length - 1
    ? `<text x="${x(i)}" y="${height - bottom + 22}" text-anchor="middle" fill="#64748b" font-size="12">${xml(month)}</text>` : '').join('');
  const series = lines.map(line => segments(line.values, (i, value) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`)
    .map(points => `<polyline fill="none" stroke="${line.color}" stroke-width="3" points="${points.join(' ')}"/>`).join('')).join('');
  const unavailable = lines.every(line => line.values.every(value => value === null))
    ? `<text x="${width / 2}" y="${top + plotH / 2}" text-anchor="middle" fill="#475569" font-size="15">Indexed trend unavailable: no complete positive baseline</text>` : '';
  const legend = lines.map((line, i) => `<circle cx="${left + i * 120}" cy="${height - 14}" r="5" fill="${line.color}"/><text x="${left + 12 + i * 120}" y="${height - 10}" fill="#334155" font-size="13">${xml(line.language)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Indexed monthly Wikipedia pageviews"><rect width="${width}" height="${height}" fill="#fff"/><text x="${left}" y="27" font-family="sans-serif" font-size="17" font-weight="bold" fill="#0f172a">Indexed monthly views (prior 12-month mean = 100)</text><g font-family="sans-serif">${grid}${monthTicks}${series}${unavailable}${legend}</g></svg>`;
}

function drawChart(doc: PDFKit.PDFDocument, analysis: Analysis, x: number, y: number,
  width: number, height: number): void {
  const { months, lines, max, ticks } = chartData(analysis);
  const plot = { left: x + 36, right: x + width - 9, top: y + 28, bottom: y + height - 32 };
  const px = (i: number) => plot.left + i * (plot.right - plot.left) / Math.max(1, months.length - 1);
  const py = (value: number) => plot.bottom - value / max * (plot.bottom - plot.top);
  doc.fillColor('#0f172a').fontSize(10).text('INDEXED MONTHLY VIEWS   prior 12-month mean = 100', x, y);
  for (const value of ticks) {
    doc.strokeColor('#e2e8f0').lineWidth(.6).moveTo(plot.left, py(value)).lineTo(plot.right, py(value)).stroke();
    doc.fillColor('#64748b').fontSize(7).text(axisNumber(value), x, py(value) - 4, { width: 29, align: 'right' });
  }
  months.forEach((month, i) => {
    if (i % 4 !== 0 && i !== months.length - 1) return;
    doc.fillColor('#64748b').fontSize(7).text(month, px(i) - 17, plot.bottom + 7, { width: 42 });
  });
  lines.forEach(line => {
    for (const segment of segments(line.values, (i, value) => [px(i), py(value)] as const)) {
      doc.strokeColor(line.color).lineWidth(1.7).moveTo(...segment[0]);
      segment.slice(1).forEach(point => doc.lineTo(...point));
      doc.stroke();
    }
  });
  if (lines.every(line => line.values.every(value => value === null))) {
    doc.fillColor('#475569').fontSize(9).text('Indexed trend unavailable: no complete positive baseline',
      plot.left + 20, plot.top + (plot.bottom - plot.top) / 2, { width: plot.right - plot.left - 40, align: 'center' });
  }
}

function clipped(value: unknown, max: number): string {
  const chars = Array.from(String(value));
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('');
}

export function pdfLayout(analysis: Analysis) {
  const sourceHeadingY = 450 + analysis.results.length * 21;
  const firstSourceY = sourceHeadingY + 18;
  const sourcesBottom = firstSourceY + analysis.sources.length * 15;
  const notesY = sourcesBottom + 7;
  const assumptionsHeight = analysis.results.length <= 2 ? 70
    : analysis.results.length <= 4 ? 48 : 28;
  const notesBottom = notesY + 15 + assumptionsHeight;
  const methodY = Math.max(notesBottom + 8, 696);
  const limitsY = methodY + 33;
  return { sourceHeadingY, firstSourceY, sourcesBottom, notesY, notesBottom,
    assumptionsHeight, methodY, limitsY, limitsBottom: limitsY + 34, footerY: 823 };
}

export async function writePdf(analysis: Analysis, filename: string): Promise<void> {
  await mkdir(dirname(filename), { recursive: true });
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false,
    info: { Title: `Wikipedia interest: ${analysis.topic}`, Author: 'Wikipedia Interest Skill' } });
  doc.addPage();
  doc.font(FONT);
  const stream = createWriteStream(filename);
  const finished = new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve()); stream.on('error', reject); doc.on('error', reject);
  });
  doc.pipe(stream);
  const W = 595.28, margin = 39, usable = W - 2 * margin;
  doc.rect(0, 0, W, 11).fill('#2563eb');
  doc.fillColor('#64748b').fontSize(8).text('WIKIPEDIA INTEREST SIGNAL', margin, 29);
  doc.fillColor('#0f172a').fontSize(22);
  drawMixedText(doc, clipped(analysis.topic, 55), margin, 45,
    { width: usable, height: 31, ellipsis: true });
  doc.fillColor('#475569').fontSize(9);
  drawMixedText(doc, analysis.question || 'Topic and language edition comparison', margin, 79,
    { width: usable, height: 28, ellipsis: true });
  const candidate = analysis.selectedCandidate;
  const headline = candidate
    ? `${candidate} shows the strongest screening signal. Investigate this audience next; validate demand separately.`
    : 'No edition clears the screening rule. Review article selection or gather more evidence.';
  doc.roundedRect(margin, 109, usable, 53, 7).fill('#eff6ff');
  doc.fillColor('#1e3a8a').fontSize(10.5).text(headline, margin + 12, 119,
    { width: usable - 24, height: 34, ellipsis: true });
  drawChart(doc, analysis, margin, 176, usable, 190);
  let lx = margin;
  analysis.results.forEach((result, i) => {
    doc.circle(lx + 4, 378, 3.2).fill(COLORS[i % COLORS.length]);
    doc.fillColor('#334155').fontSize(8).text(result.language, lx + 12, 373, { width: 39 });
    lx += 75;
  });
  doc.fillColor('#0f172a').fontSize(10).text('Evidence by language edition', margin, 397);
  const cols = [margin, margin + 75, margin + 173, margin + 243, margin + 338, margin + 432];
  doc.rect(margin, 419, usable, 21).fill('#f1f5f9');
  const headers = ['Edition', 'Recent 12m', 'Views YoY', 'Share / 1m', 'Share YoY', 'Reliability'];
  headers.forEach((label, i) => doc.fillColor('#334155').fontSize(7.3).text(label, cols[i] + 4, 425,
    { width: (cols[i + 1] ?? margin + usable) - cols[i] - 5 }));
  analysis.results.forEach((result, i) => {
    const rowY = 440 + i * 21;
    if (i % 2 === 1) doc.rect(margin, rowY, usable, 21).fill('#f8fafc');
    const values = [result.language, number(result.viewsRecent), pct(result.viewsYoyPct),
      result.shareRecentPerMillion === null ? 'n/a' : result.shareRecentPerMillion.toFixed(2),
      pct(result.shareYoyPct), result.confidence];
    values.forEach((value, j) => doc.fillColor('#0f172a').fontSize(8.1).text(value, cols[j] + 4, rowY + 5,
      { width: (cols[j + 1] ?? margin + usable) - cols[j] - 5, height: 12, ellipsis: true }));
  });
  const layout = pdfLayout(analysis);
  doc.fillColor('#0f172a').fontSize(9).text('Articles and source links', margin, layout.sourceHeadingY);
  let sourceY = layout.firstSourceY;
  for (const source of analysis.sources) {
    const articles = source.articles.map(article => article.title).join(' · ');
    const label = `${source.language}: ${clipped(articles, 95)}`;
    doc.fillColor('#2563eb').fontSize(7.7);
    drawMixedText(doc, label, margin, sourceY,
      { width: usable, height: 13, ellipsis: true, link: source.articles[0]?.url });
    sourceY += 15;
  }
  const criteria = analysis.screening ?? { minRecentViews: 200, minConfidence: 'medium',
    requireRawGrowth: true, requireShareGrowth: true };
  const screening = `Screen: >=${number(criteria.minRecentViews)} recent views; ${criteria.minConfidence}+ reliability; `
    + `${criteria.requireRawGrowth ? 'raw growth required' : 'raw growth optional'}; `
    + `${criteria.requireShareGrowth ? 'share growth required' : 'share growth optional'}.`;
  doc.fillColor('#334155').fontSize(7.4).text(screening, margin, layout.notesY,
    { width: usable, height: 13, ellipsis: true });
  const assumptions = analysis.assumptions?.length ? `Assumptions: ${analysis.assumptions.join(' ')}`
    : 'Assumption: selected articles represent comparable topic attention.';
  doc.fillColor('#475569').fontSize(7.4);
  drawMixedText(doc, assumptions, margin, layout.notesY + 15,
    { width: usable, height: layout.assumptionsHeight, ellipsis: true });
  doc.moveTo(margin, layout.methodY - 5).lineTo(margin + usable, layout.methodY - 5)
    .strokeColor('#cbd5e1').lineWidth(.6).stroke();
  const methods = `Period ${analysis.period.first} to ${analysis.period.last}. User pageviews, all access; each edition uses the listed articles. Share = article views per million edition views. Missing article months count as zero only where edition traffic exists.`;
  doc.fillColor('#475569').fontSize(7.1).text(methods, margin, layout.methodY,
    { width: usable, height: 30, ellipsis: true });
  doc.fillColor('#475569').fontSize(7.1).text('Reliability is a heuristic from coverage, baseline, monthly consistency and spike concentration. Pageviews are neither unique people nor willingness to pay; editions are not countries. Redirects and title changes may split history.',
    margin, layout.limitsY, { width: usable, height: 32, ellipsis: true });
  doc.fillColor('#64748b').fontSize(7).text('Data: Wikimedia Analytics API  |  Source URLs and exact values: accompanying metrics.json',
    margin, layout.footerY, { width: usable, height: 12, link: 'https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html' });
  doc.end();
  await finished;
}
