# Type-system contract

Status: normative vNext contract

This contract defines inference, variance, `Effect<A, E, R>` propagation, Layer closure, and
the required positive and negative compile proofs. Public authoring shapes are defined in
[`PUBLIC_API.md`](./PUBLIC_API.md).

The live package already preserves descriptor-local `A/E/R` for resources, transactions,
and streams (`packages/flow-state/src/core/api/flow-core.ts:72-86`,
`packages/flow-state/src/core/api/transaction-factory.ts:19-24`). The missing vNext rule is
transitive propagation through machines, modules, apps, runtimes, fixtures, and stories, as
identified by `reference/incident-console/IMPLEMENTATION_BLOCKERS.md:213-227`.

## Vocabulary and machine inference

### TYPE-001 — Vocabulary literals are inference anchors

`vocabulary({ id, states, events })` MUST preserve the literal `id`, exact state-name tuple,
event-property names, constructor parameter tuples, and constructor result payloads without
requiring `as const`.

```ts
const Todo = vocabulary({
  id: "Todos/Editor",
  states: ["READY", "SAVING"],
  events: {
    SaveRequested: (title: string) => ({ title }),
    SaveCompleted: null,
  },
});

type _State = Expect<Equal<StateOf<typeof Todo>, typeof Todo.S.READY | typeof Todo.S.SAVING>>;
type _Event = Expect<
  Equal<
    EventOf<typeof Todo>,
    ReturnType<typeof Todo.E.SaveRequested> | ReturnType<typeof Todo.E.SaveCompleted>
  >
>;
```

Event tokens MUST be nominal Flow values. A structurally similar function or object MUST NOT
be assignable as a token.

### TYPE-002 — The first machine argument is the sole state and event universe

`machine(vocabulary, callback)` MUST anchor inference to the first argument with `NoInfer` or
an equivalent one-way inference boundary. The callback MUST NOT widen or redefine the
vocabulary. Local `states` and `on` record keys MUST be checked against the vocabulary, while
initial states, targets, routes, outcomes, and capability checks MUST use the exact tokens.
This matches the settled inference boundary at
`reference/incident-console/DESIGN_DECISIONS.md:734-782`.

```ts
machine(Todo, (S) => ({
  initial: S.READY,
  states: {
    READY: { on: { SaveRequested: S.SAVING } },
    SAVING: {},
  },
}));

// INVALID
machine(Todo, (S) => ({
  initial: S.READY,
  states: {
    READY: { on: { UnknownEvent: S.SAVING } },
    SAVING: {},
  },
}));
```

### TYPE-003 — Machine input and memory have one inference path

When `memory` consumes actor input, its exact public shape MUST be
`memory: ({ input }: { readonly input: Input }) => Memory`. `InputOf<Machine>` and
`MemoryOf<Machine>` MUST be inferred from that callback. A callback that omits its argument,
`memory: () => Memory`, is the same function shape with `Input = void` and is the ordinary
root-machine form; it is not another constructor overload. When `memory` is absent,
`InputOf<Machine>` MUST be `void` and `MemoryOf<Machine>` MUST be a readonly empty record.

Automatically created module roots MUST require `InputOf<Machine> = void`. Dynamic actors,
child activities, and fresh stories MUST require the exact inferred input. This resolves B9
(`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:228-235`).

```ts
const editor = machine(Todo, (S) => ({
  memory: ({ input }: { readonly input: { readonly todoId: string } }) => ({
    todoId: input.todoId,
    draft: "",
  }),
  initial: S.READY,
  states: { READY: {}, SAVING: {} },
}));

type _Input = Expect<Equal<InputOf<typeof editor>, { readonly todoId: string }>>;
type _Memory = Expect<Equal<MemoryOf<typeof editor>, { todoId: string; draft: string }>>;
```

```ts
// INVALID: a non-void-input machine cannot be an automatic app root.
module({ id: "Todos", machines: [editor], views: [] });
```

### TYPE-004 — Transition callbacks narrow by causal event

