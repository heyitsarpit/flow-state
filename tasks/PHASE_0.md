# Phase 0 — Baseline, semantic decisions, and proof

[Back to the plan tracker](../TASK.md)

Status: current phase. Documentation and baseline work only; no production semantic changes are authorized until Phase 0 closes.

## Goal

Make Flow State correct, Effect-native, fast, and smaller internally while
preserving the recognizable Launch Workspace API.

The critical path is pure resource definitions and canonical resource-instance
identity, then ResourceStore/runtime ownership and lifecycle, transactions,
machine-owned asynchronous work, thin adapters, and finally safe deletion. Type
inference work follows those concrete families; it is not an independent API
rewrite.

## Authorities

Read these before work:

1. [API_CONTRACT.md](../API_CONTRACT.md) — compatibility and permitted migration.
2. [TYPE_INFERENCE_CONTRACT.md](../TYPE_INFERENCE_CONTRACT.md) — input-first inference and declaration rules.
3. [ARCHITECTURE_CONTRACT.md](../ARCHITECTURE_CONTRACT.md) — semantic ownership and Effect boundaries.
4. [CLIENT_STRUCTURE_CONTRACT.md](../CLIENT_STRUCTURE_CONTRACT.md) — consuming-app organization.
5. This file — ordered packets and closure checks.
6. [Launch Workspace API inventory](../examples/launch-workspace/API_INVENTORY.md) — executable/partial/contract-only truth.
7. Launch Workspace source/tests and current package exports/implementation.

The pre-reset plan remains historical on branch
`backup/pre-reset-task-plan-2026-07-12` and in
`/tmp/flow-state-task-list-before-reset-2026-07-12`.

## Priority order

The first production implementation priority is `P1A`, beginning with `P1A.0`:
normalize safe definition/app identity, stop `resource.ref(...)` from
capturing executable lookup/tag/placeholder work and establish one collision-free
resource-instance identity. ResourceStore, actor snapshots, transaction preview,
testing, React, and hydration cannot converge while they disagree on identity.

| Order | Work                                                                           | Why it comes here                                                    |
| ----- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 0     | Baseline, contract truth, compact type fixtures, owner map                     | Establishes proof and resolves documentation/type-contract drift     |
| 1A    | Safe definitions, pure resource refs, and canonical resource-instance identity | Highest-priority correctness defect and prerequisite for all data    |
| 1B    | Canonical ResourceStore owner                                                  | Makes one keyed data owner real after identity is stable             |
| 1C    | Canonical actor owner and ownership domains                                    | Establishes app/focused/child authorization and lifecycle            |
| 1D    | Effect lifecycle and minimal live/test delegation seam                         | Prevents Phase 1 from falsely closing with a second test interpreter |
| 2     | Transactions and concurrency                                                   | Writes depend on canonical resource identity and actor generations   |
| 3A    | Machine transitions and callback typing                                        | Establishes workflow core before owned async families                |
| 3B    | Streams                                                                        | Highest async/backpressure risk                                      |
| 3C    | Timers                                                                         | Smaller isolated lifecycle family                                    |
| 3D    | Children and restore                                                           | Supervision depends on actor lifecycle and generations               |
| 4A–D  | Testing API, React, server, inspection/CLI                                     | Thin adapters after production semantics are stable                  |
| 5     | Deletion, packed clients, docs, performance closure                            | Delete only after parity                                             |

Do not start a later row merely because its implementation already has partial
code. Re-audit that code when its dependency row closes.

## Binding implementation decisions

These decisions resolve conflicts discovered in the current source. A packet may
refine implementation mechanics, but it may not reverse these outcomes without
updating the governing contracts and receiving explicit approval.

1. **Definitions describe; owners execute.** `resource.ref(...)` may validate
   params and derive identity, but it must not call or retain an already-created
   lookup Effect, tags, or placeholder value. Registered resource definitions
   remain the source of executable callbacks. App compilation and inspection
   never call client callbacks.
2. **One resource-instance identity is used everywhere.** Identity combines the
   registered descriptor identity with a collision-free encoding of its key.
   Store records, in-flight work, subscriptions, actor projections, preview
   overlays, invalidation, testing, React, receipts, and hydration use that same
   identity. Descriptor ID is metadata, not an instance key.
3. **Key encoding never silently collides.** The encoder type-tags primitives,
   distinguishes `undefined`, `null`, `NaN`, infinities, `-0`, bigint, strings,
   booleans, arrays, and sorted plain-object keys. Cycles and values without a
   stable durable representation fail with a typed diagnostic at durable
   boundaries; they may use explicit runtime-local identity only when no
   serialization is requested. A ref stores its opaque encoded identity once;
   later caller mutation cannot change map identity. Do not use raw
   `JSON.stringify` as identity.
4. **Compatibility projections are derived, never authoritative.** Existing
   descriptor-ID resource reads may remain only as an unambiguous derived view
   for one owned instance. Runtime decisions always use canonical instance
   identity; ambiguous descriptor-ID reads fail or return no value rather than
   selecting an arbitrary instance.
5. **Tag identity is registry-owned.** ID-only tags with the same ID are
   compatible. If optional metadata/schema is present, the app registry rejects
   incompatible same-ID definitions. Resource compilation does not execute tag
   callbacks.
6. **Ownership has three explicit internal modes.** An app-bound runtime accepts
   only registered definitions; a focused compatibility runtime gives
   `createRuntime().createActor(machine)` and `flowTest(machine)` an explicit
   synthetic owner; a child inherits its parent app/runtime domain. No hidden
   empty app counts as ownership.
7. **Testing does not remain a second engine until Phase 4.** Phase 1D must make
   the execution path in `flowTest` delegate transitions and owned work to the
   production runtime. Phase 4A retains testing API, fixture, inference, Story,
   Scenario, and diagnostics cleanup only.
8. **Only the publication-owning generation may publish completion facts.** For
   current same-ID `allow` behavior, every attempt may execute externally, but
   the latest-started generation owns actor snapshot, issue, route, success/failure
   receipt, and invalidation publication. An older, cancelled, replaced,
   restored-over, or otherwise stale generation may finalize and retire only its
   own preview layer without changing the newer visible result; it cannot publish
   an ordinary completion or start queued work owned by another generation.
   “External effect ran” and “generation may publish actor facts” remain separate.
9. **Hydration is decode-then-commit.** Boot/hydration accepts `unknown` at the
   host boundary, validates version and ownership into a temporary value, and
   mutates no runtime owner until the entire payload is valid. Existing valid v1
   payloads remain accepted and v1 remains the default emitted format until a
   separately approved compatibility packet authorizes a new version. Stricter
   rejection of invalid payloads is a compatible correctness fix; missing v1
   ownership facts must be validated when a snapshot is attached to a registered
   machine, not invented during decode.
10. **Inspection reports metadata; it never probes behavior.** Dynamic callback
    results are reported as dynamic/unknown unless runtime evidence exists.
    Inspection and coverage must not invoke route, selector, guard, lookup, tag,
    placeholder, or service callbacks with fabricated values.
11. **The current child API is the compatibility floor.** Preserve existing
    `{ id, machine, supervision }` calls. The richer contract text mentioning
    child `input`, `routes`, output, and failure is incomplete relative to the
    current machine type. Phase 0 must reconcile that contract before Phase 3D;
    no worker may invent trailing machine generics or child semantics locally.
    If the richer shape is retained, it must be an additive, separately reviewed
    type-and-runtime packet with defaults preserving every current call.
12. **Type proof is semantic, not textual.** Source-string bans and annotation
    counts do not prove inference. Positive/negative compiler fixtures and packed
    declaration consumers are authoritative. Explicit annotations remain only
    where TypeScript recursion genuinely requires them and must not widen exact
    module/app maps.

## Semantic decision register

These decisions close the questions raised by the final independent advisor
review. They are design inputs for later packets, not permission to implement
production behavior during Phase 0. A worker stops rather than choosing a
different answer locally.

