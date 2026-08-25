# Incident Console implementation guide

This is a non-normative implementation aid for the active Incident Console contract pack. It adds no
public API, behavior, default, compatibility rule, or proof obligation. Contracts remain normative;
accepted revisions override conflicts, and unresolved behavior is not an answer source. When this guide
disagrees with a contract, follow the contract.

Use the `effect-systems-design` skill for the plain-TypeScript-versus-Effect decision and ownership
composition. Use `effect-api-documentation` for exact exports, signatures, overloads, and examples. The
consuming package's installed `effect@4.0.0-beta.86` declarations, source, tests, and lockfile win over
the skills, `codebases/effect-v4`, or this guide. Each recipe block is labeled `Contract pseudocode`;
Flow-owned names remain illustrative.

## 1. Scope and authority

- The active authority is `reference/incident-console/implementation/contracts/` and its accepted revisions.
- This file is a compact routing aid. It is not a second contract, API catalog, task plan, or proof.
- Preserve `Effect<A, E, R>` requirements and failures until the owning runtime or host boundary handles them.
- Keep `AppPlan`, definitions, canonical identity, selectors, codecs, and model traversal inert and plain.
- A sketch is pseudocode unless its type and import are contract-defined and verified against beta.86.
- Do not promote a recipe into a public facade, compatibility alias, or new contract surface.

## 2. Compact contract map

Each row names only the boundary, the useful Effect concept, the owner/proof, and the plain alternative.