Inside an `on.EventName` transition, `event` MUST be the exact return type of that event
token. Guards and `updateMemory` MUST receive readonly state, memory, snapshot, and primitive
registries. `updateMemory` MUST return `Partial<Memory>` and MUST reject unknown fields or
wrong field values.

```ts
SaveRequested: {
  target: S.SAVING,
  updateMemory: ({ event }) => ({ draft: event.title }),
}
```

The current package already proves event narrowing and invalid state targets in its older
grammar (`packages/flow-state/src/public-api-types.test.ts:4017-4066`); vNext MUST preserve
the proof while replacing string targets with tokens.

## Descriptor `A/E/R`

### TYPE-005 — Resources infer one exact parameter tuple and `Effect<A, E, R>`

For `lookup: (...params: P) => Effect.Effect<A, E, R>`, the resource MUST carry `P`, `A`,
`E`, and `R` without widening. `key`, `lookup`, `tags`, and `placeholder` MUST accept the
same directional tuple `P`. `resource.ref` MUST accept exactly `P` and preserve `A` and `E`
for typed snapshot lookup.

```ts
const project = resource({
  id: "projects.by-id",
  key: (id: `project-${number}`) => ({ id }),
  lookup: (id: `project-${number}`): Effect.Effect<Project, "missing", ProjectRepo> =>
    ProjectRepo.get(id),
});

project.ref("project-1");
// @ts-expect-error
project.ref("workspace-1");
```

The live directional proof is `packages/flow-state/src/public-api-types.test.ts:1372-1431`.

`tag(id)` MUST retain the literal non-empty ID as `Tag<Id>`. `invalidate` MUST accept only an
exact resource ref, a nominal `Tag`, or `CanonicalKeyInput`; it MUST reject arbitrary class
instances, functions, and the removed `createKey`/schema-tag forms.

### TYPE-006 — Transactions infer params, key, preview, result, error, and requirements

For `commit: (params: P) => Effect.Effect<A, E, R>`, the transaction MUST carry exact
`P/A/E/R`. `params` MUST infer `P`; `key: (params: P) => K` MUST infer the sole argument
type of `transaction.ref(K)`. Preview replacement values MUST be checked against their
resource refs. Success routes MUST receive `A`, failure routes MUST receive `E`, and failure
routes MUST be absent when `E = never`.

The transaction `params` callback MUST see the machine's exact readonly snapshot family and
`event: EventOf<Machine> | null`; it MUST NOT claim an event exists during eventless initial
activation. Transition callbacks remain narrowed to their exact accepted event.

```ts
const save = transaction({
  id: "projects.save",
  params: ({ event }) => ({ id: event.id, title: event.title }),
  key: ({ id }) => ({ id }),
  commit: ({ id, title }): Effect.Effect<Project, SaveError, ProjectRepo> =>
    ProjectRepo.save(id, title),
  routes: {
    success: (value) => ProjectEvents.E.Saved(value),
    failure: (error) => ProjectEvents.E.SaveFailed(error),
  },
});

save.ref({ id: "project-1" });
// @ts-expect-error
save.ref();
```

The current transaction inference proof already derives params, success, error,
requirements, and routed event types at
`packages/flow-state/src/public-api-types.test.ts:4069-4101`.

### TYPE-007 — Streams infer `Stream<A, E, R>` and child input remains exact

For `subscribe: (...) => Stream.Stream<A, E, R>`, the stream MUST carry exact `A/E/R`.
`outcomes.value` MUST receive `A`, `outcomes.failure` MUST receive `E`, and the failure
mapping MUST be absent for `E = never`. A child activity's `input` MUST return exactly
`InputOf<ChildMachine>` and its completion mapping MUST receive the exact child snapshot.

The current stream proof derives params, item, error, requirements, and routed event at
`packages/flow-state/src/public-api-types.test.ts:4103-4135`.

### TYPE-008 — Typed failures, defects, and interruptions remain distinct