| ID     | Binding decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Required proof before dependent work                                                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-1  | Authoritative resource collections use canonical resource-instance identity. Descriptor-ID compatibility lookup yields none for zero, one value for exactly one, and a typed ambiguity diagnostic for more than one.                                                                                                                                                                                                                                                                                                                                                                                                | Two same-definition refs never alias; compatibility lookup never selects by insertion/order.                                                                                                                                           |
| DEC-2  | Structural approved keys are canonical and durable. Unsupported object/function identity is runtime-local, owned by the runtime, and explicitly nonserializable. Raw params/keys never become public identity or default diagnostics.                                                                                                                                                                                                                                                                                                                                                                               | Structural property suite, mutation stability, local-token lifetime, and serialization rejection.                                                                                                                                      |
| DEC-3  | App identity is derived from sorted, length-delimited validated module IDs. Registry maps use null-prototype/Map storage. Reserved/prototype-like IDs, control characters, oversize IDs, duplicates, and inventory collisions fail before ownership is installed.                                                                                                                                                                                                                                                                                                                                                   | Module reorder stability, delimiter collision, `__proto__`/`constructor` fuzz, and no partial app creation.                                                                                                                            |
| DEC-4  | Constructors copy/freeze library-owned arrays, maps, metadata, and config containers. They do not deep-freeze arbitrary client domain values. Definition callbacks are stored inert and run only by their semantic owner.                                                                                                                                                                                                                                                                                                                                                                                           | Mutating original containers after construction cannot change inventory, ownership, identity, or behavior.                                                                                                                             |
| DEC-5  | A resource ref is a registry-issued capability carrying definition/provenance identity; structural shape and optional private fields are insufficient. Foreign-copy, wrong-app, wrong-runtime, and forged refs fail at attachment.                                                                                                                                                                                                                                                                                                                                                                                  | Direct, packed, duplicate-package, and forged-object negative fixtures.                                                                                                                                                                |
| DEC-6  | Actor registry identity is owner domain + exact machine token + public actor ID + monotonic incarnation. A runtime-owned attachment lease coordinates React consumers; release synchronously changes registry authority and async finalization is serialized. Explicit stop/runtime shutdown await and override leases.                                                                                                                                                                                                                                                                                             | Same-ID incompatible definitions fail; shared consumers survive one release; replacement cannot race old cleanup.                                                                                                                      |
| DEC-7  | Machine context initialization is a documented pure and deterministic client callback. React may compute an inert initial snapshot during a render attempt, but it starts no library-owned work. Commit adopts that exact snapshot and never invokes the initializer again. Strict Mode/aborted renders may repeat client computation. JavaScript cannot enforce absence of arbitrary side effects inside the callback, so purity is a client contract rather than a false runtime guarantee.                                                                                                                       | Aborted render causes no runtime facts; committed start uses the exact context/snapshot seed and does not call the initializer again; docs and client fixtures demonstrate the purity requirement.                                     |
| DEC-8  | Semantic state commits before trace/inspection/listeners. One logical batch exposes one stable snapshot and at most one callback per subscriber. Listener order is FIFO snapshot-at-batch-start; add/remove affects the next batch; reentrant work queues after the batch. Listener/sink errors are isolated and reported.                                                                                                                                                                                                                                                                                          | Fault injection, add/remove/reentrant ordering, later-listener delivery, and unchanged committed state.                                                                                                                                |
| DEC-9  | Public facts preserve distinct domain failure, decode rejection, unsupported input, conflict, stale, defect, interruption, cleanup, observer, and invariant lanes. Receipts migrate to discriminated serializable unions behind the compatible public supertype.                                                                                                                                                                                                                                                                                                                                                    | Exhaustive type fixtures, JSON serializability, and no lane collapsed to `undefined` or generic rejection.                                                                                                                             |
| DEC-10 | Atomicity covers only Flow State-owned actor/resource/preview/issue/receipt publication. External I/O already executed by client Effects is not rolled back. Clients own idempotency/compensation.                                                                                                                                                                                                                                                                                                                                                                                                                  | A failed/stale publication leaves library state coherent while the test explicitly proves external calls may already have happened.                                                                                                    |
| DEC-11 | Every retained collection is classified as topology-bounded, configured-capacity, or runtime-lifetime-owned. P0.1 measures realistic cardinalities; P0.6 records default limits and typed overflow/eviction behavior before implementation. Silent drop and worker-chosen constants are forbidden.                                                                                                                                                                                                                                                                                                                  | Long-run and adversarial-load fixtures prove bounds, diagnostics, cleanup, and no corruption.                                                                                                                                          |
| DEC-12 | Effect Clock and deterministic ordering are authoritative. Pure guards cannot make wall-clock decisions: existing guard `runtime.now` compatibility is deprecated/frozen to snapshot logical time; real time-based behavior uses timers or explicit clock-derived events.                                                                                                                                                                                                                                                                                                                                           | `flow.can`/dispatch differential at the same snapshot and a negative time-dependent guard fixture.                                                                                                                                     |
| DEC-13 | Boot v1 is immutable, dual-read compatible, and remains default output. Portable remaining-duration timers and new durable ownership/generation facts require an approved v2. v1 absolute `dueAt` is not advertised as cross-host safe.                                                                                                                                                                                                                                                                                                                                                                             | v1 corpus, JSON round-trip, wrong-version rejection, and a documented v2 trigger list.                                                                                                                                                 |
| DEC-14 | Existing child supervision and manual retry are the compatibility floor. Automatic restart budgets and richer child input/output/failure generics are removed from active scope until a separately approved additive packet exists.                                                                                                                                                                                                                                                                                                                                                                                 | Current child calls/types pass unchanged; no automatic restart receipt or behavior appears.                                                                                                                                            |
| DEC-15 | Compatibility is measured separately for source calls, runtime behavior, receipts, in-memory snapshots, wire formats, and packed exports. ESM-only remains explicit. React is an optional peer for core-only consumers and required by the React subpath. Core remains React/Node neutral. Duplicate package/Effect instances fail ownership checks unless an interoperability contract is deliberately added.                                                                                                                                                                                                      | Root/subpath packed clients, duplicate-install fixture, peer-resolution matrix, and export/declaration parity.                                                                                                                         |
| DEC-16 | Effect is the native execution, dependency, concurrency, time, stream, lifecycle, and failure substrate. Runtime capabilities are `Context.Service` contracts; pure, effectful, and resourceful implementations use `Layer.succeed`, `Layer.effect`, and `Layer.scoped` respectively; important operations use `Effect.fn`; one host-owned `ManagedRuntime` bridges to Promise/framework APIs. Flow wrappers exist only where Flow adds resource, transaction, machine, evidence, or adapter semantics.                                                                                                             | The Effect architecture map below, exact `A/E/R` and Layer inference fixtures, service/layer/scope owner inventory, no semantic-owner `Effect.run*`, deterministic lifecycle tests, and a no-bespoke-clone review.                     |
| DEC-17 | Public operations have an executable law register. Identity equivalence is reflexive/symmetric/transitive; accepted structural encoding is injective and property-order invariant; app identity is module-order invariant; reads/`can`/dehydrate are observationally pure; stop/dispose/unsubscribe/cancel and identical hydrate are idempotent; nested batches flatten associatively with empty identity; per-owner queues are FIFO and explicitly non-commutative; fact sequence is monotonic with explicit truncation gaps.                                                                                      | Independent property/metamorphic tests exercise each law and named non-law without importing the production encoder, reducer, batcher, or serializer as the oracle.                                                                    |
| DEC-18 | Flow State guarantees complete decode before in-process mutation, one coherent in-process publication at each declared barrier, and stale-publication exclusion. It does not guarantee durable writes, finalization after process death/serverless freeze, exactly-once external effects, remote rollback, or atomic persistence merely because a boot payload was returned. Hosts own durable atomic write, reconciliation, idempotency/compensation, and process deadlines.                                                                                                                                       | Crash-point tests around decode/attach/publication plus documentation that proves zero partial in-process mutation while explicitly rejecting persistence/external-I/O claims.                                                         |
| DEC-19 | Scheduling is FIFO and non-reentrant per actor and FIFO per serialized transaction key, with bounded work per scheduler turn and a yield before another turn. Admission happens before client work. Cancellation is cooperative; uninterruptible/hung client work may delay progress but becomes stale immediately and cannot publish. No strict global fairness is promised, but one hot owner cannot synchronously drain forever or starve ready owners.                                                                                                                                                          | Deterministic hot-owner/cross-owner progress tests, queue-capacity admission tests, cancellation races, and a documented no-progress case for a never-completing serialized predecessor.                                               |
| DEC-20 | Durable keys and foreign payloads accept only the approved data domain and own-data properties. Reject accessors, symbol keys, cycles, functions, class/Date/Map/Set instances, unsupported sparse arrays, oversize/deep graphs, hostile prototype keys, and cross-realm/runtime-local capabilities. Do not invoke getters, proxy traps intentionally, `toJSON`, coercion hooks, or user equality during validation. Wire versions use strict known fields plus an explicit `extensions` field, reject newer versions and duplicate semantic IDs, and promise semantic JSON round-trip rather than canonical bytes. | Getter/proxy/`toJSON` sentinels, cross-realm/duplicate-copy refs, sparse/cyclic/oversize fixtures, strict-field/version corpus, and zero-mutation rejection.                                                                           |
| DEC-21 | Graceful shutdown first marks every owner closing and rejects new work, then interrupts all owned work, attempts every finalizer despite earlier cleanup failure, aggregates complete `Cause`, evicts only exact generations, and finally closes the ManagedRuntime/Layer Scope. Repeated shutdown joins the same result. The library accepts an optional host deadline/cancellation signal but does not invent a universal timeout; forced host termination may prevent finalization and is reported as such.                                                                                                      | Success/failure/defect/interruption/hang fixtures prove later cleanup is not starved, handler and cleanup Causes are both preserved, exact eviction holds, repeated callers share completion, and host deadline behavior is explicit.  |
| DEC-22 | Until a separately approved provider-owned runtime API exists, React never creates or hydrates a runtime during render. A client bootstrap host may create/hydrate a caller-owned runtime in an effect, render a deterministic non-Flow fallback until ready, inject it through `FlowProvider`, and dispose it on final host unmount. Offscreen retention without unmount keeps leases; multiple roots may share one runtime through leases; HMR/incompatible definitions require explicit replacement; server components do not import client hooks/runtime creation.                                              | Launch Workspace aborted/Strict render creates zero runtimes/facts; bootstrap success/failure/dispose, hydration mismatch/fallback, Offscreen, multiple roots, provider swap, and HMR replacement are tested without private mutation. |

## Library and client implementation practices

Library code:

- Enforce identity, provenance, ownership, version, policy, capacity, and
  serialization invariants in the owning library boundary; do not ask clients
  to coordinate them manually.
- Keep definition constructors pure. Normalize/copy/freeze library-owned shape,
  preserve exact generic information, and defer callbacks to production owners.
- Represent definitions, refs, runtime instances, handles, attempts,
  incarnations, snapshots, receipts, and encoded payloads as distinct types.
- Use opaque internal identities and discriminated readonly state/fact unions.
  Validate before the localized assertion needed to cross an erased registry.
- Preserve `Effect<A, E, R>`, Scope, Cause, interruption, and finalizers through
  semantic seams. Convert to Promise only at an explicit host API.
- Install generation/publication authority before starting asynchronous work and
  check it again immediately before committing facts.
- Commit semantic state before notifying listeners or exporting evidence.
- Make ordering, Clock, capacity, overflow, retention, and cleanup deterministic
  and testable. Avoid sleeps, ambient wall clock, object iteration accidents,
  and process-global mutable registries.
- Treat every foreign/durable input as `unknown`, enforce size/depth/count limits,
  decode completely, and commit once.
- Keep root/server/testing/inspect/React entry points environment-specific only
  where their public job requires it; adapters delegate and never reinterpret.

Client code and Launch Workspace examples:

- Define descriptors once at module scope and retain their exact inferred types;
  avoid broad annotations such as `: FlowAppDefinition`.
- Keep keys, guards, updates, views, params, tags, placeholders, routes, and the
  context initializer pure and deterministic.
- Return Effects/Streams from definitions instead of running them. Normalize
  foreign SDK/Promise exceptions into tagged domain failures at service seams.
- Use scoped/acquire-release services and make external operations interruption-
  safe. Add idempotency or compensation where cancellation cannot undo remote I/O.
- Use typed resource refs. Never use descriptor IDs, raw keys, or receipt scans as
  a second cache or source of business truth.
- Create runtimes at application/request host boundaries, inject them through
  adapters, and dispose the owner exactly once. Never manage generations,
  retries, queue ownership, leases, or registry cleanup in client code.
- Pass foreign boot JSON as `unknown`; use Schema for values actually crossing
  an encoded boundary, not as mandatory local authoring ceremony.
- Keep secrets out of context/snapshots/receipts by default and make redaction
  explicit at export/CLI/inspection boundaries.
- Test through production owners using TestClock, controlled services, and
  bounded fault injection; do not build a client-side interpreter.

## Binding Effect architecture blueprint

This map is a pre-implementation contract, not a menu of fashionable modules.
A packet uses the smallest native primitive that owns its invariant and records
why. It must not introduce an Effect wrapper merely for Flow namespace symmetry,
and it must not use every primitive listed here. Exact APIs are verified against
the repository's pinned Effect version before implementation.

### Composition and lifetime

```text
client service contracts -> live/test service Layers -> App Layer
runtime config/source Layers -> scoped runtime services -> OrchestratorSystem
App Layer + runtime service Layer -> one host-owned ManagedRuntime
ManagedRuntime -> React/server/testing/CLI host adapters only
```

- Use `Context.Service` for a replaceable capability with multiple
  implementations or lifecycle/configuration of its own. Do not create a service
  for a pure helper, data constructor, one-off policy branch, or namespace.
- Use `Layer.succeed` for an already-constructed pure service value with no
  acquisition; `Layer.effect` for effectful construction without a retained
  resource; `Layer.scoped` for subscriptions, fibers, pools, handles, or anything
  needing finalization. A Layer may fail acquisition and retain unprovided `R`.
- Use `Layer.merge`/`mergeAll` for independent siblings and `Layer.provide`/
  `provideMerge` for dependency direction. Do not hide dependencies in service
  bags, mutable globals, broad `Layer.Any` arrays, or cast-driven wiring.
- Use `ManagedRuntime` only at a real host lifetime boundary. Runtime creation is
  not feature logic. `runPromise`, `runPromiseExit`, `runSync`, and disposal stay
  on explicit host adapters; semantic owners compose/yield Effects instead.
- Use `Effect.fn("Stable.operation")` for service methods and important resource,
  transaction, actor, stream, timer, child, hydration, and evidence operations.
  Names are stable diagnostic vocabulary, not generated from raw client data.
- Every long-lived operation has one Scope owner. Acquisition registers its
  finalizer before work becomes externally visible. Use uninterruptible regions
  only around the smallest authority/finalizer-installation critical section;
  restore interruptibility for client work and waits.

### Native primitive selection

| Invariant                                | Required/default Effect feature                                                      | Important limit                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Pure internal absence                    | `Option`                                                                             | Convert to/from `null`/`undefined` only at React, JSON, or foreign boundaries; avoid nested `Option` |
| Pure synchronous validation              | `Either`, `Schema.decodeUnknownEither`/parse results, brands/newtypes as appropriate | Async/service failures stay in `Effect`; Schema is not mandatory for local-only values               |
| Foreign/durable validation               | `Schema.decodeUnknown`/encode plus tagged boundary errors                            | Decode all before mutation; enforce depth/size/count and redaction                                   |
| Typed execution                          | `Effect<A, E, R>` and `Effect.fn`                                                    | Never erase `E`/`R` into Promise, thrown exceptions, `unknown`, or service bags                      |
| Outcome preservation                     | `Exit` and `Cause`                                                                   | Do not flatten typed failure, defect, interruption, or composed causes into strings                  |
| Synchronous atomic state                 | `Ref`                                                                                | State update must be pure and short; no client callback or Effect inside the update                  |
| Effectful serialized state transition    | `SynchronizedRef`                                                                    | Keep the critical section short; never hold it across remote I/O or subscriber callbacks             |
| One-shot coordination                    | `Deferred` or `Latch`                                                                | Completion is exactly once; tests wait for an explicit started gate before releasing work            |
| Keyed owned fibers                       | `FiberMap`                                                                           | Key includes owner/incarnation/generation; replacement and Scope close interrupt exact fibers        |
| Unkeyed owned fibers                     | `FiberSet`                                                                           | It is lifetime tracking, not publication authority or a queue                                        |
| Point-to-point ordered work/backpressure | bounded `Queue`                                                                      | Capacity and overflow are explicit; unbounded is allowed only with a proved topology bound           |
| Fanout to many subscribers               | bounded `PubSub` plus scoped subscriptions                                           | Slow-subscriber/overflow behavior and cleanup are explicit; observer failure is isolated             |
| Bounded concurrency                      | `Semaphore`                                                                          | Admission control does not by itself prove FIFO ordering or serialize ownership generations          |
| Ongoing values                           | `Stream<A, E, R>` with scoped consumers                                              | `AsyncIterable` is an adapter; consumption is bounded and state/actor exit interrupts it             |
| One-shot delay                           | `Effect.sleep(Duration.Input)` using `Clock`                                         | Do not implement one-shot timers with `Schedule` or wall-clock APIs                                  |
| Retry/repeat/poll/backoff                | `Schedule`                                                                           | Only an approved owner/policy may retry; no hand-rolled loops or hidden retry defaults               |
| Deterministic time tests                 | `TestClock`                                                                          | No real sleep, `Date.now`, double flush, or ambient scheduler as semantic proof                      |
| Lookup batching                          | `RequestResolver` when batching belongs to the client service                        | Do not make ResourceStore identity/notification semantics a RequestResolver side effect              |
| Lookup reuse/TTL                         | Effect `Cache` only when its exit/TTL/capacity model exactly matches                 | Flow freshness, invalidation, UI snapshots, and ref provenance remain ResourceStore semantics        |
| Replaceable scoped value                 | `ScopedRef`/Effect `Resource` only when their lifecycle matches exactly              | Do not rename either as `flow.resource` or create a second resource owner                            |
| Sensitive values                         | `Redacted`, `Schema.Redacted`, `Config.redacted`                                     | Raw values unwrap only at I/O and never enter default evidence/snapshots                             |
| Exhaustive states/policies               | discriminated `Data`/Schema values plus `Match`                                      | Avoid boolean mode soup, optional contradictory fields, and stringly status branching                |

