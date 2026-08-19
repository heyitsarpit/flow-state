# Type-system contract

Status: normative vNext contract

This contract defines inference, variance, Effect<A, E, R> propagation, canonical operation identity,
Layer closure, actor/ref/lease types, host selectors, Story constructors, and the required positive and
negative compile proofs. Public authoring shapes are defined in PUBLIC_API.md.

The live package preserves descriptor-local A/E/R for resources, transactions, and streams
(packages/flow-state/src/core/api/flow-core.ts:72-86,
packages/flow-state/src/core/api/transaction-factory.ts:19-24). The vNext requirement is that those
exact types propagate through named operation catalogues, machines, modules, apps, runtimes, fixtures,
and Stories without erasing the accepted actor and host boundaries.

## Definition and machine inference

### TYPE-001 — Definition literals are inference anchors

definition({ id, states, events, context?, operations?, memory? }) MUST preserve the literal id, recursive
state declaration and exact state-token paths, event-property names, constructor parameter tuples,
constructor result payloads, context selector values, named operation families, input, and memory without
requiring as const. Its implementation signature MUST use TypeScript const type parameters or an
equivalently precise implementation-owned inference mechanism. Userland MUST NOT need as const, satisfies,
explicit generic arguments, or a wrapper helper to prevent widening.

```ts
const Todo = definition({
  id: "Todos/Editor",
  states: ["READY", { SAVING: ["REQUESTED", "COMMITTING"] }],
  events: {
    SaveRequested: (title: string) => ({ title }),
    SaveCompleted: null,
  },
  operations: {
    todo: todoResource,
  },
});

type _State = Expect<
  Equal<
    StateOf<typeof Todo>,
    typeof Todo.S.READY | typeof Todo.S.SAVING.S.REQUESTED | typeof Todo.S.SAVING.S.COMMITTING
  >
>;
type _Event = Expect<
  Equal<
    EventOf<typeof Todo>,
    ReturnType<typeof Todo.E.SaveRequested> | ReturnType<typeof Todo.E.SaveCompleted>
  >
>;
```

Event tokens MUST be nominal Flow values. A structurally similar function or object MUST NOT be
assignable as a token. StateOf<T> and EventOf<T> MUST accept either the definition or its machine and
return the same exact token unions. Recursive state inference and runtime validation MUST use the same
ten-level bound.

### TYPE-002 — The definition is the sole static inference universe

machine(definition, callback) MUST anchor state, event, input, memory, context, and operation inference to
the first argument with NoInfer or an equivalent one-way inference boundary. The callback MUST receive the
exact S, E, O, onContext, onMemory, invalidate, and clear kit and MUST NOT widen or redefine the definition.
Local states and on record keys MUST be checked against the recursive definition, while defaults, targets,
routed outcomes, and capability checks MUST use exact tokens.

```ts
machine(Todo, ({ S, E, O, onContext, onMemory }) => {
  onContext.select(
    ({ context }) => context.sessionState,
    (current) => current === Session.S.SIGNED_OUT && E.SessionEnded(),
  );

  return {
    default: S.READY,
    states: {
      READY: {
        on: {
          SaveRequested: {
            target: S.SAVING.S.REQUESTED,
            actions: ({ event }) => [O.todo.lookup({ id: event.title })],
          },
        },
      },
      SAVING: {
        default: S.SAVING.S.REQUESTED,
        states: {
          REQUESTED: {},
          COMMITTING: {},
        },
      },
    },
  };
});

// INVALID: the definition's exact universe rejects this event and target.
machine(Todo, ({ S }) => ({
  default: S.READY,
  states: { READY: { on: { UnknownEvent: S.SAVING } } },
}));
```

Compound handlers compile into the one machine-wide event protocol. An ancestor and descendant handler
for the same event on one active path is ambiguous and MUST be rejected; runtime leaf-to-parent fallback
or override is not inferred. snapshot.state and callback state are the exact active leaf, while matches
accepts the leaf and its active ancestors.

### TYPE-003 — Definition input and memory have one inference path

