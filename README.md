# Flow State

Flow State is an Effect-native TypeScript runtime for state, cached reads,
mutations, workflows, React views, persistence, and inspection.

## Useful structure

- `packages/flow-state/` — library, public routes, runtime, adapters, tests, and proofs.
- `examples/` — maintained applications and packed TypeScript consumers.
- `apps/docs/` — documentation source and generated reference artifacts.
- `codebases/` — reference code bases for development.

## Commands

```sh
nub install                 # install dependencies
nub run dev                 # run the Incident Console
nub run check               # format, Oxlint, and type checks
nub run check:fix           # apply format and lint fixes
nub run test                # run the test suite
nub run build               # build packages and run CLI acceptance
nub run test:browser        # run browser tests
nub run docs:dev            # work on the docs site
nub run verify              # full closeout gate
```

Use `check` for normal changes, `build` for package or CLI changes, and
`verify` before calling a migration slice complete. `build` owns the
`check:example-cli` integration gate, so that command normally does not need to
be run directly.
