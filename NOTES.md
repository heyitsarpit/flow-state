# Effect-First Discovery Notes

Purpose: discover, from the real Effect v4 codebase and examples, which Effect features, names, field shapes, and composition patterns Flow State should inherit. This file must be updated continuously as evidence is found.

Primary sources:

- `/Users/arpit/Developer/flow-state/docs/codebases/effect-v4`
- `/Users/arpit/Developer/flow-state/docs/codebases/effect-examples`
- Flow State comparison target: `/Users/arpit/Developer/flow-state/packages/flow-state/src/index.ts`
- Flow State examples: `/Users/arpit/Developer/flow-state/examples`

Rules for this audit:

- Do not start from a remembered Effect feature map.
- Every finding must come from a file that was actually inspected.
- Record Effect's own nomenclature and field names before proposing Flow names.
- Prefer inheriting Effect APIs directly when doing so makes Flow simpler or more composable.
- If Flow needs a facade, explain the semantic difference.
- If a feature is not useful for Flow, write down why.
- Keep examples contract-first where intended; the goal is final API shape, not full app runtime.

Entry format:

```md
## Finding: <feature or pattern discovered>

- Evidence:
  - `<file>:<line>` - <what was found>
- Effect nomenclature:
  - `<name>`, `<field>`, `<type>`, or calling pattern
- Flow State today:
  - `<file>:<line>` - <current shape>
- Opportunity:
  - <how Flow can use it in public API, internals, examples, or docs>
- Decision:
  - `adopt`, `adapt`, `defer`, or `avoid`
- Migration notes:
  - <API breaks, compatibility bridge, tests/docs required>
```

## Source Walk Log

- [x] Discover Effect docs/examples entrypoints.
- [x] Read Effect package public module list and exports.
- [x] Read Effect examples by app/domain, not just module names.
- [x] Compare discovered patterns against Flow core API.
- [x] Compare discovered patterns against Flow examples.
- [x] Integrate subagent discoveries with source references.

## Findings

## Finding: Effect docs organize by capabilities, not by small helper APIs

- Evidence:
  - `docs/codebases/effect-v4/ai-docs/src` contains curated capability chapters: streams, managed runtime integration, batching, schedules, datetime, observability, testing, HTTP, child process, CLI, AI, and cluster.
  - `docs/codebases/effect-v4/packages/effect/src` exports a broad module surface including collections, runtime, cache, request resolvers, scope, fibers, queues, pubsub, schema, redaction, logging, metrics, config, platform helpers, and transactional data structures.
- Effect nomenclature:
  - Guide sections are named around capabilities: `stream`, `integration`, `batching`, `schedule`, `datetime`, `observability`, `testing`.
  - Source modules use direct nouns: `Stream`, `ManagedRuntime`, `RequestResolver`, `Schedule`, `Clock`, `DateTime`, `Logger`, `Metric`, `Config`, `Schema`, `Redacted`.
- Flow State today:
  - `packages/flow-state/src/index.ts` exposes Flow-specific nouns like `FlowQueryCachePolicy`, `FlowStreamPressure`, `FlowRuntimeOptions`, `FlowWorkflowPersistenceConfig`, `FlowRuntimeReceipt`, and `FlowRuntimeIssue`.
  - `apps/docs/src/pages/examples.md` organizes examples by Flow concepts: stream lifecycle, query cache, nested workflow, persistence, approvals.
- Opportunity:
  - Use Effect capability names wherever semantics are the same: `Stream`, `Schedule`, `Duration.Input`, `ManagedRuntime`, `RequestResolver`, `Schema`, `Redacted`, `Clock`.
  - Keep Flow nouns only where Flow adds a state-machine/product-workflow semantic: `flow.machine`, transitions, guards, context updates, resource snapshots, receipts.
- Decision:
  - `adopt` for Effect nouns at API boundaries that are directly Effect concepts.
  - `adapt` for Flow-specific machine/resource snapshot nouns.
- Migration notes:
  - This likely means renaming cache/timing fields away from React-query style names where Effect already has better names.
  - Docs should group advanced APIs by inherited Effect capability instead of presenting all of them as Flow-specific inventions.

## Finding: `ManagedRuntime` is Effect's bridge from external frameworks into services/layers

- Evidence:
  - `docs/codebases/effect-v4/ai-docs/src/03_integration/10_managed-runtime.ts:4` says to use `ManagedRuntime` to run Effect programs from external frameworks while domain logic stays in services and Layers.
  - `docs/codebases/effect-v4/ai-docs/src/03_integration/10_managed-runtime.ts:60` creates a shared `Layer.makeMemoMapUnsafe`.
  - `docs/codebases/effect-v4/ai-docs/src/03_integration/10_managed-runtime.ts:67` uses `ManagedRuntime.make(TodoRepo.layer, { memoMap })`.
  - `docs/codebases/effect-v4/ai-docs/src/03_integration/10_managed-runtime.ts:74` uses `runtime.runPromise(...)`.
  - `docs/codebases/effect-v4/ai-docs/src/03_integration/10_managed-runtime.ts:122` disposes the runtime on shutdown.
- Effect nomenclature:
  - `ManagedRuntime.make(layer, { memoMap })`
  - `runtime.runPromise`, `runtime.runSync`, `runtime.runCallback`, `runtime.dispose`
  - `Layer.makeMemoMapUnsafe`
- Flow State today:
  - `packages/flow-state/src/index.ts:1334` defines `runEffectExit` with `Effect.runPromiseExit`.
  - `packages/flow-state/src/index.ts:1341` defines `runEffectWithLayerExit` with `Effect.provide(..., layer)` and `Effect.runPromiseExit`.
  - `packages/flow-state/src/index.ts:1368` exposes `createRuntime(options)`.
- Opportunity:
  - Make Flow's `createRuntime` internally own a `ManagedRuntime` when a Layer is supplied.
  - Expose disposal as first-class runtime lifecycle instead of treating effects as one-off `runPromiseExit` calls.
  - Adopt Effect's language for runtime bridging in docs: Flow's React/provider runtime is an external-framework bridge into Effect services/layers.
- Decision:
  - `adapt`: Flow still needs actor/resource snapshots and receipts, but Effect should own layer memoization and disposal.
- Migration notes:
  - Runtime internals may change without a public API break if `createRuntime` keeps the same shape.
  - Add tests for finalizers/disposal and shared layer memoization.

## Finding: `Stream` is the primary Effect abstraction for ongoing values; async iterables are only one source

- Evidence:
  - `docs/codebases/effect-v4/ai-docs/src/02_stream/10_creating-streams.ts:6` lists stream constructors: `Stream.fromIterable`, `Stream.fromEffectSchedule`, `Stream.paginate`, `Stream.fromAsyncIterable`, `Stream.fromEventListener`, `Stream.callback`.
  - `docs/codebases/effect-v4/ai-docs/src/02_stream/10_creating-streams.ts:22` uses `Stream.fromEffectSchedule(effect, Schedule.spaced("30 seconds"))` for polling.
  - `docs/codebases/effect-v4/ai-docs/src/02_stream/10_creating-streams.ts:62` treats `Stream.fromAsyncIterable` as an adapter with typed error mapping.
  - `docs/codebases/effect-v4/ai-docs/src/02_stream/10_creating-streams.ts:75` uses `Stream.callback` plus `Effect.acquireRelease` for callback sources and cleanup.
  - `docs/codebases/effect-v4/ai-docs/src/02_stream/20_consuming-streams.ts:37` uses `Stream.map`, `Stream.filter`, `Stream.flatMap`.
  - `docs/codebases/effect-v4/ai-docs/src/02_stream/20_consuming-streams.ts:85` uses `Stream.mapEffect(..., { concurrency })`.
  - `docs/codebases/effect-v4/ai-docs/src/02_stream/20_consuming-streams.ts:90` uses `Stream.runCollect`, `runDrain`, `runForEach`, `runFold`, `run`, `runHead`, `runLast`.
- Effect nomenclature:
  - Source constructors: `fromIterable`, `fromEffectSchedule`, `paginate`, `fromAsyncIterable`, `fromEventListener`, `callback`.
  - Operators: `map`, `filter`, `flatMap`, `mapEffect`, `take`, `drop`.
  - Consumers: `runCollect`, `runDrain`, `runForEach`, `runFold`, `runHead`, `runLast`.
  - Cleanup: `Effect.acquireRelease`.
- Flow State today:
  - `packages/flow-state/src/index.ts:395` defines `FlowStreamConfig.stream` as returning `AsyncIterable<TValue>`.
  - `examples/streaming-upload-manager/src/uploadApi.ts:9` has service methods returning `AsyncIterable<UploadProgress>`.
  - `examples/agent-workspace/src/agentWorkspaceApi.ts:39` has progress services returning `AsyncIterable`.
- Opportunity:
  - Change Flow stream descriptors to accept `Stream.Stream` as the primary shape.
  - Keep async iterable only as an adapter path via `Stream.fromAsyncIterable`.
  - Use `Stream.fromEffectSchedule` for polling examples and `Stream.callback`/Queue/PubSub for controlled test streams.
  - Replace Flow-specific pressure operators with Stream/Schedule nouns where possible.
- Decision:
  - `adopt` for public stream descriptor return type and examples.
  - `adapt` for Flow's snapshot/receipt tracking of stream lifecycle.
- Migration notes:
  - Breaking API for stream examples and services.
  - Need tests for cleanup, typed stream errors, interruption, pressure counters, and route emission.

## Finding: `Schedule` is Effect's language for repeated time, retry, polling, and sampling

- Evidence:
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:4` says schedules compose and are used with `Effect.retry` and `Effect.repeat`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:15` uses `Schedule.recurs(5)`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:16` uses `Schedule.spaced("30 seconds")`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:17` uses `Schedule.exponential("200 millis")`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:21` composes with `Schedule.both`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:28` composes with `Schedule.either`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:35` uses `Schedule.setInputType<HttpError>()` and `Schedule.while`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:44` uses `Schedule.tapInput` and `Schedule.tapOutput`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:52` uses `Schedule.jittered`.
- Effect nomenclature:
  - Constructors: `recurs`, `spaced`, `exponential`.
  - Combinators: `both`, `either`, `while`, `jittered`, `tapInput`, `tapOutput`, `setInputType`.
  - Consumers: `Effect.retry`, `Effect.repeat`.
- Flow State today:
  - `packages/flow-state/src/index.ts:371` defines `FlowStreamPressure` with `{ strategy: "sample"; every: FlowDurationInput }`.
  - `packages/flow-state/src/index.ts:409` defines delayed transitions with `FlowAfterConfig.delay`.
  - Query cache policy has `refetchOnInvalidate`, but no schedule-shaped refetch/polling/retry surface.
- Opportunity:
  - Use `Schedule` for repeated behaviors: query polling, retry, stream sampling, backoff, and bounded attempts.
  - Keep `Duration.Input` as shorthand for one-shot delays and simple intervals.
  - Rename any Flow fields that imply ad hoc retry/polling mechanics to Effect schedule terms.
- Decision:
  - `adopt` for retry/refetch/polling/sampling descriptors.
  - `adapt` for one-shot `after.delay` because state-machine timers are simpler than full schedules.
- Migration notes:
  - Add descriptor-level tests for `Schedule`.
  - Docs need examples using `Schedule.spaced`, `Schedule.exponential`, `Schedule.while`, and `Effect.retry`.

## Finding: `RequestResolver` already names batching, delay, tracing, and local resolver cache

- Evidence:
  - `docs/codebases/effect-v4/ai-docs/src/05_batching/10_request-resolver.ts:4` says to define request types with `Request.Class` and resolve them in batches with `RequestResolver`.
  - `docs/codebases/effect-v4/ai-docs/src/05_batching/10_request-resolver.ts:25` defines `GetUserById extends Request.Class`.
  - `docs/codebases/effect-v4/ai-docs/src/05_batching/10_request-resolver.ts:39` creates a resolver with `RequestResolver.make`.
  - `docs/codebases/effect-v4/ai-docs/src/05_batching/10_request-resolver.ts:49` completes requests with `Exit.succeed` / `Exit.fail`.
  - `docs/codebases/effect-v4/ai-docs/src/05_batching/10_request-resolver.ts:59` uses `RequestResolver.setDelay("10 millis")`.
  - `docs/codebases/effect-v4/ai-docs/src/05_batching/10_request-resolver.ts:62` uses `RequestResolver.withSpan`.
  - `docs/codebases/effect-v4/ai-docs/src/05_batching/10_request-resolver.ts:65` uses `RequestResolver.withCache({ capacity: 1024 })`.
  - `docs/codebases/effect-v4/ai-docs/src/05_batching/10_request-resolver.ts:86` uses `Effect.forEach(..., { concurrency: "unbounded" })` to trigger batching.
- Effect nomenclature:
  - `Request.Class`, `RequestResolver.make`, `RequestResolver.setDelay`, `RequestResolver.withSpan`, `RequestResolver.withCache`, `Effect.request`.
  - Cache field name: `capacity`.
  - Delay field name: `setDelay`.
- Flow State today:
  - Cached Dashboard aims to prove batching and cache semantics, but Flow query config currently has only key/tags/effect/cache/policy/routes.
  - `FlowQueryCachePolicy` uses `staleTime` and `gcTime`, not `capacity` or resolver cache terminology.
- Opportunity:
  - Do not invent a Flow batching API until we decide whether `RequestResolver` should simply live inside services.
  - For Cached Dashboard, use `RequestResolver` in the example service if batching is a service/data-source concern.
  - If Flow exposes batching descriptors, inherit `Request`, `RequestResolver`, `setDelay`, `withCache`, `capacity`, and `withSpan` names.
- Decision:
  - `adapt`: likely service-level Effect API first, Flow-level sugar only if examples remain too noisy.
- Migration notes:
  - If Flow query cache remains separate from resolver cache, docs must distinguish UI resource cache from resolver-local LRU cache.
  - Add a batched panel lookup test if Cached Dashboard claims batching.

## Finding: `Duration.Input` is broader and safer than Flow's custom duration type

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:189` defines `DurationObject` fields: `weeks`, `days`, `hours`, `minutes`, `seconds`, `milliseconds`, `microseconds`, `nanoseconds`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:200` parses string inputs like `"5 seconds"` using duration units.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:228` defines `Duration.fromInputUnsafe`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:330` defines safe `Duration.fromInput` returning `Option.Option<Duration>`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:358` serializes `Duration` with `_id: "Duration"` and `_tag`.
- Effect nomenclature:
  - `Duration.Input`, `DurationObject`, `fromInputUnsafe`, `fromInput`, `toMillis`, `Duration.Duration`.
  - Field names use full units: `milliseconds`, not Flow's `{ millis }`.
- Flow State today:
  - `packages/flow-state/src/index.ts:633` defines `FlowDurationInput = number | string | { readonly millis: number }`.
  - `packages/flow-state/src/index.ts:1140` formats custom duration objects as `${duration.millis}ms`.
- Opportunity:
  - Replace custom `FlowDurationInput` with `Duration.Input`.
  - Use `Duration.fromInput` where user input should fail safely and `fromInputUnsafe` where descriptors are trusted code.
  - Stop documenting `{ millis }`; use Effect's object field `milliseconds`.
- Decision:
  - `adopt`.
- Migration notes:
  - Breaking only for `{ millis }` callers.
  - Add compatibility only if needed, but docs/examples should use Effect syntax.

## Finding: Effect `Cache` uses `capacity`, `lookup`, and `timeToLive`, not stale/gc language

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Cache.ts:4` says caches store successful and failed lookup results, share in-progress lookups, and limit entries by `capacity` and optional `time-to-live`.
  - `docs/codebases/effect-v4/packages/effect/src/Cache.ts:103` defines `Cache<Key, A, E, R>`.
  - `docs/codebases/effect-v4/packages/effect/src/Cache.ts:106` has `capacity`.
  - `docs/codebases/effect-v4/packages/effect/src/Cache.ts:107` has `lookup`.
  - `docs/codebases/effect-v4/packages/effect/src/Cache.ts:108` has `timeToLive(exit, key)`.
  - `docs/codebases/effect-v4/packages/effect/src/Cache.ts:177` defines `Cache.makeWith(lookup, { capacity, timeToLive })`.
  - `docs/codebases/effect-v4/packages/effect/src/ScopedCache.ts:138` defines scoped cache options with `lookup`, `capacity`, `timeToLive`, and `requireServicesAt`.
- Effect nomenclature:
  - `Cache.make`, `Cache.makeWith`, `ScopedCache.make`, `lookup`, `capacity`, `timeToLive`, `expiresAt`.
  - Dynamic TTL depends on `Exit.Exit<A, E>` and key.
- Flow State today:
  - `packages/flow-state/src/index.ts:263` uses `FlowQueryCachePolicy` with `staleTime`, `gcTime`, `keepPreviousData`, `refetchOnInvalidate`.
  - `packages/flow-state/src/index.ts:635` query resource snapshots expose `stale`, `fetchStatus`, `staleAt`, and `gcAt`.
- Opportunity:
  - Rename or reframe the underlying lookup cache fields to Effect terms: `capacity`, `lookup`, `timeToLive`.
  - Keep Flow's UI resource fields `stale`, `fetchStatus`, and `keepPreviousData` if they represent product-visible resource freshness rather than cache eviction.
  - Consider replacing `gcTime` with `timeToLive` or `expiresAfter`; if Flow keeps garbage-collection semantics separate from stale UI semantics, document that difference.
  - Consider dynamic `timeToLive: (exit, key) => Duration.Input` for success/failure-specific cache behavior.
- Decision:
  - `adapt`.
- Migration notes:
  - `staleTime` is not the same as Effect `timeToLive`; stale means visible-but-needs-refresh, TTL means cached entry expiry.
  - Recommended API split: Flow resource freshness uses `staleAfter`; Effect cache eviction uses `timeToLive` and `capacity`.

## Finding: `Resource` models refreshable scoped values with `manual`, `auto`, `get`, and `refresh`

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Resource.ts:2` describes refreshable scoped values.
  - `docs/codebases/effect-v4/packages/effect/src/Resource.ts:4` keeps latest successful or failed acquisition result.
  - `docs/codebases/effect-v4/packages/effect/src/Resource.ts:6` says acquisition runs in a scope and replacements release previous values.
  - `docs/codebases/effect-v4/packages/effect/src/Resource.ts:25` defines `Resource` as a value loaded into memory that can be refreshed manually or by schedule.
  - `docs/codebases/effect-v4/packages/effect/src/Resource.ts:99` defines `Resource.manual`.
  - `docs/codebases/effect-v4/packages/effect/src/Resource.ts:128` defines `Resource.auto(acquire, policy)`.
  - `docs/codebases/effect-v4/packages/effect/src/Resource.ts:154` defines `Resource.get`.
  - `docs/codebases/effect-v4/packages/effect/src/Resource.ts:183` defines `Resource.refresh`.
