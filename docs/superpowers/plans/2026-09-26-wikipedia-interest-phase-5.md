# Wikipedia interest Phase 5 implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task, with a focused failing test before each behavior change. The working tree contains uncommitted work from earlier phases; preserve it and do not stage or commit it as part of Phase 5.

**Status:** Implemented and verified on 2026-09-27 (77 tests passed; see validation notes).

**Goal:** Make the screening decision understandable for every language edition and prevent a mixed monthly trend from winning the default growth screen.

**Architecture:** Keep the existing 24-month calculations. Add one screening assessment per edition with the observed value, rule, pass/fail status, and a short explanation for each check. Use those same assessments to choose and rank eligible editions, so the explanation cannot disagree with `selectedCandidate`. Keep the JSON key `confidence`; call its meaning **signal quality** in user-facing text. Add an explicit monthly-direction override, and put a practical next research step in both `metrics.json` and the PDF.

**Tech stack:** Node.js 20+, TypeScript, Node test runner, existing PDFKit renderer.

**Spec:** [Phase 5 in the improvement plan](../../../references/improvement-plan.md#phase-5--explain-screening-in-ordinary-language).

## In plain language

An **edition** is a language section of Wikipedia, such as `uk` or `pl`. The selected articles in that edition stand in for attention to the topic. The screen checks whether that attention is substantial, measured well enough, and growing. Passing makes an edition a **research lead**, not proof that people want the proposed product.

**Signal quality** describes how dependable the pageview pattern is. The existing JSON field for it is named `confidence`; this name stays for compatibility. A steady fall from 150 to 100 views in each matching month can have **high signal quality**: the data is complete and the decline is consistent. It still fails a growth screen. A high label therefore must never be written as “high confidence in demand.”

The default screen will apply these five checks, in this order:

| Check | Default pass rule | What a failure means |
| --- | --- | --- |
| Recent volume | At least 200 selected-article views in the recent 12 months | Too little observed traffic for this screen, or the total is unknown. |
| Signal quality | `medium` or `high` | Coverage, volume, monthly consistency, or concentration in one month does not meet the existing quality heuristic. |
| Raw growth | Recent selected-article views exceed the preceding 12 months | The article total is flat, falling, or unavailable. |
| Share growth | Selected articles gained views relative to all traffic in that Wikipedia edition | The topic did not gain share within that edition, or the comparison is unavailable. |
| Monthly direction | `rising`: at least 8 of 12 matched months rose | The year-end total may be up, but the rise is not consistent across months. |

For example, a prior year of 100 views in each month totals 1,200. A recent year with six months at 110, five at 90, and one at 200 totals 1,310, or **+9.2%**. Seven matched months rose and five fell, so its existing `direction` is `mixed`. Even if its edition-relative share also rises, the new default screen fails the **monthly direction** check. `screening.requireRisingDirection: false` explicitly turns off that check when the research question calls for annual growth regardless of monthly consistency. The other four checks still apply unless separately overridden.

If several editions pass, preserve the existing order: `high` signal quality first, then higher share growth, then more recent views. When the minimum is overridden to `low`, `medium` and `low` keep the same ranking priority after `high`, as they do now. Exact ties retain manifest order. **Rank 1** means the edition chosen from those that passed; rank 2 also passed but came next. The report must say that another passing edition lost on rank rather than calling it a failure.

## Decisions and compatibility

1. Add `requireRisingDirection: boolean` to the resolved `Screening` type. A manifest that omits it gets `true`; an explicit `false` turns the check off. Reject non-boolean values. Keep `minConfidence`, `requireRawGrowth`, `requireShareGrowth`, and all existing override meanings and defaults. `minConfidence` remains the manifest/JSON key, but its displayed label becomes “minimum signal quality.”
2. Add optional `LanguageResult.screeningAssessment` so older saved metrics still render. It contains `eligible`, `eligibleRank: number | null`, and five ordered checks. Each check records a stable criterion key, `status: 'pass' | 'fail' | 'not-required'`, the observed value (including `null` when unknown), the requirement, and a plain-language explanation. Only required checks can fail eligibility. Rank 1 is `selectedCandidate`; passing lower-ranked editions receive ranks 2, 3, and so on. The exact criterion keys are `recent-volume`, `signal-quality`, `raw-growth`, `share-growth`, and `monthly-direction`.
3. Compute all assessments and the selected edition from **one screening path**. Do not copy the five conditions into the pipeline and report separately. A required percentage of `null` fails; zero does not count as positive growth. Missing `direction` in an old or synthetic result is recorded as `null` and cannot satisfy a required rising check. A disabled check says `not-required`, not `pass`.
4. Add optional `Analysis.nextValidationStep` for older-metrics compatibility. For a selected edition, recommend interviewing five potential users in the language audience about the topic, then testing sign-up intent with a small landing page. If no edition passes, recommend asking five potential users whether the chosen articles represent the problem, then revising the proxies before rerunning. The wording must not turn a Wikipedia edition into a country or imply that pageviews establish product demand.
5. The PDF shows a compact screening outcome for **every** edition: selected, passed but lower-ranked, or failed with its specific failed checks. The full observed values, thresholds, and explanations remain in `metrics.json`. Retain the existing recent leading article and opposing article-trend summaries. Saved metrics without Phase 5 fields must say that per-edition screening details were not recorded; do not recalculate a new rule and present it as the old decision.

## Global constraints

- Preserve `discover`, `search`, and `analyze`, the three output files, the 24-month period, current arithmetic, Phase 1–4 provenance and diagnostics, and support for one to six editions.
- The new monthly-direction requirement intentionally changes **default selection only**. It does not change `direction`, `confidence`, raw growth, share growth, or the 11-month sensitivity figures.
- Keep the PDF to one A4 page through six editions. Use concise, readable reason labels in the PDF and full explanations in `metrics.json`; never silently omit a failed check because of limited space.
- Treat selected articles as a proxy for topic attention. Document that a selected edition is a lead to test with people, not a launch or revenue recommendation.
- Use local fixtures for tests. A live Wikimedia validation run, if needed, must follow the existing operator-contact rule.

## File map

| File | Responsibility |
| --- | --- |
| `scripts/types.ts` | Add the direction override, screening assessment shapes, and optional next-step field. |
| `scripts/core.ts` | Validate the override; assess and rank editions from a single set of checks. |
| `scripts/pipeline.ts` | Attach assessments and the next step to the generated analysis. |
| `scripts/format.ts` | Share percentage formatting so small nonzero growth remains visible in explanations and the PDF. Added after final review. |
| `scripts/report.ts` | Display signal quality, all edition outcomes, ranking, and the next step in the PDF. |
| `tests/core.test.mjs`, `tests/pipeline.test.mjs`, `tests/report.test.mjs` | Cover decision logic, JSON integration, legacy data, and report layout. |
| `README.md`, `SKILL.md`, `references/validation.md`, `references/improvement-plan.md` | Explain the screen in ordinary language and record release checks. |

## Review focus

1. A **high-quality steady decline** must show high signal quality but fail the growth and direction checks; the default screen must not select it.
2. **Positive annual growth with mixed monthly direction** must fail by default and be eligible when `requireRisingDirection: false` and the other required checks pass.
3. Disabled checks must say **not required**. Unknown required values must fail, not become zero or a pass.
4. Every edition's assessment, eligible rank, and `selectedCandidate` must agree, including when two editions pass and when none pass.
5. A six-edition PDF must remain one readable page, show every edition's failed checks or passing rank, keep its article information, and give a next validation step. Old saved metrics must render without a made-up Phase 5 assessment.

---

### Task 1: Add and validate the monthly-direction override

**Files:** Modify `scripts/types.ts`, `scripts/core.ts`, `tests/core.test.mjs`.

**Interface:** `Screening.requireRisingDirection: boolean`, default `true`; the manifest key is `screening.requireRisingDirection`.

- [x] Add a failing manifest test that omission yields `true`, explicit `false` is preserved, and strings or numbers are rejected. Run `node --import tsx --test tests/core.test.mjs` to confirm the intended failure.
- [x] Extend `parseManifest` and `Screening`. Keep all four existing screening fields and defaults unchanged.
- [x] Run `node --import tsx --test tests/core.test.mjs` and `npm run typecheck`; both must pass. Update synthetic candidate fixtures with `direction` in Task 2, when screening starts consuming it.

### Task 2: Explain every check and select from the same results

**Files:** Modify `scripts/types.ts`, `scripts/core.ts`, `tests/core.test.mjs`.

**Interfaces:** Add `ScreeningCriterion = 'recent-volume' | 'signal-quality' | 'raw-growth' | 'share-growth' | 'monthly-direction'`, `ScreeningCheck = { criterion: ScreeningCriterion; status: 'pass' | 'fail' | 'not-required'; observed: number | Confidence | Direction | null; requirement: string; explanation: string }`, and `ScreeningAssessment = { eligible: boolean; eligibleRank: number | null; checks: ScreeningCheck[] }` in `scripts/types.ts`. Extend `CandidateMetric` to include `direction`. Export `assessScreening(result: CandidateMetric, criteria: Screening): ScreeningAssessment` and `screenCandidates(results: CandidateMetric[], options: Partial<Screening> = {}): Array<{ language: string; assessment: ScreeningAssessment }>` from `scripts/core.ts`. `screenCandidates` uses the existing defaults for four checks plus `requireRisingDirection: true`; it returns all editions in input order, with ranks filled for eligible ones. Keep `selectCandidate(results, options): string | null` as a wrapper that returns the rank-1 language.

- [x] Write failing tests for the steady decline (150 to 100 each month, high signal quality) and the mixed-direction growth example above, using unchanged edition-wide traffic in both cases so share growth has a clear sign. Assert all five statuses and explanations, plus the default `selectedCandidate: null` where each is the sole edition.
- [x] Run `node --import tsx --test tests/core.test.mjs` and confirm the new tests fail for the expected missing behavior.
- [x] Implement `assessScreening` with the five checks in the stated order; return `eligibleRank: null` before ranking. A disabled rule gets `not-required` even if its observed value is poor.
- [x] Implement `screenCandidates` to rank eligible assessments using the existing `high`-first/share-growth/recent-views order, with manifest order on exact ties. Make `selectCandidate` return rank 1 or `null` from that same result.
- [x] Add tests for positive growth with `direction: rising`, threshold equality at 200 recent views, `null` growth, and explicit `false` overrides. Check missing `direction` fails a required rising check.
- [x] Add a two-passers test: both assessments say `eligible`, one is selected, the other has rank 2. Add a no-passers test. Assert the chosen edition always has rank 1 and exact ties retain manifest order.
- [x] Run focused tests and `npm run typecheck`; inspect the diff before proceeding.

### Task 3: Put assessments and a next step in `metrics.json`

**Files:** Modify `scripts/pipeline.ts`, `scripts/types.ts`, `tests/pipeline.test.mjs`.

**Interfaces:** `LanguageResult.screeningAssessment?: ScreeningAssessment`; `Analysis.nextValidationStep?: string`. Export `suggestNextValidationStep(topic: string, selectedCandidate: string | null): string` from `scripts/pipeline.ts` for focused tests. `analyze` obtains the candidate and all per-edition assessments from one `screenCandidates` call.

- [x] Write a failing local-pipeline test with passing, failing, and lower-ranked editions. Assert `results[].screeningAssessment` contains all five checks, exact observed values and thresholds, readable explanations, eligible ranks, and agreement with `selectedCandidate`. Include one explicit direction override.
- [x] Run `node --import tsx --test tests/pipeline.test.mjs` to confirm the expected failure.
- [x] Attach the `screenCandidates` assessments to the results and use its rank-1 result for `selectedCandidate`.
- [x] Add `suggestNextValidationStep` and write a test for selected and no-selected cases. Attach its output to `Analysis.nextValidationStep`.
- [x] Add `methodology.signalQuality` explaining that `confidence` is the existing heuristic and does not measure customer demand; keep `methodology.reliability` for existing consumers.
- [x] Run focused tests, `npm run typecheck`, and `npm test`. Confirm existing totals and Phase 4 sensitivity values are unchanged in complete-data fixtures.

### Task 4: Make the PDF decision readable

**Files:** Modify `scripts/report.ts`, `tests/report.test.mjs`.

**Interface:** Export `screeningOutcomeLabel(result: LanguageResult): string` for report tests. It returns selected/pass-lower-rank/fail labels from the saved assessment; when the field is absent, it returns “screen details not recorded.” The PDF reads `Analysis.nextValidationStep` when present and uses a clear legacy fallback when absent.

- [x] Write failing tests for a selected edition, a passing lower-ranked edition, and editions failing different combinations of checks. Test that the report calls `confidence` **signal quality**, shows the new direction rule or its override, and names a next validation step.
- [x] Run `node --import tsx --test tests/report.test.mjs` and confirm the intended wording/layout tests fail.
- [x] Rename the PDF table's “Reliability” column and methodology sentence to “Signal quality.” Keep the table's existing numbers and 11-month check. Show a short outcome and failed-check labels beside each edition's article information; show “passed, lower rank” for an eligible non-winner. State the ranking rule in the report. Keep the complete explanation in `metrics.json`.
- [x] Give the next step its own visible line. Adjust `pdfLayout` and vertical spacing as needed so the source rows can hold both the existing article summary and the screening outcome. Verify the six-edition limit on one page without text overlap, clipping of fail reasons, or loss of source links. For saved metrics lacking assessments or the direction override, show a clear “screen details not recorded” fallback rather than inventing a current-rule result.
- [x] Render selected, no-selected, mixed-direction, steady-decline, six-edition, multilingual, and saved astronomy reports. Visually inspect the PDF and verify the page count. Run report tests, typecheck, and the full test suite.

### Task 5: Update guidance and verify the release

**Files:** Modify `README.md`, `SKILL.md`, `references/validation.md`, `references/improvement-plan.md`.

- [x] Explain the five checks with the high-quality decline and mixed-direction growth examples. Distinguish `confidence` in JSON from the user-facing **signal quality** label, explain `requireRisingDirection: false`, and describe rank 1 versus another edition that also passes.
- [x] Document `results[].screeningAssessment`, `nextValidationStep`, old-result behavior, and how to describe a chosen edition as a research lead. Update the skill's response guidance to cite the failed checks and suggest a concrete validation action.
- [x] Run `npm run typecheck`, `npm test`, and `git diff --check`. Inspect controlled `metrics.json`, `chart.svg`, and the rendered one-page PDF; confirm the chart and earlier-phase calculations did not change. Record the outcomes in `references/validation.md` and mark Phase 5 implemented only after verification. If a distributable ZIP is part of this delivery, rebuild it from project files and verify its contents.

## Completion rule

Phase 5 is complete when each edition has a visible pass/fail explanation, the selected edition is rank 1 among those that passed, a consistent decline can retain high signal quality without being called a growing candidate, and a positive annual total with mixed monthly direction is excluded unless the manifest explicitly disables that check. The PDF remains one page and says what to validate next.
