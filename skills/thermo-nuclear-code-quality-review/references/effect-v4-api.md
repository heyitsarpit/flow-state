# Effect v4 API Reference For Flow State Reviews

This reference is derived from `/Users/arpit/Developer/flow-state/NOTES.md`.
It is optimized for agents implementing or reviewing Flow State code, especially
the vNext API proving app. It is not a tutorial. It is a decision map: choose
the native Effect concept first, then add Flow vocabulary only when Flow adds
real product/runtime semantics.

## How To Use This File

- Start with the **Decision Rule** below.
- Use the **Module Map** sections when you need the native Effect name for a
  problem.
- Use **Flow State Adoption Map** when deciding whether Flow should wrap,
  inherit, or avoid an Effect concept.
- Use **Red Flags** during thermo-nuclear review.
- If exact evidence is needed, grep `NOTES.md` for the module or finding name.

## Table Of Contents

- Decision Rule
- Core Effect Shape
- Services, Layers, Runtime
- Errors And Outcomes
- Time, Duration, Schedule
- Streams, Queues, PubSub
- Cache, Resource, Batching, Persistence
- Schema, Data, Identity, Redaction
- Absence, Validation, Collections
- Runtime State, Concurrency, Lifecycle
- Observability And Diagnostics
- Platform And Higher-Level Packages
- Reactivity And Subscriptions
- Flow State Adoption Map
- Review Red Flags
- Flow vNext Example Expectations
- Minimal Pattern Library

Useful greps:

```sh
rg -n "Finding: .*Stream|Stream\\." NOTES.md
rg -n "Finding: .*Schedule|Schedule\\." NOTES.md
rg -n "Finding: .*ManagedRuntime|Context.Service|Effect.fn" NOTES.md
rg -n "Finding: .*Schema|TaggedErrorClass|Redacted|Option" NOTES.md
rg -n "Finding: .*Cache|Resource|RequestResolver|Persist" NOTES.md
rg -n "Finding: .*FiberMap|Scope|Deferred|Queue|PubSub" NOTES.md
```

## Decision Rule

Adopt Effect directly when the concept is already an Effect substrate concern:

```txt
program execution, services, layers, streams, schedules, time, schemas,
redaction, batching, cache, resources, fibers, scopes, refs, queues,
pubsub, config, observability, platform clients, persistence, RPC, HTTP
```

Use Flow names only when Flow adds app/runtime semantics:

```txt
resources as UI-visible shared app data
resource snapshots and freshness
mutations as traceable transactions
machines / flows / states / transitions
ensure / observe / run / patch / invalidate integration
flow snapshots / receipts / issues / traces
views as UI read models
React hooks and app provider integration
```

Reject APIs that merely rename Effect for namespace symmetry.

## Core Effect Shape

### `Effect<A, E, R>`

Meaning:

```txt
A = success value
E = typed failure channel
R = required services
```

Review rule:

- Do not erase `E` into thrown exceptions.
- Do not erase `R` into manually passed objects.
- Do not convert domain logic to `Promise` just because the host boundary is
  promise-shaped.
- Preserve `Exit`/`Cause` at runtime boundaries where defects and interrupts
  matter.

Preferred:

```ts
const loadProject = Effect.fn("ProjectApi.loadProject")(function* (id: ProjectId) {
  const client = yield* HttpClient;
  return yield* client.getProject(id);
});
```

Avoid:

```ts
async function loadProject(id: ProjectId): Promise<Project> {
  // erased failure and service requirements
}
```

### Generator Pattern

Use `Effect.gen` for readable sequential code.

Rules:

- Use `return yield*` for typed failures or interrupts.
- Do not use `try/catch` inside `Effect.gen` to catch Effect failures.
- Use `Effect.result`, `Effect.exit`, `Effect.catchTag`, `Effect.catchTags`,
  `Effect.catchReason`, or `Effect.catchReasons` for recovery/inspection.

### `Effect.fn`

