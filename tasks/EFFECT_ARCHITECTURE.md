# Effect and TypeScript architecture

[Back to the plan tracker](../TASK.md)

Authority: this is the sole planning source for the cross-cutting Effect/TypeScript construction rules. Family packets own concrete production changes and must link back here instead of restating these rules.

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

- Use `Context.Tag` for a stable replaceable contract whose live/test
  implementations are selected by separate Layers. Use `Effect.Service` only
  when a bundled default implementation/dependency list is deliberate and does
  not hide host choice or remaining requirements. Do not invent a
  `Context.Service` API or create a service for a pure helper, constructor,
  one-off policy branch, or namespace.
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

| Flow capability           | Service and Layer                                                                                                                                                 | Effect operations and owned primitives                                                                                                                                   | Composition and non-goals                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definitions/normalization | No runtime service or Layer                                                                                                                                       | Pure constructors; `Either`/`Option`/`Schema` only at the appropriate validation boundary; immutable data and nominal identity                                           | May store typed callbacks inertly; never run Effect, inspect services, allocate Scope, or start fibers                                                           |
| Client external APIs      | One `Context.Tag` contract per coherent external capability, or deliberate `Effect.Service`; separate live/test `Layer.succeed`/`effect`/`scoped` implementations | `Effect.fn` methods preserving exact `A/E/R`; `Effect.try`/`tryPromise` only where foreign code enters; scoped acquire/release for clients/sockets/files                 | Feature definitions depend on contracts, never concrete Layers; normalize foreign exceptions once; client owns remote idempotency/compensation                   |
| App/runtime assembly      | Explicit app Layer plus runtime-core Layer; one `ManagedRuntime` per host-owned lifetime                                                                          | Layer acquisition error remains typed; runtime disposal closes its Scope and awaits owned finalizers                                                                     | No parallel DI container, mutable singleton runtime, hidden default `Effect.run*`, or cast that claims missing services are provided                             |
| ResourceStore             | `ResourceStore` service from a scoped Layer when subscriptions/lookups are retained                                                                               | Short atomic state via `Ref`/`SynchronizedRef`; keyed lookup fibers via `FiberMap`; shared completion via `Deferred`; Clock/Schedule only for approved freshness/refresh | Flow owns ref provenance, snapshots, invalidation, batching, and subscribers. `Cache`/`RequestResolver` may support service lookup only after semantic-fit proof |
| Actor/orchestrator        | `OrchestratorSystem` from a scoped Layer depending directly on ResourceStore/evidence/policy services                                                             | Bounded FIFO mailbox via the approved Queue/driver; keyed actor/state work via `FiberMap`; actor Scope; `Exit`/`Cause`; atomic generation registry state                 | Public send/start may be host-shaped, but internal dispatch remains Effect. No `runSyncWith`/`runPromiseWith` callback island or adapter-owned registry          |
| Transactions              | Actor/orchestrator-owned operations, not a second public runtime service unless P0 owner mapping proves one is needed                                             | `Effect.fn`; `FiberMap`/`FiberSet` attempts; bounded Queue for serialize; admission state/Semaphore where appropriate; `Exit`/`Cause`; ResourceStore batch               | Queue order, generation authority, preview, publication, and interruption stay distinct. Cancellation never promises external rollback                           |
| Streams                   | Actor-owned scoped Stream runner                                                                                                                                  | `Stream`, scoped `runForEach`, FiberMap generation, bounded Queue/PubSub pressure, `Exit`/`Cause`                                                                        | AsyncIterable only adapts foreign/test input. No unbounded collect/drain, detached producer, or adapter-owned stream engine                                      |
| Timers/retry              | Actor timer owner; client service policy owns service retry                                                                                                       | `Effect.sleep`, `Duration.Input`, Clock/TestClock for one-shot timers; `Schedule` for explicitly approved retry/repeat/polling                                           | No `Date.now`, real sleeps, custom retry loop, automatic child retry, or Schedule-based redefinition of `flow.after`                                             |
| Children                  | Parent actor Scope and OrchestratorSystem                                                                                                                         | FiberMap keyed by parent/binding/child/generation; `Exit`/`Cause`; explicit finalizers                                                                                   | Parent stop awaits children. No independent child registry, hidden restart budget, or stale child publication                                                    |
| Views                     | No long-lived service; pure evaluator/source projection                                                                                                           | Pure `Option`/`Match`/`Equivalence` where useful; subscriptions consume canonical sources                                                                                | A view starts no Effect and stores no canonical data; it is not a renamed actor snapshot                                                                         |
| Notifications/evidence    | Runtime-owned notification/evidence services; scoped Layer for retained subscriptions/sinks                                                                       | Serialized sequence state, bounded PubSub where asynchronous fanout is selected, Effect spans/annotations, redaction, sink isolation                                     | State commits first. Evidence cannot veto semantics, block indefinitely, expose live objects, or become business state                                           |
| Hydration/persistence     | Boundary decoder/encoder plus affected runtime services; no global codec registry                                                                                 | Schema decode from `unknown`; pure migration with `Either`/parse results where useful; one scoped/atomic attach Effect; immutable decoded value                          | No entry-by-entry mutation, executable refs, partial version trees, raw secrets, or implied crash durability beyond the documented boundary                      |
| React                     | Caller-owned runtime injected by provider; runtime-owned lease service if needed                                                                                  | `useSyncExternalStore` over canonical sources; host callbacks acquire/release through runtime handles                                                                    | No Effect/Promise execution, cache creation, actor start, hydration, or service lookup during render; no private actor resurrection                              |
| Server/request            | Request Layer/Scope supplied by host; ManagedRuntime only if the host truly owns a separate runtime                                                               | Scoped acquisition, decode/redact at boundary, `Exit`/Cause-aware host conversion                                                                                        | No request runtime global, cross-request owner alias, or server adapter semantics                                                                                |
| Testing/CLI               | Test Layers replace service implementations; CLI owns its Node Layer/ManagedRuntime                                                                               | `it.effect`/scoped tests, TestClock, Deferred started gates, bounded Queue/PubSub, controlled Stream, `Effect.exit`; CLI maps final Exit/Cause once                      | No `Effect.run*` inside an active Effect test, real sleep, source-text behavior proof, test interpreter, or CLI-owned runtime rules                              |

### Thermo-nuclear packet gate

Before writing code, every implementation packet records:

1. the surviving semantic owner and dependency direction;
2. every `Context.Tag`/`Effect.Service` consumed or produced and exact remaining `R`;
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
