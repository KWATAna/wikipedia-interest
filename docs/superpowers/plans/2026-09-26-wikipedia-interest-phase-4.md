# Wikipedia interest Phase 4 implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task with tests first. The current branch contains uncommitted earlier-phase work; preserve it and do not stage or commit it as part of Phase 4.

**Status:** Implemented and verified on 2026-09-26 (66 tests passed; see validation notes).

**Goal:** Show whether apparent growth survives removing the largest selected-article traffic month and its matching month a year apart, while exposing each selected article's own trend.

**Architecture:** Add pure diagnostic calculations beside the existing 12-month arithmetic. `evaluateLanguage` attaches an 11-month sensitivity check and per-article trends to each edition result; it does not change the existing totals, reliability label, screening rules, or `selectedCandidate`. The PDF shows a compact comparison, and `metrics.json` holds every exact value and article trend.

**Tech stack:** Node.js 20+, TypeScript, Node test runner, existing PDFKit renderer.

**Spec:** [Phase 4 in the improvement plan](../../../references/improvement-plan.md#phase-4--show-whether-growth-survives-a-one-month-event).

## In plain language

Suppose selected articles received 100 views in each month of 2025. In 2026 they again received 100 in every month except June, when they received 1,100. The ordinary totals are 1,200 versus 2,200 views: **+83.3%**. To check how much that result depends on June, remove **June 2025 and June 2026**, then compare the remaining 11 months in each year: 1,100 versus 1,100, or **0%**. The original +83.3% remains visible; the 0% is a second calculation that warns that one month drove the increase.

The edition-relative version makes the same exclusion from the selected-article totals **and** the whole-edition totals before calculating views per million. An individual article may rise while another falls, even when their combined traffic looks flat, so every selected article also gets its own prior/recent views and direction.

| Evidence | Planned interpretation |
| --- | --- |
| Ordinary growth is positive; 11-month growth is flat or negative | The increase depends on the excluded month; investigate the event before treating it as a durable trend. |
| Both ordinary and 11-month growth are positive | The result survives this one-month check; it still does not prove customer demand. |
| An article or edition month is unknown | Do not calculate an 11-month growth figure from partial data. |
| An article's prior year has zero views | Show its counts and direction, but leave percentage growth unavailable. |

## Calculation decisions

1. Use the **combined selected-article** `monthlyViews` series, not each article's separate maximum or the existing `peakMonthShare` ratio, to choose the largest absolute month among the 24 months. On a tie, choose the first occurrence in chronological order. If that month is in the prior year, exclude it and its corresponding month in the recent year; if it is in the recent year, exclude the corresponding prior-year month too. Record the trigger month and both excluded `YYYY-MM` months.
2. Require all 24 combined article months and all 24 whole-edition months to be known before choosing a peak or calculating sensitivity. A Phase 3 move month remains unknown and therefore blocks the sensitivity check. If all selected-article counts are zero, report `zero-traffic` instead of pretending a particular month was a spike.
3. Sum the remaining 11 selected-article months and the remaining 11 edition months in each year. Compute raw growth as `(recent / prior - 1) × 100` and share as `article views / edition views × 1,000,000`. Compute share growth from those two 11-month shares. If the remaining prior article total is zero, keep the absolute counts but leave both growth percentages and direction-change claims unavailable (`zero-baseline`).
4. Compare the signs of each ordinary 12-month growth percentage and its 11-month equivalent: positive, zero, or negative. `rawDirectionChanged` and `shareDirectionChanged` are `true` when the signs differ, `false` when they agree, and `null` when either percentage is unavailable. A change from positive to zero counts as a changed direction for this check.
5. For each selected article, use its finalized `articleMonthlyViews` series. If all 24 article months are known, report prior/recent totals and `rising`, `falling`, or `flat` from the totals. Percentage growth is `null` when its prior total is zero. If any of that article's months is unknown, its totals, percentage, and direction are unavailable; another complete article can still have a trend. A missing edition month does not erase a reported article count, but an omitted article month cannot be inferred as zero without the edition month.

## Global constraints

- Preserve `discover`, `search`, and `analyze`, the three output files, the 24-month window, string article entries, current screening fields, and existing JSON field meanings.
- The sensitivity check is diagnostic. Do not replace the 12-month totals or quietly change `confidence`, `direction`, or `selectedCandidate`; Phase 5 handles screening changes.
- Unknown months remain `null`. Never choose a peak from partial combined traffic or calculate growth from fewer than 11 matched months.
- Keep the PDF one A4 page through the six-edition limit. Put the complete article list, exclusion pair, calculations, and unavailable reasons in `metrics.json`; use concise PDF summaries with a clear `metrics.json` pointer when space is tight.
- Read older saved astronomy metrics defensively: absence of Phase 4 fields means the report must render without claiming a sensitivity check was performed. Tests use saved data or local fakes, with no live Wikimedia request.
- Preserve the existing operator-contact rule if a later validation run uses live Wikimedia data.

## File map

| File | Responsibility |
| --- | --- |
| `scripts/diagnostics.ts` (new) | Pure paired-month exclusion and per-article trend calculations. |
| `scripts/types.ts` | Add optional result fields and exact diagnostic shapes. |
| `scripts/core.ts` | Attach the new diagnostics after the existing monthly and annual calculations. |
| `scripts/report.ts` | Show a compact 12-month versus 11-month comparison, excluded month, and article disagreement without overflowing the PDF. |
| `tests/diagnostics.test.mjs`, `tests/core.test.mjs`, `tests/report.test.mjs` | Formula, integration, edge-case, and report regression checks. |
| `README.md`, `SKILL.md`, `references/validation.md`, `references/improvement-plan.md` | Explain the new check and record verification. |

## Review focus

Each risk has a named test in the task that owns it:

1. A spike in the **prior** year must remove the matching recent month, not just the trigger month (Task 1).
2. An equal maximum in several months must always choose the first chronological occurrence (Task 1).
3. A missing article or edition month, including a Phase 3 move month, must not create an apparently complete 11-month figure (Tasks 1 and 2).
4. A zero prior total after exclusion must not become infinity or a made-up percentage (Task 1).
5. Opposing article trends must remain visible when their combined 12-month growth is flat, and a long six-edition report must remain legible (Tasks 2 and 3).

---

### Task 1: Calculate the paired-month sensitivity check

**Files:** Create `scripts/diagnostics.ts`, `tests/diagnostics.test.mjs`; modify `scripts/types.ts`.

**Interfaces:** Add optional `LanguageResult.peakPairSensitivity?: PeakPairSensitivity` for legacy metrics compatibility. `PeakPairSensitivity` contains `status: 'available' | 'incomplete-data' | 'zero-traffic' | 'zero-baseline'`, `peakMonth: string | null`, `excludedMonths: { prior: string; recent: string } | null`, 11-month `viewsPrior`, `viewsRecent`, `viewsYoyPct`, `sharePriorPerMillion`, `shareRecentPerMillion`, `shareYoyPct` (each nullable), and nullable `rawDirectionChanged`/`shareDirectionChanged`. Export `calculatePeakPairSensitivity(months: string[], selectedViews: NullableMonthlySeries, editionViews: NullableMonthlySeries, ordinaryRawYoY: number | null, ordinaryShareYoY: number | null): PeakPairSensitivity` from `scripts/diagnostics.ts`.

- [x] Write a failing test for the 2025/2026 June example above: 12-month raw and share growth are +83.333…%; `peakMonth` is `2026-06`; exclude `2025-06` and `2026-06`; 11-month totals are 1,100 and 1,100; both growth percentages are 0; both direction-change flags are `true`.
- [x] Run `node --import tsx --test tests/diagnostics.test.mjs` and confirm it fails because the diagnostic does not exist.
- [x] Implement the pure calculation, then rerun the focused test to green. Use the same percentage and per-million formulas as `evaluateLanguage`; compare percentage signs only when both values are finite.
- [x] Add tests for a prior-year maximum, ties, incomplete article traffic, an unknown edition month, all-zero traffic, and an 11-month prior total of zero. Confirm missing data yields `incomplete-data`, all-zero traffic yields `zero-traffic`, and zero baseline keeps counts but returns `null` percentages and change flags.
- [x] Run focused tests and `npm run typecheck`; inspect the diff before continuing.

### Task 2: Show individual article trends and attach diagnostics

**Files:** Modify `scripts/diagnostics.ts`, `scripts/types.ts`, `scripts/core.ts`; test `tests/diagnostics.test.mjs`, `tests/core.test.mjs`.

**Interfaces:** Add optional `LanguageResult.articleTrends?: ArticleTrend[]`. `ArticleTrend` has `title`, nullable `viewsPrior`, `viewsRecent`, `viewsYoyPct`, and `direction: 'rising' | 'falling' | 'flat' | 'unavailable'`. Export `calculateArticleTrends(months: string[], articleMonthlyViews: Record<string, NullableMonthlySeries>): ArticleTrend[]` from `scripts/diagnostics.ts`. `evaluateLanguage` calls both new functions after it builds the finalized per-article, combined, and edition monthly series.

- [x] Write a failing test with `Rising` (1,200 to 1,920 views) and `Falling` (1,200 to 480 views): combined 12-month growth is 0%, while the article trends are +60% and -60%, with opposite directions. Assert existing `viewsYoyPct`, `confidence`, and `selectedCandidate` behavior is unchanged.
- [x] Run `node --import tsx --test tests/core.test.mjs` and confirm failure is only the missing new output.
- [x] Implement per-article totals and direction in `scripts/diagnostics.ts`; call both diagnostics from `evaluateLanguage` and include them in `LanguageResult`. Keep existing arithmetic and screening calls intact.
- [x] Add tests for a single unknown article month (only that article trend unavailable), an article rising from zero (counts and direction present, percentage `null`), a missing edition month with article counts present, and a Phase 3 move-month `null` preventing the sensitivity check.
- [x] Run focused tests, `npm run typecheck`, and `npm test`; all pass before changing the report.

### Task 3: Fit the comparison and article disagreement in the one-page PDF

**Files:** Modify `scripts/report.ts`, `tests/report.test.mjs`.

**Interfaces:** Keep the existing six table measures and source links. Add concise renderer helpers for the 11-month result and article directions; use the optional fields so saved older metrics render as before. The PDF names the excluded calendar-month pair or trigger month, identifies when ordinary growth changes direction after exclusion, and points to `metrics.json` for all article-level values.

- [x] Write failing report-helper tests for: ordinary +83.3% versus 11-month 0% after June 2025/2026; a prior-year spike; opposing `Rising`/`Falling` article directions; sensitivity unavailable due to a move month; and legacy metrics without the new fields. Assert the wording distinguishes the original 12-month result from the 11-month check.
- [x] Run `node --import tsx --test tests/report.test.mjs` and confirm the new wording tests fail for the intended missing behavior.
- [x] Keep the six existing PDF table measures and add a seventh `11m raw/share` column. Put the two 11-month growth percentages on its first line and the excluded calendar month/year pair on its second line; mark unavailable values `n/a`. In the article label area, name opposing articles and directions when they fit (for example, `Rising +60% · Falling -60%`); otherwise show direction counts and point to `metrics.json`. Preserve the existing top recent article summary on the right and the source links. Keep row height within the existing layout or adjust `pdfLayout` with an explicit six-edition spacing check so the A4 page has no clipped or overlapping text.
- [x] Render focused complete, spike-sensitive, incomplete, legacy astronomy, and six-edition reports. Check the visible text, table spacing, source links, and one-page count; keep `chart.svg` unchanged.
- [x] Run `node --import tsx --test tests/report.test.mjs`, then `npm run typecheck` and `npm test`; all pass.

### Task 4: Teach the skill and verify a release

**Files:** Modify `README.md`, `SKILL.md`, `references/validation.md`, `references/improvement-plan.md`; inspect `examples/astronomy-output/`.

- [x] Explain “remove the largest month and the same month a year apart” with the 100/1,100-view example, the 11-month article and edition denominators, and why this is a sensitivity check rather than a replacement score. Explain per-article directions, `null` percentages from zero baselines, and why a selected candidate can still depend on one event.
- [x] Document the exact `peakPairSensitivity` and `articleTrends` fields and the PDF's compact-versus-JSON detail rule. Keep the saved astronomy metrics identified as an older result without Phase 4 fields.
- [x] Run `npm run typecheck`, `npm test`, and `git diff --check`. Inspect a controlled `metrics.json`, `chart.svg`, and rendered `report.pdf`; confirm old metrics still render and no live Wikimedia requests were made for tests.
- [x] Update Phase 4 status and validation notes only after the checks pass. If shipping the ZIP with the code, rebuild it from project files, exclude dependencies and Git internals, and verify archive contents byte for byte.

## Completion rule

The phase is complete when a one-month spike can no longer appear as broad growth without an accompanying 11-month check, every selected article's own direction is inspectable, missing data cannot produce a false sensitivity result, the ordinary screen stays unchanged, and the PDF remains readable at the supported edition limit.