- Effect nomenclature:
  - `Resource.manual`, `Resource.auto`, `Resource.get`, `Resource.refresh`.
  - `policy` is a `Schedule.Schedule`.
  - Stored state is an `Exit`.
- Flow State today:
  - Flow query resources expose actor-visible `status`, `fetchStatus`, `stale`, `failureCount`, `updatedAt`, `staleAt`, `gcAt`.
  - Query refresh/invalidation semantics are Flow-specific and event-producing.
- Opportunity:
  - Use `Resource` language for query-like long-lived values: manual refresh vs automatic refresh.
  - Consider implementing query resources internally as `Resource` when scoped cleanup and scheduled refresh are needed.
  - Borrow `refresh` as the public verb instead of inventing new invalidation/refetch verbs everywhere.
- Decision:
  - `adapt`.
- Migration notes:
  - Flow resources are visible state-machine snapshots; Effect `Resource` is an in-memory scoped value. Do not replace Flow snapshots wholesale.
  - Good fit for internals once runtime scope and Schedule support land.

## Finding: `DateTime.now` and `TestClock` make time testable without `Date.now`

- Evidence:
  - `docs/codebases/effect-v4/ai-docs/src/07_datetime/10_creating-and-formatting.ts:10` says `DateTime.now` gets current time from Effect's `Clock` service.
  - `docs/codebases/effect-v4/ai-docs/src/07_datetime/10_creating-and-formatting.ts:11` says this lets tests use `TestClock`.
  - `docs/codebases/effect-v4/ai-docs/src/07_datetime/10_creating-and-formatting.ts:18` shows `DateTime.make` returning `Option.Option<DateTime.Utc>`.
  - `docs/codebases/effect-v4/ai-docs/src/09_testing/10_effect-tests.ts:28` tests time with `TestClock`.
  - `docs/codebases/effect-v4/ai-docs/src/09_testing/10_effect-tests.ts:35` uses `TestClock.adjust(60_000)`.
- Effect nomenclature:
  - `DateTime.now`, `DateTime.make`, `DateTime.add`, `DateTime.formatIso`.
  - `TestClock.adjust`, `Effect.sleep`.
- Flow State today:
  - Flow reducers receive `runtime.now()`.
  - Example services use `Date.now()` in places.
  - `flowTest.advance` is present but currently not implemented.
- Opportunity:
  - Use `Clock`/`DateTime` inside Effect services and runtime internals.
  - Use `TestClock` to implement `flowTest.advance`.
  - Keep `runtime.now()` only for synchronous pure reducer slots, backed by the same clock in tests.
- Decision:
  - `adopt` in Effect code and tests.
  - `adapt` at pure reducer boundary.
- Migration notes:
  - Replace `Date.now()` in examples.
  - Add virtual-time tests for timers, stream sampling, and query refresh.

## Finding: Effect observability is layer-provided and uses logs, spans, annotations, and minimum log levels

- Evidence:
  - `docs/codebases/effect-v4/ai-docs/src/08_observability/10_logging.ts:10` creates `Logger.layer([Logger.consoleJson])`.
  - `docs/codebases/effect-v4/ai-docs/src/08_observability/10_logging.ts:13` sets `References.MinimumLogLevel`.
  - `docs/codebases/effect-v4/ai-docs/src/08_observability/10_logging.ts:28` uses `Logger.batched(..., { window: "1 second", flush })`.
  - `docs/codebases/effect-v4/ai-docs/src/08_observability/10_logging.ts:60` uses `Effect.annotateLogs`.
  - `docs/codebases/effect-v4/ai-docs/src/08_observability/10_logging.ts:65` uses `Effect.withLogSpan`.
  - `docs/codebases/effect-v4/ai-docs/src/08_observability/20_otlp-tracing.ts:36` composes an `ObservabilityLayer`.
  - `docs/codebases/effect-v4/ai-docs/src/08_observability/20_otlp-tracing.ts:54` uses `Effect.withSpan`.
  - `docs/codebases/effect-v4/ai-docs/src/08_observability/20_otlp-tracing.ts:55` uses `Effect.annotateSpans`.
  - `docs/codebases/effect-v4/ai-docs/src/08_observability/20_otlp-tracing.ts:81` uses `Layer.withSpan`.
- Effect nomenclature:
  - `Logger.layer`, `Logger.consoleJson`, `Logger.batched`, `References.MinimumLogLevel`.
  - `Effect.logDebug`, `logInfo`, `logWarning`, `logError`.
  - `Effect.annotateLogs`, `Effect.withLogSpan`, `Effect.withSpan`, `Effect.annotateSpans`, `Layer.withSpan`.
- Flow State today:
  - Flow has receipts/issues/devtools-oriented diagnostics, but not clear log/span integration language.
- Opportunity:
  - Receipts should complement, not replace, Effect logs/spans.
  - Wrap query/mutation/stream/timer work in spans using Effect names (`withSpan`, `annotateSpans`), and annotate logs with machine/resource IDs.
  - Runtime options should accept/provide observability Layers rather than bespoke callbacks where possible.
- Decision:
  - `adapt`.
- Migration notes:
  - Keep `inspect` callback for React/devtools snapshots, but use Effect observability for Effect execution internals.

## Finding: `Cause` preserves multiple typed failure reasons, defects, interruptions, and annotations

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Cause.ts:2` says `Cause` records the full reason an Effect failed.
  - `docs/codebases/effect-v4/packages/effect/src/Cause.ts:4` says it can contain typed failures, unexpected defects, interruptions, and annotations.
  - `docs/codebases/effect-v4/packages/effect/src/Cause.ts:51` exposes individual failure entries through `reasons`.
  - `docs/codebases/effect-v4/packages/effect/src/Cause.ts:55` names `hasFails`, `hasDies`, and `hasInterrupts`.
  - `docs/codebases/effect-v4/packages/effect/src/Cause.ts:77` defines `Cause` with `reasons`.
  - `docs/codebases/effect-v4/packages/effect/src/Cause.ts:125` defines `Fail.error`, `Die.defect`, and `Interrupt.fiberId`.
  - `packages/flow-state/src/index.ts:1314` collapses `Exit` into `failure`, `defect`, or `interrupt`.
- Effect nomenclature:
  - `Cause`, `Reason`, `reasons`, `Fail`, `Die`, `Interrupt`, `error`, `defect`, `fiberId`, annotations.
- Flow State today:
  - `FlowRuntimeIssue` stores a single `error` or `defect` and a simple `kind`.
  - `inspectEffectExit` finds first error/defect and otherwise returns interrupt.
- Opportunity:
  - Preserve `Cause` internally and optionally expose a serializable `reasons` projection on issues/receipts.
  - Avoid losing multiple failures, annotations, and interrupt fiber information.
- Decision:
  - `adapt`.
- Migration notes:
  - Public snapshots should remain serializable.
  - Tests should cover multiple reasons and interrupt metadata once execution can produce them.

## Finding: `PubSub` backpressure names are bounded, dropping, sliding, unbounded, with optional replay

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/PubSub.ts:2` describes broadcast from publishers to many subscribers.
  - `docs/codebases/effect-v4/packages/effect/src/PubSub.ts:6` says subscribers do not compete for messages.
  - `docs/codebases/effect-v4/packages/effect/src/PubSub.ts:7` names bounded, dropping, sliding, and unbounded hubs, plus replay buffers.
  - `docs/codebases/effect-v4/packages/effect/src/PubSub.ts:43` creates `PubSub.bounded<string>(10)`.
  - `docs/codebases/effect-v4/packages/effect/src/PubSub.ts:72` stores `strategy`.
  - `docs/codebases/effect-v4/packages/effect/src/PubSub.ts:90` stores `capacity`.
  - `docs/codebases/effect-v4/packages/effect/src/PubSub.ts:427` defines `PubSub.sliding`.
  - `docs/codebases/effect-v4/packages/effect/src/PubSub.ts:472` defines `PubSub.unbounded({ replay })`.
- Effect nomenclature:
  - `PubSub.bounded`, `PubSub.dropping`, `PubSub.sliding`, `PubSub.unbounded`, `capacity`, `replay`, `strategy`, `publish`, `subscribe`, `take`.
- Flow State today:
  - `FlowStreamPressure` has strategies `queue`, `coalesce-latest`, `drop`, and `sample`.
- Opportunity:
  - Rename/align stream pressure with Effect where semantics match: `bounded`, `dropping`, `sliding`, `unbounded`, `replay`.
  - Keep `coalesce-latest` only if it is truly different from `sliding(1)` plus keyed coalescing.
  - Implement controlled streams with `PubSub` when broadcast semantics are needed, or `Queue` when one consumer owns the stream.
- Decision:
  - `adapt`.
- Migration notes:
  - Stream examples should show which pressure semantics are Effect-native and which are Flow-specific product conveniences.

## Finding: `LayerMap` manages keyed service families with `idleTimeToLive`

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/LayerMap.ts:2` says it caches scoped services selected by key and built from layers.
  - `docs/codebases/effect-v4/packages/effect/src/LayerMap.ts:6` says entries can be invalidated or released after sitting unused.
  - `docs/codebases/effect-v4/packages/effect/src/LayerMap.ts:24` defines `idleTimeToLive` as `Duration.Input | ((key) => Duration.Input)`.
  - `docs/codebases/effect-v4/packages/effect/src/LayerMap.ts:80` exposes `get(key)`.
  - `docs/codebases/effect-v4/packages/effect/src/LayerMap.ts:85` exposes `contextEffect(key)`.
  - `docs/codebases/effect-v4/packages/effect/src/LayerMap.ts:90` exposes `invalidate(key)`.
  - `docs/codebases/effect-v4/packages/effect/src/LayerMap.ts:350` defines `LayerMap.Service`.
- Effect nomenclature:
  - `LayerMap`, `LayerMap.Service`, `lookup`, `layers`, `dependencies`, `idleTimeToLive`, `preloadKeys`, `preload`, `get`, `contextEffect`, `invalidate`.
- Flow State today:
  - Runtime options accept a single layer.
  - Examples contain tenant/workspace concepts, but runtime services are not keyed by tenant.
- Opportunity:
  - Use `LayerMap` for advanced keyed runtime services, such as tenant dashboards, workspace-scoped agent services, or environment-specific clients.
  - Do not invent `tenantLayerFactory`-style APIs if Effect already has this.
- Decision:
  - `defer`.
- Migration notes:
  - Strong candidate for a future multi-tenant or workspace example.
  - Too advanced for current core unless runtime service families become a requirement.

## Finding: Effect preserves success, error, and service channels in type helpers; Flow often erases services

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:92` defines `Effect<A, E, R>` as requiring context `R`, failing with `E`, succeeding with `A`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:194` extracts `Effect.Error<T>`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:211` extracts `Effect.Services<T>`.
  - `docs/codebases/effect-v4/packages/effect/src/Layer.ts:148` extracts `Layer.Services<T>`.
  - `docs/codebases/effect-v4/packages/effect/src/Layer.ts:165` extracts `Layer.Error<T>`.
  - `docs/codebases/effect-v4/packages/effect/src/Layer.ts:180` extracts `Layer.Success<T>`.
  - `docs/codebases/effect-v4/packages/effect/src/Request.ts:140` extracts `Request.Error<T>`.
  - `docs/codebases/effect-v4/packages/effect/src/Request.ts:162` extracts `Request.Success<T>`.
  - `docs/codebases/effect-v4/packages/effect/src/Request.ts:171` extracts `Request.Services<T>`.
- Effect nomenclature:
  - Generic order: `Effect<A, E, R>`, `Stream<A, E, R>`, `Request<A, E, R>`.
  - Extractors: `Success`, `Error`, `Services`.
- Flow State today:
  - `FlowQueryConfig.effect` returns `Effect.Effect<TValue, TFailure, unknown>`.
  - `FlowMutationConfig.effect` returns `Effect.Effect<TValue, TFailure, unknown>`.
  - `FlowStreamConfig` has `TServices`, but stream returns `AsyncIterable<TValue>`, so Effect service requirements are outside the stream type.
  - `FlowRuntimeOptions.layer` is not strongly tied to descriptor requirements.
- Opportunity:
  - Preserve Effect service requirements through Flow descriptors instead of forcing `unknown`.
  - Add Flow type helpers mirroring Effect's names only where helpful: `FlowSuccess<T>`, `FlowError<T>`, `FlowServices<T>`.
  - Let machines infer required layers from queries/mutations/streams if possible.
- Decision:
  - `adopt`.
- Migration notes:
  - Likely type-only break for descriptor generics.
  - Add type tests proving a service-requiring query cannot run without a compatible layer.

## Finding: `Context.Service` docs make service classes, static layers, and `Effect.fn` the default service boundary

- Evidence:
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/02_services/01_service.ts:4` says the default service definition is extending `Context.Service`.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/02_services/01_service.ts:13` defines `class Database extends Context.Service<Database, { ... }>()`.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/02_services/01_service.ts:16` says the string identifier should include package/subdirectory path.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/02_services/01_service.ts:22` attaches `static readonly layer`.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/02_services/01_service.ts:26` defines service methods using `Effect.fn`.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/02_services/01_service.ts:33` returns `Database.of({ query })`.
  - `docs/codebases/effect-v4/packages/effect/src/Context.ts:99` defines service helpers `of`, `context`, `use`, and `useSync`.
- Effect nomenclature:
  - `Context.Service`, `Service.of`, `Service.use`, `Service.useSync`, `static readonly layer`, service `key`.
- Flow State today:
  - Examples already define services with `Context.Service`, but Flow docs still present `createTestLayer` and runtime layer as Flow-specific conveniences.
- Opportunity:
  - Make Effect service classes the documented primary boundary for side effects.
  - Keep `createTestLayer` only as test convenience around real `Context.Service`.
  - Encourage service identifiers like `example/DashboardService` or package/path style.
- Decision:
  - `adopt`.
- Migration notes:
  - Update docs to show `Context.Service` first, Flow helper second.
  - Tighten `FlowRuntimeOptions.layer` typing.

## Finding: `Context.Reference`, `Config`, and `Layer.unwrap` are the Effect-native way to model runtime defaults and dynamic layer choice

- Evidence:
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/02_services/10_reference.ts:4` says `Context.Reference` is for configuration values, feature flags, or services with a default value.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/02_services/10_reference.ts:8` defines `Context.Reference<boolean>(..., { defaultValue })`.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/02_services/20_layer-unwrap.ts:4` says `Layer.unwrap` builds layers dynamically from an Effect or Config.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/02_services/20_layer-unwrap.ts:51` defines a static `layer = Layer.unwrap(Effect.gen(...))`.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/02_services/20_layer-unwrap.ts:54` reads `Config.boolean(...).pipe(Config.withDefault(false))`.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/02_services/20_layer-unwrap.ts:62` reads `Config.url`.
- Effect nomenclature:
  - `Context.Reference`, `defaultValue`, `Config.boolean`, `Config.url`, `Config.withDefault`, `Layer.unwrap`.
- Flow State today:
  - Runtime has ad hoc options such as `now`, `layer`, and inspection callbacks.
  - Test harness has `clock(now)` sugar.
- Opportunity:
  - Model runtime defaults and feature flags as `Context.Reference` where they live in Effect execution.
  - Keep simple Flow runtime options as ergonomic sugar that provide references/layers.
  - Use `Layer.unwrap` for environment-specific demo/test/prod service selection.
- Decision:
  - `adapt`.
- Migration notes:
  - Do not make basic Flow users write Config/Reference for simple examples.
  - Internals should converge on references and layers.

## Finding: `Effect.fn` is explicitly preferred over functions returning `Effect.gen`

- Evidence:
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/01_basics/02_effect-fn.ts:4` says to use `Effect.fn` when writing functions that return an Effect.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/01_basics/02_effect-fn.ts:7` says to avoid functions that return `Effect.gen`.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/01_basics/02_effect-fn.ts:13` says the string improves stack traces and attaches a tracing span.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/01_basics/02_effect-fn.ts:19` shows `Effect.fn.Return`.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/01_basics/02_effect-fn.ts:29` says not to use `.pipe` with `Effect.fn`; pass additional operations as arguments.
- Effect nomenclature:
  - `Effect.fn("Name")`, `Effect.fn.Return`, extra operation arguments, named spans.
- Flow State today:
  - Some examples use `Effect.fn`, but descriptors still allow anonymous `effect: () => Effect.gen(...)`.
- Opportunity:
  - Document named `Effect.fn` as the default for query/mutation/stream handlers and service methods.
  - Consider a lint/example convention: every external operation gets a named `Effect.fn`.
- Decision:
  - `adopt`.
- Migration notes:
  - No API break.
  - Rewrite examples to use names consistently.

## Finding: Effect has first-class reason-based errors beyond simple `_tag` matching

- Evidence:
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/03_errors/20_reason-errors.ts:4` says define a tagged error with a tagged `reason` field.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/03_errors/20_reason-errors.ts:23` defines `AiError` with `reason: Schema.Union([...])`.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/03_errors/20_reason-errors.ts:31` uses `Effect.catchReason`.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/03_errors/20_reason-errors.ts:44` uses `Effect.catchReasons`.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/03_errors/20_reason-errors.ts:58` uses `Effect.unwrapReason`.
  - `docs/codebases/effect-v4/ai-docs/src/01_effect/03_errors/10_catch-tags.ts:20` uses `Effect.catchTags`.
- Effect nomenclature:
  - `_tag`, `reason`, `catchTag`, `catchTags`, `catchReason`, `catchReasons`, `unwrapReason`.
- Flow State today:
  - `FlowAsyncRoutes` has `success`, `failure`, `defect`, `interrupt`.
  - Examples hand-roll `_tag` error unions.
- Opportunity:
  - Preserve Flow's four outcome lanes, but let `failure` routes and issue views branch by `catchTags`/`catchReason` patterns.
  - For complex failure domains, prefer a parent error with a `reason` union over many unrelated error classes.
- Decision:
  - `adapt`.
- Migration notes:
  - Add docs examples for simple tagged failures and reason-based failures.