| Domain | Contract | Public boundary | Internal Effect concept | Owner / proof | Plain TypeScript alternative |
| --- | --- | --- | --- | --- | --- |
| Static foundation | [`GLOSSARY_AND_IDENTITY.md`](contracts/GLOSSARY_AND_IDENTITY.md) | Definitions, machines, actors, refs, `P`/`K`, generations, revisions, snapshots, Stories, artifacts | Effect only for live failure, time, concurrency, or lifetime; identity stays value-level | `AppPlan`, runtime incarnation, owner lease; `PROOF-001/002/005/012/014` | Branded strings/tuples, frozen records, unions, `Map`/`Set`, `Object.is` |
| Static foundation | [`PUBLIC_API.md`](contracts/PUBLIC_API.md) | Package routes; definitions, named `O` families, refs/leases, Runtime/React, Stories, inspection, CLI | Preserve operation `A/E/R`; close `R` at Runtime and translate at host edges | Package entrypoints and production owners; `API-P01–P04`, `PROOF-001–017` | Const generics, pure descriptors, explicit native adapters |
| Static foundation | [`TYPE_SYSTEM.md`](contracts/TYPE_SYSTEM.md) | Exact state/event/input/memory and operation inference; `Implementation` closure | Requirements propagate through `Effect` and `Layer`; no `any` or assertion erasure | Static foundation and Runtime; `TYPE-P01–P04`, `PROOF-001/002` | Recursive records, discriminated unions, native narrowing |
| Runtime and operations | [`ARCHITECTURE.md`](contracts/ARCHITECTURE.md) | `runtimeSetup(...).construct()`, `runtime.ready()`, `ensureActor`/`getActor`/`createActor`, synchronous `send` | One `ManagedRuntime`; owned `Queue`, `SubscriptionRef`, `Deferred`, `Scope`, fibers, and finalizers | `FlowRuntimeShell`, `ActorEngine`, `StoreKernel`, leases; `PROOF-002–004`, `HOST-P01/P05` | Inert setup and pure plan validation; no global runtime or ad hoc memoization |
| Runtime and operations | [`SEMANTICS.md`](contracts/SEMANTICS.md) | Mailbox turns, publication, named resource/transaction/stream states, authoritative writes | Queue ordering, `Deferred` acknowledgment, `SubscriptionRef` commit, scoped activities, generation fences | `ActorEngine` and `StoreKernel`; `PROOF-003–007`, `SNAP-P01` | Pure `TurnPlan`, reducer, projection, and closed status unions |
| Runtime and operations | [`SNAPSHOTS.md`](contracts/SNAPSHOTS.md) | Immutable actor snapshots and passive `O.key/getData/getState` reads | Runtime `Clock`; `TestClock` for deterministic deadlines; no Effect in passive reads | Actor publisher and StoreKernel; `SNAP-P01`, `PROOF-005/006/012` | Immutable projection functions and `Object.is` equality |
| Runtime and operations | [`REACT_AND_HOSTS.md`](contracts/REACT_AND_HOSTS.md) | `FlowProvider(runtime)`, `useActor`, `useActorByRef`, `useView`, request/SSR/host bridges | Managed runtime re-entry, external-store attachment, scopes, `runPromiseExit` | Runtime owns semantics; React owns attachment only; `HOST-P01–P05`, `PROOF-012` | Native host callback/external-store adapters at the edge |
| Hosts and execution | [`TESTING.md`](contracts/TESTING.md) | `story.app`, `story.machine`, `story.actor`, commands, checkpoints, `run.end` | Fresh production Runtime, `TestClock`, `Deferred` handshakes, scoped cleanup | Story runner and production kernels; `PROOF-008–011`, `HOST-P04/P05` | Pure model discovery, command builders, frozen checkpoints |
| Hosts and execution | [`CLI.md`](contracts/CLI.md) | Exact grammar/gateway, private result/error envelopes, streams, exit status, signals | Runtime/`Exit`/`Cause` at the process edge; filesystem and signals are scoped adapters | CLI owns process I/O and formatting; `CLI-P01/P02`, `PROOF-014/017` | Plain argument parsing and canonical formatting behind one adapter |
| Durability and evidence | [`PERSISTENCE_AND_ARTIFACTS.md`](contracts/PERSISTENCE_AND_ARTIFACTS.md) | `persistence({ storage, scope, codec?, filter? })`, WIRE-020B/C, capture and restore | Storage Effects, `Scope`, restore-before-activation, publication barrier, ordered writes | Runtime persistence coordinator and encoder; `PROOF-010/014`, `HOST-P04` | Pure codec, carrier walker, redaction projection; native storage adapter |
| Durability and evidence | [`ARTIFACT_WIRE.md`](contracts/ARTIFACT_WIRE.md) | Package-private v2 behavior/trace envelopes and export-only share envelope | Preserve `Cause`/`Exit` until wire projection; I/O stays at the encoder edge | Runtime truth, evidence sink, encoder; `WIRE-020B/C`, `PROOF-010/014` | Canonical sorting, bounds, freeze, and redaction as pure code |
| Cutover and workflow | [`COMPATIBILITY_AND_DELETIONS.md`](contracts/COMPATIBILITY_AND_DELETIONS.md) | Accepted replacements and fail-closed absence of deleted routes/shapes | No compatibility runtime, alias, adapter, parser branch, or second codec | Replacement package and packed consumers; `CUT-P01–P06`, `PROOF-017` | Negative compile/runtime checks and source audits only |
| Cutover and workflow | [`IMPLEMENTATION_WORKFLOW.md`](contracts/IMPLEMENTATION_WORKFLOW.md) | Slice records name clauses, owner, A/E/R, failure/lifetime lanes, proof, gates, and non-goals | Dependency order: static → runtime → operations → persistence/evidence → hosts/CLI → cutover | One production owner per fact; focused proof then applicable gates | Plain issue/check data; Beads remains outside this guide |
| Cutover and workflow | [`PROOF_MATRIX.md`](contracts/PROOF_MATRIX.md) | Proof crosswalk, local proof IDs, gate layers, and final package boundary | Test Layers, virtual time, explicit scopes, host bridges, and full `Cause`/cleanup evidence | `PROOF-001–017` and local `*-P` rows; proof owner is the production implementation | Test data and gate orchestration; scans never replace behavior proof |

## 3. Focused decision rules

### Plain TypeScript or Effect

- **IF** a function is deterministic, local, synchronous, and has no capability, cancellation, time,
  concurrency, observability, or release obligation, **THEN** keep it plain. This covers canonical
  `K`, state planning, selectors, codecs, redaction, formatting, and model traversal.
- **IF** it waits, forks, acquires, retries, performs I/O, observes time, or needs typed requirements,
  **THEN** use `Effect<A, E, R>` and keep `A`, `E`, and `R` honest.
- **IF** the only local result is success/failure or presence/absence, **THEN** use `Result` or `Option`;
  do not create an Effect merely to wrap a branch.
- **CHECK** every live resource, fiber, queue, cache, listener, subscription, and runtime has one owner.

### Service, Layer, and Runtime

- **IF** a capability travels through several calls, **THEN** make it a `Context.Service`, require it in
  `R`, build it with a `Layer`, and provide the Layer once at the composition edge.
