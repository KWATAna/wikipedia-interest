/** Agent-facing CLI. Run with `node --import tsx scripts/wiki-interest.ts ...`. */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { WikimediaClient } from './client.ts';
import { lastCompleteMonth, monthRange } from './core.ts';
import { runAnalysis } from './pipeline.ts';

const help = `Wikipedia interest skill (Node 20+)

  node --import tsx scripts/wiki-interest.ts discover --source en:Astronomy --languages uk,pl,cs [--cache DIR] [--refresh]
  node --import tsx scripts/wiki-interest.ts search --language pl --query "astronomia" [--cache DIR] [--refresh]
  node --import tsx scripts/wiki-interest.ts analyze --manifest INPUT.json --out OUTPUT_DIR [--end YYYY-MM] [--cache DIR] [--refresh]

Set WIKIMEDIA_USER_AGENT (or --user-agent) to ToolName/version (real email, URL, or wiki User: page)
before live requests. The default analysis uses 24 months ending at the prior UTC month (two months
back on UTC days 1-2). --refresh bypasses cached responses. Analyze writes metrics.json, chart.svg
and report.pdf.
`;

type CliOptions = Record<string, string | boolean>;

function options(args: string[]): CliOptions {
  const parsed: CliOptions = {};
  for (let i = 0; i < args.length;) {
    if (args[i] === '--refresh') {
      if (Object.hasOwn(parsed, '--refresh')) throw new Error('duplicate option: --refresh');
      parsed['--refresh'] = true;
      i++;
      continue;
    }
    if (!args[i]?.startsWith('--') || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error(`expected --option value near ${args[i] ?? 'end of command'}`);
    }
    if (Object.hasOwn(parsed, args[i])) throw new Error(`duplicate option: ${args[i]}`);
    parsed[args[i]] = args[i + 1];
    i += 2;
  }
  return parsed;
}

const optional = (opts: CliOptions, key: string): string | undefined => {
  const value = opts[key];
  return typeof value === 'string' ? value : undefined;
};

const required = (opts: CliOptions, key: string): string => {
  const value = optional(opts, key);
  if (!value) throw new Error(`${key} is required`);
  return value;
};

async function main(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(help);
    return;
  }
  const [command, ...args] = argv;
  const opts = options(args);
  const allowed = command === 'analyze' ? ['--manifest', '--out', '--end', '--cache', '--user-agent', '--refresh']
    : command === 'discover' ? ['--source', '--languages', '--cache', '--user-agent', '--refresh']
      : command === 'search' ? ['--language', '--query', '--cache', '--user-agent', '--refresh'] : [];
  if (!allowed.length) throw new Error(`unknown command: ${command}`);
  for (const key of Object.keys(opts)) if (!allowed.includes(key)) throw new Error(`unknown option: ${key}`);
  const cacheDir = resolve(optional(opts, '--cache') ?? join(homedir(), '.cache', 'wikipedia-interest-skill'));
  const client = new WikimediaClient({ cacheDir, userAgent: optional(opts, '--user-agent') || process.env.WIKIMEDIA_USER_AGENT,
  refresh: Boolean(opts['--refresh']) });
  if (command === 'discover') {
    const source = required(opts, '--source');
    const colon = source.indexOf(':');
    if (colon < 2) throw new Error('--source must be LANGUAGE:Article title');
    const languages = required(opts, '--languages').split(',').map(value => value.trim()).filter(Boolean);
    const result = await client.discoverLanguages(source.slice(0, colon), source.slice(colon + 1), languages);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  if (command === 'search') {
    const result = await client.searchArticles(required(opts, '--language'), required(opts, '--query'));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  const input = resolve(required(opts, '--manifest'));
  const output = resolve(required(opts, '--out'));
  const end = optional(opts, '--end') ?? lastCompleteMonth();
  const months = monthRange(end, 24);
  if (end > lastCompleteMonth()) throw new Error('--end is newer than the safe completed month; try again after UTC day 2');
  if (months[0] < '2015-07') throw new Error('Wikimedia pageview data starts in July 2015');
  const manifest = JSON.parse(await readFile(input, 'utf8'));
  const analysis = await runAnalysis(manifest, client, end);
  const { renderChartSvg, writePdf } = await import('./report.ts');
  await mkdir(output, { recursive: true });
  const paths = { metrics: join(output, 'metrics.json'), chart: join(output, 'chart.svg'),
    report: join(output, 'report.pdf') };
  await writeFile(paths.metrics, JSON.stringify(analysis, null, 2) + '\n');
  await writeFile(paths.chart, renderChartSvg(analysis));
  await writePdf(analysis, paths.report);
  process.stdout.write(JSON.stringify({ topic: analysis.topic, period: analysis.period,
    selectedCandidate: analysis.selectedCandidate,
    results: analysis.results.map(({ language, viewsRecent, viewsYoyPct, shareYoyPct, confidence, flags }) =>
      ({ language, viewsRecent, viewsYoyPct, shareYoyPct, confidence, flags })),
    paths }, null, 2) + '\n');
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
