# Data representation, memory, and lifetimes

- **AoS versus SoA.** Choose whole-record access versus repeated field scans; neither layout is
  universally superior. Trace addresses actually read, unused bytes fetched, and indirections.
  Compare layouts under that access pattern; contiguous storage alone does not prove locality.
- **AoSoA / blocked layouts.** Combine field separation with bounded blocks for SIMD and locality;
  evaluate block size.
- **Typed columnar buffers.** Process homogeneous batches without per-value object overhead;
  represent nulls and variable-length data explicitly.
- **Hot/cold splitting.** Separate frequently touched fields from rare fields; account for extra
  lookups.
- **Contiguous / flat storage.** Reduce pointer chasing and improve spatial locality; handle
  relocation and mutation needs.
- **Compact integers, offsets/indices instead of pointers, compressed indexes.** Reduce bandwidth
  and cache footprint; validate ranges and decoding costs.
- **Bit packing / packed flags.** Reduce storage or enable bulk bit operations; weigh mutation and
  unpacking costs.
- **Alignment / packing.** Respect access and SIMD requirements; distinguish compact fields from
  aligned accesses and cache-line placement.
- **Cache blocking / tiling.** Reuse working sets within caches; tune against actual cache hierarchy
  and access patterns.
- **Buffer reuse / pools / arenas.** Reduce allocation churn; define lifetimes, reset behavior,
  retained capacity, and synchronization.
- **Preallocation / capacity reservation.** Avoid predictable repeated growth; avoid excessive
  retained memory.
- **Zero-copy views / borrowed slices.** Avoid copying and intermediate decoding; verify source
  lifetime and mutation rules.
- **Loop fusion / fewer materializations.** Combine compatible passes and remove temporary arrays;
  preserve dependencies and check vectorization/register pressure.
- **Single-owner allocation and explicit transfer.** Make destruction responsibility clear; enforce
  it through the language or APIs where possible.
- **Short-lived borrowing.** Avoid retained references into growable containers across mutation,
  callbacks, or async work.
- **Generational handles.** Detect deleted/reused slots and survive storage relocation; guard
  generation wraparound and check handles.
- **Tracking allocators / memory diagnostics.** Detect leaks, bad frees, and supported invalid
  accesses; diagnostics do not prove all lifetime safety.

[CUDA bandwidth guidance][bandwidth] distinguishes useful requested bytes from physical transfers.
Apply its measurements to GPU accesses; inspect actual cache behavior before transferring
conclusions to CPUs.

[bandwidth]: https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html#throughput-reported-by-visual-profiler
