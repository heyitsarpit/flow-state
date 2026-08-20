# Story and testing API resolution proposal

Status: superseded by [STORY_IMPLEMENTATION_MOCKS.md](./STORY_IMPLEMENTATION_MOCKS.md)

Scope: CS-03, CS-04, and the Story-related part of CS-11 in
PRESERVATION_AUDIT.md.

This document is retained as historical evidence for the rejected control-based and
per-occurrence `simulate` design. It does not define the target API and must not be
copied into the implementation or normative contract. The accepted replacement is
the whole-function Implementation design in `STORY_IMPLEMENTATION_MOCKS.md`.

## Recommendation

Adopt four linked decisions:

1. simulate accepts only an opaque operation plan returned by the machine's named
   O catalogue. Its observation is inferred from that plan's operation family; no
   universal exported ObservationShape is added.
2. fixture({ controls, seeds, layer }) is an immutable requirement-closing
   descriptor. Controls are inert endpoint declarations plus fixture-installed
   Effect/Stream adapters. They do not create a Story runtime or replace a
   production owner.
3. behavior({ stories }) is the only constructor for the branded BehaviorGateway.
   The record key is the external Story ID. The brand privately carries the compiled
   app and Story records for the CLI; no decoded artifact or second registry is
   public.
4. The Todo proof uses four immutable machine Stories: load success, load
   failure/retry, add success, and add failure. Each runs through the production
   runtime, explicitly processes after controlled completion, reads checkpoints and
   run.end, and relies on automatic scoped cleanup.

These decisions preserve story.app, story.machine, story.actor, immutable plans,
exact actor targets, process, advanceTo, checkpoint, run.end, production bootstrap,
and REV-TEST-001 through REV-TEST-010.

## 1. Exact Story API

The testing route imports the following public values:

~~~ts
import type { Duration, Effect, Layer, Scope, Stream } from "effect";

import {
  actorRef,
  app,
  definition,
  machine,
  module,
  resource,
  runtime,
  transaction,
} from "flow-state";

import {
  behavior,
  control,
  fixture,
  story,
} from "flow-state/testing";
~~~

The three constructors retain the accepted signatures:

~~~ts
declare namespace story {
  function app<App>(
    runtimeFactory: RuntimeFactory<App>,
    options?: AppStoryOptions<App>,
  ): AppStory<App>;

  function machine<M>(
    machine: M,
    options?: MachineStoryOptions<M>,
  ): MachineStory<M>;

  function actor<M>(
    machine: M,
    options?: ActorRecipeOptions<M>,
  ): StoryActorRecipe<M>;
}
~~~

RuntimeFactory<App> is the same typed factory consumed by a live host. This
proposal does not reopen CS-01's complete discovery and construction record. It
does require that story.app accept that type, invoke it once per run, and reject
an already-created runtime or a bare app.

The conditional option shapes remain exact:

~~~ts
type AppStoryOptions<App> = FixtureOptions<App> & {
  readonly boot?: RuntimeBootPayload<App>;
  readonly maxTurns?: number;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
};

type MachineStoryOptions<M> = InputOptions<M> &
  SelectedContextOptions<M> &
  FixtureOptions<M> & {
    readonly maxTurns?: number;
    readonly title?: string;
    readonly description?: string;
    readonly tags?: readonly string[];
};

type ActorRecipeOptions<M> = InputOptions<M> & ContextBindingOptions<M>;
~~~

The implementation need not export these aliases. It must implement their exact
conditional behavior. maxTurns defaults to 100. Metadata is descriptive only;
it is not an external Story ID, app identity, machine identity, or runtime
identity.

The chain methods have these consumer-visible shapes:

~~~ts
interface MachineStory<M> {
  send(event: EventOf<M>): MachineStory<M>;
  simulate<P extends MachineOperationPlan<M>>(
    plan: P,
    observation: ObservationFor<P>,
  ): MachineStory<M>;
  setContext(context: SelectedContextOf<M>): MachineStory<M>;
  process(): MachineStory<M>;
  advance(duration: Duration.Input): MachineStory<M>;
  advanceTo(epochMilliseconds: number): MachineStory<M>;
  advanceToNextTimer(): MachineStory<M>;
  checkpoint<const Name extends string>(name: Name): MachineStory<M>;
  run(options?: { readonly signal?: AbortSignal }): Promise<MachineRun<M>>;
}