- **THEN** pass `P`, `K`, commands, IDs, payloads, and limits as ordinary arguments. Do not make data a
  service because several functions read it.
- `Layer` owns construction and acquired dependencies; `ManagedRuntime` owns the built context and its
  scope; the host that created the runtime disposes it. `Layer.succeed` is for an existing test value;
  `Layer.effect` is for effectful or scoped construction.
- Flow's `RuntimeSetup` is the public owner of the Flow graph. Do not create a competing runtime or run
  Flow mutation through an unowned `runSync` path.

### Duration, Input, Clock, and TestClock

- **IF** a contract accepts a duration, name it as `Duration.Input` and convert only at the API that needs
  a concrete `Duration`; do not scatter millisecond arithmetic or `Date.now` through policy code.
- **IF** time affects a snapshot, deadline, retry, TTL, or timer, **THEN** read `Clock` in the runtime and
  replace it with `TestClock.layer()` in tests. Advance with `TestClock.adjust` or `setTime`, never sleep.
- Flow `Input` is fresh-actor data, used once by `memory: ({ input }) => Memory`; it is not runtime config,
  mutable context, or restored actor data. Restoration installs memory without replaying input.
- **CHECK** exact boundary behavior, absolute deadlines, equal-time ordering, and no time movement hidden
  inside `process()` or checkpoint capture.

### Cache and RcMap

- **IF** repeated effectful lookup should share in-flight work and retain bounded results, **THEN** use one
  runtime-owned `Cache` with explicit capacity and TTL. A Flow cache key must be the exact descriptor plus
  canonical `K` identity; do not reconstruct `P` from `K`.
- Treat `staleTime` as freshness policy and `gcTime` as retention/eviction policy. They are not synonyms:
  stale data may be served or refreshed according to the contract, while GC removes an idle entry.
- **IF** the value is a scoped resource whose lifetime follows references, **THEN** use `RcMap` with an
  explicit idle lifetime. `RcMap` owns leases and GC only; `StoreKernel` remains canonical data truth.
- **CHECK** capacity, equal-key identity, stale refresh, invalidation, lease epochs, and runtime disposal.

### Request and RequestResolver

- **IF** several effects request the same typed data in one turn, **THEN** define a `Request.Class` or
  tagged request, call it with `Effect.request`, and use a `RequestResolver` that batches or groups it.
  Resolver coalescing is not a database batch bound; the domain adapter owns backend chunking.
- Every accepted resolver entry must receive a validated success or typed failure. Set delay, grouping,
  and cache deliberately; apply the backend batch bound in the domain adapter, and never let an entry hang.
- **CHECK** entry order, duplicate keys, missing rows, schema failures, backing failure, bounded batches,
  and cancellation. Use a plain function for one local lookup with no coordination.

### Resource, Scope, Queue, and workers

- **IF** acquisition must be released, **THEN** use `Resource` or `Effect.acquireUseRelease` inside an
  owning `Scope`; never return a resource, worker, or handle from a closed `Effect.scoped`.
- **IF** work is concurrent, **THEN** define readiness, capacity, backpressure/drop policy, ordering,
  per-item settlement, drain, interruption, and shutdown before choosing `Queue`/`Deferred`/fibers.
- Use a bounded Queue unless the contract explicitly proves an unbounded mailbox and its memory policy.
  Attach workers to the runtime/parent owner and join or interrupt them before that owner closes.
- **CHECK** startup failure, queued waiter settlement, success/failure/defect/interruption, late results,
  queue shutdown, and cleanup after interruption.

### Cause and Exit at host boundaries

- **IF** supervision, cleanup, evidence, or diagnostics still need complete outcome truth, **THEN** retain
  `Exit` and its `Cause`; do not squash defects, typed failures, and interruption into one error early.
- **THEN** translate exactly once at HTTP, CLI, React, callback, or process edges. The translation may
  produce a response, diagnostic, exit status, or framework error, but must preserve contract categories.
- **CHECK** mixed causes, finalizer failures, cancellation, broken pipes, and whether accepted evidence
  drained before the host reports completion.

### Schema and public data

- Decode untrusted input once with a concrete `Schema`; encode output explicitly at the same public edge.
  Derive public types from that schema, keep public carriers separate from internal domain and WIRE carriers,
  and make schema facade methods expose those derived types.
