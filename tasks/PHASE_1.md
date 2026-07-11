# Phase 1 — Canonical identity, runtime ownership, and Effect lifecycle

[Back to the plan tracker](../TASK.md) · [Previous: Phase 0](./PHASE_0.md) · [Next: Phase 2](./PHASE_2.md)

Status: blocked by Phase 0 closure.

Effect construction is governed by the
[binding Effect architecture blueprint](./PHASE_0.md#binding-effect-architecture-blueprint)
and the approved P0.6 `EFFECT_ARCHITECTURE.md` receipt. Packets may narrow that
map but may not invent another DI, runtime, lifecycle, queue, clock, stream,
failure, or host-conversion substrate.

Execution dependency: land `P1D.1a` first as the service/layer/scope/host-
conversion foundation before P1A.4, P1B.1, P1C.1, or any packet starts retained
asynchronous work. `P1D.1b` may then finish exact variadic Layer typing without
blocking pure identity packets P1A.0–P1A.3. P1C.4 closes the canonical mailbox/
scheduler prerequisite and P1C.5 fixes the transition-dispatch owner before
Phase 2 begins.

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

### `P1A.3` Migrate every active resource projection to instance identity

- [ ] Prove two instances of one descriptor never share status/value/subscribers.
- [ ] Migrate actor owned-query keys and snapshots, transaction target discovery,
      testing cache, React sources, inspection, and hydration to canonical identity.
- [ ] Define and test unambiguous descriptor-ID compatibility projection behavior.
- [ ] Remove descriptor-ID fallback only after every active caller migrates.
- [ ] Prove seed/lookup/patch/invalidate/hydrate notification ordering and batching.

Files: `core/store/**`, `core/orchestrator/orchestrator-resources.ts`, transaction
ref discovery, snapshot types/constructors, `testing/flow-test.ts`, React
resource source, inspection projections, runtime hydration, Launch Workspace
resource readers, and focused callers identified by P0.5. This packet may be
split by adapter, but runtime and store must become canonical first.

Mandatory execution split:

1. `P1A.3a` migrates ResourceStore records, in-flight work, subscriptions,
   invalidation, and runtime resource handles; it establishes the authoritative owner.
2. `P1A.3b` migrates actor resource facts and transaction preview/ref discovery
   without changing transaction policy.
3. `P1A.3c` migrates only the shared identity projection/translation used by
   testing, React, inspection, Launch Workspace, and hydration. It may change
   identity fields and remove duplicate maps, but adapter lifecycle, decode,
   rendering, evidence, and test semantics remain in their dedicated P4 packets.
4. Remove ID-only fallback only after the exact caller inventory is empty and
   differential proof covers all three subpackets.

Ref provenance is validated at every semantic attachment. A structural object,
duplicate-package ref, wrong-app ref, or ref minted by another runtime cannot
become authoritative merely because its fields match.

Tests:

1. Two project refs retain independent values/status/subscriptions/in-flight work.
2. Patch/invalidate one ref leaves the sibling untouched; tag invalidation may
   intentionally reach both and emits two instance-specific facts.
3. A descriptor-ID compatibility read works with one instance and diagnoses or
   yields no result with two; it never chooses by insertion order.
4. Restore/hydrate round-trips both refs without collision.
5. Actor, test, and React observers all report the same canonical snapshots.

Commands: `F(packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/runtime-invokes.test.ts
packages/flow-state/src/react/use-resource.test.ts
packages/flow-state/src/flow-test-rehydration.test.ts
examples/launch-workspace/src/launchWorkspace.test.ts)`, `T`, `P`, `E`, `C`.

### `P1A.4` Resource lifecycle, tags, typing, and local hydration boundary

- [ ] Prove lookup success, typed failure, defect, interruption, retry, and finalization.
- [ ] Define empty/loading/placeholder/ready/refreshing/stale/failed/paused/invalidated facts.
- [ ] Prove freshness and active invalidation behavior without conflicting flags.
- [ ] Prove `ensure`, `observe`, and `refresh` distinct ownership/lifetime behavior.
- [ ] Prove tag reuse, cross-resource invalidation, and incompatible same-ID rejection
      without running tag callbacks during compilation.
- [ ] Make declared Params contextualize key/lookup/tags/placeholder/ref.
- [ ] Infer lookup success/failure/requirements only after Params is fixed.
- [ ] Add focused wrong-params/ref/value/failure/schema fixtures.
- [ ] Accept only already-decoded, prevalidated immutable resource state at this
      internal attachment seam and reject partial store mutation. P4C alone
      decodes foreign `unknown` and owns wire/version behavior.

Files: resource public types, store lookup/snapshot/invalidation/hydration modules,
tag/app validation registry, resource callback/type tests, and runtime resource
tests. Do not add mandatory Schema for local values.

Mandatory execution split: `P1A.4a` lifecycle/freshness and scoped invalidation,
`P1A.4b` tag registry, `P1A.4c` directional typing, and `P1A.4d` prevalidated
internal hydration attachment. Each
subpacket has its own red/green tests and receipt; do not combine four semantic
families in one implementation diff.

Tests: full lookup Exit/Cause/finalizer matrix; freshness transition table under
deterministic time; ensure/observe/refresh ownership differential; invalidation
refresh belongs to ResourceStore Scope and cannot outlive runtime disposal; compatible
same-ID tag reuse and incompatible metadata rejection; unknown hydration
decode-then-commit; present `undefined` value/error versus absent state; input-first
source and packed fixtures. Close BUG-26/41R/46 with a discriminated lifecycle union
that preserves present `undefined`, forbids contradictory value/error/status
combinations, and does not forbid `undefined` from a declared Value/Error type.

Commands: `F(packages/flow-state/src/resource-callbacks.test.ts
packages/flow-state/src/resource-store.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `E`, `C`.

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

- [ ] Select/reuse `core/runtime/services/resource-store.ts` plus
      `core/store/resource-store-memory.ts` as the production owner unless P0.5
      proves a more complete existing owner.
- [ ] Route seed/read/lookup/subscribe/patch/invalidate/hydrate through that owner.
- [ ] Prove host convenience methods cannot create a second cache or notification model.
- [ ] Preserve typed refs and Effect failures through runtime handles.
- [ ] Close BUG-42: `get` returns `null` for an unknown/foreign ref and a read
      never manufactures or registers an empty authoritative record.

Files: `core/runtime/services/resource-store.ts`, `core/store/**`,
`runtime/contract-runtime.ts`, runtime public handle types, presets, and store/runtime tests.

Tests: runtime handle and direct service observe the same record and subscriber;
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
      [Phase 0 compatibility vocabulary](./PHASE_0.md#approved-compatibility-vocabulary-tasks).
- [ ] Prefer `runtime.orchestrators.start` in production/example callers while
      retaining `runtime.createActor` as a compatibility route to that owner.

The request-boot path and remaining example tests migrate only after the caller
inventory proves behavior equivalence. No adapter may implement its own actor shell.

### `P1C.3` Actor stop, disposal, keep-alive, and registry finalization

- [ ] Prove stop/dispose interrupts owned work and finalizes exactly once.
- [ ] Define long-lived/keep-alive actor ownership, registry eviction, explicit
      disposal, and runtime shutdown behavior.
- [ ] Close BUG-19 with deterministic ordering evidence.
- [ ] Add a runtime-owned attachment lease used by React/shared consumers;
      application code never manages lease counters.

Required ordering: mark stopping; reject new sends/work; interrupt owned fibers;
await finalizers; publish one terminal/stopped fact if the contract exposes it;
evict the exact registry generation; make repeated stop/dispose idempotent.
Runtime shutdown waits for all actor finalizers before disposing shared services.
A stale actor finalizer cannot evict a newer actor reusing the same ID.
Lease release synchronously marks ownership detached/closing before React cleanup
returns. Finalization remains asynchronous but is serialized by the registry;
compatible reacquisition either joins the still-live incarnation or waits for
its completed release according to the recorded policy. Explicit stop and
runtime shutdown override all leases and await finalization.

Files: actor lifecycle, registry, orchestrator system, ready/delayed work owners,
runtime disposal, child stop integration, and lifecycle tests.

Tests: explicit stop, actor dispose, runtime dispose, concurrent repeated dispose,
keep-alive reuse, ID replacement, failing/defective finalizer, parent/child
shutdown, two attachments with one release, Strict Mode probe release/reacquire,
and exactly-once finalizer/registry eviction.

Reference reading — ideas/tests only: inspect
`docs/codebases/xstate/packages/core/src/createActor.ts`,
`docs/codebases/xstate/packages/core/src/system.ts`,
`docs/codebases/xstate/packages/core/src/Mailbox.ts`,
`docs/codebases/xstate/packages/core/test/actor.test.ts`, and
`docs/codebases/xstate/packages/core/test/system.test.ts` for public ID versus
incarnation/session identity, idempotent start/stop, exact unregister, FIFO
reentrancy, and stop-old-before-start-new cases. Do not copy
process-global/random IDs, `Date.now`, private actor fields, broad casts, or any
observer/inspection path that can throw through lifecycle publication.

Execution split: `P1C.3a` stop/finalizer/eviction ordering, then `P1C.3b`
attachment/keep-alive lease semantics. P1C.3b cannot weaken P1C.3a shutdown proof.

Commands: `F(packages/flow-state/src/runtime-lifecycle.test.ts
packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/flush.test.ts)`, `T`, `P`, `E`, `C`.

### `P1C.4` Canonical mailbox, activation barrier, and bounded scheduler turns

This packet is a prerequisite for transaction/stream concurrency. P3A still
owns machine transition planning/application; P1C.4 owns only actor authority,
mailbox delivery, reentrancy, and ready-work scheduling.

- [ ] Close BUG-44: allocate the actor/incarnation inertly, install exact
      registry/publication authority, then activate initial/restored state-owned
      work. Synchronous completion cannot publish before authority exists.
- [ ] Preserve FIFO and non-reentrant delivery per actor. Work enqueued during a
      microstep/listener batch runs after that unit; it never recursively enters it.
- [ ] Close BUG-48 with the DEC-19 bounded-turn scheduler. Replace synchronous
      full-drain/`Array.shift()` ownership with the P0.6-selected bounded Queue or
      amortized FIFO structure and yield after the configured turn budget.
- [ ] Admission/overflow is explicit before client work. A hot actor cannot
      synchronously monopolize ready work; no strict global fairness promise is added.
- [ ] Stop/replacement marks the incumbent generation stale before queued work
      can start, and stale queued work may clean itself but never publish.

Files: `core/orchestrator/orchestrator-registry.ts`, actor construction/
activation/lifecycle seams, `core/scheduling/ready-work.ts`, canonical mailbox/
notification integration, runtime policy capacity input, and focused scheduler/
orchestrator tests. Do not modify transition semantics, transaction policy, or
stream pressure in this packet.

Tests: synchronous initial/restored invoke/stream/timer/child completion;
registry visibility before activation; queued send racing stop/same-ID
replacement; reentrant send; per-actor FIFO; turn-budget boundary; two actors
where one continually requeues; admission overflow before callbacks; large
queue operation-count regression; no manual extra flush required for progress.

Commands: `F(packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/flush.test.ts
packages/flow-state/src/runtime-invokes.test.ts)`, `T`, `P`, `E`, `C`.

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

### `P1D.1` Effect, Layer, Scope, and Promise-host preservation

- [ ] Preserve exact operation `Effect<A, E, R>` at public and semantic seams.
- [ ] Preserve Layer acquisition errors and remaining requirements after provision.
- [ ] Give runtime, actor, subscription, stream, timer, child, and request work an
      explicit Scope owner.
- [ ] Keep Promise conversion at explicit hosts; remove duplicate Promise semantics.
- [ ] Implement the P0.6 service/layer/scope graph: resource/orchestrator/host-
      signal/evidence services depend directly on typed services, not a hidden
      service bag; choose `Layer.succeed`, `Layer.effect`, or `Layer.scoped`
      according to actual acquisition and retained lifetime.
- [ ] Remove `Effect.run*`/runtime-context callback islands from semantic owners.
      Internal callbacks enqueue or return/yield Effects under the owning Scope;
      `ManagedRuntime` and Promise conversion remain only at host boundaries.
- [ ] Use native Effect ownership primitives from DEC-16 where they match:
      `SynchronizedRef` for short effectful serialized transitions, `FiberMap`/
      `FiberSet` for owned work, `Deferred` for shared completion, bounded
      `Queue`/`PubSub` for ordered work/fanout, and `Exit`/`Cause` for outcomes.
      Plain Map/Set may remain only as Effect-owned data, not hidden lifecycle.
- [ ] Close BUG-47 with DEC-21 shutdown aggregation: mark closing first, attempt
      every actor/resource/host cleanup even after failure, preserve all Causes,
      then close ManagedRuntime/Layer Scope. Repeated disposal joins the same exit.
- [ ] Remove current requirement/failure erasure hotspots: captured
      `Context<unknown>` callback runners, Clock failure fallback to `0`,
      HostSignals callback `Effect.runSync`, `Deferred<any, any>`, cast-provided
      lookup requirements, and Layer casts that assert dependencies disappeared.
- [ ] Isolate exact variadic Layer typing as a reviewed type packet rather than
      coupling it to runtime behavior edits. `[SMART]`

Files: runtime API/types, Layer composition/installers, host run methods, Scope
acquisition/release sites, request runtime, and exact type/lifecycle tests,
explicitly including `core/orchestrator/orchestrator-system.ts`,
`core/runtime/services/host-signals.ts`, `core/store/resource-store-lookups.ts`,
`runtime/contract-runtime.ts`, runtime service Layers/types, and their focused
lifecycle/type tests.

Tests: acquisition typed failure and partial Layer-acquisition cleanup; missing
requirement remains required; provided requirement disappears; success/failure/
defect/interruption and finalizer Cause remain distinct; Scope finalizer once;
runtime dispose closes keyed/unkeyed fibers and subscriptions; no semantic-owner
callback escapes through another runtime; Promise rejection only at explicit
host conversion; live/test Layers replace services without replacing semantics.
Add Clock failure/defect without zero fallback; lookup keeps exact Value/Error/
Requirements without `any`; HostSignals callback stays in its owning runtime;
one actor stop/finalizer defect does not skip later actors, resource cleanup, or
ManagedRuntime scope disposal; repeated shutdown exposes the same aggregated Exit.

Commands: `F(packages/flow-state/src/runtime.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `E`, `C`.

Treat P1D.1 as a cross-packet acceptance gate with separate receipts for exact
Layer typing, service/layer dependency graph, runtime/actor Scope ownership,
native state/fiber primitive migration, and Promise-host conversion. Do not
combine a variadic conditional-type redesign with lifecycle implementation.
Execution split: `P1D.1a` owns the concrete service graph, scoped runtime/actor/
ResourceStore lifetime, native fiber/state ownership, removal of semantic-owner
`Effect.run*`, and host conversion. It lands before retained async owners.
`P1D.1b` owns exact variadic Layer typing and packed inference after the runtime
shape is stable.

### `P1D.2` Minimal live/test delegation to production owners

- [ ] Provide TestClock, deterministic services, controlled streams, flush/settle,
      and pending-work controls to production owners.
- [ ] Route `flowTest` machine dispatch and owned transaction/stream/timer/child
      work through the production runtime; retain builders/assertions as adapters.
- [ ] Prove live/test presets share success, failure, defect, interruption, and cleanup.
- [ ] Reject false idle while production-owned work remains pending.
- [ ] Remove or reduce testing cache/interpreter/bookkeeping modules to
      translation/control helpers; record every retained responsibility.

Files: `testing/flow-test.ts`, `flow-test-*-ownership.ts`, transaction bookkeeping,
pending/progress controls, test fixtures/presets, production runtime owners, and
flow-test differential tests. This is a strong-model packet and may be split by
owned-work family, but machine dispatch must delegate first.

Required order: machine dispatch, resources, transactions, streams, timers,
children, then pending-work aggregation. One family turns off its duplicate
write/owner before the next begins; temporary dual-read must assert equality.

Tests: the same scenario through direct runtime and `flowTest` yields equivalent
snapshot/receipts/issues; TestClock controls production timers; controlled stream
feeds production stream owner; pending work prevents false settle; typed failure,
defect, interruption, and finalizer evidence agree; wrong-app focused ownership diagnoses.

Commands: `F(packages/flow-state/src/flow-test-settle.test.ts
packages/flow-state/src/flow-test-streams.test.ts
packages/flow-state/src/flow-test-timers.test.ts
packages/flow-state/src/flow-test-child-helpers.test.ts
packages/flow-state/src/transactions.test.ts
packages/flow-state/src/runtime-invokes.test.ts)`, `T`, `P`, `E`, `V`, `C`.

### `P1D.3` Post-commit, isolated, and bounded observability

- [ ] Close BUG-33 by committing semantic actor/resource state before projecting
      trace, inspection, or subscriber evidence.
- [ ] A failing listener/sink cannot block or roll back semantic publication,
      corrupt sequence ownership, or starve later listeners.
- [ ] Use one committed fact stream projected into actor receipts, TraceLog,
      InspectionLog, testing, and later CLI output; projections do not become engines.
- [ ] Close BUG-34 with the capacity policy fixed by P0.6. Actor receipt, trace,
      and inspection retention are bounded/configurable with typed truncation facts.
- [ ] Sequence evidence by runtime ID, actor ID, incarnation, and monotonic fact
      sequence without exposing raw keys, context, or unbounded errors.

Files: orchestrator snapshot/inspection seam, trace and inspection services,
receipt construction, listener delivery, runtime inspection handles, and focused
fault/retention tests. Do not redesign CLI rendering in this packet.

Tests: listener/sink throw; listener error handler throws; later listener still
runs; commit remains visible; reentrant send queues next; retention under long
run; truncation fact appears once; repeated sink failure disables/reports only
that sink; no raw secret/key payload in default export.

Reference reading — ideas/tests only: use the notification portion of
`docs/codebases/xstate/packages/core/src/createActor.ts` and
`docs/codebases/tanstack-query/packages/query-core/src/notifyManager.ts` only to
derive commit-before-notify, later-listener-survives, nested-batch, and
throw-during-flush tests. Flow State must isolate both ordinary listeners and
inspection sinks; neither upstream singleton/error policy is authoritative.

Commands: `F(packages/flow-state/src/runtime-inspection.test.ts
packages/flow-state/src/inspection-sink.test.ts
packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts)`, `T`, `P`, `E`, `C`.

### Phase 1 closure

- [ ] One ResourceStore and one actor/orchestration semantic owner remain.
- [ ] Duplicate lifecycle registries/interpreters are removed or translation-only.
- [ ] The testing execution path delegates to production owners; Phase 4A owns
      public testing ergonomics/types, not engine replacement.
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