interface AppStory<App> {
  send<M extends AppTargetMachine<App>>(
    target: StoryActorRecipe<M> | ActorRef<M>,
    event: EventOf<M>,
  ): AppStory<App>;
  simulate<
    M extends AppTargetMachine<App>,
    P extends AppOperationPlan<M>,
  >(
    target: StoryActorRecipe<M> | ActorRef<M>,
    plan: P,
    observation: ObservationFor<P>,
  ): AppStory<App>;
  process(): AppStory<App>;
  advance(duration: Duration.Input): AppStory<App>;
  advanceTo(epochMilliseconds: number): AppStory<App>;
  advanceToNextTimer(): AppStory<App>;
  checkpoint<const Name extends string>(name: Name): AppStory<App>;
  run(options?: { readonly signal?: AbortSignal }): Promise<AppRun<App>>;
}
~~~

setContext is present only on machine Stories. Target-free send and simulate are
present only on machine Stories. App Stories never accept a machine family as a
target. A stable-ref target uses lookup-only runtime.getActor semantics.

Every builder method returns a new deeply frozen plan. The receiver is unchanged.
A plan contains only frozen command data, operation-plan values, target
recipes/refs, and metadata. It contains no live actor, runtime, mailbox, Effect,
callback, predicate, assertion, loop, or cleanup handle. run() is the only
execution boundary.

The public run() is one Promise host adapter. Its package-private implementation
is an Effect program with one scoped owner:

~~~ts
type ExecuteStory<M> = Effect.Effect<
  MachineRun<M>,
  FlowStoryExecutionError,
  Scope.Scope
>;
~~~

Concrete runtime and fixture requirements are provided inside production bootstrap
before this Effect reaches the Promise edge. The public error is the accepted
FlowStoryExecutionError envelope. It retains the complete public
Effect Cause.Cause<unknown> and the accepted checkpoints, end, failure-boundary,
cleanup, cancellation, and evidence facts. No new testing error hierarchy is
introduced.

## 2. Controlled operation plans and observations (CS-03)

### 2.1 Plan source

The named machine O catalogue is the only public plan factory. Operation plans are
opaque, inert, machine-branded values. These aliases describe inference only and
are not required exported types:

~~~ts
type MachineOperationPlan<M> =
  | ResourceLookupPlan<M>
  | ResourceSubscriptionPlan<M>
  | ResourceRefetchPlan<M>
  | TransactionCommitPlan<M>
  | StreamSubscriptionPlan<M>;

const loadPlan = todoMachine.O.todos.lookup({ listId: "inbox" });
const addPlan = todoMachine.O.addTodo.commit({
  listId: "inbox",
  title: "Write the contract audit",
});
~~~

The plan's executable P is retained by the admitted production binding. Its
canonical K is produced and validated by the operation family. The Story command
does not accept caller-supplied K, occurrence owner, generation, or lease epoch.
The runner matches the plan to the pending production occurrence by descriptor,
family, canonical K, actor incarnation, and occurrence. Plan object identity and
callback identity never select the occurrence.

This permits a Story author to reconstruct the same plan from the named O
catalogue without exposing a registry or requiring retention of a private
production plan. It also preserves the rule that executable P need not be
reconstructed from K.

### 2.2 Family-specific observation inference

Observation variants are deliberately family-specific. These aliases document the
exact inference used by ObservationFor<P>; they are not one exported generic
observation protocol.

~~~ts
type FiniteObservation<A, E> =
  | Readonly<{ occurrence: number; type: "success"; value: A }>
  | Readonly<{ occurrence: number; type: "failure"; error: E }>
  | Readonly<{ occurrence: number; type: "defect"; defect: unknown }>
  | Readonly<{ occurrence: number; type: "interruption" }>;

type ContinuingResourceObservation<A, E> =
  | Readonly<{ occurrence: number; type: "value"; value: A }>
  | Readonly<{ occurrence: number; type: "failure"; error: E }>
  | Readonly<{ occurrence: number; type: "defect"; defect: unknown }>
  | Readonly<{ occurrence: number; type: "interruption" }>;