- Use `Option` for absence, `Result` for a local expected branch, and `Match` for closed exhaustive
  projections. `Schema.Unknown` and internal `unknown` are not substitutes for `A`, `E`, or `R`.
- **CHECK** malformed input, exact error paths, extra/missing fields, canonical bounds, and no raw
  callbacks, Effects, live refs, or secrets in public/wire carriers.

### Persistence and observability

- Persistence is an explicit RuntimeSetup provider. It owns restore, capture, ordering, fencing, codec
  errors, and release; an in-memory Cache is never a durability guarantee. Restore and validate before
  activation or handle escape, and keep WIRE-020B as the sole raw wire authority.
- Put `Logger`, `Console`, `Metric`, and `Tracer` at service/host boundaries. Redact by allowlist before
  logging or tracing; keep domain values and errors telemetry-free.
- `Logger.formatJson` formats only. JSON console emission requires `Logger.withConsoleLog(Logger.formatJson)`.
  Use `TestConsole.layer` for captured host output and Layer overrides for Story/host tests.
- **CHECK** persistence restart, last-good-record retention, bounded telemetry attributes, exporter flush,
  TestConsole capture, TestClock control, and cleanup of observability resources.

## 4. Six practical recipes

### A. Construct once, cross readiness, expose owned services

**Contract pseudocode**

```ts
import { Effect } from "effect"

declare const hostStorage: Storage
declare const applicationPersistenceCodec: PersistenceCodec // synchronous, pure application codec
declare const decodeWire020B: (bytes: Uint8Array) => Wire020B // package-private Flow-owned; verify-before-coding

const persistenceProvider = persistence({
  storage: webStorage(hostStorage),
  scope: "user:42",
  codec: applicationPersistenceCodec,
  filter: ({ kind }) => kind !== "stream",
})

const setup = flow.runtimeSetup({
  app: IncidentApp,
  implementation: IncidentLive,
  persistence: persistenceProvider,
}) // pseudo-code: returns the contract-owned RuntimeSetup

const runtime = setup.construct()

const serve = Effect.gen(function*() {
  yield* runtime.ready()
  const lease = runtime.ensureActor(IncidentRefs.primary, {
    input: { accountId: "account-1" },
    contextBindings,
  })
  lease.actor.send(Incident.E.RefreshRequested())
  return { actor: lease.actor, dispose: lease.dispose }
})
```

- **Public API:** `RuntimeSetup.construct()`/`setup.construct()`, sole `runtime.ready()`, exact actor lease,
  and synchronous `actor.send(event)`; the host owns disposal.
- **Internal Effect:** inert `AppPlan` first; one Flow-owned `ManagedRuntime` then owns Implementation, scopes,
  queues, fibers, stores, activities, persistence, and finalizers. No handle escapes before readiness.
- **Alternative:** keep setup and plan validation plain; use a native host adapter only outside Flow's
  state/order/lifetime ownership. Never create a process-global runtime.
- **Proof:** `ARCH-001/007/007A/008/009`, `HOST-001/006`, `PROOF-002–004`, `HOST-P01/P05`.

### B. Separate stale freshness from GC retention with one shared cache identity

**Contract pseudocode**

```ts
import { Cache, Clock, Duration, Effect, Layer, RcMap } from "effect"
import { TestClock } from "effect/testing"

type P = Readonly<{
  readonly accountId: string
  readonly region: string
  readonly program: Effect.Effect<ResourceValue, ResourceError>
}>
type Identity = Readonly<{ readonly descriptorId: string; readonly k: readonly [string, string] }>
type ResourceValue = Readonly<{ readonly id: string; readonly revision: number }>
type Cached = Readonly<{ readonly value: ResourceValue; readonly fetchedAt: number }>
type LiveBinding = Readonly<{ readonly p: P; readonly identity: Identity }>

const staleTime: Duration.Input = "30 seconds"
const gcTime: Duration.Input = "5 minutes"

const StoreKernelLive = Layer.scoped(StoreKernel, Effect.gen(function*() {
  const cache = yield* Cache.make<Identity, Cached, ResourceError>({
    capacity: 256,
    timeToLive: gcTime,
    lookup: (identity) => loadFromLiveBinding(identity), // package-private helper uses retained P
  })
  const rcMap = yield* RcMap.make({
    lookup: acquireScopedResource,
    idleTimeToLive: gcTime, // explicit RcMap idle lifetime derived from the GC policy
  })

  const read = (binding: LiveBinding) => Effect.gen(function*() {
    const entry = yield* Cache.get(cache, binding.identity)
    const now = yield* Clock.currentTimeMillis
    return now - entry.fetchedAt < Duration.toMillis(staleTime)
      ? entry.value
      : yield* refreshSingleFlight(binding.identity, binding.p.program) // domain helper owns one refresh per identity
  })

  return { cache, rcMap, read }
}))

const sharedRead = (binding: LiveBinding) => Effect.gen(function*() {
  const kernel = yield* StoreKernel
  return yield* kernel.read(binding)
})

const deterministicRead = (binding: LiveBinding) => sharedRead(binding).pipe(Effect.provide(TestClock.layer()))
```

