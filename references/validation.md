# Validation record

## Phase 5 checks (2026-09-27)

- `npm run typecheck`, `git diff --check`, and all 77 tests passed. The new cases cover the rising-direction default and explicit override, rejection of a `null` override, a high-quality steady decline, positive annual growth with mixed monthly direction, unknown and disabled checks, ranking of multiple passing editions, and tiny nonzero growth that must not print as `+0.0%`.
- A controlled local analysis wrote `metrics.json`, `chart.svg`, and a one-page PDF without live Wikimedia requests. Both editions in `metrics.json` had five screening checks; the selected edition had rank 1, while the other showed its failed checks. The SVG parsed, and the PDF had one page. A separate six-edition report showed selected, lower-ranked, mixed-direction, declining, low-volume, and low-quality outcomes on one readable page.
- Selected, no-selected, six-edition, Arabic-next-step, and saved astronomy PDFs were rendered and visually checked for clipping and overlap. The Arabic validation action rendered with the appropriate font. The saved astronomy metrics rendered without a made-up Phase 5 assessment or direction rule, labeling those details as unrecorded.
- A read-only review found two issues: explicit `null` initially bypassed the direction-override validator, and a tiny positive growth rate printed as `+0.0%` while passing. Both were reproduced with failing tests, fixed, and rechecked with the full suite.

## Phase 4 checks (2026-09-26)

- `npm run typecheck`, `git diff --check`, and all 66 tests passed. Focused tests cover a recent-year spike, a prior-year spike, tied peaks, missing article and edition months, all-zero traffic, a zero 11-month prior baseline, opposing article trends, and a complete article despite a missing edition month.
- A controlled June spike gives 1,200 to 2,200 ordinary views (+83.3%). Removing June 2025 and June 2026 gives 1,100 to 1,100 (0%) and the same 0% edition-relative share change. `metrics.json` records the excluded pair, both 11-month totals and shares, changed-direction flags, and each selected article's trend. Another controlled case kept `selectedCandidate: "en"` under the existing screen while its 11-month growth turned negative; the report headline named that sensitivity. The screen and 12-month values were not changed.
- The controlled `chart.svg` rendered a valid SVG. Complete, spike-sensitive, incomplete, six-edition/six-article, and saved legacy metrics rendered as one-page A4 PDFs. The latest spike, six-edition, and legacy pages were visually checked for table spacing, legibility, and clipping. The legacy report says the 11-month check was `not run`, without inventing Phase 4 fields. No live Wikimedia requests were made.

## Phase 3 checks (2026-09-26)

- `npm run typecheck` passed and `npm test` passed all 53 tests. The new tests cover Wikidata ID matching and mismatch review before any pageview request, missing IDs, redirect versus normalization, paginated move logs, filtering by the moved page's `logpage`, a broken title chain, and a failed or incomplete move lookup.
- A saved event for enwiki page ID `9988187` moves `Twitter` to `X (social network)` on 2026-02-25. A controlled 24-month analysis uses the old title through January, marks February `null`, and uses the new title from March. Even when both fake API responses contain counts for every month, each month accepts at most one title. The unknown month blocks complete growth and candidate selection. The output records concept IDs, move evidence, lookup URLs, and title-specific traffic ranges in `metrics.json`.
- Complete and moved-page reports, plus a re-render of the saved astronomy metrics, were generated and visually inspected as legible one-page A4 PDFs. The moved-page PDF explains why growth is unavailable; the legacy astronomy PDF renders without inventing new audit fields. The controlled run also produced a valid `chart.svg`. No fresh Wikimedia request was made; the move fixture cites its retrieval date and source URLs.

## Phase 2 checks (2026-09-26)

- `npm run typecheck` passed and `npm test` passed all 39 tests. A two-article case exposes one rising and one falling article even when their combined count is flat; its edition denominator reproduces the share of 100 selected-article views per million edition views. Tests also verify reported counts, inferred zeroes, unknown article months, and missing edition months in the new breakdown fields.
- The PDF names the largest recent article when every selected article has 12 known recent months, and says the comparison is incomplete when one count is unknown. The existing combined values, screening rule, and selected candidate behavior are unchanged.
- Complete and incomplete two-article reports and the saved astronomy metrics were rendered as one-page A4 PDFs and visually inspected. The astronomy metrics predates the new breakdown fields, so its re-rendered PDF labels article comparison incomplete. No fresh Wikimedia request was made because no operator contact was configured.

## Phase 1 checks (2026-09-26)

- `npm run typecheck` passed and `npm test` passed all 37 tests. The new cases cover a 404 for one of two selected articles, an omitted zero-view month in a successful response, exhausted 503 and network requests, an authorization failure, selection of a complete edition while another is unavailable, and preservation and flagging of observed article counts when edition traffic is missing.
- The 404 case leaves complete growth and candidate selection unavailable while preserving observed counts from the other article. New analyses label each article month `reported`, `zero`, or `unknown` and retain the request URL, status, and retrieval time.
- A report generated from the saved astronomy metrics and a synthetic unavailable-data variant both rendered as one A4 page. Their headings and methodology text were visually checked. No fresh Wikimedia request was made for these checks.

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
