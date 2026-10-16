# Validation requirements

Preserve the agreed result contract. Surface proposed guarantee changes before dependent
implementation.
For algorithmic changes, document preconditions, memory use, and worst-case complexity.
For low-level changes, exercise boundary sizes, alignment, aliases, container growth,
allocation failures, and relevant concurrency interleavings.

Apply [benchmark-checklist](../../benchmark-checklist/SKILL.md) to performance comparisons.

For selective fast paths, test common, rare, absent, and correlated matches, including inputs
that defeat the filter. Compare results with an authoritative unfiltered path under the same
contract.
Include matching-mode and freshness boundaries; survivor verification cannot recover omitted
candidates.
[PostgreSQL planner statistics][stats] illustrates how correlation defeats independent selectivity
estimates.

[stats]: https://www.postgresql.org/docs/18/planner-stats.html