- **Public API:** named resource methods own `P`, `key(P)` produces canonical `K`, and passive `getData`/
  `getState` reads never acquire work. The cache is private to the runtime.
- **Internal Effect:** one `StoreKernel` Layer constructs `Cache` and `RcMap` once per Runtime; live bindings
  retain executable `P`/`program`, descriptor+`K` remains identity, and the domain helper makes stale refresh
  single-flight. `RcMap` owns leases/GC, not canonical StoreState.
- **Alternative:** a plain `Map<Identity, Cached>` is enough for a pure synchronous projection with no TTL,
  concurrency, or release semantics. It is not persistence.
- **Proof:** `API-005/006`, `SEM-008–014`, `SNAP-003–005`, `PROOF-005/006`, with `Clock`/`TestClock`
  assertions at just-before, at, and just-after stale/GC boundaries.

### C. Batch typed requests and validate every result

**Contract pseudocode**

```ts
import { Effect, Request, RequestResolver, Schema } from "effect"

type Incident = Readonly<{ readonly id: string; readonly status: "open" | "closed"; readonly message: string }>
type IncidentRow = Readonly<{ readonly id: string; readonly status: string; readonly message: string }>
type LookupError = NotFound | InvalidIncident | RepositoryError // pseudo-code: contract-owned errors

const GetIncidentInputSchema = Schema.Struct({ id: Schema.String })
type GetIncidentInput = Schema.Schema.Type<typeof GetIncidentInputSchema>

class GetIncident extends Request.Class<GetIncidentInput, Incident, LookupError> {
  constructor(readonly id: GetIncidentInput["id"]) { super({ id }) }
}

const IncidentSchema = Schema.Struct({
  id: Schema.String,
  status: Schema.Literal("open", "closed"),
  message: Schema.String,
})

const DB_CHUNK_SIZE = 64
const findManyBounded = (ids: readonly string[]) =>
  Effect.forEach(chunks(ids, DB_CHUNK_SIZE), (chunk) => IncidentRepository.findMany(chunk), { concurrency: 1 })
    .pipe(Effect.map(mergeRows)) // domain adapter owns the database bound

const resolver = RequestResolver.make<GetIncident>((entries) => Effect.gen(function*() {
  const rows: ReadonlyMap<string, IncidentRow> = yield* findManyBounded(
    entries.map(({ request }) => request.id),
  )
  yield* Effect.forEach(entries, (entry) => {
    const row = rows.get(entry.request.id)
    const result = row === undefined
      ? Effect.fail(new NotFound({ id: entry.request.id }))
      : Schema.decodeUnknownEffect(IncidentSchema)(row).pipe(
          Effect.mapError((error) => new InvalidIncident({ id: entry.request.id, error })),
        )
    return Request.completeEffect(entry, result)
  }, { concurrency: 1 })
}))

const getIncident = (id: string) => Effect.request(new GetIncident(id), resolver)
```

- **Public API:** the request input type is derived from `GetIncidentInputSchema`; the resolver is private;
  callers receive `Incident` or contract-owned `LookupError`, never a raw repository row.
- **Internal Effect:** `RequestResolver.make` coalesces entries but supplies no database batch bound; the
  domain adapter chunks IDs at `DB_CHUNK_SIZE` and the resolver completes every entry through Schema decode.
- **Alternative:** use a plain `Map` lookup when there is no batching, async dependency, or coordination.
- **Proof:** `TYPE-005/009/010`, `SEM-010/011`, `PROOF-005/007`; test duplicate/missing IDs, invalid rows,
  repository failure, batch bounds, order, and cancellation.

### D. Own a bounded worker until settlement, drain, or interruption

**Contract pseudocode**

