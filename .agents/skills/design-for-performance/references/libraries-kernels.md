# Libraries and native kernels

1. Specify operations, sizes, distributions, target hardware, ABI/API, numerical semantics,
   allocations, and end-to-end importance. Include tiny calls and bulk throughput.

2. Inspect algorithm, representation, call overhead, allocation/copying, dispatch, branches,
   dependency chains, and memory traffic. Distinguish bandwidth limits from compute limits.

3. Design APIs allowing caller-owned buffers, borrowing, batches, and known constraints when useful.
   Define aliasing, lifetimes, alignment, output ownership, and error behavior.

4. Choose algorithms and layouts before instruction tuning. Inspect compiler output; evaluate
   auto-vectorization, intrinsics, then assembly only for justified kernel opportunities.

5. Use feature detection and fallback paths for ISA-specific code. Exercise tails, empty inputs,
   alignment, overflow, nulls, aliases, and relevant floating-point cases. Do not assert false
   compiler invariants.

6. Measure kernels and caller workloads, including allocation/dispatch/setup where callers incur
   them. Retain a simple reference implementation for differential correctness checks when
   practical.

## Sources

- [Algorithms for Modern Hardware](https://en.algorithmica.org/hpc/)
- [Agner Fog manuals](https://www.agner.org/optimize/)
