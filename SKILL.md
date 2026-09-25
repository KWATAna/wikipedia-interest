---
name: wikipedia-interest
description: Use when a B2C founder wants to compare topic interest across Wikipedia language editions, inspect pageview growth and reliability, or produce a brief chart and PDF report to prioritize further market validation.
---

# Wikipedia interest signals

Use the bundled TypeScript CLI for repeatable collection, analysis, charting, and a one-page PDF. `tsx` runs the `.ts` source directly, with no build output. The numbers measure article requests, not people, product demand, or willingness to pay.

For an ordinary request, read only this file and the chosen manifest, run the CLI, then read `metrics.json`. The file paths are given here. **Do not inventory this directory with `rg --files`, `find .`, or recursive `ls`**: `npm ci` puts thousands of dependency files in `node_modules`, wasting a low-cost model's context. Open source files only to debug a failure.

## Run

From this skill directory:

```sh
npm ci
export WIKIMEDIA_USER_AGENT='WikipediaInterest/1.0 (your-real-contact@example.com)'
node --import tsx scripts/wiki-interest.ts discover --source en:Astronomy --languages uk,pl,cs
node --import tsx scripts/wiki-interest.ts search --language pl --query "astronomia"
node --import tsx scripts/wiki-interest.ts analyze --manifest examples/astronomy.json --out /tmp/astronomy-interest
```

Replace the example address with a **real operator contact** before making live requests. Wikimedia requires a descriptive User-Agent with an email, URL, or wiki user page in parentheses; `--user-agent` also works. Cached requests need no new contact. By default, the latest period ends at the prior UTC month, or two months back on UTC days 1–2 to allow publication lag. `--end YYYY-MM` sets an earlier end. Use `--cache DIR` across related runs and `--refresh` to bypass cached API responses when checking recent or previously missing data. The three outputs are `metrics.json` (exact values, flags, URLs, timestamps), `chart.svg` (indexed trend), and `report.pdf` (shareable summary). Run `node --import tsx scripts/wiki-interest.ts --help` for syntax. Developers can run `npm run typecheck` and `npm test`.

A point-in-time [Ukrainian astronomy example](examples/astronomy-output/manifest.json) includes its manifest, metrics, chart, and PDF for inspection.

## Choose pages before comparing

1. Identify a specific topic proxy. For an existing source article, use `discover` to get interlanguage titles. For an edition without a link, use `search` with a localized phrase and inspect candidates. A missing article is **not** evidence of no audience interest.
2. Check that each chosen page covers comparable concepts. Before writing a manifest, open [the example](examples/astronomy.json) and copy its `editions` shape; do not infer the schema. The minimum is `{"topic":"Astronomy","editions":[{"language":"uk","articles":["Астрономія"],"rationale":"Broad overview"}]}`. Put exact titles in `articles`, why they represent the user's topic in `rationale`, and important caveats in `assumptions`. Multiple articles are allowed but their views are summed, so the result does not count distinct readers.
3. Run `analyze`. It resolves redirects to current canonical titles, fetches monthly article and edition traffic, and compares the most recent complete 12 months with the preceding 12. The default period is 24 complete months. For a follow-up, change the manifest or `--end`, reuse `--cache`, and save to a new output directory.

## Interpret

- `viewsYoyPct` compares matched 12-month windows, reducing simple seasonal bias. `shareRecentPerMillion` is selected article views per million views across that language edition; `shareYoyPct` shows whether the topic gained share as the edition changed size. Compare both raw and relative movement. If an edition month is missing or no article observations exist, the complete-window totals and growth fields are `null` rather than a distorted comparison; `observedViewsPrior/Recent` preserve the partial counts.
- `positiveYoyMonths` and `negativeYoyMonths` compare each month with the same month a year earlier. `direction` can be rising, falling, or mixed. `peakMonthShare` checks whether a single month dominates either year. The `confidence` label is a **heuristic**, not a statistical confidence level or a growth grade. High requires 24 loaded edition months, at least 1,000 views in each year, 9 of 12 comparisons in one direction, and no month above 25% of its year's views. Medium needs 200 views in each year, 7 directional comparisons, and no month above 35%. Missing edition months or no article observations make it insufficient.
- The default screening rule selects an edition with medium/high reliability, at least 200 recent views, and positive raw and share growth. Override with `screening` in the manifest when the user's criteria differ. `selectedCandidate` is a lead for investigation, not a launch recommendation. Explain the chosen criteria and any contrary evidence.
- Check `flags`, article fit, redirects, API status, source URLs, and retrieval times in `metrics.json`. The API omits zero-view article months; the script fills them with zero only where edition traffic exists. A 404 may mean zero views or data not loaded. Editions cover readers across countries, and title changes or redirects can split historical counts.
- The PDF bundles fonts for Latin, Greek, Cyrillic, Arabic, Hebrew, Devanagari, and CJK text. If another glyph is unsupported, the CLI gives an explicit error. The indexed chart requires a complete positive prior-year baseline; a missing line or the unavailable notice means the series cannot be plotted as a valid index.

In the response, state the period, exact proxy articles, raw and relative changes, reliability, an actionable validation step, and limits. If signals disagree or are weak, say so. Ask for a different proxy or timeframe when that would change the answer. For larger research programs, use the staged extensions in [development roadmap](references/roadmap.md).
