# Databases and storage

1. Separate optimizing an application query from designing a database engine. Record data size,
   selectivity, skew, transaction isolation, read/write mix, concurrency, and durability
   requirements.

2. Inspect plans, estimated versus actual rows, scan/join strategy, loops, sorts, buffer activity,
   spills, lock waits, and I/O. EXPLAIN ANALYZE executes the statement: evaluate safety before using
   it on mutations or production workloads.

3. Choose indexes for actual predicates and ordering; check composite key order, covering/partial
   index support, and write/storage costs. Refresh statistics and assess skew before
   forcing plans. Price indexes over construction, reads, writes, and rebuilds.
   Define freshness and refresh/publication behavior for retained results using
   [work reduction](../../work-reduction/SKILL.md).

4. Reduce rows/columns early, round trips, N+1 access, unnecessary materialization, and oversized
   transactions. Preserve isolation and query semantics; pagination changes require stable ordering
   and consistency choices.

5. For engines, evaluate row/column layouts, B-trees, buffering, batching, compression, logging, and
   compaction against workload costs. Measure write amplification and background interference. Never
   trade away required durability silently.

6. Validate warm/cold reads, concurrent transactions, large intermediates, skew, recovery, and
   sustained writes; include maintenance and checkpoint/compaction effects where relevant.

## Sources

- [PostgreSQL EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
- [Polars optimizer](https://docs.pola.rs/user-guide/lazy/optimizations/)