When definition memory consumes actor input, its exact public shape MUST be
memory: ({ input }: { readonly input: Input }) => Memory. InputOf<Definition>, MemoryOf<Definition>,
InputOf<Machine>, and MemoryOf<Machine> MUST all resolve from that callback. A callback that omits its
argument, memory: () => Memory, fixes Input = void. When memory is absent, input MUST be void and memory
MUST be a readonly empty record.

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

type _DefinitionInput = Expect<Equal<InputOf<typeof Editor>, { readonly todoId: string }>>;
type _DefinitionMemory = Expect<Equal<MemoryOf<typeof Editor>, { todoId: string; draft: string }>>;

// App.M admission is independent of input and app compilation creates no actor.
module({ id: "Todos", machines: { editor } });
```

Input is supplied once for each fresh actor and is consumed only by the pure memory initializer.
Machine behavior receives memory, inherited context, state, and events, not original input. Restoration
installs persisted memory without invoking the initializer. Input does not classify local versus shared actors.

### TYPE-004 — Transition callbacks narrow by causal event

Inside an on.EventName transition, event MUST be the exact return type of that event token. Guards,
updateMemory, and actions MUST receive readonly state, memory, snapshot, and primitive registries.
updateMemory MUST return Partial<Memory> and reject unknown fields or wrong values. Guard, memory, and
action planning MUST read the same immutable pre-turn snapshot and event; actions cannot see candidate
memory. reenter MUST accept an exact active state token and MUST reject Boolean values, foreign tokens,
inactive boundaries, and boundaries that do not contain the target.

```ts
SaveRequested: {
  target: S.SAVING,
  updateMemory: ({ event }) => ({ draft: event.title }),
  actions: ({ event, memory }) => [O.save.commit({ title: event.title, id: memory.id })],
  reenter: S.SAVING,
}
```

## Named operation inference and P/K

### TYPE-005 — Resources infer one executable tuple and canonical key tuple

For a resource key: (params: P) => K and lookup adapter returning Effect.Effect<A, E, R>, the resource
MUST carry exact P, K, A, E, and R without widening. lookup, freshness or collection configuration,
and any resource plan that executes work MUST preserve exact P; key, getData, and getState use exact K.
resource.ref MUST NOT exist, and a second resource key, custom hash, or equality callback MUST be rejected.

```ts
type ProjectInput = Readonly<{ id: string; client: ProjectClient }>;

const project = resource({
  id: "projects.by-id",
  key: ({ id }: ProjectInput) => [id] as const,
  lookup: (
    { id, client }: ProjectInput,
    { signal },
  ): Effect.Effect<Project, "missing", ProjectRepo> => client.get(id, { signal }),
});

const key = project.key({ id: "project-1", client });
project.getData(key);
project.lookup({ id: "project-1", client });
// @ts-expect-error
project.lookup({ id: "workspace-1", client });
```

K MUST follow `REV-OPS-016`: ordinary dense arrays and plain records are accepted as source containers,
copied into Flow-owned recursively frozen containers, and frozen at the top-level tuple. Canonicalization
sorts record keys and normalizes `-0`; hostile reflection and unsupported values are rejected. The exact
`KBytes` UTF-8 grammar, discriminator requirement, 16-level/256-node/8192-byte bounds, and exact path
diagnostics are normative. No type layer may add a competing interpretation.

### TYPE-006 — Transactions infer execution independently from parent bindings

For commit: (params: P, options) => Effect.Effect<A, E, R>, the transaction descriptor MUST carry exact
P/A/E/R. key: (params: P) => K MUST infer the exact input of transaction.key, commit, and the actor-bound O
family. The descriptor MUST carry no parent machine, memory, event, selector, route, preview, or invalidation
type.

```ts
type SaveParams = Readonly<{ id: string; title: string }>;

const save = transaction({
  id: "projects.save",
  key: ({ id }: SaveParams) => [id] as const,
  commit: ({ id, title }: SaveParams, { signal }): Effect.Effect<Project, SaveError, ProjectRepo> =>
    ProjectRepo.save(id, title, { signal }),
});