## Finding: `Schema.TaggedClass`, `Schema.TaggedErrorClass`, and `Data.taggedEnum` can replace manual tagged unions in examples

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Schema.ts:12727` defines `Schema.TaggedClass`.
  - `docs/codebases/effect-v4/packages/effect/src/Schema.ts:12762` defines schema-backed yieldable error classes.
  - `docs/codebases/effect-v4/packages/effect/src/Schema.ts:12818` says `TaggedErrorClass` creates typed errors that are schema validated, yielded in `Effect.gen`, and matched as tagged union members.
  - `docs/codebases/effect-v4/packages/effect/src/Data.ts:398` shows `Data.taggedEnum` constructor/matcher helpers, including `$is` and `$match`.
  - `examples/project-editor/src/projectFlow.ts:43` manually defines `_tag` interfaces and `Schema.TaggedStruct` schemas separately.
- Effect nomenclature:
  - `Schema.TaggedClass`, `Schema.ErrorClass`, `Schema.TaggedErrorClass`, `Data.taggedEnum`, `$is`, `$match`.
- Flow State today:
  - Examples often duplicate interface union plus schema value.
- Opportunity:
  - Use `Schema.TaggedErrorClass` for domain failures.
  - Use `Schema.TaggedClass` or `Data.taggedEnum` when examples need constructors/matchers.
  - Keep plain unions in the simplest examples only.
- Decision:
  - `adopt` in advanced examples and docs.
- Migration notes:
  - Project Editor and Cached Dashboard are good first replacements.
  - Add tests that yielded tagged errors route correctly.

## Finding: `Queue` pressure strategies are `suspend`, `dropping`, and `sliding`

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Queue.ts:400` says `Queue` has optional capacity and overflow strategy.
  - `docs/codebases/effect-v4/packages/effect/src/Queue.ts:404` says default is unbounded and `"suspend"`.
  - `docs/codebases/effect-v4/packages/effect/src/Queue.ts:405` says bounded queues choose `"suspend"`, `"dropping"`, or `"sliding"`.
  - `docs/codebases/effect-v4/packages/effect/src/Queue.ts:441` defines `Queue.make({ capacity, strategy })`.
- Effect nomenclature:
  - `Queue.make`, `capacity`, `strategy`, `"suspend"`, `"dropping"`, `"sliding"`, `offer`, `take`, `end`, `fail`.
- Flow State today:
  - Stream pressure uses `"queue"`, `"coalesce-latest"`, `"drop"`, and `"sample"`.
- Opportunity:
  - Align pressure naming with `Queue`/`PubSub`: `suspend`, `dropping`, `sliding`, `capacity`.
  - `sample` remains Schedule-based, not queue overflow.
  - `coalesce-latest` can either be Flow sugar or expressed as keyed sliding/coalescing.
- Decision:
  - `adapt`.
- Migration notes:
  - Provide aliases during transition if examples already use old names.

## Finding: Effect examples use `Schema.Redacted`, `Redacted`, and `Config.redacted` for sensitive values

- Evidence:
  - `docs/codebases/effect-examples/examples/http-server/src/Domain/AccessToken.ts:3` brands `AccessTokenString`.
  - `docs/codebases/effect-examples/examples/http-server/src/Domain/AccessToken.ts:4` defines `AccessToken = Schema.Redacted(AccessTokenString)`.
  - `docs/codebases/effect-examples/examples/http-server/src/Domain/AccessToken.ts:7` constructs with `Redacted.make(...)`.
  - `docs/codebases/effect-examples/examples/http-server/src/Tracing.ts:8` reads `Config.redacted("HONEYCOMB_API_KEY")`.
  - `docs/codebases/effect-examples/examples/http-server/src/Tracing.ts:31` unwraps with `Redacted.value` only to build external HTTP headers.
  - `packages/flow-state/src/index.ts:853` exposes generic trace redaction callbacks.
- Effect nomenclature:
  - `Schema.Redacted`, `Redacted.make`, `Redacted.value`, `Config.redacted`.
- Flow State today:
  - Flow traces support redaction callbacks but examples store sensitive-ish values as normal strings/metadata.
- Opportunity:
  - Use `Redacted` for sensitive domain values in Checkout and Agent Workspace examples.
  - Keep Flow trace redaction callbacks as a broad safety net, but teach typed redaction at domain boundaries.
  - State that `Redacted.value` belongs only at I/O boundaries.
- Decision:
  - `adopt`.
- Migration notes:
  - Add one example with `Schema.Redacted` and trace capture proving redacted values do not leak.

## Finding: Effect examples use partial test layers with fail-fast unimplemented methods

- Evidence:
  - `docs/codebases/effect-examples/examples/http-server/src/lib/Layer.ts:4` creates `Effect.die` for unimplemented methods.
  - `docs/codebases/effect-examples/examples/http-server/src/lib/Layer.ts:14` builds a proxy over a partial service.
  - `docs/codebases/effect-examples/examples/http-server/src/lib/Layer.ts:28` defines `makeTestLayer(tag)(Partial<S>)`.
  - `packages/flow-state/src/index.ts:1171` defines `createTestLayer(service, implementation)` requiring a complete implementation.
- Effect nomenclature:
  - `Layer.succeed`, `Effect.die`, partial service fakes.
- Flow State today:
  - Flow test layers require full service implementation, so examples add placeholder methods even when a test uses one method.
- Opportunity:
  - Add `createPartialTestLayer` or overload `createTestLayer` to accept `Partial<T>` and fail fast on unimplemented methods.
  - Keep typing stricter than the upstream example's `as any` proxy where possible.
- Decision:
  - `adapt`.
- Migration notes:
  - Test missing method calls die as defects, not typed failures.
  - Update docs to distinguish full fake vs partial fake.

## Finding: Direct Effect service tests and Flow scenario tests should coexist

- Evidence:
  - `docs/codebases/effect-examples/examples/http-server/test/Accounts.test.ts:14` uses `it.effect`.
  - `docs/codebases/effect-examples/examples/http-server/test/Accounts.test.ts:25` provides layers directly with `Effect.provide`.
  - `docs/codebases/effect-examples/examples/http-server/test/Accounts.test.ts:27` composes test layers around `Accounts.Test`.
  - `docs/codebases/effect-examples/examples/http-server/test/Accounts.test.ts:31` uses `Effect.map(DateTime.now, ...)`.
  - `examples/project-editor/src/projectFlow.test.ts:21` builds a Flow harness with `flowTest(...).provide(...)`.
  - `examples/project-editor/src/projectFlow.test.ts:150` already verifies typed failure and defect routing through Flow.
- Effect nomenclature:
  - `it.effect`, `Effect.gen`, `Effect.provide`, `Layer.provide`, `DateTime.now`.
- Flow State today:
  - Flow examples emphasize machine scenario tests, but service-level smoke tests are less explicit.
- Opportunity:
  - Keep `flowTest` as the primary machine API.
  - Add direct Effect service tests where the example is about service/layer ergonomics.
  - Use service tests to prove schemas, redaction, layers, and typed errors before Flow routes consume them.
- Decision:
  - `adapt`.
- Migration notes:
  - Docs should show both test styles in advanced examples.

## Finding: Effect examples compose layers explicitly with `Layer.provide`, `Layer.provideMerge`, and platform layers

- Evidence:
  - `docs/codebases/effect-examples/examples/http-server/src/Http.ts:10` provides multiple HTTP route layers into `HttpApiBuilder.api`.
  - `docs/codebases/effect-examples/examples/http-server/src/Http.ts:16` chains `Layer.provide` for swagger, OpenAPI, CORS, API live, and Node server.
  - `docs/codebases/effect-examples/examples/http-server/src/Sql.ts:16` provides `NodeContext.layer`.
  - `docs/codebases/effect-examples/examples/http-server/src/Sql.ts:18` uses `Layer.provideMerge(ClientLive)`.
- Effect nomenclature:
  - `Layer.provide`, `Layer.provideMerge`, platform layers, composed live/test layers.
- Flow State today:
  - Runtime accepts one layer-like value and examples often provide one test layer.
- Opportunity:
  - Teach users to compose service layers with Effect before giving them to Flow runtime/harness.
  - Tighten runtime layer typing so composed layers preserve errors/services.
- Decision:
  - `adopt`.
- Migration notes:
  - Add docs examples with `Layer.mergeAll` or `Layer.provideMerge` for multi-service examples.

## Finding: Effect example policy encoding is conceptually useful but too cast-heavy to inherit literally

- Evidence:
  - `docs/codebases/effect-examples/examples/http-server/src/Domain/Policy.ts:6` defines `Unauthorized` as a tagged error.
  - `docs/codebases/effect-examples/examples/http-server/src/Domain/Policy.ts:47` brands `AuthorizedActor<Entity, Action>`.
  - `docs/codebases/effect-examples/examples/http-server/src/Domain/Policy.ts:56` defines `policy`.
  - `docs/codebases/effect-examples/examples/http-server/src/Domain/Policy.ts:77` defines `policyCompose`.
  - `docs/codebases/effect-examples/examples/http-server/src/Domain/Policy.ts:84` defines `policyUse`.
  - `docs/codebases/effect-examples/examples/http-server/src/Domain/Policy.ts:40`, `:54`, `:82`, `:89`, and `:101` use casts.
- Effect nomenclature:
  - `Unauthorized`, `policy`, `policyCompose`, `policyUse`, `AuthorizedActor`.
- Flow State today:
  - Checkout has explicit `permissions`, `invariants`, and `FlowPermissionDecision`.
- Opportunity:
  - Keep Flow permission descriptors explicit and inspectable.
  - Use typed `Unauthorized`/permission failures where effects need to fail.
  - Avoid phantom capability encoding until the type story is clean without casts.
- Decision:
  - `avoid` literal pattern, `adapt` concept.
- Migration notes:
  - Checkout/approval should model permission decisions as Flow descriptors and tagged failures, not upstream's cast-heavy capability type.

## Finding: `Record` already solves finite record mapping, collecting, safe lookup, and safe modification

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:45` defines `ReadonlyRecord<K, A>`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:67` includes helper types for finite/literal keys.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:283` defines `Record.fromIterableBy`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:310` defines `Record.fromEntries`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:333` defines `Record.collect`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:435` defines `Record.get` returning `Option`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:464` defines `Record.modify` returning `Option`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:733` defines `Record.filterMap`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:824` defines `Record.getSomes`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:862` defines `Record.getFailures`.
- Effect nomenclature:
  - `ReadonlyRecord`, `fromIterableBy`, `fromEntries`, `collect`, `toEntries`, `get`, `modify`, `filterMap`, `getSomes`, `getFailures`, `getSuccesses`.
- Flow State today:
  - Cached Dashboard has a hand-written `mapPanels` helper and manual panel array construction.
  - Flow snapshots use many readonly records keyed by resource/mutation/stream/timer IDs.
- Opportunity:
  - Remove example-local record helpers in favor of `Record.map`, `Record.collect`, `Record.modify`, and `Record.get`.
  - Use `Record.getSomes` / `getFailures` for views over optional/result-shaped resource state.
  - Preserve finite key types for panel IDs rather than widening everything to `string`.
- Decision:
  - `adopt`.
- Migration notes:
  - Cached Dashboard is the first replacement target.
  - Add type tests if finite key preservation is important to examples.

## Finding: `Option` is Effect's explicit boundary for absence, including nullish conversion helpers

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Option.ts:2` says `Option` models present or absent values instead of relying on `null` or `undefined`.
  - `docs/codebases/effect-v4/packages/effect/src/Option.ts:8` mentions `Option.gen`.
  - `docs/codebases/effect-v4/packages/effect/src/Option.ts:54` defines `Option<A> = None<A> | Some<A>`.
  - `docs/codebases/effect-v4/packages/effect/src/Option.ts:550` converts `Result` success to `Option`.
  - `docs/codebases/effect-v4/packages/effect/src/Option.ts:582` converts `Result` failure to `Option`.
  - `docs/codebases/effect-v4/packages/effect/src/Option.ts:774` defines `firstSomeOf`.
  - `docs/codebases/effect-v4/packages/effect/src/Option.ts:899` defines `fromNullOr`.
  - `docs/codebases/effect-v4/packages/effect/src/Option.ts:941` defines `liftNullishOr`.
- Effect nomenclature:
  - `Option.Option`, `Some`, `None`, `some`, `none`, `match`, `fromNullishOr`, `fromNullOr`, `fromUndefinedOr`, `liftNullishOr`, `firstSomeOf`, `getSuccess`, `getFailure`.
- Flow State today:
  - Machine context and mutation input use `null` for absence.
  - Examples often branch manually on `null`.
- Opportunity:
  - Accept `Option` at API boundaries like mutation input and optional descriptors.
  - Use `Option` internally in service/effect helpers and selectors.
  - Convert to `null` at React/JSON/persistence boundaries when that keeps UI context simple.
- Decision:
  - `adapt`.
- Migration notes:
  - Add API normalization from `Option | null | undefined`.
  - Keep user-facing context examples readable; do not force `Option` into every React render branch.

## Finding: `Array` tracks non-empty arrays and safe element operations with `Option`

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:2` says helpers cover creating, reading, transforming, sorting, grouping, splitting, combining, and reducing arrays.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:62` defines `NonEmptyReadonlyArray`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:1085` defines `Array.head` returning `Option`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:1109` defines `Array.headNonEmpty`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:1134` defines `Array.last`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:1508` defines `Array.drop`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:1880` defines safe `Array.insertAt`.
- Effect nomenclature:
  - `NonEmptyReadonlyArray`, `head`, `headNonEmpty`, `last`, `drop`, `dropRight`, `insertAt`, `replace`, `modify`.
- Flow State today:
  - Events, transitions, receipts, and examples use readonly arrays but rarely encode non-empty requirements.
- Opportunity:
  - Use `NonEmptyReadonlyArray` where Flow descriptors require at least one state/route/tag/transition.
  - Use safe `Array` helpers in examples instead of unchecked `[0]` or custom guards.
- Decision:
  - `adopt` selectively.
- Migration notes:
  - Do not over-type simple examples.
  - Useful for APIs where empty arrays are invalid by contract.

## Finding: Effect has `Hash`, `Equal`, and `PrimaryKey` protocols for stable identity and keying

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Hash.ts:2` says hashes are small numeric fingerprints for Effect data structures, not cryptographic digests.
  - `docs/codebases/effect-v4/packages/effect/src/Hash.ts:65` defines the `Hash` interface.
  - `docs/codebases/effect-v4/packages/effect/src/Hash.ts:85` warns mutable objects after hashing can break hash-based operations.
  - `docs/codebases/effect-v4/packages/effect/src/Equal.ts:2` says `equals` compares structural values and Equal implementors.
  - `docs/codebases/effect-v4/packages/effect/src/Equal.ts:55` defines the `Equal` interface extending `Hash`.
  - `docs/codebases/effect-v4/packages/effect/src/PrimaryKey.ts:2` defines a stable string-based identifier protocol.
  - `docs/codebases/effect-v4/packages/effect/src/PrimaryKey.ts:62` defines `PrimaryKey`.
  - `docs/codebases/effect-v4/packages/effect/src/PrimaryKey.ts:87` defines `isPrimaryKey`.
- Effect nomenclature:
  - `Hash.Hash`, `Hash.symbol`, `Hash.hash`, `Equal.Equal`, `Equal.symbol`, `Equal.equals`, `PrimaryKey.PrimaryKey`, `PrimaryKey.symbol`, `PrimaryKey.value`.
- Flow State today:
  - `createKey(...parts)` hashes with `JSON.stringify(parts)`.
- Opportunity:
  - Decide whether Flow keys are strictly serializable display keys or can accept Effect hash/equal/primary-key values.
  - If accepting domain objects, use `PrimaryKey` for display/persistence and `Hash`/`Equal` for runtime maps.
  - Keep JSON-stable hashes for devtools and trace serialization.
- Decision:
  - `adapt`.
- Migration notes:
  - Do not silently change key equality semantics.
  - Add docs explaining serializable keys vs Effect identity protocols.

## Finding: `Ref`, `SynchronizedRef`, and `ScopedRef` cover runtime state, serialized updates, and replaceable resources

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Ref.ts:2` says `Ref` stores fiber-safe mutable state.
  - `docs/codebases/effect-v4/packages/effect/src/Ref.ts:4` says reads, writes, and atomic transformations are effects.
  - `docs/codebases/effect-v4/packages/effect/src/SynchronizedRef.ts:2` says updates run one at a time.
  - `docs/codebases/effect-v4/packages/effect/src/SynchronizedRef.ts:23` says effectful transformations are serialized with an internal semaphore.
  - `docs/codebases/effect-v4/packages/effect/src/ScopedRef.ts:2` says it stores a current value together with the scope that owns it.
  - `docs/codebases/effect-v4/packages/effect/src/ScopedRef.ts:5` says replacing the value releases resources owned by the previous value.
  - `docs/codebases/effect-v4/packages/effect/src/ScopedRef.ts:75` creates a `ScopedRef` from an acquiring effect.
- Effect nomenclature:
  - `Ref.make`, `Ref.get`, `Ref.set`, `Ref.update`.
  - `SynchronizedRef`, serialized effectful updates.
  - `ScopedRef.fromAcquire`, `ScopedRef.get`, `ScopedRef.set`.
- Flow State today:
  - Actor snapshots and runtime resources are stored in class fields and plain objects.
  - Query resources and service layers do not yet have scoped replacement semantics.
- Opportunity:
  - Use `Ref`/`SynchronizedRef` internally where runtime state is mutated from concurrent Effect fibers.
  - Use `ScopedRef` for replaceable service/resource values that require cleanup.
  - Keep public Flow snapshots immutable and serializable.
- Decision:
  - `adapt`.
- Migration notes:
  - Internal runtime refactor only; avoid leaking Ref into simple app APIs.
  - Add concurrency tests around simultaneous query/mutation completions.

## Finding: `Deferred` and `Latch` cover controlled effect/stream testing and coordination

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Deferred.ts:2` says a `Deferred` starts empty and completes exactly once with success, failure, defect, or interruption.
  - `docs/codebases/effect-v4/packages/effect/src/Deferred.ts:25` says any number of fibers can await it.
  - `docs/codebases/effect-v4/packages/effect/src/Deferred.ts:71` defines `Deferred<A, E>`.
  - `docs/codebases/effect-v4/packages/effect/src/Latch.ts:2` says a latch is open or closed and can suspend waiters.
  - `docs/codebases/effect-v4/packages/effect/src/Latch.ts:60` exposes `open`.
  - `docs/codebases/effect-v4/packages/effect/src/Latch.ts:78` exposes `release`.
  - `docs/codebases/effect-v4/packages/effect/src/Latch.ts:87` exposes `await`.
  - `docs/codebases/effect-v4/packages/effect/src/Latch.ts:115` gates an effect with `whenOpen`.
- Effect nomenclature:
  - `Deferred.make`, `Deferred.await`, `Deferred.succeed`, `Deferred.fail`, `Deferred.die`, `Deferred.interrupt`.
  - `Latch.make`, `open`, `release`, `await`, `close`, `whenOpen`.
- Flow State today:
  - `createControlledEffect` already uses `Deferred` internally.
  - Controlled streams and test gates can still become more Effect-native.
- Opportunity:
  - Keep controlled effects based on `Deferred`.
  - Use `Latch` for tests that need explicit “started but not completed” synchronization without sleeps.
  - Use these primitives in examples instead of ad hoc promises.
- Decision:
  - `adopt` internally/test helpers.
- Migration notes:
  - Docs can mention semantics without exposing all primitives.

## Finding: `FiberSet`, `FiberMap`, and `FiberHandle` match Flow's runtime ownership shapes

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/FiberSet.ts:2` manages many fibers together inside one scope.
  - `docs/codebases/effect-v4/packages/effect/src/FiberSet.ts:5` interrupts all running fibers when the owning scope closes.
  - `docs/codebases/effect-v4/packages/effect/src/FiberMap.ts:2` manages fibers by key inside a scope.
  - `docs/codebases/effect-v4/packages/effect/src/FiberMap.ts:6` starts, replaces, joins, or interrupts background work by stable key.
  - `docs/codebases/effect-v4/packages/effect/src/FiberHandle.ts:2` manages at most one fiber inside a scope.
  - `docs/codebases/effect-v4/packages/effect/src/FiberHandle.ts:5` interrupts the previous fiber when installing a new one unless configured otherwise.