Plain immutable `Map`/`Set` inside one Effect-owned state value may remain when
it is only data. Raw mutable collections are not allowed to become an alternate
concurrency, lifecycle, queue, subscription, or generation owner merely because
they are convenient.

### Feature-to-Effect construction map

| Flow capability           | Service and Layer                                                                                                                     | Effect operations and owned primitives                                                                                                                                   | Composition and non-goals                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definitions/normalization | No runtime service or Layer                                                                                                           | Pure constructors; `Either`/`Option`/`Schema` only at the appropriate validation boundary; immutable data and nominal identity                                           | May store typed callbacks inertly; never run Effect, inspect services, allocate Scope, or start fibers                                                           |
| Client external APIs      | One `Context.Service` contract per coherent external capability; separate live/test `Layer.succeed`/`effect`/`scoped` implementations | `Effect.fn` methods preserving exact `A/E/R`; `Effect.try`/`tryPromise` only where foreign code enters; scoped acquire/release for clients/sockets/files                 | Feature definitions depend on contracts, never concrete Layers; normalize foreign exceptions once; client owns remote idempotency/compensation                   |
| App/runtime assembly      | Explicit app Layer plus runtime-core Layer; one `ManagedRuntime` per host-owned lifetime                                              | Layer acquisition error remains typed; runtime disposal closes its Scope and awaits owned finalizers                                                                     | No parallel DI container, mutable singleton runtime, hidden default `Effect.run*`, or cast that claims missing services are provided                             |
| ResourceStore             | `ResourceStore` service from a scoped Layer when subscriptions/lookups are retained                                                   | Short atomic state via `Ref`/`SynchronizedRef`; keyed lookup fibers via `FiberMap`; shared completion via `Deferred`; Clock/Schedule only for approved freshness/refresh | Flow owns ref provenance, snapshots, invalidation, batching, and subscribers. `Cache`/`RequestResolver` may support service lookup only after semantic-fit proof |
| Actor/orchestrator        | `OrchestratorSystem` from a scoped Layer depending directly on ResourceStore/evidence/policy services                                 | Bounded FIFO mailbox via the approved Queue/driver; keyed actor/state work via `FiberMap`; actor Scope; `Exit`/`Cause`; atomic generation registry state                 | Public send/start may be host-shaped, but internal dispatch remains Effect. No `runSyncWith`/`runPromiseWith` callback island or adapter-owned registry          |
| Transactions              | Actor/orchestrator-owned operations, not a second public runtime service unless P0 owner mapping proves one is needed                 | `Effect.fn`; `FiberMap`/`FiberSet` attempts; bounded Queue for serialize; admission state/Semaphore where appropriate; `Exit`/`Cause`; ResourceStore batch               | Queue order, generation authority, preview, publication, and interruption stay distinct. Cancellation never promises external rollback                           |
| Streams                   | Actor-owned scoped Stream runner                                                                                                      | `Stream`, scoped `runForEach`, FiberMap generation, bounded Queue/PubSub pressure, `Exit`/`Cause`                                                                        | AsyncIterable only adapts foreign/test input. No unbounded collect/drain, detached producer, or adapter-owned stream engine                                      |
| Timers/retry              | Actor timer owner; client service policy owns service retry                                                                           | `Effect.sleep`, `Duration.Input`, Clock/TestClock for one-shot timers; `Schedule` for explicitly approved retry/repeat/polling                                           | No `Date.now`, real sleeps, custom retry loop, automatic child retry, or Schedule-based redefinition of `flow.after`                                             |
| Children                  | Parent actor Scope and OrchestratorSystem                                                                                             | FiberMap keyed by parent/binding/child/generation; `Exit`/`Cause`; explicit finalizers                                                                                   | Parent stop awaits children. No independent child registry, hidden restart budget, or stale child publication                                                    |
| Views                     | No long-lived service; pure evaluator/source projection                                                                               | Pure `Option`/`Match`/`Equivalence` where useful; subscriptions consume canonical sources                                                                                | A view starts no Effect and stores no canonical data; it is not a renamed actor snapshot                                                                         |
| Notifications/evidence    | Runtime-owned notification/evidence services; scoped Layer for retained subscriptions/sinks                                           | Serialized sequence state, bounded PubSub where asynchronous fanout is selected, Effect spans/annotations, redaction, sink isolation                                     | State commits first. Evidence cannot veto semantics, block indefinitely, expose live objects, or become business state                                           |
| Hydration/persistence     | Boundary decoder/encoder plus affected runtime services; no global codec registry                                                     | Schema decode from `unknown`; pure migration with `Either`/parse results where useful; one scoped/atomic attach Effect; immutable decoded value                          | No entry-by-entry mutation, executable refs, partial version trees, raw secrets, or implied crash durability beyond the documented boundary                      |
| React                     | Caller-owned runtime injected by provider; runtime-owned lease service if needed                                                      | `useSyncExternalStore` over canonical sources; host callbacks acquire/release through runtime handles                                                                    | No Effect/Promise execution, cache creation, actor start, hydration, or service lookup during render; no private actor resurrection                              |
| Server/request            | Request Layer/Scope supplied by host; ManagedRuntime only if the host truly owns a separate runtime                                   | Scoped acquisition, decode/redact at boundary, `Exit`/Cause-aware host conversion                                                                                        | No request runtime global, cross-request owner alias, or server adapter semantics                                                                                |
| Testing/CLI               | Test Layers replace service implementations; CLI owns its Node Layer/ManagedRuntime                                                   | `it.effect`/scoped tests, TestClock, Deferred started gates, bounded Queue/PubSub, controlled Stream, `Effect.exit`; CLI maps final Exit/Cause once                      | No `Effect.run*` inside an active Effect test, real sleep, source-text behavior proof, test interpreter, or CLI-owned runtime rules                              |

### Thermo-nuclear packet gate

Before writing code, every implementation packet records:

1. the surviving semantic owner and dependency direction;
2. every `Context.Service` consumed/produced and exact remaining `R`;
3. each Layer as `succeed`, `effect`, or `scoped`, including acquisition failure;
4. Scope owner, child fibers, interruption point, finalizer order, and finalizer `Cause`;
5. state/concurrency primitive choice and why a simpler native primitive does
   not fit;
6. success, typed failure, defect, interruption, stale, cleanup, observer, and
   invariant lanes that apply;
7. the Promise/framework boundary, if any;
8. bespoke helpers/wrappers/branches deleted or explicitly justified.

After the focused tests are green, inspect and refactor before closure:

- reject erased `A/E/R`, service bags, `Layer.Any`/cast-driven wiring, expected
  failures thrown, `try/catch` around yielded Effects, and nullish internal state;
- reject semantic-owner `Effect.run*`, custom Promise cancellation, wall clock,
  real sleeps, unscoped fibers, manual cleanup flags, and custom Effect clones;
- check whether independent Layer/effects can compose without sequential
  orchestration and whether related state can publish through one atomic owner;
- reject new special-case flags, duplicate helpers/owners, generic dumping-ground
  modules, or a code file crossing 1,000 lines without a decomposition decision;
- run the thermo-nuclear review, fix every blocking finding, rerun focused and
  affected verification, then record the receipt. Review is not a substitute
  for this blueprint; it checks conformance to it.

## Specialist review gates

These are required reviews, not unresolved worker choices:

- API/compatibility review during P0.6 for every observable source/runtime/
  receipt/snapshot/wire/export change and the permanent v1 corpus.
- Effect review before P1D.1 closes for Scope hierarchy, deduplicated lookup
  leases, finalizer Cause exposure, and partial Layer-acquisition cleanup.
- Concurrency review before P2 closes for latest-started `allow`, mailbox/
  reentrant ordering, stale evidence, and the actor/ResourceStore batch barrier.
- React review before P4B.1 implementation for pure initial render, Strict Mode,
  aborted/Suspense render, attachment leases, server snapshots, and provider swaps.
- Security review before P4C/P4D close for data classification, redaction,
  terminal escaping, untrusted payload transport, and size/depth limits.
- Test-architecture review in P0.6/P5.4 for model-based families, permanent
  compatibility corpus, leak thresholds, and CI-safe fault injection.

## Reference-code reading policy

The local checkouts under `docs/codebases/tanstack-query` and
`docs/codebases/xstate` are optional design and test references. They are not
Flow State dependencies, API authorities, or templates. `API_CONTRACT.md`,
`TYPE_INFERENCE_CONTRACT.md`, `ARCHITECTURE_CONTRACT.md`, the decision register
above, and the owning phase packet always win.

Rules for every worker using a reference:

1. Read only the files named by the owning packet unless a strong reviewer
   expands the packet. Record the exact files read in the packet receipt.
2. Extract an invariant, race, negative case, or test shape. Do not transplant
   implementation code, public vocabulary, status models, Promise engines,
   singleton managers, private-field techniques, or upstream defaults.
3. Translate every idea through Flow State's owners: Effect Scope/Fibers/Clock,
   canonical instance identity, typed failure lanes, immutable snapshots,
   bounded evidence, and runtime-owned publication.
4. Treat every `Anti-reference` note as a bug pattern to test against, not an
   implementation suggestion. If a reference conflicts with Flow State, stop
   using it; do not reopen a binding decision inside a smaller-model packet.
5. A copied upstream test is not proof. Rewrite the case through Flow State's
   public/production owner and assert Flow State's exact positive and negative
   behavior.

Reference themes approved by this review:

| Flow State concern         | Useful reference idea                                                                                                   | Binding rejection                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Batching and subscriptions | Nested batching, first/last subscriber hooks, coherent post-update notification                                         | No module-global notification singleton, wall-clock scheduler, or observer exception in the commit path             |
| Resource/source cleanup    | Remove inactive entries only when the exact current object/generation still owns the key                                | No timer-default cache semantics or stale cleanup deleting a replacement                                            |
| Transaction overlap        | Same-scope serialization, different-scope concurrency, exact target removal, pause/cancel race tests                    | No Promise retry engine, global focus/online state, unbounded queue, or swallowed cleanup error                     |
| Actors and mailboxes       | FIFO non-reentrancy, public ID versus incarnation/session ID, exact unregister, stop-before-replacement                 | No process-global counters/random identity, private mutation, casts as ownership proof, or uncaught inspection sink |
| Timers                     | Virtual-time ordering, cancellation while flushing, callbacks that schedule/cancel callbacks                            | No `Date.now`, absolute cross-host deadlines, or a second simulated clock beside Effect TestClock                   |
| Restore/hydration          | JSON round-trip, idempotency, stale/newer conflict, no replay of completed work, deep child generation tests            | No permissive casts, entry-by-entry mutation, trusted payload hash, or render-time hydration                        |
| React stores               | Stable subscribe/getSnapshot, create-to-subscribe race closure, selector equality, Strict Mode and aborted-render tests | No render-time runtime mutation, cache creation/fetching, implicit runtime disposal, or private actor resurrection  |
| Inspection                 | Event taxonomy and post-transition facts can inspire bounded evidence cases                                             | No unredacted live refs, executable metadata probing, or synchronous observer veto of state                         |

## Known defect ledger

