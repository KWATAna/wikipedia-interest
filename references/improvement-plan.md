# Wikipedia interest: phased improvement plan

## Goal and scope

Make the skill's numbers trustworthy and easy to inspect before making its screening rule more ambitious. Wikipedia pageviews remain a signal of topic attention, not a measure of customers or willingness to pay. Keep the existing `discover`, `search`, and `analyze` commands and the three output files. Each phase should ship and be checked on its own.

The current calculation compares the most recent 12 months with the preceding 12. It sums selected article views, compares that sum with traffic across the whole language edition, checks whether monthly movement is consistent, and screens for promising topics. The phases below improve the inputs and interpretation of that calculation without changing its basic purpose.

## Phase 1 — Stop treating unknown article traffic as zero

**Status:** Implemented and verified on 2026-09-26. See [validation notes](validation.md).

**Why:** A missing response for one selected article may mean that its traffic was unavailable. Today, if another selected article has data, the combined result can still appear complete. That can produce a false decline or an overconfident result.

**Build:**

- Record, for each article and month, whether its views were reported, inferred as zero from a successful response, or unknown because the request failed or returned 404.
- Keep a month unknown in the combined total if any selected article is unknown for that month. Continue to show the counts that were observed, but leave full-year growth and candidate selection unavailable until the needed months are known.
- Add a plain-language flag naming the article and months that need checking. Keep the source URL, status, and retrieval time.

**Done when:** A two-article test in which one article returns 404 cannot produce a complete growth rate or a selected candidate. A successful response that omits a zero-view month still produces zero when the edition month exists. Existing complete-data examples retain their current calculated values.

**Likely files:** `scripts/client.ts`, `scripts/pipeline.ts`, `scripts/core.ts`, `scripts/types.ts`, and their tests.

## Phase 2 — Show the numbers behind every result

**Status:** Implemented and verified on 2026-09-26. See [validation notes](validation.md). Unknown months remain `null`; the PDF names a leading article only when every selected article has a complete recent 12-month series.

**Why:** The current result gives the monthly sum across selected articles and calculated topic share. A reader cannot see each article's contribution or the monthly traffic of the whole language edition in the output file.

**Build:**

- Add each selected article's monthly views, including unknown months, to `metrics.json`.
- Add monthly traffic across the whole language edition to `metrics.json`.
- Preserve the existing combined series and summary fields so current readers and scripts still work. Document the new fields with a small worked example in `README.md` and `SKILL.md`.
- In the PDF, show which article contributes most to recent views and point to `metrics.json` for the full breakdown; keep the PDF readable at one page.

**Done when:** Someone with only `metrics.json` can reproduce both the combined monthly total and the topic's share of edition traffic. A test with one growing article and one falling article makes that disagreement visible. The existing astronomy example still renders correctly.

**Likely files:** `scripts/types.ts`, `scripts/pipeline.ts`, `scripts/report.ts`, `README.md`, `SKILL.md`, and their tests.

## Phase 3 — Check that selected pages represent the same topic over time

**Status:** Implemented and verified on 2026-09-26. See [validation notes](validation.md). Known concept-ID mismatches require a recorded review reason, and known page moves use one historical title per full month. The move month remains unknown and blocks complete growth.

**Detailed plan:** [Phase 3 implementation plan](../docs/superpowers/plans/2026-09-26-wikipedia-interest-phase-3.md).

**Why:** A Wikipedia article can move to a new title, leaving historical requests under an older title. Linked pages across languages can also cover different scopes. Either issue can make a comparison misleading even when the arithmetic is correct.

**Build:**

- Record a shared Wikidata concept identifier when one exists. This is an ID intended to connect pages about the same subject across languages. Show mismatches for human review; matching IDs are supporting evidence, not automatic approval.
- Test historical title handling against a known moved article. Combine old and new title traffic only if the source data supports a non-overlapping history. Otherwise flag the affected months as uncertain and withhold growth rather than inventing a correction.
- Record which titles and time periods contributed to the result so the calculation can be audited.