- Effect nomenclature:
  - `FiberSet`, `FiberMap`, `FiberHandle`, `run`, `join`, `awaitEmpty`, `clear`, `interrupt`, `onlyIfMissing`.
- Flow State today:
  - Flow tracks running query/mutation/stream/timer/child work by IDs and request IDs.
  - Cancellation/interruption semantics are important but currently modeled in Flow classes.
- Opportunity:
  - Use `FiberMap` for resources keyed by query/stream/timer/child IDs.
  - Use `FiberHandle` for single-slot work such as reject/replace concurrency policies.
  - Use `FiberSet` for all actor-owned background fibers.
- Decision:
  - `adapt`.
- Migration notes:
  - Internal runtime ownership improvement; public API should still expose Flow snapshots and receipts.
  - Add disposal tests proving scope close interrupts owned work.

## Finding: `Semaphore`, `Pool`, and `Scope` are Effect's resource-concurrency vocabulary

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Semaphore.ts:2` limits how many effects use a shared resource at once.
  - `docs/codebases/effect-v4/packages/effect/src/Semaphore.ts:80` exposes `withPermits`.
  - `docs/codebases/effect-v4/packages/effect/src/Semaphore.ts:97` exposes `withPermit`.
  - `docs/codebases/effect-v4/packages/effect/src/Semaphore.ts:115` exposes `withPermitsIfAvailable`.
  - `docs/codebases/effect-v4/packages/effect/src/Pool.ts:2` shares scoped resources across fibers.
  - `docs/codebases/effect-v4/packages/effect/src/Pool.ts:76` defines config fields `acquire`, `concurrency`, `minSize`, `maxSize`, `strategy`, and `targetUtilization`.
  - `docs/codebases/effect-v4/packages/effect/src/Scope.ts:2` says scope controls how long resources stay open.
  - `docs/codebases/effect-v4/packages/effect/src/Scope.ts:49` has finalization strategies `sequential` and `parallel`.
- Effect nomenclature:
  - `Semaphore.withPermits`, `withPermit`, `withPermitsIfAvailable`.
  - `Pool.make`, `makeWithTTL`, `get`, `invalidate`, `minSize`, `maxSize`, `targetUtilization`.
  - `Scope`, `Closeable`, `addFinalizer`, `close`, finalization `strategy`.
- Flow State today:
  - Mutation concurrency has `"reject-while-running" | "allow"`.
  - Runtime disposal/finalizer behavior is still under-specified.
- Opportunity:
  - Model concurrency policies internally with `Semaphore`.
  - Avoid exposing pools in core API until a resource-pool use case appears.
  - Use `Scope` explicitly for runtime/actor lifecycle and finalizers.
- Decision:
  - `adapt`.
- Migration notes:
  - Potential future API rename from `concurrency: "reject-while-running"` to Effect-like permit semantics only if simpler.
  - For now, keep Flow's product-friendly concurrency labels.

## Finding: `KeyValueStore` is Effect's minimal durable storage boundary

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:38` defines `KeyValueStore`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:43` exposes `get(key)`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:51` exposes `set(key, value)`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:56` exposes `remove(key)`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:61` exposes `clear`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:66` exposes `size`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:71` exposes `modify(key, f)`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:87` exposes `has(key)`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/KeyValueStore.ts:92` exposes `isEmpty`.
- Effect nomenclature:
  - `KeyValueStore`, `KeyValueStoreError`, `get`, `set`, `remove`, `clear`, `size`, `modify`, `has`, `isEmpty`.
  - Byte/string split: `getUint8Array`, `modifyUint8Array`.
- Flow State today:
  - `FlowWorkflowPersistenceConfig` and receipt/history ideas are Flow-specific and not yet backed by an Effect storage service.
- Opportunity:
  - Model Flow persistence adapters as an Effect service compatible with the `KeyValueStore` shape before inventing SQL/Redis-specific APIs.
  - Use prefixed keys for actor IDs, resources, receipts, and workflow runs.
  - Keep persistence optional and unstable until replay/hydration semantics are proven.
- Decision:
  - `adapt`.
- Migration notes:
  - Do not leak unstable Effect persistence as a stable Flow promise yet.
  - A Flow persistence facade should preserve `KeyValueStore` method names if it is just key-value storage.

## Finding: `Persistable` and `PersistedCache` pair schema, primary keys, cached `Exit`, and TTL

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/Persistable.ts:141` defines `Persistable.Class`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/Persistable.ts:153` requires `primaryKey(payload)`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/Persistable.ts:154` accepts `success` and `error` schemas.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/Persistable.ts:190` installs `PrimaryKey.symbol`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/Persistable.ts:199` returns a `Schema.Exit`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedCache.ts:57` defines `PersistedCache.make(lookup, options)`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedCache.ts:63` uses `storeId`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedCache.ts:64` uses `timeToLive`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedCache.ts:65` uses `inMemoryCapacity`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedCache.ts:66` uses `inMemoryTTL`.
- Effect nomenclature:
  - `Persistable.Class`, `primaryKey`, `success`, `error`, `Request`, `PrimaryKey`.
  - `PersistedCache.make`, `storeId`, `timeToLive`, `inMemoryCapacity`, `inMemoryTTL`, persisted `Exit`.
- Flow State today:
  - Query keys are serial strings and cache policy is in Flow-specific `staleTime`/`gcTime` style.
  - Cached Dashboard is contract-first and can choose stronger names now.
- Opportunity:
  - If Flow adds persisted resource caches, reuse `primaryKey`, `success`, `error`, `storeId`, and `timeToLive` vocabulary.
  - Consider storing typed `Exit` for cached failures instead of treating failures as out-of-band state.
  - Keep UI freshness semantics separate from persisted cache TTL.
- Decision:
  - `defer` implementation, `adopt` nomenclature where persistence enters the API.
- Migration notes:
  - Do not ship persistent cache in the current examples unless the storage/replay behavior is testable.
  - Update TODO to reserve `staleAfter` for UI freshness and `timeToLive` for cached entry expiry.

## Finding: `Rpc` / `RpcGroup` are schema-first remote contracts with payload, success, error, defect, stream, and primaryKey

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:72` defines `Rpc<Tag, Payload, Success, Error, Middleware, Requires>`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:82` exposes `_tag` and `key`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:84` exposes `payloadSchema`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:85` exposes `successSchema`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:86` exposes `errorSchema`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:87` exposes `defectSchema`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:106` defines `setPayload`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:130` defines `prefix`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:889` creates `Rpc.make(tag, options)`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:905` accepts `payload`, `success`, `error`, `defect`, `stream`, and `primaryKey`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcGroup.ts:35` defines `RpcGroup`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcGroup.ts:45` defines `add`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcGroup.ts:52` defines `merge`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcGroup.ts:58` defines `omit`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcGroup.ts:70` defines `prefix`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcGroup.ts:77` defines `toHandlers`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcGroup.ts:97` defines `toLayer`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcGroup.ts:140` defines `accessHandler`.
- Effect nomenclature:
  - `Rpc.make`, `RpcGroup`, `_tag`, `key`, `payloadSchema`, `successSchema`, `errorSchema`, `defectSchema`.
  - Options: `payload`, `success`, `error`, `defect`, `stream`, `primaryKey`.
  - Group combinators: `add`, `merge`, `omit`, `middleware`, `prefix`, `toHandlers`, `toLayer`, `toLayerHandler`, `accessHandler`.
- Flow State today:
  - Flow examples model APIs as services with query/mutation descriptors; remote contracts are not first-class.
- Opportunity:
  - For any future client/server Flow example, prefer schema-first Effect RPC or HTTP API contracts over bespoke fetch callback descriptors.
  - Keep Flow descriptors focused on state-machine orchestration; let RPC describe remote payload/success/error/stream contracts.
  - Borrow `payload`, `success`, `error`, `defect`, and `primaryKey` names for async descriptors that mirror remote contracts.
- Decision:
  - `adapt`.
- Migration notes:
  - RPC is unstable in Effect v4, so examples should use the pattern only if explicitly framed as advanced/unstable.
  - Current examples can still use services, but field names should align with RPC/HTTP schema names.

## Finding: `Workflow`, `Activity`, and `DurableClock` define durable execution terms Flow should not casually rename

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:45` defines `Workflow<Tag, Payload, Success, Error>`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:54` exposes `_tag`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:55` exposes `payloadSchema`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:56` exposes `successSchema`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:57` exposes `errorSchema`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:59` exposes `idempotencyKey`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:60` exposes `suspendedRetrySchedule`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:76` defines `execute`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:91` defines `poll`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:101` defines `interrupt`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:109` defines `resume`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:143` defines `executionId`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:152` defines `withCompensation`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Activity.ts:123` defines `Activity.make`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Activity.ts:126` accepts `name`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Activity.ts:129` accepts `execute`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Activity.ts:130` accepts `interruptRetryPolicy`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Activity.ts:156` exposes `executeEncoded`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/DurableClock.ts:70` defines `sleep({ name, duration, inMemoryThreshold })`.
- Effect nomenclature:
  - `Workflow`, `Activity`, `WorkflowEngine`, `WorkflowInstance`, `idempotencyKey`, `executionId`.
  - Verbs: `execute`, `poll`, `interrupt`, `resume`, `withCompensation`.
  - Timer fields: `name`, `duration`, `inMemoryThreshold`.
- Flow State today:
  - Existing nested workflow and approval/checkout examples use Flow machine terminology and a draft persistence config.
- Opportunity:
  - Do not call Flow machines "durable workflows" unless they provide durable execution, polling, resumption, and compensation semantics.
  - For Checkout/Approval, borrow only the terms that are semantically true: `idempotencyKey`, `interrupt`, `resume`, `executionId`.
  - If Flow later wraps Effect Workflow, keep Effect field names rather than inventing `workflowKey`/`jobId` aliases.
- Decision:
  - `defer` implementation, `adopt` nomenclature for durable claims.
- Migration notes:
  - Current examples should remain contract-first and avoid implying real durable execution.
  - Add a docs caveat if using workflow-shaped words before implementing durable storage/replay.

## Finding: Effect reactivity uses atoms, registries, idle TTL, subscriptions, and hydration state

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/Atom.ts:60` defines `Atom<A>`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/Atom.ts:64` exposes `keepAlive`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/Atom.ts:65` exposes `lazy`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/Atom.ts:66` exposes `read`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/Atom.ts:67` exposes `refresh`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/Atom.ts:69` exposes `idleTTL`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/AtomRegistry.ts:64` defines `AtomRegistry`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/AtomRegistry.ts:68` defines `get`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/AtomRegistry.ts:69` defines `mount`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/AtomRegistry.ts:70` defines `refresh`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/AtomRegistry.ts:74` defines `subscribe`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/Hydration.ts:39` defines `DehydratedAtomValue`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/Hydration.ts:42` stores `dehydratedAt`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/Hydration.ts:47` says only serializable atoms are encoded.
- Effect nomenclature:
  - `Atom`, `AtomRegistry`, `keepAlive`, `lazy`, `read`, `refresh`, `idleTTL`, `mount`, `subscribe`, `setSerializable`, `dehydratedAt`.
- Flow State today:
  - Flow resource snapshots and runtime inspection are separate from Effect's reactive atom system.
- Opportunity:
  - Borrow `idleTTL`, `refresh`, `subscribe`, `dehydrate`/`hydrate`, and `dehydratedAt` names where Flow needs resource snapshot hydration.
  - Do not adopt Atom as the public Flow resource model while it is unstable and not state-machine-oriented.
  - Treat Flow actors as higher-level orchestration over Effect runtime/reactivity, not a replacement for all atom semantics.
- Decision:
  - `adapt`.
- Migration notes:
  - If cached dashboard needs hydration, use `dehydratedAt` rather than ad hoc `savedAt`.
  - Avoid promising atom compatibility in Flow API until a real bridge exists.

## Finding: `HttpApi` / `HttpApiGroup` / `HttpApiEndpoint` are schema-first HTTP contracts

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:106` defines `HttpApiEndpoint`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:123` exposes `name`, `path`, and `method`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:126` exposes `query`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:128` exposes `payload`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:129` exposes `success`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:130` exposes `error`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:1128` defines endpoint constructors by method.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts:1141` accepts `params`, `query`, `headers`, `payload`, `success`, and `error`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiGroup.ts:373` defines `HttpApiGroup.make(identifier, options)`.
  - `docs/codebases/effect-examples/templates/monorepo/packages/domain/src/TodosApi.ts:21` defines `TodosApiGroup extends HttpApiGroup.make("todos")`.
  - `docs/codebases/effect-examples/templates/monorepo/packages/domain/src/TodosApi.ts:22` adds `HttpApiEndpoint.get("getAllTodos", "/todos").addSuccess(...)`.
  - `docs/codebases/effect-examples/templates/monorepo/packages/domain/src/TodosApi.ts:30` adds a post endpoint with `.setPayload(...)`.
  - `docs/codebases/effect-examples/templates/monorepo/packages/domain/src/TodosApi.ts:47` defines `TodosApi extends HttpApi.make("api").add(TodosApiGroup)`.
- Effect nomenclature:
  - `HttpApi`, `HttpApiGroup`, `HttpApiEndpoint`.
  - Endpoint fields: `name`, `path`, `method`, `params`, `query`, `headers`, `payload`, `success`, `error`, `middlewares`, `annotations`.
  - Builders: `add`, `addSuccess`, `addError`, `setPath`, `setPayload`.
- Flow State today:
  - Example APIs are service classes and descriptors, not HTTP contract definitions.
- Opportunity:
  - For examples that are explicitly frontend state machines, keep service classes.
  - For examples that imply an HTTP boundary, define the remote contract with `HttpApi` and let Flow consume a client service.
  - Align Flow async descriptor naming with `payload`, `success`, and `error` where it mirrors a request.
- Decision:
  - `adapt`.
- Migration notes:
  - HTTP API is currently under `unstable` in Effect v4; use it only in docs/examples that accept that dependency.
  - Avoid duplicating endpoint schema contracts inside Flow descriptors.

## Finding: SQL examples use `SqlClient`, repositories, schema-aware queries, transactions, and spans

- Evidence:
  - `docs/codebases/effect-examples/examples/http-server/src/Sql.ts:2` imports `SqlClient`.
  - `docs/codebases/effect-examples/examples/http-server/src/Sql.ts:8` creates a live `SqliteClient.layer`.
  - `docs/codebases/effect-examples/examples/http-server/src/Sql.ts:13` creates a `SqliteMigrator.layer`.
  - `docs/codebases/effect-examples/examples/http-server/src/Sql.ts:18` combines layers with `Layer.provideMerge(ClientLive)`.
  - `docs/codebases/effect-examples/examples/http-server/src/Sql.ts:20` creates a SQL test layer with `withTransaction: identity`.
  - `docs/codebases/effect-examples/examples/http-server/src/Accounts.ts:16` accesses `SqlClient.SqlClient`.
  - `docs/codebases/effect-examples/examples/http-server/src/Accounts.ts:41` wraps work in `sql.withTransaction`.
  - `docs/codebases/effect-examples/examples/http-server/src/Accounts.ts:43` annotates the operation with `Effect.withSpan("Accounts.createUser", ...)`.
  - `docs/codebases/effect-examples/examples/http-server/src/Accounts/UsersRepo.ts:10` uses `Model.makeRepository`.
  - `docs/codebases/effect-examples/examples/http-server/src/Accounts/UsersRepo.ts:18` uses `SqlSchema.findOne`.
- Effect nomenclature:
  - `SqlClient.SqlClient`, `SqliteClient.layer`, `SqliteMigrator.layer`, `Model.makeRepository`, `SqlSchema.findOne`, `withTransaction`, `withSpan`.
- Flow State today:
  - Flow examples simulate services in memory and do not need real SQL.
- Opportunity:
  - Do not create Flow persistence/database abstractions for examples when Effect SQL already has them.
  - Use SQL services behind Flow queries/mutations if an example needs real data access.
  - Keep `withTransaction` as the visible transaction word, especially for Checkout/Approval operations.
- Decision:
  - `adopt` for data-layer examples, `defer` for core Flow API.
- Migration notes:
  - Current contract examples should remain lightweight, but do not invent `transactional: true` Flow flags if an Effect service can own the transaction.

## Finding: Effect CLI commands are schema/config driven and can consume Flow examples without Flow owning CLI

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/unstable/cli/Command.ts:62` shows `Command.make("version")`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/cli/Command.ts:77` shows `Command.make("deploy", { env, force, files })`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/cli/Command.ts:84` shows `Command.make("greet", config, handler)`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/cli/Command.ts:92` defines the `Command` interface.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/cli/Command.ts:508` defines `Command.make`.
  - `docs/codebases/effect-examples/templates/monorepo/packages/cli/src/Cli.ts:13` creates `Command.make("add", { todo })`.
  - `docs/codebases/effect-examples/templates/monorepo/packages/cli/src/Cli.ts:18` creates `Command.make("done", { id })`.
  - `docs/codebases/effect-examples/templates/monorepo/packages/cli/src/Cli.ts:33` adds subcommands with `Command.withSubcommands`.
  - `docs/codebases/effect-examples/templates/monorepo/packages/cli/src/Cli.ts:37` runs the command with `Command.run`.
- Effect nomenclature:
  - `Command.make`, `Command.withDescription`, `Command.withHandler`, `Command.withSubcommands`, `Command.run`.
  - Config inputs: `Args`, `Options`, `Flag`, `Argument`.
- Flow State today:
  - Flow examples are app-oriented and do not expose CLI adapters.
- Opportunity:
  - If we add a headless example runner, make it an Effect CLI app that drives Flow actors instead of creating a Flow-specific CLI framework.
  - Keep CLI out of Flow core.
- Decision:
  - `avoid` for core, `adopt` for tooling/examples if needed.
- Migration notes:
  - No immediate API change.

## Finding: Effect devtools and tracing use stable `spanId` / `traceId` / span status payloads

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/unstable/devtools/DevToolsSchema.ts:2` describes serialized devtools protocol messages.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/devtools/DevToolsSchema.ts:21` defines `SpanStatusStarted`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/devtools/DevToolsSchema.ts:41` defines `SpanStatusEnded` with encoded `Exit`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/devtools/DevToolsSchema.ts:83` defines `ExternalSpan` with `spanId`, `traceId`, and `sampled`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/devtools/DevToolsSchema.ts:107` defines `Span` with `spanId`, `traceId`, `name`, `sampled`, `attributes`, `status`, and `parent`.
  - `docs/codebases/effect-v4/packages/effect/src/Tracer.ts:111` shows an `AnySpan` consumer reading `span.spanId` and `span.traceId`.
