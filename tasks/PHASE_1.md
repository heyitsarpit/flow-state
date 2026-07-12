# Phase 1 — Canonical identity, runtime ownership, and Effect lifecycle

[Back to the roadmap](../TASK.md)

Goal 1 works only in this phase. It establishes the production owners consumed
by transactions, streams, timers, children, testing, React, server, inspection,
and CLI. Those later families may expose minimal integration seams here but may
not be implemented in Phase 1.

Some Phase 1 code is already present and is being revalidated by Recovery.
Goal 1 resumes only after Review R passes.

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

### [ ] P1A.4a Resource lifecycle, freshness, and scoped invalidation

- [x] Snapshot availability/status types preserve present `undefined` and reject
      empty snapshots with present values.
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

### [ ] P1C.4a Registry authority before activation

- Install incarnation and publication authority before initial, restored,
  state-owned, or synchronously completing work can publish.

### [ ] P1C.4b Canonical mailbox and bounded turns

- Per-actor delivery is FIFO and non-reentrant. Admission occurs before client work.
- Bounded scheduler turns let another ready actor progress without promising
  strict global fairness or using quadratic queue operations.
- Stop/replacement invalidates queued stale generations before publication.

### [ ] P1C.5 Canonical transition owner

- Production dispatch alone owns guard, exit, update, target, entry, state
  publication, and owned-work activation.
- `flow.can` and test paths delegate to the same transition semantics without
  running work or swallowing guard defects.

## P1D — Effect host, shutdown, facts, and evidence

### [x] P1D.1a Host boundary and Layer composition

- Services expose exact Effects; Layers declare real output/error/remaining
  requirements. ManagedRuntime exists only at genuine host/request/test/CLI boundaries.
- Promise wrappers adapt outside semantic ownership and do not create callback islands.

### [ ] P1D.1b Exact Layer and packed typing

- Variadic Layer composition preserves exact output, acquisition error, and
  unprovided requirements through source and packed declarations.

### [ ] P1D.1c Cross-owner shutdown

- Runtime shutdown marks owners closing, rejects new work, attempts every
  finalizer even after failures, aggregates complete Cause, evicts exact
  generations, and closes Layer Scope.
- Resource, actor, transaction, stream, timer, and child owners keep their local
  Scopes while participating in this one shutdown graph.

### [ ] P1D.2 Production/test delegation

- Each family turns off its test-owned semantic engine when the production owner
  is available. Test controls may drive Clock, Deferred, Queue, or Stream but do
  not decide production semantics.

### [ ] P1D.3a Post-commit facts

- State commits first; immutable facts publish afterward from the owning
  generation. Evidence or observers cannot veto semantic publication.

### [ ] P1D.3b Bounded evidence and observer isolation

- Retention is bounded with explicit gap/truncation facts. Evidence is not
  business state and contains redacted immutable values.
- Throwing or slow observers are isolated and cannot roll back state, corrupt
  sequencing, or starve later observers.

## Phase 1 exit

- One ResourceStore and one OrchestratorSystem remain as semantic owners.
- Identity, activation, lifecycle, shutdown, notification, and evidence tests pass.
- Exact source and packed types preserve the supported public cutover contract
  and Effect channels.
- No transaction, stream, timer, child, React, server, or inspection substitute
  was implemented to make the foundation tests pass.
