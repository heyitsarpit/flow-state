# Phase 1 — Canonical identity, runtime ownership, and Effect lifecycle

[Back to the plan tracker](../TASK.md) · [Previous: Phase 0](./PHASE_0.md) · [Next: Phase 2](./PHASE_2.md)

Manifest only; live packet readiness is tracked in [TASK.md](../TASK.md). Phase
1 is a grouping, not a blanket dependency gate.

Effect construction is governed by the
[binding Effect architecture blueprint](./EFFECT_ARCHITECTURE.md)
and the approved P0.6 `EFFECT_ARCHITECTURE.md` receipt. Packets may narrow that
map but may not invent another DI, runtime, lifecycle, queue, clock, stream,
failure, or host-conversion substrate.

Execution dependency: P1A.0 and P1D.1a may start independently after P0.6.
P1D.1a establishes only host/service/Layer composition and the ManagedRuntime
boundary; it must not claim ResourceStore or actor Scope ownership before those
owners exist. Pure identity then precedes ResourceStore, while actor ownership
may proceed from P1A.0 plus P1D.1a. Follow the packet DAG in TASK.md.

## Phase 1A — Pure resource definitions and keyed identity

Purpose: establish the identity used by every later semantic owner before
consolidating stores, actors, previews, adapters, or hydration.

### `P1A.0` Safe definition normalization and app identity

This is the first Phase 1 production packet. It closes BUG-27/28/29 before
resource provenance or actor ownership relies on mutable/collidable definitions.

- [ ] Replace module-order/delimiter app identity with the DEC-3 canonical
      sorted, length-delimited identity.
- [ ] Validate module/app/descriptor IDs and inventory fields before constructing
      or installing ownership. Reject reserved/prototype-like names, control
      characters, oversize identifiers, duplicates, and attempts to overwrite
      `kind`, `id`, `meta`, or `inventory`.
- [ ] Use `Map` or null-prototype records for user-keyed registries.
- [ ] Copy and freeze library-owned module arrays, inventory records, state maps,
      metadata arrays, and descriptor config containers at construction.
- [ ] Do not deep-freeze arbitrary domain values or execute callbacks while normalizing.
- [ ] Close BUG-38 by removing/narrowing the broad Launch Workspace app
      annotation only after P0.3 proves the exact inferred module tuple/map in
      source and packed declarations; do not replace it with restated generics.

Files: `descriptors/app.ts`, `descriptors/module.ts`, descriptor constructors and
validation, app ownership identity helpers, diagnostics, and focused descriptor/
inventory/type tests. Do not alter public constructor call shapes.

Tests: module reorder identity; delimiter-shaped IDs; `__proto__`, `prototype`,
`constructor`, control/oversize, and inventory collision table; caller mutation
after construction; original domain values remain client-owned; invalid app
produces no partial Layer/ownership registration.

