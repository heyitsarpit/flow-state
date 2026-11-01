# Compilers and build tools

1. Measure clean build, no-op build, small-edit incremental build, focused checks/tests, dependency
   setup, and memory separately. Use representative edits across dependency boundaries.

2. Trace discovery, parsing, resolution, type/semantic analysis, transformations, specialization,
   code generation, and linking. Identify repeated analysis and invalidation fan-out.

3. Cache reusable stage results using complete dependency/configuration/toolchain keys. Track
   dependencies at a useful granularity; validate cache hits against clean results and avoid stale
   diagnostics. Compare dependency-tracking overhead and recomputation at different granularities
   with a full rebuild; validate the contractual result after representative update sequences.

4. Delay unnecessary phases and support focused work where sound. Evaluate parallel stages against
   peak memory, scheduling, and dependency constraints. Reduce unnecessary generated/specialized
   code.

5. Choose development versus optimized backends, debug information, linkers, and optimization
   settings according to iteration versus runtime goals; verify current defaults.

6. Test edits to sources, public interfaces, configuration, generated inputs, and toolchain
   versions. Compare incremental and clean outputs; test cache corruption and recovery where
   persistent caches exist.

## Sources

- [Rust Performance Book](https://nnethercote.github.io/perf-book/)
- [TypeScript performance](https://github.com/microsoft/TypeScript/wiki/Performance)
