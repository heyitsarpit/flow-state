# Review and testing decisions

Review semantic ownership before syntax. Correct imports do not make lifetime, failure, or
concurrency correct. This is a read-only review and proof gate: report semantic mismatches and
required checks without editing the reviewed implementation. Use
[`effect-api-documentation`](../../effect-api-documentation/SKILL.md) for exact exports,
signatures, and member behavior; keep this page focused on decisions and proofs.

## Contents

- [Review procedure](#review-procedure)
- [Custom-machinery FAQ](#custom-machinery-faq)
- [Deterministic test FAQ](#deterministic-test-faq)
- [Report a finding](#report-a-finding)

## Review procedure

1. **IF an Effect only wraps deterministic work, remove the wrapper.** Keep Effects where they own
   failure, dependencies, time, concurrency, lifetime, or intentional observability.
2. **IF runners or runtime constructors appear below host adapters, move execution outward.** Domain
   and service code should yield Effects in the current runtime.
3. **IF `R` is erased or dependencies hide in globals, restore the service requirement.** Provide it
   once at the correct application, request, job, or test lifetime.
4. **IF a resource, fiber, queue, subscription, timer, listener, cache, or runtime has no single
   owner, stop the review there.** Establish acquisition, release, shutdown, and failure ownership
   before judging smaller style choices.
5. **IF broad catches or Promise conversion collapse errors, trace all four lanes.** Preserve
   expected failure, defect, interruption, and cleanup failure until their owner handles them; assert
   the typed error channel directly at the boundary. See [`Cause`](../../effect-api-documentation/references/Cause.md),
   [`Exit`](../../effect-api-documentation/references/Exit.md), and the
   [error-management guide](../../effect-api-documentation/references/guides/ErrorManagement.md).
6. **IF concurrency policy is implicit, write its laws.** Require bounds, ordering, backpressure,
   acknowledgment, sibling failure, retry, and shutdown before selecting a primitive.
7. **IF behavior depends on a race, time, or cleanup claim, require deterministic proof.** Reject
   sleeps and scheduler luck as synchronization.

## Custom-machinery FAQ

### IF code stores Promise resolvers for one-shot coordination

- **THEN:** Compare it with [`Deferred`](../../effect-api-documentation/references/Deferred.md).
- **BECAUSE:** One completion, waiter interruption, and failure are already explicit laws.
- **CHECK:** Preserve duplicate-completion and shutdown behavior before replacing it.

### IF code maintains a FIFO plus a drain loop

- **THEN:** Compare it with [`Queue`](../../effect-api-documentation/references/Queue.md) plus one
  owned consumer.
- **BECAUSE:** Capacity, ordering, offers, takes, and shutdown may become one ownership model.
- **CHECK:** Do not replace direct sequencing or a Semaphore when mailbox semantics are absent.

### IF code has a callback array plus a current value

- **THEN:** Compare it with [`SubscriptionRef`](../../effect-api-documentation/references/SubscriptionRef.md);
  use [`PubSub`](../../effect-api-documentation/references/PubSub.md) when there is no current-value
  contract.
- **BECAUSE:** Replay and fan-out are different laws and should have different owners.
- **CHECK:** Preserve equality, subscriber start point, slow-consumer policy, and cleanup.

### IF code has an AbortController tree or detached Promise tasks

- **THEN:** Compare it with parent-owned, Scope-owned, or keyed fibers. Use
  [`Fiber`](../../effect-api-documentation/references/Fiber.md),
  [`FiberMap`](../../effect-api-documentation/references/FiberMap.md), or
  [`FiberSet`](../../effect-api-documentation/references/FiberSet.md) when their ownership laws
  match.
- **BECAUSE:** Structured cancellation gives work a visible lifetime and shutdown path.
- **CHECK:** Confirm foreign operations actually accept cancellation and that failures remain
  observable.

### IF code implements timer-based retry or polling

- **THEN:** Compare it with [`Schedule`](../../effect-api-documentation/references/Schedule.md)
  plus [`Clock`](../../effect-api-documentation/references/Clock.md).
- **BECAUSE:** Retry classification, cadence, bounds, and test time become explicit.
- **CHECK:** Prove idempotency, maximum attempts or elapsed time, interruption, and no overlap unless
  overlap is intended.

### IF code stores cleanup callbacks in an array

- **THEN:** Compare it with [`Resource`](../../effect-api-documentation/references/Resource.md),
  [`Scope`](../../effect-api-documentation/references/Scope.md), and `Effect.acquireRelease` in
  [`Effect`](../../effect-api-documentation/references/Effect.md).
- **BECAUSE:** Release attaches to acquisition and runs under success, failure, and interruption.
- **CHECK:** Assert release after success, typed failure, defect, and interruption; preserve
  finalizer ordering and complete cleanup failure truth when the contract needs it.

### IF code repeatedly wraps the same SDK or platform API

- **THEN:** Create one capability adapter and construct it with
  [`Layer`](../../effect-api-documentation/references/Layer.md) and
  [`Context`](../../effect-api-documentation/references/Context.md).
- **BECAUSE:** Throwing, Promise, callback, decoding, tracing, cancellation, and error translation
  should be normalized once.
- **CHECK:** Keep product policy above the adapter, replace the service through a focused test
  Layer, and prove construction failure blocks use.

### IF custom machinery resembles an Effect primitive but its laws differ

- **THEN:** Keep or redesign the custom owner instead of forcing the primitive.
- **BECAUSE:** Similar shape does not guarantee matching identity, persistence, freshness,
  backpressure, acknowledgment, or shutdown.
- **CHECK:** Document the mismatch and test the custom law directly.

### IF code claims a cache or queue is durable

- **THEN:** Compare the contract with [`KeyValueStore`](../../effect-api-documentation/references/KeyValueStore.md),
  [`PersistedCache`](../../effect-api-documentation/references/PersistedCache.md), or
  [`PersistedQueue`](../../effect-api-documentation/references/PersistedQueue.md).
- **BECAUSE:** Durability, restart recovery, invalidation, acknowledgment, and duplicate handling
  are separate laws from in-memory caching or FIFO delivery.
- **CHECK:** Prove version mismatch, restart recovery, duplicate delivery or acknowledgment,
  retry, poison-item handling, and invalidation behavior.

### IF tests or services emit logs, spans, or metrics

- **THEN:** Replace observability through focused [`Logger`](../../effect-api-documentation/references/Logger.md),
  [`Tracer`](../../effect-api-documentation/references/Tracer.md), and
  [`Metric`](../../effect-api-documentation/references/Metric.md) Layers.
- **BECAUSE:** Exporter ownership, shutdown flushing, redaction, and bounded cardinality belong at
  service or host boundaries, not in domain values.
- **CHECK:** Isolate telemetry state per test and prove exporter shutdown without leaking records
  or parent spans into another test.

## Deterministic test FAQ

### IF testing pure deterministic code

- **THEN:** Use ordinary tests without an Effect runtime.
- **BECAUSE:** The test should expose the algorithm directly.
- **CHECK:** Cover boundary values and exhaustive variants.

### IF testing services or Layers

- **THEN:** Substitute a focused [`Layer`](../../effect-api-documentation/references/Layer.md)
  and run the program in a [`Scope`](../../effect-api-documentation/references/Scope.md) when
  resources exist. Share the Layer only when sharing is part of the contract; otherwise build it
  fresh per test.
- **BECAUSE:** Construction, dependency provision, sharing, and release are the contract.
- **CHECK:** Prove construction failure blocks use, expected sharing versus freshness, release once,
  and contextual isolation across concurrent operations.

### IF using `@effect/vitest`

- **THEN:** Use `it.effect` for deterministic Effect tests and `it.live` only when a real clock or
  live runtime is the behavior under test. Provide test Layers or a test `ConfigProvider`; do not
  mutate process globals.
- **BECAUSE:** The test harness owns the Effect runtime and fresh Scope, while the test chooses the
  capability implementation.
- **CHECK:** For reusable stateful fakes, define a `TestInterface`/`TestService` and let the same
  implementation object satisfy the production and test tags. Use `Layer.mock` only for a small
  partial mock whose unexercised methods are irrelevant.

### IF testing concurrency or ordering

- **THEN:** Use [`Deferred`](../../effect-api-documentation/references/Deferred.md) checkpoints
  or another observable latch to force each race ordering.
- **BECAUSE:** Real sleeps test scheduler timing instead of the program's law.
- **CHECK:** Prove bounds, result/publication order, sibling failure, interruption, acknowledgment,
  and waiter settlement on shutdown.

### IF testing time, retry, expiry, refresh, or polling

- **THEN:** Use Effect Clock in production and provide [`TestClock.layer()`](../../effect-api-documentation/references/TestClock.md)
  in tests. Advance virtual time with the documented TestClock controls instead of sleeping.
- **BECAUSE:** Advancing virtual time makes attempt count and deadlines deterministic.
- **CHECK:** Prove delays, stop conditions, interruption, freshness, invalidation, and no duplicate
  unsafe side effect.

### IF testing console output or observability

- **THEN:** Provide [`TestConsole`](../../effect-api-documentation/references/TestConsole.md) and
  focused Logger/Tracer/Metric test Layers when asserting output or telemetry.
- **BECAUSE:** Test output and telemetry are dependencies that must be replaceable and isolated.
- **CHECK:** Reset or scope logs, spans, metrics, files, and persisted records between tests.

### IF testing foreign adapters and error boundaries

- **THEN:** Exercise success, typed failure, defect, interruption, late completion, and cleanup as
  separate cases when those lanes exist.
- **BECAUSE:** A happy-path test cannot prove error translation or cancellation reaches foreign
  work.
- **CHECK:** Preserve tags and recovery fields; do not leak secrets, stacks, or arbitrary payloads.

### IF testing streams, callbacks, or long-running workers

- **THEN:** Bound consumption, close the owning Scope, and assert no fiber, subscriber, listener,
  queue, or lease remains.
- **BECAUSE:** Completion and cleanup are part of the behavior, not test housekeeping.
- **CHECK:** Prove registration-before-emission, buffering, slow consumers, failure, interruption,
  and Scope close.

### IF testing pure laws over generated values

- **THEN:** Use [`FastCheck`](../../effect-api-documentation/references/FastCheck.md) for pure
  algorithms and generated domain values; keep effectful lifecycle and failure assertions in
  focused deterministic cases.
- **BECAUSE:** Property tests expose algebraic and boundary failures without replacing explicit
  ownership proofs.
- **CHECK:** Preserve the same invariants across empty, duplicate, malformed, and maximal inputs.

## Report a finding

Use one compact chain:

- **IF:** Identify the current semantic owner and the concrete mismatch.
- **THEN:** Give the smaller Effect composition and state what remains plain TypeScript.
- **BECAUSE:** Explain the change to failure, interruption, lifetime, or concurrency behavior.
- **CHECK:** Name the focused regression test and verify exact APIs in the consuming package and
  its tests.
