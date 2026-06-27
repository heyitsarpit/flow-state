# Effect Runtime

Status: vNext reference draft.

Flow runtime is one Effect app runtime with several sibling services. The
ResourceStore and OrchestratorSystem must feel cohesive to users, but they
should remain independently mockable, testable, and replaceable.

```txt
FlowRuntime
  ResourceStore
  OrchestratorSystem
  Trace
  Clock / Scheduler
  ResourceRegistry
  App services
```

Effect provides the execution substrate:

- `ManagedRuntime` for the bridge from React/tests/hosts into Effect.
- `Context.Service` for services.
- `Layer` for live/test/mock composition.
- `Effect<A, E, R>` for success, typed failure, and required services.
- `Scope`, `FiberMap`, `FiberSet`, and `FiberHandle` for lifecycle ownership.
- `Clock`, `DateTime`, `Duration.Input`, `TestClock`, and `Schedule` for time.
- `Stream`, `Queue`, and `PubSub` for ongoing values and pressure.
- `Cache`, `RequestResolver`, `Resource`, `RcRef`, and `RcMap` for data-source
  internals where they fit.
- `Exit` and `Cause` for success, typed failure, defect, and interruption.

Flow provides the app semantics over that substrate.

## Runtime Creation

```ts
const App = flow.app({
  modules: [Session, Project, Checkout],
});

const AppLive = App.layer({
  store: flow.store.memory(),
  orchestrators: flow.orchestrators.live(),
  services: [ProjectApi.layer, AuthApi.layer, Logger.layer],
});

const runtime = flow.runtime(AppLive);
```

Target shape:

```ts
interface FlowRuntime<R = never, ER = never> {
  readonly managedRuntime: ManagedRuntime.ManagedRuntime<R, ER>;
  readonly resources: ResourceStore;
  readonly orchestrators: OrchestratorSystem;
  readonly trace: Trace;

  runPromise<A, E>(effect: Effect.Effect<A, E, R>): Promise<A>;
  runPromiseExit<A, E>(effect: Effect.Effect<A, E, R>): Promise<Exit.Exit<A, E | ER>>;

  dispose(): Promise<void>;
  disposeEffect: Effect.Effect<void>;
}
```

Rules:

- A runtime created from a Layer owns a `ManagedRuntime`.
- Runtime disposal interrupts actor-owned work, resource refresh fibers, streams,
  timers, and service scopes.
- React providers dispose runtimes they create. They do not dispose runtimes
  passed from outside unless explicitly configured to own them.
- Public snapshots do not expose service instances, scopes, fibers,
  `ManagedRuntime` internals, `Cache` maps, or Effect contexts.

## App Layers

App Layers should be ordinary Effect Layers plus Flow runtime services.

```ts
const AppLayer = Layer.mergeAll(
  ResourceStore.layerMemory,
  OrchestratorSystem.layerLive,
  Trace.layer,
  ProjectApi.layer,
  AuthApi.layer,
  Observability.layer,
);
```

Tests replace only the services they need:

```ts
const AppTest = Layer.mergeAll(
  ResourceStore.layerTest({
    seed: [[Project.byId("p1"), fakeProject]],
  }),
  OrchestratorSystem.layerTest,
  Trace.layerTest,
  ProjectApi.layerMock({
    getProject: () => Effect.succeed(fakeProject),
    saveProject: () => Effect.fail(new ProjectConflict(...)),
  }),
)
```

Flow helpers may make this ergonomic, but they should remain wrappers around
real `Layer`s. Do not invent a parallel dependency injection model.

## ResourceStore Service

ResourceStore is the shared memory of the app.

