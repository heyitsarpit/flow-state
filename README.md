# Flow State

Experimental Effect-native frontend state/workflow runtime.

The intended direction is a typed runtime where:

- local values are atoms
- cached reads are resources
- writes are mutations
- workflows are machines
- all side effects are Effects

This repository is scaffolded as a TypeScript workspace with a main library package and examples. It targets the current Effect v4 beta, XState v5, and the TypeScript 7 release candidate.

Launch Workspace is the executable proof app for the current public surface. Its
[API inventory](examples/launch-workspace/API_INVENTORY.md) records declaration,
owner, runtime, test, and status evidence for every covered API; the governing
compatibility rules remain in [API_CONTRACT.md](API_CONTRACT.md). Its
receipt-derived Readiness/product/debug limitation remains an open P4A.3
boundary documented in that inventory.

## Workspaces

- `packages/flow-state` - main library stub
- `examples/react-basic` - React example stub

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
