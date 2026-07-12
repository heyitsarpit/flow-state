# Phase 1 — Canonical identity, runtime ownership, and Effect lifecycle

[Back to the roadmap](../TASK.md)

Goal 1 works only in this phase. It establishes the production owners consumed
by transactions, streams, timers, children, testing, React, server, inspection,
and CLI. Those later families may expose minimal integration seams here but may
not be implemented in Phase 1.

Some Phase 1 code is already present and is being revalidated by Recovery.
Goal 1 resumes only after Review R passes.

You can reference the effect-v4 codebase to learn how to use a Effect feature: `/Users/arpit/Developer/flow-state/docs/codebases/effect-v4`.

## P1A — Definitions, identity, and resource lifecycle

### [x] P1A.0 Safe definitions and app identity

- Copy/freeze library-owned configuration containers so later caller mutation
  cannot alter machine, module, or app meaning.
- Validate IDs against reserved/prototype keys, control characters, duplicates,
  delimiter ambiguity, and inventory overwrites.
- Keep canonical app ownership identity stable under module reorder while
  allowing a separate stable presentation label.
- Preserve exact module/app types and Layer requirements without broad app casts.

### [x] P1A.1 Inert resource refs

- `resource.ref(...)` derives identity only; it does not perform lookup, tags,
  placeholder work, registration, or inspection callbacks.
- Runtime ResourceStore owns executable resource behavior. Definitions describe;
  owners execute.

### [x] P1A.2 Collision-safe canonical keys

- Equal supported keys produce equal canonical identity; distinct primitives,
  tuples, and durable objects cannot collide through stringification or ordering.
- Reject cyclic, sparse, accessor/proxy/class, oversize, executable, and otherwise
  unsupported durable inputs without running client coercion hooks.
- Copy/freeze accepted durable input and keep runtime-local identity bounded by
  its runtime owner.

### [x] P1A.3b Actor and transaction identity projections

- Registry-issued provenance distinguishes apps, runtimes, actors, definitions,
  and generations even when public IDs match.
- Forged, foreign, duplicate-install, or wrong-owner refs fail explicitly.
- Diagnostics expose bounded opaque identity, not raw key/param values.

### [x] P1A.4a Resource lifecycle, freshness, and scoped invalidation

- [x] Snapshot availability/status types preserve present `undefined` and reject
      empty snapshots with present values.
- [x] Shared lookup work is ResourceStore-scoped and survives first waiter
      interruption while another waiter remains.
- [x] Final waiter interruption cancels ResourceStore-scoped shared lookup work
      and prevents abandoned late results from publishing.
- Model absent, loading, placeholder, ready, refreshing, stale, failed, paused,
  and interrupted states without contradictory optional value/error fields.
- Preserve present `undefined` and all other falsy values.
- Deduplicated lookup leases, refresh, invalidation, interruption, and finalizers
  belong to ResourceStore Scope; stale generations cannot publish.

### [x] P1A.4b Registry-owned tag identity

- Tags are inert registered identities. Same-ID compatible tags reuse one
  semantic tag; incompatible metadata fails registration.
- Tag invalidation reaches matching canonical refs without evaluating callbacks
  during app compilation.

### [x] P1A.4c Directional resource typing

- Params and Value flow from the authored resource through ref, lookup, store,
  testing, adapters, and packed declarations without restated generics.
- Wrong params, values, owners, tags, and fixtures fail locally.

### [x] P1A.4d Prevalidated resource restore

- Internal restore accepts only a complete immutable decoded resource state.
- Restore validates ownership/generation compatibility and commits atomically;
  it is not a second public decoder or store.

## P1B — Canonical ResourceStore

### [x] P1B.1 One resource owner

- One ResourceStore owns records, in-flight lookups, freshness, subscriptions,
  restore, and resource mutation.
- Host, testing, React, inspection, and server surfaces delegate to it rather
  than retaining ID-only caches or shadow snapshots.
- Unknown/foreign refs return `null` and cannot manufacture authoritative empty records.
- Shared lookup survives one waiter interruption and finalizes after its final lease.

### [x] P1B.2 Atomic mutation and notification

- Seed, patch, invalidation, hydration, preview, and multi-ref operations publish
  one coherent post-operation snapshot per logical batch.
- Listener order is deterministic; reentrant work starts a later batch; throwing
  selectors/listeners do not corrupt committed state or starve later observers.
- Selection/subscription caches release after the final subscriber and cannot
  remove a newer generation.

## P1C — Canonical actor owner

### [x] P1C.1 Ownership domains

- One OrchestratorSystem registry owns actor incarnations and explicit
  registered, focused single-definition, inherited-child, and request ownership.
- Unregistered, ambiguous, wrong-app, or same-ID/different-definition starts fail
  before work. No hidden empty app or adapter registry authorizes them.
- Unsupported start/concurrency policies are closed unions, not fallback strings.

### [x] P1C.2 One actor read path

- `getSnapshot()` is the single actor read method with side-effect-free behavior
  and exact return type.
- Cutover marker: migrate runtime, testing, React, Scenario, and inspection
  callers from `snapshot()` to `getSnapshot()`; remove `snapshot()` after the
  owning caller inventory is complete, per CV-2.

