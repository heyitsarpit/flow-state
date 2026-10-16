# Problem formulation and architecture

- **Eliminate unnecessary work; early rejection.** Apply
  [work reduction](../../work-reduction/SKILL.md) to safe rejection and filter costs.
  Confirm survivors through the full operation.
- **Incremental computation.** Track affected dependencies, not just changed inputs.
  Compare tracking overhead, recomputation, and rebuild costs using
  [work reduction](../../work-reduction/SKILL.md).
- **Caching / memoization.** Reuse expensive results; define keys, freshness, eviction, memory
  bounds, and concurrency behavior.
- **Precomputation / lookup tables.** Trade initialization or storage for repeated computation;
  validate input domain and cache footprint.
- **Specialization / partial evaluation.** Exploit fixed sizes, bounded values, sorted inputs, or
  known parameters at build time or initialization; retain general fallbacks.
- **Offline processing.** Reorder known queries to share work; verify that online ordering and side
  effects are not required.
- **Dominance pruning.** Remove states provably unable to improve a result; state the dominance
  proof.
- **State compression.** Retain only information affecting future results; prove equivalent future
  behavior.
- **Output-sensitive algorithms.** Scale work with actual matches/output instead of all possible
  pairs; evaluate worst-case output.
- **Amortized design and analysis.** Spread occasional expensive work across many operations; also
  evaluate single-operation tail latency.
- **Inspectable expressions / deferred execution.** Represent operations as a plan before executing;
  expose dependencies, types, purity, and order constraints.
- **Predicate, projection, and slice pushdown.** Move filters, required-column selection, and limits
  toward scans where semantics permit; source-format support determines I/O savings.
- **Common subplan elimination.** Reuse shared scans or query branches; account for materialization,
  memory, and side effects.
- **Expression simplification / constant folding.** Reduce expression graphs and substitute
  equivalent cheaper operations; preserve numeric and error semantics.
- **Join ordering / cardinality estimation.** Reduce intermediate sizes and select grouping/join
  strategies using estimates; account for skew and estimation errors.
- **Minimal sufficient types / type coercion.** Use representations sufficient for the operation;
  preserve ranges, precision, nulls, and semantics.
- **Avoid chatty I/O, repeated fetching, busy databases, unnecessary processing.** Reduce boundary
  crossings and duplicated work; inspect database query plans and indexes.

## Necessary-condition filters

For matching-mode and API details, consult [regex-automata prefilters][prefilter] and
[literal extraction][literals]. Validate that the filter preserves the operation's result contract.

[prefilter]: https://docs.rs/regex-automata/latest/regex_automata/util/prefilter/struct.Prefilter.html
[literals]: https://docs.rs/regex-syntax/latest/regex_syntax/hir/literal/index.html
