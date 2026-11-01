# Retain results only when reuse pays

Move repeated computation out of queries only when the total workload benefits.

## Compare the whole workload

Choose a horizon with `Q` queries and `U` updates. Compare cumulative work in one unit:

```text
recompute = Q * full_query_work
retain    = build_work + Q * retained_query_work + U * update_work + maintenance_work
```

Retaining results saves work when `retain < recompute`.
Include restarts, rebuilds, compaction, and dependency tracking in the retained design.
Count only work that differs between alternatives. Measure cold starts and bursts separately.
This model does not predict latency or parallel completion time.
Budget retained memory, storage, freshness, and tail latency separately.

## Define equivalence and validity

Define which inputs, modes, and versions determine a reusable result.
Invalidate it when any determining input changes.
State when updates become visible and what readers may observe during an update.

## Bound incremental work

Map each changed input to every derived result it can affect.
The cost depends on change size and dependency fan-out, not change size alone.

Fine tracking reduces recomputation but adds records, lookups, and update bookkeeping.
Coarse tracking simplifies bookkeeping but invalidates more work.
Compare tracking plus affected recomputation with a full rebuild on representative change sequences.
Use the cheaper valid strategy for the workload; retain a rebuild fallback.

## Recover complete state

Track the version or change position represented by derived state.
Replay missed changes only when the history is complete.
When history is missing, rebuild the uncertain region from authoritative inputs.
Compare incremental results with full recomputation under the same result contract.
Check deletions, moves, repeated updates, interrupted updates, and recovery when supported.
Allow contract-permitted nondeterminism; compare required semantics rather than raw bytes.

Provenance: [self-adjusting computation][sac] and [build-system dependency models][build].

[sac]: https://www.cs.cmu.edu/~blelloch/papers/3409964.3461799.pdf
[build]: https://www.microsoft.com/en-us/research/wp-content/uploads/2018/03/build-systems-final.pdf