Every defect below must be assigned to exactly one packet and closed by a
positive/negative regression. Do not fix it opportunistically in an unrelated
packet.

| ID      | Current defect                                                                                                                                              | Owning packet |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| BUG-1   | `resource.ref` executes lookup/tags/placeholder eagerly and stores hidden executable state; key execution is not isolated to explicit identity construction | P1A.1         |
| BUG-2   | Store identity uses raw `JSON.stringify`, permitting collisions/failures                                                                                    | P1A.2         |
| BUG-3   | Actor resource snapshots and owned-query keys collapse instances to descriptor ID                                                                           | P1A.3         |
| BUG-4   | Transaction preview overlays and rollback bookkeeping collapse refs by descriptor ID                                                                        | P2.2          |
| BUG-5   | `flowTest` owns an ID-only cache and independent machine/async interpreters                                                                                 | P1D.2         |
| BUG-6   | Transaction completion uses inconsistent gates for summary snapshot, preview, receipt, invalidation, route, and queue publication                           | P2.1          |
| BUG-7   | Preview patches notify/mutate incrementally instead of one atomic batch                                                                                     | P2.2          |
| BUG-8   | App-bound and focused runtimes do not express distinct ownership authorization                                                                              | P1C.1         |
| BUG-9   | Hydration trusts a typed payload, validates little, and can mutate before full validation                                                                   | P4C.1         |
| BUG-10  | Behavior coverage invokes client route callbacks with Proxy probes                                                                                          | P4D.1         |
| BUG-11  | React actor hook starts through compatibility `createActor`, not the canonical orchestrator                                                                 | P4B.1         |
| BUG-12  | `useActor` preferred alias is absent                                                                                                                        | P4B.2         |
| BUG-13  | Launch Workspace docs/inventory disagree about executable resource behavior                                                                                 | P0.2          |
| BUG-14  | Readiness view counts obsolete `cache:invalidate` receipts                                                                                                  | P2.3          |
| BUG-15  | API inventory links a missing `reference-next/lib-api.md`                                                                                                   | P0.2          |
| BUG-16  | Launch Workspace app/graph annotations can widen types while source-text tests remain green                                                                 | P0.3          |
| BUG-17  | Child contract promises input/output/failure propagation absent from current public types                                                                   | P0.4          |
| BUG-18T | Transaction bivariant callback helpers permit unsafe narrower callbacks                                                                                     | P2.4          |
| BUG-18M | Machine bivariant callback helpers permit unsafe narrower callbacks                                                                                         | P3A.2         |
| BUG-18S | Stream bivariant callback helpers permit unsafe narrower callbacks                                                                                          | P3B.3         |
| BUG-19  | Runtime disposal/finalizer/registry eviction ordering is not proved exactly once                                                                            | P1C.3         |
| BUG-20  | Descriptor-ID compatibility reads have no defined ambiguity behavior                                                                                        | P1A.3         |
| BUG-21  | Root `pnpm lint` resolves examples/type fixtures through missing or stale built declarations and emits cascading false errors                               | P0.1          |
| BUG-22  | Keep-alive actor reuse checks only actor ID plus machine ID and can cast a different same-ID machine definition to the requested type                       | P1C.1         |
| BUG-23  | React's inert actor shell calls `machine.getInitialSnapshot()` during render, executing the context factory outside canonical actor start                   | P4B.1         |
| BUG-24  | React actor swap cleanup fires asynchronous disposal without coordinating replacement start, allowing same-ID registry races                                | P4B.1         |
| BUG-25  | `FlowActorStartOptions.policy` accepts any string, so unsupported policy values silently act like another policy                                            | P1C.1         |
| BUG-26  | Resource snapshot/hydration code uses `undefined` as absence and cannot faithfully represent a declared `Value` or error containing `undefined`             | P1A.4         |
| BUG-27  | App identity depends on module order and delimiter concatenation                                                                                            | P1A.0         |
| BUG-28  | App/module registries permit reserved/prototype keys and inventory fields can overwrite descriptor fields                                                   | P1A.0         |
| BUG-29  | Frozen definition wrappers retain caller-mutable configuration containers                                                                                   | P1A.0         |
| BUG-30  | Structurally forged or foreign resource refs can cross runtime seams through optional/private shape checks                                                  | P1A.3         |
| BUG-31  | Open string-indexed receipts cannot prove vocabulary, lane-specific fields, exhaustiveness, or serializability                                              | P2.3          |
| BUG-32  | Guard defects are swallowed and treated as a false guard                                                                                                    | P3A.1         |
| BUG-33  | Trace/inspection append and observer callbacks can run before the semantic snapshot commits                                                                 | P1D.3         |
| BUG-34  | Trace, actor-receipt, and default inspection histories are unbounded                                                                                        | P1D.3         |
| BUG-35  | Resource selection sources remain cached after the final subscriber leaves                                                                                  | P1B.2         |
| BUG-36  | Stream queue/coalescing policies can be unbounded or silently discard overflow                                                                              | P3B.2         |
| BUG-37  | Portable timer restore persists absolute `dueAt` without a cross-host clock-skew rule                                                                       | P3C.1         |
| BUG-38  | Broad Launch Workspace app annotation erases the exact app type under proof                                                                                 | P1A.0         |
| BUG-39  | Launch Workspace derives product/debug state from unbounded receipt history                                                                                 | P4A.3         |
| BUG-40  | `flow.can` and dispatch can disagree when guards observe synthetic versus runtime time                                                                      | P3A.1         |
| BUG-41R | Optional resource snapshot value/error fields make absent/present and contradictory lifecycle states representable                                          | P1A.4         |
| BUG-41T | Optional transaction snapshot result/error fields make contradictory completion states representable                                                        | P2.1          |
| BUG-41S | Optional stream snapshot value/error fields make contradictory terminal states representable                                                                | P3B.1         |
| BUG-42  | `runtime.resources.get` can manufacture an empty snapshot where the public contract says an unknown ref returns `null`                                      | P1B.1         |
| BUG-43  | A throwing selector/equality function can advance the cached selection snapshot before comparison succeeds, corrupting later reads                          | P1B.2         |
| BUG-44  | Actor construction activates restored/state-owned work before the new incarnation is installed as registry authority                                        | P1C.4         |
| BUG-45  | Launch Workspace creates and hydrates a runtime during React render, leaking work on aborted render/Strict Mode                                             | P4B.1         |
| BUG-46  | Invalidation refresh uses detached fibers that can outlive ResourceStore/runtime ownership                                                                  | P1A.4         |
| BUG-47  | A cleanup or actor-stop failure can skip later cleanup and prevent ManagedRuntime/Layer Scope disposal                                                      | P1D.1         |
| BUG-48  | Ready-work uses `Array.shift()` and drains synchronously without a turn budget, causing superlinear behavior and starvation                                 | P1C.4         |
| BUG-49  | Boot dehydration has no cross-owner snapshot barrier, so actor/resource facts may not represent one coherent logical cut                                    | P4C.1         |
| BUG-50T | A transaction can complete synchronously before its running/pending state is committed                                                                      | P2.1          |
| BUG-50S | A stream can emit/complete synchronously before its running state is committed                                                                              | P3B.1         |

## Assumption audit

This section separates facts observed in the current source from design choices
and predictions. Smaller models may rely on confirmed facts and binding
decisions; they must not turn an unresolved point into an implementation guess.

### Confirmed from current source/tests

- `resource.ref(...)` executes lookup/tags/placeholder eagerly and stores the
  results on a non-enumerable `__runtime` property.
- Store/in-flight/subscription identity uses descriptor ID plus raw
  `JSON.stringify(ref.key)`, while actor resources, preview overlays, and the
  flow-test cache still contain descriptor-ID-only paths.
- Current `allow` transaction tests deliberately make the latest-started
  same-ID attempt the snapshot/route winner even when an older external commit
  completes later. Older and newer external Effects may both run.
- Current completion code gates snapshot/issues/routes differently from preview,
  receipts, invalidation, rollback, and queue resumption; publication authority
  is not represented once and reused.
- Keep-alive reuse checks stable actor ID plus `machine.id`, then casts the
  existing actor to the caller's requested machine type. It does not prove the
  same definition object, app owner, or compatible contract.
- `FlowActorStartOptions.policy` is `string`; only `"keep-alive"` has special
  reuse behavior, so misspellings silently fall into other behavior.
- The React actor shell calls `machine.getInitialSnapshot()` during render, and
  hook cleanup launches `actor.dispose()` without awaiting it before a possible
  replacement start.
- Runtime boot is v1, `hydrateBoot` accepts an already typed payload, duplicate
  actor IDs are collapsed by `Object.fromEntries`, and resources are applied
  after only a version check.
- Resource internal state uses `Option`, but public snapshot/hydration conversion
  uses `undefined` as the absence marker. A legitimate `undefined` value/error
  cannot round-trip faithfully.
- Behavior coverage invokes outcome-route callbacks with Proxy probes.
- `flowTest` still owns transition, cache, transaction, stream, timer, child,
  and pending-work behavior that can drift from production owners.

### Corrections made by this review

- Do not treat every active `allow` attempt as an independent actor-fact
  publisher. Preserve current latest-started publication semantics unless a
  separately approved API change says otherwise; older attempts may execute
  externally but cannot overwrite newer actor facts.
- Do not introduce or emit boot v2 inside the decoder fix. Decode v1 safely and
  validate ownership when attaching snapshots; request a separate versioned
  compatibility packet if v1 lacks required durable facts.
- A runtime-owned React attachment/lease is a target mechanism, not an existing
  capability. A smaller model must not simulate it by merely skipping dispose,
  adding a React-global refcount, or swallowing duplicate-actor errors.
- “Incompatible same-ID tag” is not currently meaningful for ID-only tags. It
  becomes enforceable only if optional tag metadata/schema exists in a reviewed
  registry design; same-ID ID-only tags remain compatible.
- Structural key encoding, runtime-local object identity, and durable key
  support are deliberate target rules, not descriptions of current behavior.
  Their implementation stays in the strong-model packet; smaller models may add
  the approved table tests but may not invent another equality policy.

### Design-owned implementation seams

The semantic answers are fixed by DEC-1–DEC-22. Strong-model packets still own
the internal representation of provenance capabilities, the cross-owner batch
barrier, actor attachment records, stale preview-layer retirement, production
test controls, and versioned decoder types. Smaller models may implement the
named behavioral fixtures but may not select alternate semantics.

## Regressions that must not be introduced

These are review blockers even when a focused test is green. Each packet receipt
states which applicable guardrails were checked.

### Public API and type safety

- Do not remove or behaviorally fork `use`, `snapshot()`, `createActor`, public
  package entry points, or other compatibility aliases.
- Do not add a mandatory Schema, public AppGraph, `bind(App)`, second constructor
  family, required lifetime argument, or required generic restatement.
- Do not widen exact Params/Input/Context/Event/State/Value/Error/Requirements to
  `any`, `unknown`, `Record<string, unknown>`, a universal owner bag, or a cast at
  a public/semantic seam.
- Do not make an unsafe callback compile by adding bivariance, overload catch-alls,
  optional fields, or `as` assertions that leak through declarations.
- Do not “fix” a negative fixture by changing its intended diagnostic, adding
  unrelated errors, `@ts-ignore`, or a cast in the fixture.
- Do not narrow valid Effect requirements or erase typed failure because a live
  test happens to provide the service or never exercises the lane.
- Do not accept unsupported actor/concurrency/pressure policies as strings that
  silently behave like a default.

### Identity, data, and privacy

- Do not use descriptor ID alone for resource instances, actor-owned resources,
  previews, in-flight lookups, subscriptions, tests, React sources, or hydration.
- Do not use raw `JSON.stringify`, delimiter concatenation, object `toString`, or
  map insertion order as canonical identity.
- Do not recompute identity from mutable caller-owned params after ref creation.
- Do not keep runtime-local object/function identity in an unbounded module-global
  registry; its lifetime belongs to the owning runtime/store and must be releasable.
- Do not serialize runtime-local identity as if it were durable or claim that it
  round-trips across processes.
- Do not expose raw key/param values in receipts, diagnostics, traces, CLI, or
  logs by default; use bounded opaque instance IDs and explicit redaction.
- Do not conflate absent with present `undefined`, `null`, `false`, `0`, empty
  string, `NaN`, or an empty collection.
- Do not preserve descriptor-ID compatibility by storing duplicate mutable
  snapshots as a second source of truth or choosing one keyed instance by order.
- Do not let two runtimes/apps alias records, actors, generations, subscriptions,
  queues, or runtime-local key tokens merely because public IDs match.