```ts
interface ResourceStore {
  get<A, E>(ref: ResourceRef<A, E>): ResourceSnapshot<A, E>;

  subscribe<A, E>(
    ref: ResourceRef<A, E>,
    listener: (snapshot: ResourceSnapshot<A, E>) => void,
  ): Effect.Effect<Unsubscribe>;

  ensure<A, E, R>(ref: ResourceRef<A, E, R>): Effect.Effect<A, E, R>;

  refresh<A, E, R>(ref: ResourceRef<A, E, R>): Effect.Effect<A, E, R>;

  invalidate(target: ResourceRef<any, any> | ResourceTag | ResourceFilter): Effect.Effect<void>;

  patch<A, E>(ref: ResourceRef<A, E>, patch: (current: A) => A): Effect.Effect<void>;

  transaction<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>;
}
```

ResourceStore uses Effect concepts internally:

- `Cache` for lookup sharing, `capacity`, and `timeToLive`.
- `Resource` for refreshable scoped values when scheduled refresh matters.
- `RequestResolver` for service-level batching.
- `Ref` or `SynchronizedRef` for safe concurrent updates.
- `FiberMap` for keyed refresh/fetch work.
- `Clock` / `DateTime` for timestamps.

ResourceStore exposes Flow snapshots, not raw Effect structures.

## OrchestratorSystem Service

OrchestratorSystem is the actor runtime for Flow machines. It is not another
business object and it is not the ResourceStore. It owns machine instances and
their lifetimes: starting a flow, queueing events, choosing legal transitions,
holding process context, supervising state-scoped work, publishing snapshots,
and interrupting work when the actor, state, parent, or whole runtime stops.

The reason it has a name is dependency composition. An app should be able to run
the same modules with a live actor system in production and a deterministic
actor system in tests, while still sharing the same ResourceStore, Trace, Clock,
and user services.

```ts
interface OrchestratorSystem {
  start<I, S>(flow: FlowDefinition<I, S>, input: I): Effect.Effect<ActorRef<S>>;

  send<E>(actor: ActorRef<any>, event: E): Effect.Effect<void>;

  snapshot<S>(actor: ActorRef<S>): Effect.Effect<S>;

  subscribe<S>(actor: ActorRef<S>, listener: (snapshot: S) => void): Effect.Effect<Unsubscribe>;
}
```

OrchestratorSystem uses Effect lifecycle primitives:

- `Scope` for runtime, actor, and state lifetimes.
- `FiberSet` for actor-owned background work.
- `FiberMap` for state-scoped descriptors by id.
- `FiberHandle` for replaceable one-slot work.
- `Queue` for actor mailboxes.
- `Semaphore` for transaction concurrency policies.
- `Clock.sleep` for one-shot timers.

The transition kernel remains deterministic. Effects, streams, timers, and
resource work run after transition selection through scoped Effect fibers.

Current implementation note: `flow.orchestrators.live()` and
`flow.orchestrators.test()` currently configure app-layer descriptors. The
target is for those descriptors to install this service as a real Effect Layer.
Until that lands, the current machine runner owns the implemented transition and
invoke behavior directly.

## Trace Service

Trace correlates all runtime facts:

```txt
event: SAVE
flow: Project.editor editing -> saving
transaction: Project.save started
store: preview patch Project.byId(p1)
api: ProjectApi.saveProject
api: failed ProjectConflict
store: rollback Project.byId(p1)
flow: Project.editor saving -> conflict
```

Trace receipts complement Effect logs/spans. They do not replace them.

Use Effect observability for execution:

- `Effect.fn("Domain.operation")`
- `Effect.withSpan`
- `Effect.annotateSpans`
- `Effect.annotateLogs`
- `Logger.layer`
- optional OpenTelemetry layers outside core

Flow receipts should include app semantics such as actor id, resource id,
request id, transition, key, tags, and optional `spanId` / `traceId` when
available.

## Failure Model

Every runtime-owned operation is interpreted through `Exit` / `Cause`.

```txt
Exit.Success(value)
Exit.Failure(Cause)
  Cause.Fail(error)       -> typed failure
  Cause.Die(defect)       -> defect
  Cause.Interrupt(fiber)  -> interruption
```

