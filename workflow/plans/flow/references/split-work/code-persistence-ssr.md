# Persistence, multi-tab, SSR, lazy loading: what the code has

Short answer to "we already have persistence built in, right?": **No.** Neither package has storage
I/O. A repo-wide grep finds no KeyValueStore, localStorage, sessionStorage, indexedDB,
BroadcastChannel or navigator.locks in either package. The old package (packages/flow-state) has a
working, tested **serialise/restore and SSR boot handoff**. The rewrite has only `persist` flags and
one tested restore admission path.

## 1. Persistence

### Old package, packages/flow-state (frozen)
- No storage adapter, no persistence provider. The docs say "generalized offline persistence" is
  outside the alpha (apps/docs/src/pages/reference/status.mdx:32-33).
- Snapshot model: `actor.serialize(): FlowActorSnapshotTree` (src/core/api/runtime-types.ts:41).
  The tree holds value, context, resources, transactions, streams, timers, children and receipts
  (src/core/api/snapshot-types.ts:202-212). Timer snapshots carry generation, startedAt and dueAt
  (snapshot-types.ts:172-180).
- Restore: `createActor(machine, { snapshot })` (runtime-types.ts:95-106). It rehydrates state-owned
  timers, streams and children without replaying entry work
  (src/core/orchestrator/orchestrator-system.ts:433-441; orchestrator-children.ts:730;
  orchestrator-stream-ownership.ts:444; orchestrator-after-timer-ownership.ts:195).
- In-flight work: pending transactions must carry their `transaction:start` receipt. Queued
  transactions are rejected. Timers are checked for generation, timing, owner and state
  (src/runtime-rehydration.test.ts:929-2012, about 22 cases).
- Resources: `resources.hydrate` and `dehydrate` (src/core/store/resource-store-memory.ts:328-452;
  runtime-types.ts:53-54). Newer data wins on merge. Durable keys are asserted
  (resource-store-memory.ts:434).
- Versioning: a payload tag "flow-state/runtime-boot.v1". A mismatch fails closed with
  FLOW-RUNTIME-001 (src/runtime/contract-runtime.ts:66; src/shared/diagnostics.ts:589-591).
  There are no migrations.
- Corruption handling: a strong bounded decoder (src/runtime/runtime-boot-decoder.ts, 648 lines).
  Limits are depth 32, 10k nodes, 4096-item arrays, 256 KB strings and a 2 MB payload (lines
  13-18). It rejects hostile and uninspectable input (runtime.test.ts:1003, 1086).
- vnext AppPlan carries `persistenceVersion` and `persistenceFingerprint`
  (src/vnext/app-plan.ts:134, 143, 311). Nothing consumes them.
- Tests: src/runtime-rehydration.test.ts (2,095 lines), src/flow-test-rehydration.test.ts
  (4,142 lines), runtime.test.ts:419-1410 and src/react/use-actor.test.ts:244.

### Rewrite, packages/flow-state-rewrite
- Public persistence names are deferred and commented out: `persistence`, `webStorage`,
  `indexedDbStorage`, `FlowPersistenceError` and seven Persistence* types (src/index.ts:15-18, 42-44;
  src/public/root.ts:34-35). There is no src/persistence directory.
- Flags only: `persist` on resource, transaction and stream are admitted and stored
  (src/operation/resource.ts:160,189,321; transaction.ts:115,167,264; stream.ts:117,138,197).
  `actorRef(..., { persist })` exists (src/runtime/actor-ref.ts:37-88, 181). App admission checks
  `persistenceVersion` (src/app/app.ts:118, 288-309, 661). No code reads the flags for I/O.
- Restore seam: runtime actor options `restore: PreparedActorSnapshot` plus
  `restoredMachineTurnRevision` (src/runtime/runtime.ts:183-192, 426-502). It requires a persisted,
  stable ref (src/runtime/actor-admission.ts:1243-1244). `prepareActorSnapshot` admits the exact
  key shape, including state, memory, context, lifecycle, operations, timers, issues and revisions
  (src/runtime/actor-engine.ts:1003-1030). Snapshots carry a private brand
  (actor-engine.ts:88-93, 1092). The lifecycle has an `actor:restore` command
  (src/runtime/lifecycle.ts:67, 564, 616). runtime-next has a `restored` flag
  (runtime-next/actor/actor-engine-lifecycle.ts:97-98).
