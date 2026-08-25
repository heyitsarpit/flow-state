# System decisions

Design from capabilities, owners, and lifetimes, then choose constructors. Load
[RECIPES.md](./RECIPES.md) only when code makes the chosen composition easier to see.
These are use-case routes, not an API catalog. For exact exports, signatures, and member behavior,
use the [effect-api-documentation skill](../../effect-api-documentation/SKILL.md), verify the
consuming package's pinned `effect` version and installed source/declarations, and use the local
v4 checkout as usage guidance when its version matches.

## Contents

- [Services, Layers, and deep injection](#services-layers-and-deep-injection)
- [State and coordination](#state-and-coordination)
- [Fibers and background work](#fibers-and-background-work)
- [Time, caches, streams, and pools](#time-caches-streams-and-pools)
- [Streams, persistence, and observability](#streams-persistence-and-observability)
- [Transactions and host boundaries](#transactions-and-host-boundaries)

## Services, Layers, and deep injection

### IF a value is a contextual capability rather than ordinary operation data

- **THEN:** Define a `Context.Service`; let `Layer` own how it is constructed, composed, provided,
  and released. Keep IDs, commands, payloads, and filters as arguments.
- **BECAUSE:** Context carries substitutable requirements while Layer makes ownership visible at the
  composition edge.
- **CHECK:** Verify the service's `R` at the deepest use and the Layer's residual requirements before
  hiding or providing anything.
- **CODE:** See [`Context`](../../effect-api-documentation/references/Context.md) and
  [`Layer`](../../effect-api-documentation/references/Layer.md).

### IF a capability value already exists and owns no Effect-managed construction

- **THEN:** Provide it directly or with `Layer.succeed`.
- **BECAUSE:** There is no acquisition program or cleanup for the Layer to own.
- **CHECK:** Build the value once at the lifetime where it is actually stable.

### IF constructing a service is effectful or fallible

- **THEN:** Use `Layer.effect` and keep construction dependencies in the Layer's `R`.
- **BECAUSE:** The Layer graph makes construction, failure, and residual requirements explicit.
- **CHECK:** Track what each Layer provides, may fail with, and still requires.

### IF construction acquires a resource

- **THEN:** Use `Effect.acquireRelease` inside the service Layer or another scoped constructor.
- **BECAUSE:** Successful acquisition immediately registers one release with the owning Scope.
- **CHECK:** Prove release once after success, construction failure, use failure, and interruption.

### IF several resources and finalizers share one lifetime

- **THEN:** Make one `Scope` the owner and attach every finalizer to it; close that Scope from the
  owner that can observe and await cleanup.
- **BECAUSE:** Scope gives related resources one explicit release boundary and preserves cleanup
  outcomes.
- **CHECK:** Close on success, typed failure, interruption, host shutdown, and partial acquisition;
  assert that each finalizer runs exactly once.
- **CODE:** See [`Scope`](../../effect-api-documentation/references/Scope.md).

### IF one acquired value must be refreshed manually or on a schedule

- **THEN:** Use `Resource` under an owning Scope and make refresh, replacement, and release policy
  explicit.
- **BECAUSE:** Refreshable acquisition has different semantics from a permanently constructed
  service or an unscoped mutable value.
- **CHECK:** Prove overlap policy, stale-value visibility, failed refresh behavior, and release of
  the replaced value.
- **CODE:** See [`Resource`](../../effect-api-documentation/references/Resource.md).

### IF a deep operation needs a capability

- **THEN:** Yield the service in the deepest operation, let intermediate functions return the
  residual `R`, and provide the Layer once at a composition edge.
- **BECAUSE:** The type carries dependency injection without manual parameter plumbing.
- **CHECK:** Provide stable application dependencies at the application edge and dynamic request
  dependencies around the request operation.

### IF a higher service owns a lower service as an implementation detail

- **THEN:** Capture the lower service in `Layer.effect`, expose methods whose `R` no longer names
  it, and compose with `Layer.provide`.
- **BECAUSE:** Callers see the capability they use while the composition root owns its dependency.
- **CHECK:** Use `Layer.provideMerge` only when downstream code intentionally consumes both
  services. Otherwise keep the lower service private to preserve Layer visibility.

### IF a service must be shared or refreshed at a known lifetime

- **THEN:** Build it in the Layer graph owned by that lifetime: keep one memoized graph or
  `ManagedRuntime` for shared application state, and rebuild at an explicit request or reload owner
  when freshness is required.
- **BECAUSE:** Layer visibility does not by itself define instance freshness.
- **CHECK:** Test instance identity, refresh boundaries, failure caching, and disposal; use
  `Resource` or `Cache` when refresh or retention is the actual contract.
- **CODE:** See [`ManagedRuntime`](../../effect-api-documentation/references/ManagedRuntime.md),
  [`Resource`](../../effect-api-documentation/references/Resource.md), and
  [`Cache`](../../effect-api-documentation/references/Cache.md).

### IF a non-Effect host repeatedly executes programs against one environment

- **THEN:** Create one `ManagedRuntime` for that host lifetime and give one owner responsibility for
  disposal.
- **BECAUSE:** Rebuilding a runtime per call or render duplicates services and obscures cleanup.
- **CHECK:** Keep runners at host adapters and route host cancellation into interruption.
- **CODE:** See [Services and Layers](./RECIPES.md#services-and-layers) and
  [Streams and host edges](./RECIPES.md#streams-and-host-edges).

## State and coordination

### IF only atomic private current state is needed

- **THEN:** Give one owner mutation authority and use `Ref`; use `SynchronizedRef` only when the
  update itself must suspend.
- **BECAUSE:** A mailbox or event stream adds ordering and lifetime laws current state does not
  need.
- **CHECK:** Define atomicity, visibility, and whether callbacks may run while serialized. Do not
  expose a `Ref` merely because consumers need to observe changes.
- **CODE:** See [`Ref`](../../effect-api-documentation/references/Ref.md) and
  [`SynchronizedRef`](../../effect-api-documentation/references/SynchronizedRef.md).

### IF consumers need the current value and future changes

- **THEN:** Let one owner update a `SubscriptionRef`; let consumers read its current value or
  subscribe to its changes.
- **BECAUSE:** It owns both initial replay and the update stream.
- **CHECK:** Define equality, replay, subscriber cleanup, and slow-consumer behavior.
- **CODE:** See [`SubscriptionRef`](../../effect-api-documentation/references/SubscriptionRef.md).

### IF consumers need events without current-state replay

- **THEN:** Use `PubSub`.
- **BECAUSE:** Fan-out events have different semantics from a current-value cell.
- **CHECK:** Define capacity, overflow, subscriber start point, and shutdown.

### IF commands require owned FIFO processing

- **THEN:** Use a Queue plus one owned consumer.
- **BECAUSE:** The mailbox makes ordering, buffering, acknowledgment, and shutdown explicit.
- **CHECK:** Name what acknowledgment proves and settle every queued waiter when the owner stops.

### IF only a one-shot result or gate is needed

- **THEN:** Let one producer own completion of a `Deferred`; let dependent fibers await it.
- **BECAUSE:** Exactly one completion owns the coordination contract.
- **CHECK:** Prove winner selection, duplicate completion, waiter interruption, and shutdown.
- **CODE:** See [`Deferred`](../../effect-api-documentation/references/Deferred.md).

### IF the requirement is only bounded admission

- **THEN:** Use a Semaphore or bounded traversal instead of a Queue.
- **BECAUSE:** Capacity control does not imply mailbox ordering or a consumer fiber.
- **CHECK:** Define fairness and cancellation while waiting for a permit.
- **CODE:** See [State and coordination](./RECIPES.md#state-and-coordination).

### IF a value represents a typed request that may be batched or scheduled

- **THEN:** Use `Request` for the request data and direct execution; use `RequestResolver` when
  batching, grouping, delay, caching, or request-level concurrency is part of the policy.
- **BECAUSE:** The request stays domain data while the resolver owns execution policy and completion.
- **CHECK:** Define deduplication, batch boundaries, ordering, cancellation, failure fan-out, and
  resolver shutdown.
- **CODE:** See [`Request`](../../effect-api-documentation/references/Request.md) and
  [`RequestResolver`](../../effect-api-documentation/references/RequestResolver.md).

## Fibers and background work

### IF child work should end with its parent

- **THEN:** Use `Effect.forkChild`.
- **BECAUSE:** Parent completion owns child interruption.
- **CHECK:** Add a `Deferred` handshake when callers depend on the child reaching a checkpoint.

### IF background work should live until a Scope closes

- **THEN:** Use `Effect.forkScoped` inside the owning scoped Layer or program.
- **BECAUSE:** Scope closure gives the worker a deterministic shutdown path.
- **CHECK:** Define startup readiness, overlap, failure supervision, cadence, and cleanup.

### IF work is keyed and newer work replaces older work

- **THEN:** Use `FiberMap` when keyed fiber ownership makes replacement and cancellation the law.
- **BECAUSE:** A keyed owner can prevent stale completion and centralize cancellation.
- **CHECK:** Compare duplicate-key, replacement, completion, failure, and Scope-close laws before
  deleting custom machinery.
- **CODE:** See [`FiberMap`](../../effect-api-documentation/references/FiberMap.md).

### IF work must outlive the current parent and Scope

- **THEN:** Use detached work only after naming a separate owner, observation path, and shutdown
  mechanism.
- **BECAUSE:** Detachment transfers lifetime responsibility; it does not remove it.
- **CHECK:** Reject fire-and-forget work whose failure or cleanup nobody can observe.
- **CODE:** See [Resources and fibers](./RECIPES.md#resources-and-fibers).

## Time, caches, streams, and pools

### IF behavior retries, repeats, polls, or sleeps

- **THEN:** Use `Clock` and compose a `Schedule` that states cadence, retryability, bounds, backoff,
  and jitter.
- **BECAUSE:** Time becomes controllable and policy becomes inspectable.
- **CHECK:** Retry only classified transient failures and only safe-to-repeat operations.
- **CODE:** See [`Clock`](../../effect-api-documentation/references/Clock.md) and
  [`Schedule`](../../effect-api-documentation/references/Schedule.md).

### IF keyed values may be reused as results with expiry or invalidation

- **THEN:** Use `Cache` when memoized result reuse is the law.
- **BECAUSE:** Cache freshness and error-caching policy differ from resource ownership and request
  batching.
- **CHECK:** Define key identity, capacity, expiry, invalidation, release, and failure caching.
- **CODE:** See [`Cache`](../../effect-api-documentation/references/Cache.md).

### IF keyed resources are shared only while references use them

- **THEN:** Use `RcMap`; let its owning Scope release idle keyed resources and let the resource
  factory define acquisition and cleanup.
- **BECAUSE:** Reference-counted keyed lifetime is different from result memoization, a Pool's
  interchangeable leases, or a `RequestResolver`'s batching policy.
- **CHECK:** Define key identity, duplicate acquisition, reference release, invalidation, failed
  acquisition, and Scope close.
- **CODE:** See [`RcMap`](../../effect-api-documentation/references/RcMap.md).

### IF values form a resource-safe temporal process

- **THEN:** Use `Stream`.
- **BECAUSE:** Stream owns pull, completion, failure, cancellation, and scoped acquisition.
- **CHECK:** Define hot/cold, single-consumer/broadcast, replay, buffering, overflow, and bounded test
  consumption.
- **CODE:** See [`Stream`](../../effect-api-documentation/references/Stream.md).

### IF finite interchangeable resources are borrowed and returned under a capacity limit

- **THEN:** Use `Pool`; use `Semaphore` when the only law is admission and no resource is acquired
  per permit.
- **BECAUSE:** Pool owns reusable resource acquisition, borrowing, invalidation, and shutdown;
  Semaphore owns permits, not resources.
- **CHECK:** Prove invalidation, waiter cancellation, capacity, and pool shutdown.
- **CODE:** See [Duration and Schedule](./RECIPES.md#duration-and-schedule) and
  [`Pool`](../../effect-api-documentation/references/Pool.md) and
  [`Semaphore`](../../effect-api-documentation/references/Semaphore.md).

## Streams, persistence, and observability

### IF a Stream's consumer owns the fold, collection, or termination policy

- **THEN:** Express that policy as a `Sink`; keep production and consumption separate.
- **BECAUSE:** A Sink makes the result, leftover handling, completion, and failure policy explicit.
- **CHECK:** Bound collection, define early termination, and close the stream's resources when the
  sink stops.
- **CODE:** See [`Sink`](../../effect-api-documentation/references/Sink.md).

### IF direct pull/push control, custom backpressure, or bidirectional composition is required

- **THEN:** Use `Channel`; otherwise keep the design at `Stream` plus `Sink`.
- **BECAUSE:** Channel is the lower-level coordination boundary and carries more protocol detail.
- **CHECK:** Prove pull ownership, buffering, interruption, completion, and failure propagation.
- **CODE:** See [`Channel`](../../effect-api-documentation/references/Channel.md).

### IF state must survive process restart or be shared across process boundaries

- **THEN:** Choose an explicit persistence service such as `KeyValueStore`, `PersistedCache`, or
  `PersistedQueue` according to the durability, encoding, expiry, and retry contract.
- **BECAUSE:** `Ref`, `Cache`, `RcMap`, `Queue`, and `Pool` are runtime state, not durable storage.
- **CHECK:** Define write atomicity, crash recovery, schema/version handling, idempotency, and
  cleanup of abandoned work.
- **CODE:** See [`KeyValueStore`](../../effect-api-documentation/references/KeyValueStore.md),
  [`PersistedCache`](../../effect-api-documentation/references/PersistedCache.md), and
  [`PersistedQueue`](../../effect-api-documentation/references/PersistedQueue.md).

### IF operators need logs, traces, or measurements to explain production behavior

- **THEN:** Add `Logger`, `Tracer`, and `Metric` at service and host boundaries; keep domain results
  and typed errors independent of telemetry.
- **BECAUSE:** Observability should follow work across fibers and boundaries without changing its
  business contract.
- **CHECK:** Preserve correlation, sampling, sensitive-data redaction, cancellation, and test
  capture; do not log a `Cause` by stringifying away its classification.
- **CODE:** See [`Logger`](../../effect-api-documentation/references/Logger.md),
  [`Tracer`](../../effect-api-documentation/references/Tracer.md), and
  [`Metric`](../../effect-api-documentation/references/Metric.md).

## Transactions and host boundaries

### IF several database operations must commit atomically

- **THEN:** Keep acquisition, transaction-bound capability provision, commit, rollback, and release
  inside the database adapter.
- **BECAUSE:** Deep calls can share one transaction without exposing a raw client or threading it.
- **CHECK:** Define nested transactions and interruption during commit.

### IF a transaction also triggers an external side effect

- **THEN:** Fetch before the transaction, accept ambiguity inside it, perform idempotent post-commit
  convergence, or write an outbox entry atomically; choose one policy explicitly.
- **BECAUSE:** A database transaction cannot atomically commit another external system.
- **CHECK:** Test retries and crash points so an unsafe side effect cannot silently duplicate.

### IF Effect crosses into Promise, callback, HTTP response, CLI exit, worker, or UI state

- **THEN:** Translate once at the adapter that owns that host protocol.
- **BECAUSE:** Domain code retains `A`, `E`, `R`, interruption, and cleanup semantics until the final
  boundary.
- **CHECK:** Do not call `runPromise` inside a service and then re-enter Effect; translate final
  `Exit` only where the host requires it.

### IF a boundary must distinguish typed failure, defect, interruption, and cleanup failure

- **THEN:** Use `Effect.result` when only `A` versus `E` should become data; use `Effect.exit` and
  inspect the resulting `Exit` and `exit.cause` when the complete terminal outcome matters.
- **BECAUSE:** `Cause` retains structured reasons, including `cause.reasons`, instead of collapsing
  failure, defect, interruption, or finalizer information into one error or string.
- **CHECK:** Classify at the boundary, preserve interruption as cancellation, and delay
  `Cause.squash` or stringification until the host protocol explicitly requires it.
- **CODE:** See [`Cause`](../../effect-api-documentation/references/Cause.md),
  [`Exit`](../../effect-api-documentation/references/Exit.md), and
  [`Effect`](../../effect-api-documentation/references/Effect.md).
