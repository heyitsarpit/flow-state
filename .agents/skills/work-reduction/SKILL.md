---
name: work-reduction
description: >-
  Reduce unnecessary, repeated, or invalidated work while preserving required results.
  Apply when choosing or combining elimination, reuse, pruning, or incremental computation.
disable-model-invocation: true
metadata:
  kind: principle
---

# Work Reduction

Preserve the required result while reducing the work needed to produce it.
Reduce work before accelerating what remains.

## Discover reductions

Ask these questions before accelerating the remaining work. Follow the measured limiting cost.

| Question | Action | Required check |
|---|---|---|
| Must this work happen? | Eliminate it | Preserve required results and effects |
| Has equivalent work been done? | Share, reuse, or precompute | Match inputs and semantics |
| Can fewer inputs be examined? | Restrict traversal or candidates | Include every valid result |
| Can a cheap fact reject an input? | Filter before expensive work | Prevent false negatives |
| What changed? | Recompute affected state | Track dependencies and invalidation |
| What work remains? | Tune remaining work | Measure algorithm, data, and execution costs |

For each stage, state work removed, work added, and the invariant preserving the result.
Reject only inputs that cannot match; pass uncertain inputs through.
For stable per-input costs, a filter pays when `f + p * e < e`.
`f` is filter cost, `e` is full-operation cost, and `p` is the survivor fraction.
For approximate retrieval, preserve the agreed recall contract.
Reuse complete candidates from the same input state only when the new query cannot widen matches.

## Compose reductions

Trace what each stage passes to the next. Price later work against survivors, not original inputs.
Count shared savings once. Include each stage's setup, transfers, and maintenance.
Measure each filter on the inputs surviving earlier filters.
Check how one reduction changes another's benefit or cost:

- A selective filter leaves less work to parallelize.
- Precomputation saves query work but adds construction, updates, and retained state.
- A shared representation can remove copying and repeated validation across stages.

Measure individual changes, then remeasure the assembled path and locate its new limiting cost.
Verify the combined result; do not assume independent speedups multiply or add.

## Price retained work

For cached, precomputed, or incremental results, read [lifecycle costs](references/lifecycle.md).
Account for construction, updates, invalidation, rebuilds, and retained resources.
Keep latency, cumulative work, memory, and freshness budgets distinct.

## Apply the findings

Return proposed reductions, invariants, shifted costs, and evidence.
For architectural findings, see [design-for-performance](../design-for-performance/SKILL.md).
For measured-attempt proposals, see [optimize-software](../optimize-software/SKILL.md).
Reconcile material findings through [keep-intent-aligned](../keep-intent-aligned/SKILL.md).
Surface changed-contract proposals before dependent implementation; use
[to-spec](../to-spec/SKILL.md) when contract recording is in scope.

For an optional worked example, read [FSearch](references/fsearch.md).