Operation completion MUST inspect the complete `Cause`. Classification precedence MUST be:
defect when any defect exists, otherwise typed failure when any failure exists, otherwise
interruption when the Cause is interruption-only. Typed failure is `E`; defect and
interruption MUST NOT be widened into `E`. Runtime implementation MUST use `Effect.exit`,
not `Effect.result`, for operation completion. This is the B10 contract at
`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:237-255`.

## Transitive requirements and Layers

### TYPE-009 — Every reachable definition carries hidden requirements

Resource, transaction, stream, child, machine, module, app, fixture, story, and model types
MUST carry a hidden covariant requirements member. `RequirementsOf<T>` MUST expose the
resulting union without exposing the implementation brand.

For a machine, requirements MUST be the union of every resource lookup, transaction commit,
stream subscription, child-machine graph, and other Effectful descriptor reachable from its
states. A module MUST union its root graphs. An app MUST union its module graphs. Public views
MUST be validated against the graph and MUST NOT add requirements merely by selecting a ref.

```ts
type _MachineR = Expect<Equal<RequirementsOf<typeof projectMachine>, ProjectRepo | AuditLog>>;
type _AppR = Expect<Equal<RequirementsOf<typeof ProjectApp>, ProjectRepo | AuditLog>>;
```

### TYPE-010 — Runtime construction closes the app requirements exactly

The public overloads MUST behave as if declared:

```ts
function runtime<App extends AppDefinition<never>>(options: {
  readonly app: App;
  readonly boot?: RuntimeBootPayload<App>;
}): Runtime<App, never>;

function runtime<App extends AppDefinition<unknown>, LayerError>(options: {
  readonly app: App;
  readonly layer: Layer.Layer<RequirementsOf<App>, LayerError, never>;
  readonly boot?: RuntimeBootPayload<App>;
}): Runtime<App, LayerError>;
```

Equivalent subtyping that permits a Layer to provide a strict superset of app requirements
is valid, but the supplied Layer MUST have no remaining input requirements. Layer acquisition
errors MUST remain `LayerError`; they MUST NOT become `unknown` or disappear.

```ts
runtime({ app: PublicApp }); // valid only when RequirementsOf<PublicApp> is never
runtime({ app: ProjectApp, layer: ProjectLive });

// @ts-expect-error ProjectRepo remains unsatisfied
runtime({ app: ProjectApp });

// @ts-expect-error the Layer still requires DatabaseConfig
runtime({ app: ProjectApp, layer: ProjectLayerRequiringConfig });
```

The live package already tests that unresolved Layer requirements reject runtime construction
and acquisition errors remain exact (`packages/flow-state/src/public-api-types.test.ts:358-385`).

### TYPE-011 — Runtime Effect bridges accept only installed services

For `Runtime<App, LayerError>`, `runPromise` and `runPromiseExit` MUST accept only Effects
whose requirements are satisfied by the runtime's installed application Context.
`runPromiseExit` MUST return an Exit whose error channel includes both the Effect error and
`LayerError`. It MUST NOT claim that arbitrary services are installed. The current negative
proof is `packages/flow-state/src/public-api-types.test.ts:287-333`.

## Views, actors, stories, fixtures, and models

### TYPE-012 — Actor snapshots retain the exact machine family

`RootActor<Machine>` and `DynamicActor<Machine>` MUST preserve `StateOf`, `EventOf`,
`MemoryOf`, and all typed primitive registries reachable from `Machine`. `actor.send` MUST
accept only `EventOf<Machine>`. `actor.getSnapshot()` and `actor.snapshots` MUST expose the
same exact snapshot type. Registry `get` and resource `require` MUST preserve the ref or
definition's exact success and error types, and every discriminated union in `SNAPSHOTS.md`
MUST narrow without a cast.

### TYPE-013 — Views and React overloads reject foreign families

`view(machine, config)` MUST infer its selected type from `select`. `useView(view)` MUST be
available only for a public root view. `useView(actor, view)` MUST require that the actor and
view share the same machine family. No overload MAY infer through an equality callback.

```ts
const selected = useView(projectView);
const dynamicSelected = useView(projectActor, projectView);

// @ts-expect-error foreign actor/view pair
useView(todoActor, projectView);
```