- Effect nomenclature:
  - `Span`, `ExternalSpan`, `AnySpan`, `spanId`, `traceId`, `sampled`, `attributes`, `status`, `parent`, `SpanStatusStarted`, `SpanStatusEnded`.
- Flow State today:
  - Flow traces and receipts have resource/request IDs but no explicit Effect span linkage.
- Opportunity:
  - Add optional span IDs to Flow runtime receipts/issues when available instead of inventing a parallel trace identity.
  - Keep Flow's `requestId` for state-machine semantics, and attach `spanId`/`traceId` for Effect observability correlation.
- Decision:
  - `adapt`.
- Migration notes:
  - Do not copy unstable devtools wire schemas into Flow core.
  - Use public tracing APIs for spans and keep receipt serialization narrow.

## Finding: Persisted queues and rate limiting already model durable work and backoff pressure

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedQueue.ts:121` defines `PersistedQueue.make({ name, schema })`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedQueue.ts:142` creates a `PersistedQueueFactory`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedQueue.ts:151` says values are encoded/decoded with the supplied schema.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedQueue.ts:153` says items are acknowledged or retried according to a `take` handler's exit.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/RateLimiter.ts:82` defines `RateLimiter.make`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/RateLimiter.ts:91` reads `tokens`, `onExceeded`, `algorithm`, `window`, and `limit`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/RateLimiter.ts:104` returns `RateLimiterError` with a `RateLimitExceeded` reason and `retryAfter`.
- Effect nomenclature:
  - `PersistedQueue.make`, `PersistedQueueFactory`, `name`, `schema`, `take`, encoded/decoded schema values.
  - `RateLimiter`, `consume`, `tokens`, `onExceeded`, `algorithm`, `window`, `limit`, `retryAfter`, `RateLimitExceeded`.
- Flow State today:
  - Streaming upload and approval examples may want queue/backpressure/rate concepts but should not fake durable queues.
- Opportunity:
  - Borrow `retryAfter`, `limit`, `remaining`, and `window` names for rate-related failures in examples.
  - Use Effect queue/persistence services if a future example needs real durable work.
  - Keep Flow stream pressure separate from persisted work queues.
- Decision:
  - `defer` implementation, `adopt` error/field names for rate-limit cases.
- Migration notes:
  - Do not add a Flow durable queue API without tests around ack/retry/exit behavior.

# Low-Level Utility And Function Sweep

This section intentionally starts below workflow/runtime concepts. The goal is to discover the small Effect primitives Flow State should inherit before inventing helpers, field names, or type utilities.

## Finding: Effect utility modules are exported as first-class namespaces

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:37` exports `Array`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:57` exports `Brand`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:127` exports `Data`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:167` exports `Equal`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:172` exports `Equivalence`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:227` exports `Function`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:317` exports `Match`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:347` exports `Newtype`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:367` exports `Option`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:372` exports `Order`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:407` exports `Predicate`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:447` exports `Record`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:497` exports `Result`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:597` exports `Struct`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:637` exports `Tuple`.
  - `docs/codebases/effect-v4/packages/effect/src/index.ts:697` exports `Types`.
- Effect nomenclature:
  - Utility modules are nouns and namespaces: `Function`, `Predicate`, `Match`, `Result`, `Record`, `Struct`, `Tuple`, `Order`, `Equivalence`, `Brand`, `Newtype`, `Types`.
- Flow State today:
  - `packages/flow-state/src/index.ts:1121` normalizes routes with inline function/array checks.
  - `packages/flow-state/src/index.ts:1671` uses `Object.entries` plus casts to read state nodes.
  - `packages/flow-state/src/index.ts:2851` rebuilds resources with `Object.fromEntries(Object.entries(...).map(...))`.
  - Examples contain manual `_tag` and status `if` chains.
- Opportunity:
  - Run an Effect utility pass before adding Flow helpers: if `Record`, `Array`, `Match`, `Predicate`, `Result`, `Types`, `Order`, or `Equivalence` already names the operation, do not create a Flow-specific helper.
  - Organize reference docs around inherited Effect utility namespaces where a public API expects users to compose values.
- Decision:
  - `adopt`.
- Migration notes:
  - This is mostly docs/examples/internal implementation cleanup, but it will shape public API naming.

## Finding: `Function.dual` explains how Effect APIs support both direct calls and `pipe`

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Function.ts:102` defines `dual`.
  - `docs/codebases/effect-v4/packages/effect/src/Function.ts:113` branches between data-first and data-last calls.
  - `docs/codebases/effect-v4/packages/effect/src/Function.ts:204` defines `LazyArg<A>`.
  - `docs/codebases/effect-v4/packages/effect/src/Function.ts:248` defines `identity`.
  - `docs/codebases/effect-v4/packages/effect/src/Function.ts:345` defines `constTrue`.
  - `docs/codebases/effect-v4/packages/effect/src/Function.ts:366` defines `constFalse`.
  - `docs/codebases/effect-v4/packages/effect/src/Function.ts:387` defines `constNull`.
  - `docs/codebases/effect-v4/packages/effect/src/Function.ts:408` defines `constUndefined`.
  - `docs/codebases/effect-v4/packages/effect/src/Function.ts:430` defines `constVoid`.
  - `docs/codebases/effect-v4/packages/effect/src/Pipeable.ts:1` defines the shared `.pipe(...)` interface.
- Effect nomenclature:
  - `dual`, `pipe`, `.pipe`, `identity`, `LazyArg`, `constTrue`, `constFalse`, `constNull`, `constUndefined`, `constVoid`.
- Flow State today:
  - Flow helper functions are mostly direct-call only.
  - Examples sometimes define standalone helpers where `pipe(value, Record.map(...), ...)` or `value.pipe(...)` could express the same operation.
- Opportunity:
  - For public helper functions that transform Flow descriptors or snapshots, use Effect's dual/data-last style only if users are expected to compose them in `pipe`.
  - For examples, prefer `pipe` with Effect functions over bespoke helper wrappers.
  - Use `constVoid`/`constNull`/`identity` where empty callbacks or default functions would otherwise be hand-written.
- Decision:
  - `adapt`.
- Migration notes:
  - Do not make plain Flow config objects `Pipeable`; keep configs serializable and familiar.
  - Use `dual` only for stable library helpers, not one-off example functions.

## Finding: `Predicate` covers object/property/tag guards that Flow currently writes by hand

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Predicate.ts:1131` defines `hasProperty`.
  - `docs/codebases/effect-v4/packages/effect/src/Predicate.ts:1139` implements `hasProperty` with `dual`.
  - `docs/codebases/effect-v4/packages/effect/src/Predicate.ts:1166` defines `isTagged`.
  - `docs/codebases/effect-v4/packages/effect/src/Predicate.ts:1174` implements `_tag` equality with `hasProperty`.
  - `packages/flow-state/src/index.ts:3184` defines local `isRecord` with `typeof value === "object" && value !== null && !Array.isArray(value)`.
  - `examples/agent-workspace/src/agentWorkspaceFlow.ts:896` checks persisted value shape with manual `typeof`/`null`/property checks.
  - `examples/checkout-approval-flow/src/checkoutFlow.ts:631` defines a local object guard.
- Effect nomenclature:
  - `Predicate.hasProperty`, `Predicate.isTagged`, guard/refinement functions.
- Flow State today:
  - Persistence, migration, and examples use repeated manual object guards and `_tag` checks.
- Opportunity:
  - Use `Predicate.hasProperty` and `Predicate.isTagged` in low-level decode/migration helpers.
  - Replace simple `_tag` guards with `Predicate.isTagged` or `Match.tag`.
  - Keep schema decoding as the stronger boundary where real validation is needed.
- Decision:
  - `adopt`.
- Migration notes:
  - Guard helpers are not substitutes for `Schema.decode` at persistence/API boundaries.
  - Good first target: replace local `isRecord`/`isPersisted...` helpers once schema-backed persistence lands.

## Finding: `Match` is the low-level replacement for status and tag if-chains

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Match.ts:281` defines `Match.type`.
  - `docs/codebases/effect-v4/packages/effect/src/Match.ts:327` defines `Match.value`.
  - `docs/codebases/effect-v4/packages/effect/src/Match.ts:530` defines `when`.
  - `docs/codebases/effect-v4/packages/effect/src/Match.ts:706` defines `discriminator`.
  - `docs/codebases/effect-v4/packages/effect/src/Match.ts:757` defines `discriminatorStartsWith`.
  - `docs/codebases/effect-v4/packages/effect/src/Match.ts:939` defines `tag`.
  - `docs/codebases/effect-v4/packages/effect/src/Match.ts:1041` defines `tags`.
  - `docs/codebases/effect-v4/packages/effect/src/Match.ts:1918` defines `result` completion.
  - `docs/codebases/effect-v4/packages/effect/src/Match.ts:1967` defines `option` completion.
  - `docs/codebases/effect-v4/packages/effect/src/Match.ts:2003` defines `exhaustive`.
  - `examples/cached-dashboard/src/dashboardFlow.ts:325`, `:349`, `:375`, `:399`, `:413`, `:434`, `:450`, and `:465` branch on event `type` with manual `if` checks.
  - `packages/flow-state/src/index.ts:2865`, `:2871`, `:2875`, `:2883`, `:2887`, and `:2891` branch on invalidation target kind manually.
- Effect nomenclature:
  - `Match.type`, `Match.value`, `Match.when`, `Match.discriminator`, `Match.discriminatorStartsWith`, `Match.tag`, `Match.tags`, `Match.result`, `Match.option`, `Match.exhaustive`.
- Flow State today:
  - Flow APIs rely on string discriminants (`kind`, `type`, `status`, `_tag`) but examples and internals often branch manually.
- Opportunity:
  - Use `Match.tag` for `_tag` failures and `Match.discriminator("type")` for events.
  - Use `Match.discriminator("kind")` for descriptor/target kinds.
  - Use `Match.exhaustive` where public unions should stay closed and type-checked.
  - Use `Match.option` / `Match.result` when partial matching is expected instead of returning `null` or throwing.
- Decision:
  - `adopt`.
- Migration notes:
  - Keep simple `guard` functions readable in examples; use `Match` where it removes repeated branch boilerplate or enforces exhaustiveness.
  - Add example snippets showing event update functions with `Match.discriminator("type")`.

## Finding: `Result` is Effect's synchronous success/failure utility and should separate validation from Effect execution

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Result.ts:70` defines `Result<A, E> = Success<A, E> | Failure<A, E>`.
  - `docs/codebases/effect-v4/packages/effect/src/Result.ts:101` defines `Failure` with `failure`.
  - `docs/codebases/effect-v4/packages/effect/src/Result.ts:284` defines `succeed`.
  - `docs/codebases/effect-v4/packages/effect/src/Result.ts:314` defines `fail`.
  - `docs/codebases/effect-v4/packages/effect/src/Result.ts:859` defines `map`.
  - `docs/codebases/effect-v4/packages/effect/src/Result.ts:905` defines `match`.
  - `docs/codebases/effect-v4/packages/effect/src/Result.ts:1454` defines `all` for iterables or records.
  - `docs/codebases/effect-v4/packages/effect/src/Result.ts:1521` defines `flip`.
  - `packages/flow-state/src/index.ts:1327` already uses `Result.isSuccess` and `Result.getOrUndefined` for defect extraction.
- Effect nomenclature:
  - `Result.succeed`, `Result.fail`, `Result.isSuccess`, `Result.isFailure`, `Result.map`, `Result.match`, `Result.all`, `Result.flip`, `failure`, `success`.
- Flow State today:
  - Flow mixes synchronous normalization, throwing JSON/stringification, and Effect exit inspection.
- Opportunity:
  - Use `Result` for synchronous operations that can fail before any Effect program is run: key encoding, persisted snapshot migration, descriptor normalization, and schema-free guard validation.
  - Use `Result.all` to validate records of descriptors or route maps.
  - Keep `Effect` for async/service work and `Schema.decodeEffect` for rich decode boundaries.
- Decision:
  - `adapt`.
- Migration notes:
  - Do not replace Effect's typed error channel with `Result` inside async operations.
  - Public APIs can still throw for programmer errors, but docs should name those separately from domain failures.

## Finding: `Record`, `Struct`, `Tuple`, and `Array` already cover most collection reshaping

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:333` defines `Record.collect`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:435` defines `Record.get`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:464` defines `Record.modify`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:619` defines `Record.map`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:733` defines `Record.filterMap`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:1157` defines `Record.reduce`.
  - `docs/codebases/effect-v4/packages/effect/src/Struct.ts:135` defines `Struct.get`.
  - `docs/codebases/effect-v4/packages/effect/src/Struct.ts:197` defines `Struct.pick`.
  - `docs/codebases/effect-v4/packages/effect/src/Struct.ts:234` defines `Struct.omit`.
  - `docs/codebases/effect-v4/packages/effect/src/Struct.ts:324` defines `Struct.evolve`.
  - `docs/codebases/effect-v4/packages/effect/src/Tuple.ts:47` defines `Tuple.make`.
  - `docs/codebases/effect-v4/packages/effect/src/Tuple.ts:76` defines `Tuple.get`.
  - `docs/codebases/effect-v4/packages/effect/src/Tuple.ts:389` defines `Tuple.map`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:84` defines `NonEmptyReadonlyArray`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:1085` defines `Array.head` returning `Option`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:2072` defines `Array.sort`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:2112` defines `Array.sortWith`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:3058` defines `Array.groupBy`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:3710` defines `Array.filterMap`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:4392` defines `Array.dedupeWith`.
  - `examples/cached-dashboard/src/dashboardFlow.ts:509` defines `mapPanels`.
  - `packages/flow-state/src/index.ts:2851` uses `Object.fromEntries(Object.entries(...).map(...))`.
- Effect nomenclature:
  - `Record.collect`, `Record.get`, `Record.modify`, `Record.map`, `Record.filterMap`, `Record.reduce`.
  - `Struct.pick`, `Struct.omit`, `Struct.evolve`.
  - `Tuple.make`, `Tuple.get`, `Tuple.map`.
  - `Array.NonEmptyReadonlyArray`, `Array.head`, `Array.sortWith`, `Array.groupBy`, `Array.filterMap`, `Array.dedupeWith`.
- Flow State today:
  - Flow and examples often use native `Object.*` / array methods and custom helpers, even when types are finite records or safe lookups.
- Opportunity:
  - Use `Record` for resource maps, panel maps, mutation maps, and invalidation target records.
  - Use `Struct` for context updates where the operation is pick/omit/evolve.
  - Use `Array.NonEmptyReadonlyArray` where public APIs require at least one state, transition, or route.
  - Use `Array.head` / `Option` for safe access instead of unchecked `[0]`.
- Decision:
  - `adopt`.
- Migration notes:
  - Do not rewrite every `.map`/`.filter`; target finite records and safety-sensitive lookups first.
  - Cached Dashboard remains the clearest example cleanup target.

## Finding: `Data` is the lightweight tagged-value layer below `Schema`

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Data.ts:96` defines `TaggedClass`.
  - `docs/codebases/effect-v4/packages/effect/src/Data.ts:590` defines `taggedEnum`.
  - `docs/codebases/effect-v4/packages/effect/src/Data.ts:770` defines `TaggedError`.
  - `examples/project-editor/src/projectFlow.ts:43` manually defines `_tag` interfaces and separate schemas.
- Effect nomenclature:
  - `Data.TaggedClass`, `Data.taggedEnum`, `Data.TaggedError`, `_tag`.
- Flow State today:
  - Examples use manual tagged unions for events/failures and sometimes duplicate schemas.
- Opportunity:
  - Use `Schema.TaggedClass` / `Schema.TaggedErrorClass` for values crossing API/persistence boundaries.
  - Use `Data.TaggedClass`, `Data.taggedEnum`, or `Data.TaggedError` for internal typed values that do not need schema codecs.
  - Avoid duplicating interface unions plus constructors plus schemas.
- Decision:
  - `adapt`.
- Migration notes:
  - For beginner examples, plain event unions are still readable.
  - For advanced examples, use `Data.taggedEnum` where generated constructors/matchers reduce ceremony.

## Finding: `Order`, `Equivalence`, and primitive modules give reusable comparison semantics

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Order.ts:53` defines `Order<A>`.
  - `docs/codebases/effect-v4/packages/effect/src/Order.ts:315` defines `Order.combine`.
  - `docs/codebases/effect-v4/packages/effect/src/Order.ts:444` defines `Order.mapInput`.
  - `docs/codebases/effect-v4/packages/effect/src/Order.ts:482` defines `Order.Date`.
  - `docs/codebases/effect-v4/packages/effect/src/Order.ts:800` defines `Order.min`.
  - `docs/codebases/effect-v4/packages/effect/src/Order.ts:835` defines `Order.max`.
  - `docs/codebases/effect-v4/packages/effect/src/Order.ts:873` defines `Order.clamp`.
  - `docs/codebases/effect-v4/packages/effect/src/Equivalence.ts:337` defines `Equivalence.combine`.
  - `docs/codebases/effect-v4/packages/effect/src/Equivalence.ts:476` defines `Equivalence.mapInput`.
  - `docs/codebases/effect-v4/packages/effect/src/Number.ts:431` defines `Number.between`.
  - `docs/codebases/effect-v4/packages/effect/src/Number.ts:473` defines `Number.clamp`.
  - `docs/codebases/effect-v4/packages/effect/src/String.ts:79` defines `String.Order`.
  - `docs/codebases/effect-v4/packages/effect/src/String.ts:96` defines `String.Equivalence`.
  - `docs/codebases/effect-v4/packages/effect/src/Boolean.ts:135` defines `Boolean.Order`.
  - `docs/codebases/effect-v4/packages/effect/src/Boolean.ts:157` defines `Boolean.Equivalence`.
  - `examples/checkout-approval-flow/src/checkoutFlow.ts:398` uses `Math.max(item.quantity, 0)`.
  - `examples/streaming-upload-manager/src/uploadFlow.ts:339` and `:340` manually reduce numeric totals.
- Effect nomenclature:
  - `Order`, `Order.combine`, `Order.mapInput`, `Order.Date`, `Order.min`, `Order.max`, `Order.clamp`.
  - `Equivalence`, `Equivalence.combine`, `Equivalence.mapInput`.
  - `Number.between`, `Number.clamp`, `String.Order`, `Boolean.Equivalence`.
- Flow State today:
  - Equality, sorting, clamping, and threshold checks are hand-written.
- Opportunity:
  - Accept `Equivalence` for resource/key comparisons if Flow supports richer keys.
  - Use `Order.mapInput`/`Array.sortBy` for sortable dashboard panels, histories, receipts, or traces.
  - Use `Number.clamp` and `Number.between` for progress, quantities, and bounded configuration values.
- Decision:
  - `adapt`.