type StreamObservation<V, E> =
  | Readonly<{ occurrence: number; type: "emission"; value: V }>
  | Readonly<{ occurrence: number; type: "completion" }>
  | Readonly<{ occurrence: number; type: "failure"; error: E }>
  | Readonly<{ occurrence: number; type: "defect"; defect: unknown }>
  | Readonly<{ occurrence: number; type: "interruption" }>;

type ObservationFor<P> =
  P extends FiniteResourcePlan<infer A, infer E> ? FiniteObservation<A, E> :
  P extends ResourceSubscriptionPlan<infer A, infer E>
    ? ContinuingResourceObservation<A, E> :
  P extends TransactionCommitPlan<infer A, infer E> ? FiniteObservation<A, E> :
  P extends StreamSubscriptionPlan<infer V, infer E> ? StreamObservation<V, E> :
  never;
~~~

Finite resource lookup/refetch and transaction commit accept terminal success,
failure, defect, or interruption. A continuing resource accepts value, failure,
defect, or interruption. A stream accepts emission followed by completion, failure,
defect, or interruption. Stream emissions retain the declaration occurrence; they
do not allocate new actor occurrences.

The observation enters the ordinary production completion kernel. The Story layer
replaces only the external adapter call. The production kernel still owns
admission, canonical identity, concurrency, generation/lease fencing, writes and
overlays, status, mapped events, evidence, and release.

### 2.3 Failure behavior

These failures happen before external execution is replaced and before Story state
is mutated:

- wrong family or descriptor;
- wrong canonical key or actor incarnation;
- missing, foreign, suspended, disposed, or unadmitted target;
- not-yet-admitted or already-settled occurrence;
- duplicate terminal observation for a shared generation; and
- stream terminal observation after terminal settlement.

The command fails through the package diagnostic already used by the production
operation boundary and becomes the primary diagnostic of FlowStoryExecutionError.
simulate does not create, cancel, retry, process unrelated work, or advance time.
The caller appends process() when it wants the mapped event and subsequent mailbox
work to run.

## 3. Controls and fixtures (CS-04)

### 3.1 Control declarations

control.effect and control.stream create immutable endpoint declarations. They do
not execute an Effect, allocate a fiber, create a queue, or register a global
control table.

~~~ts
type EffectControlDefinition<Args extends readonly unknown[], A, E> = Readonly<{
  readonly id: string;
  readonly kind: "effect";
  readonly _args?: (args: Args) => void;
  readonly _success?: (value: A) => void;
  readonly _failure?: (error: E) => void;
}>;

type StreamControlDefinition<V, E> = Readonly<{
  readonly id: string;
  readonly kind: "stream";
  readonly _value?: (value: V) => void;
  readonly _failure?: (error: E) => void;
}>;

declare const control: {
  effect<Args extends readonly unknown[], A, E>(
    options: { readonly id: string },
  ): EffectControlDefinition<Args, A, E>;
  stream<V, E>(
    options: { readonly id: string },
  ): StreamControlDefinition<V, E>;
};
~~~

The underscore fields are type-level notation only. They do not become runtime
properties. Control IDs are fixture-local identities, not operation descriptor
IDs, actor refs, canonical keys, or Story IDs. One installed Story run rejects
duplicate control IDs before bootstrap.

When a fixture is installed, its layer callback receives typed adapter functions:

~~~ts
type InstalledControls<C> = {
  effect<Args extends readonly unknown[], A, E>(
    definition: EffectControlDefinition<Args, A, E>,
  ): (...args: Args) => Effect.Effect<A, E>;
  stream<V, E>(
    definition: StreamControlDefinition<V, E>,
  ): Stream.Stream<V, E, never>;
};
~~~

control.effect(definition) preserves the service argument tuple and operation A/E.
The returned endpoint has no remaining R; the fixture Layer closes the application
service requirement that owns the endpoint. A stream preserves emitted V and failure
E; completion, defect, interruption, and cancellation remain owned by the
production stream kernel and its scope.

### 3.2 Fixture definition

fixture returns an immutable descriptor. Its layer is not called during fixture
construction, Story planning, or behavior discovery.

~~~ts
type FixtureDefinition<Id, Output, LayerError, Controls> = Readonly<{
  readonly id: Id;
  readonly controls: Controls;
  readonly seeds: readonly FixtureSeed[];
  readonly layer: (
    input: { readonly control: InstalledControls<Controls> },
  ) => Layer.Layer<Output, LayerError, never>;
}>;

