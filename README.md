# Flow State

Flow State is an Effect-native TypeScript runtime for state, cached reads,
mutations, workflows, React views, persistence, and inspection.

## Useful structure

- `packages/flow-state/` — library, public routes, runtime, adapters, tests, and proofs.
- `apps/docs/` — documentation source and generated reference artifacts.
- `codebases/` — reference code bases for development.

Development uses Node 22.18+, `nub@0.7.5`, TypeScript 7.0.2, Vite Plus, and
Effect 4.0.0-rc.112. The repository's compiler and Effect conventions are in
[`AGENTS.md`](AGENTS.md), and the toolchain alignment check is
`nub run check:toolchain`.

## Commands

```sh
nub install                 # install dependencies
nub run check               # format, Oxlint, and type checks
nub run check:toolchain     # verify pinned Node, TypeScript, Effect, and language-service versions
nub run check:fix           # apply format and lint fixes
nub run test                # run the test suite
nub run build               # build packages
nub run docs:dev            # work on the docs site
nub run verify              # full closeout gate
```

Use `check` for normal changes, `build` for package or CLI changes, and
`verify` before calling a migration slice complete.
