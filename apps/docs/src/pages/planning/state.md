# State [Current phase, decisions, and next procedure]

## Current Phase

Phase 0: planning and reference setup.

## Current Repository State

- Git repository initialized.
- Vite+ workspace exists.
- TypeScript 7 RC is installed.
- `@flow-state/core` package stub exists.
- `examples/react-basic` stub exists.
- Vite+ lint, format, type-check, test, build, and pre-commit hook are wired.
- Vocs docs app exists under `apps/docs`.
- Ignored local research snapshots exist under `docs/codebases` and `docs/product`.

## Current Decision State

- We are using a machine-first public API as the primary design hypothesis.
- We are building toward an owned Effect-native runtime.
- XState is a reference for statechart algorithms, edge cases, and fixture comparison. It is not the final core engine.
- TanStack Query is a reference for cache lifecycle, observers, invalidation, stale time, GC time, and mutation behavior.
- TanStack Store is a reference for subscription shape, selector equality, and batched notifications.
- Atom, resource, mutation, machine, stream, runtime, and cache remain implementation concepts, not necessarily user-facing vocabulary.
- We will stub the intended API surface in docs and package exports before every implementation detail is settled.
- Runtime internals start only after the Project Editor example gives concrete API pressure.
- Vocs is the docs shell decision.

## Next Procedure

1. Keep Vocs as the implementation guide, not only a reference site.
2. Update API docs with implementation status, stub behavior, and open semantic questions.
3. Tighten runtime semantics around the deterministic transition kernel and Effect-owned async work.
4. Start `examples/project-editor` as an aspirational API and test example.
5. Use the example to decide the first runtime slice.

## Known Unknowns

- Final package split.
- Final public import paths.
- Whether `flow` is the only public namespace or one of several exports.
- Whether XState remains as a temporary dev/test dependency for fixture comparison.
- Whether Effect Atom is used internally.
- Whether Alien Signals or another signal engine is useful.
- Cache key and tag representation.
- Query observer lifecycle and late result behavior.
- Mutation concurrency policy.
- Stream backpressure/coalescing policy.
- Type-test tooling.

## Blockers

- None.