declare function fixture<
  const Id extends string,
  const Controls extends readonly (
    | EffectControlDefinition<any, any, any>
    | StreamControlDefinition<any, any>
  )[],
  Output,
  LayerError = never,
>(options: {
  readonly id: Id;
  readonly controls: Controls;
  readonly seeds?: readonly FixtureSeed[];
  readonly layer: (
    input: { readonly control: InstalledControls<Controls> },
  ) => Layer.Layer<Output, LayerError, never>;
}): FixtureDefinition<Id, Output, LayerError, Controls>;
~~~

FixtureSeed is an inferred resource seed, not general state injection:

~~~ts
type FixtureSeed = Readonly<{
  readonly resource: ResourceDescriptor;
  readonly key: CanonicalKey;
  readonly value: unknown;
}>;
~~~

The actual constructor narrows key and value from the selected named resource; the
broad notation above is not exported. Seeds are applied through the package-private
construction-owned host-write capability before actor activation. They cannot write
actor memory, initial state, transaction outcomes, stream emissions, or Story
evidence. Todo needs no seed for external load/add results because those results
enter through simulate.

FixtureTupleClosing<R> is the readonly tuple constraint already used by story.app
and story.machine. Its combined Layer outputs provide every application
requirement in R. Scope.Scope is Flow-owned and excluded from the user-facing
requirement set. Extra immutable fixture outputs are allowed; missing services are
compile errors and a dynamic or malformed tuple fails again during production
bootstrap before actor activation.

### 3.3 TodoGateway requirement closure

The fixture for the Todo domain is:

~~~ts
const todoLoadControl = control.effect<
  readonly [string],
  readonly Todo[],
  TodoGatewayError
>({ id: "todo.gateway.list" });

const todoAddControl = control.effect<
  readonly [string, string],
  Todo,
  TodoGatewayError
>({ id: "todo.gateway.add" });

export const todoGatewayFixture = fixture({
  id: "todo.story.gateway",
  controls: [todoLoadControl, todoAddControl],
  layer: ({ control }) => {
    const list = control.effect(todoLoadControl);
    const add = control.effect(todoAddControl);

    return Layer.succeed(
      TodoGateway,
      TodoGateway.of({
        list: (listId) => list(listId),
        add: (listId, title) => add(listId, title),
      }),
    );
  },
});
~~~

TodoGateway is in RequirementsOf<TodoApp>. Therefore this is accepted:

~~~ts
const todoStory = story.machine(todoMachine, {
  input: { listId: "inbox" },
  fixtures: [todoGatewayFixture],
});
~~~

This is rejected before a run can begin:

~~~ts
// @ts-expect-error TodoGateway is not closed by the empty fixture tuple.
story.machine(todoMachine, {
  input: { listId: "inbox" },
  fixtures: [],
});
~~~

The fixture supplies one application service Layer to the same production runtime
that a live host uses. It does not create a test actor, test mailbox, fake scheduler,
fake store, fake snapshot, or alternate cleanup owner.

### 3.4 Layer, Scope, and failure ownership

| Concern | Owner | Public shape | Failure behavior |
| --- | --- | --- | --- |
| Control and fixture descriptors | Plain TypeScript | Frozen values | Synchronous validation for malformed IDs, duplicates, or invalid seeds |
| Application service capability | Effect Layer | Layer.Layer<Output, LayerError, never> | Layer failure aborts readiness; no actor or external work escapes |
| External operation result | Effect operation kernel | Effect.Effect<A, E, R> before fixture provision | E is classified by the production completion kernel |
| Actor, mailbox, store, scheduler, operation work | Production Flow runtime | Package-private Effect services | Typed failure, defect, interruption, and late completion retain their accepted distinctions |
| Fixture and runtime lifetime | One Story Scope / ManagedRuntime owner | No public fixture or plan dispose | Runtime disposal completes before fixture finalizers |
| Promise conversion | Story host boundary | plan.run(): Promise<Run> | Rejects with FlowStoryExecutionError; no nested runner inside the Effect workflow |

The runner builds one scoped production runtime with the fixture Layer. Story-local
actor recipe leases are released in reverse dependency order. The runtime then
disposes actors, stores, operations, context, lifecycle evidence, sinks, and queues.
Only after Flow-owned dependents are gone may fixture and host scopes finalize. A
fixture finalizer failure is an ordered cleanup diagnostic and is never dropped.

