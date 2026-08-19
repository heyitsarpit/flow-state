# Effect-Native Review Checklist

Use this checklist for Flow State or any TypeScript code that imports from
`effect`. The goal is maximal Effect semantics with simple, type-safe code.

## Required Shape

- Preserve the `Effect<A, E, R>` story. Do not erase typed failures or service
  requirements for convenience.
- Use `Context.Service` or established Effect service patterns for app services.
- Compose dependencies with `Layer`; do not invent ad hoc dependency injection.
- Use `ManagedRuntime` when bridging Effects into host frameworks.
- Prefer `Effect.fn("Name")` for service methods, resource lookups, mutations,
  and named operations.
- Use `Effect.gen` for sequential logic, but do not use `try/catch` inside it to
  handle Effect failures.
- Use `return yield*` for typed failures and interrupts in generators.

## Prefer Effect APIs Directly

- Use `Stream.Stream` for ongoing values. Keep `AsyncIterable` only as an
  adapter through `Stream.fromAsyncIterable`.
- Use `Schedule` for retry, repeat, polling, sampling, and backoff.
- Use human-readable `Duration.Input` strings such as `"30 seconds"` and
  `"250 millis"` in examples and tests.
- Use `Clock`, `DateTime`, and `TestClock`; do not use `Date.now()` inside
  Effect services.
- Use `Exit` and `Cause` internally to preserve success, typed failure, defect,
  interruption, multiple causes, and annotations.
- Use `Schema`, `Schema.TaggedClass`, `Schema.TaggedErrorClass`, `Data`, `Brand`,
  and `Newtype` for domain contracts and typed errors.
- Use `Option` for internal absence; use `null` or `undefined` only at React,
  JSON, external API, or persistence boundaries.
- Use `Result` for synchronous validation that can fail before Effect execution.
- Use `Redacted`, `Schema.Redacted`, and `Config.redacted` for sensitive values.
- Use `Queue` or `PubSub` for controlled stream tests and fanout.
- Use `RequestResolver` for service-level batching instead of custom batching.
- Use `Cache`, `Resource`, `Ref`, `SynchronizedRef`, `ScopedRef`, `Deferred`,
  `Latch`, `FiberSet`, `FiberMap`, `FiberHandle`, `Semaphore`, `Pool`, and
  `Scope` when those are the native names for the problem.
- Use `Record`, `Array`, `Struct`, `Tuple`, `Match`, `Predicate`, `Order`, and
  `Equivalence` instead of local helper clones when they make code simpler.

## Aggressive Rejection Criteria

Flag these as serious issues unless strongly justified:

- `Promise`-first domain logic where an `Effect` should carry errors and
  requirements.
- `throw` for expected domain failures.
- `try/catch` around `yield* someEffect`.
- `any`, `unknown`, `as never`, broad casts, or cast-heavy public API plumbing.
- `null | undefined` as routine internal state instead of `Option`.
- Hand-written tagged unions where `Schema.TaggedErrorClass`, `Schema.Class`, or
  `Data` would make the boundary clearer.
- Custom duration, retry, stream, cache, clock, batching, or redaction APIs that
  duplicate Effect semantics.
- Flow wrappers around Effect names that add namespace symmetry but no semantic
  value.
- Ad hoc cleanup instead of scoped resources, finalizers, interruption handling,
  or managed runtimes.
- Tests that rely on real sleeps, wall-clock time, real network calls, or
  unbounded stream draining.

## Flow State Boundary Rule

Use Flow names only where Flow adds product/runtime semantics:

- resources and resource snapshots
- mutations and traceable transactions
- machines, states, transitions, guards, updates, actions
- `ensure`, `observe`, `run`, `patch`, `invalidate`
- flow snapshots, receipts, issues, traces
- UI read models via `flow.view`

Use Effect names directly everywhere else.

## Test Expectations

- Use direct Effect service tests for services, schemas, typed failures,
  redaction, batching, clocks, streams, and resource lifecycles.
- Use Flow scenario tests for resource/orchestrator integration.
- Use normal test-runner assertions. Do not add Flow-owned `.expect*` helpers.
- Use `TestClock` or Flow's `advance(...)` boundary for time.
- Use controlled `Deferred`, `Queue`, or `PubSub` handles for async effects and
  streams.
- Assert success, typed failure, defect, and interruption lanes separately when
  the behavior crosses those boundaries.
