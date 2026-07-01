# Launch Workspace

Status: vNext API proving app.

This example is intentionally contract-first. It wires the final-looking
`flow.module`, `flow.resource`, `flow.transaction`, `flow.machine`,
`flow.view`, `flow.app`, `App.layer`, and `flowTest` shapes while the runtime
catches up. `flow.transaction({ params, commit, preview })` is executable for
the project save and approval write paths, `flow.run` is the machine-side
invoke descriptor, and transaction execution facts are recorded through
`transaction:*` receipts.

The browser proof app now boots through Next.js App Router on `next@16.2.9`
with one `"use client"` boundary in `app/LaunchWorkspaceClient.tsx`. That
boundary owns the browser runtime factory and cleanup, while `app/page.tsx`
creates one request-scoped boot payload through `withRequestRuntime(...)`.
Public resource-cache dehydrate/hydrate, actor snapshot serialize/restore, and
versioned runtime boot payloads are now executable for that narrow server-to-
client handoff subset.

This example still resolves `@flow-state/core` through built `dist`. Rebuild
core with `pnpm --filter @flow-state/core build` before trusting Launch
Workspace test or build results after core edits.

What is real in this slice:

- domain schemas, branded IDs, typed failures, redacted approval fields, and
  fake Effect service Layers
- direct `@effect/vitest` service tests for Schema decoding, validation, typed
  failures, redaction, and `RequestResolver` batching
- a cohesive Launch Workspace module graph covering Overview, Editor, Assets,
  Approval, Assistant, Chat, and Trace
- executable screen-level flow/view tests using current `flowTest`
- seeded app ResourceStore and module-fixture tests using `flowTest.app`
- preview project save transaction tests covering ResourceStore patch and
  rollback receipts
- chat lifecycle tests covering keep-alive actors, route detach/reattach,
  explicit disposal, STOP_GENERATION interrupts, and stream generation
  snapshots
- API coverage tests that mark descriptor-only vNext surfaces explicitly
- a linked API inventory in `API_INVENTORY.md`
- a thin React shell that renders the product surface without pretending to be
  a production app

What is contract-only:

- live app-level ResourceStore `lookup` execution for `flow.resource`
- offline queue, undo rollback, reconnect replay, and persistence across
  reloads
- `flow.ensure`, `flow.observe`, `flow.refresh`, `flow.patch`, and
  `flow.invalidate` live runtime behavior
- final stream `subscribe` field naming, service lifetime `dispose`, pressure
  counters outside generation-local emitted counts, and broader runtime-owned
  stream disposal
- `flowTest.advance` / `settle` virtual-time semantics