Rules:

- Typed failures are expected domain or infrastructure data.
- Defects are unexpected and should stay loud.
- Interruptions are cancellation, not failure.
- Preserve `Cause` internally. Public issues expose a serializable projection.
- Do not collapse all errors to `unknown`.

```ts
interface RuntimeIssue {
  readonly kind: "failure" | "defect" | "interrupt";
  readonly source: "resource" | "transaction" | "flow" | "stream" | "timer";
  readonly id: string;
  readonly requestId?: number;
  readonly handled: boolean;
  readonly reasons: readonly CauseReason[];
}
```

## Transactions

Transactions are ResourceStore write descriptors. The high-level API is terse:

```ts
saving: {
  invoke: flow.run(Project.save, {
    params: ({ ctx }) => Option.getOrThrow(ctx.draft),
    onSuccess: "viewing",
    onFailure: "conflict",
  }),
}
```

Internally it is a transaction:

```ts
flow.transaction("Project.save", ({ ctx }) =>
  Effect.gen(function* () {
    const store = yield* ResourceStore;
    const draft = Option.getOrThrow(ctx.draft);

    yield* store.patch(Project.byId(draft.id), (project) => ({
      ...project,
      ...draft,
    }));

    const api = yield* ProjectApi;
    const result = yield* api.saveProject(draft);
    yield* store.invalidate(Project.list());
    return result;
  }),
);
```

Rollback, invalidation, final state routing, and receipts are part of the same
traceable local transaction. That word is deliberately scoped. Flow can roll
back preview ResourceStore patches, record typed exits, mark cached data
stale, and route the owning machine. It cannot reverse a server write or make
remote effects atomic unless the application service exposes a compensating or
transactional protocol.

## Data-Flow Semantics

Resource read:

```txt
API service
  -> Resource.lookup Effect
  -> ResourceStore cache entry
  -> observers:
       components
       machines
       views
       devtools
       tests
```

Transaction:

```txt
Machine event SAVE
  -> saving state
  -> Project.save transaction
  -> preview ResourceStore patch
  -> API Effect
  -> success/failure/defect/interrupt
  -> cache invalidation or rollback
  -> machine transition
  -> UI update
```

Cache changes and machine changes are separate but traced together.

## Services

Side effects live behind Effect services.

```ts
export class ProjectApi extends Context.Service<
  ProjectApi,
  {
    readonly getProject: (id: ProjectId) => Effect.Effect<Project, ProjectLoadError>;
    readonly saveProject: (input: SaveProjectInput) => Effect.Effect<Project, ProjectSaveError>;
  }
>()("app/ProjectApi") {
  static readonly layer = Layer.effect(
    ProjectApi,
    Effect.gen(function* () {
      return ProjectApi.of({
        getProject: Effect.fn("ProjectApi.getProject")(function* (id) {
          return yield* fetchProject(id);
        }),
        saveProject: Effect.fn("ProjectApi.saveProject")(function* (input) {
          return yield* postProject(input);
        }),
      });
    }),
  );
}
```

Guidelines:

- Prefer `Context.Service` class syntax.
- Use `Effect.fn("Name")` for service methods and descriptor handlers.
- Compose production and test dependencies with `Layer.mergeAll`,
  `Layer.provide`, and `Layer.provideMerge`.
- Use `Config`, `Context.Reference`, and `Layer.unwrap` for runtime defaults
  when the choice belongs in Effect.
- Keep platform clients, SQL, HTTP, filesystem, workers, and AI providers in
  services/adapters, not Flow core.

## Non-Goals

- Do not make Flow a platform framework.
- Do not expose raw fibers, scopes, caches, resources, refs, service instances,
  or `ManagedRuntime` internals in public snapshots.
- Do not clone TanStack Query's whole option surface.
- Do not call Flow machines durable workflows unless durable execution,
  persistence, resume, compensation, and polling semantics actually exist.