**Done when:** A saved test case with a page move no longer shows a false drop, or clearly reports that the period cannot be compared reliably. A cross-language mismatch is visible before analysis. Tests guard against counting the same request twice.

**Likely files:** `scripts/client.ts`, `scripts/pipeline.ts`, `scripts/types.ts`, manifest guidance, and their tests.

## Phase 4 — Show whether growth survives a one-month event

**Status:** Implemented and verified on 2026-09-26. The original 12-month screen is unchanged; a separate 11-month check and per-article trends are available in `metrics.json` and summarized in the one-page PDF. See [validation notes](validation.md).

**Detailed plan:** [Phase 4 implementation plan](../docs/superpowers/plans/2026-09-26-wikipedia-interest-phase-4.md).

**Why:** A single news event may account for most of a year's increase. A yearly percentage alone does not show whether interest rose across the rest of the year.

**Build:**

- Find the largest article-traffic month in either year. Remove that calendar month's matched pair from both years and recalculate raw and edition-relative growth over the remaining 11 matched months.
- Show whether each selected article grew or fell separately, so one strong page cannot hide disagreement among proxies.
- Report these as sensitivity checks beside the existing 12-month results; do not silently replace the original calculation.

**Done when:** A test with 11 flat months and one spike shows strong ordinary growth but weak growth after the matched pair is removed. The report names the removed month and states whether the growth direction changes.

**Likely files:** `scripts/core.ts`, `scripts/types.ts`, `scripts/report.ts`, and their tests.

## Phase 5 — Explain screening in ordinary language

**Status:** Implemented and verified on 2026-09-27. See [validation notes](validation.md).

**Implementation plan:** [Phase 5 plan](../docs/superpowers/plans/2026-09-26-wikipedia-interest-phase-5.md).

**Why:** `confidence: high` can describe a steady decline and can sound like confidence in market demand. The current screening result also says which edition won without explaining which editions failed each requirement.

**Build:**

- Label the existing confidence heuristic as **signal quality** in the PDF and written guidance. Keep the existing JSON field for compatibility while adding an explanation of the label.
- Report each edition's screening result and specific reasons for passing or failing: recent volume, signal quality, raw growth, share growth, and monthly direction.
- Require `direction: rising` in the default screen, so an edition with a mixed monthly direction is not selected merely because its annual total rose. Allow an explicit manifest override when the user's research question calls for a different rule.
- State clearly that a selected edition is a lead for further research, and suggest a concrete next validation step.

**Done when:** A reader can tell why each edition was or was not selected without inspecting the code. A steady decline can still have high signal quality but cannot be screened as a growing candidate. Existing manifest overrides remain supported.

**Likely files:** `scripts/core.ts`, `scripts/types.ts`, `scripts/report.ts`, `SKILL.md`, and their tests.

## Phase 6 — Improve speed and output safety when usage justifies it

**Why:** Changing the end month currently requests a new overlapping 24-month range. Also, the CLI writes JSON and SVG before PDF generation, so a PDF error can leave a partial output directory.

**Build:** Cache reusable monthly data or incremental date ranges, with shorter freshness for recent months. Write results to a temporary output directory and publish all three files together only after rendering succeeds.

**Done when:** A follow-up month fetches only data that is new or stale, and a simulated PDF error leaves no misleading partial result. This phase can wait until repeated analyses make the extra complexity worthwhile.

**Likely files:** `scripts/client.ts`, `scripts/wiki-interest.ts`, and their tests.

## Release checks for every phase

1. Add a focused test that demonstrates the problem before changing the implementation.
2. Run `npm run typecheck` and `npm test`.
3. Run the saved astronomy example and inspect `metrics.json`, `chart.svg`, and the one-page PDF. Check that complete-data results change only when the phase intentionally changes a rule.
4. Update `SKILL.md` and `README.md` so an agent and a human interpret new fields the same way.

**Recommended next delivery:** Phase 6 is optional until repeated use makes its added complexity worthwhile.
