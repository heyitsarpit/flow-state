# Review and testing decisions

Review semantic ownership before syntax. Correct imports do not make lifetime, failure, or
concurrency correct.

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
   expected failure, defect, interruption, and cleanup failure until their owner handles them.
6. **IF concurrency policy is implicit, write its laws.** Require bounds, ordering, backpressure,
   acknowledgment, sibling failure, retry, and shutdown before selecting a primitive.
7. **IF behavior depends on a race, time, or cleanup claim, require deterministic proof.** Reject
   sleeps and scheduler luck as synchronization.

## Custom-machinery FAQ

### IF code stores Promise resolvers for one-shot coordination

- **THEN:** Compare it with `Deferred`.
- **BECAUSE:** One completion, waiter interruption, and failure are already explicit laws.
- **CHECK:** Preserve duplicate-completion and shutdown behavior before replacing it.

### IF code maintains a FIFO plus a drain loop

- **THEN:** Compare it with Queue plus one owned consumer.
- **BECAUSE:** Capacity, ordering, offers, takes, and shutdown may become one ownership model.
- **CHECK:** Do not replace direct sequencing or a Semaphore when mailbox semantics are absent.

### IF code has a callback array plus a current value

- **THEN:** Compare it with `SubscriptionRef`; use `PubSub` when there is no current-value contract.
- **BECAUSE:** Replay and fan-out are different laws and should have different owners.
- **CHECK:** Preserve equality, subscriber start point, slow-consumer policy, and cleanup.

### IF code has an AbortController tree or detached Promise tasks

- **THEN:** Compare it with parent-owned, Scope-owned, or keyed fibers.
- **BECAUSE:** Structured cancellation gives work a visible lifetime and shutdown path.
- **CHECK:** Confirm foreign operations actually accept cancellation and that failures remain
  observable.

### IF code implements timer-based retry or polling

- **THEN:** Compare it with Schedule plus Effect Clock.
- **BECAUSE:** Retry classification, cadence, bounds, and test time become explicit.
- **CHECK:** Prove idempotency, maximum attempts or elapsed time, interruption, and no overlap unless
  overlap is intended.

### IF code stores cleanup callbacks in an array

- **THEN:** Compare it with Scope and `Effect.acquireRelease`.
- **BECAUSE:** Release attaches to acquisition and runs under success, failure, and interruption.
- **CHECK:** Preserve finalizer ordering and complete cleanup failure truth when the contract needs
  it.

### IF code repeatedly wraps the same SDK or platform API

- **THEN:** Create one capability adapter and construct it with a Layer.
- **BECAUSE:** Throwing, Promise, callback, decoding, tracing, cancellation, and error translation
  should be normalized once.
- **CHECK:** Keep product policy above the adapter and make the service easy to replace in tests.

### IF custom machinery resembles an Effect primitive but its laws differ

- **THEN:** Keep or redesign the custom owner instead of forcing the primitive.
- **BECAUSE:** Similar shape does not guarantee matching identity, persistence, freshness,
  backpressure, acknowledgment, or shutdown.
- **CHECK:** Document the mismatch and test the custom law directly.

## Deterministic test FAQ

### IF testing pure deterministic code

- **THEN:** Use ordinary tests without an Effect runtime.
- **BECAUSE:** The test should expose the algorithm directly.
- **CHECK:** Cover boundary values and exhaustive variants.

### IF testing services or Layers

- **THEN:** Substitute a focused test Layer and run the program in a Scope when resources exist.
- **BECAUSE:** Construction, dependency provision, sharing, and release are the contract.
- **CHECK:** Prove construction failure blocks use, expected sharing versus freshness, release once,
  and contextual isolation across concurrent operations.

### IF testing concurrency or ordering

- **THEN:** Use `Deferred` checkpoints or another observable latch to force each race ordering.
- **BECAUSE:** Real sleeps test scheduler timing instead of the program's law.
- **CHECK:** Prove bounds, result/publication order, sibling failure, interruption, acknowledgment,
  and waiter settlement on shutdown.

### IF testing time, retry, expiry, refresh, or polling

- **THEN:** Use Effect Clock in production and the pinned v4 `TestClock` API in tests.
- **BECAUSE:** Advancing virtual time makes attempt count and deadlines deterministic.
- **CHECK:** Prove delays, stop conditions, interruption, freshness, invalidation, and no duplicate
  unsafe side effect.

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

## Report a finding

Use one compact chain:

- **IF:** Identify the current semantic owner and the concrete mismatch.
- **THEN:** Give the smaller Effect composition and state what remains plain TypeScript.
- **BECAUSE:** Explain the change to failure, interruption, lifetime, or concurrency behavior.
- **CHECK:** Name the focused regression test and verify exact APIs in the consuming package and
  its tests.
