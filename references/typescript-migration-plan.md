# TypeScript migration plan

**Goal:** Deliver the Wikipedia interest skill as editable, checked TypeScript source while preserving its CLI, data analysis, chart, and PDF behavior.

**Architecture:** Run `.ts` modules directly with pinned `tsx`; use `tsc --noEmit` for static checking. Keep the same five small modules and a shared type file for the manifest, API records, results, and report input. Keep the existing behavior tests as executable `.mjs` files using the TypeScript loader.

**Tech stack:** Node.js 20+, TypeScript, tsx, PDFKit, fontkit.

**Spec:** User's TypeScript and standalone-skill requirements in this conversation.

## Global constraints

- Every custom file and font stays inside `wikipedia-interest/`.
- Do not ship transpiled JavaScript, `node_modules`, or executables.
- `npm ci`, `npm test`, and `npm run typecheck` must work from a clean unzip.
- The low-cost model must complete the documented analysis workflow with the converted CLI.

## Work

1. Change the CLI tests to invoke a `.ts` entry point through `tsx`; confirm they fail while only `.mjs` exists.
2. Pin TypeScript, tsx, Node and PDF library types; rename the five runtime modules to `.ts`; update imports and add explicit domain types. Run the tests and `tsc --noEmit` until both pass.
3. Update `SKILL.md` commands and validation notes; run a cached end-to-end analysis with a low-cost tool-using model; inspect the output PDF; rebuild the source-only ZIP and verify its contents.

## Review focus

- CLI starts on Node 20 without a compile step.
- Unicode article titles survive title resolution, charting, and PDF rendering.
- Partial Wikimedia months remain ineligible for growth claims.
- The packaged archive contains all dependencies' lock data and no generated code.
- Agent instructions use `.ts` commands and state the real User-Agent contact requirement.