## 4. Behavior gateway and external Story IDs (CS-04 / CS-11)

### 4.1 Gateway constructor

behavior is a pure constructor over an explicit non-empty record. The record key is
the external Story ID. No Story plan gets an id field and no title is promoted to
identity.

~~~ts
type StoryRegistry = Readonly<
  Record<ExternalStoryId, AppStoryPlan<any> | MachineStoryPlan<any>>
>;

declare function behavior<const Stories extends StoryRegistry>(input: {
  readonly stories: Stories;
}): BehaviorGateway<CommonAppOf<Stories>>;
~~~

BehaviorGateway<App> is nominal and package-branded. A structural { stories }
object is not accepted by the CLI loader. Its package-private payload contains:

- the one compiled app identity and AppPlan;
- the immutable external-ID to Story-plan record;
- module and machine ownership projections needed by behavior discovery; and
- the package identity brand required by the CLI.

It contains no public decoded v2 artifact, public TurnRecord, runtime, fixture
Layer instance, actor handle, operation registry, or alternate Story runner. The
CLI reads the private payload through one package-private gateway inspection
function after checking the brand and package identity. It never reconstructs the
Story model or compiles a second app.

### 4.2 ID rules and discovery

External Story IDs are explicit registry keys such as "todo/load-success". They
must be non-empty, satisfy the authored-ID byte/control-character rules, and be
unique within the gateway. The registry key is stable CLI addressability only; it
is not actor identity, operation identity, persistence identity, or Story metadata.

behavior({ stories }) performs only synchronous pure work:

- validate the ID record and freeze it;
- validate every plan is immutable, inert, and from the same app boundary;
- reject mixed apps, foreign machines, unadmitted machines, and empty IDs; and
- retain the compiled app and Story records behind the brand.

It does not invoke RuntimeFactory, acquire a Layer, instantiate a fixture, create
an actor, start external work, run a Story, or load an artifact. Therefore
behavior build, behavior check, story list, and story describe remain inert. Only
story run crosses the production execution boundary.

The consumer-facing gateway is exactly:

~~~ts
const stories = {
  "todo/load-success": todoLoadSuccessStory,
  "todo/load-failure-retry": todoLoadFailureRetryStory,
  "todo/add-success": todoAddSuccessStory,
  "todo/add-failure": todoAddFailureStory,
} as const;

export const BehaviorGateway = behavior({ stories });
~~~

There is no app: TodoApp duplication in this expression. The app is obtained
from typed Story plans and retained in the private brand. A mixed-app record is
rejected synchronously by the constructor and again by the trusted CLI loader.

## 5. Source-faithful Todo Stories

The following code assumes the accepted Todo domain exports Todo, TodoGateway,
TodoGatewayError, TodoDefinition, todoMachine, and TodoApp built from the named
todos resource and addTodo transaction. It uses TodoGateway only to close the
production app requirement. It does not provide a test runtime.

### 5.1 Observations

~~~ts
const initialTodos = [
  new Todo({
    id: "todo-1",
    title: "Read the contract",
    completed: false,
  }),
] as const;

const addedTodo = new Todo({
  id: "todo-2",
  title: "Write the Story proposal",
  completed: false,
});

const loadFailure = new TodoGatewayError({
  operation: "read",
  reason: "unavailable",
});

const addFailure = new TodoGatewayError({
  operation: "add",
  reason: "duplicate-title",
});

const loadSuccessObservation = {
  occurrence: 1,
  type: "success",
  value: initialTodos,
} as const;

const loadFailureObservation = {
  occurrence: 1,
  type: "failure",
  error: loadFailure,
} as const;

const retryLoadSuccessObservation = {
  occurrence: 2,
  type: "success",
  value: initialTodos,
} as const;

const addSuccessObservation = {
  occurrence: 1,
  type: "success",
  value: addedTodo,
} as const;

const addFailureObservation = {
  occurrence: 1,
  type: "failure",
  error: addFailure,
} as const;
~~~

The retry uses occurrence 2: failed lookup consumed occurrence 1, and retry is
a new accepted event and a new finite operation occurrence. Reconstructing a plan
with the same P/K does not reset the ordinal.

### 5.2 Load success

