# Flow State

Flow State is an experimental Effect-native runtime for teams building
mid-to-large TypeScript applications with cached resources, optimistic
transactions, workflows, streams, deterministic tests, and inspection under one
scoped owner.

```sh
nub add flow-state@0.1.0-alpha.0 effect@4.0.0-beta.86
```

The package is ESM-only and requires Node 22.18 or newer. React is an optional
peer with supported React 18 and React 19 entrypoint consumers.

Public entrypoints are:

- `flow-state`
- `flow-state/react`
- `flow-state/testing`
- `flow-state/server`
- `flow-state/inspect`

Start with the [supported onboarding](https://github.com/heyitsarpit/flow-state/blob/main/apps/docs/src/pages/getting-started.md), then use the five maintained recipes for focused behavior. The [Incident Console](https://github.com/heyitsarpit/flow-state/tree/main/examples/incident-console) is the real client/server proof over HTTP and SSE.

This is an experimental alpha, so read the [known limits](https://github.com/heyitsarpit/flow-state/blob/main/apps/docs/src/pages/reference/status.mdx) before adopting it. It is an opinionated alternative to combining TanStack Query and XState, without drop-in or feature-parity claims.