```ts
import { Cause, Deferred, Effect, Fiber, FiberSet, Layer, Queue } from "effect"

type Work = Readonly<{
  readonly id: string
  readonly run: Effect.Effect<void, WorkError>
  readonly settled: Deferred.Deferred<void, WorkError>
}>
type Worker = Readonly<{
  readonly submit: (id: string, run: Effect.Effect<void, WorkError>) => Effect.Effect<void, WorkError>
  readonly drain: Effect.Effect<void, WorkError>
  readonly close: Effect.Effect<void, never>
}>

const WorkerLive = Layer.scoped(WorkerService, Effect.gen(function*() {
  const queue = yield* Queue.bounded<Work, Cause.Done>(32)
  const fibers = yield* FiberSet.make()
  const ready = yield* Deferred.make<void, WorkError>()
  const queued = new Set<Work>()
  const active = new Set<Work>()
  let accepting = true

  const fiber = yield* Effect.gen(function*() {
    yield* Deferred.succeed(ready, undefined) // signal immediately after worker startup
    yield* Effect.forever(
      Queue.take(queue).pipe(
        Effect.flatMap((work) => Effect.gen(function*() {
          // submit, take, start, and close share one lifecycle lock.
          if (!accepting) {
            queued.delete(work)
            yield* Deferred.fail(work.settled, new WorkError({ id: work.id, reason: "closed" }))
            return
          }
          queued.delete(work)
          active.add(work)
          yield* FiberSet.run(fibers, work.run.pipe(
            Effect.matchCauseEffect({
              onFailure: (cause) => Deferred.failCause(work.settled, cause),
              onSuccess: () => Deferred.succeed(work.settled, undefined),
            }),
            Effect.ensuring(Effect.sync(() => active.delete(work))),
            Effect.asVoid,
          ))
        })),
        Effect.catchIf(Cause.isDone, () => Effect.void),
      ),
    )
  }).pipe(Effect.forkScoped)
  yield* Deferred.await(ready)

  const submit = (id: string, run: Effect.Effect<void, WorkError>) => Effect.gen(function*() {
    // lifecycle lock: check admission and enqueue atomically with close
    if (!accepting) return yield* Effect.fail(new WorkError({ id, reason: "closed" }))
    const work = { id, run, settled: yield* Deferred.make<void, WorkError>() }
    queued.add(work)
    const accepted = yield* Queue.offer(queue, work)
    if (!accepted) {
      queued.delete(work)
      return yield* Effect.fail(new WorkError({ id, reason: "rejected" }))
    }
    return yield* Deferred.await(work.settled)
  })
  const drain = Effect.gen(function*() {
    accepting = false
    yield* Queue.end(queue)
    yield* Fiber.join(fiber)
    yield* FiberSet.awaitEmpty(fibers)
  })
  const close = Effect.gen(function*() {
    accepting = false // under the lifecycle lock: no queued work can start after this point
    yield* Queue.shutdown(queue) // discard queued messages; queued Set still owns their Deferreds
    for (const work of queued) yield* Deferred.fail(work.settled, new WorkError({ id: work.id, reason: "closed" }))
    for (const work of active) yield* Deferred.fail(work.settled, new WorkError({ id: work.id, reason: "closed" }))
    yield* Fiber.interrupt(fiber)
    yield* Fiber.interruptAll([...fibers]) // this sketch's close policy cancels active work
    yield* FiberSet.awaitEmpty(fibers)
  })
  return { submit, drain, close }
}))
```

- **Public API:** expose only the contract's operation/actor boundary; worker handles are local to the
  owning use and never escape a closed Scope.
- **Internal Effect:** the service `Layer`/Scope owns acquisition, the long-lived `forkScoped` fiber, use,
  and release. `Queue.offer` false is a rejected submission; drain uses a `Queue<A, Cause.Done>` and handles
  `Cause.Done`. Close stops admission first, shuts down the Queue, settles queued and active `Deferred`s,
  interrupts active fibers according to policy, and awaits both the worker and `FiberSet.awaitEmpty`.
- **Alternative:** a plain loop is better for finite synchronous work. Do not use an unbounded Queue
  without an explicit memory and shutdown policy.
- **Proof:** `ARCH-009/012/015/025`, `SEM-001/006/020/021`, `PROOF-003/004/007`; cover startup failure,
  queued waiters, drain order, typed failure, defect, interruption, late completion, and Scope close.