### Ownership, Effect channels, and cleanup

- Do not copy production decisions into React/testing/server/inspection/CLI to
  make an adapter test pass; route the adapter to the production owner.
- Do not run lookup, commit, subscribe, route, guard, update, selector, tag,
  placeholder, or service callbacks during definition normalization, app
  compilation, inspection probing, or inert React render. React may invoke only
  the documented pure context initializer to materialize an inert snapshot and
  must reuse that snapshot at canonical start.
- Do not call `Effect.run*` or convert to Promise inside a semantic owner when
  doing so erases requirements, Scope, interruption, Cause, or finalization.
- Do not catch all failures as one `unknown` error; keep typed failure, defect,
  interruption, invalid input, unsupported behavior, and internal failure distinct.
- Do not detach work without a named Scope owner and a shutdown/finalizer test.
- Do not dispose/finalize twice, return before required finalizers finish, or
  delete a registry entry belonging to a replacement generation.
- Do not make stop/dispose succeed by abandoning children, streams, timers,
  lookups, transactions, subscriptions, or request services in the background.
- Do not use mutable module globals for runtime, request, actor, cache, queue,
  scheduler, key-token, or pending-work ownership.

### Concurrency and atomicity

- Do not let a stale transaction/stream/timer/child completion overwrite a newer
  snapshot, issue, receipt, route, invalidation, counter, or generation.
- Do not suppress or undo an external side effect and claim cancellation did it;
  cancellation controls owned fibers and publication, not already-completed I/O.
- Do not make `allow` behave like serialize/reject, or let an older allow attempt
  overwrite the latest-started publication owner.
- Do not let cancel-previous start replacement publication before the old
  generation is marked stale, and do not treat late interruption as failure.
- Do not dequeue or resume work from another transaction scope/key/generation.
- Do not publish any intermediate preview/hydration/batch state to subscribers.
- Do not roll back a stale preview by restoring an old root over newer layers.
- Do not invalidate on rejection, typed failure, defect, interruption, or stale
  success unless the public contract explicitly says so.
- Do not implement deterministic tests with sleeps, wall-clock races, unbounded
  producers, or “flush twice” as a substitute for a defined pending-work rule.

### Actor and React behavior

- Do not reuse a keep-alive actor solely because IDs match; prove definition and
  ownership compatibility before returning a typed actor.
- Do not make keep-alive pass by never disposing anything. Shared retention needs
  runtime-owned attachment accounting plus explicit stop/runtime-shutdown behavior.
- Do not let one React consumer unmount stop an actor still owned by another
  consumer, and do not let Strict Mode create two durable actors/finalizers.
- Do not call the machine context factory once for a render shell and again for
  the real actor start.
- Do not start a same-ID replacement until prior hook ownership is synchronously
  detached and asynchronous disposal cannot race registry registration.
- Do not allow a stale shell/source/listener to publish after machine, runtime,
  actor ID, snapshot, or resource ref changes.
- Do not start lookup/actor/stream/timer/transaction work during render or from a
  resource/view hook that is specified as read-only.

### Hydration, inspection, testing, and deletion

- Do not mutate any resource/actor owner until the complete foreign payload has
  decoded and ownership/schema checks pass.
- Do not silently ignore invalid entries, duplicate IDs, reserved/prototype-like
  keys, unsupported versions, stale generations, or newer existing data.
- Do not add unversioned durable fields or change v1 default emission as part of
  an unrelated decoder fix.
- Do not encode callbacks, Effects, fibers, services, subscribers, live defects,
  or unredacted secrets into boot/snapshot output.
- Do not execute callbacks to infer inspection metadata or upgrade static proof
  to runtime/mounted proof without production evidence.
- Do not let `flowTest.settle()` report idle while production owners have queued,
  blocked, scheduled, or finalizing work.
- Do not make test/live parity pass by weakening one side's assertions or
  normalizing away meaningful receipts, issues, generations, or Causes.
- Do not delete a duplicate-looking file until caller inventory and behavioral
  parity identify the surviving owner; do not delete a public alias as dead code.
- Do not update bundle/performance baselines merely to make a gate green without
  measuring and explaining the change.

## Required behavioral tests for smaller-model packets

Smaller models implement only rows assigned by their packet. They write the
positive and negative test first, demonstrate that the negative exposes the
named defect when applicable, and do not redesign the owner while writing tests.

Test-authoring rules:

- Test observable state, receipts, issues, callbacks, finalizer counts, and
  public handles. Avoid private-map assertions unless the packet is an explicit
  architecture/deletion guard.
- A positive proves the supported behavior. Its paired negative triggers one
  forbidden condition and asserts both the diagnostic/outcome and the absence of
  unintended mutation/work.
- Use TestClock, Deferred, controlled Stream, bounded producers, and explicit
  pending-work controls. No real sleeps or timing luck.
- Prefer a small table-driven matrix when lanes share one rule. Do not create a
  second interpreter or fake semantic owner in the fixture.
- Do not rewrite or weaken an existing regression to match new output. If the
  intended contract conflicts with an existing test, stop and update the packet.
- Run the same scenario through the direct production owner and adapter when the
  packet claims live/test/React/server/CLI parity.

| ID    | Positive behavior to prove                                                                                                                             | Negative behavior to prove absent                                                                                                         | Packet             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| BT-01 | Existing and preferred aliases/imports execute the same implementation and return the same typed result                                                | Removing, forking, or changing timing/identity of a compatibility alias fails                                                             | CV-1/CV-2/P5.2     |
| BT-02 | Creating a resource definition/ref is inert except for one explicit key derivation at ref creation                                                     | Lookup, tags, placeholder, app compilation, or inspection callback executes early                                                         | P1A.1              |
| BT-03 | Equal approved keys produce one stable instance ID and distinct primitive/tuple/object cases remain distinct                                           | JSON-collision cases, delimiter tricks, cycles, mutation, or unsupported durable values silently alias                                    | P1A.2              |
| BT-04 | Two refs of one resource retain independent value/status/in-flight work/subscribers across runtime and test                                            | Patch/invalidate/restore/subscribe of one instance changes or wakes the sibling                                                           | P1A.3              |
| BT-05 | Present `undefined` and other falsy values round-trip through a discriminated resource state with correct availability and type                        | Present `undefined` becomes absent/idle, absence becomes present, or contradictory value/error states typecheck or decode                 | P1A.4              |
| BT-06 | Resource lookup covers success, typed failure, retry, refresh, interruption, and exactly-once finalization                                             | Defect becomes typed failure, stale lookup publishes, or cancellation leaks/finalizes twice                                               | P1A.4/P1B.1        |
| BT-07 | Seed/patch/invalidate/hydrate batches publish one coherent post-operation snapshot in deterministic order                                              | A subscriber sees a partially patched multi-ref state, duplicate notification, or reentrant corruption                                    | P1B.2              |
| BT-08 | Same-ID ID-only tags reuse one semantic tag and intentional tag invalidation reaches all matching refs                                                 | App compilation runs tag callbacks, incompatible metadata is accepted, or unrelated tags invalidate                                       | P1A.4              |
| BT-09 | Registered, focused compatibility, and inherited-child ownership each start the correct actor                                                          | Wrong-app/unregistered/ambiguous definition starts work or a hidden empty app authorizes it                                               | P1C.1              |
| BT-10 | Keep-alive reuses the same compatible actor and preserves state under the documented ownership policy                                                  | Different same-ID machine/app is cast and reused; invalid policy silently behaves as default                                              | P1C.1/P1C.3        |
| BT-11 | Stop, actor dispose, repeated dispose, and runtime shutdown interrupt owned work and finalize/evict once                                               | New sends/work start after stopping, finalizer is skipped/doubled, or old cleanup deletes replacement                                     | P1C.3              |
| BT-12 | Direct runtime and `flowTest` produce equivalent snapshot/receipts/issues/Cause for one scenario                                                       | Test reports false idle, uses its old cache/interpreter, or hides a production pending/failure lane                                       | P1D.2/P4A.1        |
| BT-13 | `flow.can` and dispatch agree for accepted transitions, guards, updates, entry/exit, and re-entry                                                      | Rejected event mutates context, starts owned work, emits accepted receipt, or disagrees with `flow.can`                                   | P3A.1              |
| BT-14 | Reject, cancel-previous, serialize, and allow follow their documented overlap/order policy with one discriminated transaction state                    | Policy cross-talk, contradictory result/error state, wrong queue scope, rejection work, or a claim that cancellation undoes external I/O  | P2.1               |
| BT-15 | Latest-started allow generation alone publishes same-ID actor facts while all allowed external Effects may run                                         | Older completion overwrites summary/routes/issues/ordinary completion receipt/invalidation or newer preview                               | P2.1/P2.2          |
| BT-16 | Multi-ref preview applies/commits/rolls back atomically and overlapping layers preserve the visible winner                                             | Second patch failure leaves partial state or stale rollback restores an old root over a newer layer                                       | P2.2               |
| BT-17 | Successful write emits canonical transaction/resource receipts and documented invalidation exactly once                                                | Reject/failure/defect/interrupt/stale completion invalidates or emits legacy cache/query/mutation receipt                                 | P2.3               |
| BT-18 | Stream value/failure/defect/end/interruption/restart follows one generation and one discriminated state, finalizing once                               | Contradictory terminal fields typecheck/decode, late old-generation facts publish, unsubscribe leaks, or test bridge becomes owner        | P3B.1              |
| BT-19 | Every exported pressure policy obeys its bounded capacity/order/drop/backpressure contract                                                             | Overflow is silent, producer never resumes/interrupts, queue is unbounded, or settle reports idle                                         | P3B.2              |
| BT-20 | One-shot timer fires exactly once under TestClock and valid restore resumes remaining delay                                                            | State exit/stop/dispose/stale generation still fires; invalid duration/target is accepted                                                 | P3C.1              |
| BT-21 | Child start/stop/supervision/retry/restore preserves parent ownership and generation with one finalizer                                                | Old child completion publishes after replacement/restore, wrong child retries, or parent shutdown leaks child                             | P3D.2              |
| BT-22 | React render performs only pure inert snapshot creation, real start adopts it once, shared ownership survives one unmount, and swap is ordered         | Initializer starts work or runs again at commit, Strict Mode leaks, unmount stops another consumer, or async disposal races replacement   | P4B.1              |
| BT-23 | Valid v1 boot decodes fully then commits once; attachment validates the target machine/app                                                             | Malformed/duplicate/wrong-version/wrong-owner payload partially mutates or duplicate ID silently wins                                     | P4C.1              |
| BT-24 | Concurrent request runtimes with identical public IDs remain isolated and finalize once                                                                | Request A observes/stops B, module-global cache leaks data, or failed acquisition leaves services alive                                   | P4C.2              |
| BT-25 | Inspection reports declared/dynamic/runtime/mounted evidence without invoking client callbacks                                                         | Proxy probing executes route/guard/selector/lookup/tag callbacks or static evidence is labeled runtime                                    | P4D.1              |
| BT-26 | Programmatic Scenario, CLI human output, and CLI JSON project one evidence/status object                                                               | Missing proof/domain failure/defect/interruption/internal error exits success or renderers disagree                                       | P4A.2/P4D.2        |
| BT-27 | Packed root/React/testing/server/inspect clients execute the same public behavior as source consumers                                                  | Deep/private import is required, declaration widens/leaks private names, or React 18/19 differs                                           | P5.2               |
| BT-28 | Definition construction copies/freezes library-owned containers and remains stable after caller mutation                                               | Later mutation changes app inventory, state grammar, ownership, identity, or callback selection                                           | P1A.0              |
| BT-29 | App identity is stable under module reorder and validated IDs cannot collide or poison registries                                                      | Delimiter tricks, reserved/prototype IDs, control characters, duplicate IDs, or inventory overwrites are accepted                         | P1A.0              |
| BT-30 | Registry-issued refs work only with their registered owner/provenance                                                                                  | Forged, wrong-app, wrong-runtime, or duplicate-package ref shape is accepted through a cast/private field                                 | P1A.3              |
| BT-31 | Guard false is rejection while guard throw is a distinct defect with zero transition-owned work                                                        | Guard defect becomes false/rejection, `flow.can` disagrees with dispatch, or partial work/state publishes                                 | P3A.1              |
| BT-32 | Committed state survives throwing listeners/inspection sinks and later listeners still receive the batch                                               | Observer failure blocks commit, rolls back state, corrupts evidence sequence, or starves later listeners                                  | P1D.3              |
| BT-33 | Listener add/remove and reentrant send/mutation obey one FIFO next-batch rule                                                                          | Current listener set mutates mid-batch, nested publication interleaves, or callbacks observe different snapshots                          | P1B.2/P1D.3        |
| BT-34 | Deduplicated lookup survives one waiter interruption and finalizes after the final lease                                                               | One waiter cancels shared work for others, lookup leaks, or finalizer runs zero/multiple times                                            | P1B.1              |
| BT-35 | Receipt/trace/inspection histories, queues, coalesce keys, registries, and selection caches remain within configured bounds                            | Long-running actors grow without bound, overflow silently drops work, or eviction removes active ownership                                | P0.6/family packet |
| BT-36 | Boot/hydration survives real JSON round-trip, repeated hydration, and bounded unknown-input fuzzing                                                    | Prototype keys, excessive depth/size, duplicate entries, or older/newer conflict partially mutates owners                                 | P4C.1              |
| BT-37 | Portable timer restore resumes the approved remaining delay under source/destination clock skew                                                        | Absolute host clocks fire early/late, stale callback publishes, or v1 is falsely claimed portable                                         | P3C.1/P4C.1        |
| BT-38 | Model-based random actor and transaction interleavings agree with the small publication/ownership model                                                | A generated stop/start/cancel/allow/queue ordering exposes stale publication or leaked pending work                                       | P2.1/P3A.1         |
| BT-39 | Aborted render, Suspense retry, Strict Mode, provider sharing, and runtime replacement preserve lease/finalizer rules                                  | Aborted render starts work, retry duplicates actor, one provider stops another, or old runtime publishes after swap                       | P4B.1              |
| BT-40 | Root/subpath packed clients remain environment-neutral and duplicate installs fail explicitly at ownership seams                                       | Root imports React/Node, subpath runtime/types diverge, or two package/Effect copies alias silently                                       | P5.2               |
| BT-41 | Snapshot/receipt containers are immutable and every supported historical wire version stays in a permanent corpus                                      | Caller mutation changes retained facts, unversioned fields appear, or a supported payload silently changes meaning                        | P4C.1/P5.2         |
| BT-42 | `runtime.resources.get` returns `null` for an unknown/foreign ref and never manufactures an authoritative empty record                                 | Unknown ref appears as idle/empty state, becomes registered by reading, or emits notification/evidence                                    | P1B.1              |
| BT-43 | Throwing selector/equality leaves the previous source snapshot authoritative and a later valid update recovers                                         | Cache advances before comparison, subscribers diverge, or the selection source remains poisoned                                           | P1B.2              |
| BT-44 | Registry installs actor incarnation/publication authority before any synchronous initial work can emit or complete                                     | Initial/restored work publishes before registry visibility, or old cleanup deletes the just-started incarnation                           | P1C.4              |
| BT-45 | Shutdown marks all owners closing, rejects new work, attempts every finalizer, preserves complete Cause, and closes Layer Scope                        | One cleanup failure starves later cleanup, disposal resolves early, handler Cause is masked, or repeated shutdown starts another sequence | P1D.1/P1C.3        |
| BT-46 | Bounded actor scheduler turns allow another ready actor to progress while preserving per-actor FIFO/non-reentrancy                                     | A hot/reentrant actor drains forever, `Array.shift` becomes quadratic, or global strict fairness is falsely promised                      | P1C.4              |
| BT-47 | Dehydrate captures actor/resource facts behind one declared logical barrier and remains observationally pure                                           | Resources and actors come from different cuts, read emits facts/starts work, or returned payload is falsely claimed durably atomic        | P4C.1              |
| BT-48 | Synchronously completing transaction/stream still publishes one valid running-to-terminal sequence under installed generation authority                | Terminal publication precedes running state, pending work becomes negative, or subscriber misses the start/terminal batch contract        | P2.1/P3B.1         |
| BT-49 | Hostile key/payload inputs reject without getters, coercion, `toJSON`, cross-realm capability reuse, or partial mutation                               | Accessor/proxy/class/Date/Map/Set/sparse/cyclic/oversize input executes client code, aliases, or mutates an owner                         | P1A.2/P4C.1        |
| BT-50 | Identity, read purity, lifecycle idempotence, nested-batch associativity, FIFO non-commutativity, and monotonic sequence laws pass independent oracles | A property test imports the production helper as oracle, a named non-law is accidentally claimed, or shrinking loses the failing schedule | P0.6/family packet |
| BT-51 | React bootstrap creates/hydrates no runtime during render; effect-owned setup/fallback/disposal works across abort, Offscreen, roots, and HMR          | Render allocates runtime/work, fallback hydrates inconsistently, Offscreen drops leases, or HMR mutates private actors                    | P4B.1              |
| BT-52 | Layer partial acquisition and graceful host deadline preserve acquired-resource cleanup and complete Cause without claiming post-death finalization    | Already-acquired service leaks, forced termination is reported as clean, or a universal timeout is silently imposed                       | P1D.1/P4C.2        |
| BT-53 | Runtime services compose with exact `A/E/R`, correct Layer kind and Scope; semantic owners contain no `Effect.run*` or parallel DI                     | Cast/service bag erases requirements, live/test semantics diverge, detached fiber appears, or host conversion moves inside core           | P0.6/P1D.1         |

