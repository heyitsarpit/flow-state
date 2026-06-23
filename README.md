# Flow State

Experimental Effect-native frontend state/workflow runtime.

The intended direction is a typed runtime where:

- local values are atoms
- cached reads are resources
- writes are mutations
- workflows are machines
- all side effects are Effects

This repository is scaffolded as a TypeScript workspace with a main library package and examples. It targets the current Effect v4 beta, XState v5, and the TypeScript 7 release candidate.

## Workspaces

- `packages/flow-state` - main library stub
- `examples/react-basic` - React example stub

## Commands

```sh
pnpm install
pnpm check
pnpm test
pnpm build
pnpm dev
```

Vite+ is installed locally through `vite-plus`; scripts call its `vp` binary from `node_modules/.bin`.