### [x] P1C.3a Stop, finalizers, and exact eviction

- Stop marks an incarnation closing, rejects new work, interrupts owned work,
  awaits finalizers, records complete Cause, and evicts only that generation.
- Repeated stop/dispose is idempotent; stale cleanup cannot delete replacement.

### [x] P1C.3b Attachment and keep-alive leases

- Compatible leases reuse the same actor; incompatible same-ID definitions fail.
- Final detach stops according to the documented policy. One consumer cannot
  stop an actor still owned by another lease.

### [x] P1C.4a Registry authority before activation

- Install incarnation and publication authority before initial, restored,
  state-owned, or synchronously completing work can publish.

### [x] P1C.4b Canonical mailbox and bounded turns

- Per-actor delivery is FIFO and non-reentrant. Admission occurs before client work.
- Bounded scheduler turns let another ready actor progress without promising
  strict global fairness or using quadratic queue operations.
- Stop/replacement invalidates queued stale generations before publication.

### [x] P1C.5 Canonical transition owner

- Production dispatch alone owns guard, exit, update, target, entry, state
  publication, and owned-work activation.
- `flow.can` and test paths delegate to the same transition semantics without
  running work or swallowing guard defects.

## P1D — Effect host, shutdown, facts, and evidence

### [x] P1D.1a Host boundary and Layer composition

- Services expose exact Effects; Layers declare real output/error/remaining
  requirements. ManagedRuntime exists only at genuine host/request/test/CLI boundaries.
- Promise wrappers adapt outside semantic ownership and do not create callback islands.

### [x] P1D.1b Exact Layer and packed typing

- Variadic Layer composition preserves exact output, acquisition error, and
  unprovided requirements through source and packed declarations.

### [x] P1D.1c Cross-owner shutdown

- Runtime shutdown marks owners closing, rejects new work, attempts every
  finalizer even after failures, aggregates complete Cause, evicts exact
  generations, and closes Layer Scope.
- Resource, actor, transaction, stream, timer, and child owners keep their local
  Scopes while participating in this one shutdown graph.
- [x] Host-owned cancellation can stop waiting for graceful shutdown through a
      caller-provided `AbortSignal` without inventing a library timeout or
      claiming cleanup finished after the host stops waiting.
- [x] Partial app-layer acquisition under `effect@4.0.0-beta.86` proves
      acquired-resource cleanup and honest masked-cause reporting, and Flow no
      longer claims the original acquisition failure survives a rollback cleanup
      failure through the current public `Layer` / `ManagedRuntime` APIs.

### [x] P1D.2 Production/test delegation

- Each family turns off its test-owned semantic engine when the production owner
  is available. Test controls may drive Clock, Deferred, Queue, or Stream but do
  not decide production semantics.
- [x] `flowTest(machine)` now boots a lazy started-builder on the production
      runtime path for focused machines, so its event dispatch, owned work, and
      deterministic controls no longer depend on the legacy test-only semantic
      engine.
- [x] `test.rehydrate(...)` and `test.app(App).rehydrate(...)` now keep their
      read, trace, timer, pending-work, and bounded developer-loop helpers on
      the production runtime path instead of forcing callers back onto the
      legacy `flowTest` engine for those controls.
- [x] The dominant `test(machine).with(...).run()` and
      `test.app(App).scenario(machine).with(...).run()` builders now delegate
      no-input, input-seeded, and custom-clock scenarios to the production
      runtime path, with custom `clock()` overrides now setting the runtime
      `TestClock` instead of routing time through a legacy test-only semantic
      engine.

### [x] P1D.3a Post-commit facts

- State commits first; immutable facts publish afterward from the owning
  generation, so receipt/inspection observers never see a stale pre-commit
  actor snapshot for the transition they are observing.

### [ ] P1D.3b Bounded evidence and observer isolation

- [ ] Retention is bounded with explicit gap/truncation facts. Evidence is not
      business state and contains redacted immutable values.
  - [x] Runtime inspection snapshots now expose `truncatedBeforeSequence` for
        ring-buffer and time-window retention, so retained evidence makes
        sequence gaps explicit without mutating captured snapshots.
  - [x] Runtime actor snapshots and `TraceLog` now expose
        `truncatedBeforeReceiptCount` under bounded receipt retention, so live
        reads and serialized actor evidence keep receipt gaps explicit.
- [x] Throwing actor listeners and runtime inspection observers are isolated,
      so they cannot roll back committed state or prevent later observers from
      receiving the same batch.
- [ ] Slow observers are isolated and cannot corrupt sequencing or starve later
      observers.
  - [x] Runtime actor listeners and runtime inspection observers now route
        through `NotificationScheduler`, so committed state and evidence publish
        before observer work and queued callbacks cancel on unsubscribe.

## Phase 1 exit

- One ResourceStore and one OrchestratorSystem remain as semantic owners.
- Identity, activation, lifecycle, shutdown, notification, and evidence tests pass.
- Exact source and packed types preserve the supported public cutover contract
  and Effect channels.
- No transaction, stream, timer, child, React, server, or inspection substitute
  was implemented to make the foundation tests pass.
