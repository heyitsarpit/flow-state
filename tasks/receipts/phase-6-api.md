# Phase 6 canonical alpha API decision

Recorded before broad P6.1 implementation on 2026-07-15.

## Machine configuration

State is inferred exclusively from the keys of `states`, and `initial` must be
one of those keys. A machine whose callbacks need a domain event union uses the
optional Context/Event binder around the same configuration object:

```ts
const machine = flow.machine<PostsContext, PostsEvent>()({
  id: "posts.screen",
  initial: "list",
  context: () => ({ selectedPostId: null }),
  states: {
    list: {},
    detail: {},
    refreshing: {},
  },
});
```

The unbound `flow.machine({ ... })` form remains the normal path when its context
and literal events infer safely. The accepted API has no type-only setup object
and never asks callers to repeat the State union.

## Resource selection and outcomes

A fixed resource remains `flow.ensure(resource.ref(...))`. Parameters selected
from machine context or the entering event use one inspectable descriptor form:

```ts
flow.ensure(projectPageResource, {
  params: ({ context }: flow.ResourceParams<FeedContext>) => [context.frontier],
});

flow.refresh(postDetailResource, {
  params: ({ context }: flow.ResourceParams<PostsContext>) => [context.selectedPostId],
  routes: flow.outcomes<Post, PostError, PostsEvent>({
    success: () => ({ type: "REFRESHED" }),
    failure: ({ error }) => ({ type: "REFRESH_FAILED", error }),
    defect: () => ({ type: "REFRESH_DEFECT" }),
    interrupt: () => ({ type: "REFRESH_INTERRUPTED" }),
  }),
});
```

The definition retains query mode, resource descriptor, selector, and typed
routes; runtime entry resolves one exact ref and owns its lookup, cleanup,
replacement, behavior facts, and receipts. Posts uses `list`, `detail`, and
`refreshing`; Feed uses `browsing` and `refreshing`, so IDs and cursors stay in
context instead of machine topology.

## Outcome routing

Every asynchronous owner uses an optional `routes` object whose callbacks return
machine events. Resources, transactions, and children use the lanes `success`,
`failure`, `defect`, and `interrupt`; streams use `value`, `done`, `failure`,
`defect`, and `interrupt` because a stream can emit many values before its
successful terminal `done`. Only owners that observe a lane may route it, and
stale or replaced generations route nothing.

`flow.outcomes(...)` remains the checked helper for the four terminal lanes.
Resource success receives the loaded value, child success receives the child's
final snapshot, typed failure preserves the declared error channel, and defect
and interruption remain distinct. The temporary resource-only `onSuccess` event
is removed after callers migrate because it neither represents the other lanes
nor shares the accepted route model.

## Callback inference

Transaction `Params` comes from `params`, while Value, Error, and Requirements
come from the returned Effect; stream Params comes from `params`, and its Value,
Error, and Requirements come from the returned Stream. Route callbacks contribute
only the routed Event union and cannot widen those Effect families. Explicit
annotations remain allowed where a selector's Context/Event boundary is genuinely
ambiguous, including the two ceremony machines above.

## Verification

The implementation migrated Basic Cached Posts and Bounded Infinite Feed to
behavioral states and selector-backed resource identities. The final review
removed their remaining handwritten State aliases, and `BUG-99` records the
packed child-declaration compatibility defect found and closed during proof.

The following gates passed on 2026-07-15:

- focused resource, child, behavior, public-type, ceremony runtime, and React
  tests: 128 tests
- source, TypeScript-mode, declaration-emission, and packed-consumer proofs
- `pnpm fmt` and `pnpm lint`
- `pnpm verify`: 1,054 tests, all maintained example builds, packed CLI
  acceptance, Chromium acceptance, and the documentation build

The thermo-nuclear re-review found no remaining structural, Effect-channel,
ownership, cleanup, or deterministic-test blocker in the P6.1 slice.

## Child workflow input correction

The first incident-console runbook slice exposed `BUG-100`: an owned child could
not receive the selected incident and run identity without mutable application
state. P6.1 was reopened and `flow.child` gained one optional `input` selector:

```ts
flow.child({
  id: "incident.runbook",
  machine: runbookMachine,
  input: ({ context, event }) => ({
    incidentId: event?.incidentId ?? context.selectedIncidentId,
    runId: context.runId,
  }),
});
```

The selector runs exactly when the parent enters the owning state, constructs
the exact child context, and receives the optional entering event. Reentry
selects a replacement snapshot, while restoration uses the persisted child
snapshot without replaying the selector. A thrown selector becomes the typed
`FLOW-CHILD-002` diagnostic before child snapshot creation or actor ownership.

Source and packed negative proofs reject foreign parent context, parent event
narrowing, and incorrect child context output. Focused runtime, rehydration,
behavior, and public-type tests passed with 141 tests; `pnpm fmt`, `pnpm lint`,
and the full `pnpm verify` gate passed with 1,056 tests, maintained example
builds, packed consumers, CLI acceptance, Chromium acceptance, and docs build.
