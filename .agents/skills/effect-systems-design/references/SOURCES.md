# Source index by decision

Use this index after choosing a semantic direction. Use `codebases/effect-v4/` as
the primary reference for Effect feature usage, then inspect the named functions
instead of reading either codebase broadly. Treat the consuming package as runtime
truth when its Effect version differs from the vendored checkout.

At this revision, Flow State consumes `4.0.0-beta.86`, Phoenix uses a patched `4.0.0-beta.92`, and
the vendored checkout is `4.0.0-beta.98` at commit
`3a1128c7684e04d34d9f541f77adaac38a513056`. These versions are evidence of API drift, not versions
to bake into future answers; re-read the package files on every task.

## Contents

- [Low-level values and composition](#low-level-values-and-composition)
- [Effect boundaries and error handling](#effect-boundaries-and-error-handling)
- [Services and Layer composition](#services-and-layer-composition)
- [Concurrency, resources, time, and streams](#concurrency-resources-time-and-streams)
- [Observability](#observability)
- [Hosts and deterministic tests](#hosts-and-deterministic-tests)

## Low-level values and composition

### IF deciding between plain TypeScript, Option, Result, and Effect

- Inspect Effect v4 [Option.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Option.ts):
  `fromNullishOr`, `fromUndefinedOr`, `fromNullOr`, `map`, `flatMap`, `match`, and `getOrElse`.
- Inspect Effect v4 [Result.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Result.ts):
  `try`, `succeed`, `fail`, `map`, `flatMap`, `mapError`, `match`, and `all`.
- Use Phoenix [report resolution.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/apps/web/worker/features/report/resolution.ts)
  functions `resolve`, `reopen`, and `outcomeOf` as evidence for keeping a pure state transition in
  `Result` instead of wrapping it in Effect.
- Use Phoenix [runner.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/fabrika-cli/src/eval/runner.ts)
  function `decodeCaptureManifest` as evidence for composing `Result.try`, `Result.flatMap`, and
  `Result.mapError` around synchronous JSON and schema decoding.
- Use Phoenix [protocol/group.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/pipeline-crew-mcp/src/protocol/group.ts)
  function `claimResourceKey` as evidence for decoding to `Option`, mapping only the present value,
  and eliminating absence at the boundary.

### IF choosing `pipe`, `map`, `flatMap`, `tap`, `andThen`, or `Effect.gen`

- Inspect Effect v4 [Effect.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts):
  `succeed`, `sync`, `suspend`, `map`, `flatMap`, `tap`, `andThen`, `as`, `asVoid`, `when`,
  `filterOrFail`, `forEach`, `partition`, `validate`, and `all`.
- Inspect [01_effect-gen.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/01_effect/01_basics/01_effect-gen.ts)
  and [02_effect-fn.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/01_effect/01_basics/02_effect-fn.ts)
  for sequential generator composition and reusable Effect functions.
- Use Phoenix [orchestrate.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/design-capture/src/orchestrate.ts)
  function `captureAndUpload` as a compact production pipeline: `Effect.try` → `flatMap` →
  `flatMap` → `forEach` → inner `map`, with concurrency fixed at one.
- Use Phoenix [domain.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/infra/depo/worker/domain.ts)
  functions `sha256Hex` and `contentAddressKey` for a smaller `tryPromise` → `orDie` → `map` pipe.
- Use Phoenix [read-stdin.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/pipeline-cli/src/read-stdin.ts)
  functions `readStdinText` and `readStdinTextOrExit` for `suspend`, `catchTag`, `andThen`, and
  terminal process behavior.

## Effect boundaries and error handling

### IF adapting throws, Promises, callbacks, or unknown input

- Inspect Effect v4 [10_creating-effects.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/01_effect/01_basics/10_creating-effects.ts)
  and `try`, `tryPromise`, `callback`, and `promise` in
  [Effect.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts).
- Inspect Effect v4 [10_schema-basics.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/01_effect/02_schema/10_schema-basics.ts)
  and the exact decode function in [Schema.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schema.ts)
  before accepting `unknown`.
- Use Phoenix [Drizzle.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/apps/web/worker/db/Drizzle.ts)
  functions `makeDrizzleAccess`, `orDieDrizzle`, and `orDieAccess` to study one Promise boundary and
  one deliberate domain policy boundary. Do not copy its infrastructure-as-defect policy unless the
  target contract makes the same choice.
- Use Phoenix [read-stdin.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/pipeline-cli/src/read-stdin.ts)
  functions `readStdinText` and `readStdinTextOrExit` to study a platform service, `catchTag`, and
  explicit failure translation.

### IF handling expected failure, full Exit, or Cause

- Inspect Effect v4 [01_error-handling.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/01_effect/04_errors/01_error-handling.ts),
  [10_catch-tags.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/01_effect/04_errors/10_catch-tags.ts),
  [Exit.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Exit.ts), and
  [Cause.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Cause.ts).
- Use Phoenix [translate-vote-miss.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/apps/web/worker/features/vote/translate-vote-miss.ts)
  function `translateVoteMiss` for narrow `catchTags` translation at a domain seam.
- Use Phoenix [WireError.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/fate-effect/src/WireError.ts)
  function `failureOf` for a complete-Cause boundary using `Cause.findErrorOption` and
  `Option.match`.

## Services and Layer composition

### IF defining a capability or injecting it several levels down

- Inspect Effect v4 [01_service.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/01_effect/03_services/01_service.ts)
  class `Database` and its explicit `Database.layer`.
- Inspect Effect v4 [20_layer-composition.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/01_effect/03_services/20_layer-composition.ts)
  class `UserRepository` and fields `layerNoDeps`, `layer`, and `layerWithSqlClient` for the
  difference between `Layer.provide` and `Layer.provideMerge`.
- Use Phoenix [Drizzle.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/apps/web/worker/db/Drizzle.ts)
  class `Drizzle` and functions `makeDrizzleLayer` and `DrizzleLive` for already-built versus
  dependency-derived capabilities.
- Use Phoenix [fate/layers.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/apps/web/worker/features/fate/layers.ts)
  values `PasaportFromTag`, `VoterStandingFromKunye`, `makeFateLayer`, and `PhoenixFateLive` for
  capturing internal services, composition-root dependency inversion, and a large residual `R`.

### IF testing a service or Layer

- Inspect Effect v4 [20_layer-tests.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/09_testing/20_layer-tests.ts)
  classes `TodoRepoTestRef`, `TodoRepo`, and `TodoService` for test Layers and dependency discharge.
- Use Phoenix [Drizzle.unit.test.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/apps/web/worker/db/Drizzle.unit.test.ts)
  values `TestDrizzleLayer` and `makeAccess` for focused capability substitution without rebuilding
  the full application graph.

## Concurrency, resources, time, and streams

### IF choosing Ref, Deferred, Queue, PubSub, or a fiber owner

- Inspect exact constructors and shutdown functions in Effect v4
  [Ref.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Ref.ts),
  [Deferred.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Deferred.ts),
  [Queue.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Queue.ts),
  [PubSub.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/PubSub.ts), and
  [FiberMap.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/FiberMap.ts).
- Use Phoenix [peer.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/pipeline-crew-mcp/src/peer/peer.ts)
  function `make`, especially `dialHolder` and `send`, for `timeoutOrElse`, `catchTag`, bounded fan
  behavior, `Effect.forEach`, `Effect.result`, `Result`, and `Option` in one operation.
- Inspect the `forEach`, `all`, `partition`, and `validate` suites in Effect v4
  [Effect.test.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/test/Effect.test.ts)
  before depending on sequential, bounded, unbounded, discard, or accumulated-failure behavior.
- Use Phoenix [interrupt-on-abort.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/apps/web/worker/http/interrupt-on-abort.ts)
  function `interruptOnAbort` for `forkChild`, the abort-before-listener race, `Fiber.join`, and
  listener cleanup with `onExit`.

### IF acquiring a resource or starting a scoped worker

- Inspect Effect v4 [10_acquire-release.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/01_effect/05_resources/10_acquire-release.ts)
  class `Smtp` and [20_layer-side-effects.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/01_effect/05_resources/20_layer-side-effects.ts)
  value `BackgroundTask`.
- Use Phoenix [heartbeat.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/pipeline-crew-mcp/src/crew/heartbeat.ts)
  function `crewHeartbeatLayer` for `Layer.effectDiscard`, service access, `Effect.repeat`, and
  `forkScoped` under one session Scope.
- Use Phoenix [lifecycle.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/audit-stage/src/lifecycle.ts)
  for explicit host resource teardown through `Effect.onExit`; check its paired
  `lifecycle.unit.test.ts` before adopting the pattern.

### IF modeling duration, retry, repetition, or timeout

- Inspect Effect v4 [Duration.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts)
  functions `millis`, `seconds`, `minutes`, and `toMillis`.
- Inspect Effect v4 [Schedule.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts)
  functions `both`, `exponential`, `recurs`, `spaced`, `jittered`, and `upTo`, plus
  [10_schedules.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts).
- Use Phoenix [cold-start-retry.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/apps/web/worker/features/fate-live/cold-start-retry.ts)
  values `coldStartRetrySchedule` and function `retryTransportFailure` for bounded exponential retry
  restricted by a positive error classifier.
- Use Phoenix [cloudflare.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/orphan-sweep/src/cloudflare.ts)
  values `cfRetrySchedule` and `isRetryableCfHttp` for jitter plus explicit transient
  classification.
- Use Phoenix [heartbeat.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/pipeline-crew-mcp/src/crew/heartbeat.ts)
  constants `HEARTBEAT_INTERVAL_SECONDS`, `heartbeatInterval`, and function `crewHeartbeatLayer` for
  deriving operational time policy from one TTL.

### IF values form a temporal stream

- Inspect Effect v4 [Stream.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Stream.ts),
  [10_creating-streams.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/03_stream/10_creating-streams.ts),
  and [20_consuming-streams.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/03_stream/20_consuming-streams.ts).
- Use Phoenix [github.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/flake-rate/src/github.ts)
  functions `collect` and `runGh` for decoding process streams, collecting bounded output, and
  joining output with exit status under one Effect operation.
- Use Phoenix [audit-stage adapter.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/audit-stage/src/adapter.ts)
  function `decode` for a compact `Stream.decodeText` → `Stream.mkString` host boundary.

## Observability

### IF adding structured logs, spans, or exporter configuration

- Inspect Effect v4 [10_logging.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/08_observability/10_logging.ts)
  values `logCheckoutFlow`, `JsonLoggerLayer`, `WarnAndAbove`, and `LoggerLayer`.
- Inspect Effect v4 [20_otlp-tracing.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/08_observability/20_otlp-tracing.ts)
  values `ObservabilityLayer`, `Checkout`, and `Checkout.layer` for exporter Layer ownership and
  meaningful operation spans.
- Inspect `tap`, `logInfo`, `annotateLogs`, `annotateCurrentSpan`, and `withSpan` in Effect v4
  [Effect.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Effect.ts).
- Use Phoenix [Flags.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/apps/web/worker/features/flagship/Flags.ts)
  functions `swallowToDefault` and `buildRealFlags` to study a deliberately observable fallback and
  bounded `Effect.tap` at an adapter boundary.

## Hosts and deterministic tests

### IF integrating a reusable Effect environment into a non-Effect host

- Inspect Effect v4 [10_managed-runtime.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/04_integration/10_managed-runtime.ts)
  and [ManagedRuntime.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts).
- Use Phoenix [fate/layers.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/apps/web/worker/features/fate/layers.ts)
  function `makeFateRuntime` for one host-owned runtime, a shared MemoMap, and a context Layer
  derived from the built environment.
- Use Phoenix [worker/index.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/apps/web/worker/index.ts)
  only to understand the final host edge; do not copy its Cloudflare-specific no-shutdown policy to
  hosts that provide a shutdown hook.

### IF proving time, races, cancellation, or cleanup

- Inspect Effect v4 [10_effect-tests.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/ai-docs/src/09_testing/10_effect-tests.ts),
  [TestClock.ts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/testing/TestClock.ts),
  and the relevant runtime test under `packages/effect/test`.
- Use Phoenix [heartbeat.test.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/packages/pipeline-crew-mcp/src/crew/heartbeat.test.ts)
  for `Duration`, `TestClock.adjust`, `Layer.build`, `Effect.scoped`, and production Layer behavior
  under virtual time.
- Use Phoenix [interrupt-on-abort.unit.test.ts](/Users/arpit/Developer/flow-state/codebases/phoenix/apps/web/worker/http/interrupt-on-abort.unit.test.ts)
  for explicit pre-abort, listener-gap, failure, interruption, and listener-cleanup cases.

## Search locally

```sh
rg -n "SYMBOL" /Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src \
  /Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/test \
  /Users/arpit/Developer/flow-state/codebases/phoenix
```
