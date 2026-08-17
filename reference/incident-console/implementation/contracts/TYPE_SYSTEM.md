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

## Definition and machine inference

### TYPE-001 — Definition literals are inference anchors

`definition({ id, states, events, memory? })` MUST preserve the literal `id`, exact state-name
tuple, event-property names, constructor parameter tuples, constructor result payloads, input,
and memory without requiring `as const`. Its implementation signature MUST use TypeScript
`const` type parameters for literal-bearing inputs, or an equivalently precise
implementation-owned inference mechanism. Userland MUST NOT need `as const`, `satisfies`,
explicit generic arguments, or a helper wrapped around the definition literal to prevent
widening.

```ts
const Todo = definition({
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
`StateOf<T>` and `EventOf<T>` MUST accept either the definition or its machine and return the
same exact token unions.

### TYPE-002 — The definition is the sole static inference universe

`machine(definition, ({ S, E, activity }) => config)` MUST anchor state, event, input, and memory
inference to the first argument with `NoInfer` or an equivalent one-way inference boundary. The
second callback MUST receive the exact kit and MUST NOT widen or redefine the definition. Local
`states` and `on` record keys MUST be checked against the definition, while initial states,
targets, routed outcomes, and capability checks MUST use the exact tokens.

```ts
machine(Todo, ({ S }) => ({
  initial: S.READY,
  states: {
    READY: { on: { SaveRequested: S.SAVING } },
    SAVING: {},
  },
}));

// INVALID
machine(Todo, ({ S }) => ({
  initial: S.READY,
  states: {
    READY: { on: { UnknownEvent: S.SAVING } },
    SAVING: {},
  },
}));
```

### TYPE-003 — Definition input and memory have one inference path

When definition `memory` consumes actor input, its exact public shape MUST be
`memory: ({ input }: { readonly input: Input }) => Memory`. `InputOf<Definition>`,
`MemoryOf<Definition>`, `InputOf<Machine>`, and `MemoryOf<Machine>` MUST all resolve from that
one callback. A callback that omits its argument, `memory: () => Memory`, fixes `Input = void`.
When `memory` is absent, input MUST be `void` and memory MUST be a readonly empty record.

Automatically created module roots MUST require `InputOf<Machine> = void`. Dynamic actors,
child activities, and fresh stories MUST require the exact inferred input. This resolves B9
(`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:228-235`).

```ts
const Editor = definition({
  id: "Todos/Editor",
  states: ["READY", "SAVING"],
  events: { SaveRequested: null },
  memory: ({ input }: { readonly input: { readonly todoId: string } }) => ({
    todoId: input.todoId,
    draft: "",
  }),
});

const editor = machine(Editor, ({ S }) => ({
  initial: S.READY,
  states: { READY: {}, SAVING: {} },
}));

type _DefinitionInput = Expect<Equal<InputOf<typeof Editor>, { readonly todoId: string }>>;
type _DefinitionMemory = Expect<Equal<MemoryOf<typeof Editor>, { todoId: string; draft: string }>>;
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
`E`, and `R` without widening. `lookup`, `tags`, and `placeholder` MUST accept the same
directional tuple `P`. `resource.ref` MUST accept exactly `P`, preserve `A` and `E` for typed
snapshot lookup, and use the canonical tuple itself as identity. A second resource `key`,
custom hash, or equality callback MUST be rejected.

```ts
const project = resource({
  id: "projects.by-id",
  lookup: (id: `project-${number}`): Effect.Effect<Project, "missing", ProjectRepo> =>
    ProjectRepo.get(id),
});

project.ref("project-1");
// @ts-expect-error
project.ref("workspace-1");
```

The live directional proof is `packages/flow-state/src/public-api-types.test.ts:1372-1431`.

`tag(id)` MUST retain the literal non-empty ID as `Tag<Id>`.
`activity.invalidate` MUST accept only an exact resource ref or nominal `Tag`; it MUST reject
canonical-key filters, arbitrary class instances, functions, and the removed standalone
`invalidate`, `createKey`, and schema-tag forms.

In addition to a direct static target, the machine-local activity kit MUST accept one computed
invalidation binding with this semantic shape:

```ts
activity.invalidate({
  targets: (snapshot) => readonlyInvalidationTargetsOrNull,
});
```