- Tests: 2 to 3 cases (src/runtime/test/actor-admission.test.ts:1663-1708).
- There is no capture, writer, codec or storage.

### Reuse under the new design (KeyValueStore + { scope, version })
- No storage code exists to reuse. S6 is greenfield. FlowState.plan:348 and D41 already assume this.
- Worth carrying over:
  - the decoder's bounds and fail-closed version check, now as Schema decoding;
  - the restore rules for in-flight work: pending transactions need start evidence, queued ones
    are rejected, and timer generation, dueAt and owner-state checks;
  - newer-wins resource merge;
  - the rewrite's rule that restore requires `persist: true`.

## 2. Multi-tab
- Nothing in code. The archive marks it as missing: explorations/reference-review.md:251 (a
  "Same-scope writer lock or refusal (P10)"). Persistence.plan:31-32, 227 explicitly excludes
  cross-tab sync.
- The new design says a second tab runs without persistence and reports a diagnostic
  (minimal-library.md:589-590; FlowState.plan:230). Web Locks or BroadcastChannel would be new work.

## 3. SSR and hydration
- Old package: **real and tested**.
  - `flow-state/server` exports `withRequestRuntime` (src/server.ts). It creates, acquires and
    disposes the runtime, and aggregates errors (src/runtime/request-runtime.ts).
  - `runtime.dehydrateBoot({ actors })` takes a synchronous committed cut and rejects unowned actors
    (contract-runtime.ts:297-334, 501-506). `hydrateBoot(unknown)` decodes the payload, registers
    resource refs and hydrates the store (contract-runtime.ts:508-518).
  - React: `useSource` passes getServerSnapshot to useSyncExternalStore (src/react/use-source.ts:1-22).
    `useActor` renders an inert shell from the boot snapshot, then attaches after mount
    (src/react/use-actor.ts:20-50).
  - Tests: runtime.test.ts:419, 545, 586, 807, 958, 1003, 1100, 1289, 1336, 1410;
    src/react/use-source.test.ts:8, 22.
  - Docs: apps/docs/src/pages/guide/server-hydration.md (161 lines, narrow scope, no RSC). The App
    Router example `examples/server-prefetch-hydration` and Next.js examples were deleted in
    0fc2d194 (2026-08-17). They are only in git history, for example 828bcc1a.
- Rewrite: none. src/react-entry.ts is a deferred stub.
- New design: out of scope for v1 (minimal-library.md:593-594, 750; FlowState.plan:222, 390, 556).
- Archive mentions: ReactAndHosts.plan:5-7, 23, 87-96, 126, 146; Resources.plan:142, 236, 277;
  ProjectDelivery.plan:37, 141 ("SSR waits for persistence"); SurfaceSimplification.plan:190;
  ApplicationsAndActors.plan:355 (public boot/decode/hydrate/dehydrate excluded);
  Persistence.plan:88, 158, 228; README.md:28; reference-review.md:254.

## 4. Lazy loading
- Neither package supports it. Both use a closed app module universe: rewrite src/app/app.ts:119,
  277-310, 413; old vnext `admitsCreation` and `resolveMachine` (app-plan.ts:313-316). Old resource
  refs register globally (src/core/api/resource-runtime.ts:53).
- The archive excludes runtime registration and allows a "separately scoped lazy application
  island" (ApplicationsAndActors.plan:352-358).
- New design: open and deferred, sketched as
  `lazy(() => import(...))` (minimal-library.md:122-124, 751; FlowState.plan:556).

## 5. Machinery SSR could reuse
- Old: the synchronous committed cut in `dehydrateBoot`, the versioned and bounded boot payload, the
  per-request runtime wrapper, the inert render shell plus getServerSnapshot, and newer-wins
  resource hydration.
- Rewrite: `prepareActorSnapshot` exact-shape admission and the branded PreparedActorSnapshot, plus
  the `restore` runtime option and lifecycle command. These are the closest analogues to a Schema
  capture and restore. Under the new design, the S6 persistence capture and restore, encoded with
  definition Schemas, should be the one path that SSR later reuses with an in-memory KeyValueStore.
  That reuse is what minimal-library.md:593-594 implies.
