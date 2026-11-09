# Reference sources

Consult the relevant source for details, and verify version-specific facilities before use:

- [Algorithms for Modern Hardware](https://en.algorithmica.org/hpc/): algorithms, locality,
  arithmetic, SIMD, CPU behavior.
- [Data-Oriented Design](https://www.dataorienteddesign.com/dodbook/): representations,
  transformations, ownership organization, cache behavior.
- [Agner Fog optimization manuals](https://www.agner.org/optimize/): x86 instructions, intrinsics,
  assembly, dispatch.
- [Bit Twiddling Hacks](https://graphics.stanford.edu/~seander/bithacks.html): bit-operation
  identities; validate modern code generation.
- [Rust Performance Book](https://nnethercote.github.io/perf-book/): allocation, kernels, profiling,
  build trade-offs.
- [Microsoft performance
  antipatterns](https://learn.microsoft.com/en-us/azure/architecture/antipatterns/): application
  architecture and I/O.
- [Polars optimizations](https://docs.pola.rs/user-guide/lazy/optimizations/): query planning and
  work elimination.
- [Node event loop](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop) and
  [backpressure](https://nodejs.org/en/learn/modules/backpressuring-in-streams): execution
  constraints.
- [web.dev performance](https://web.dev/learn/performance): loading and responsiveness.
- [Go Optimization Guide](https://goperf.dev/) and [GC guide](https://go.dev/doc/gc-guide):
  allocation, concurrency, runtime costs.
- [TypeScript compiler performance](https://github.com/microsoft/TypeScript/wiki/Performance):
  type-checking and editor costs.
- [mmap manual](https://man7.org/linux/man-pages/man2/mmap.2.html): mapping semantics and failure
  conditions.
