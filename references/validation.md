# Validation record

## Automated checks

- `npm ci` installs exact versions from `package-lock.json`. The `.ts` CLI runs directly through pinned `tsx`; `npm run typecheck` uses strict TypeScript with `noEmit`.
- `npm test` exercises calendar windows, matched-year and edition-share growth, missing months, spike handling in either year, steady declines, manifest screening overrides, title resolution, URL and User-Agent validation, cache bypass and expiry, provenance, CLI errors, bounded SVG ticks, unavailable-chart messaging, and one-page PDFs with up to six editions and mixed Arabic, Hebrew, Devanagari, and CJK text. All 27 tests passed on 2026-09-25.
- Node.js 20.20.2 ran all 27 tests and the TypeScript CLI, generating the 24-month metrics, chart, and PDF without a build step.
- The Agent Skills frontmatter and directory validate with the Codex skill-creator `quick_validate.py` script.
- A fresh unzip of `wikipedia-interest-skill.zip` passed `npm ci --omit=dev`, ran the cached `analyze` command to produce all three outputs, then passed a full `npm ci`, `npm run typecheck`, and all 27 tests. Archive integrity passed and the ZIP contains no `node_modules`, `.git`, or transpiled JavaScript.

## Live data and low-cost model check

On 2026-09-25, `gpt-6-luna` with low reasoning effort read `SKILL.md`, used the bundled `discover` and `search` commands to select `uk:Астрономія`, wrote its own manifest, ran `analyze` for 2024-09 through 2026-08, read `metrics.json`, and produced a chart, one-page PDF, and concise interpretation. It did not edit skill files.

The model reported 16,614 prior-year views and 6,708 recent-year views (-59.6%), plus a -46.4% change in topic share. It called the steady decline medium heuristic reliability, noted that September 2024 accounted for 28.2% of the prior year's views, and proposed a related-article and direct-demand validation step. Those statements were checked against `metrics.json`; a separate Wikimedia API request returned 4,687 views for September 2024, matching the saved series.

After the TypeScript conversion, the same low-cost model again used `discover`, `search`, and `analyze` with the `.ts` CLI. It wrote the manifest, read the metrics, and correctly reported 16,614 to 6,708 views (-59.62%), topic share 18.454 to 9.886 per million (-46.43%), 11 falling matched months of 12, full coverage, and medium heuristic reliability due to 28.2% peak-month concentration. This run used cached responses, so it made no new live request. Its manifest and outputs are preserved in `examples/astronomy-output/`.

An intermediate agent run listed `node_modules` while inventorying files, wasting context; another initially wrote an invalid manifest, then recovered by reading the example. The skill now shows the minimum manifest shape, and `.ignore` excludes installed dependencies from `rg --files` even outside a Git repository. In the final low-cost run, the agent wrote a valid manifest on the first try, and its file listing contained zero `node_modules` paths (29 skill paths versus 1,941 paths before the `.ignore` fix).

The TypeScript-produced Ukrainian report and a synthetic mixed-script report were rendered to PNG and visually checked for clipping, missing glyphs, and overlap. The report is one A4 page. The bundled Noto font licenses are in `assets/`.

The model run tests usability and interpretation; it does not establish that Wikipedia traffic predicts course purchases. The recorded example is a point-in-time dataset and may change if Wikimedia revises historical data.