O.save.commit(
  { id: "project-1", title: "Updated" },
  {
    outcomes: {
      success: (value) => ProjectEvents.E.Saved(value),
      failure: (error) => ProjectEvents.E.SaveFailed(error),
    },
  },
);
```

The transaction family exposes exact key, passive getState, finite commit, and actor-owned cancel. An
omitted key projector has K = []. commit is admitted only by event-transition actions. Concurrency is
actor-local and its exact accepted policies are reject, cancel, allow, and serialize. The failure mapper is
absent when E = never; defect and interruption are separate channels. Authoritative writes are explicit
setData plans and never implicit result promotion.

### TYPE-007 — Streams infer exact execution without a parent type graph

For subscribe: (params: P, options) => Stream.Stream<V, E, R>, the stream descriptor MUST carry exact
P/K/V/E/R and no parent selector, routed event, or child actor. The actor-bound family exposes passive key,
passive getState, and continuing subscribe; it has no actor cancel. Its passive stream projection retains
status, `hasValue`, the latest `V` when present, emission count, generation, and terminal status. Exact
state-union members, field optionality, failure/defect/interruption representation, and declaration-slot
identity follow `REV-OPS-017` and are not exported as standalone aliases.

```ts
type ProgressInput = Readonly<{ submissionId: string; client: ProgressClient }>;

const progress = stream({
  id: "projects.progress",
  key: ({ submissionId }: ProgressInput) => [submissionId] as const,
  subscribe: ({ submissionId, client }: ProgressInput, { signal }) =>
    client.progress(submissionId, { signal }),
});
```

Stream values receive V, failures receive E, and defect, interruption, completion, and value mappings are
available only where the family supports them. Emissions become durable state only through mapped events
and explicit writes. Hydration rematerializes an active declaration from its live executable P after pending
outcomes drain without replaying an old emission; terminal streams do not restart, and missing executable
input fails closed with a precise diagnostic.

### TYPE-008 — Typed failures, defects, and interruptions remain distinct

Operation completion MUST inspect the complete Cause. Classification precedence MUST be: defect when any
defect exists, otherwise typed failure when any failure exists, otherwise interruption when the Cause is
interruption-only. Typed failure is E; defect and interruption MUST NOT be widened into E. Runtime
implementation MUST use Effect.exit, not Effect.result, for operation completion. This clause is self-contained;
its production proof MUST cover the stated precedence and the `Effect.exit` boundary.

## Transitive requirements and Layers

### TYPE-009 — Every reachable definition carries hidden requirements

Resource, transaction, stream, machine, module, app, fixture, Story, and model types MUST carry a hidden
covariant requirements member. RequirementsOf<T> MUST expose the application-provided union without
exposing the implementation brand. Descriptor internals retain raw R; Flow executes activities through
Effect.scoped, so RequirementsOf<T> removes Scope.Scope owned by Flow's ManagedRuntime.

For a machine, requirements are the union of every named operation descriptor reachable from its states and
every reachable machine graph. A module unions its exact named machine record. An app unions its module
machine records into App.M; every listed machine contributes its complete operation graph and requirements
to AppPlan. Context selectors add typed provider edges, not actor parentage.

```ts
type _MachineR = Expect<Equal<RequirementsOf<typeof projectMachine>, ProjectRepo | AuditLog>>;
type _AppR = Expect<Equal<RequirementsOf<typeof ProjectApp>, ProjectRepo | AuditLog>>;
```

App compilation creates no actors and MUST NOT accept dynamicMachines. A module machine record is a closed
admission universe, not an automatic root and not an actor address. No requirement may be added by passive
reads or by a callback that is not already part of the named static catalogue.

### TYPE-009A — Public carriers are normalized and acyclic

Resource, transaction, stream, machine, module, and app declarations MUST carry already-computed type
slots through private covariant brands. RequirementsOf<T> reads the normalized carrier directly; it MUST
NOT recursively re-walk authored state config, selectors, outcome maps, or plan values whenever a consumer
asks for requirements. Public Machine types MUST NOT retain complete authored config as a generic argument.

The static carrier direction is definition and machine-independent descriptors -> machine bindings -> named
module record -> app. A child-machine carrier graph is not part of the accepted surface. The carrier graph
MUST remain acyclic and bounded for pure app compilation and TypeScript instantiation. A running runtime
MUST NOT expand AppPlan.

### TYPE-010 — Runtime construction closes app requirements exactly

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

Equivalent subtyping that permits a Layer to provide a strict superset of app requirements is valid, but
the supplied Layer MUST have no remaining input requirements. Layer acquisition errors remain LayerError.
Runtime actor creation and ensuring MUST accept only exact machines from App.M; lookup is ref-only and does
not create or adopt an actor.

```ts
runtime({ app: PublicApp }); // valid only when RequirementsOf<PublicApp> is never
runtime({ app: ProjectApp, layer: ProjectLive });

