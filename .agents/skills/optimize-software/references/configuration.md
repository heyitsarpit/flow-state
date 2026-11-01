# Compiler, build, and runtime configuration

- Use representative optimized/release builds for runtime comparisons; measure development iteration
  separately.
- Evaluate PGO using representative training workloads, then validate on held-out workloads.
- Evaluate LTO, optimization levels, code-generation unit counts, and inlining trade-offs for
  runtime, binary size, and compilation cost.
- Evaluate target-specific compilation against deployment compatibility; preserve CPU dispatch where
  required.
- Expose bounds, aliasing relationships, types, and independent iterations to help eliminate checks
  and vectorize; never assert an invariant that is untrue.
- Evaluate alternative allocators against measured allocation patterns and deployment OS; they can
  increase binary/build costs.
- For binary size, evaluate size-oriented optimization, symbol stripping, and panic/unwind policy
  only when supported and semantically acceptable; preserve useful profiling/debug artifacts.
- For build speed, evaluate incremental workflows, focused checks/tests, debug-information levels,
  linker choice, and supported faster development backends. Pin versions and verify current
  toolchain defaults.
- For type-checking/editor performance, profile the compiler and project graph; review expensive
  types, configuration, and project boundaries using current runtime/toolchain documentation.
