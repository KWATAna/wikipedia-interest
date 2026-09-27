# Wikipedia interest Phase 3 implementation plan

> **For agentic workers:** Use the test-first workflow in `superpowers:executing-plans` to implement this plan task by task. The current branch has uncommitted Phase 1 and 2 changes; preserve them and do not stage or commit them as part of a Phase 3 task.

**Status:** Implemented and verified on 2026-09-26 (53 tests passed; see validation notes).

**Goal:** Make concept mismatches and verified page moves visible before they can produce a misleading 24-month growth result.

**Architecture:** Resolve all selected pages and their Wikidata IDs before fetching traffic. Compare IDs across editions and pause on a known mismatch unless the manifest records a review reason. For a known former title, use the page move log and stable page ID to assign each full month to one title; mark the move month unknown, then pass the resulting nullable series to the existing calculations. Keep the old output fields and add an audit trail for the titles and periods used.

**Tech stack:** Node.js 20+, TypeScript, existing Wikimedia client, Node test runner, PDFKit.

**Spec:** [Phase 3 in the improvement plan](../../../references/improvement-plan.md#phase-3--check-that-selected-pages-represent-the-same-topic-over-time).

## In plain language

The **Wikidata ID** is a shared concept label attached to a Wikipedia page. Imagine that the selected page in one language edition has **ID A**, while the selected page in another has **ID B**. Because the IDs differ, the pages may describe different concepts and need human review. If both pages have **ID A**, they are linked to the same Wikidata concept, but a human still checks whether their actual article content fits the research question. Real Wikidata IDs have a `Q` followed by digits; A and B here are only labels for the example.

A **page move** changes an article's title while keeping its page ID. The pageview API requests traffic by title. For example, the English Wikipedia article with page ID `9988187` moved from `Twitter` to `X (social network)` on 2026-02-25. A current-title-only request can therefore miss earlier traffic. The move log's `logpage`, rather than its `pageid`, identifies the page moved in this example. The [old-title series](https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/Twitter/monthly/20240901/20260831) and [new-title series](https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/all-access/user/X_%28social_network%29/monthly/20240901/20260831) both contain views around the move, so the move month cannot be assigned safely from monthly totals alone. See the [page move rule](https://www.mediawiki.org/wiki/Manual:Page_moving), [move log API](https://www.mediawiki.org/wiki/API:Logevents), and the [verified move event](https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&list=logevents&letype=move&letitle=Twitter&leprop=ids%7Ctitle%7Ctype%7Ctimestamp%7Cdetails&lelimit=50).

| Evidence found | Planned result |
| --- | --- |
| Selected pages have the same known concept ID | Continue and still review whether article scope fits the topic. |
| Selected pages have different known concept IDs | Pause before traffic collection until the manifest explains the intentional choice or pages are changed. |
| A page has no concept ID | Show that the concept comparison is unverified; do not infer a match or mismatch. |
| A move log proves one title owned a full month | Use that title's views for the month and record its source. |
| A month contains a move or the title chain cannot be proved | Use `null` for affected months; withhold complete-window growth and candidate selection for that edition. |

## Global constraints

- Preserve the three commands (`discover`, `search`, `analyze`), three output files, 24-month window, current screening fields, and string article entries in existing manifests.
- Continue Phase 1's rule: unknown article months are `null`, never invented zeroes. An unknown month blocks complete-window growth and candidate selection for that edition.
- Never add two title series for the same article in one month. A title is assigned only when a verified move chain says it represented that page for the whole month.
- A Wikidata match supports page selection but does not prove equivalent article scope or customer demand. A missing Wikidata ID is unknown evidence, not a mismatch.
- Use the existing operator-contact rule for live Wikimedia requests. Tests use saved responses or local fakes. The current saved astronomy metrics predates Phase 1 and 2 fields, so its report must keep rendering without pretending to have new evidence.
- This phase checks **known former titles**: a selected title that redirects to the current page, or optional former titles supplied in the manifest. It does not claim to discover every historical title automatically.

## File map

| File | Responsibility |
| --- | --- |
| `scripts/client.ts` | Resolve Wikidata ID; retrieve and validate paginated move-log evidence. |
| `scripts/title-history.ts` (new) | Turn verified move events into one title assignment or `null` per month. |
| `scripts/core.ts`, `scripts/types.ts` | Validate optional manifest review/history fields and define additive output types. |
| `scripts/pipeline.ts` | Run concept preflight, retrieve title-specific traffic, feed one nullable series per selected page into existing calculations, and save provenance. |
| `scripts/report.ts` | Name concept-review and move-month uncertainty briefly in the one-page PDF. |
| `tests/client.test.mjs`, `tests/core.test.mjs`, `tests/title-history.test.mjs`, `tests/pipeline.test.mjs`, `tests/report.test.mjs` | Focused regression checks. |
| `README.md`, `SKILL.md`, `references/validation.md` | Explain review, former-title hints, audit fields, and verified behavior. |

## Review focus

Each risk below gets a test in the task that owns it:

1. A move log entry for a different page at the same title must not be accepted; compare `logpage` with the resolved page ID (Task 2).
2. A move in the middle of a month must leave that month unknown and prevent a complete growth figure (Tasks 2 and 3).
3. Two titles must never contribute to the same article-month, even when both APIs report views (Tasks 2 and 3).
4. A known cross-edition ID mismatch must stop before any pageview request unless the manifest contains a review reason (Task 1).
5. A missing ID, failed move lookup, incomplete pagination, or broken move chain must not be presented as verified history (Tasks 1–3).

---

### Task 1: Resolve concept IDs and review selected pages before traffic

**Files:** Modify `scripts/client.ts`, `scripts/core.ts`, `scripts/types.ts`, `scripts/pipeline.ts`; test `tests/client.test.mjs`, `tests/core.test.mjs`, `tests/pipeline.test.mjs`.

**Interfaces:** `ArticleResolution.wikidataId: string | null`; `Manifest.conceptMismatchRationale?: string`; `SourceArticle.wikidataId: string | null`; `Analysis.conceptCheck` records each title/ID, missing IDs, mismatches, and the supplied review reason. Existing manifest strings remain valid.

- [x] Write client tests: `resolveArticle` requests `prop=info|pageprops&ppprop=wikibase_item`, returns `Q918` for the saved API shape, and returns `null` if the property is absent. Verify the source URL remains recorded.
- [x] Run `node --import tsx --test tests/client.test.mjs`; confirm the new assertions fail because the ID is missing.
- [x] Extend `resolveArticle` and its response types; run the focused test until it passes.
- [x] Write manifest and pipeline tests: two editions with different known IDs cause a descriptive preflight error and **zero** traffic requests; a nonempty `conceptMismatchRationale` lets the same manifest continue and is saved in `conceptCheck`; matching IDs continue; a missing ID is marked unverified and continues. Reject a blank review reason.
- [x] Run `node --import tsx --test tests/core.test.mjs tests/pipeline.test.mjs`; confirm the new cases fail for the intended missing behavior.
- [x] Resolve every selected page first in `runAnalysis` and only then request pageviews. Compare sorted ID sets across editions only when **every** selected page has an ID; known set differences require the recorded review reason. An incomplete set produces an unverified warning, not a claimed match or mismatch. Store IDs in `sources` and `conceptCheck`; keep `selectedCandidate` rules unchanged.
- [x] Run the focused tests, then `npm run typecheck` and `npm test`; all pass. Review the diff without staging the pre-existing Phase 1 and 2 changes.

### Task 2: Establish move evidence and assign full months to one title

**Files:** Modify `scripts/client.ts`, `scripts/core.ts`, `scripts/types.ts`; create `scripts/title-history.ts`; test `tests/client.test.mjs`, `tests/core.test.mjs`, `tests/title-history.test.mjs`; save a small evidence fixture under `tests/fixtures/`.

**Interfaces:** `ManifestEdition.formerTitles?: Record<string, string[]>` maps a selected article title to known older titles. `ArticleResolution.redirectFrom: string[]` records actual redirect source titles from `query.redirects`, separately from capitalization/spacing normalization. `WikimediaClient.fetchMoveEvents(language, formerTitle, pageId)` returns matching events, URL, and whether all pages of API results were retrieved. `assignMonthlyTitles(currentTitle, pageId, formerTitles, events, months)` returns a title or `null` for each month, move events, and the reason for each unknown month.

- [x] Save a minimal source fixture for enwiki page ID `9988187`: `Twitter` to `X (social network)` on `2026-02-25T18:17:19Z`, log ID `177838394`, `logpage=9988187`, and a decoy event whose `pageid` matches but `logpage` does not. Include source URLs and retrieval date. The fixture is evidence for parsing, not a promise that live counts never change.
- [x] Write client tests for real redirect versus simple title normalization, move-log URL parameters, `continue` handling, `logpage` filtering, and a failed or unfinished lookup. Write manifest tests that accept optional nonduplicate `formerTitles` only for selected article titles and keep existing string-only manifests valid.
- [x] Run the focused tests and confirm they fail on the missing method/validation. Implement the fetch and parser using the existing `getJson` cache and request rules. Never silently treat an incomplete response as no moves.
- [x] Write pure assignment tests: January 2026 uses `Twitter`, February is `null`, March uses `X (social network)`; an unrelated log event is ignored; a two-move chain assigns disjoint full-month periods; a broken chain or overlapping assignment leaves affected months unknown. No month may name two titles.
- [x] Run `node --import tsx --test tests/title-history.test.mjs`; confirm the intended failures. Implement `assignMonthlyTitles` without pageview arithmetic. Require a chronological, main-namespace chain tied to the resolved page ID; mark every month containing a move unknown. When there are no supplied or redirect-derived former titles, retain the current-title series and label history as not exhaustively checked.
- [x] Run focused tests, `npm run typecheck`, and `npm test`; all pass. Review the diff without staging the pre-existing Phase 1 and 2 changes.

### Task 3: Use title periods in the analysis and show the audit trail

**Files:** Modify `scripts/pipeline.ts`, `scripts/types.ts`, `scripts/report.ts`, `tests/pipeline.test.mjs`, `tests/report.test.mjs`.

**Interfaces:** `SourceArticle.moveEvents`, `SourceArticle.trafficSegments` (title, inclusive first/last month, analytics URL/status/retrieval time), `SourceArticle.uncertainMonths`, and the existing `monthStatus`. `articleMonthlyViews` remains keyed by the current canonical article title; the title segment says which historical title supplied each count.

- [x] Write a pipeline test with the saved move event and controlled January–March traffic. Assert January comes from the old title, February is `null`, March comes from the new title, the segment periods do not overlap, the move month has `monthStatus: "unknown"`, and full-year growth/selection is unavailable. A second test gives overlapping old/new API data and asserts no sum or duplicate request contributes to one month. A third test makes the move lookup fail and asserts the affected article's history is marked uncertain, with no complete growth.
- [x] Run `node --import tsx --test tests/pipeline.test.mjs`; confirm these cases fail for the intended missing behavior.
- [x] After concept preflight, derive each selected page's title assignment, fetch only the disjoint ranges for titles actually used, and compose its nullable 24-month series. Feed that series to the unchanged `evaluateLanguage` arithmetic. Retain the existing top-level source fields when there is one segment; add `trafficSegments` and move evidence for full auditing.
- [x] Add a focused report test: the one-page PDF text path distinguishes a detected move or concept review from an ordinary weak trend and points to `metrics.json`. Implement concise wording without adding pages or removing the existing source links.
- [x] Run focused tests, `npm run typecheck`, and `npm test`; all pass. Review the diff without staging the pre-existing Phase 1 and 2 changes.

### Task 4: Teach the skill and verify the shipped behavior

**Files:** Modify `README.md`, `SKILL.md`, `references/validation.md`, `references/improvement-plan.md`; inspect `examples/astronomy-output/`.

- [x] Document the concept-ID check in plain language, the review-reason field, the optional former-title hint, the title-period audit fields, and why a move month may make growth unavailable. Explain that the ID match is supporting evidence and that title history is checked for known former titles, not exhaustively discovered.
- [x] Add a small manifest example with `"formerTitles": {"X (social network)": ["Twitter"]}` and a review-reason example for intentionally different pages. Keep the old astronomy manifest valid.
- [x] Run `npm run typecheck` and `npm test`; require zero failures. Generate complete and uncertain-title test reports, render them to images, and check one-page layout and legibility. Re-render the saved astronomy metrics and confirm it still opens without invented history fields.
- [x] Run `git diff --check`; inspect `metrics.json`, `chart.svg`, and `report.pdf` from a controlled moved-page run. If a real Wikimedia run is desired, require a real operator contact and record its retrieval time; do not substitute live data for the saved fixture in tests.
- [x] Update the Phase 3 status and validation notes only after the checks pass. Rebuild and byte-check `wikipedia-interest-skill.zip` if the ZIP is being delivered with the code change.

## Completion rule

The phase is complete when the fixed move fixture cannot create a false complete growth figure, a known concept mismatch is shown before traffic collection, every used title and time span is visible in `metrics.json`, and the PDF remains one page. A later task can investigate exhaustive historical-title discovery; this plan makes no completeness claim without that evidence.
