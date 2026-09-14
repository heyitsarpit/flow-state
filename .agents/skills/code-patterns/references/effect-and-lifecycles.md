# Effect and lifecycles

Read this when a change constructs, executes, composes, cleans up, or bounds an Effect-owned lifetime.

## CP-03 — Constructing an Effect must not claim work

- **Bad:** Creating shared completion state, closing admission, or reserving cleanup
  merely when a function returns an Effect.
- **Good:** Claim work inside an executing owner transition. Install guaranteed
  completion without an interruption gap; restore interruption separately for
  followers. Shared bootstrap belongs to an owned fiber, so cancelling a waiter
  cannot cancel readiness.
- **Keep distinct:** Cached terminal disposal and retryable explicit release stages. A `retryOnFailure` boolean hides different protocols.

```ts
// Bad: discarding dispose() strands every later caller.
const dispose = () => {
  completion ??= Deferred.makeUnsafe();
  return runCleanup(completion);
};

// Good shape: ownership starts only when the returned Effect executes.
const dispose = () =>
  Effect.suspend(() =>
    Effect.uninterruptibleMask((restore) =>
      claimOrJoinDisposal(restore),
    ),
  );
```

## CP-04 — Cleanup returns outcomes without losing failures

- **Bad:** Mutable Cause accumulators, indexed replacement of cleanup results,
  `Cause.combine` when ordered repeated reasons must be preserved, `Cause.squash`
  inside an owner, or retrying a failed finalizer by closing its Scope again.
- **Good:** Release in reverse order, attempt every independent participant, and
  return updated participant state plus all Exits. Preserve failure order and
  multiplicity, including equal reasons. `Cause.combine` remains valid when the
  contract permits its parallel/tree or value-deduplicating semantics.
- **Keep:** Cache completed fiber Exits. Retry only failed explicit cancellation, release, or finalizer stages; never replay successful stages or completed work. Later cancellation success cannot erase an earlier interruption. Scope finalizers run once; physical release does not turn their failed Exit into success.

```ts
// Bad: hides stage state and deduplicates equal rc.112 reasons.
let cause;
for (const participant of participants) {
  const exit = yield* Effect.exit(participant.release);
  if (Exit.isFailure(exit)) cause = cause ? Cause.combine(cause, exit.cause) : exit.cause;
}

// Good: sequence is explicit; retain every result before classification.
const exits = yield* Effect.forEach(
  [...participants].reverse(),
  (participant) => Effect.exit(participant.release),
  { concurrency: 1 },
);
const reasons = exits.flatMap((exit) =>
  Exit.isFailure(exit) ? exit.cause.reasons : [],
);
const cause = Cause.fromReasons(reasons);
```

## CP-05 — End owned lifetimes promptly

- **Bad:** Detached work, parent finalizers retaining disposed children, borrowed Scopes hidden in actor state, or treating a `closed` boolean as evidence of resource release.
- **Good:** Acquire resources inside the owner's scoped program. Its parent owns the fiber; release awaits the full Exit and removes completed child retention promptly. `Effect.forkIn` handles parent-finalizer removal when its child finishes.
- **Keep:** Ownership visible through acquisition, readiness, drain, disposal, and typed completion. Observe real resource finalizers; later parent shutdown must not repeat completed child cleanup or erase finalizer failures.

## CP-06 — Execute at the host boundary

- **Bad:** Domain `Effect.runSync*`/`runPromise*`, `Date.now`, a fresh default runtime for time reads, or an unmanaged `Effect.promise` bridge.
- **Good:** Return Effects and use the provided Clock and service Context. Capture that environment at runtime construction/readiness. Host adapters own execution and Promise rejection mapping with `Effect.tryPromise`.
- **Keep:** Synchronous postcommit work limited to prepared owned values; a runner cannot bypass this boundary.

```ts
// Bad: loses the provided test/request environment.
const timestamp = Effect.runSync(clock.now);

// Good: run inside the caller's Effect and captured service environment.
const timestamp = yield* clock.now;
```

## CP-07 — Match concurrency to dependencies

- **Bad:** Omitted concurrency on collection operators that accept it, parallel dependent acquisitions, or gated children whose bounded group must finish before their gate opens.
- **Good:** Use `{ concurrency: 1 }` for ordered acquisition and cleanup. Accumulate provided Context with sequential `Effect.reduce`, which takes no concurrency option. Give independent siblings explicit concurrency, barriers, and settlement rules.
- **Keep:** The waiter must not prevent its child or gate releaser from running. Prove progress with deterministic checkpoints, including shutdown settlement, rather than elapsed time.

## CP-17 — Use native Effect composition

- **Bad:** Identity-only Result/Exit adapters, hand-written flattening callbacks, or wrappers replacing `undefined` with an Effect without adding policy.
- **Good:** Use `Effect.fromResult`, compose admitted Exits directly, use `Effect.flatten` for nested Effects, and `Effect.void` for a no-op. Direct `yield* exit` preserves its Cause.
- **Keep:** Adapters that classify an invalid empty Cause, map a foreign error, or preserve a host envelope. Normalize once; removing branches must not erase failure information.

```ts
// Bad: repeats the native Result and Exit protocols without adding policy.
const admitted = Result.isFailure(result)
  ? Effect.fail(result.failure)
  : Effect.succeed(result.success);
const restored = Exit.isSuccess(exit)
  ? Effect.succeed(exit.value)
  : Effect.failCause(exit.cause);

// Good: pinned rc.112 already provides these operations.
const admitted = Effect.fromResult(result);
const restored = exit;
```

### R-01 — Preserve ordered cleanup causes

- **Bad:** Combining sequential cleanup failures with `Cause.combine` when the
  contract requires ordered repeated reasons; its tree or value-deduplicating
  semantics can lose execution order or make duplicate reasons indistinguishable.
- **Good:** Run independent cleanup stages in reverse order with explicit sequential
  concurrency, retain every `Exit`, and build the final cause from the ordered reason
  list with `Cause.fromReasons`. `Cause.combine` remains valid when the contract
  permits parallel/tree or value-deduplicating semantics.
- **Review proof:** Include repeated equal failures, mixed failures, successful stages,
  and retry behavior. Retry only failed explicit stages; do not replay successful work.

```ts
// Bad: sequential failures are combined as a tree and duplicate reasons are obscured.
cleanupCause =
  cleanupCause === undefined
    ? released.cause
    : Cause.combine(cleanupCause, released.cause);

// Good: preserve every result and classify the ordered reason list.
const exits = yield* Effect.forEach(
  [...steps].reverse(),
  (step) => Effect.exit(step.release),
  { concurrency: 1 },
);
const reasons = exits.flatMap((exit) =>
  Exit.isFailure(exit) ? exit.cause.reasons : [],
);
const cause = Cause.fromReasons(reasons);
```