~~~ts
export const todoLoadSuccessStory = story
  .machine(todoMachine, {
    input: { listId: "inbox" },
    fixtures: [todoGatewayFixture],
    maxTurns: 100,
    title: "todo load success",
  })
  .send(TodoDefinition.E.LoadRequested())
  .process()
  .simulate(
    todoMachine.O.todos.lookup({ listId: "inbox" }),
    loadSuccessObservation,
  )
  .process()
  .checkpoint("loaded");
~~~

The first process drains the event turn and stops at the controlled pending
lookup. simulate supplies only external success. The second process routes
ListLoaded through the ordinary mailbox and reaches READY. Simulation does not
process implicitly.

### 5.3 Load failure and retry

~~~ts
export const todoLoadFailureRetryStory = story
  .machine(todoMachine, {
    input: { listId: "inbox" },
    fixtures: [todoGatewayFixture],
    title: "todo load failure and retry",
  })
  .send(TodoDefinition.E.LoadRequested())
  .process()
  .simulate(
    todoMachine.O.todos.lookup({ listId: "inbox" }),
    loadFailureObservation,
  )
  .process()
  .checkpoint("load-failed")
  .send(TodoDefinition.E.RetryRequested())
  .process()
  .simulate(
    todoMachine.O.todos.lookup({ listId: "inbox" }),
    retryLoadSuccessObservation,
  )
  .process()
  .checkpoint("retried");
~~~

The failed load maps to ListLoadFailed, enters ERROR, and retains the prior
Todo list. RetryRequested is the only route back to a new lookup. The fixture
does not retry the Effect.

### 5.4 Add success

~~~ts
export const todoAddSuccessStory = story
  .machine(todoMachine, {
    input: { listId: "inbox" },
    fixtures: [todoGatewayFixture],
    title: "todo add success",
  })
  .send(TodoDefinition.E.LoadRequested())
  .process()
  .simulate(
    todoMachine.O.todos.lookup({ listId: "inbox" }),
    loadSuccessObservation,
  )
  .process()
  .checkpoint("loaded")
  .send(TodoDefinition.E.AddRequested("Write the Story proposal"))
  .process()
  .simulate(
    todoMachine.O.addTodo.commit({
      listId: "inbox",
      title: "Write the Story proposal",
    }),
    addSuccessObservation,
  )
  .process()
  .checkpoint("added");
~~~

The transaction success enters the ordinary TodoAdded handler, updates memory, and
returns to READY. No completion-side memory write exists in the fixture.

### 5.5 Add failure

~~~ts
export const todoAddFailureStory = story
  .machine(todoMachine, {
    input: { listId: "inbox" },
    fixtures: [todoGatewayFixture],
    title: "todo add failure",
  })
  .send(TodoDefinition.E.LoadRequested())
  .process()
  .simulate(
    todoMachine.O.todos.lookup({ listId: "inbox" }),
    loadSuccessObservation,
  )
  .process()
  .send(TodoDefinition.E.AddRequested("Read the contract"))
  .process()
  .simulate(
    todoMachine.O.addTodo.commit({
      listId: "inbox",
      title: "Read the contract",
    }),
    addFailureObservation,
  )
  .process()
  .checkpoint("add-failed");
~~~

The failed transaction enters ERROR and retains the loaded list. No implicit retry,
canonical write, or rollback claim is made. A later authored event may choose a
new transaction attempt.

### 5.6 Checkpoints, run.end, and cleanup

Evidence is read after execution from frozen captures, never from a live actor:

~~~ts
export async function readTodoSuccessEvidence() {
  const run = await todoAddSuccessStory.run();

  return {
    loaded: run.checkpoints.loaded.snapshot,
    added: run.checkpoints.added.snapshot,
    end: run.end.snapshot,
    now: run.end.runtime.now,
    pendingWork: run.end.runtime.pendingWork,
  };
}
~~~

run.end is automatic evidence captured after commands and before cleanup. It does
not mean the actor reached a final state. There is no public cleanup command:

~~~ts
await todoAddSuccessStory.run();
// The call has already closed Story-local leases, the Flow runtime, sinks,
// queues, and fixture scope on success, failure, and cancellation.
~~~

A deterministic cleanup proof may use a real scoped resource and a test-owned
observation log. The resource remains a normal Effect Layer resource; the test does
not replace the runtime:

~~~ts
const cleanup: string[] = [];