### E. Decode and encode at one public edge; translate Cause once

**Contract pseudocode**

```ts
import { Cause, Effect, Exit, Match, Option, Result, Schema } from "effect"

const Input = Schema.Struct({ id: Schema.String })
const Output = Schema.TaggedUnion({
  Found: { id: Schema.String, status: Schema.String },
  Missing: { id: Schema.String },
})
type IncidentInput = Schema.Schema.Type<typeof Input>
type IncidentOutput = Schema.Schema.Type<typeof Output>
type InternalIncident = Readonly<{ readonly id: string; readonly status: "open" | "closed"; readonly message: string }>

const decodeInput: (raw: unknown) => Effect.Effect<IncidentInput, Schema.SchemaError> =
  Schema.decodeUnknownEffect(Input)
const encodeOutput: (value: IncidentOutput) => Effect.Effect<Schema.Codec.Encoded<typeof Output>, Schema.SchemaError> =
  Schema.encodeEffect(Output)

const findLocal = (rows: ReadonlyMap<string, InternalIncident>, id: string) =>
  Option.fromNullishOr(rows.get(id))

const lookup = (rows: ReadonlyMap<string, InternalIncident>, input: IncidentInput) =>
  findLocal(rows, input.id).pipe(Result.fromOption(() => ({ _tag: "NotFound" as const, id: input.id })))

const classify = (cause: Cause.Cause<LookupError>) =>
  Result.isSuccess(Cause.findDie(cause)) ? "defect"
    : Result.isSuccess(Cause.findFail(cause)) ? "failure"
    : Cause.hasInterruptsOnly(cause) ? "cancelled"
    : "defect"

const edge = (raw: unknown, rows: ReadonlyMap<string, InternalIncident>) => {
  const program = decodeInput(raw).pipe(
    Effect.flatMap((input) => {
      const result = lookup(rows, input)
      return Result.match(result, {
        onFailure: (error) => Effect.succeed({ _tag: "Missing" as const, id: error.id }),
        onSuccess: ({ id, status }) => Effect.succeed({ _tag: "Found" as const, id, status }),
      })
    }),
    Effect.flatMap(encodeOutput),
  )
  return Effect.exit(program).pipe(Effect.map((exit) => Exit.match(exit, {
    onSuccess: (body) => ({ status: 200, body }),
    onFailure: (cause) => Match.value(classify(cause)).pipe(
      Match.when("cancelled", () => ({ status: 499 })),
      Match.when("defect", () => ({ status: 500 })),
      Match.when("failure", () => ({ status: 400 })),
      Match.exhaustive,
    ),
  })))
}
```

- **Public API:** the HTTP/CLI/React edge accepts encoded input and emits encoded output; `IncidentInput`
  and `IncidentOutput` are concrete schema-derived types.
- **Internal Effect:** public schema carriers stay at the edge while `InternalIncident` remains domain-only;
  `Option` models absence, `Result` the expected branch, and `Cause` classification gives defect precedence,
  then typed failure, then interruption-only before `Match` closes the response union.
- **Alternative:** native `switch`/`Map` is enough for one trusted in-memory union; still decode/encode
  external data at the boundary.
- **Proof:** `API-002/016/017`, `TYPE-001/004`, `WIRE-014–020C`, `HOST-015`, `PROOF-010/014`; prove
  exact paths, missing data, defect/interruption mapping, and no `Schema.Unknown` widening.

### F. Make persistence and observability explicit, then override the host in tests

**Contract pseudocode**