- Migration notes:
  - Do not expose comparison typeclasses in the first simple API unless they solve a real key/sort problem.
  - Use them internally and in advanced examples where they remove custom comparator code.

## Finding: `Brand` and `Newtype` provide two levels of nominal identity

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Brand.ts:35` defines `Brand`.
  - `docs/codebases/effect-v4/packages/effect/src/Brand.ts:48` describes constructors that can throw, return `Option`, or return `Result`.
  - `docs/codebases/effect-v4/packages/effect/src/Newtype.ts:1` says newtypes are compile-time-only wrappers around existing value types.
  - `docs/codebases/effect-v4/packages/effect/src/Newtype.ts:55` defines `Newtype<Key, Carrier>`.
  - `docs/codebases/effect-v4/packages/effect/src/Newtype.ts:214` defines `Newtype.makeEquivalence`.
  - `docs/codebases/effect-v4/packages/effect/src/Newtype.ts:248` defines `Newtype.makeOrder`.
  - `examples/project-editor/src/projectFlow.ts:17` defines project IDs as raw strings.
  - `examples/cached-dashboard/src/dashboardFlow.ts` uses string panel IDs and tenant IDs.
- Effect nomenclature:
  - `Brand.Brand`, brand `Constructor.option`, brand `Constructor.result`, `Newtype.Newtype`, `Newtype.Carrier`, `Newtype.makeEquivalence`, `Newtype.makeOrder`.
- Flow State today:
  - Example IDs are mostly unbranded strings.
  - Key construction uses raw serializable parts.
- Opportunity:
  - Use `Schema.brand` or `Brand` for validated IDs that cross API/persistence boundaries.
  - Use `Newtype` for compile-time distinctions where runtime validation would be noise.
  - Lift `Equivalence`/`Order` for branded/newtyped IDs instead of unwrapping everywhere.
- Decision:
  - `adapt`.
- Migration notes:
  - Prefer `Schema.brand` in examples that already use Schema.
  - Avoid over-branding beginner examples; use it in Project Editor, Checkout, Cached Dashboard, and Agent Workspace domain IDs.

## Finding: `Types` should replace local type-level cleverness in Flow's public generic API

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Types.ts:250` defines `Simplify`.
  - `docs/codebases/effect-v4/packages/effect/src/Types.ts:282` defines `Equals`.
  - `docs/codebases/effect-v4/packages/effect/src/Types.ts:312` defines `EqualsWith`.
  - `docs/codebases/effect-v4/packages/effect/src/Types.ts:373` defines `MergeLeft`.
  - `docs/codebases/effect-v4/packages/effect/src/Types.ts:405` defines `MergeRight`.
  - `docs/codebases/effect-v4/packages/effect/src/Types.ts:478` defines `Mutable`.
  - `docs/codebases/effect-v4/packages/effect/src/Types.ts:544` defines `NoInfer`.
  - `docs/codebases/effect-v4/packages/effect/src/Types.ts:578` defines `Invariant`.
  - `docs/codebases/effect-v4/packages/effect/src/Types.ts:646` defines `Covariant`.
- Effect nomenclature:
  - `Types.Simplify`, `Types.Equals`, `Types.EqualsWith`, `Types.MergeLeft`, `Types.MergeRight`, `Types.Mutable`, `Types.NoInfer`, `Types.Invariant`, `Types.Covariant`, `Types.Contravariant`.
- Flow State today:
  - Flow's type surface is growing around descriptors, state/event inference, async routes, child actors, and service requirements.
- Opportunity:
  - Use `Types.NoInfer` for defaults/fallbacks that must not drive generic inference.
  - Use `Types.Simplify` / `MergeRight` for readable public descriptor output types.
  - Use `Types.Covariant` / `Invariant` phantom markers if Flow adds branded descriptor types with variance-sensitive generics.
  - Avoid local reimplementations of common type utilities.
- Decision:
  - `adopt` for type-level internals.
- Migration notes:
  - Add type tests for API inference before and after any generic rewrite.
  - Keep exported user-facing types readable; type utility sophistication should be hidden behind aliases.

## Finding: `Inspectable` and redaction-aware formatting can improve Flow receipts without custom serializers

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Inspectable.ts:1` says Effect data types use stable string, JSON, and Node inspection output.
  - `docs/codebases/effect-v4/packages/effect/src/Inspectable.ts:14` defines `NodeInspectSymbol`.
  - `docs/codebases/effect-v4/packages/effect/src/Inspectable.ts:61` defines the `Inspectable` interface.
  - `packages/flow-state/src/index.ts:63` formats trace snapshot values with `typeof snapshot.value === "string" ? snapshot.value : JSON.stringify(snapshot.value)`.
  - `packages/flow-state/src/index.ts:1507` formats settle options with `JSON.stringify(options ?? {})`.
- Effect nomenclature:
  - `Inspectable`, `NodeInspectSymbol`, stable inspect/string/JSON output.
- Flow State today:
  - Receipts/traces rely on `JSON.stringify` in a few places.
- Opportunity:
  - Use Effect formatting/inspectable conventions for diagnostic values where redaction matters.
  - Keep Flow snapshots plain JSON, but avoid ad hoc stringify in devtools/receipts if Effect already has a safer formatter.
- Decision:
  - `adapt`.
- Migration notes:
  - Do not make snapshots class instances solely for inspectability.
  - Pair this with `Redacted`/schema redaction so diagnostics do not leak sensitive values.

# Effect Codebase Lens Map

Purpose: broaden the audit from known feature areas to the entire checked-in Effect v4 and Effect examples codebase. Each lens should be source-backed before it becomes a Flow State API decision.

## Inventory Snapshot

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src` contains the core Effect module surface, including `Effect`, `Duration`, `Schedule`, `Stream`, `Channel`, `Sink`, `Schema`, `Layer`, `Runtime`, `Fiber`, `Queue`, `PubSub`, `Cache`, `RequestResolver`, `Resource`, collection modules, type utilities, platform interfaces, transactional data structures, and more.
  - `docs/codebases/effect-v4/packages` contains package families: `effect`, `platform-node`, `platform-browser`, `platform-bun`, `platform-node-shared`, `sql`, `ai`, `atom`, `opentelemetry`, `vitest`, and `tools`.
  - `docs/codebases/effect-v4/ai-docs/src` contains capability guides for streams, integration, batching, schedules, datetime, observability, testing, HTTP client/server, child process, CLI, AI, and cluster.
  - `docs/codebases/effect-examples` contains `examples/http-server`, `packages/create-effect-app`, and `templates/basic`, `templates/cli`, and `templates/monorepo`.
- Coverage implication:
  - Prior notes covered many high-level surfaces, but not the full `Effect.*` operator catalog, not all `Duration.*`, not all `Schedule.*`, and not all package families.

## Lens: `Effect.*` Operator Algebra

- Source scope:
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts`
  - `docs/codebases/effect-v4/ai-docs/src/01_effect`
- What to inspect:
  - Constructors: `succeed`, `fail`, `sync`, `try`, `tryPromise`, `gen`, `fn`.
  - Composition: `map`, `flatMap`, `andThen`, `tap`, eager variants.
  - Collections: `all`, `forEach`, `partition`, `validate`.
  - Errors: `catchTag`, `catchTags`, `catchCause`, `catchDefect`, `mapError`, `mapBoth`, `sandbox`.
  - Control: `timeout`, `race`, `sleep`, `retry`, `repeat`, `interrupt`, `onInterrupt`.
  - Resources: `scoped`, `acquireRelease`, `acquireUseRelease`, `ensuring`.
  - Environment: `provide`, `provideContext`, `provideService`, `provideServiceEffect`.
  - Diagnostics: `log*`, `annotateLogs`, `withSpan`, `annotateSpans`.
- Flow State question:
  - Which `Effect.*` operators should be the recommended way to author services/query/mutation/stream handlers, and which should Flow wrap or avoid exposing?
- Status:
  - `completed first pass` via subagent `Descartes`.

### Completed Sweep: `Effect.*` Operator Algebra

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:514` defines `Effect.all`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:556` defines `partition`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:606` defines `validate`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:773` defines `forEach`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:943` defines `tryPromise`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:973` defines `succeed`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:1101` defines promise construction.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:1141` defines `sync`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:1200` defines callback construction.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:1478` defines `fail`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:1781` defines `fromResult`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:1815` defines `fromOption`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:1851` defines `transposeOption`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:2199` defines `result`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:2247` defines `option`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:2291` defines `exit`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:2697` defines `catchTag`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:2793` defines `catchTags`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:2902` defines `catchReason`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:3194` defines `catchCause`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:3243` defines `catchDefect`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:4488` defines `timeout`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:4547` defines `timeoutOption`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:4608` defines `timeoutOrElse`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:4742` defines `raceAll`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:4782` defines `raceAllFirst`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:4821` defines `race`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:4877` defines `raceFirst`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:5818` defines provision helpers.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:6379` defines `scoped`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:6492` defines `acquireRelease`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:6624` defines `acquireUseRelease`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:7191` defines `interrupt`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:7241` defines `onInterrupt`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:13692` defines log helpers.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:15182` starts eager operator exports.
- Effect nomenclature:
  - Constructor taxonomy: `succeed`, `sync`, `try`, `promise`, `tryPromise`, `callback`, `suspend`, `fail`.
  - Collection outcomes: `all`, `forEach`, `partition`, `validate`.
  - Outcome wrappers: `result`, `option`, `exit`, `fromResult`, `fromOption`, `fromNullishOr`, `transposeOption`.
  - Error recovery: `catchTag`, `catchTags`, `catchReason`, `catchReasons`, `catchCause`, `catchDefect`, `tapCause`, `tapDefect`.
  - Time/control: `timeout`, `timeoutOption`, `timeoutOrElse`, `sleep`, `delay`, `timed`.
  - Race semantics: `race`, `raceFirst`, `raceAll`, `raceAllFirst`, `onWinner`.
  - Interruption: `interrupt`, `interruptible`, `onInterrupt`, `uninterruptible`, `uninterruptibleMask`, `interruptibleMask`.
  - Resource lifecycle: `scoped`, `acquireRelease`, `acquireDisposable`, `acquireUseRelease`, `addFinalizer`, `onExit`, `onExitIf`, `onExitFilter`.
  - Provision: `provide`, `provideContext`, `service`, `serviceOption`, `provideService`, `provideServiceEffect`.
  - Diagnostics: `logInfo`, `annotateLogs`, `annotateLogsScoped`, `withLogSpan`, `withSpan`, `annotateSpans`.
  - Eager variants: `matchEager`, `mapEager`, `mapErrorEager`, `mapBothEager`, `flatMapEager`, `catchEager`, `fnUntracedEager`.
- Flow State today:
  - Examples and docs mention `Effect.fn`, `Effect.map`, `Effect.provide`, and some catch/tag patterns, but do not yet teach the constructor taxonomy or operator families.
  - Flow APIs use generic timeout/duration phrasing but do not yet distinguish timeout result shapes.
  - Flow cancellation has snapshot/receipt lanes but needs clearer `onInterrupt` cleanup examples.
- Opportunity:
  - Teach service boundary authors to choose constructors intentionally: `tryPromise` for external rejecting APIs, `promise` only when rejection is a defect, `callback` for callback APIs with abort cleanup, `sync`/`try` for sync boundaries, `suspend` for lazy construction.
  - Use `Effect.validate` when Flow examples need all validation failures, not first failure.
  - Use `timeoutOption` / `timeoutOrElse` shapes rather than a vague `timeoutMs` knob.
  - Demonstrate `race` vs `raceFirst` if examples model competing sources.
  - Keep interruption as a lifecycle channel with `onInterrupt`, not as typed failure.
  - Use Effect provision names directly; do not invent parallel dependency-injection words.
  - Defer eager operators to hot internal paths after profiling.
- Decision:
  - `adopt` constructor taxonomy, collection failure semantics, outcome wrappers, interruption lifecycle, resource lifecycle, provision, and observability nomenclature.
  - `adapt` timeout/race surfaces to Flow's actor/resource snapshots.
  - `avoid` `die`/`orDie` in public examples except for true invariant defects.
  - `defer` eager operators for public API.
- Migration notes:
  - Add a docs/examples rule: external promises should be wrapped with `Effect.tryPromise` and mapped to tagged failures.
  - Add examples/tests for bulk validation accumulation, interruption cleanup, and timeout result shape.
  - Add runtime docs explaining `race` vs `raceFirst` if Flow exposes race-like helpers.
  - Keep `Effect.die` for unimplemented test fakes and impossible invariants only.

## Lens: Duration Algebra

- Source scope:
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts`
- What to inspect:
  - Parsing/input: `Input`, `DurationObject`, `fromInput`, `fromInputUnsafe`.
  - Units: `nanos`, `micros`, `millis`, `seconds`, `minutes`, `hours`, `days`, `weeks`.
  - Conversion: `toMillis`, `toSeconds`, `toMinutes`, `toHours`, `toDays`, `toWeeks`, `toNanos`, `toHrTime`.
  - Predicates: `isDuration`, `isFinite`, `isZero`, `isNegative`, `isPositive`.
  - Math/comparison: `abs`, `negate`, `min`, `max`, `clamp`, `divide`, `times`, `subtract`, `sum`, `between`, `equals`.
  - Formatting/decomposition: `parts`, `format`, `match`, `matchPair`.
  - Typeclass helpers: `Order`, `Equivalence`, `ReducerSum`, `CombinerMax`, `CombinerMin`.
- Flow State question:
  - Should Flow duration-bearing APIs be only `Duration.Input`, or should runtime internals and tests use `Duration` math/typeclass helpers for bounds, summary, and cache/timer calculations?
- Status:
  - `completed first pass`; deeper dedicated Duration pass still needed.

### Completed Sweep: Duration Algebra

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:189` defines `DurationObject` with weeks through nanoseconds.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:228` defines `fromInputUnsafe`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:330` defines safe `fromInput`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:772` defines `toMillis`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:962` defines safe `toNanos`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:1235` defines `min`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:1255` defines `max`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:1278` defines `clamp`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:1306` defines `divide`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:1412` defines `times`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:1450` defines `subtract`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:1494` defines `sum`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:1671` defines `parts`.
  - `docs/codebases/effect-v4/packages/effect/src/Duration.ts:1735` defines `format`.
- Effect nomenclature:
  - Input/parsing: `Duration.Input`, `DurationObject`, `fromInput`, `fromInputUnsafe`.
  - Conversion: `toMillis`, `toNanos`, unit conversions.
  - Algebra: `min`, `max`, `clamp`, `divide`, `times`, `subtract`, `sum`.
  - Reporting: `parts`, `format`.
- Flow State today:
  - Earlier notes only captured `Duration.Input`, object fields, safe/unsafe parsing, `toMillis`, and JSON shape.
  - Core code still has numeric millisecond helpers and a custom `{ millis }` duration shape.
- Opportunity:
  - Use `Duration.Input` at boundaries and normalize to `Duration.Duration` internally where math/comparison is required.
  - Replace numeric helper math with `Duration` algebra for cache/timer/test bounds.
  - Use `Duration.parts` / `Duration.format` for diagnostics and docs snippets.
- Decision:
  - `adopt` `Duration.Input` and safe parsing.
  - `adapt` Duration algebra internally for timer/cache/test calculations.
- Migration notes:
  - Missing deeper Duration pass: infinity/negative infinity behavior, nanosecond edge cases, `Order`/`Equivalence`, reducers/combiners, and where snapshots should keep numbers versus `Duration` values.

## Lens: Schedule Policy Algebra

- Source scope:
  - `docs/codebases/effect-v4/packages/effect/src/Schedule.ts`
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule`
- What to inspect:
  - Constructors: `duration`, `during`, `spaced`, `fixed`, `exponential`, `fibonacci`, `recurs`, `cron`, `forever`, `unfold`, `windowed`.
  - Composition: `both`, `either`, `andThen`, result variants, left/right variants.
  - Delay controls: `addDelay`, `modifyDelay`, `jittered`, `delays`.
  - Introspection/collection: `elapsed`, `collectInputs`, `collectOutputs`, `collectWhile`, `take`.
  - Transformation: `map`, `reduce`, `passthrough`, `tap`, `tapInput`, `tapOutput`.
  - Typing: `setInputType`, `satisfiesInputType`, `satisfiesOutputType`, `satisfiesErrorType`, `satisfiesServicesType`.
- Flow State question:
  - Can retry, polling, refresh, stream sampling, and debounce/throttle-like behavior be one Schedule-shaped policy instead of separate Flow config fields?
- Status:
  - `completed first pass`; deeper dedicated Schedule pass still needed.

### Completed Sweep: Schedule Policy Algebra

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Schedule.ts:1` says schedules drive retry, repeat, stream, and channel APIs.
  - `docs/codebases/effect-v4/packages/effect/src/Schedule.ts:107` defines metadata with input, attempt, start, now, and elapsed information.
  - `docs/codebases/effect-v4/packages/effect/src/Schedule.ts:435` defines `toStepWithMetadata`.
  - `docs/codebases/effect-v4/packages/effect/src/Schedule.ts:1389` defines `cron` with string/timezone support.
  - `docs/codebases/effect-v4/packages/effect/src/Schedule.ts:2179` defines `fixed`.
  - `docs/codebases/effect-v4/packages/effect/src/Schedule.ts:2702` defines `spaced`.
  - `docs/codebases/effect-v4/packages/effect/src/Schedule.ts:3323` defines `windowed`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:14` uses `Schedule.recurs`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:16` uses `Schedule.spaced`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:17` uses `Schedule.exponential`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:21` uses `Schedule.both`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:28` uses `Schedule.either`.
  - `docs/codebases/effect-v4/ai-docs/src/06_schedule/10_schedules.ts:52` uses `Schedule.jittered`.
- Effect nomenclature:
  - Constructors: `recurs`, `spaced`, `fixed`, `windowed`, `exponential`, `fibonacci`, `cron`, `forever`.
  - Metadata/stepping: `InputMetadata`, `Metadata`, `toStepWithMetadata`.
  - Composition: `both`, `either`, `andThen`, left/right variants.
  - Delay control: `addDelay`, `modifyDelay`, `jittered`.
  - Observability: `tapInput`, `tapOutput`, metadata taps.
- Flow State today:
  - Earlier notes covered ai-docs-level constructors and some combinators but not metadata, stepping, `fixed` vs `spaced` vs `windowed`, cron/timezone, or schedule observability.
- Opportunity:
  - Treat retry, repeat, polling, active refresh, sampling, and bounded attempts as one Schedule policy language.
  - Use metadata and TestClock interaction for deterministic schedule tests.
  - Consider schedule inspectors in docs/devtools if Flow exposes policy state.
- Decision:
  - `adopt` Schedule for repeated/time policy surfaces.
  - `adapt` metadata and stepping for test harness/devtools, not necessarily public app APIs.
