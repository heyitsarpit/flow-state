# System decisions

Design from capabilities, owners, and lifetimes, then choose constructors. Load
[RECIPES.md](./RECIPES.md) only when code makes the chosen composition easier to see.

## Contents

- [Services, Layers, and deep injection](#services-layers-and-deep-injection)
- [State and coordination](#state-and-coordination)
- [Fibers and background work](#fibers-and-background-work)
- [Time, caches, streams, and pools](#time-caches-streams-and-pools)
- [Transactions and host boundaries](#transactions-and-host-boundaries)

## Services, Layers, and deep injection

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
  services.

### IF a non-Effect host repeatedly executes programs against one environment

- **THEN:** Create one `ManagedRuntime` for that host lifetime and give one owner responsibility for
  disposal.
- **BECAUSE:** Rebuilding a runtime per call or render duplicates services and obscures cleanup.
- **CHECK:** Keep runners at host adapters and route host cancellation into interruption.
- **CODE:** See [Services and Layers](./RECIPES.md#services-and-layers) and
  [Streams and host edges](./RECIPES.md#streams-and-host-edges).

## State and coordination

### IF only atomic private current state is needed

- **THEN:** Use `Ref`; use a synchronized form only when the update itself must suspend.
- **BECAUSE:** A mailbox or event stream adds ordering and lifetime laws current state does not
  need.
- **CHECK:** Define atomicity, visibility, and whether callbacks may run while serialized.

### IF consumers need the current value and future changes

- **THEN:** Use `SubscriptionRef` or the pinned subscription-aware reference.
- **BECAUSE:** It owns both initial replay and the update stream.
- **CHECK:** Define equality, replay, subscriber cleanup, and slow-consumer behavior.

### IF consumers need events without current-state replay

- **THEN:** Use `PubSub`.
- **BECAUSE:** Fan-out events have different semantics from a current-value cell.
- **CHECK:** Define capacity, overflow, subscriber start point, and shutdown.

### IF commands require owned FIFO processing

- **THEN:** Use a Queue plus one owned consumer.
- **BECAUSE:** The mailbox makes ordering, buffering, acknowledgment, and shutdown explicit.
- **CHECK:** Name what acknowledgment proves and settle every queued waiter when the owner stops.

### IF only a one-shot result or gate is needed

- **THEN:** Use `Deferred` or the pinned latch-like primitive.
- **BECAUSE:** Exactly one completion owns the coordination contract.
- **CHECK:** Prove winner selection, duplicate completion, waiter interruption, and shutdown.

### IF the requirement is only bounded admission

- **THEN:** Use a Semaphore or bounded traversal instead of a Queue.
- **BECAUSE:** Capacity control does not imply mailbox ordering or a consumer fiber.
- **CHECK:** Define fairness and cancellation while waiting for a permit.
- **CODE:** See [State and coordination](./RECIPES.md#state-and-coordination).

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

- **THEN:** Investigate `FiberMap` or the pinned keyed-supervision primitive.
- **BECAUSE:** A keyed owner can prevent stale completion and centralize cancellation.
- **CHECK:** Compare duplicate-key, replacement, completion, failure, and Scope-close laws before
  deleting custom machinery.

### IF work must outlive the current parent and Scope

- **THEN:** Use detached work only after naming a separate owner, observation path, and shutdown
  mechanism.
- **BECAUSE:** Detachment transfers lifetime responsibility; it does not remove it.
- **CHECK:** Reject fire-and-forget work whose failure or cleanup nobody can observe.
- **CODE:** See [Resources and fibers](./RECIPES.md#resources-and-fibers).

## Time, caches, streams, and pools

### IF behavior retries, repeats, polls, or sleeps

- **THEN:** Use Effect Clock and compose a `Schedule` that states cadence, retryability, bounds,
  backoff, and jitter.
- **BECAUSE:** Time becomes controllable and policy becomes inspectable.
- **CHECK:** Retry only classified transient failures and only safe-to-repeat operations.

### IF sharing work by key is the requirement

- **THEN:** Consider `Cache`, `RcMap`, or a request resolver only after matching the required law.
- **BECAUSE:** Freshness, error caching, reference counting, batching, and authoritative domain state
  are different contracts.
- **CHECK:** Define key identity, capacity, expiry, invalidation, release, and failure caching.

### IF values form a resource-safe temporal process

- **THEN:** Use Stream.
- **BECAUSE:** Stream owns pull, completion, failure, cancellation, and scoped acquisition.
- **CHECK:** Define hot/cold, single-consumer/broadcast, replay, buffering, overflow, and bounded test
  consumption.

### IF finite resources are borrowed under a capacity limit

- **THEN:** Use a Pool or keyed Pool when borrow/release is the domain law.
- **BECAUSE:** A singleton service or Semaphore does not own per-item acquisition and release.
- **CHECK:** Prove invalidation, waiter cancellation, capacity, and pool shutdown.
- **CODE:** See [Duration and Schedule](./RECIPES.md#duration-and-schedule) and
  [Streams and host edges](./RECIPES.md#streams-and-host-edges).

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
