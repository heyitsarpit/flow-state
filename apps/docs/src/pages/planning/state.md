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
- We are preserving atom, resource, mutation, machine, stream, runtime, and cache as internal conceptual primitives.
- We are not implementing runtime internals until examples force the API shape.
- We are not committing to wrapping XState or replacing XState yet.
- Vocs is the docs shell decision.

## Next Procedure

1. Finish the tracked planning file split.
2. Finish the tracked quick library reference.
3. Review the planning and reference files in Vocs.
4. Commit the planning/docs changes.
5. Start `examples/project-editor` as an aspirational API example.

## Known Unknowns

- Final package split.
- Final public import paths.
- Whether `flow` is the only public namespace or one of several exports.
- Whether XState remains a dependency in v1.
- Whether Effect Atom is used internally.
- Whether Alien Signals or another signal engine is useful.
- Cache key and tag representation.
- Type-test tooling.

## Blockers

- None.