## Non-negotiable rules

- Preserve valid calls and import paths in `API_CONTRACT.md`.
- Inference is input-first: declared Params/Input/Context/Event/State inform
  downstream callbacks. Returned Effects/Streams infer only result, typed error,
  and requirements.
- Schema is optional locally and used at real `unknown` durable/foreign boundaries.
- No public `codecs`, `MachineTypes`, mandatory `bind(App)`, second constructor
  family, or mandatory public AppGraph.
- One production runtime owns semantics. Live/test presets and adapters provide
  services or controls; they do not implement another engine.
- Preserve Effect success, typed failure, requirements, Scope, interruption,
  defects, and finalization at public and semantic seams.
- Localized internal assertions are allowed only when TypeScript cannot express
  a validated internal seam, the assertion cannot leak publicly, and focused
  tests prove the invariant. Do not run a global assertion-removal campaign.
- Apply impossible-lane typing only where the preserved grammar expresses it
  soundly. Never widen to `unknown` to fake inference.
- Reuse or move correct code. Replace conflicting owners. Delete only after
  caller inventory and behavioral parity.
- Keep `evaluations/` read-only and out of Git.

## Approved compatibility vocabulary tasks

These are additive/preferred-name migrations. Existing valid aliases remain
until a separate future removal is approved.

### `CV-1` Add `useActor` while retaining `use`

- [ ] Export `useActor` from `flow-state/react` as the clear actor hook name.
- [ ] Keep `use` source- and behavior-compatible as an alias.
- [ ] Make both names share one implementation, inference, ownership, and cleanup path.
- [ ] Prefer `useActor` in new docs and recipes; include an alias migration note.
- [ ] Prove both names from packed React 18/19 consumers.

Implementation detail (`P4B.2`):

- Owner/files: `packages/flow-state/src/react-entry.ts`,
  `packages/flow-state/src/react/use-actor.ts`, React API/type tests, packed
  React 18/19 fixtures, and preferred-name docs only.
- Tests: both exports are the same function value; both infer identical actor
  snapshot/send types; both follow the same Strict Mode cleanup path; both work
  from the packed `flow-state/react` entry.
