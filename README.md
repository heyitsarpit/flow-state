# Flow State

Experimental Effect-native frontend state/workflow runtime.

The intended direction is a typed runtime where:

- local values are atoms
- cached reads are resources
- writes are mutations
- workflows are machines
- all side effects are Effects

This repository is scaffolded as a TypeScript workspace with a main library package and examples. It targets the current Effect v4 beta, XState v5, and the TypeScript 7 release candidate.

Five maintained recipe applications prove the public surface, with coverage
tracked in [the feature matrix](examples/FEATURE_COVERAGE.md). The
client/server Incident Console is the alpha flagship, while the governing
compatibility rules remain in [API_CONTRACT.md](API_CONTRACT.md).

## Workspaces

- `packages/flow-state` - the library package
- `examples/*` - maintained recipes, TypeScript proof consumers, and the flagship

## Commands

```sh
pnpm install
pnpm check
pnpm check:fix
pnpm lint
pnpm fmt:check
pnpm fmt
pnpm test
pnpm build
pnpm dev
```

Vite+ is installed locally through `vite-plus`; scripts call its `vp` binary from `node_modules/.bin`. Formatting is handled by Oxfmt and linting is handled by Oxlint through Vite+.