Use for named operations:

- service methods
- resource lookups
- mutation runs
- stream-producing operations
- transactional operations
- important runtime helpers

Why:

- better call-site naming
- tracing/spans
- easier stack/diagnostic output
- consistent API review surface

## Services, Layers, Runtime

### `Context.Service`

Default service boundary for app APIs and runtime services.

Use for:

- `ProjectApi`
- `SessionApi`
- `ReadinessApi`
- `AssetApi`
- `ApprovalApi`
- `AssistantApi`
- `ChatApi` / `LlmApi`
- runtime services such as ResourceStore, OrchestratorSystem, Trace

Review rules:

- Do not pass service bags through every function.
- Do not hide requirements in module-level mutable variables.
- Prefer service classes/static layer helpers where established locally.
- Partial test layers may fail fast for unimplemented methods.

### `Layer`

Effect's dependency composition boundary.

Use:

- `Layer.succeed`
- `Layer.effect`
- `Layer.merge`
- `Layer.mergeAll`
- `Layer.provide`
- `Layer.provideMerge`
- `Layer.unwrap` for dynamic layer choice
- `Layer.setConfigProvider` for config overrides in tests

Review rules:

- Flow app layers should compose real Effect layers.
- Do not create a parallel DI system.
- Keep live/test/mock layers independently swappable.

### `ManagedRuntime`

Host bridge for React, examples, tests, and other external frameworks.

Use:

- `ManagedRuntime.make(layer, { memoMap })`
- `runtime.runPromise`
- `runtime.runPromiseExit`
- `runtime.runSync` where safe
- `runtime.dispose`

Review rules:

- Runtime disposal must interrupt owned fibers, streams, timers, child actors,
  refresh loops, and scoped services.
- Do not run unrelated Effects with ad hoc `Effect.runPromise` if a runtime is
  already the app boundary.

### `Config`, `ConfigProvider`, `Redacted`

Use for:

- app/environment config
- redacted secrets
- test overrides

Review rules:

- Use `Config.redacted` for secrets.
- Use `Redacted.value` only at I/O boundaries.
- Do not serialize redacted raw values into traces.

## Errors And Outcomes

### `Exit`

Preserves the result of an Effect:

```txt
success | failure
```

Use in:

- resource cache entries
- mutation transaction receipts
- test harness facts
- runtime boundaries

### `Cause`

Preserves why an Effect failed:

```txt
typed failure
defect
interrupt
parallel/sequential combinations
annotations
```

Review rules:

- Do not collapse `Cause` into a string too early.
- Public snapshots may expose serializable projections, but internals should
  preserve the real `Cause`.
- Tests should distinguish typed failure, defect, and interrupt lanes.

### Tagged Failures

Use:

- `Schema.TaggedErrorClass` for errors crossing I/O, persistence, docs, or API
  boundaries.
- `Data.TaggedError` for internal typed failures that do not need codecs.
- `Match`, `Effect.catchTag`, and `Effect.catchTags` for handling.

Review rules:

- Do not throw expected domain failures.
- Do not branch on loosely shaped `error.message`.
- Prefer typed domain failures such as `ProjectConflict`,
  `ApprovalDenied`, `UploadFailed`, `ChatGenerationFailed`.

## Time, Duration, Schedule

### `Duration.Input`

Preferred public examples:

```ts
"30 seconds";
"250 millis";
"5 minutes";
```

Review rules:

- Do not document Flow-specific `{ millis }` or `{ milliseconds }` examples.
- Numeric millis may exist for interop, but examples should prefer readable
  strings.
- Use `Duration.fromInput` where user input should be validated safely.

### `Clock` And `DateTime`

Use inside Effect services for time.

Review rules:

- Do not use `Date.now()` in Effect services.
- Keep timestamps in snapshots serializable where public.
- Use `DateTime.now` or `Clock` to make time testable.

### `TestClock`

Use in deterministic tests.

Review rules:

- No real sleeps in tests.
- `flowTest.advance("30 seconds")` should drive `TestClock`.
- Tests should not depend on wall-clock timing.

### `Schedule`

Use for:

- retry
- repeat
- polling
- active resource refresh
- stream sampling
- backoff
- bounded attempts

Common names:

- `Schedule.spaced("30 seconds")`
- `Schedule.exponential("200 millis")`
- `Schedule.recurs(n)`
- `Schedule.while(...)`
- `Schedule.jittered`
- `Schedule.tapInput`
- `Schedule.tapOutput`

Review rules:

- Do not hand-roll retry loops or polling timers.
- `flow.after` is fine for one-shot state timers; repeated behavior should use
  `Schedule`.

## Streams, Queues, PubSub

### `Stream.Stream<A, E, R>`

Primary abstraction for ongoing values.

Use for:

- upload progress
- assistant progress
- LLM token/text deltas
- event sources
- polling streams
- callback sources

Constructors and adapters:

- `Stream.fromIterable`
- `Stream.fromEffectSchedule`
- `Stream.paginate`
- `Stream.fromAsyncIterable`
- `Stream.fromEventListener`
- `Stream.callback`

Operators:

- `Stream.map`
- `Stream.filter`
- `Stream.flatMap`
- `Stream.mapEffect`
- `Stream.take`
- `Stream.drop`

Consumers:

- `Stream.runCollect`
- `Stream.runDrain`
- `Stream.runForEach`
- `Stream.runFold`
- `Stream.runHead`
- `Stream.runLast`

Review rules:

- Do not make `AsyncIterable` the primary public service API.
- Use `Stream.fromAsyncIterable` only as an adapter.
- Route success, typed failure, defect, and interrupt explicitly when product
  semantics care.
- State exit and actor disposal must interrupt state-scoped streams.

### `Queue`

Use for:

- controlled stream handles in tests
- work queues
- backpressure semantics

Pressure names:

- `suspend`
- `dropping`
- `sliding`

Review rules:

- Prefer Effect's pressure names when semantics match.
- Do not invent ambiguous pressure vocabulary.

### `PubSub`

Use for:

- fanout
- subscriptions
- broadcast progress
- controlled stream tests

Pressure names:

- bounded
- dropping
- sliding
- unbounded
- replay where useful

Review rules:

- Use PubSub when multiple observers need the same stream events.
- Ensure subscription cleanup is tested.

## Cache, Resource, Batching, Persistence

### `Cache`

Effect cache language:

- `capacity`
- `lookup`
- `timeToLive(exit, key)`

Review rules:

- Use `capacity`, `lookup`, and `timeToLive` for lookup-cache semantics.
- Distinguish Effect cache TTL from Flow UI freshness.
- Cached exits can include failures.

Flow mapping:

```txt
Effect Cache       lookup reuse, capacity, TTL
Flow ResourceStore UI snapshots, freshness, invalidation, subscriptions
```

### `Resource`

Effect `Resource` models refreshable scoped values with:

- `manual`
- `auto`
- `get`
- `refresh`

Review rules:

- Consider Effect `Resource` for internals where scoped refreshable values match.
- Do not confuse Effect `Resource` with Flow `flow.resource`; Flow resources are
  UI-visible shared app data with snapshots and invalidation semantics.

### `RequestResolver`

Use for service-level batching.

Names:

- `Request.Class`
- `RequestResolver.make`
- `RequestResolver.setDelay`
- `RequestResolver.withSpan`
- `RequestResolver.withCache`
- `Effect.request`

Review rules:

- Do not invent a Flow batching API unless services using `RequestResolver` are
  still too noisy.
- Dashboard/readiness batching belongs naturally in services.
- Tests should prove batching with concurrent requests.

### `KeyValueStore`

Use as minimal durable storage boundary.

Review rules:

- Prefer schema encode/decode at persistence boundaries.
- Do not persist fibers, scopes, services, or live handles.