Commands: `F(packages/flow-state/src/app-inventory.test.ts
packages/flow-state/src/diagnostics.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `E`, `C`.

### `P1A.1` Pure ref construction and executable definition ownership

- [ ] Make `resource.ref(params...)` the canonical instance reference without
      capturing lookup/tag/placeholder Effects or values.
- [ ] Ensure metadata/ownership compilation never executes client callbacks.
- [ ] Keep explicit ref construction deterministic: it may derive the key once,
      but lookup/tags/placeholder execute only inside the ResourceStore owner.
- [ ] Preserve exact Params/Value/Error/Requirements through the definition/ref seam.

Files: `descriptors/resource.ts`, resource runtime detail types,
`core/api/resource-transaction-types.ts`, resource callback helpers,
`core/store/resource-store-lookups.ts`, app ownership compilation, and focused
tests. Remove `__runtime` only after all store callers read the registered
definition through one validated internal registry.

Tests:

1. Creating a definition and compiling an app calls no callback.
2. Calling `ref` calls only `key`, exactly once; it does not call lookup, tags,
   or placeholder and does not construct a lookup Effect eagerly.
3. `ensure`/`refresh` execute lookup at the owner with exact typed failure and
   requirements; interruption runs finalization once.
4. Unknown/unregistered refs fail explicitly rather than carrying hidden work.
5. Inspection/graph/coverage over the definition calls no client callback.

Commands: `F(packages/flow-state/src/resource-callbacks.test.ts
packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/app-inventory.test.ts
packages/flow-state/src/behavior-contract.test.ts)`, `T`, `P`, `E`, `C`.

### `P1A.2` Collision-free canonical key encoder

- [ ] Prove zero-, one-, and many-parameter instances cannot collide.
- [ ] Replace raw `JSON.stringify` identity with the binding-decision encoder.
- [ ] Preserve accepted runtime-local key inputs and reject non-durable keys only
      when encoding/dehydrating a durable payload.
- [ ] Keep descriptor ID plus an opaque bounded instance ID in diagnostics/receipts;
      never expose the raw canonical encoding or caller key values by default.

Files: `core/api/keys.ts`, `core/store/invalidation.ts`, a narrowly named
canonical-key module if separation helps, diagnostics, public key types only if
necessary, and focused store/type tests.

Required matrix:

- `[]`, `[undefined]`, `[null]`, `[""]`, `[0]`, `[-0]`, `[NaN]`, infinities,
  bigint, booleans, strings, nested arrays, and sorted plain objects;
- values that raw JSON collapses; different descriptors with the same key;
- same descriptor/key produces equal identity; object insertion order does not
  change structural identity; cycles and unsupported durable values diagnose;
- own-data plain records only: accessors/getters, symbol keys, functions,
  class/Date/Map/Set/cross-realm instances, unsupported sparse arrays, proxies,
  coercion hooks, and `toJSON` reject without intentionally invoking client code;
- depth/node/string/array limits reject before unbounded traversal or allocation;
- mutating a caller-owned nested object after ref creation cannot move the ref to
  another store identity or corrupt lookup/subscription maps;
- no user-controlled delimiter can make two encoded tuples equal.

Reference reading — anti-reference only: inspect
`docs/codebases/tanstack-query/packages/query-core/src/utils.ts` and
`docs/codebases/tanstack-query/packages/query-core/src/__tests__/utils.test.tsx`
to understand what sorted-object `JSON.stringify` does and does not distinguish.
Do not copy `hashKey` or make serialization equal runtime identity; add Flow
State regressions for every collapse in the required matrix above.

Commands: `F(packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/public-api-types.test.ts
packages/flow-state/src/diagnostics.test.ts)`, `T`, `P`, `C`.

### P1A.3 canonical identity migration family

P1A.3 is preserved as a family label, not one cross-adapter packet.

- **P1A.3a is merged into P1B.1.** ResourceStore records, in-flight work,
  subscriptions, invalidation, host handles, and compatibility reads become
  canonical in the same packet that selects the authoritative store. There is
  no second receipt or duplicate owner.
- **P1A.3b is executable after P1B.1 and P1C.1.** Migrate actor resource facts
  and transaction preview/ref discovery to canonical instance identity without
  changing transaction policy.
- **P1A.3c is retired as a cross-cutting packet.** Testing, React, inspection,
  Launch Workspace, and hydration translate identity only in their owning
  family packets. Each adapter consumes the canonical projection; none owns a
  shared identity cache.

#### P1A.3b Actor and transaction identity projections

- [ ] Actor owned-resource keys and snapshots use canonical instance identity.
- [ ] Transaction target discovery and preview refs use that identity without
      changing concurrency, publication, or rollback semantics.
- [ ] Forged, duplicate-package, wrong-app, and wrong-runtime refs fail at the
      semantic attachment before any actor/transaction mutation.
- [ ] Descriptor-ID compatibility projection returns none, one unambiguous
      instance, or the typed ambiguity diagnostic; it never picks by order.
- [ ] Remove actor/transaction descriptor-ID fallback only when their exact
      caller inventory is empty.

Files: core/orchestrator/orchestrator-resources.ts, actor snapshot constructors,
transaction ref discovery/preview identity fields, and focused callers/tests.
Do not touch testing, React, inspection, hydration, or Launch Workspace here.

Tests: two instances remain independent in actor snapshots and transaction
target discovery; wrong provenance rejects before mutation; one-instance
compatibility works; two-instance compatibility is ambiguous; store and actor
project the same canonical identity.

Commands: F(packages/flow-state/src/runtime-invokes.test.ts
packages/flow-state/src/transactions.test.ts
packages/flow-state/src/resource-store.test.ts); T; P; E; C.

### P1A.4 resource lifecycle/type/restore family

#### P1A.4a Lifecycle, freshness, and scoped invalidation

- [ ] Prove lookup success, typed failure, defect, interruption, retry, and one finalizer.
- [ ] Model empty/loading/placeholder/ready/refreshing/stale/failed/paused/
      invalidated as a discriminated lifecycle that preserves present undefined
      and cannot represent contradictory value/error/status fields.
- [ ] Prove ensure, observe, and refresh have distinct documented ownership.
- [ ] Close BUG-46: invalidation refresh belongs to ResourceStore Scope and
      cannot outlive runtime disposal or publish from a stale generation.
- [ ] Use deterministic Effect Clock for freshness; no wall-clock fallback.

Files: resource lookup/lifecycle/snapshot/invalidation owner and focused tests.

Tests: full Exit/Cause/finalizer matrix; freshness table; ensure/observe/refresh
differential; scoped invalidation disposal; present undefined versus absent;
stale completion exclusion.

#### P1A.4b Registry-owned tag identity

- [ ] ID-only same-ID tags are compatible and intentional invalidation reaches
      all matching canonical instances.
- [ ] Optional metadata/schema on same-ID tags must be compatible or registration
      fails before partial ownership.
- [ ] App compilation and inspection never run tag callbacks.

Files: tag/app validation registry, invalidation projection, and focused tests.

Tests: compatible reuse; incompatible metadata/schema; unrelated tags remain
untouched; compilation/inspection invokes zero callbacks; two instances receive
separate canonical facts.

#### P1A.4c Directional resource typing

- [ ] Declared Params contextualize key/lookup/tags/placeholder/ref before any
      returned Effect contributes Value/Error/Requirements.
- [ ] Infer lookup success/failure/requirements only after Params is fixed.
- [ ] Add wrong params/ref/value/failure/schema source and packed fixtures.
- [ ] Preserve Schema-free local authoring and no mandatory boundary schema.

Files: resource public/callback types and dedicated source/packed fixtures. Do
not change lifecycle runtime behavior in this packet.

Tests: exact Params in every callback; narrower/wrong callback fails locally;
lookup preserves exact A/E/R; present undefined remains legal when declared;
source and packed declarations agree.

#### P1A.4d Prevalidated internal resource restore

- [ ] Accept only a complete immutable already-decoded resource state from the
      P4C boundary and validate target ownership before mutation.
- [ ] Commit the complete internal value once or mutate nothing.
- [ ] Never decode unknown, select a wire version, or invent v2 fields here.

Files: ResourceStore internal attachment seam and focused restore tests.

Tests: valid internal restore; wrong ref/app/runtime/schema attachment; one bad
entry among valid entries yields zero record/revision/notification mutation;
present undefined round-trips. Unknown/version/hostile-wire cases belong P4C.1a.

Commands for each subpacket: F(packages/flow-state/src/resource-callbacks.test.ts
packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts
packages/flow-state/src/public-api-types.test.ts); T; P; E; C.

### Phase 1A closure

- [ ] BUG-1/2/3/20/26/27/28/29/30/41R are closed with focused regressions.
- [ ] Keyed identity/collision/ordering matrix passes.
- [ ] Resource Launch Workspace rows are executable or honestly deferred.
- [ ] No duplicate cache or ID-only ambiguity remains on active production paths.
- [ ] No definition/app/inspection path executes client resource callbacks.

---

## Phase 1B–D — Canonical runtime ownership and Effect lifecycle

Purpose: establish owners every later family uses. This is consolidation, not a rewrite.

### `P1B.1` Canonical ResourceStore owner and host handles

This packet includes the former P1A.3a. Selecting the owner and migrating its
identity are one atomic consolidation task; do not land an instance-key adapter
in front of an ID-only store.

- [ ] Select/reuse `core/runtime/services/resource-store.ts` plus
      `core/store/resource-store-memory.ts` as the production owner unless P0.5
      proves a more complete existing owner.
- [ ] Route seed/read/lookup/subscribe/patch/invalidate/hydrate through that owner.
- [ ] Migrate store records, in-flight lookup deduplication, subscriptions,
      invalidation, notification keys, and runtime resource handles to canonical
      instance identity in the owner itself.
- [ ] Route flowTest resource seed/read/lookup/patch/invalidate/restore through
      this owner and delete/disable its ID-only resource write/cache path in the
      same receipt; temporary dual-read must assert equality.
- [ ] Define the zero/one/many descriptor-ID compatibility projection and remove
      ID-only fallback after the store caller inventory is empty.
- [ ] Prove host convenience methods cannot create a second cache or notification model.
- [ ] Preserve typed refs and Effect failures through runtime handles.
- [ ] Close BUG-42: `get` returns `null` for an unknown/foreign ref and a read
      never manufactures or registers an empty authoritative record.

Files: `core/runtime/services/resource-store.ts`, `core/store/**`,
`runtime/contract-runtime.ts`, runtime public handle types, presets, and store/runtime tests.

Tests: two instances of one definition retain independent value/status/in-flight
work/subscribers; patch/invalidate one leaves the sibling untouched; tag
invalidation may intentionally reach both with instance-specific facts;
descriptor-ID compatibility is unambiguous or diagnoses ambiguity; runtime
handle and direct service observe the same record and subscriber;
duplicate seed policy is explicit; in-flight lookup dedupes by instance; disposal
interrupts lookups/subscriptions; unknown get is null and mutation-free;
memory/test presets change services/clock, not semantics.

Commands: `F(packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/runtime.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts)`, `T`, `P`, `E`, `C`.

### `P1B.2` Patch, notification, and batch semantics

- [ ] Fix absent/current patch semantics without coercing arbitrary values through
      broad records at the public/semantic seam.
- [ ] Define one notification scheduler and deterministic batch order.
- [ ] Prove seed/lookup/patch/invalidate/hydrate publish at most one coherent
      post-operation snapshot per logical batch.
- [ ] Close BUG-43: compute the candidate selection, run selector/equality, and
      only then advance cached source state. A throwing selector/equality is a
      defect, leaves the previous snapshot authoritative, notifies no partial
      state, and permits later valid recovery.

Files: `core/store/resource-patch.ts`, state update/subscription/snapshot modules,
notification scheduler service, ResourceStore API, and tests.

Tests: absent patch behavior; primitive/array/object values; patch callback typed
failure/defect if applicable; nested/reentrant notification; subscribe/unsubscribe
during publish; listener fault isolation and FIFO snapshot-at-batch-start behavior;
multi-ref batch order; no partial observer view; repeated subscribe/unsubscribe
churn removes inactive selection sources and closes BUG-35 without evicting
active records; throwing selector/equality before and after a valid snapshot;
later valid recovery; selector equality reflexive/symmetric/transitive contract
fixtures and a deliberately throwing client equivalence.

Reference reading — ideas/tests only:

- `docs/codebases/tanstack-query/packages/query-core/src/notifyManager.ts`,
  `docs/codebases/tanstack-query/packages/query-core/src/subscribable.ts`, and
  `docs/codebases/tanstack-query/packages/query-core/src/__tests__/notifyManager.test.tsx`:
  extract nested batch, flush-after-throw, and first/last subscriber cases. Do
  not copy the module-global manager or let listener failure participate in
  commit.
- `docs/codebases/tanstack-query/packages/query-core/src/removable.ts`,
  `docs/codebases/tanstack-query/packages/query-core/src/query.ts`, and
  `docs/codebases/tanstack-query/packages/query-core/src/__tests__/queryCache.test.tsx`:
  extract active-entry protection and exact-current removal tests. Replace
  wall-clock GC with the P0.6 capacity/ownership policy and ensure stale cleanup
  cannot remove a newer source generation.

Commands: `F(packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/core/store/selection-source.test.ts)`, `T`, `P`, `C`.

### `P1C.1` Canonical actor owner and explicit ownership domains

- [ ] Select/reuse the production start/get/send/stop/snapshot/restore path.
- [ ] Implement the three binding-decision ownership modes without exposing a
      mandatory public AppGraph or bind step.
- [ ] Reject wrong-app, unregistered, duplicate, and ambiguously owned descriptors
      in app-bound mode; preserve explicit focused compatibility mode.
- [ ] Ensure metadata/ownership compilation never executes client callbacks.
- [ ] Represent owner domain, exact machine-definition token, public actor ID,
      and monotonic incarnation as distinct internal facts.

Files: `core/orchestrator/app-ownership.ts`, registry/system/lifecycle modules,
descriptor validation/app files, runtime construction, public runtime types, and
ownership/runtime tests.

Tests: registered start succeeds; wrong app/unregistered/duplicate ID rejects
before work starts; focused `createRuntime().createActor(machine)` succeeds with
synthetic ownership; child inherits parent domain; same actor ID in different
runtimes does not alias; app/module reorder preserves identity; keep-alive reuse
requires the same registered definition/ownership domain rather than only the
same machine ID; unsupported policy fails in source types and at a foreign runtime boundary.

Execution split: first app authorization/definition identity, then actor start
policy/incarnation. Do not mix app-map refactoring with keep-alive disposal.

Commands: `F(packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/app-inventory.test.ts
packages/flow-state/src/runtime.test.ts
packages/flow-state/src/diagnostics.test.ts)`, `T`, `P`, `E`, `C`.

### `P1C.2` One actor read implementation (`CV-2`)

- [ ] Complete the detailed CV-2 packet under
      [compatibility vocabulary](./COMPATIBILITY_TASKS.md#cv-2-prefer-getsnapshot-while-retaining-snapshot).
- [ ] Prefer `runtime.orchestrators.start` in production/example callers while
      retaining `runtime.createActor` as a compatibility route to that owner.

The request-boot path and remaining example tests migrate only after the caller
inventory proves behavior equivalence. No adapter may implement its own actor shell.

### P1C.3 actor finalization and lease family

#### P1C.3a Stop, finalizer, and exact eviction

- [ ] Close BUG-19: stop/dispose marks the actor stopping, rejects new sends/work,
      interrupts owned fibers, awaits all actor finalizers, publishes at most one
      terminal fact, and evicts only the exact registry generation.
- [ ] Repeated/concurrent stop and dispose join one completion and finalizer run.
- [ ] Old finalization cannot evict a newer same-ID incarnation.
- [ ] Runtime shutdown awaits actor finalizers before shared-service disposal.
- [ ] Preserve handler and finalizer Cause; a failed finalizer does not skip the
      actor's remaining cleanup.

Files: actor lifecycle/registry/orchestrator system, actor-owned ready/delayed
work integration, runtime disposal seam, and focused lifecycle tests. Child
family-specific shutdown is contributed later by P3D.2.

Tests: explicit stop; actor/runtime dispose; repeated/concurrent disposal; ID
replacement; failing/defective finalizer; new work rejection; exact one finalizer/
terminal fact/eviction.

Commands: F(packages/flow-state/src/runtime-lifecycle.test.ts
packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/flush.test.ts); T; P; E; C.

#### P1C.3b Attachment and keep-alive leases

- [ ] Define long-lived/keep-alive ownership through a runtime-owned lease;
      application/React code never edits counters.
- [ ] Releasing a lease synchronously changes attachment authority before cleanup
      returns; asynchronous finalization is serialized by the registry.
- [ ] One of multiple consumers releasing cannot stop another's actor.
- [ ] Compatible reacquisition either joins the live incarnation or waits for
      completed release according to the P0.6 policy.
- [ ] Explicit stop/runtime shutdown override all leases and await finalization.
- [ ] Same public ID with incompatible machine/owner never reuses through a cast.

Files: runtime attachment-lease service, registry/lifecycle integration, public
runtime handles if required, and focused lease tests. React consumes this in
P4B.1b; it does not define the lease.

Tests: two attachments/one release; final release; Strict Mode probe
release/reacquire; delayed cleanup plus compatible same-ID reacquire; incompatible
definition; explicit stop/shutdown override; exactly-once finalization.

Reference reading — ideas/tests only:
`docs/codebases/xstate/packages/core/src/createActor.ts`,
`docs/codebases/xstate/packages/core/src/system.ts`,
`docs/codebases/xstate/packages/core/src/Mailbox.ts`,
`docs/codebases/xstate/packages/core/test/actor.test.ts`, and
`docs/codebases/xstate/packages/core/test/system.test.ts` may supply idempotence,
exact-unregister, and stop-before-replace cases. Do not copy global/random
identity, Date.now, private mutation, broad casts, or observer failure in
lifecycle publication.

Commands: F(packages/flow-state/src/runtime-lifecycle.test.ts
packages/flow-state/src/orchestrator-system.test.ts); T; P; E; C.

### P1C.4 activation and mailbox family

P1C.4 is a family label with two receipts. P3A still owns the final transition
differential; these packets own actor authority, delivery, and scheduling only.

#### P1C.4a Registry authority and activation barrier

- [ ] Allocate actor/incarnation state inertly.
- [ ] Install the exact registry and publication authority before activating any
      initial or restored invoke, stream, timer, child, or other state-owned work.
- [ ] Make synchronous initial/restored completion publish only after authority
      exists; close BUG-44 and BUG-50-family analogues at this boundary.
- [ ] Stop/replacement marks the incumbent stale before queued activation can
      start; stale activation may clean itself but cannot publish.

Files: actor construction, orchestrator registry, restore/start activation seam,
and focused lifecycle tests. Do not change mailbox policy or transition logic.

Tests: registry visibility before synchronous initial/restored completion for
invoke/stream/timer/child; stop/same-ID replacement races activation; old cleanup
cannot evict or publish over the new incarnation.

Commands: F(packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/runtime-invokes.test.ts); T; P; E; C.

#### P1C.4b Canonical mailbox and bounded scheduler turns

- [ ] Preserve FIFO and non-reentrant delivery per actor. Reentrant work runs
      after the current microstep/listener batch.
- [ ] Replace full synchronous Array.shift draining with the DEC-19 bounded Queue
      or amortized FIFO selected by P0.6 and yield after the configured turn budget.
- [ ] Perform admission/overflow before client work and publish a typed outcome.
- [ ] A hot actor cannot synchronously monopolize ready work; do not promise
      strict global fairness.
- [ ] Stop/replacement invalidates queued generations before they can publish.
- [ ] Close BUG-48 with operation-count and cross-owner progress proof.

Files: core/scheduling/ready-work.ts, canonical mailbox/notification integration,
runtime capacity input, and focused scheduling tests. Do not change transition,
transaction, or stream-pressure semantics.

Tests: reentrant send; per-actor FIFO; turn-budget boundary; two ready actors
where one continually requeues; admission overflow before callbacks; large-queue
operation-count regression; stop/replacement race; progress without manual
double flush.

Commands: F(packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/flush.test.ts); T; P; E; C.

### `P1C.5` Canonical transition-dispatch prerequisite

This packet establishes the transition owner Phase 2 transactions depend on.
P3A.1 later completes the full transition/guard/action differential matrix; it
does not select or replace the owner again.

- [ ] Select one existing pure transition planner/application implementation and
      route actor dispatch and `flow.can` through it without duplicating callback
      evaluation or state mutation.
- [ ] Route the machine-dispatch portion of `flowTest` to the production actor/
      transition owner before transaction/stream test delegation begins.
- [ ] Establish the commit boundary: a complete accepted microstep applies once
      under the P1C.4 mailbox; rejected/defective planning starts no state-owned work.
- [ ] Preserve pure logical-time input from DEC-12 and defect/rejection lanes so
      P3A.1 can add exhaustive proof without changing the owner.

Files: canonical `core/machines/**` planner/application files, actor dispatch,
`flow.can`, the machine-dispatch portion of testing, and focused differentials.
Do not change transaction/stream/timer/child behavior or public machine types.

Tests: one accepted target/update; unmatched event; false guard; thrown guard
starts no work; `flow.can` agrees for the same snapshot/event; production runtime
and `flowTest` produce the same state/acceptance fact; reentrant send remains in
the P1C.4 next turn.

Commands: `F(packages/flow-state/src/machine.test.ts
packages/flow-state/src/machine-callbacks.test.ts
packages/flow-state/src/runtime-invokes.test.ts
packages/flow-state/src/flow-transition-inspection.test.ts)`, `T`, `P`, `E`, `C`.

### P1D.1 Effect host, typing, and shutdown family

P1D.1 is a family label. Its former single packet was circular because it
claimed concrete ResourceStore/actor lifetimes before those owners were selected.

#### P1D.1a Host boundary, service contracts, and Layer composition

- [ ] Preserve exact operation Effect<A, E, R> at public and semantic seams.
- [ ] Define direct Context.Tag/Effect.Service dependencies; reject hidden service bags,
      parallel DI, Layer.Any, and cast-provided requirements.
- [ ] Classify each existing host Layer as succeed, effect, or scoped, preserving
      acquisition error and remaining requirements.
- [ ] Keep one host-owned ManagedRuntime and Promise conversion only at explicit
      framework/CLI/request hosts.
- [ ] Establish typed service and Layer contracts that P1B.1/P1C.1 can implement.
      Do not select their internal state, fiber registry, or finalizer ordering here.
- [ ] Prove live/test Layers replace implementations without replacing semantics.

Files: runtime public API/types, service contracts, Layer composition/installers,
host run methods, presets, `runtime/contract-runtime.ts`, runtime service Layer/
type modules, and focused type/acquisition tests. Do not migrate ResourceStore,
actor, transaction, stream, timer, or child internals in this packet.

Tests: acquisition typed failure and partial acquisition cleanup; missing
requirement remains required; provided requirement disappears; Promise rejection
appears only at the host; no service bag/cast erases A/E/R; live/test composition
has the same service graph.

Commands: F(packages/flow-state/src/runtime.test.ts
packages/flow-state/src/public-api-types.test.ts); T; P; E; C.

#### P1D.1b Exact Layer and packed declaration typing

- [ ] After the concrete runtime shape is stable, prove variadic Layer output,
      acquisition error, and remaining requirements without runtime behavior edits.
- [ ] Keep negative fixtures diagnostic-specific; do not use any/unknown/never
      assertions or a second public Layer syntax to force green.
- [ ] Prove source and packed declarations expose the same requirements.

Files: Layer/public runtime types and dedicated source/packed inference fixtures.

Commands: the exact TI-5/TI-9 fixtures from TYPE_GATES.md; T; P; C.

#### P1D.1c Cross-owner Scope and graceful-shutdown convergence

This runs after ResourceStore, actor lifecycle, and core fact publication exist.
Each owner packet establishes its local Scope; P1D.1c proves the composed graph
and removes remaining cross-owner escape hatches.

- [ ] Give runtime, actor, subscription, lookup, and retained host work explicit
      Scope ownership; family packets own transaction/stream/timer/child scopes.
- [ ] Remove semantic-owner Effect.run\* and captured Context callback islands.
      Internal callbacks return/yield Effects under their owner.
- [ ] Use SynchronizedRef, FiberMap/FiberSet, Deferred, bounded Queue/PubSub, and
      Exit/Cause where the approved architecture requires them; plain Map/Set may
      remain only as Effect-owned data.
- [ ] Close BUG-47/DEC-21: mark every owner closing first, reject new work,
      interrupt owned fibers, attempt every finalizer despite earlier failure,
      aggregate complete Cause, evict exact generations, then close the
      ManagedRuntime/Layer Scope. Repeated shutdown joins the same Exit.
- [ ] Remove Clock failure fallback to 0, HostSignals Effect.runSync,
      Deferred<any, any>, cast-provided lookup requirements, and Layer casts that
      assert dependencies disappeared.
- [ ] Preserve success, typed failure, defect, interruption, stale, cleanup,
      observer, and invariant lanes through final shutdown publication.

Files: runtime lifecycle/disposal, ResourceStore and actor Scope integration,
ManagedRuntime close, `core/orchestrator/orchestrator-system.ts`,
`core/runtime/services/host-signals.ts`,
`core/store/resource-store-lookups.ts`, `runtime/contract-runtime.ts`, and
focused lifecycle/type tests. Do not redesign individual family semantics here.

Tests: every owner marked closing before cleanup; one actor/finalizer defect does
not skip later actors/resource/host cleanup; handler and cleanup Causes both
survive; repeated shutdown shares one Exit; host deadline/cancellation is
explicit; forced termination is not reported clean; no semantic callback escapes
through another runtime; all acquired Layer resources release after partial failure.

Commands: F(packages/flow-state/src/runtime.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts
packages/flow-state/src/public-api-types.test.ts); T; P; E; C.

### P1D.2 Production/test delegation requirement

P1D.2 is preserved as a cross-family requirement, not an executable mega-packet.

- P1C.5 delegates machine dispatch and its focused production/test differential.
- P1B.1 delegates resource execution and removes the testing ID-only cache.
- P2.1 delegates transaction execution and family pending facts.
- P3B.1, P3C.1, and P3D.2 delegate streams, timers, and children respectively.
- P4A.1 closes the public testing builders, deterministic controls, aggregate
  pending/settle behavior, and final live/test differential.

Each family turns off its duplicate write/owner in the same packet that routes
to production. Temporary dual-read is allowed only with an equality assertion
and an explicit removal step in that receipt. No packet waits for a Phase 1
mega-migration of future owners.

Shared acceptance: TestClock and controlled inputs operate on production owners;
success, typed failure, defect, interruption, stale work, finalizer evidence,
and false-idle prevention agree; testing modules remain translation/control/
assertion helpers only. BUG-5 and BT-12 close finally in P4A.1 after every family
has contributed evidence.

### P1D.3 committed fact and evidence family

#### P1D.3a Core post-commit fact publication

- [ ] Close BUG-33 by committing actor/resource semantic state before constructing
      or publishing subscriber, trace, inspection, or receipt facts.
- [ ] Define one immutable committed-fact envelope with runtime ID, actor ID,
      incarnation, monotonic sequence, lane, and redacted bounded payload.
- [ ] A listener or sink cannot veto, roll back, or interleave the semantic commit.
- [ ] Reentrant sends/work queue for the next P1C.4b turn.
- [ ] Project actor/resource facts from the owner; do not redesign CLI rendering.

Files: actor/resource commit seam, core fact type/sequence owner, subscriber
publication, and focused commit-order tests.

Tests: committed state is visible before callback; throwing listener cannot
rollback; reentrant send runs next; one batch has one stable snapshot; sequence
is monotonic and raw key/context/defect objects are absent by default.

Commands: F(packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/runtime-inspection.test.ts); T; P; E; C.

#### P1D.3b Bounded evidence and observer isolation

- [ ] Isolate every listener and inspection sink so failure cannot starve later
      observers or corrupt sequence ownership.
- [ ] Project the committed fact stream into actor receipts, TraceLog,
      InspectionLog, testing, and later CLI adapters without adding semantics.
- [ ] Close BUG-34 using CAPACITY_POLICY.md: histories are bounded/configurable
      and expose typed truncation/gap facts.
- [ ] Repeated sink failure disables/reports only that sink according to policy;
      semantic publication continues.
- [ ] Keep default evidence redacted and serialization-safe.

Files: trace/inspection services, receipt projection, listener delivery,
retention/truncation, runtime inspection handles, and focused fault/bounds tests.

Tests: listener/sink throw; error handler throws; later observers still run;
long-run retention bound; one truncation fact with monotonic gap; repeated sink
failure isolation; no raw secret/key/live object in default export.

Reference reading — ideas/tests only: use notification portions of
`docs/codebases/xstate/packages/core/src/createActor.ts` and
`docs/codebases/tanstack-query/packages/query-core/src/notifyManager.ts` plus
its focused test for commit-before-notify, later-listener, nested-batch, and
flush-after-throw shapes. Do not copy a singleton manager or upstream
observer-error policy.

Commands: F(packages/flow-state/src/runtime-inspection.test.ts
packages/flow-state/src/inspection-sink.test.ts
packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts); T; P; E; C.

### Phase 1 closure

- [ ] One ResourceStore and one actor/orchestration semantic owner remain.
- [ ] Duplicate lifecycle registries/interpreters are removed or translation-only.
- [ ] Resource and machine testing paths delegate to production owners. Later
      family packets delegate transaction/stream/timer/child execution, and
      P4A.1 closes the aggregate public testing/pending surface.
- [ ] No hidden empty app is treated as proof of explicit ownership.
- [ ] Differential and finalization tests pass.
- [ ] BUG-8/19/22/25 are closed without weakening public actor types or diagnostics.
- [ ] BUG-44/48 are closed before Phase 2; registry authority precedes activation
      and bounded scheduler turns preserve FIFO without starvation.
- [ ] P1C.5 names one production transition owner and machine dispatch in direct
      runtime/`flowTest` delegates to it before transaction concurrency work.
- [ ] BUG-33/34/35 are closed; observability is post-commit and every retained
      runtime collection has its recorded ownership/capacity behavior.
- [ ] BUG-42 is closed; unknown reads are null and mutation-free.
- [ ] BUG-43/46/47 are closed; selector defects preserve prior state,
      invalidation refresh is scoped, and one cleanup failure cannot starve
      remaining finalizers or ManagedRuntime disposal.
- [ ] P1A–D receipts list every deleted and intentionally retained duplicate path.

---
