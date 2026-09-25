# Validation record

## Automated checks

- `npm ci` installs the pinned dependency from `package-lock.json` on Node.js 20+.
- `npm test` exercises calendar windows, matched-year and edition-share growth, missing months, spike handling in either year, steady declines, manifest screening overrides, title resolution, URL and User-Agent validation, cache bypass and expiry, provenance, CLI errors, bounded SVG ticks, unavailable-chart messaging, and one-page PDFs with up to six editions and mixed Arabic, Hebrew, Devanagari, and CJK text. All 27 tests passed on 2026-09-25.
- The Agent Skills frontmatter and directory validate with the Codex skill-creator `quick_validate.py` script.

## Live workflow and AI check

On 2026-09-25, `gpt-6-luna` with low reasoning effort read `SKILL.md`, used the bundled `discover` and `search` commands to select `uk:Астрономія`, wrote its own manifest, ran `analyze` for 2024-09 through 2026-08, read `metrics.json`, and produced a chart, one-page PDF, and concise interpretation. It did not edit skill files.

The model reported 16,614 prior-year views and 6,708 recent-year views (-59.6%), plus a -46.4% change in topic share. It called the steady decline medium heuristic reliability, noted that September 2024 accounted for 28.2% of the prior year's views, and proposed a related-article and direct-demand validation step. Those statements were checked against `metrics.json`; a separate Wikimedia API request returned 4,687 views for September 2024, matching the saved series.

After review fixes, the same low-cost model ran the final code against today's cached responses and generated fresh `metrics.json`, `chart.svg`, and a one-page PDF without making another live request. It read the metrics and correctly reported 16,614 to 6,708 views (-59.62%), topic share 18.454 to 9.886 per million (-46.43%), 11 falling matched months of 12, full coverage, and medium heuristic reliability due to 28.2% peak-month concentration. These outputs are preserved in `examples/astronomy-output/`. The final Ukrainian report and a synthetic mixed-script report were rendered to PNG and visually checked for clipping, missing glyphs, and overlap. The bundled Noto font licenses are in `assets/`.

The model run tests usability and interpretation; it does not establish that Wikipedia traffic predicts course purchases. The recorded example is a point-in-time dataset and may change if Wikimedia revises historical data.