The selector MUST be contextually typed from the exact parent machine snapshot, including the
causal `event: EventOf<Machine> | null`, and MUST return only a readonly
`InvalidationTarget` list or `null`. `null` means that no binding exists. A concrete list MUST be
canonically deduplicated in first-seen order; an empty result normalizes to no binding and a
non-empty result is materialized into binding identity. The app and machine carriers MUST NOT
retain the selector's authored type graph as a recursive generic
argument. Arbitrary store predicates, Effects, Promises, nested target arrays, canonical-key
filters, and untyped strings MUST remain invalid.

### TYPE-006 — Transactions infer execution independently from parent bindings

For `commit: (params: P) => Effect.Effect<A, E, R>`, the transaction descriptor MUST carry
exact `P/A/E/R`. `key: (params: P) => K` MUST infer the sole argument type of
`transaction.ref(K)`, and preview replacement values MUST be checked against their resource
refs. The descriptor MUST carry no parent machine, memory, event, selector, or route type.

`activity.run(transaction, binding)` MUST contextually type `binding.params` with the parent
machine's exact readonly snapshot and `event: EventOf<Machine> | null`. Its result MUST be
`P | null`. `outcomes.success` MUST receive `A`, `outcomes.failure` MUST receive `E`, and the
failure mapping MUST be absent when `E = never`.

`invalidates` MUST accept either a readonly `InvalidationTarget` list or a callback whose
`params` field is the exact `P` and whose return is that readonly list. Exact resource refs and
nominal tags are the only invalidation targets; the callback MUST NOT widen transaction params or
introduce a canonical-key filter or store predicate type.

```ts
type SaveParams = Readonly<{ id: string; title: string }>;

const save = transaction({
  id: "projects.save",
  key: ({ id }: SaveParams) => ({ id }),
  commit: ({ id, title }): Effect.Effect<Project, SaveError, ProjectRepo> =>
    ProjectRepo.save(id, title),
});

activity.run(save, {
  params: ({ event }) =>
    event?.type === ProjectEvents.E.SaveRequested.id ? { id: event.id, title: event.title } : null,
  outcomes: {
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

### TYPE-007 — Stream and child descriptors do not infer through a parent

For `subscribe: (...params: P) => Stream.Stream<A, E, R>`, the stream descriptor MUST carry
exact `P/A/E/R` and no parent selector or routed event. A child descriptor MUST carry only its
stable ID, exact child machine, and the child machine's requirements. `activity.stream` and
`activity.child` contextually type the parent selectors and outcomes: stream values receive
`A`, stream failures receive `E`, child input returns exactly `InputOf<ChildMachine>`, and
child completion receives the exact child snapshot. Failure mappings MUST be absent for
`E = never`; that rule applies to streams only because child machines have no typed failure
channel. Child bindings may type exact complete, defect, and interrupt mappings, while planned stop
has no route.

For a zero-argument transaction, zero-parameter stream, or `void`-input child, the descriptor-only
activity overload MUST compile and the optional second argument may contain only exact outcomes.
The child completion parameter MUST be `ActorSnapshot<ChildMachine>`, preserving its exact
timer-name and primitive-binding registries; deriving it as
`MachineSnapshot<ChildMachine["definition"]>` is forbidden because that widens the machine family.

Stream params MAY be any exact tuple during ordinary execution. A running stream can participate
in durable capture only when its materialized tuple satisfies the canonical carrier; otherwise
`dehydrate()` fails with `NonDurableActiveStreamParams`. This restriction MUST be visible in the
host failure contract without weakening ordinary stream parameter inference.

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
resulting application-provided union without exposing the implementation brand. Descriptor
internals retain their raw `R`, but Flow executes activities through `Effect.scoped`, so
`RequirementsOf<T>` MUST remove `Scope.Scope`; callers never provide the Scope owned by Flow's
ManagedRuntime.

For a machine, requirements MUST be the union of every resource lookup, transaction commit,
stream subscription, child-machine graph, and other Effectful descriptor reachable from its
states. A module MUST union its root graphs. An app MUST union its module graphs and every graph
seeded by its exact `dynamicMachines` tuple. Public views MUST be validated against the graph and
MUST NOT add requirements merely by selecting a ref.

```ts
type _MachineR = Expect<Equal<RequirementsOf<typeof projectMachine>, ProjectRepo | AuditLog>>;
type _AppR = Expect<Equal<RequirementsOf<typeof ProjectApp>, ProjectRepo | AuditLog>>;
```

`app({ ..., dynamicMachines: [editorMachine] })` MUST preserve the exact admitted machine tuple
without `as const`. Admission contributes the machine and its transitive requirements to the app
carrier, but it MUST NOT widen the machine family, require a construction input at app definition
time, or make the machine a root accepted by `runtime.actor` or `useActor`.

### TYPE-009A — Public carriers are normalized and acyclic

Resource, transaction, stream, child, machine, module, and app declarations MUST carry their
already-computed type slots through private covariant brands. `RequirementsOf<T>` MUST read the
normalized carrier directly; it MUST NOT recursively re-walk an authored state config, selector,
outcome map, preview patch list, or child config whenever a consumer asks for requirements.
Public `Machine` types MUST NOT retain their complete authored config as a generic argument.

The static carrier direction MUST be definition and machine-independent descriptors → machine
bindings → module or explicit app dynamic seed → app. A child descriptor may point only to an
already-declared machine, so self-recursive and mutually recursive child definition graphs MUST
fail without a public lazy thunk or deferred-definition overload. `dynamicMachines` is a flat
readonly tuple of machine values and MUST NOT accept thunks, factories, actor input, or conditional
registrations. This acyclic direction is required both for pure app compilation and bounded
TypeScript instantiation.

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
`runPromiseExit` MUST return `Promise<Exit.Exit<A, E | LayerError>>`, including Layer acquisition
failure in the resolved Exit rather than rejecting its Promise. It MUST NOT claim that arbitrary services are installed. The current negative
proof is `packages/flow-state/src/public-api-types.test.ts:287-333`.

## Views, actors, stories, fixtures, and models

### TYPE-012 — Actor snapshots retain the exact machine family

`RootActor<Machine>` and `DynamicActor<Machine>` MUST preserve `StateOf`, `EventOf`,
`MemoryOf`, and all typed primitive registries reachable from `Machine`. `actor.send` MUST
accept only `EventOf<Machine>`. `actor.getSnapshot()` and `actor.snapshots` MUST expose the
same exact snapshot type. Registry `get` and resource `require` MUST preserve the ref or
definition's exact success and error types, and every discriminated union in `SNAPSHOTS.md`
MUST narrow without a cast. Actor lifecycle MUST be exactly `"active" | "disposed"`.
`snapshot.issues` MUST contain only the exact active `FlowIssue` summary from `SNAPSHOTS.md`;
receipts, pending outcomes, binding cursors, public Causes, and full diagnostic facts MUST NOT
enter the actor type. Transaction
snapshots MUST expose typed `error` only after narrowing to `status: "failure"`; defect and
interrupt members carry no public Cause.

### TYPE-013 — Views and React overloads reject foreign families

`view(machine, config)` MUST infer its selected type from `select`. Because a view is declared
before a module decides whether it is public, `useView(view)` keeps exact selection typing and
resolves the view through the provider runtime's AppPlan at runtime. It MUST require exactly one
public root match and throw the stable zero-or-ambiguous-root diagnostic otherwise.
`useView(actor, view)` MUST require that the actor and view share the same machine family. No
overload MAY infer through an equality callback.

```ts
const selected = useView(projectView);
const dynamicSelected = useView(projectActor, projectView);

