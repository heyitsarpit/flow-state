# Runtime composition

Use this guide when a capability crosses several calls or a host runs many Effects. The compact
recipe is **Service → Layer → ManagedRuntime → host shutdown**. Keep operation data in arguments;
keep contextual capabilities in `R` until the composition edge provides them.

Exact exports, signatures, and member behavior belong to the [Context](../../effect-api-documentation/references/Context.md),
[Layer](../../effect-api-documentation/references/Layer.md), [ManagedRuntime](../../effect-api-documentation/references/ManagedRuntime.md),
[Request](../../effect-api-documentation/references/Request.md), and
[RequestResolver](../../effect-api-documentation/references/RequestResolver.md) references.

## Service → Layer → Runtime

### IF a reusable capability must travel through deep calls

- **THEN:** Declare a `Context.Service`, access it where used, implement it with a `Layer`, and
  provide that Layer once at the application boundary.
- **BECAUSE:** The deepest operation states its capability requirement without receiving wiring or
  host objects as ordinary parameters.
- **CHECK:** The operation's `R` still names the service until the composition edge; request data is
  still an argument.

```ts
import { Context, Effect, Layer, ManagedRuntime } from "effect";

class Users extends Context.Service<
  Users,
  { readonly find: (id: string) => Effect.Effect<User, UserError> }
>()("app/Users") {}

const findUser = (id: string) =>
  Effect.gen(function* () {
    const users = yield* Users;
    return yield* users.find(id);
  });

const UsersLive = Layer.effect(
  Users,
  Effect.succeed({ find: (id: string) => Effect.succeed({ id }) }),
);
const UsersTest = Layer.succeed(Users, {
  find: (id: string) => Effect.succeed({ id, source: "test" }),
});

const AppLive = UsersLive;
const runtime = ManagedRuntime.make(AppLive);
const readUser = (id: string) => runtime.runPromise(findUser(id));
```

`Layer.effect` constructs an implementation effectfully; `Layer.succeed` installs an already
constructed test value. `Effect.provide` removes the Layer's supplied requirements from the
program. The host owns `runtime` and calls `runtime.dispose()` during shutdown.

### IF one request needs a different implementation

- **THEN:** Use `Effect.provideService` at that request boundary; do not mutate the shared runtime or
  rebuild the application runtime.
- **BECAUSE:** The override is local to the returned Effect and leaves the host's default service
  unchanged.
- **CHECK:** If the override acquires resources, wrap the request in `Effect.scoped` and construct
  the resource-backed service through a Layer; do not leave a request-owned finalizer on the host.

```ts
const requestUser = findUser("42").pipe(
  Effect.provideService(Users, {
    find: (id) => Effect.succeed({ id, source: "request" }),
  }),
);
```

### IF the request-specific implementation owns a resource

- **THEN:** Build that variant with `Layer.effect` and `Effect.acquireRelease`, provide it inside
  `Effect.scoped`, and let the request Scope run its finalizer.
- **BECAUSE:** The request owns both the service instance and its cleanup; the host runtime keeps its
  long-lived services shared.
- **CHECK:** Assert the request finalizer before the next request starts and do not attach it to the
  host-owned runtime.

```ts
const RequestUsers = (requestId: string) =>
  Layer.effect(
    Users,
    Effect.acquireRelease(
      Effect.succeed({ find: (id: string) => Effect.succeed({ id, requestId }) }),
      () => Effect.sync(() => recordRequestClose(requestId)),
    ),
  );

const requestScopedUser = (requestId: string) =>
  Effect.scoped(findUser("42").pipe(Effect.provide(RequestUsers(requestId))));
```

### IF a service Layer depends on implementation services

- **THEN:** Capture those dependencies inside the Layer with `Layer.provide`; expose only the
  services and requirements the caller still needs.
- **BECAUSE:** Layer composition turns private wiring into a closed construction boundary instead of
  widening every caller's `R`.
- **CHECK:** Use `Layer.provideMerge` only when the dependency service must remain available to the
  downstream application Layer.

```ts
class Database extends Context.Service<
  Database,
  { readonly find: (id: string) => Effect.Effect<User, UserError> }
>()("app/Database") {}

const DatabaseLive = Layer.succeed(Database, {
  find: (id: string) => Effect.succeed({ id, source: "database" }),
});

const UsersLive = Layer.effect(
  Users,
  Effect.gen(function* () {
    const database = yield* Database;
    return { find: database.find };
  }),
).pipe(Layer.provide(DatabaseLive));
```

## Flow State ownership composition

### IF an app's ownership policy is a contextual capability

