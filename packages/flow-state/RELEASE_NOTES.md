# Flow State 0.1.0-alpha.0

This experimental alpha packages the settled Flow State API as ESM for Node
22.18 or newer. It includes the core runtime, React bindings, deterministic
testing, request-scoped server helpers, inspection, and the `flow-state` CLI.

## Included proof

- Cached keyed resources with demand deduplication, stale refresh, exact and tag
  invalidation, and caller-owned runtime cleanup.
- Typed machines with state-owned resources, optimistic transactions, streams,
  one-shot timers, child workflows, routed outcomes, views, and inspection.
- React 18 and React 19 consumers through `flow-state/react`.
- Deterministic direct-runtime and `test.app` evidence with virtual time,
  receipts, issues, pending work, models, and property schedules.
- Five focused recipes plus Incident Console, which crosses real HTTP and SSE
  boundaries for optimistic 409 reconciliation, timeline replay, and runbooks.

## Known limits

- The machine model does not include parallel or history states, root `onDone`,
  raised events, or a complete hierarchical statechart model.
- Cache capacity/eviction policy, generalized offline persistence, router and
  form integration, authentication, and non-React adapters are outside this
  alpha.
- Server support is limited to request-scoped prefetch, boot payloads,
  hydration, and actor restore; it is not a generic React Server Component
  runtime adapter.
- The Effect peer is pinned to `4.0.0-beta.86`, so consumers must evaluate that
  beta dependency as part of adoption.
- The CLI is a local behavior/story/trace proof surface, not a hosted console or
  visual editor.

## Install

```sh
pnpm add flow-state@0.1.0-alpha.0 effect@4.0.0-beta.86
```

Add React 18 or React 19 only when importing `flow-state/react`.
