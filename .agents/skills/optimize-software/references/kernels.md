# CPU kernels and instruction-level optimization

- **SIMD / vectorized kernels.** Process independent lanes using auto-vectorization or intrinsics;
  check data layout, tails, null handling, alignment, and bandwidth.
- **AVX-512 and other ISA-specific paths.** Use supported instructions with feature
  detection/dispatch and portable fallbacks; wider vectors are not automatically faster.
- **Bit arithmetic / masks / population counts / bit scans.** Use valid integer-domain identities
  and builtins; check width, overflow, shifts, signedness, and generated instructions.
- **Branchless selection / masking.** Replace costly unpredictable branches where profitable;
  preserve short-circuit safety and account for extra work.
- **Multiple accumulators / broken dependency chains.** Expose independent operations; respect
  floating-point ordering requirements.
- **Loop unrolling.** Expose work and reduce loop overhead; check code size, register pressure, and
  compiler output.
- **Static dispatch / devirtualization.** Expose call targets and enable inlining; weigh
  specialization and binary size.
- **Prefetching.** Anticipate predictable memory accesses; verify benefit beyond hardware
  prefetching and avoid excess traffic.
- **Memory-level parallelism.** Expose independent accesses rather than serial pointer chains;
  measure latency versus bandwidth limits.
- **Common-path / cold-path separation.** Keep hot code compact; validate instruction-cache effects.
- **Intrinsics.** Request machine operations while retaining compiler integration; inspect generated
  code.
- **Inline / standalone assembly.** Use only for measured code-generation deficiencies or missing
  facilities; define constraints, clobbers, ABI, flags, memory effects, and fallback paths.

Follow compiler-friendly code → inspect generated assembly → intrinsics → handwritten assembly where
justified. Do not use source operation counts as a proxy for CPU cost. Inspect instruction
throughput, latency, dependencies, spills, cache misses, and branch misses when relevant.