### TYPE-014 — Story command and checkpoint types accumulate immutably

`story({ app, machine, start? })` MUST reject a machine outside the app graph. For a non-void
machine input, the constructor MUST require one of fresh exact input, a compatible snapshot,
or a compatible boot start; only a void-input machine may omit `start`. `send` MUST accept the
machine's exact event union. `perform` MUST accept only branded inert commands belonging to
installed fixture controls. Literal checkpoint names MUST accumulate as keys of
`run.checkpoints`, and duplicate literal names MUST fail while the plan is built.

```ts
const plan = story({ app: ProjectApp, machine: projectMachine })
  .send(Project.E.Opened("project-1"))
  .checkpoint("opened")
  .checkpoint("settled");

const run = await plan.run();
run.checkpoints.opened;
run.checkpoints.settled;
// @ts-expect-error
run.checkpoints.missing;
```

### TYPE-015 — Fixture output closes story app requirements

Fixture definitions MUST carry their Layer output, typed error, controls, and seed refs. The
union of fixtures installed by `.with({ fixtures })` MUST satisfy the story app's
requirements. A story with missing services MUST fail to compile. Fixture Layer input MUST be
`never`; a fixture MAY compose its own dependencies internally.

### TYPE-016 — Control commands expose only possible outcomes

`control.effect<Args, A, E>` MUST preserve the service argument tuple and `A/E`. Its call ref
MUST omit `.fail` when `E = never`. `control.stream<A, E>` MUST preserve emitted and failure
types and omit `.fail` when `E = never`. `perform` MUST reject raw Effects, promises,
callbacks, commands from an uninstalled fixture, and primitive status objects.

### TYPE-017 — Model paths retain the base story contract

`model(baseStory)` MUST preserve the base app, machine, fixtures, start mode, progress
policy, and existing checkpoint keys. Every discovered `path.story` MUST extend that same
story type with exact candidate events and MUST run to the ordinary `StoryRun` type. Pure
model options MUST NOT add an Effect requirement.

## Required compile proofs

### TYPE-P01 — Positive proofs

Compile fixtures MUST prove:

- exact vocabulary IDs, state tokens, event constructor args, and event payloads;
- state-key, event-key, event-narrowing, target-token, memory, and input inference;
- resource parameter tuples and resource `A/E/R`;
- transaction params, key/ref arity, preview values, route `A/E`, and commit `R`;
- stream params and `A/E/R`, child input, and child completion snapshot types;
- machine → module → app requirements union and Layer closure;
- actor snapshot/ref readers, view selection, and both valid React overloads;
- story fixture closure, command types, literal checkpoint accumulation, and model `path.story`;
- strict, isolated-modules, isolated-declarations, packed package, React 18, and React 19
  consumer modes. The live packed runner already owns those mode boundaries at
  `packages/flow-state/scripts/check-packed-consumers.mjs:367-417`.

### TYPE-P02 — Negative proofs

Compile fixtures using `@ts-expect-error` MUST prove rejection of:

- unknown states, events, targets, payloads, memory fields, and timer targets;
- root machines with non-void input;
- inconsistent resource callback tuples and noncanonical ref inputs;
- wrong transaction ref arity, key input, commit params, preview values, and routes;
- `failure` routes and control `.fail` when `E = never`;
- foreign view/actor families and module views bound to non-roots;
- missing Layer services, Layers with remaining inputs, and wrong-app boot payloads;
- story machines outside an app, missing fixture services, duplicate checkpoints, raw
  Effects/promises/callbacks in `perform`, and commands from uninstalled controls;
- model replay APIs, core builders from non-root routes, and private deep imports.

### TYPE-P03 — No erasure proof

Public declaration output MUST contain no `any` or assertion-based erasure in provider,
runtime, descriptor, actor, view, story, fixture, or model boundaries. The live architecture
test already rejects explicit `any` in key public runtime and provider surfaces
(`packages/flow-state/src/public-typing-architecture.test.ts:40-59`).
