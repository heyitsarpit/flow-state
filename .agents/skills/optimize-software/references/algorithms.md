# Algorithms and data structures

- **Two pointers.** Exploit ordering or monotonic movement; justify which candidates can be
  discarded.
- **Sliding windows.** Maintain contiguous-range state; verify that boundary movement supports the
  predicate, especially with negative values.
- **Prefix/suffix aggregates.** Answer repeated range queries or reuse partial results; range
  subtraction needs an appropriate inverse operation.
- **Hash indexes, maps, frequency tables.** Accelerate lookup, grouping, counting, deduplication;
  account for hashing, collisions, adversarial keys, and memory.
- **Coordinate compression.** Map sparse ordered identifiers to dense indices; preserve required
  ordering and accommodate updates.
- **Sorting + sweep line.** Process events or overlapping intervals in order; define tie-breaking
  and endpoint inclusion.
- **Monotonic stacks / queues.** Maintain next-greater/smaller candidates or moving extrema; prove
  discarded entries cannot become useful.
- **Binary search.** Search ordered data or monotonic predicates; check boundaries and overflow.
- **Binary search on the answer.** Find an optimal threshold using feasibility tests; prove
  feasibility is monotonic.
- **Meet-in-the-middle.** Split exponential enumeration and combine partial states efficiently;
  budget memory.
- **Dynamic programming / memoization.** Reuse overlapping subproblems; define sufficient state and
  acyclic evaluation or convergence.
- **Rolling DP state.** Retain only dependency-required states; ensure overwritten values are no
  longer needed.
- **Greedy selection.** Use locally optimal choices only with an exchange, cut, or equivalent
  correctness argument.
- **Heaps / top-k selection.** Maintain best candidates without sorting everything; compare against
  full sorting for actual sizes.
- **Fenwick / segment trees.** Maintain aggregates with interleaved updates and queries; choose
  supported algebra and update semantics.
- **BFS / DFS.** Solve reachability and traversal; BFS shortest-path guarantees require suitable
  equal edge costs.
- **Union-find.** Maintain merged connected components; does not directly support arbitrary
  deletions.
- **Topological sorting.** Order dependency execution; detect cycles.
- **Shortest-path algorithms.** Select according to weights, graph density, and query reuse; verify
  negative-edge restrictions.
- **Bitsets / bitmask DP / subset enumeration.** Exploit small or dense universes and word-parallel
  set operations; exponential state spaces remain exponential.
- **Bloom filters.** Reject definite non-members cheaply; confirm positives through the
  authoritative structure.
- **Cache-aware search trees and indexes.** Improve physical layout as well as asymptotic
  complexity; benchmark lookup/update distributions.