- Migration notes:
  - Missing deeper Schedule pass: manual stepping/destructors, Clock/TestClock interaction, `cron` timezone behavior, `andThenResult`, `reduce`, collection, resolver batching delays, and schedule observability.

## Lens: Collections And Typeclass Utilities

- Source scope:
  - `Array`, `Chunk`, `List`, `HashMap`, `HashSet`, `SortedMap`, `SortedSet`, `Record`, `Struct`, `Tuple`, `Option`, `Result`, `Data`, `Match`, `Predicate`, `Equal`, `Equivalence`, `Order`, `Ordering`, `Hash`, `PrimaryKey`, `Brand`, `Newtype`, `Types`, `Pipeable`, `Inspectable`.
- Flow State question:
  - Which built-in utilities remove the need for Flow-local helpers, especially around finite records, route matching, key identity, option/result handling, and example view selectors?
- Status:
  - `completed first pass` via subagent `Banach`.

### Completed Sweep: Collections And Typeclass Utilities

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:144` defines `Array.make` with non-empty typing.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:304` defines `Array.fromIterable`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:1404` defines `takeWhileFilter`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:3058` defines `groupBy`.
  - `docs/codebases/effect-v4/packages/effect/src/Array.ts:4439` defines `dedupe`.
  - `docs/codebases/effect-v4/packages/effect/src/Chunk.ts:51` defines `Chunk<A>` as `Iterable`, `Equal`, `Pipeable`, and `Inspectable`.
  - `docs/codebases/effect-v4/packages/effect/src/Chunk.ts:353` defines `Chunk.fromIterable`.
  - `docs/codebases/effect-v4/packages/effect/src/Chunk.ts:1022` defines `Chunk.filterMap`.
  - `docs/codebases/effect-v4/packages/effect/src/Chunk.ts:1130` defines `Chunk.compact`.
  - `docs/codebases/effect-v4/packages/effect/src/Chunk.ts:2261` defines `Chunk.dedupe`.
  - `docs/codebases/effect-v4/packages/effect/src/HashMap.ts:51` defines `HashMap` as `Iterable`, `Equal`, `Pipeable`, and `Inspectable`.
  - `docs/codebases/effect-v4/packages/effect/src/HashMap.ts:805` defines `modifyAt`.
  - `docs/codebases/effect-v4/packages/effect/src/HashMap.ts:1141` defines `compact`.
  - `docs/codebases/effect-v4/packages/effect/src/HashMap.ts:1166` defines `filterMap`.
  - `docs/codebases/effect-v4/packages/effect/src/HashSet.ts:51` defines `HashSet` as `Iterable`, `Equal`, `Pipeable`, and `Inspectable`.
  - `docs/codebases/effect-v4/packages/effect/src/HashSet.ts:366` defines `union`.
  - `docs/codebases/effect-v4/packages/effect/src/HashSet.ts:393` defines `intersection`.
  - `docs/codebases/effect-v4/packages/effect/src/HashSet.ts:420` defines `difference`.
  - `docs/codebases/effect-v4/packages/effect/src/MutableList.ts:45` exposes mutable `head`, `tail`, and `length`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:234` defines `fromIterableWith`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:464` defines safe `modify` returning `Option`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:733` defines `filterMap`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:1269` defines `union`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:1328` defines `intersection`.
  - `docs/codebases/effect-v4/packages/effect/src/Record.ts:1377` defines `difference`.
  - `docs/codebases/effect-v4/packages/effect/src/Option.ts:2358` defines `bindTo`.
  - `docs/codebases/effect-v4/packages/effect/src/Option.ts:2440` defines `bind`.
  - `docs/codebases/effect-v4/packages/effect/src/Option.ts:2484` defines `Do`.
  - `docs/codebases/effect-v4/packages/effect/src/Option.ts:2525` defines `gen`.
  - `docs/codebases/effect-v4/packages/effect/src/Result.ts:959` defines `liftPredicate`.
  - `docs/codebases/effect-v4/packages/effect/src/Result.ts:1020` defines `filterOrFail`.
  - `docs/codebases/effect-v4/packages/effect/src/Data.ts:528` defines `taggedEnum` with constructors/matchers.
  - `docs/codebases/effect-v4/packages/effect/src/Equal.ts:106` defines `Equal` extending `Hash`.
  - `docs/codebases/effect-v4/packages/effect/src/Equal.ts:462` defines `asEquivalence`.
  - `docs/codebases/effect-v4/packages/effect/src/Hash.ts:470` defines `Hash.structure`.
  - `docs/codebases/effect-v4/packages/effect/src/PrimaryKey.ts:123` defines `PrimaryKey.value`.
  - `docs/codebases/effect-v4/packages/effect/typetest/Newtype.tst.ts:20` proves distinct newtypes are not assignable.
- Effect nomenclature:
  - Iterable normalization: `Array.make`, `Array.fromIterable`.
  - Immutable/value collection: `Chunk`.
  - Equality-aware maps/sets: `HashMap`, `HashSet`.
  - Mutable internals: `MutableList`.
  - Record algebra: `Record.union`, `intersection`, `difference`, `makeEquivalence`.
  - Optional sequencing: `Option.Do`, `Option.bind`, `Option.gen`.
  - Pure validation: `Result.liftPredicate`, `Result.filterOrFail`, `Result.all`.
  - Tagged data: `Data.taggedEnum`, generated `$is` / `$match`.
  - Identity/comparison: `Equal`, `Hash`, `PrimaryKey`, `Brand`, `Newtype`, `Order`, `Equivalence`.
- Flow State today:
  - Examples still use local helper functions, plain object maps, raw string IDs, and manual arrays for cases where Effect has stronger utility surfaces.
  - Earlier notes mentioned `List`, `SortedMap`, and `SortedSet`, but this v4 root export inventory did not show public modules with those names; the list-like root module observed here is `MutableList`.
- Opportunity:
  - Use `Array` as the default iterable-normalization surface in docs/examples.
  - Use `Chunk` only when value semantics, inspection, or stream/buffer composition matter.
  - Use `HashMap` / `HashSet` when key equality must follow Effect `Equal`/`Hash`, not JS object identity.
  - Use `Record` algebra for finite object maps, diffs, and merge semantics.
  - Use `Option.Do`/`Option.gen` for chained optional reads without escalating to `Effect`.
  - Use `Result` for pure validation before async/effectful boundaries.
  - Use `Data.taggedEnum` in advanced examples where generated constructors/matchers reduce boilerplate.
- Decision:
  - `adopt` `Array`, `Record`, `Option`, `Result`, `Data`, `HashMap`/`HashSet` where their semantics are visible.
  - `adapt` `Chunk` for stream/buffer examples.
  - `avoid` `MutableList` in public examples except runtime internals.
  - `defer` any guidance around `List`, `SortedMap`, and `SortedSet` until their v4 status is confirmed.
- Migration notes:
  - Add an export/package lens to confirm whether `List`, `SortedMap`, and `SortedSet` moved or were removed.
  - Add an example ergonomics rule for `Array` vs `Chunk` vs `HashMap`.
  - Add a teaching lens for `nullable -> Option -> Result -> Effect` so examples use one progression.
  - Inspect `typeperf` before recommending heavy `Data`/`Match` patterns in large generated unions.

## Lens: Schema, Codec, Parse, Config, And Redaction

- Source scope:
  - `Schema`, `SchemaAST`, `SchemaParser`, `SchemaIssue`, `SchemaRepresentation`, `SchemaTransformation`, `SchemaUtils`, `JsonSchema`, `JsonPatch`, `JsonPointer`, `Config`, `ConfigProvider`, `Redacted`, `Redactable`, `Formatter`, `Inspectable`.
  - `docs/codebases/effect-examples/examples/http-server/src/Domain`.
- Flow State question:
  - How should `flow.schema`, persistence migration, redaction, domain IDs, API payloads, and docs generation inherit Effect's schema/codecs instead of descriptive metadata?
- Status:
  - `completed first pass` via subagent `Chandrasekhar`.

### Completed Sweep: Schema, Codec, Parse, Config, And Redaction

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/Schema.ts:1` describes Schema as a broader codec/shape module.
  - `docs/codebases/effect-v4/packages/effect/src/Schema.ts:163` exposes schema type views such as `Type`, `Encoded`, `DecodingServices`, and `EncodingServices`.
  - `packages/flow-state/src/index.ts:168` defines current Flow schema descriptors as arbitrary config.
  - `packages/flow-state/src/index.ts:972` exposes `flow.schema`.
  - `examples/checkout-approval-flow/src/checkoutFlow.ts:147` uses string field descriptions.
  - `docs/codebases/effect-v4/migration/v3-to-v4.md:287` maps old `ParseResult` usage to new parser/issue modules.
  - `docs/codebases/effect-v4/migration/schema.md:252` points formatting to `SchemaIssue`.
  - `docs/codebases/effect-v4/packages/effect/src/SchemaParser.ts:238` defines `decodeUnknownEffect`.
  - `docs/codebases/effect-v4/packages/effect/src/SchemaParser.ts:446` defines `decodeUnknownResult`.
  - `docs/codebases/effect-v4/packages/effect/src/SchemaAST.ts:436` defines parse options.
  - `docs/codebases/effect-v4/packages/effect/src/SchemaIssue.ts:87` defines structured issue variants.
  - `docs/codebases/effect-v4/packages/effect/src/SchemaTransformation.ts:100` defines bidirectional `Transformation`.
  - `docs/codebases/effect-v4/packages/effect/src/SchemaTransformation.ts:1086` defines null/undefined-to-Option transformations.
  - `docs/codebases/effect-v4/packages/effect/src/Schema.ts:13202` defines JSON Schema document generation.
  - `docs/codebases/effect-v4/packages/effect/src/Schema.ts:13333` defines `toCodecJson`.
  - `docs/codebases/effect-v4/packages/effect/src/Schema.ts:12608` defines `Schema.Class`.
  - `docs/codebases/effect-v4/packages/effect/src/Schema.ts:12818` defines `TaggedErrorClass`.
  - `docs/codebases/effect-v4/packages/effect/src/Redacted.ts:24` defines redacted runtime behavior.
  - `docs/codebases/effect-v4/packages/effect/src/Redacted.ts:244` exposes `Redacted.value`.
  - `docs/codebases/effect-v4/packages/effect/src/Schema.ts:8865` defines `Schema.Redacted`.
  - `docs/codebases/effect-v4/packages/effect/src/Schema.ts:8983` defines `Schema.RedactedFromValue`.
  - `docs/codebases/effect-v4/migration/schema.md:107` warns about v4 redacted schema migration.
  - `docs/codebases/effect-v4/packages/effect/src/Config.ts:640` defines `Config.schema`.
  - `docs/codebases/effect-v4/packages/effect/src/Config.ts:327` defines `Config.withDefault`.
  - `docs/codebases/effect-v4/packages/effect/src/Config.ts:372` defines `Config.option`.
  - `docs/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:248` defines the raw provider `load(path)` boundary.
  - `docs/codebases/effect-v4/packages/effect/src/ConfigProvider.ts:296` defines provider constructors.
  - `docs/codebases/effect-v4/MIGRATION.md:40` marks persistence APIs unstable.
- Effect nomenclature:
  - Schema type views: `Type`, `Encoded`, `DecodingServices`, `EncodingServices`.
  - Boundary decode: `SchemaParser.decodeUnknownEffect`, `decodeUnknownResult`.
  - Issues: `SchemaIssue.Issue`, `_tag` variants such as `Pointer`, `MissingKey`, `UnexpectedKey`, `Filter`, `Encoding`.
  - Parse policy: `errors`, `onExcessProperty`, `propertyOrder`, `disableChecks`, `concurrency`.
  - Transformations: `decode`, `encode`, `flip`, `compose`.
  - Option transformations: `optionFromNullOr`, `optionFromUndefinedOr`, `optionFromNullishOr`, `optionFromOptionalKey`.
  - JSON/persistence: `Schema.toCodecJson`, `toJsonSchemaDocument`.
  - Domain models/errors: `Schema.Class`, `Schema.TaggedErrorClass`.
  - Redaction: `Redacted`, `Redacted.value`, `Schema.Redacted`, `Schema.RedactedFromValue`.
  - Config: `Config.schema`, `Config.withDefault`, `Config.option`, `ConfigProvider`.
- Flow State today:
  - `flow.schema` is descriptive metadata, not an Effect codec boundary.
  - Checkout and Agent Workspace perform manual redaction and persistence shape checks.
  - Runtime issues risk flattening schema problems into strings too early.
- Opportunity:
  - Make `flow.schema` accept real Effect schemas/codecs and preserve `Type` vs `Encoded`.
  - Use `decodeUnknownEffect` for async/untyped boundaries and `decodeUnknownResult` for sync persistence helpers.
  - Retain structured `SchemaIssue.Issue` or standard formatted issue output in Flow diagnostics.
  - Use bidirectional transformations for migrations where round-tripping matters.
  - Use `toCodecJson` for persisted snapshots and `toJsonSchemaDocument` for docs/reference generation.
  - Use `Redacted` / `Schema.RedactedFromValue` carefully; do not present it as encryption.
  - Use `Config.schema` for runtime/devtools config and avoid defaults that mask validation errors.
- Decision:
  - `adopt` Schema codecs, parser/issue vocabulary, schema-backed JSON/persistence/docs, and redaction types.
  - `adapt` Config/ConfigProvider for examples and runtime config.
  - `avoid` new Flow APIs based on old `ParseResult`.
  - `defer` direct stable coupling to unstable persistence modules.
- Migration notes:
  - Current-version persistence decode should probably use `errors: "all"` and a strict excess-property policy.
  - Legacy migrations can decode more loosely.
  - Update Checkout and Agent Workspace redactors to schema-backed redaction.
  - Add tests for `Schema.Redacted` vs `Schema.RedactedFromValue` so examples do not accidentally require already-redacted values.

## Lens: Runtime, Concurrency, Lifecycle, And Test Time

- Source scope:
  - `Runtime`, `ManagedRuntime`, `Layer`, `LayerMap`, `Context`, `Clock`, `DateTime`, `Fiber`, `FiberMap`, `FiberSet`, `FiberHandle`, `Deferred`, `Latch`, `Ref`, `SynchronizedRef`, `ScopedRef`, `Queue`, `PubSub`, `Scope`, `Semaphore`, `PartitionedSemaphore`, `Pool`, `Cache`, `ScopedCache`, `Resource`, `Request`, `RequestResolver`, `Scheduler`.
  - `docs/codebases/effect-v4/packages/vitest`.
- Flow State question:
  - Which lifecycle/concurrency primitives should own Flow runtime internals, test harness time, stream cancellation, cache lookup, and actor disposal?
- Status:
  - `completed first pass` via subagent `Boole`.

### Completed Sweep: Runtime, Concurrency, Lifecycle, And Test Time

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:103` requires disposal.
  - `docs/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:132` exposes `runFork`.
  - `docs/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:185` exposes `runPromise`.
  - `docs/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:196` exposes `runPromiseExit`.
  - `docs/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:273` creates a memo map and scope.
  - `docs/codebases/effect-v4/packages/effect/src/Runtime.ts:136` defines `makeRunMain`.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:715` documents `forEach` concurrency/default behavior.
  - `docs/codebases/effect-v4/packages/effect/src/Effect.ts:6292` defines `withConcurrency`.
  - `docs/codebases/effect-v4/packages/effect/src/FiberSet.ts:1` manages many fibers in a scope.
  - `docs/codebases/effect-v4/packages/effect/src/FiberMap.ts:1` manages keyed fibers.
  - `docs/codebases/effect-v4/packages/effect/src/FiberHandle.ts:1` manages one replaceable fiber.
  - `docs/codebases/effect-v4/packages/effect/src/Scope.ts:1` defines resource lifetime and cleanup.
  - `docs/codebases/effect-v4/packages/effect/src/Clock.ts:40` provides current millis/nanos and sleep.
  - `docs/codebases/effect-v4/ai-docs/src/07_datetime/10_creating-and-formatting.ts:10` says `DateTime.now` uses Effect Clock and enables TestClock.
  - `docs/codebases/effect-v4/packages/vitest/src/index.ts:145` includes `timeout: Duration.Input` in layer test options.
  - `docs/codebases/effect-v4/packages/vitest/src/index.ts:169` exposes `effect`.
  - `docs/codebases/effect-v4/packages/vitest/src/index.ts:174` exposes `live`.
  - `docs/codebases/effect-v4/packages/vitest/src/internal/internal.ts:40` merges `TestConsole` and `TestClock`.
  - `docs/codebases/effect-v4/packages/vitest/test/index.test.ts:156` tests `TestClock.adjust`.
  - `docs/codebases/effect-v4/packages/effect/src/Queue.ts:400` defines queue capacity/strategy.
  - `docs/codebases/effect-v4/packages/effect/src/PubSub.ts:1` describes broadcast PubSub semantics.
  - `docs/codebases/effect-v4/packages/effect/src/Ref.ts:1` defines fiber-safe mutable state.
  - `docs/codebases/effect-v4/packages/effect/src/SynchronizedRef.ts:1` serializes effectful updates.
  - `docs/codebases/effect-v4/packages/effect/src/ScopedRef.ts:1` replaces resource-backed values and releases old resources.
  - `docs/codebases/effect-v4/packages/effect/src/Semaphore.ts:1` limits effects with permits.
  - `docs/codebases/effect-v4/packages/effect/src/Pool.ts:1` shares scoped resources across fibers.
- Effect nomenclature:
  - Runtime: `ManagedRuntime`, `Runtime.makeRunMain`, `MemoMap`, `dispose`, `runFork`, `runPromiseExit`.
  - Concurrency: `concurrency`, `"unbounded"`, `withConcurrency`.
  - Fiber ownership: `FiberSet`, `FiberMap`, `FiberHandle`, `onlyIfMissing`.
  - Lifecycle: `Scope`, `addFinalizer`, `close`, finalizer strategy.
  - Time/test: `Clock`, `DateTime.now`, `TestClock`, `it.effect`, `it.layer`, `it.live`.
  - Backpressure: `Queue` strategies `suspend`, `dropping`, `sliding`; `PubSub` broadcast/replay.
  - Mutable runtime state: `Ref`, `SynchronizedRef`, `ScopedRef`.
  - Permits/resources: `Semaphore`, `Pool`.
- Flow State today:
  - Runtime execution still uses ad hoc `runPromiseExit` plumbing and a `layer` option.
  - Test harness has `advance`/`settle` TODO surfaces.
  - Stream pressure names are Flow-specific.
  - Mutation concurrency labels are product-friendly but not aligned with Effect permits.
- Opportunity:
  - Use `ManagedRuntime` when Flow runtime is supplied a Layer.
  - Keep `Runtime.makeRunMain` out of core Flow and reserve it for CLI/platform adapters.
  - Align user-facing concurrency fields with `concurrency` / `"unbounded"` where it stays clear.
  - Use `FiberMap` for keyed query/stream/timer/child work and `FiberHandle` for replace/reject single slots.
  - Use `Scope` as actor/runtime lifetime boundary.
  - Use `Clock`/`TestClock` for Effect services and deterministic tests.
  - Adopt `@effect/vitest` style (`it.effect`, `it.layer`, `it.live`) in service-level tests.
  - Use Queue for single-consumer streams and PubSub for fanout.
  - Use `Semaphore` for mutation concurrency internals; defer public Pool API.