// @ts-expect-error ProjectRepo remains unsatisfied
runtime({ app: ProjectApp });

// @ts-expect-error the Layer still requires DatabaseConfig
runtime({ app: ProjectApp, layer: ProjectLayerRequiringConfig });
```

### TYPE-011 — Runtime Effect bridges accept only installed services

For Runtime<App, LayerError>, runPromise and runPromiseExit MUST accept only Effects whose requirements are
satisfied by the runtime's installed application Context. runPromiseExit MUST return
Promise<Exit.Exit<A, E | LayerError>>, including Layer acquisition failure in the resolved Exit rather
than rejecting its Promise. It MUST NOT claim that arbitrary services are installed. The current negative
proof is packages/flow-state/src/public-api-types.test.ts:287-333.

## Actors, views, Stories, fixtures, and models

### TYPE-012 — Actor handles and snapshots retain the exact machine family

Every actor handle backed by Machine MUST preserve StateOf, EventOf, MemoryOf, context, and all typed named
operation families reachable from that machine. actor.ref MUST be ActorRef<Machine> for the exact machine,
actor.send MUST accept only EventOf<Machine>, and actor.getSnapshot() and actor.snapshots MUST expose the
same exact ActorSnapshot<Machine> family. Registry-free operation reads preserve exact descriptor and key
types, and discriminated status unions narrow without casts where accepted.

Actor lifecycle MUST be exactly "prepared" | "active" | "suspended" | "disposed". Prepared actors buffer
commands, suspended actors reject commands and own no live attachment resources, and disposed actors are
terminal. Ordinary actor handles and refs MUST NOT expose dispose; only an owner lease has individual
disposal authority. snapshot.issues contains the active FlowIssue summary, while receipts, pending outcomes,
binding cursors, raw public Effect `Cause.Cause<unknown>` values, and full diagnostic facts do not enter actor types.

### TYPE-013 — Passive React selectors reject foreign actor families

The React surface MUST expose useActor(machine, options?), useActorByRef(ref), and useView(actor, selector).
useActor creates a fresh local actor and does not accept a stable ID; useActorByRef is lookup-only and does
not recover a lease. useView MUST require one exact actor handle, not a machine, ref, registered view, or
view ID.

The selector MUST receive one atomic passive actor context containing state, readonly memory, inherited
readonly context, lifecycle, issues, bound can(event), and snapshot-bound read-only O. Its result MUST
preserve the exact declared Value type without implicit null or undefined. O exposes only passive key,
getData, and getState; acquisition and mutation methods are rejected. No comparator argument is accepted.
Scalar/non-record values use complete-value Object.is; named records use fixed-key, field-by-field Object.is.

```ts
const selected = useView(projectActor, ({ state, O }) => ({
  state,
  project: O.project.getData(O.project.key({ id: "project-1", client })),
}));

// @ts-expect-error a machine is not an actor handle
useView(projectMachine, ({ state }) => state);
```

### TYPE-014 — Story constructors and commands accumulate exact scope

The public constructors are story.app(runtimeFactory, options?), story.machine(machine, options?), and
story.actor(machine, options?). Their closed option objects MUST behave as follows:

```ts
type InputOptions<M> =
  InputOf<M> extends void ? { readonly input?: never } : { readonly input: InputOf<M> };