### `Persistable` / `PersistedCache`

Use when schema, primary keys, cached `Exit`, and TTL are all needed.

Review rules:

- Consider these before custom persistence/cache layers.
- Preserve typed failure and decode/migration failure as explicit states.

## Schema, Data, Identity, Redaction

### `Schema`

Use for values crossing:

- I/O
- HTTP/RPC
- persistence
- docs examples
- API contracts

Important names:

- `Schema.Class`
- `Schema.TaggedClass`
- `Schema.TaggedErrorClass`
- `Schema.brand`
- `Schema.Redacted`

Review rules:

- Do not hand-validate unknown external payloads when Schema should own the
  boundary.
- Use branded IDs where identity matters.
- Use schema-backed migrations/persistence for durable snapshots.

### `Data`

Use for internal tagged values that do not need codecs:

- `Data.TaggedClass`
- `Data.TaggedError`
- `Data.taggedEnum`

Review rules:

- Do not over-schema purely internal values.
- Do not under-type external or persisted values.

### `Brand` And `Newtype`

Use for nominal identity:

- project IDs
- launch IDs
- asset IDs
- actor IDs
- task IDs
- approval IDs

Review rules:

- Use brands/newtypes where primitive strings would blur domain boundaries.
- Do not drown simple examples in identity machinery where it adds no clarity.

### `PrimaryKey`, `Equal`, `Hash`

Use for stable identity and keying where needed.

Review rules:

- Flow resource keys need a reviewed identity policy.
- If public snapshots require serialization, separate runtime equality/hash from
  display/serialization keys.

### Redaction

Use:

- `Schema.Redacted`
- `Redacted`
- `Config.redacted`

Review rules:

- Trace redaction callbacks are a safety net, not the whole redaction model.
- Sensitive approval/customer/assistant values should be redacted at the data
  model/config boundary.

## Absence, Validation, Collections

### `Option`

Use for internal absence.

Review rules:

- Normalize `null | undefined` at boundaries.
- Do not use nullish internal state for drafts, selected task, optional approval
  decision, or optional resource data.
- React/JSON boundaries may use null when it is the natural shape.

### `Result`

Use for synchronous success/failure validation before Effect execution.

Examples:

- key encoding
- descriptor normalization
- persisted snapshot migration
- command validation

Review rules:

- Async/service failures belong in Effect.
- Pure sync validation can use Result when returning a typed validation result
  is cleaner than entering Effect.

### `Record`, `Array`, `Struct`, `Tuple`

Use for collection and object reshaping.

Review rules:

- Use `Record.map`, `Record.collect`, `Record.get`, `Record.modify`,
  `Record.filterMap`, or `Record.reduce` for finite records.
- Use `Array.head`, `Array.findFirst`, `Array.filterMap`, `Array.groupBy`,
  `Array.sortBy`, and non-empty array types where safety helps.
- Use `Struct.pick`, `Struct.omit`, and `Struct.evolve` where clearer than
  bespoke object spread helpers.
- Do not replace simple JavaScript `.map`/`.filter` if the local code is already
  clearer.

### `Match` And `Predicate`

Use for:

- tagged branching
- status unions
- property guards
- exhaustive matching

Review rules:

- Replace repeated `_tag`/status if-chains when `Match` improves exhaustiveness.
- Use `Predicate.hasProperty` or tag helpers instead of local unsafe guards.

### `Order`, `Equivalence`, Primitive Modules

Use for:

- sorting
- equality
- progress bounds
- numeric clamps
- domain ordering

Review rules:

- Prefer reusable comparison semantics over ad hoc sort/equality functions when
  repeated or domain-relevant.

## Runtime State, Concurrency, Lifecycle

### `Ref`, `SynchronizedRef`, `ScopedRef`

Use for:

- runtime mutable state
- serialized updates
- replaceable scoped resources

Review rules:

- Use `SynchronizedRef` when updates are effectful or must serialize.
- Avoid mutable module-level state.