// @ts-expect-error foreign actor/view pair
useView(todoActor, projectView);
```

### TYPE-014 — Story command and checkpoint types accumulate immutably

`story({ app, machine, start? })` MUST reject a machine outside the app graph. For a non-void
machine input, the constructor MUST require either fresh exact input or a compatible boot start;
public actor snapshots are observations and are never restoration input. Only a void-input machine
may omit `start`. `send` MUST accept the
machine's exact event union. `perform` MUST accept only branded inert commands belonging to
installed fixture controls. Literal checkpoint names MUST accumulate as keys of
`run.checkpoints`, and duplicate literal names MUST fail while the plan is built.
`advance` MUST accept Effect `Duration.Input` without requiring an Effect import at the call site;
its returned plan type remains the same checkpoint accumulator. `setTime` accepts only the
absolute safe-integer epoch-millisecond type.

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

`model(baseStory, { stateKey })` MUST preserve the base app, machine, fixtures, fresh start,
progress policy, and an empty command tuple. It MUST reject a boot base or a base story containing
any command. The state-key callback receives the exact predicted snapshot and returns
`CanonicalKeyInput`. Each
traversal call MUST infer its candidate event tuple independently; candidates MUST NOT become
model-level generic state. A valid model base therefore has no checkpoint keys to preserve.
Every discovered `path.story` MUST extend the base story with that call's exact candidate
events, start with an empty checkpoint record, permit later checkpoint appends, and run to the
ordinary inferred result shape. Pure model options MUST NOT add an Effect requirement.
`FlowStoryExecutionError` MUST be the only named testing runtime class; run, traversal, path,
and path-collection shapes MUST remain inferred from their values rather than exported as
parallel named classes.

## Required compile proofs

### TYPE-P01 — Positive proofs

Compile fixtures MUST prove:

- exact definition IDs, state tokens, event constructor args, event payloads, input, and memory;
- state-key, event-key, event-narrowing, target-token, memory, and input inference;
- resource parameter tuples and resource `A/E/R`;
- transaction key/ref arity, preview values, commit `A/E/R`, and binding params/outcomes;
- stream descriptor params and `A/E/R`, descriptor-only zero-parameter activity overloads,
  binding outcomes, child input, and exact `ActorSnapshot<ChildMachine>` completion types;
- machine → module → app requirements union and Layer closure;
- exact app-level dynamic-machine admission, its transitive requirements, and its exclusion from
  root lookup;
- direct and computed invalidation targets, including causal-event narrowing and `null` decline;
- actor snapshot/ref readers, view selection, and both valid React overloads;
- story fixture closure, command types, literal checkpoint accumulation, and command-empty
  model bases whose `path.story` starts with no checkpoint keys;
- strict, isolated-modules, isolated-declarations, packed package, React 18, and React 19
  consumer modes. The live packed runner already owns those mode boundaries at
  `packages/flow-state/scripts/check-packed-consumers.mjs:367-417`.

### TYPE-P02 — Negative proofs

Compile fixtures using `@ts-expect-error` MUST prove rejection of:

- unknown states, events, targets, payloads, memory fields, and timer targets;
- a type-only memory marker, separate `initialMemory`, or a `memory` property returned from the
  machine behavior callback;
- root machines with non-void input;
- final state nodes with transitions, redirects, activities, timers, or output callbacks;
- dynamic-machine thunks, factories, construction inputs, and foreign or widened admission values;
- inconsistent resource callback tuples and noncanonical ref inputs;
- computed invalidation Effects, Promises, predicates, nested arrays, canonical-key filters,
  untyped strings, and foreign refs;
- wrong transaction ref arity, key input, commit params, preview values, binding outcomes, and the
  removed transaction `scope` or stream `pressure` properties;
- parent selectors or routes on transaction/stream/child descriptors, standalone activity
  imports, `failure` outcomes, and control `.fail` when `E = never`;
- foreign view/actor families and module views bound to non-roots;
- transaction `error` outside failure, public snapshot `cause`, receipts, and a failed actor
  lifecycle;
- missing Layer services, Layers with remaining inputs, and wrong-app boot payloads;
- dynamic actor lookup with input, missing stable ID, wrong machine family, or an attempt to use
  lookup as creation/adoption;
- story machines outside an app, missing fixture services, duplicate checkpoints, raw
  Effects/promises/callbacks in `perform`, and commands from uninstalled controls;
- model construction from a non-empty command plan, cross-call candidate retention, model
  replay APIs, named testing/TurnRecord/inspection-result type hierarchies, core builders from
  non-root routes, and private deep imports.

### TYPE-P03 — No erasure proof

Public declaration output MUST contain no `any` or assertion-based erasure in provider,
runtime, descriptor, actor, view, story, fixture, or model boundaries. The live architecture
test already rejects explicit `any` in key public runtime and provider surfaces
(`packages/flow-state/src/public-typing-architecture.test.ts:40-59`).

### TYPE-P04 — Acyclic carrier and inference-cost proof

Phase 1 MUST compile an isolated private-vNext consumer with at least 25 root machines, 100 total
resource/transaction/stream/child descriptors, cross-module shared descriptors, and exact views
under strict and isolated-declarations modes. Phase 6 MUST extend the same command and carrier
baseline with exact fixture and story types after those definitions exist; Phase 1 MUST NOT invent
their later-phase declarations to satisfy this proof early.

The proof MUST assert exact `RequirementsOf<App>` and declaration emit, run
`tsc --extendedDiagnostics`, and record a checked-in baseline tied to the exact checked-in
TypeScript version. The measured instantiation count MUST NOT exceed the approved baseline by more
than 10%. A paired fixture that doubles only unrelated roots while preserving per-root shape MUST
NOT exceed 2.25 times the smaller fixture's instantiation count. Peak memory MUST be recorded for
trend evidence but MUST NOT gate the proof because it varies by host. A negative fixture MUST also
reject a recursive child carrier graph without reaching an excessive-instantiation error.