type ContextBindingOptions<M> = keyof SelectedContextOf<M> extends never
  ? { readonly contextBindings?: never }
  : { readonly contextBindings: StoryContextBindingsOf<M> };

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
```

These helper aliases are specification notation rather than required exports. Required input is required,
void input rejects an authored input, focused context is exact and required when declared, boot exists only
on story.app, and fixtures close the corresponding requirements. maxTurns defaults to 100.

Story plans are immutable and inert until run(). Both Story kinds expose process, advance, advanceTo,
advanceToNextTimer, checkpoint, and run; app Stories additionally expose target-taking send and simulate,
while machine Stories expose target-free send, simulate, and setContext. simulate requires an exact
operation plan and one-based occurrence observation and never creates work. advance and advanceTo do not
process implicitly. Checkpoint names accumulate immutably, and duplicate literal names fail while the plan
is built.

### TYPE-015 — Story-local actor recipes are exact and inert

story.actor(machine, options?) MUST return a deeply frozen inert recipe carrying exactly the machine, required
fresh input, and exact contextBindings. It carries no runtime, mailbox, snapshot, operation binding,
disposal authority, or live handle. A binding key MUST match one declared context slot and its value MUST be
an exact compatible app-owned ActorRef or Story actor recipe. Reusing one recipe object resolves one actor
per run; separate recipes create independent actors even when machine and input match.

App Story targets accept only exact recipes or stable refs. Machine families, foreign refs, missing refs, and
unadmitted recipes are rejected before command execution. Recipe actors are materialized with production
runtime.createActor, their owner leases are retained, commands observe only lease.actor, and cleanup disposes
leases in reverse dependency order. App-owned shared actors remain owned by runtime factory leases.

### TYPE-016 — Fixture controls and observations expose only supported outcomes

control.effect<Args, A, E> MUST preserve the service argument tuple and A/E; its control ref exposes
success and failure only when those channels exist, plus accepted defect and interruption controls.
control.stream<A, E> MUST preserve emitted and failure types and expose emission, completion, failure,
defect, and interruption only where supported. simulate MUST accept only a branded inert operation plan
from an installed fixture and an applicable observation. Raw Effects, promises, callbacks, primitive status
objects, and controls from uninstalled fixtures are rejected. The Story layer replaces external execution
only; admission, ownership, concurrency, completion classification, writes, outcomes, and evidence stay
on production kernels.

### TYPE-017 — Pure models retain a command-empty machine Story

model(baseStory, { stateKey }) MUST preserve the base machine Story's machine, exact fresh input, selected
context, fixtures, progress policy, and empty command tuple. It MUST reject an app Story, boot start, extra
command, non-fresh restoration, or a non-pure stateKey. The callback receives the exact predicted snapshot
and returns CanonicalKeyInput. Candidate event tuples belong to individual traversal calls and MUST NOT
become model-level generic state.

Each path.story MUST extend the base with that call's exact candidate events, begin with an empty checkpoint
record, permit later checkpoint appends, and run through the ordinary production result shape. The model
MUST expose only getShortestPaths and getSimplePaths; it MUST NOT run Effects, synthesize asynchronous
routes, expose replay/provide/clock helpers, or export parallel named path/result classes. FlowStoryExecutionError
is the only named testing runtime class; it carries the package-owned deeply frozen failure envelope accepted
by REV-TEST-006 and REV-TEST-008, including the complete public Effect `Cause.Cause<unknown>` for the failed
execution. Actor snapshots and inferred result values still do not expose raw Cause.

## Required compile proofs

### TYPE-P01 — Positive proofs

Compile fixtures MUST prove:

- exact definition IDs, recursive state tokens, event constructor args and payloads, context selectors,
  operation names, input, and memory;
- compound defaults, exact direct-child targets, active-leaf matching, event narrowing, memory updates,
  actions, onContext, and onMemory inference;
- resource P/K tuples, A/E/R, passive reads, finite lookup/refetch, continuing subscribe, writes, and
  actor-owned cancellation;
- transaction key/commit P/K/A/E/R, concurrency, explicit writes, binding outcomes, and cancellation;
- stream P/K/V/E/R, continuing outcomes, latest-value projection (`hasValue`, latest `V` when present,
  emission count, generation, and terminal status), and no actor cancellation; exact state-union members,
  field optionality, failure/defect/interruption representation, and declaration-slot identity follow
  `REV-OPS-017`;
- machine -> named module record -> App.M requirements union and Layer closure;
- exact actor refs, local/shared owner leases, context-binding keys, and four lifecycle states;
- passive actor-bound useView, exact selector values, and command-only useActor/useActorByRef;
- app and machine Story option closure, exact Story targets, controlled observations, command types,
  immutable checkpoints, run.end, and command-empty model bases;
- strict, isolated-modules, isolated-declarations, packed package, React 18, and React 19 consumer modes.

### TYPE-P02 — Negative proofs

Compile fixtures using @ts-expect-error MUST prove rejection of:

- unknown states, compound nodes, events, targets, payloads, memory fields, timer targets, non-direct
  defaults, depth eleven, ambiguous ancestor/descendant handlers, Boolean reentry, and timer actions;
- a type-only memory marker, separate initialMemory, or a memory property returned from machine behavior;
- implicit input classification, an authored input for a void machine, and automatic-root admission;
- inconsistent resource P/K callbacks, noncanonical key inputs, resource refs, custom equality/hash, and
  unsupported canonical values or bounds;
- generic operation registries, byKey, byLane, bound refs, descriptor parent selectors, and operation
  enumeration;
- transaction/stream family parent routes, stream cancellation, failure mappings when E = never, and
  completion values widened away from the exact stream family;
- dynamicMachines, machine-family runtime lookup, stable IDs on local creation, foreign/mismatched refs,
  input or bindings embedded in refs, and dispose on ordinary actor handles;
- missing, extra, foreign, or cyclic context bindings and a changing construction tuple;
- registered views, view IDs, machine/ref arguments to useView, comparator arguments, and mutating O methods
  inside passive selectors;
- callable Story construction, .with, bare app or live-runtime Story inputs, focused boot/memory/state/
  snapshot overrides, machine-family Story targets, perform, deliver, receive, flush, settle, setTime,
  replay helpers, and run.final;
- duplicate checkpoints, raw Effects/promises/callbacks in simulate, uninstalled fixture controls, missing
  fixture services, app Stories with direct context injection, and app Stories without exact targets;
- model construction from an app or non-empty command plan, cross-call candidate retention, and named
  testing, path, TurnRecord, receipt, or inspection-result type hierarchies;
- public snapshot raw Effect `Cause.Cause<unknown>` values, receipts, child-machine types, root/dynamic actor categories, missing Layer
  services, Layers with remaining inputs, and wrong-app boot payloads;
- any or assertion-based erasure in provider, runtime, descriptor, actor, selector, Story, fixture, or
  model boundaries.

### TYPE-P03 — Acyclic carrier and inference-cost proof

Phase 1 MUST compile an isolated private-vNext consumer with at least 25 named module-root machines, 100
total resource/transaction/stream descriptors, cross-module shared descriptors, exact actor-bound passive
views, and strict and isolated-declarations modes. The proof MUST assert exact RequirementsOf<App> and
declaration emit, run tsc --extendedDiagnostics, and record a baseline tied to the checked-in TypeScript
version. Instantiation count MUST remain within 10% of the approved baseline, and a paired fixture that
doubles only unrelated roots MUST remain below 2.25 times the smaller fixture. Peak memory is trend evidence
only. A negative fixture MUST reject recursive carrier expansion without an excessive-instantiation error.

### TYPE-P04 — Production-owner declaration proof

Public declaration output MUST contain no any or assertion-based erasure in provider, runtime, descriptor,
actor, passive selector, Story, fixture, or model boundaries. Declaration proofs MUST be paired with the
production-owner runtime, React, Story, persistence, and deletion absence proofs; focused source-text or
type checks cannot stand in for those behavior proofs.