- Decision:
  - `adopt` ManagedRuntime, Scope, Clock/TestClock, Effect-vitest test patterns, and Queue/PubSub semantics.
  - `adapt` Fiber ownership, Refs, Semaphore, Cache/Resource internals to Flow actor/resource snapshots.
  - `defer` Runtime.makeRunMain and Pool in core public API.
- Migration notes:
  - Add disposal tests for runtime/actor/fiber finalizers.
  - Add deterministic `flowTest.advance` tests backed by TestClock.
  - Add docs that distinguish Queue work-queue pressure from PubSub broadcast/fanout.

## Lens: Streaming And Channel Architecture

- Source scope:
  - `Stream`, `Channel`, `ChannelSchema`, `Sink`, `Take`, `Pull`, `Stdio`, `Encoding`.
  - `docs/codebases/effect-v4/ai-docs/src/02_stream`.
- Flow State question:
  - Should Flow streams expose `Stream.Stream` directly, support channel/sink transforms, or stay at a higher event-routing abstraction?
- Status:
  - `partially covered`; needs a deeper stream/channel pass after `Effect.*`.

## Lens: Platform Boundaries

- Source scope:
  - `docs/codebases/effect-v4/packages/platform-node`
  - `docs/codebases/effect-v4/packages/platform-browser`
  - `docs/codebases/effect-v4/packages/platform-bun`
  - `docs/codebases/effect-v4/packages/platform-node-shared`
  - HTTP client/server/API, file system/path/terminal/worker/process, CLI, child process.
- Flow State question:
  - Which platform boundaries belong in examples and adapters, and which would wrongly turn Flow State into a platform framework?
- Status:
  - `completed first pass` via subagent `Curie`.

### Completed Sweep: Platform Boundaries

- Evidence:
  - `docs/codebases/effect-v4/MIGRATION.md:28` keeps platform packages separate from core Effect.
  - `packages/flow-state/package.json:26` keeps Flow core peer dependencies narrow.
  - `docs/codebases/effect-v4/ai-docs/src/50_http-client/10_basics.ts:16` wraps external API access in a `Context.Service`.
  - `docs/codebases/effect-v4/ai-docs/src/50_http-client/10_basics.ts:53` uses `HttpClient.mapRequest`, `HttpClient.filterStatusOk`, `HttpClient.retryTransient`, and schema body decoding.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/http/HttpClient.ts:138` defines `HttpClient` as a service tag with accessors.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/http/FetchHttpClient.ts:1` defines portable fetch-backed HTTP.
  - `docs/codebases/effect-v4/packages/platform-node/src/NodeHttpClient.ts:352` defines Node HTTP client layers.
  - `docs/codebases/effect-v4/packages/platform-browser/src/BrowserHttpClient.ts:1` re-exports fetch and adds browser-specific XHR controls.
  - `docs/codebases/effect-v4/packages/platform-browser/test/BrowserHttpClient.test.ts:10` tests XHR layer behavior.
  - `docs/codebases/effect-v4/ai-docs/src/51_http-server/10_basics.ts:12` says API definitions should be separate from server implementation.
  - `docs/codebases/effect-v4/ai-docs/src/51_http-server/10_basics.ts:31` builds server routes through layers.
  - `docs/codebases/effect-v4/ai-docs/src/51_http-server/10_basics.ts:68` defines `HttpApiClient.ForApi` as an app service.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts:62` shows HTTP API builder service requirements.
  - `docs/codebases/effect-v4/packages/platform-node/test/HttpApi.test.ts:634` verifies missing middleware/group layers fail as service errors.
  - `docs/codebases/effect-v4/packages/effect/src/FileSystem.ts:1` defines filesystem as host boundary returning `Effect`, `Stream`, or `Sink`.
  - `docs/codebases/effect-v4/packages/effect/src/Path.ts:1` defines path as a host-independent service.
  - `docs/codebases/effect-v4/packages/effect/src/Terminal.ts:1` defines terminal service behavior.
  - `docs/codebases/effect-v4/packages/effect/src/Stdio.ts:1` defines stdio service behavior.
  - `docs/codebases/effect-v4/ai-docs/src/70_cli/10_basics.ts:7` uses typed CLI modules with Node services.
  - `docs/codebases/effect-v4/ai-docs/src/60_child-process/10_working-with-child-processes.ts:23` uses child process spawner through services and scope.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workers/Worker.ts:22` defines Effect workers.
  - `docs/codebases/effect-v4/packages/platform-node/src/NodeServices.ts:25` aggregates Node services.
  - `docs/codebases/effect-v4/packages/platform-bun/src/BunServices.ts:25` mirrors aggregate Bun services.
  - `docs/codebases/effect-v4/packages/platform-browser/src/index.ts:15` exports browser capability modules.
- Effect nomenclature:
  - Platform boundary packages: `@effect/platform-node`, `@effect/platform-browser`, `@effect/platform-bun`, `@effect/opentelemetry`.
  - HTTP client: `HttpClient.HttpClient`, `HttpClient.mapRequest`, `filterStatusOk`, `retryTransient`, `HttpClientResponse.schemaBodyJson`.
  - HTTP API: `HttpApi`, `HttpApiBuilder.layer`, `HttpApiClient.ForApi`, `transformClient`.
  - Platform services: `FileSystem`, `Path`, `Stdio`, `Terminal`, `ChildProcessSpawner`, `Worker`, `NodeServices`, `BunServices`.
  - Browser capabilities: `BrowserHttpClient`, `BrowserKeyValueStore`, `BrowserPersistence`, `BrowserRuntime`, `BrowserSocket`, `BrowserStream`, `BrowserWorker`, `Clipboard`, `Geolocation`, `IndexedDb`, `Permissions`.
- Flow State today:
  - Core package has narrow peer dependencies and should not absorb platform packages.
  - Examples need real service boundaries but not a platform framework.
  - Streaming Upload Manager is the one place XHR/progress may be platform-specific.
- Opportunity:
  - Keep `flow-state` platform-free; accept `Effect`/`Layer` requirements and put platform layers in adapters/examples.
  - Use `HttpClient` as canonical query/mutation service pattern.
  - Provide HTTP transport at app/test setup, not inside machines.
  - Use XHR only for upload-progress/browser demos.
  - Use `HttpApi`/`HttpApiClient.ForApi` in one optional full-stack example, not in the runtime core.
  - Use `FileSystem`/`Path` for tooling/persistence examples and `Stdio`/`Terminal` only in CLI surfaces.
  - Consider workers later as child-actor infrastructure after `flow.child` semantics mature.
- Decision:
  - `adopt` platform boundary separation and HttpClient-as-service patterns.
  - `adapt` HttpApi, FileSystem/Path, CLI, worker, Node/Bun/browser services as optional adapters/examples.
  - `avoid` turning Flow into an HTTP/platform framework.
- Migration notes:
  - Add docs that query/mutation services should use Effect platform clients, supplied by layers.
  - Keep platform packages out of core dependencies.
  - Future packages can be shaped like `flow-state/node`, `flow-state/browser`, or example-only adapter layers.

## Lens: Observability And Diagnostics

- Source scope:
  - `Logger`, `LogLevel`, `Metric`, `Tracer`, `References`, `ErrorReporter`.
  - `docs/codebases/effect-v4/packages/opentelemetry`.
  - `docs/codebases/effect-v4/ai-docs/src/08_observability`.
- Flow State question:
  - How should Flow receipts, issues, snapshots, devtools, and examples correlate with Effect spans/logs/metrics without inventing a parallel observability model?
- Status:
  - `completed first pass`; exporter integration still deferred.

### Completed Sweep: Observability And Diagnostics

- Evidence:
  - `docs/codebases/effect-v4/ai-docs/src/08_observability/10_logging.ts:9` uses `Logger.layer`.
  - `docs/codebases/effect-v4/ai-docs/src/08_observability/10_logging.ts:51` uses `Effect.annotateLogs`.
  - `docs/codebases/effect-v4/ai-docs/src/08_observability/10_logging.ts:66` uses `Effect.withLogSpan`.
  - `docs/codebases/effect-v4/packages/effect/src/Logger.ts:66` defines `Logger.Options` including message, level, cause, fiber, and date.
  - `docs/codebases/effect-v4/packages/effect/src/Metric.ts:1` defines counters/gauges/frequencies/histograms/summaries.
  - `docs/codebases/effect-v4/packages/effect/src/Metric.ts:107` exposes metric id/type/description/attributes and unsafe value/update hooks.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/observability/PrometheusMetrics.ts:1` formats/registers Prometheus metric output.
  - `docs/codebases/effect-v4/LLMS.md:278` recommends lightweight unstable observability for new projects and `@effect/opentelemetry` for existing OTel setups.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/observability/OtlpTracer.ts:45` defines OTLP tracer requirements.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/observability/OtlpLogger.ts:106` defines OTLP logger requirements.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/devtools/DevTools.ts:1` describes devtools span/event/completion/metric transport.
  - `packages/flow-state/src/index.ts:697` defines Flow trace/receipt primitives.
  - `packages/flow-state/src/index.ts:859` defines Flow redaction/trace behavior.
- Effect nomenclature:
  - Logging: `Logger.layer`, `References.MinimumLogLevel`, `Logger.Options`, `Effect.annotateLogs`, `Effect.withLogSpan`.
  - Metrics: `Metric`, counters, gauges, frequencies, histograms, summaries, `PrometheusMetrics`.
  - Tracing/export: `OtlpTracer.layer`, `OtlpLogger.layer`, `@effect/opentelemetry`, `DevTools.layer`.
- Flow State today:
  - Flow has receipts, graph, trace, and redaction primitives but not a clear relationship to Effect logs/spans/metrics/exporters.
- Opportunity:
  - Adopt core log/span annotations before exporter work.
  - Attach actor/resource/request/transition IDs to Effect spans/logs.
  - Adapt metrics as optional runtime counters later.
  - Learn from Effect DevTools transport but keep Flow devtools Flow-specific.
- Decision:
  - `adopt` structured logs/spans/annotations in examples and runtime internals.
  - `adapt` metrics and lightweight OTLP docs later.
  - `defer` direct Effect DevTools and Prometheus/OTLP exporter integration.
  - `avoid` a hard dependency on `@effect/opentelemetry` in core.
- Migration notes:
  - Add observability docs after runtime receipt/span correlation is implemented.
  - Exporter examples should live in platform/integration examples, not core docs.

## Lens: Higher-Level Package Families

- Source scope:
  - `docs/codebases/effect-v4/packages/sql`
  - `docs/codebases/effect-v4/packages/ai`
  - `docs/codebases/effect-v4/packages/atom`
  - `docs/codebases/effect-v4/packages/tools`
  - `docs/codebases/effect-v4/packages/vitest`
  - unstable RPC/workflow/cluster/persistence/reactivity modules under `packages/effect/src/unstable`.
- Flow State question:
  - Which higher-level subsystems provide vocabulary or examples Flow should inherit, and which should remain separate package/adaptor concerns?
- Status:
  - `completed first pass` via subagent `Gauss`.

### Completed Sweep: Higher-Level Package Families

- Evidence:
  - `docs/codebases/effect-v4/packages/effect/src/unstable/sql/SqlClient.ts:37` defines `SqlClient` as a service boundary with transaction, reserve, safe, reactive, and transform surfaces.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/sql/SqlClient.ts:110` defines SQL make options such as `acquirer`, `compiler`, `spanAttributes`, `transactionService`, transforms, and reactive queue.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/sql/SqlClient.ts:254` handles nested transaction savepoints.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/sql/SqlResolver.ts:1` describes SQL request batching and schema encode/decode.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/sql/SqlResolver.ts:101` defines ordered resolver fields `Request`, `Result`, and `execute`.
  - `docs/codebases/effect-v4/packages/sql/pg/src/PgClient.ts:79` adds PostgreSQL `json`, `listen`, and `notify`.
  - `docs/codebases/effect-v4/packages/sql/mysql2/src/MysqlClient.ts:118` maps adapter errno values to typed SQL errors.
  - `docs/codebases/effect-v4/packages/sql/sqlite-node/src/SqliteClient.ts:93` defines Node SQLite config.
  - `docs/codebases/effect-v4/packages/sql/sqlite-wasm/src/SqliteClient.ts:89` defines WASM reactivity hook config.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/ai/LanguageModel.ts:71` defines the provider-neutral language model service.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/ai/LanguageModel.ts:81` exposes `generateText`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/ai/LanguageModel.ts:144` exposes `streamText`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/ai/Tool.ts:116` defines tool failure modes.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/ai/Tool.ts:1740` starts safety annotations such as readonly/destructive/idempotent/open-world/strict.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/Atom.ts:66` exposes Atom metadata.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/Atom.ts:159` defines `AtomContext`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/AtomRegistry.ts:64` tracks nodes/dependencies/subscriptions/disposal.
  - `docs/codebases/effect-v4/packages/atom/react/src/Hooks.ts:54` uses React `useSyncExternalStore`.
  - `docs/codebases/effect-v4/packages/atom/react/src/RegistryContext.ts:75` creates a registry with scheduling, initial values, timeout resolution, and default idle TTL.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/AtomRpc.ts:43` exposes runtime/mutation/query.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/reactivity/AtomRpc.ts:80` defines query options including `headers`, `reactivityKeys`, `timeToLive`, and `serializationKey`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/Persistence.ts:56` creates persistence stores by `storeId` and `timeToLive`.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/Persistence.ts:69` stores `Exit` values.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedCache.ts:57` takes `storeId`, `timeToLive`, in-memory capacity/TTL, and service mode.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/persistence/PersistedQueue.ts:62` exposes de-duplicated `offer` and `take` attempts.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/cluster/ShardingConfig.ts:29` defines cluster/sharding configuration.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/cluster/MessageStorage.ts:48` defines durable mailbox/message storage behavior.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Workflow.ts:45` defines workflow schema/idempotency/execution/poll/interrupt/resume.
  - `docs/codebases/effect-v4/packages/effect/src/unstable/workflow/Activity.ts:123` defines activity schemas and retry-on-interrupt policy.
  - `docs/codebases/effect-v4/packages/vitest/src/index.ts:164` exports `effect`, `live`, `layer`, `prop`, and `it`.
  - `docs/codebases/effect-v4/packages/tools/ai-codegen/src/Config.ts:54` defines codegen config.
  - `docs/codebases/effect-v4/packages/tools/openapi-generator/src/OpenApiGenerator.ts:45` supports `httpclient`, `httpclient-type-only`, and `httpapi`.
  - `docs/codebases/effect-examples/templates/monorepo/packages/domain/src/TodosApi.ts:21` defines an HttpApi domain package.
- Effect nomenclature:
  - SQL: `SqlClient`, `withTransaction`, `TransactionConnection`, `SqlResolver`, `RequestGroupKey`, typed SQL errors, dialect capabilities.
  - AI: `LanguageModel`, `generateText`, `generateObject`, `streamText`, `Tool`, `FailureMode`, approval context, safety annotations.
  - Reactivity: `Atom`, `AtomContext`, `AtomRegistry`, `serializationKey`, `reactivityKeys`, `timeToLive`.
  - Persistence: `Persistence`, `PersistedCache`, `PersistedQueue`, `storeId`, `timeToLive`, persisted `Exit`, `attempts`, `maxAttempts`.
  - Cluster/workflow: `ShardingConfig`, `MessageStorage`, `Workflow`, `Activity`, `idempotencyKey`, `executionId`, compensation.
  - Testing/tools/examples: `@effect/vitest`, codegen config, OpenAPI generator, HttpApi domain/server/client split.
- Flow State today:
  - New examples are contract-first and not intended to become full SQL/AI/platform apps yet.
  - Flow already has approval/agent examples where tool governance and durable work vocabulary matter.
  - Flow examples do not yet separate domain/server/client packages like Effect templates.
- Opportunity:
  - Add explicit lenses for SQL service boundaries, AI provider/tool governance, Atom/reactivity, durable persistence, cluster mailbox semantics, testing layers, tooling/codegen, and examples/templates.
  - Borrow SQL transaction/error/resolver vocabulary if Flow examples add real data access.
  - Borrow AI tool safety annotations for Agent Workspace and approval governance.
  - Use Atom React patterns only if Flow State frontend integration needs an Effect-native reactive store.
  - Keep persistence/workflow/cluster unstable and separate from core until single-node semantics are proven.
  - Adapt the monorepo template split for future package/docs structure: domain API, server handlers, CLI/client consumption.
- Decision:
  - `adopt` package/API split, testing-layer patterns, AI tool safety nomenclature, and schema-aware SQL resolver vocabulary where examples need them.
  - `adapt` SQL/Atom/Persistence/Workflow as advanced lenses.
  - `defer` cluster, distributed queues, enterprise stored procedures, and full provider abstractions.
  - `avoid` lowest-common-denominator storage abstractions that hide dialect capabilities.
- Migration notes:
  - Add master lenses: `sql-dialect-lens`, `ai-provider-lens`, `reactivity-atom-lens`, `durable-runtime-lens`, `cluster-mailbox-lens`, `testing-layer-lens`, `tooling-codegen-lens`, `examples-template-lens`.
  - For Agent Workspace, consider adopting `Readonly`, `Destructive`, `Idempotent`, `OpenWorld`, and `Strict`-style action/tool annotations.
  - For durable examples, store encoded `Exit` values only after persistence/replay semantics are testable.
  - Do not assume compensation covers nested activities; Effect workflow notes say it applies to top-level workflow effects.

## Lens: Transactional And Mutable Structures

- Source scope:
  - `TxChunk`, `TxDeferred`, `TxHashMap`, `TxHashSet`, `TxPriorityQueue`, `TxPubSub`, `TxQueue`, `TxReentrantLock`, `TxRef`, `TxSemaphore`, `TxSubscriptionRef`.
  - `MutableHashMap`, `MutableHashSet`, `MutableList`, `MutableRef`.
- Flow State question:
  - Should Flow internals use transactional structures for atomic actor/resource updates, or are `Ref`/`SynchronizedRef`/plain immutable snapshots enough?
- Status:
  - `not started`.

## Lens: Docs, Migration, Cookbooks, And Examples As API Signals

- Source scope:
  - `docs/codebases/effect-v4/ai-docs`
  - `docs/codebases/effect-v4/migration`
  - `docs/codebases/effect-v4/cookbooks`
  - `docs/codebases/effect-examples`
- Flow State question:
  - Which patterns are intentionally taught as current Effect v4 style, which are migration-only, and which are old Effect 3.x examples that Flow should not copy?
- Status:
  - `partially covered`; included in subagent `Gauss`.
