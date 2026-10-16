# I/O, execution, and concurrency

- **Batching / buffering.** Amortize syscall, network, database, or FFI overhead; budget waiting
  latency and partial failures.
- **Connection reuse.** Reduce repeated connection setup; bound pools and manage stale connections.
- **Streaming / pipelined execution.** Process batches progressively and reduce intermediate memory;
  identify blocking stages and fallback behavior.
- **Backpressure.** Keep producers within consumer capacity; specify bounded queues, cancellation,
  and overload policy.
- **mmap.** Consider file-backed random access, shared mappings, or reduced copying; compare
  buffered I/O under warm/cold caches and account for faults, truncation, synchronization, and OS
  semantics.
- **Async I/O.** Overlap waiting without blocking event/UI threads; async does not make CPU work
  parallel.
- **Offload CPU work.** Move heavy computations to workers or native kernels; account for transfer
  and scheduling costs.
- **Bounded parallelism / worker pools.** Use independent work without uncontrolled fan-out;
  evaluate skew, contention, and memory.
- **Ownership partitioning / sharding.** Give workers independent mutable data; account for
  balancing and cross-partition operations.
- **Thread-local accumulation + reduction.** Reduce shared updates; define deterministic ordering or
  tolerated numerical variation.
- **Avoid false sharing.** Separate independently written data sharing cache lines; padding can
  increase footprint.