### `Deferred` And `Latch`

Use for:

- controlled one-shot test effects
- coordination
- deterministic async tests

Review rules:

- Controlled test handles should be Deferred-backed where appropriate.
- Do not test async races with sleeps.

### `FiberSet`, `FiberMap`, `FiberHandle`

Use for:

- runtime-owned fibers
- keyed fetch/refresh work
- state-scoped streams
- child actor supervision

Review rules:

- Flow runtime ownership should map naturally to these structures.
- Disposal must interrupt owned fibers.

### `Semaphore`, `Pool`, `Scope`

Use for:

- bounded concurrency
- shared resource pools
- lifecycle/finalizer ownership

Review rules:

- Prefer scoped acquisition/finalization over manual cleanup flags.
- Use `Scope` for stream/listener/resource cleanup.

## Observability And Diagnostics

Effect observability uses:

- logs
- spans
- annotations
- span status payloads
- minimum log levels
- trace IDs / span IDs

Review rules:

- Prefer Effect spans/log annotations to bespoke diagnostic plumbing where
  possible.
- Flow traces should correlate Effect spans with resource, mutation, flow,
  stream, timer, and child-flow receipts.
- Public traces should be serializable and redaction-aware.

## Platform And Higher-Level Packages

Use these as Effect-native names when building examples or integrations.

### `Rpc` / `RpcGroup`

Schema-first remote contracts:

- payload
- success
- error
- defect
- stream
- primaryKey

Review rule:

- Do not casually invent a separate remote contract DSL if Effect RPC fits.

### `HttpApi`, `HttpApiGroup`, `HttpApiEndpoint`

Schema-first HTTP contracts.

Review rule:

- If examples need HTTP shape, prefer Effect platform contracts or keep service
  fakes simple.

### SQL

Effect SQL examples use:

- `SqlClient`
- repositories
- schema-aware queries
- transactions
- spans

Review rule:

- Keep DB logic in services/repositories; Flow should not own SQL semantics.

### CLI

Effect CLI commands are schema/config driven.

Review rule:

- If Flow examples expose CLI, let Effect CLI own argument/config parsing.

### Workflow / Activity / DurableClock

Effect has durable execution terms.

Review rule:

- Do not casually rename durable workflow semantics as Flow concepts unless Flow
  is intentionally providing a separate product abstraction.

### Persisted Queues And Rate Limiting

Effect packages model durable work and backoff pressure.

Review rule:

- Prefer existing durable queue/rate-limit concepts for long-running backend
  work; Flow frontend examples can stay contract-first.

## Reactivity And Subscriptions

Effect reactivity includes:

- atoms
- registries
- idle TTL
- subscriptions
- hydration state
- `SubscriptionRef`

Review rules:

- Use safe `SubscriptionRef.make`; do not rely on unsafe constructors.
- React subscriptions should detach cleanly.
- Offscreen UI should not duplicate streams or leak subscriptions.
- Actor disposal should interrupt active generation/upload/assistant work and
  run finalizers.

## Flow State Adoption Map

### Adopt Directly

Use these Effect names in public examples and implementation when applicable:

```txt
Effect
Layer
Context.Service
ManagedRuntime
Stream
Schedule
Duration.Input
Clock
DateTime
TestClock
Exit
Cause
Schema
Data
Option
Result
Redacted
Config
Queue
PubSub
RequestResolver
Cache
Ref
SynchronizedRef
ScopedRef
Deferred
Latch
FiberSet
FiberMap
FiberHandle
Semaphore
Pool
Scope
Record
Array
Struct
Tuple
Match
Predicate
Order
Equivalence
Brand
Newtype
Hash
Equal
PrimaryKey
```

### Adapt With Flow Semantics

Use Flow API names where Flow adds meaning:

```txt
flow.resource       shared app data + UI snapshot semantics
ResourceStore       cache entries, freshness, invalidation, subscribers
ResourceSnapshot    availability/activity/freshness axes
flow.mutation       write definition
flow.run            flow-side transaction execution
flow.machine        explicit process graph
flow.ensure         process dependency
flow.observe        data dependency
flow.refresh        refetch trigger
flow.patch          cache patch with receipts
flow.invalidate     staleness with observers/receipts
flow.stream         state-scoped stream routing/receipts
flow.after          one-shot state timer
flow.child          supervised child actor/flow
flow.view           UI read model over resources and flows
flow.app            module composition
App.layer           Flow services + app services Layer
flowTest            scenario harness facts and controls
```

### Avoid Or Defer

Avoid until proven necessary:

- Flow-specific aliases for Effect modules.
- Custom duration object shapes.
- Custom retry/polling/sampling DSLs.
- Custom batching API where `RequestResolver` fits.
- Custom schema/redaction systems where Effect Schema/Redacted fits.
- Query-cache terms copied from other ecosystems when Effect names are clearer.
- A durable workflow DSL unless Flow intentionally owns durable execution.

## Review Red Flags

Flag these hard:

- `Promise`-first domain logic in services/resources/mutations.
- `throw` for expected failures.
- `try/catch` around yielded Effects.
- `any`, broad `unknown`, `as never`, or cast-heavy generics.
- Internal `null | undefined` where `Option` should express absence.
- `Date.now()` in Effect services.
- Real sleeps in tests.
- Primary `AsyncIterable` service APIs.
- Custom cleanup flags instead of scopes/finalizers/interruption.
- Collapsing `Cause` into string logs before preserving runtime facts.
- Flow context duplicating canonical resource data.
- Views that only rename a machine snapshot instead of producing a real read
  model.
- Mutation code that hides optimistic patch, rollback, invalidation, or Effect
  exit.
- Resource snapshots reduced to `loading | success | error`.
- Effect requirement channels erased to make examples compile.
- Flow wrappers around Effect modules for aesthetics only.

## Flow vNext Example Expectations

For `examples/launch-workspace`, require:

- Domain schemas and branded IDs where they clarify boundaries.
- Services as `Context.Service`.
- Live/test/mock composition as `Layer`.
- Fake services allowed, but fake behavior must preserve final API shape.
- Resources for canonical data.
- Machines for process state only.
- Views as UI read models over resources plus multiple flow snapshots.
- Streams as `Stream` for uploads, assistant progress, and LLM text deltas.
- Time as `Duration.Input`, `Schedule`, `Clock`, and `TestClock`.
- Tests with direct Effect service tests plus Flow scenario tests.
- Normal test-runner assertions, not Flow-owned `.expect*` helpers.
- No real backend, auth, upload provider, or LLM provider required for the API
  proving phase.

## Minimal Pattern Library

### Service

```ts
export class ProjectApi extends Context.Service<ProjectApi>()("ProjectApi", {
  effect: Effect.gen(function* () {
    return {
      getProject: Effect.fn("ProjectApi.getProject")(function* (id: ProjectId) {
        // service implementation
      }),
    };
  }),
}) {}
```

### Resource Lookup

```ts
const byId = resource({
  key: (id: ProjectId) => ["project", id] as const,
  lookup: Effect.fn("Project.byId.lookup")(function* (id) {
    const api = yield* ProjectApi;
    return yield* api.getProject(id);
  }),
  cache: {
    capacity: 500,
    timeToLive: "10 minutes",
  },
  freshness: {
    staleAfter: "30 seconds",
    refresh: Schedule.spaced("30 seconds"),
  },
});
```

### Stream Service

```ts
const streamChat = Effect.fn("ChatApi.streamChat")(function* (input: ChatInput) {
  const api = yield* ChatApi;
  return api.streamText(input); // Stream.Stream<ChatDelta, ChatError, never>
});
```

### Test Time

```ts
await harness.advance("30 seconds");
```

Do not:

```ts
await new Promise((resolve) => setTimeout(resolve, 30_000));
```