const observedTodoFixture = fixture({
  id: "todo.story.gateway.observed",
  controls: [todoLoadControl, todoAddControl],
  layer: ({ control }) =>
    Layer.effect(
      TodoGateway,
      Effect.acquireRelease(
        Effect.succeed(
          TodoGateway.of({
            list: (listId) => control.effect(todoLoadControl)(listId),
            add: (listId, title) => control.effect(todoAddControl)(listId, title),
          }),
        ),
        () => Effect.sync(() => cleanup.push("fixture")),
      ),
    ),
});

await story
  .machine(todoMachine, {
    input: { listId: "inbox" },
    fixtures: [observedTodoFixture],
  })
  .run();

expect(cleanup).toEqual(["fixture"]);
~~~

The important assertion is lifecycle ordering, not the string. A production-owner
probe should also record actor/runtime disposal and assert those records precede the
fixture finalizer. Every cleanup phase runs after execution failure, cancellation,
or an earlier cleanup failure. A cleanup failure rejects the run and retains
captured end when end capture completed.

## 6. Positive and negative compile examples

Positive examples must prove inference without public helper aliases:

~~~ts
const recipe = story.actor(todoMachine, {
  input: { listId: "inbox" },
});

const appStory = story.app(createTodoRuntime, {
  fixtures: [todoGatewayFixture],
});

const validResourceObservation = {
  occurrence: 1,
  type: "success",
  value: initialTodos,
} satisfies ObservationFor<
  ReturnType<typeof todoMachine.O.todos.lookup>
>;
~~~

The packed declaration proof must reject:

~~~ts
// @ts-expect-error A bare app is not a RuntimeFactory.
story.app(TodoApp, { fixtures: [todoGatewayFixture] });

// @ts-expect-error A machine Story cannot receive app boot.
story.machine(todoMachine, {
  input: { listId: "inbox" },
  boot,
  fixtures: [todoGatewayFixture],
});

// @ts-expect-error An actor recipe cannot receive Story metadata.
story.actor(todoMachine, {
  input: { listId: "inbox" },
  title: "not an actor option",
});

// @ts-expect-error A finite resource cannot receive a stream emission.
todoLoadSuccessStory.simulate(
  todoMachine.O.todos.lookup({ listId: "inbox" }),
  { occurrence: 1, type: "emission", value: initialTodos },
);

// @ts-expect-error A transaction cannot receive stream completion.
todoAddSuccessStory.simulate(
  todoMachine.O.addTodo.commit({ listId: "inbox", title: "x" }),
  { occurrence: 1, type: "completion" },
);

// @ts-expect-error Raw Effects are not operation plans.
todoAddSuccessStory.simulate(
  Effect.succeed(addedTodo),
  { occurrence: 1, type: "success", value: addedTodo },
);

// @ts-expect-error A machine family is not an app Story target.
appStory.send(todoMachine, TodoDefinition.E.LoadRequested());

// @ts-expect-error Machine Stories have target-free send.
todoStory.send(
  actorRef(todoMachine, "primary"),
  TodoDefinition.E.LoadRequested(),
);
~~~

Runtime negative proofs repeat the important cases with erased types: foreign plan,
wrong P/K, missing occurrence, occurrence 0, duplicate terminal observation,
suspended/disposed actor, uninstalled control, mixed-app gateway, duplicate
control ID, and a fixture Layer that fails during acquisition. Each fails before
external execution, actor/store mutation, evidence publication, or partial cleanup.

## 7. Minimum deterministic proof set

### Type and pure construction

- PROOF-001 and TYPE-014 through TYPE-016: all constructors, conditional options,
  exact targets, opaque plans, family-specific observations, and fixture closure.
- PROOF-002: plan, fixture, and behavior construction are inert; app identity is
  closed and mixed-app registries fail before acquisition.
- CUT-P02 and CUT-P03: raw Effects, old Scenario commands, generic observations,
  structural gateway lookalikes, and deleted target forms are rejected.

### Production operation proofs

- Load success: event admission, pending lookup, controlled success, ordinary
  mapped event, snapshot publication, and checkpoint.
- Load failure/retry: typed E, retained prior data, ERROR, new authored retry,
  occurrence 2, and successful recovery.
- Add success/failure: transaction success/failure lanes, explicit memory updates,
  no implicit write, and post-boundary classification.