- Commands: `F(packages/flow-state/src/react/use-actor.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, packed React
  fixture commands recorded by P0.1, `C`.
- Non-goal: do not remove `use`, add generated hooks, or create a second hook.

### `CV-2` Prefer `getSnapshot()` while retaining `snapshot()`

- [ ] Make `getSnapshot()` the preferred actor read spelling across runtime,
      React, testing, stories/scenarios, inspection, and docs.
- [ ] Keep `snapshot()` as a compatibility alias with identical return type,
      identity, timing, and side-effect-free behavior.
- [ ] Route both names through one implementation and add a differential type/runtime test.
- [ ] Inventory callers before any later proposal to remove `snapshot()`.

Implementation detail (`P1C.2`):

- Owner/files: actor public types, canonical actor implementation,
  `packages/flow-state/src/core/orchestrator/**`, and callers discovered by an
  exact `rg -n '\.snapshot\('` inventory. Adapters migrate only when their
  owning packet runs.
- Tests: both methods return the same object identity at the same instant; both
  are side-effect free; aliases remain identical after send/flush/restore/stop;
  packed declarations expose the same return type.
- Commands: `F(packages/flow-state/src/orchestrator-system.test.ts
packages/flow-state/src/runtime-lifecycle.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `C`.
- Non-goal: no alias removal. A remaining caller is a migration receipt item,
  not permission to break it.

### `CV-3` Keep Story for authored/CLI concepts and Scenario for execution

- [ ] Use Story for authored examples, story discovery, and CLI commands such as
      `story list`, `story describe`, and `story run`.
- [ ] Use Scenario for executed outcomes, checks, reports, options, blocked
      reasons, and runtime evidence.
- [ ] Add Scenario-named execution/result types without changing CLI Story vocabulary.
- [ ] Preserve current Story-named execution types as compatibility aliases when
      they are public; migrate internals/docs before considering removal.
- [ ] Prove programmatic tests and CLI story execution consume the same Scenario result.

Implementation detail (`P4A.2`):

- Owner/files: `packages/flow-state/src/core/api/story-types.ts`,
  `packages/flow-state/src/testing/flow-stories.ts`,
  `packages/flow-state/src/testing/flow-story-test.ts`, CLI story adapters,
  inspection renderers, compatibility exports, and their tests.
- Tests: authored discovery remains Story-named; execution returns the same
  Scenario result through programmatic and CLI paths; public Story execution
  names are aliases; JSON and human output project one result; domain failure,
  blocked proof, defect, and interruption retain distinct status.
- Commands: `F(packages/flow-state/src/flow-story-helper.test.ts
packages/flow-state/src/flow-story-run.test.ts
packages/flow-state/src/cli-test/flow-state-cli.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `C`.
- Dependency: P1D.2 must already route Scenario execution through production
  runtime owners.

### `CV-4` Preserve transaction and receipt vocabulary

- [ ] Keep `flow.transaction` with `params`, `commit`, `preview`, `invalidates`,
      routes, and concurrency as the write vocabulary.
- [ ] Keep resource runtime facts under `resource:*` receipt names.
- [ ] Keep write runtime facts under `transaction:*` receipt names.
- [ ] Remove new primary docs/runtime output that calls these operations query or
      mutation; retain only explicit historical migration notes where useful.
- [ ] Prove runtime, inspection, CLI, JSON, tests, and docs agree on the same receipt names.

Implementation detail (`P2.3`, projected by `P4D.2`):

- Owner/files: `core/api/receipt-types.ts`, production resource/transaction
  receipt constructors, inspection receipt projections, CLI renderers,
  Launch Workspace views/status docs, and focused receipt tests.
- Tests: resource actions emit only `resource:*`; write actions emit only
  `transaction:*`; no new runtime output emits `query:*`, `mutation:*`, or
  `cache:*`; JSON and human output share receipt types; Launch Workspace
  readiness invalidation count uses canonical receipts.
- Commands: `F(packages/flow-state/src/transactions.test.ts
packages/flow-state/src/runtime-inspection.test.ts
packages/flow-state/src/inspection-format.test.ts
examples/launch-workspace/src/launchWorkspace.test.ts)`, `T`, `P`, `E`, `D`, `C`.
- Non-goal: historical migration prose may mention old terms when clearly
  labeled; durable offline queue remains deferred.

## Deferred unless explicitly reactivated

- Durable offline queue, undo, reconnect replay, and cross-reload persistence.
- Recurring/general schedule DSL beyond existing one-shot timer behavior.
- Generated React hooks.
- Broad module-level schema/error manifests.
- Full trace correlation for every possible descriptor/lane.
- Public API renames or removal of compatible helpers/imports.

Existing code for a deferred behavior may be preserved if sound, but workers may
not expand it or claim it complete.

Do not add a write-ahead log, distributed persistence, exactly-once remote
effects, universal priority scheduler, Flow-owned Effect clone, Effect Cache or
RequestResolver above ResourceStore, canonical-JSON signing, cross-realm ref
interoperability, deep clone/freeze of arbitrary client values, mandatory
Schema, automatic child restart, worker/tab synchronization,
`FinalizationRegistry` correctness, or provider-owned React runtime behavior.
These are outside the current product contract even if an upstream library has
a related feature.

Deferred-item guardrails:

| Item                                | Allowed during active packets                                                                      | Not allowed without reactivation                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Durable offline queue/undo/replay   | Preserve compiling compatibility code; test that active in-memory policies do not claim durability | New persistence format, reconnect worker, cross-reload guarantee, or “offline-ready” docs    |
| Recurring/general schedules         | Preserve one-shot `flow.after`; reject/ignore stale one-shot generations correctly                 | Cron/interval/calendar DSL, recurring restore semantics, or recurring completion claims      |
| Generated React hooks               | Preserve generic provider/hooks and hand-written app wrappers                                      | Code generation, module-generated hooks, or required generated client layer                  |
| Broad module schema/error manifests | Use optional Schema at actual encoded/foreign value boundaries                                     | Mandatory local Schema, global codec registry, or manifest required for ordinary definitions |
| Universal trace correlation         | Preserve current correlation facts and distinguish missing evidence                                | Invented causal links or requirement that every possible lane has universal correlation      |
| Public rename/removal               | Add approved preferred aliases and migrate new docs                                                | Remove compatible alias/import, change valid call shape, or publish a deprecation deadline   |

## Work-packet contract

One packet contains:

- one semantic owner or one public type family;
- one named defect, missing behavior, or duplicate owner;
- 2–5 focused positive/negative test groups; a group may be a table-driven
  matrix when one semantic rule has several required lanes;
- exact allowed files;
- exact focused and affected verification commands;
- one receipt stating reused, merged, removed, and still-open behavior.

Each packet definition below names its primary files. A worker must run `rg` for
callers before editing and add directly affected callers/tests to the packet
receipt; that discovery does not authorize unrelated cleanup. Production files
outside the named family require a packet update before they are changed.

Use these command tiers consistently:

- `F(<files>)`: `pnpm exec vitest run <files>` for the exact focused test files.
- `T`: `pnpm --filter flow-state check:cli-source-types`.
- `P`: `pnpm --filter flow-state build` to prove packed declarations and package output.
- `E`: `pnpm --filter @flow-state/launch-workspace test -- --run` after rebuilding `flow-state`.
- `D`: `pnpm docs:build` for documentation/status packets.
- `C`: `pnpm fmt && pnpm lint` immediately before commit.
- `V`: `pnpm verify` only at phase closure or when a packet changes shared public
  types/runtime behavior broadly enough to affect the workspace.

An exact packet command list expands `F` to real paths and then lists the needed
tiers in order. Never report a tier as passed unless that exact command ran.

Packet receipt template:

```text
Packet: <ID and title>
Owner after change: <one semantic owner or type family>
Defect closed: <BUG-ID and observable failure>
Effect map: <services consumed/produced; exact A/E/R; Effect.fn operations>
Layer/lifetime: <succeed/effect/scoped; acquisition error; Scope/fibers/finalizers>
Native primitives: <Ref/SynchronizedRef/Deferred/FiberMap/Queue/etc. with reason>
Failure lanes: <typed failure/defect/interrupt/stale/cleanup/observer/invariant>
Reused: <existing implementation retained>
Merged/moved: <callers routed to owner>
Removed: <duplicate state/engine/code deleted, or none with reason>
Rejected clones: <bespoke Effect/DI/cache/queue/retry/time helper avoided or justified>
Compatibility: <calls/imports/aliases proved>
Tests added: <positive/negative names>
Commands: <exact commands and result>
Still open: <explicitly deferred work and next packet>
```

Procedure:

1. Read the public call, owner, callers, tests, and Launch Workspace usage.
2. Add/strengthen the focused proof.
3. Make the smallest compatible correction.
4. Inspect Effect channels, cleanup, identity, stale work, type erasure, and duplication.
5. Apply the thermo-nuclear gate: delete needless wrappers/branches, select the
   native Effect primitive, check file/module health, and refactor after green.
6. Run focused/affected checks, then `pnpm fmt && pnpm lint` before commit.
7. Review the complete slice against the Effect blueprint, fix every blocking
   finding, rerun, and commit.

Good early smaller-model packets:

- baseline commands/metrics;
- documentation/API-inventory truth reconciliation;
- keyed resource collision fixtures after P1A.2 fixes the identity contract;
- `flow.can` versus dispatch differential proof;
- transaction input-first inference fixture;
- stream pressure fixture;
- React Strict Mode lifecycle fixture.

Reserve a stronger model/reviewer for:

- transaction or stream generic architecture;
- exact Layer output/error/requirements inference;
- compatibility ownership for `flowTest(machine)`;
- resource-ref purity and canonical key encoding;
- migration of the test interpreter onto production owners;
- transaction stale-completion and atomic preview ownership;
- child contract reconciliation and any additive child type design;
- restore/hydration boundary decoding design.

### Packet routing for implementation models

| Route                       | Packets                                                                                                                                                                                                                          | Handoff rule                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smaller model               | P0.1, P0.2, P0.5 inventory work, P1A.2 collision-test subpacket after the encoder implementation is fixed, P2.3, P3A.1 focused differentials, P3B.2 table fixtures, P3C.1 focused timer cases, P4B.2, P5.2/P5.3 mechanical proof | Give exactly one packet, its named files, tests, commands, non-goals, and prior receipt; stop on any public-type or semantic-owner design question                   |
| Medium implementation model | P1B.1/P1B.2, P1C.2, P3B.1 after ownership is fixed, P4A.1 API cleanup, P4B.1 after lease semantics are fixed, P4D.2, P5.1                                                                                                        | Require focused red proof first and a strong review before phase closure                                                                                             |
| Strong model plus reviewer  | P0.3/P0.4/P0.6 decisions, P1A.0/P1A.1/P1A.2 implementation/P1A.3/P1A.4, P1C.1/P1C.3/P1C.4/P1C.5, P1D.1/P1D.2/P1D.3, P2.1/P2.2/P2.4, P3A.2/P3B.3/P3D.1/P3D.2, P4C.1/P4C.2, P4D.1, P5.4                                            | Own the design seam, public compatibility, Effect channels, stale generation rules, and type architecture; produce the narrowed follow-up packets for smaller models |

All models stop and update the packet instead of guessing when they discover:

- a public call/import would break;
- a second semantic owner would remain or be introduced;
- an Effect error/requirement/Scope/finalizer would be erased;
- a key, actor, binding, request, or generation identity is ambiguous;
- a negative type fixture fails for an unrelated reason;
- a packet needs production files outside its named family;
- baseline or affected verification was already red for a different reason.

## Cross-phase type inference acceptance

These ten themes remain first-class checks, but are implemented only inside the
concrete packets below. `TYPE_INFERENCE_CONTRACT.md` supplies the detailed matrix.

### 1. Constructor inference matrix

- [ ] `TI-1` Resource, transaction, stream, machine, child, and view constructors
      pass input-first positive/negative fixtures while preserving explicit
      generic fallbacks and the existing API.

### 2. Cross-definition type propagation

- [ ] `TI-2` Definition types propagate through refs, bindings, routes, actors,
      snapshots, runtime, testing, React, server, inspection, and fixtures without
      restatement or untyped intermediate descriptors.

### 3. Impossible-lane elimination

- [ ] `TI-3` Type-level `never` removes only expressible typed lanes; possible
      lanes remain required and defects/interruption/cleanup remain represented.

### 4. Exact callback-family inputs

- [ ] `TI-4` Each callback receives its exact family inputs, unsafe narrower
      callbacks fail locally, and no universal/bivariant owner bag widens inputs.

### 5. Exact Effect and Layer inference

- [ ] `TI-5` Exact Effect/Stream success, typed error, requirements, and Layer
      provision survive public declarations and semantic seams without erasure.

### 6. Module and app inference

- [ ] `TI-6` Module keys, definition maps, dependencies, app lookups, fixtures,
      and Layer requirements remain exact and stable across module reorder.

### 7. Testing inference

- [ ] `TI-7` Tests infer machine/resource/transaction/stream/child/view/app
      contracts and reject wrong owners, fixtures, states, events, and outcomes.

### 8. React inference

- [ ] `TI-8` Actor snapshots/send, resource values, view outputs, and runtime
      compatibility remain exact from packed React 18/19 declarations.

### 9. Declaration quality and compiler-cost budgets

- [ ] `TI-9` Source and packed declarations remain nameable/portable and meet
      measured check-time, emit-time, instantiation, declaration-size, and package budgets.

### 10. Dedicated positive and negative type suites

- [ ] `TI-10` Focused family suites cover source and packed declarations; each
      negative proves one intended error and cannot silently stop failing.

### Type-theme execution details

| Theme | Owning packets                          | Required proof                                                                                                                                                  |
| ----- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TI-1  | P1A.4, P2.4, P3A.2, P3B.3, P3D.1, P4B.2 | One inferred call, one explicit-generic compatibility call, one wrong upstream input, and one wrong downstream result per constructor family                    |
| TI-2  | Every family packet plus P4A–D          | Reuse the authored definition through ref/binding/runtime/adapter without restating generics; assert exact output and reject wrong owner                        |
| TI-3  | P2.4, P3B.3, P3D.1                      | `never` removes only the typed lane; defect/interruption/finalizer evidence remains in runtime tests and public types                                           |
| TI-4  | P2.4, P3A.2, P3B.3                      | Add one unsafe-narrower regression before replacing each bivariant helper; do not perform a global variance rewrite                                             |
| TI-5  | P1D.1 and each async family             | Assert exact success/error/requirements before and after the owner seam; verify Layer provision leaves only unprovided requirements                             |
| TI-6  | P0.3 and P1C.1                          | Assert exact literal module keys/IDs, definition lookup, fixture names, reorder stability, dependency errors, and app Layer requirements                        |
| TI-7  | P1D.2 and P4A.1                         | Source and packed testing calls infer exact machine/app families and reject wrong-app fixtures, events, states, refs, and outcomes                              |
| TI-8  | P4B.1/P4B.2                             | Packed React 18 and 19 consumers infer actor send/snapshot, resource values, view outputs, and provider/runtime compatibility                                   |
| TI-9  | P0.1 baseline and P5.3 closure          | Record check/emit time, instantiations, declaration bytes, package bytes, and TS7056/private-name failures with the same commands and environment               |
| TI-10 | Every type packet                       | Each negative fixture has one expected diagnostic or a local `@ts-expect-error` whose disappearance fails the suite; run against source and packed declarations |

Shared type files are `packages/flow-state/src/core/api/**`, public entry points,
`packages/flow-state/src/public-api-types.test.ts`, and
`packages/flow-state/src/public-typing-architecture.test.ts`. A family packet
may edit only its relevant API file and directly affected consumers. Any change
to `FlowMachine`, `FlowAppDefinition`, or common conditional helpers requires a
strong-model review plus `T`, `P`, `E`, and `V` before phase closure.

---

## Phase 0 execution packets

Purpose: establish current truth without changing production behavior. Phase 0
may add tests and correct documentation, but it may not alter runtime output.

Phase 0 owns three durable artifacts under `architecture/correctness/`:

- `BASELINE.md`: commit, environment, public export matrix, commands, timings,
  declaration/package sizes, and exact baseline failures;
- `OWNER_MAP.md`: every semantic operation, current owner, duplicate callers,
  intended owner, and reuse/merge/delete classification;
- `PACKET_RECEIPTS.md`: append-only packet receipts using the template above.

### `P0.1` Public, behavioral, packed, and performance baseline

- [ ] Inventory root, React, testing, inspection, and server exports/types.
- [ ] Run Launch Workspace through public built entry points and record exact
      baseline successes/failures.
- [ ] Record focused package tests, types, declarations, builds, and docs gates.
- [ ] Record check time, declaration emit time, type instantiations, declaration
      size, package output size, and Launch Workspace declaration behavior.
- [ ] Record repeated runtime scaling tiers for canonical-key node count/depth,
      seed/patch/invalidate/hydrate collection size, subscriber fanout/churn,
      nested/reentrant batches, actor mailbox throughput/cross-actor contention,
      transaction/stream pressure, receipt projection/retention, and boot/deep
      restore. Capture operation counts and allocation/retained-size proxies
      where stable; do not invent latency budgets in Phase 0.
- [ ] Close BUG-21 so `pnpm lint` from an installed checkout prepares or resolves
      the declarations it needs and reports real source problems, not missing-package cascades.

Details:

- Read/record: package manifests, `packages/flow-state/src/{index,react-entry,testing,server,inspect}.ts`,
  generated `dist/*.d.mts`, build-output baseline, and Launch Workspace public imports.
- Run from a clean tree: `T`; timed `P`; `pnpm --filter flow-state
check:typescript-mode-proofs`; `E`; `D`; `pnpm check`; and the existing
  build-output check. Record Node/pnpm/TypeScript versions and whether a command
  changes generated files.
- Reproduce `pnpm lint` before relying on it. Prefer source-aware workspace
  resolution for lint; if the tool fundamentally requires declarations, make
  the script prepare the exact package output itself and prevent stale `dist`
  from satisfying the gate. Do not hide genuine diagnostics or commit build output.
- Add a packed-consumer matrix for root, React 18, React 19, testing, server, and
  inspect entry points. Record the exact fixture directories/commands in
  `BASELINE.md`; do not claim a packed proof from source aliases.
- Tests/measurements: successful import for every export path; intentional
  failure for private/deep imports; declaration emit contains no private names;
  repeat timing at least three times and report median plus range.
- Runtime measurements use fixed small/medium/adversarial inputs, warm-up,
  repetitions, median/range, and the exact environment. P5.4 compares the same
  tiers and reports ratios; P0.6 chooses capacities only from measured behavior
  and product constraints, never from a worker's arbitrary constant.
- Allowed changes: Phase 0 artifacts, baseline/type test fixtures, and narrowly
  scoped workspace lint/build-resolution configuration needed for BUG-21 only.

### `P0.2` Launch Workspace executable-truth reconciliation

- [ ] Map every Launch Workspace API row to declaration, owner, tests, and
      executable/partial/contract-only status.
- [ ] Reconcile BUG-13, BUG-14, and BUG-15 without claiming runtime behavior not
      proved by current tests.
- [ ] Document BUG-39 accurately and assign its behavior change to P4A.3;
      receipts remain bounded diagnostic evidence, not business storage. Phase
      0 does not edit the read-only Launch Workspace implementation.

Details:

- Files: `examples/launch-workspace/API_INVENTORY.md`, `README.md`,
  `PHASE_0_TEST_CHECKLIST.md`, package status/reference docs, and related
  architecture tests. `launchWorkspaceSupport.ts` is read-only in Phase 0;
  BUG-14 is fixed with canonical receipts in P2.3.
- Decision: replace the missing `reference-next/lib-api.md` pointer with the
  current governing `API_CONTRACT.md` or an actually generated/current reference;
  do not recreate a stale parallel API authority.
- For each row record five separate facts: declaration exists, production owner
  exists, runtime path executes, test observes the behavior, and status. Use
  `executable`, `partial`, `contract-only`, `deferred`, or `broken`; never infer
  executable from a type or descriptor alone.
- Tests: architecture/status tests agree with the inventory; every cited proof
  path exists; no row is both executable and contract-only; deferred offline
  queue and generated hooks remain deferred.
- Commands: `F(packages/flow-state/src/status-docs-architecture.test.ts
packages/flow-state/src/docs-information-architecture.test.ts
examples/launch-workspace/src/launchWorkspacePackageHygiene.test.ts)`, `D`, `C`.

### `P0.3` Compact semantic inference baseline

Do not build the entire final matrix upfront.

- [ ] Add one positive and one negative input-first fixture for resource,
      transaction, machine, stream, Layer, and packed import declarations.
- [ ] Prove downstream callbacks cannot widen upstream Params/Input/Context/Event.
- [ ] Record genuine TypeScript limits rather than adding a new syntax to bypass them.
- [ ] Replace BUG-16's source-text-only confidence with semantic assertions while
      retaining useful architecture lint as a secondary check.
- [ ] Prove BUG-38 with the broad Launch Workspace app annotation still present;
      P1A.0 owns its removal after the exact inferred app tuple/map regression is red.

Details:

- Files: `public-api-types.test.ts`, `public-typing-architecture.test.ts`, focused
  callback tests, Launch Workspace typing architecture tests, and dedicated
  source/packed fixtures discovered in P0.1.
- Required fixtures: exact `LaunchWorkspaceApp` module tuple/map; module reorder
  stability; resource Params before lookup result; transaction Params before
  commit; stream Params before subscribe; machine Context/Event/State; Layer
  output/error/remaining requirements; one packed import per public entry.
- Negative fixtures each prove one diagnostic: wrong param, narrower callback,
  wrong event/state, wrong app definition, wrong Effect requirement, or private
  declaration leak. A negative that produces unrelated errors is invalid.
- Remove or narrow broad annotations such as `FlowAppDefinition` aliases only in
  a later owning type packet; Phase 0 records the widening and adds proof without
  changing production declarations.
- Commands: `F(packages/flow-state/src/public-api-types.test.ts
packages/flow-state/src/public-typing-architecture.test.ts
examples/launch-workspace/src/launchWorkspaceTypingArchitecture.test.ts)`, `T`, `P`, `C`.

### `P0.4` Child contract reconciliation

- [ ] Resolve BUG-17 before any child runtime/type implementation begins.
- [ ] Preserve every current `flow.child({ id, machine, supervision? })` call.
- [ ] Record the current expressible child types and remove unsupported completion
      claims from the active contract, or obtain separate approval for an additive design.

Binding choice for this plan: compatibility wins. Update the contract row during
Phase 0 to describe the current child shape. Treat child `input`, outcome routes,
and independent output/failure generics as a future additive proposal, not as an
implicit Phase 3D requirement. Phase 3D must still fully preserve the exact
machine/context/event/state and supervision types that exist today. This avoids
inventing a second machine API while keeping the current API fully typed.

- Files: `API_CONTRACT.md`, `TYPE_INFERENCE_CONTRACT.md`, `TASK.md`, and this
  Phase 0 file only for the
  reconciliation; current `machine-invoke-types.ts`, child runtime, public tests,
  and Launch Workspace child use are evidence and remain unchanged.
- Tests: no runtime test in this packet. Record compile probes showing what the
  current child definition does and does not carry.
- Commands: `T`, `C`.

### `P0.5` Semantic-owner, duplicate-engine, and deletion inventory

- [ ] Map actor start/read/send/stop/snapshot/restore owners.
- [ ] Map resource lookup/read/seed/subscribe/patch/invalidate/hydrate owners.
- [ ] Map transaction, stream, timer, and child execution owners.
- [ ] Map test/story/React/server/inspection/CLI paths back to production owners.
- [ ] Map every runtime `Context.Service`, its direct dependencies, Layer
      (`succeed`/`effect`/`scoped`), acquisition error, Scope owner, Effect
      methods, and host bridge. Flag service bags, parallel DI,
      `Layer.Any`/wiring casts, and `Effect.run*` inside semantic owners.
- [ ] Map each raw mutable Map/Set, Promise queue/flush, manual fiber/subscription
      registry, and custom timer/retry/cache/batching primitive. Classify it as
      pure data, approved host adapter, native-Effect migration candidate, or
      duplicate owner.
- [ ] List duplicate interpreters, registries, snapshot formats, pending-work
      stores, receipt/evidence builders, graph walkers, and formatters.
- [ ] List zero-caller internal files/exports after checking dynamic, CLI,
      generated, example, and test callers.
- [ ] Classify `reuse`, `move`, `merge`, `deprecate`, `delete`, `investigate`.

Details:

- Start with production owners under `core/store`, `core/orchestrator`,
  `core/machines`, and `runtime`. Trace all public adapters inward.
- Explicitly inventory the duplicate ID-only cache and transition/transaction/
  stream/timer/child owners under `testing/`; do not label them harmless test
  helpers when they decide semantics.
- For every delete candidate record static imports, dynamic imports, CLI entry,
  generated output, public export, docs/example reference, and test reference.
  “No `rg` result” alone is insufficient for CLI/generated files.
- The first production packets are fixed by this plan: P1A.1 owns resource-ref
  purity and P1A.2 owns identity. The inventory may refine file lists, not skip them.
- Commands: read-only inventory commands recorded verbatim in `OWNER_MAP.md`,
  followed by `pnpm check` to prove Phase 0 artifacts/tests do not break the repo.

### `P0.6` Semantic decisions, capacity policy, and compatibility corpus

This is the highest-priority remaining Phase 0 packet. It turns DEC-1–DEC-22
into measurable inputs for Phase 1 rather than allowing implementation packets
to answer architecture questions implicitly.

- [ ] Record one ownership/publication sentence for resource mutation, actor
      send, transaction start/completion, stream value, timer fire, child
      replacement, hydration, React acquisition, and evidence projection.
- [ ] Record the canonical public/internal resource-instance shape and exact
      descriptor-ID ambiguity diagnostic.
- [ ] Record app/module ID grammar, canonical app identity algorithm, registry
      container rule, and definition-container copy/freeze boundary.
- [ ] Record ref provenance, cross-runtime/cross-package rejection, and the list
      of seams that may use localized validated assertions.
- [ ] Record notification FIFO/snapshot/reentrancy/fault-isolation semantics.
- [ ] Inventory every retained collection and classify it as topology-bounded,
      configured-capacity, or runtime-lifetime-owned. Use P0.1 measurements to
      choose and record default/max capacity, overflow/eviction diagnostic, and
      active-entry protection for each configurable collection.
- [ ] Record the discriminated failure/receipt lanes and compatibility-supertype
      migration rule.
- [ ] Record the React pure-initial-snapshot/adoption and runtime lease contract.
- [ ] Record v1 immutable compatibility corpus and the explicit facts that would
      trigger a separately approved v2.
- [ ] Record the ESM/environment/peer/duplicate-package compatibility matrix.
- [ ] Record DEC-17's laws/non-laws and independent oracle for each identity,
      read, lifecycle, batch, queue, projection, and round-trip property.
- [ ] Record crash/durability nonclaims, fairness/yield/admission rules, hostile
      JavaScript accepted/rejected values, strict wire-field/version behavior,
      graceful shutdown/Cause aggregation, and React bootstrap/Offscreen/HMR.
- [ ] Record the concrete service/layer/scope dependency graph and complete the
      Effect blueprint for ResourceStore, OrchestratorSystem, transactions,
      streams, timers, children, evidence, hydration, React, server, testing,
      and CLI. No dependent packet may choose a different primitive/owner
      without a strong-model amendment.

Required artifacts:

- `SEMANTIC_DECISIONS.md`: DEC-1–DEC-22 with owner, publication point,
  compatibility impact, rejected alternatives, and required tests.
- `EFFECT_ARCHITECTURE.md`: service/layer/scope graph, exact operations and
  `A/E/R`, native primitive choices, host boundaries, acquisition/finalizer
  order, rejected clones, and focused proof commands for every runtime family.
- `CAPACITY_POLICY.md`: structure, owner, unit, measured baseline, default/max,
  overflow/eviction behavior, cleanup trigger, and adversarial proof command.
- `COMPATIBILITY_CORPUS.md`: supported source/runtime/receipt/snapshot/wire/export
  versions and permanent fixture locations.
- `ALGEBRAIC_LAWS.md`: executable laws, named non-laws, independent oracle,
  generators/shrink strategy, and owning focused/property test.
- `TEST_ORACLES.md`: production helpers tests must not reuse, small independent
  actor/transaction models, metamorphic relations, mutation targets,
  deterministic scheduler, leak checks, and permanent fuzz seed/corpus policy.

No production file changes are allowed. Read production source and existing
tests as evidence; update only planning/contracts/fixtures that do not alter
runtime behavior. If a decision would break a currently valid public call, mark
the dependent packet blocked and request explicit migration approval rather
than hiding the break inside a correctness test.

Tests/commands: architecture tests for artifact completeness and internal link
validity; focused source/packed fixtures added by P0.1/P0.3; `T`, `P`, `C`.

### Phase 0 closure

- [ ] No production behavior changed.
- [ ] Every public surface has a user job, owner, status, and proof strength.
- [ ] `BASELINE.md`, `OWNER_MAP.md`, and the Phase 0 receipt are complete.
- [ ] BUG-13/15 documentation drift is fixed; BUG-14 is assigned to P2.3.
- [ ] BUG-21 is fixed and `pnpm lint` no longer depends on manually prepared/stale output.
- [ ] BUG-17 contract conflict is reconciled compatibility-first.
- [ ] P0.6 artifacts close every DEC-1–DEC-22 field; no dependent packet retains
      a worker-selectable semantic decision.
- [ ] `EFFECT_ARCHITECTURE.md` names every runtime service, Layer kind,
      Scope/fiber owner, failure lane, host bridge, and conditional native
      primitive; semantic-owner `Effect.run*` and parallel DI paths have an
      owning removal packet.
- [ ] P1A.0, P1A.1, and P1A.2 name exact production owners, files, tests, and commands.
- [ ] Default limits and typed overflow/eviction outcomes are recorded for every
      capacity-bounded collection; no silent/unbounded default is left implicit.
- [ ] Low-value deferred work is not on the active critical path.

---