```ts
import { Console, Context, Deferred, Effect, Fiber, FiberSet, Layer, Logger, Metric } from "effect"
import { TestClock, TestConsole } from "effect/testing"

declare const hostStorage: Storage
declare const applicationPersistenceCodec: PersistenceCodec // synchronous, pure application codec
declare const decodeWire020B: (bytes: Uint8Array) => Wire020B // package-private Flow-owned; verify-before-coding
const HostAdapter = Context.Service<Host>("Incident/HostAdapter") // beta.86 service key
declare const fakeHost: Host
declare const redactForLog: (value: Readonly<{ readonly status: string }>) => Readonly<{ readonly status: string }> // allowlist; secrets omitted
declare const timerProgram: (onRegistered: Effect.Effect<void>) => Effect.Effect<void, IncidentError> // Flow-owned timer signals after registration

const persistenceProvider = persistence({
  storage: webStorage(hostStorage),
  scope: "user:42",
  codec: applicationPersistenceCodec,
  filter: ({ kind, id }) => kind !== "stream" || id === "incident.updates",
})

const setup = flow.runtimeSetup({
  app: IncidentApp,
  implementation: IncidentLive,
  persistence: persistenceProvider,
}) // pseudo-code: restore/activation stay inside RuntimeSetup

const requests = Metric.counter("incident_requests_total")
const observed = (operation: Effect.Effect<void, IncidentError, Host>) => operation.pipe(
  Effect.withSpan("incident.operation"),
  Effect.onExit(() => Metric.update(requests, 1).pipe(
    Effect.andThen(Console.log(redactForLog({ status: "complete" }))),
  )),
)

const ObservabilityLive = Logger.layer([
  Logger.withConsoleLog(Logger.formatJson),
])
const TestHost = Layer.mergeAll(
  Layer.succeed(HostAdapter, fakeHost),
  TestClock.layer(),
  TestConsole.layer,
  ObservabilityLive,
)
const storyRun = Effect.gen(function*() {
  const testFibers = yield* FiberSet.make()
  const timerReady = yield* Deferred.make<void>()
  const timer = yield* FiberSet.run(testFibers, timerProgram(
    Deferred.succeed(timerReady, undefined).pipe(Effect.asVoid),
  ))
  yield* Deferred.await(timerReady) // explicit timer-registration/readiness handshake
  yield* TestClock.adjust("30 seconds")
  yield* Fiber.join(timer)
  yield* FiberSet.awaitEmpty(testFibers) // cleanup assertion
  yield* incidentStory.run() // production Story kernel; TestHost supplies capabilities only
}).pipe(Effect.provide(TestHost)) // TestHost never replaces RuntimeSetup or its production runtime
```

- **Public API:** persistence is a RuntimeSetup provider; Stories and hosts use the same production
  runtime and accept only explicit Layer/test-host overrides. `TestHost` is only a test-layer/host-capability
  override; it never replaces `RuntimeSetup`, the production runtime, or the Story kernel.
- **Internal Effect:** Runtime owns restore-before-activation, ordered writes, `DehydrateBarrier`, and release;
  the package-private WIRE-020B decoder verifies before coding. Logger/Console, Metric, and Tracer stay at
  the host boundary; `redactForLog` is an explicit allowlist projection, and JSON output uses
  `Logger.withConsoleLog(Logger.formatJson)`.
- **Alternative:** a pure codec and native memory adapter are sufficient for a non-durable unit test;
  they do not prove persistence or host lifecycle. Use `Layer.succeed` for a value override.
- **Proof:** `WIRE-000–024`, `HOST-013–017`, `REV-TEST-001–010`, `PROOF-008–014`, `HOST-P04/P05`; test
  restart, malformed/wrong-version data, write fencing, redaction, captured output, metrics, spans,
  success/failure/interruption, timer registration before `TestClock.adjust`, and cleanup.

## 5. Implementation order and verify-before-coding checklist

1. **Static foundation:** definitions, recursive machine types, exact `P`/`K`, `AppPlan`, and `Implementation` inference.
2. **Runtime ownership:** `RuntimeSetup`, readiness/rollback, actor admission, leases, mailbox, snapshots, and StoreKernel.
3. **Operations:** named resource/transaction/stream kernels, generation fencing, explicit writes, and continuing ownership.
4. **Durability and evidence:** persistence provider, capture barrier, WIRE-020B/C, sinks, Cause projection, and redaction.
5. **Hosts and cutover:** React, Stories, CLI, packed consumers, deletion absence, and final gates.

Before coding a slice, verify:

- [ ] Exact active contract clauses, accepted revisions, production owner, non-goals, and proof IDs are named.
- [ ] Every selected beta.86 export, signature, import path, Layer output/error/requirements, and scope behavior is checked in the two Effect skills plus the consuming package.
- [ ] A/E/R, input versus `P`, canonical `K`, ownership, bounds, cancellation, settlement, and host translation are explicit.
- [ ] No handle escapes a closed scope; no Effect is ignored; no unbounded queue, `Schema.Unknown`, or unknown-based A/E/R erasure is hiding a design choice.
- [ ] The focused executable proof can disprove ordering, failure, interruption, time, persistence, redaction, cleanup, or deletion claims before broader gates run.
