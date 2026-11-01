# Batch and data pipelines

1. Measure end-to-end makespan, records/bytes per second, peak memory, I/O, and cost. Record
   distributions, partition sizes, skew, and required ordering/exactness.

2. Model each stage and boundary: decode, filter, transform, group/join, shuffle, materialize,
   encode, and write. Locate bottlenecks and stragglers rather than maximizing every stage
   independently.

3. Push filters/projections early; reuse scans and compatible computations. Stream/fuse stages where
   valid and choose batch sizes for overhead, locality, and memory. Identify blocking sorts, joins,
   and aggregations. For incremental pipelines, measure invalidation fan-out and
   tracking overhead against recomputation; see work reduction (Use the `work-reduction` skill).

4. Balance partitions, bound in-flight batches, and propagate backpressure. Account for
   serialization, copying, spill, and network shuffle costs before adding workers.

5. Define retry/idempotency, checkpoint, output publication, and partial-failure behavior. Avoid
   duplicate or lost outputs; do not relax numerical/order guarantees implicitly.

6. Test sustained runs, skewed keys, out-of-memory/spill behavior, slow sinks, restart/recovery, and
   realistic storage/cache states.

## Sources

- [Polars optimizations](https://docs.pola.rs/user-guide/lazy/optimizations/)
- [Google SRE data pipelines](https://sre.google/sre-book/data-processing-pipelines/)