- **THEN:** Use the real `FlowAppOwnership` class-service and its `fromApp` Layer at the app
  composition edge; downstream services access it with `yield* FlowAppOwnership`.
- **BECAUSE:** Ownership is one app-scoped service, while the app's resource and machine indexes
  remain private to the implementation.
- **CHECK:** Provide the ownership Layer wherever `ResourceStore` or another owner-aware service is
  built; do not reconstruct ownership inside each operation.

The consuming package uses this class-service and value constructor:

```ts
export class FlowAppOwnership extends Context.Service<
  FlowAppOwnership,
  {
    readonly appId: string;
    readonly ownershipStatusFor: (machine: AnyFlowMachine) => FlowMachineOwnershipStatus;
    readonly ownsResourceDefinition: (definition: AnyResourceDefinition) => boolean;
    readonly ownsResourceRef: (ref: FlowResourceRef) => boolean;
  }
>()("flow-state/internal/FlowAppOwnership") {
  static fromApp(app: FlowAppDefinition) {
    const owners = ownershipForApp(app);
    const resources = resourceOwnershipForApp(app);
    return Layer.succeed(
      FlowAppOwnership,
      FlowAppOwnership.of({
        appId: app.id,
        ownershipStatusFor: (machine) =>
          owners.get(machine) ?? Object.freeze({ kind: "unregistered" }),
        ownsResourceDefinition: (definition) => resources.has(definition),
        ownsResourceRef: (ref) => {
          const definition = resourceDefinitionForRef(ref);
          return definition !== undefined && resources.has(definition);
        },
      }),
    );
  }
}
```

See the live source at [`app-ownership.ts`](/Users/arpit/Developer/flow-state/packages/flow-state/src/core/orchestrator/app-ownership.ts:203).
The app descriptor then feeds `FlowAppOwnership.fromApp(app)` into the service Layer that builds
`ResourceStore` and `OrchestratorSystem`.

## One runtime per host

### IF a non-Effect host runs many programs against one application environment

- **THEN:** Merge the application's Layers, create one `ManagedRuntime`, reuse it for requests, and
  dispose it from the host that created it.
- **BECAUSE:** The runtime caches the built service context and owns its Layer scope, fibers, and
  finalizers.
- **CHECK:** Do not create or dispose a runtime per request, render, or operation; reject runs after
  host shutdown.

```ts
const AppLive = Layer.mergeAll(UsersLive, DatabaseLive);
const runtime = ManagedRuntime.make(AppLive);

const handleRequest = (id: string) => runtime.runPromise(findUser(id));
const shutdown = () => runtime.dispose();
```

### IF a test must not share state with another test

- **THEN:** Give the test its own runtime and use `Layer.fresh` around the stateful application
  Layer; dispose that runtime in the test owner.
- **BECAUSE:** `Layer.fresh` prevents shared Layer memoization from reusing a stateful instance.
- **CHECK:** Assert both fresh state and finalizer execution; never use a process-global runtime as a
  test fixture.

```ts
const makeTestRuntime = () => ManagedRuntime.make(Layer.fresh(AppLive));
```

## Request to RequestResolver

### IF several Effects request keyed data during one resolution turn

- **THEN:** Define a typed `Request`, pass it to `Effect.request`, and choose a
  `RequestResolver` whose batch function completes results in entry order.
- **BECAUSE:** The request carries operation data while the resolver owns batching, grouping, delay,
  cache, and backend resolution policy.
- **CHECK:** Complete every entry exactly once; bound batch size and verify duplicate, missing, and
  backend-failure behavior.

```ts
import { Effect, Request, RequestResolver } from "effect";

interface GetUser extends Request.Request<User, UserError> {
  readonly _tag: "GetUser";
  readonly id: string;
}
const GetUser = Request.tagged<GetUser>("GetUser");

const getUserResolver = RequestResolver.make<GetUser>((entries) =>
  Effect.gen(function* () {
    const users = yield* loadUsers(entries.map(({ request }) => request.id));
    for (const entry of entries) {
      const user = users.get(entry.request.id);
      yield* Request.completeEffect(
        entry,
        user === undefined
          ? Effect.fail(missingUser(entry.request.id))
          : Effect.succeed(user),
      );
    }
  }),
);

const getUser = (id: string) =>
  Effect.request(GetUser({ id }), getUserResolver);
```

Use `RequestResolver.make` when a batch performs effectful I/O and must call a completion operation
for every entry. Add `RequestResolver.batchN` or `RequestResolver.setDelay` only when the backend
policy requires those bounds or coalescing windows.