- Wrong-kind and duplicate observations: family narrowing, generation/lease fencing,
  and already-settled rejection.

### Scope, cleanup, and parity

- Success, typed failure, defect, interruption, cancellation, and fixture Layer
  acquisition failure all close the same production runtime scope.
- Story-local recipes materialize with production runtime.createActor, dispose in
  reverse dependency order, and never dispose app-owned stable refs.
- A live host and equivalent Story sequence compare snapshots, pending work,
  operation facts/generations, mapped events, TurnRecords, and cleanup evidence.
- Gateway discovery and story list/describe prove no Layer, fixture, actor, runtime,
  or Story execution. story run and plan.run compare through one executor.

All asynchronous tests use Effect Clock/TestClock, controlled Deferred/Queue
barriers where needed, and scoped finalizers. No sleep, wall-clock race, or
real-network result is proof.

## 8. Contract decisions versus implementation choices

### Decisions to adopt

1. The constructor and command signatures in Sections 1 and 2.
2. Opaque named-O plans and family-specific observation inference.
3. The control declaration, installed adapter, fixture closure, and seed boundary.
4. External Story-ID record keys and the branded behavior({ stories }) gateway.
5. Production runtime, Layer, Scope, failure, cleanup, and parity ownership.
6. The Todo Stories and proof scenarios in Sections 5 and 7.

These are the contract-facing resolutions for CS-03, CS-04, and Story-related CS-11.
They should be transferred into owning normative API, type, testing, and CLI clauses
before implementation starts.

### Choices left to implementation

- the private symbol used to brand plans, controls, fixtures, and BehaviorGateway;
- the private adapter table connecting an installed endpoint to the one production
  external-execution interception point;
- eager or lazy deep freezing through one equivalent package freezer;
- internal Deferred, Queue, ManagedRuntime, SubscriptionRef, and Scope composition;
- the private decoded gateway record and its artifact projections; and
- host matcher syntax and cleanup-log instrumentation.

Implementation choices must not add a public operation registry, raw observation type,
fixture runtime, runtime-factory overload, or structural gateway escape hatch.

## 9. Alternatives rejected

| Alternative | Rejection reason |
| --- | --- |
| Export one generic ObservationShape | It accepts stream emissions for finite operations, loses A/E narrowing, and becomes a second protocol. |
| Accept raw Effect, Promise, callback, or result objects in simulate | It bypasses admission, identity, occurrence fencing, and production completion. |
| Add perform, deliver, receive, or control.resolve | They are deleted Scenario surfaces and split completion from production settlement. |
| Make fixture return a runtime or accept an existing runtime | It creates a testing owner and violates runtime/Scope parity. |
| Export structural { app, stories } gateway | It cannot prove package identity or mixed-app safety without a second validator. |
| Use title, array order, or generated hash as Story ID | Titles are descriptive, order is unstable, and generated identity is not consumer-owned. |
| Add cleanup() to Story | Cleanup is a runner guarantee; a command invites partial cleanup. |
| Build a pure Todo replay runner | REV-TEST-009 reserves pure models for command-empty machine plans. |

## 10. Interactions and non-goals

- CS-01: story.app consumes the eventual exact RuntimeFactory<App> and never adds
  a factory shape or overload. Request/SSR ownership remains outside this proposal.
- CS-02: finalized descriptor plan types supply MachineOperationPlan and
  ObservationFor. Story syntax remains unchanged if named family semantics remain.
- REV-OPS-015/017: completion, previews, retained data, transaction unknown,
  stream latest values, generation fencing, and late completions remain kernel
  semantics. simulate supplies only the external outcome.
- REV-HOST-008: fixture seeds use construction-owned host writes and never become
  post-start public writers. Todo uses no seeds.
- CS-08: FlowStoryExecutionError remains the accepted error envelope; no second
  diagnostic type is added.
- CS-09/CS-10: the branded gateway gives the trusted CLI one app/Story source;
  private v2 artifact and decoded evidence types remain private and shared.
- CS-11: Todo registry, external IDs, packed import, declaration negatives, direct
  Story run, CLI list/describe/run, and live/Story parity become the missing
  source-faithful evidence slice.

This proposal does not define persistence decoding, inspection projections,
request/SSR adapters, React hooks, pure model traversal, or the full RuntimeFactory
record. Those remain outside the requested blocker scope.
