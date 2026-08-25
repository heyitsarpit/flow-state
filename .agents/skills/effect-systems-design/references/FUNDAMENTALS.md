# Fundamental decisions

Use this file to decide what the code should mean. Load the matching section of
[RECIPES.md](./RECIPES.md) only when an implementation example would make the choice clearer.
These are decision routes, not an API catalog: use the [effect-api-documentation skill](../../effect-api-documentation/SKILL.md)
and its linked module references for exact exports, signatures, and member behavior. Verify those
names against the consuming package's pinned `effect` version, installed declarations/source, and
tests; `codebases/effect-v4/` is the primary usage reference but is not a substitute when versions differ.

## Contents

- [Values and absence](#values-and-absence)
- [Plain TypeScript or Effect](#plain-typescript-or-effect)
- [Transformations and loops](#transformations-and-loops)
- [Foreign APIs and failures](#foreign-apis-and-failures)
- [Arguments, requirements, and services](#arguments-requirements-and-services)
- [Deterministic tests](#deterministic-tests)

## Values and absence

### IF one local branch handles `null` or `undefined`

- **THEN:** Use `if`, `?.`, or `??` and keep the original union.
- **BECAUSE:** A wrapper adds ceremony without adding composition or safety.
- **CHECK:** Decide whether `null`, `undefined`, omission, empty text, and zero mean different things
  before collapsing them.

```ts
const displayName = user.displayName?.trim() || "Anonymous";
```

## Plain TypeScript or Effect

### IF an operation is deterministic, local, and has no capability, cancellation, time, or resource lifetime

- **THEN:** Keep it a plain TypeScript function.
- **BECAUSE:** Effect adds value when its success, failure, requirement, or lifetime semantics compose;
  it does not improve ordinary construction, branching, validation, encoding, or loops.
- **CHECK:** Reclassify it if it performs I/O, waits, forks, acquires, retries, or emits observable work.

### IF the only recoverable outcome is a local typed success or failure

- **THEN:** Use v4 `Result` or the project's established discriminated result type.
- **BECAUSE:** Typed failure alone does not require an Effect runtime.
- **CHECK:** Keep parsing and validation exhaustive; do not throw and then wrap the throw.
- **CODE:** See [Option and Result](./RECIPES.md#option-and-result) and
  [`Result`](../../effect-api-documentation/references/Result.md).

### IF the operation needs capabilities, asynchrony, interruption, time, resource lifetime, concurrency, or observability

- **THEN:** Use `Effect<A, E, R>` and keep all three channels honest until a boundary handles them.
- **BECAUSE:** The type exposes what the caller must provide, recover, await, cancel, or release.
- **CHECK:** Do not erase `R` with globals or nested host runners; do not turn defects or interruption
  into ordinary domain errors without an explicit boundary policy.
- **CODE:** See [`Effect`](../../effect-api-documentation/references/Effect.md) and
  [Requirements management](../../effect-api-documentation/references/guides/RequirementsManagement.md).

### IF one operation acquires something that must be released

- **THEN:** Give it one owner and a scoped release path, usually `Effect.acquireRelease` inside a
  service `Layer` or another scoped constructor.
- **BECAUSE:** Acquisition, interruption, failure, and shutdown must converge on cleanup.
- **CHECK:** Prove release after successful use, construction failure, interruption, and Scope close.
- **CODE:** See [`Scope`](../../effect-api-documentation/references/Scope.md) and
  [`Layer`](../../effect-api-documentation/references/Layer.md).

### IF absence must be mapped, filtered, combined, or handled exhaustively

- **THEN:** Convert once to `Option` or the project's established optional type.
- **BECAUSE:** Composable absence is now part of the operation's model.
- **CHECK:** Eliminate the `Option` only at a boundary with a deliberate fallback, error, or wire
  representation.
- **CODE:** See [Option and Result](./RECIPES.md#option-and-result).

### IF input is `unknown`, serialized, or untrusted

- **THEN:** Decode once with the project's established decoder; use Effect Schema when its typed
  decoding and integration are useful.
- **BECAUSE:** Trust should begin at one explicit boundary, not through repeated checks deep in the
  program.
- **CHECK:** Prove missing fields, extra fields, malformed values, and the public parse-error shape.

## Transformations and loops

### IF transforming ordinary in-memory data

- **THEN:** Use a plain function, native `map`/`filter`/`reduce`, object construction, or a loop.
- **BECAUSE:** Effect operators compose Effect values; they do not improve ordinary data
  transformation.
- **CHECK:** Prefer a loop when state, early exit, pagination, or allocation control is the actual
  algorithm.

### IF transforming an Effect success without starting another Effect

- **THEN:** Use `Effect.map`.
- **BECAUSE:** The success channel changes while `E` and `R` remain intact.
- **CHECK:** Do not hide a Promise or side effect inside the mapping callback.

### IF the next step depends on the previous value and is effectful

- **THEN:** Use `Effect.flatMap`, or `Effect.gen` when several dependent steps and branches read
  more clearly in sequence.
- **BECAUSE:** Both forms preserve the combined error and requirement channels.
- **CHECK:** Use `return yield*` for a terminal failure or interruption branch.
- **CODE:** See [Pipe and transformations](./RECIPES.md#pipe-and-transformations).

### IF the next Effect ignores the current success or replaces its result

- **THEN:** Use `andThen` to sequence, `as` to replace success, `asVoid` to discard success, and
  `tap` to observe while retaining it.
- **BECAUSE:** The operator names the value-flow intent directly.
- **CHECK:** Do not use `flatMap` merely to ignore or preserve a value.

### IF applying one Effect to a finite collection

- **THEN:** Use `Effect.forEach` with an explicit concurrency policy; use `Effect.all` for a small,
  fixed group of independent Effects.
- **BECAUSE:** Traversal owns failure propagation, result order, and sibling interruption.
- **CHECK:** State the bound, fail-fast versus error collection, output order, and foreign
  cancellation behavior. If only admission is bounded, use a `Semaphore`; if ordering,
  acknowledgment, or backpressure is part of the contract, route to the coordination choices in
  [SYSTEMS.md](./SYSTEMS.md).
- **CODE:** See [Collections and loops](./RECIPES.md#collections-and-loops).

### IF every item must run even when some fail

- **THEN:** Choose `Effect.validate` to accumulate failures, `Effect.partition` to retain failures
  and successes separately, or `Effect.result` per item to retain each full typed outcome.
- **BECAUSE:** The chosen result shape makes the continuation policy visible.
- **CHECK:** Do not accumulate side-effecting commands that must stop after the first failure.

### IF values arrive over time or need backpressure and resource-safe consumption

- **THEN:** Use `Stream` or bounded chunks instead of pretending the input is an array.
- **BECAUSE:** Production, consumption, completion, failure, and cancellation are part of the
  model.
- **CHECK:** Define hot versus cold, replay, buffer capacity, overflow, and subscriber lifetime.

## Foreign APIs and failures

### IF a synchronous foreign API may throw

- **THEN:** Adapt it once with v4 `Effect.try` and translate the cause into a useful typed error.
- **BECAUSE:** Foreign exceptions become an explicit expected-failure boundary.
- **CHECK:** Do not catch unrelated Effect defects later to compensate for a missing adapter.

### IF a foreign API returns a Promise

- **THEN:** Adapt it once with `Effect.tryPromise`; pass an `AbortSignal` or equivalent when the API
  supports cancellation.
- **BECAUSE:** Rejection enters `E`, and interruption can reach the real operation when the foreign
  API cooperates.
- **CHECK:** Test rejection translation, interruption, late completion, and listener cleanup.

### IF a callback settles once

- **THEN:** Use `Effect.callback`, guard exactly-once settlement, and return cleanup that unregisters
  on completion and interruption.
- **BECAUSE:** The adapter owns both callback settlement and cancellation.
- **CHECK:** Test synchronous callback invocation, duplicates, abort-before-registration, and
  interruption-after-registration.

### IF a callback emits many values

- **THEN:** Bridge it through a scoped Stream or bounded Queue and close the bridge with the owning
  Scope.
- **BECAUSE:** Multi-value callbacks need buffering, completion, failure, and backpressure policy.
- **CHECK:** Prove registration-before-emission and cleanup under slow consumers, failure, and Scope
  close.

### IF callers may recover from a failure

- **THEN:** Model it in `E` with a stable tag and useful recovery fields; catch only understood tags
  or predicates.
- **BECAUSE:** Expected failures remain composable while defects and interruption retain their
  meaning.
- **CHECK:** Use `Effect.result` for typed success/failure as data and `Effect.exit` only when defects
  and interruption must also become data.
- **CODE:** See [Errors and outcomes](./RECIPES.md#errors-and-outcomes).

### IF complete failure truth crosses a boundary

- **THEN:** Retain `Exit` and v4 `Cause.reasons` until that boundary classifies failures, defects,
  interruption, and cleanup failures.
- **BECAUSE:** Early squashing or stringification loses information the owner may need.
- **CHECK:** Test mixed reasons and finalizer failures; JavaScript `try/catch` around `yield*` does
  not catch Effect failures.

## Arguments, requirements, and services

### IF a value is ordinary input to one operation

- **THEN:** Pass it as an argument.
- **BECAUSE:** IDs, commands, payloads, filters, and limits are data, so contextual injection hides
  rather than clarifies them.
- **CHECK:** Request data does not become a service merely because several helpers read it.

### IF a reusable capability is used through several call levels

- **THEN:** Define a `Context.Service`, let the deepest operation require it in `R`, and let
  intermediate functions preserve that requirement.
- **BECAUSE:** Capability requirements stay visible without threading a dependency bag through
  every function.
- **CHECK:** Do not erase `R` with casts, globals, or nested `runPromise` calls. Provide the
  implementation at the composition edge with a `Layer`; keep ordinary operation data as arguments.
- **CODE:** See [`Context`](../../effect-api-documentation/references/Context.md),
  [`Layer`](../../effect-api-documentation/references/Layer.md), and
  [Requirements management](../../effect-api-documentation/references/guides/RequirementsManagement.md).

### IF a lower dependency is stable for a higher service's whole lifetime

- **THEN:** Capture it while constructing the higher service's Layer so callers require only the
  higher capability.
- **BECAUSE:** Construction owns the implementation dependency and its lifetime.
- **CHECK:** Leave request-specific or operation-specific dependencies in `R` instead of capturing
  stale context.
- **CODE:** See [Services and Layers](./RECIPES.md#services-and-layers).

## Deterministic tests

### IF behavior depends on time, I/O, services, or fiber coordination

- **THEN:** Replace those capabilities with test Layers, drive time with `TestClock`, and use an
  explicit `Deferred` or other owned handshake for readiness and completion.
- **BECAUSE:** Tests should prove policy without real waiting, network access, or timing races.
- **CHECK:** Assert typed failure, interruption, result ordering, and cleanup; close every Scope or
  runtime created by the test.
- **CODE:** See [`TestClock`](../../effect-api-documentation/references/TestClock.md),
  [`Deferred`](../../effect-api-documentation/references/Deferred.md), and
  [Runtime composition](../../effect-api-documentation/references/guides/RuntimeComposition.md).
