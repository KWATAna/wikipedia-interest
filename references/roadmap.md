# Iterative development

The current workflow is deliberately small: one to six editions, up to six manually reviewed article proxies per edition, and a fixed 24-month matched-year comparison. Extend it in stages, validating each stage against saved API fixtures and real founder questions.

1. **Proxy quality.** Add Wikidata concept IDs and disambiguation checks, retain title and redirect history, and compare closely related pages without double-counting known redirects. Keep an agent review step for conceptual equivalence; translation alone is not enough.
2. **Trend diagnostics.** Add event annotations, robust seasonal trend estimates, sensitivity to removing the largest month, and uncertainty intervals where assumptions support them. Show proxy agreement and disagreement instead of collapsing multiple pages into one opaque score.
3. **Larger datasets.** Move the request cache and time series to SQLite or Parquet, batch by edition and month, add resumable jobs, and use Wikimedia dumps when API volume becomes high. Respect Wikimedia rate limits and record query/version provenance.
4. **Market validation.** Triangulate with permitted search, product, or survey data. Keep Wikipedia as an attention proxy and test willingness to pay with actual user research or experiments. Evaluate whether recommendations predict useful product decisions before automating prioritization.
