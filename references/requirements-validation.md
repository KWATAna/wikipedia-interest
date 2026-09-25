# Requirements validation

| Requirement | Evidence |
| --- | --- |
| TypeScript implementation | `scripts/*.ts` contains the CLI, Wikimedia client, calculations, pipeline, PDF/chart generation, and shared types. `tsconfig.json` uses strict checking and `noEmit`; `npm run typecheck` passed. |
| Agent Skills package with working code | `SKILL.md` has valid frontmatter and operational instructions. The bundled CLI performs discovery, search, pageview calculations, SVG charting, and PDF generation. The Agent Skills validator passed. |
| Source-only and reproducible | Exact runtime and development versions are in `package-lock.json`; `npm ci` passed. `tsx` runs `.ts` directly on Node.js 20.20.2. The ZIP contains no `node_modules`, transpiled output, or executable binaries. |
| Custom files stay together | Source, tests, examples, references, fonts, and licenses are all inside the `wikipedia-interest/` skill directory. The ZIP has that directory as its root. |
| Low-cost model workflow | `gpt-6-luna` at low reasoning effort used `discover`, `search`, and `analyze`, wrote a valid manifest, read `metrics.json`, and produced a one-page PDF with a correct interpretation. See `validation.md`; the generated sample is in `examples/astronomy-output/`. |
| Efficient follow-ups | The CLI caches API responses, supports `--refresh` and `--end`, and accepts revised manifests. `.ignore` keeps installed dependencies out of `rg --files` in a standalone folder. |

The point-in-time astronomy sample is an attention proxy. It does not validate course purchases or establish a general causal relationship between Wikipedia traffic and product demand.
