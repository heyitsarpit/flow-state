# Launch Workspace

Status: vNext API proving app.

This example is intentionally contract-first. It wires the
`flow.module`, `flow.resource`, `flow.transaction`, `flow.machine`, `flow.view`,
`flow.app`, `App.layer`, and `flowTest` shapes. `flow.transaction({ params,
commit, preview })` is executable for the project save and approval write paths,
while `flow.run` is only kind-checked here; tested saves use transition submit
and record `transaction:*` receipts.

The browser proof app now boots through Next.js App Router on `next@16.2.9`
with one `"use client"` boundary in `app/LaunchWorkspaceClient.tsx`. That
boundary owns the browser runtime factory and cleanup, while `app/page.tsx`
creates one request-scoped boot payload through `withRequestRuntime(...)`.
Public resource-cache dehydrate/hydrate, actor snapshot serialize/restore, and
versioned runtime boot payloads are now executable for that narrow server-to-
client handoff subset.

This example still resolves `flow-state` through built `dist`. Rebuild
core with `pnpm --filter flow-state build` before trusting Launch
Workspace test or build results after core edits.

What is real in this slice:

- domain schemas, branded IDs, typed failures, redacted approval fields, and
  fake Effect service Layers
- direct `@effect/vitest` service tests for Schema decoding, validation, typed
  failures, redaction, `RequestResolver` batching, nested Layer overrides, and
  `TestClock`-driven timestamps
- `src/launchWorkspaceServices.effect.test.ts` for service-owned proofs
- `src/launchWorkspace.test.ts` for Flow harness proofs across resources,
  transactions, streams, and child actors, while keeping one-shot async
  gates on `Deferred` and reserving `createControlledStream` for stream-owned
  runtime facts
- `src/launchWorkspaceShell.test.tsx` for DOM rendering and hydration proofs
- a cohesive Launch Workspace module graph covering Overview, Editor, Assets,
  Approval, Assistant, Chat, and Trace
- executable screen-level flow/view tests using current `flowTest`
- seeded app ResourceStore and module-fixture tests using `test.app(...)`
- preview project save transaction tests covering ResourceStore patch and
  rollback receipts
- chat lifecycle tests covering keep-alive actors, route detach/reattach,
  explicit disposal, STOP_GENERATION interrupts, and stream generation
  snapshots
- API coverage tests that mark descriptor-only vNext surfaces explicitly
- a linked API inventory in `API_INVENTORY.md`
- a thin React shell that renders the product surface without pretending to be
  a production app

What remains partial or deferred:

- broader `flow.resource` cache capacity, TTL, and invalidation policy beyond
  the seeded and actor-owned slices proved by the runtime tests
- `flow.observe` mode and subscription-lifetime proof beyond resource-start ids
- standalone `flow.run` and `flow.patch` execution; current behavior tests cover
  transition submit and transaction preview instead
- offline queue, undo rollback, reconnect replay, and persistence across
  reloads
- stream pressure counters and broader runtime-owned stream diagnostics
- `flow.after` timer execution in this example: the descriptor is wired, but no
  Launch test currently drives the timer behavior, so the API inventory keeps
  it contract-only
- generated typed hooks and module-level schema/error manifests

Readiness and product projections now read canonical resource, transaction,
stream, child, issue, and domain snapshots. Receipt history is confined to the
Trace panel and the debug panel's explicitly diagnostic recent-evidence list,
so clearing or truncating evidence cannot change rendered business state.
