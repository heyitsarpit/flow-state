
# Type-system contract

Status: normative vNext contract

This file owns inference, variance, `Effect<A, E, R>` propagation, canonical operation typing,
Implementation closure, actor/ref/lease typing, host selector typing, Story typing, and compile proofs.
Public authoring shapes are owned by [PUBLIC_API.md](./PUBLIC_API.md); terminology and identity by
[GLOSSARY_AND_IDENTITY.md](./GLOSSARY_AND_IDENTITY.md).

## TYPE-001 — Definition literals

~~~ts
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
~~~

### Surface

- `definition` preserves literal ID, recursive exact state tokens, event names/parameter tuples/result
  payloads, context values, named operation families, input, and memory without `as const`.

### Rule

- Use const type parameters or equivalently precise package-owned inference. User code needs no `as const`,
  `satisfies`, explicit generics, or wrapper to prevent widening.
- Event tokens are nominal; structurally similar functions/objects are not assignable. `StateOf` and
  `EventOf` accept definition or machine and return same exact unions. Ten-level bound is shared runtime/type.

### Accepts

- Literal authoring with inferred recursive token/event unions.

### Rejects

- Widened IDs/tokens, structural event impostors, and depth eleven.

### Observable guarantee

- Downstream machine/API inference preserves the authored literal universe.

### Proof

- Exact positive token/event and depth-bound compile fixtures, including exact preservation of accepted
  non-ASCII literals. UTF-8 byte validity and lone-surrogate rejection are runtime proofs owned by
  `GLOSSARY_AND_IDENTITY.md` `GLO-01`.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-001`; public shape: `PUBLIC_API.md#API-003`.

## TYPE-002 — Definition-anchored machine inference

~~~ts
machine(Todo, ({ S, E, O, onContext, onMemory }) => ({
  default: S.READY,
  states: { READY: { on: { SaveRequested: { target: S.SAVING.S.REQUESTED } } } },
}));
~~~

### Surface

- `machine(definition, callback)` anchors all inference to the first argument and supplies exact `S`,
  `E`, `O`, `onContext`, `onMemory`, `invalidate`, `clear`.

### Rule

- Use `NoInfer` or equivalent one-way boundary. Local states/on keys check against recursive definition;
  defaults/targets/outcomes/capabilities use exact tokens.
- Compound handlers form one event protocol. Ancestor+descendant handler for same event on active path
  is ambiguous; no leaf fallback/override inference. State is exact active leaf; `matches` accepts leaf/ancestors.

### Accepts

- Exact callback kit and static behavior configuration.

### Rejects

- Unknown event/target, widened/redefined definition, ambiguous ancestor/descendant handling.

### Observable guarantee

- Machine callback cannot enlarge or replace the definition's static universe.

### Proof

- Positive and `@ts-expect-error` callback grammar fixtures.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-002`; public grammar: `PUBLIC_API.md#API-004`.

## TYPE-003 — One input/memory inference path

~~~ts
const Editor = definition({
  id: "Todos/Editor", states: ["READY", "SAVING"], events: { SaveRequested: null },
  memory: ({ input }: { readonly input: { readonly todoId: string } }) => ({
    todoId: input.todoId, draft: "",
  }),
});
type _Input = Expect<Equal<InputOf<typeof Editor>, { readonly todoId: string }>>;
type _Memory = Expect<Equal<MemoryOf<typeof Editor>, { todoId: string; draft: string }>>;
~~~

### Surface

- Input/memory infer from exactly `memory: ({ input }: { readonly input: Input }) => Memory`.

### Rule

- Omitting argument fixes `Input=void`; absent initializer fixes input void and readonly empty memory.
- Input is supplied once to fresh actor and only initializer consumes it; behavior receives memory/context/
  state/events, not original input. Restore installs memory without initializer/input replay. App.M admission
  is independent of input and app compilation creates no actor.

### Accepts

- Exact `InputOf`/`MemoryOf` from definition or machine.

### Rejects

- Type-only memory markers, separate `initialMemory`, memory returned from behavior, implicit input class,
  authored input for void machine, and input mutation/classification.

### Observable guarantee

- Fresh and restored actors share one typed memory contract with no hidden input path.

### Proof

- Input/memory positive/negative and restoration compile/runtime proofs.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-003`; identity: `GLOSSARY_AND_IDENTITY.md#GLO-03`.

## TYPE-004 — Causal event narrowing

~~~ts
SaveRequested: {
  target: S.SAVING,
  updateMemory: ({ event }) => ({ draft: event.title }),
  actions: ({ event, memory }) => [O.save.commit({ title: event.title, id: memory.id })],
  reenter: S.SAVING,
}
~~~

### Surface

- Event transition callbacks receive exact causal event and readonly state/memory/snapshot/primitive
  registries.

### Rule

- `updateMemory` returns `Partial<Memory>` only; same pre-turn snapshot/event feed guard, memory, actions;
  actions cannot see candidate memory. `reenter` is exact active state token only.

### Accepts

- Exact event payload, known memory fields, active token reentry.

### Rejects

- Unknown fields/values, Boolean/foreign/inactive/outside-boundary reentry, candidate-memory visibility.

### Observable guarantee

- Callback types describe one immutable pre-turn causal input.

### Proof

- Event narrowing, update/action visibility, reentry negative fixtures.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-004`.

## TYPE-005 — Resource `P`/`K`/`A`/`E`/`R`

~~~ts
const project = resource({
  id: "projects.by-id",
  key: ({ id }: Readonly<{ id: string }>) => [id] as const,
  lookup: ({ id }, { signal }): Effect.Effect<Project, "missing", ProjectRepo> =>
    Effect.gen(function* () {
      const repo = yield* ProjectRepo;
      return yield* repo.get(id, { signal });
    }),
});
project.getData(project.key({ id: "project-1" }));
~~~

### Surface

- Resource carries exact executable `P`, canonical `K`, success `A`, typed failure `E`, requirements `R`.

### Rule

- Lookup/config/plans preserve P; key/getData/getState use K. No resource ref, second key, custom hash,
  or equality. `persist` false by default; true opts committed canonical entries into Persistence.
- K uses `PUBLIC_API.md#API-005` exact copied/frozen canonical containers, grammar, discriminator, bounds,
  and diagnostics; no type layer adds another interpretation.

### Accepts

- Exact P/K/A/E/R through descriptor, named O, machine, app, runtime, fixture, and Story.

### Rejects

- Inconsistent callbacks, noncanonical key values, resource refs, custom identity, unsupported values/bounds.

### Observable guarantee

- Executable methods retain complete P; passive/key methods never pretend K reconstructs P.

### Proof

- Resource tuple, canonical boundary, `@ts-expect-error`, and requirement propagation fixtures.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-005`; canonical owner: `PUBLIC_API.md#API-005`.

## TYPE-006 — Transaction inference independent of parent

~~~ts
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
~~~

### Surface

- Transaction carries exact P/A/E/R and key's exact P/K; actor O family preserves them.

### Rule

- No parent machine/memory/event/selector/route/preview/invalidation type. Family is exact key/passive
  getState/commit/cancel; K defaults to `[]`; commit only from actions. Concurrency is
  `reject | cancel | allow | serialize`; failure mapper absent for `E=never`; defect/interruption distinct.
- Explicit setData writes only. `persist` false by default; true opts actor-owned durable facts only
  when owning stable actor is persistable.

### Accepts

- Typed success/failure mappings and explicit writes.

### Rejects

- Parent-type capture, missing/widened params, failure mapping when E never, implicit result promotion,
  local actor durability through descriptor alone.

### Observable guarantee

- Transaction types remain independent of where a machine binds the descriptor.

### Proof

- Transaction P/K/A/E/R, concurrency, writes, persistence, and negative parent-route fixtures.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-006`; public owner: `PUBLIC_API.md#API-008`.

## TYPE-007 — Stream inference

~~~ts
type ProgressInput = Readonly<{ submissionId: string }>;

const progress = stream({
  id: "projects.progress",
  key: ({ submissionId }: ProgressInput) => [submissionId] as const,
  subscribe: ({ submissionId }: ProgressInput, { signal }) =>
    Effect.gen(function* () {
      const progressClient = yield* ProgressClient;
      return yield* progressClient.progress(submissionId, { signal });
    }),
});
~~~

### Surface

- Stream carries exact P/K/V/E/R with no parent selector/routed event/child actor. Family is passive
  key/getState and continuing subscribe, no actor cancel.

### Rule

- Projection retains status, hasValue, latest V when present, emission count, generation, terminal status;
  exact union/optionality follows `PUBLIC_API.md#API-006`, not exported aliases. Emissions become durable
  only through mapped events/explicit writes. `persist` false by default; true opts latest/terminal/
  generation/declaration facts when stable owner is persistable; fibers/scopes/cursors/transports/history
  are non-persistable.
- Hydration uses live P after pending outcomes drain, no old emission replay; terminal no restart; missing P
  fails closed with precise diagnostic.

### Accepts

- Exact stream values/failures and family-supported complete/defect/interruption mappings.

### Rejects

- Parent type graph, child actor, stream cancellation, terminal restart, K reconstruction, and widened
  completion values.

### Observable guarantee

- Stream latest-value and terminal fields narrow without casts and preserve exact descriptor types.

### Proof

- Stream P/K/V/E/R, projection, hydration, persistence, and no-cancel compile/runtime proofs.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-007`; public owner: `PUBLIC_API.md#API-009`.

## TYPE-008 — Cause classification

~~~ts
const exit = yield* Effect.exit(operation);
// defect > typed failure > interruption-only
~~~

### Surface

- Operation completion classifies complete Effect Cause into typed failure `E`, defect, or interruption.

### Rule

- Precedence: any defect, else any failure, else interruption-only. Defect/interruption are not widened
  into E. Production uses `Effect.exit`, not `Effect.result`.

### Accepts

- Distinct typed failure/defect/interruption channels.

### Rejects

- Cause flattening into E or `Effect.result` completion boundary.

### Observable guarantee

- Runtime outcome unions preserve the first applicable classification precedence.

### Proof

- Cause precedence and `Effect.exit` production-owner proof.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-008`; public lanes: `PUBLIC_API.md#API-006`–`API-009`.

## TYPE-009 — Transitive requirements

~~~ts
type _MachineR = Expect<Equal<RequirementsOf<typeof projectMachine>, ProjectRepo | AuditLog>>;
type _AppR = Expect<Equal<RequirementsOf<typeof ProjectApp>, ProjectRepo | AuditLog>>;
~~~

### Surface

- Resource/transaction/stream/machine/module/app/fixture/Story/model carry hidden covariant requirements.

### Rule

- `RequirementsOf<T>` exposes application union without implementation brand. Descriptor internals retain
  raw R; Flow owns Scope.Scope via `Effect.scoped`, so RequirementsOf removes Scope. Machine unions every
  reachable named descriptor/machine graph; module unions exact record; app unions App.M. Context selectors
  add typed provider edges, not parentage. Passive reads/callbacks add no requirements.
- App compilation creates no actor and rejects dynamicMachines/automatic roots.

### Accepts

- Exact machine→module→app requirement closure.

### Rejects

- Hidden unresolved requirements, dynamic admission, and child/root actor categories.

### Observable guarantee

- Requirements are visible at the app boundary without exposing provider implementation branding.

### Proof

- Requirements union and closure positive/negative fixtures.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-009`; public admission: `PUBLIC_API.md#API-010`.

## TYPE-009A — Normalized acyclic carriers

The following is private schematic/non-exported notation for the inferred carrier boundary; it is not a
required public export.

~~~ts
type NormalizedCarrier<R> = Readonly<{ readonly _requirements?: (r: R) => R }>;
~~~

### Surface

- Resource/transaction/stream/machine/module/app declarations carry precomputed private covariant slots.

### Rule

- RequirementsOf reads carrier directly; it does not re-walk authored config/selectors/outcomes/plans.
  Public Machine does not retain complete authored config as generic. Direction is descriptors→machine
  bindings→named module→app; no child-machine carrier graph. Graph is acyclic/bounded; runtime never expands AppPlan.

### Accepts

- Normalized private carriers and exact public output.

### Rejects

- Recursive carrier expansion, repeated authored-tree traversal, child-machine carrier edges.

### Observable guarantee

- App compilation/inference cost is bounded by normalized static graph.

### Proof

- Acyclic carrier and inference-cost proof `TYPE-P03`.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-009A`.

## TYPE-009B — Inert Implementations

~~~ts
const TodoLive = Implementation.succeed(TodoGateway, TodoGateway.of({
  list: ({ listId }, { signal }) => fetchTodos(listId, { signal }),
  add: ({ listId, title }, { signal }) => createTodo(listId, title, { signal }),
}));
const TodoStory = Implementation.succeed(TodoGateway, TodoGateway.of({
  list: () => Effect.succeed(initialTodos),
  add: ({ title }) => Effect.succeed({ id: "todo-1", title, completed: false }),
}));
const TodoWithClock = Implementation.merge(TodoLive, ClockLive);
~~~

### Surface

- Public `Implementation` is immutable typed provider graph under namespace `Implementation`.

### Rule

- `succeed(service, value)` is complete synchronous non-failing provider. `effect(service, acquire)` is
  acquired at most once per Runtime; typed error is `ImplementationError`, scope/finalizer Runtime-owned.
  `merge` composes without changing identity. All construction is inert: no acquire/I/O/actors/work.
- Duplicate service identity rejects, never order-selects. RuntimeSetup must close RequirementsOf<App>;
  partial/remaining graph is type/readiness failure. Fixtures use same rules and override by identity.

### Accepts

- Complete service providers and strict supersets with no remaining input requirements.

### Rejects

- Duplicate providers, unresolved input services, Layer-like opaque semantics, operation-kernel replacement,
  argument/output matchers, or control registry.

### Observable guarantee

- Provider construction has no runtime effect until Runtime acquisition owns it.

### Proof

- Provider variance, duplicate identity, inertness, and fixture closure proofs.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-009B`; public API: `PUBLIC_API.md#API-015`.

## TYPE-010 — Runtime requirement closure

~~~ts
function runtimeSetup<A extends App>(options: {
  readonly app: A; readonly persistence?: Persistence;
}): RuntimeSetup<A, never>;
function runtimeSetup<A extends App, ImplementationError>(options: {
  readonly app: A;
  readonly implementation: Implementation<RequirementsOf<A>, ImplementationError>;
  readonly persistence?: Persistence;
}): RuntimeSetup<A, ImplementationError>;
~~~

### Surface

- `RuntimeSetup` is inert carrier. `construct()` makes shell/no I/O. `ready(): Effect<void,
  ImplementationError | FlowPersistenceError>` performs bootstrap/restoration once and caches terminal result.

### Rule

- First overload applies only when requirements are never; second requires complete Implementation.
  Strict superset providers are valid only with no remaining inputs. Persistence is host capability and
  does not enter RequirementsOf/App Implementation closure. Runtime create/ensure accept exact App.M machines;
  lookup is ref-only/no create/adopt.
- `persistence(options)` returns an inert `Persistence`; storage is a host capability, codec defaults to
  the package JSON-safe codec, and its filter can only exclude declaration-owned entries. Persistence does
  not contribute to RequirementsOf<App> or change Implementation closure.

### Accepts

~~~ts
runtimeSetup({ app: PublicApp });
runtimeSetup({ app: ProjectApp, implementation: ProjectLive });
~~~

### Rejects

~~~ts
// @ts-expect-error ProjectRepo remains unsatisfied
runtimeSetup({ app: ProjectApp });
// @ts-expect-error remaining DatabaseConfig requirement
runtimeSetup({ app: ProjectApp, implementation: ProjectImplementationRequiringConfig });
~~~

### Observable guarantee

- Readiness is one idempotent cached boundary; implementation acquisition errors remain `ImplementationError`.

### Proof

- Runtime overload/closure, exact App.M, persistence exclusion, and readiness proofs.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-010`; public host: `PUBLIC_API.md#API-012`.

## TYPE-011 — Runtime Effect bridge

The following is private schematic/non-exported notation for the runtime result shape; it is not a
required public export.

~~~ts
type Result<A, E, IE> = Promise<Exit.Exit<A, E | IE>>;
~~~

### Surface

- For `Runtime<App, ImplementationError>`, `runPromise`/`runPromiseExit` accept only Effects satisfied
  by installed application Context.

### Rule

- `runPromiseExit` resolves `Promise<Exit.Exit<A, E | ImplementationError>>`, including acquisition failure
  in Exit rather than rejecting Promise; it cannot claim arbitrary services installed.

### Accepts

- Effects whose requirements are closed by runtime context.

### Rejects

- Arbitrary unsatisfied service requirements or Promise rejection used to represent Implementation acquisition.

### Observable guarantee

- Runtime bridge types expose exact installed-service boundary.

### Proof

- Historical/reference negative proof from the frozen package: `packages/flow-state/src/public-api-types.test.ts:287-333`.
  The replacement proof belongs under `packages/flow-state-rewrite/`, per `IMPLEMENTATION_WORKFLOW.md:26-28`.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-011`.

## TYPE-012 — Exact actor family

~~~ts
const actor: Actor<Machine> = runtime.getActor(ref);
actor.ref satisfies ActorRef<Machine>;
actor.send(/* EventOf<Machine> */);
actor.getSnapshot();
~~~

### Surface

- Actor handle preserves StateOf, EventOf, MemoryOf, context, and all exact named operation families.

### Rule

- `ref: ActorRef<Machine>`, send accepts EventOf, snapshot/snapshots expose exact ActorSnapshot family,
  registry-free reads retain descriptor/K types, status unions narrow without casts.
- `actorRef(machine,id,{persist?:boolean})` preserves machine/stable-ID type; persist false default/not
  identity/only stable eligibility. Local opaque ref cannot satisfy persistable ref.
- Lifecycle exact four states. Prepared buffers; suspended rejects commands/no live attachments; disposed terminal.
  No dispose on actor/ref. Snapshot issues only active FlowIssue summary; receipts/pending/binding cursors/
  raw Cause/full diagnostics absent.

### Accepts

- Exact machine-branded handles/refs/leases and exact lifecycle union.

### Rejects

- Foreign/mismatched refs, local persistability, handle disposal, raw Cause/receipts in actor types.

### Observable guarantee

- Actor family types never widen across machine identity.

### Proof

- Actor family, lifecycle, ref persist flag, and absence compile fixtures.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-012`; public owner: `PUBLIC_API.md#API-011`–`API-012`.

## TYPE-013 — Passive React selectors

~~~ts
const selected = useView(projectActor, ({ state, O }) => ({
  state,
  project: O.project.getData(O.project.key({ id: "project-1" })),
}));
// @ts-expect-error machine is not actor handle
useView(projectMachine, ({ state }) => state);
~~~

### Surface

- React exports `useActor(machine, options?)`, `useActorByRef(ref)`, `useView(actor, selector)`.

### Rule

- useActor creates fresh local/no stable ID; by-ref lookup-only/no lease. useView requires exact actor
  handle. Selector receives atomic passive state/readonly memory/context/lifecycle/issues/bound can/O.
  Result preserves exact Value, without implicit null/undefined. O only key/getData/getState; no comparator.
- Scalar/non-record equality complete-value Object.is; named records fixed-key field-by-field Object.is.

### Accepts

- Exact actor-bound passive selectors and exact inferred result.

### Rejects

- Machine/ref/registered-view/view-ID arguments, comparator, acquisition/mutation O methods, implicit
  null/undefined widening.

### Observable guarantee

- Selector cannot acquire/mutate and reruns only for matching tracked actor/store publication.

### Proof

- React type and runtime passive-selector proofs, including the negative example.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-013`; public owner: `PUBLIC_API.md#API-012`.

## TYPE-014 — Story option/command closure

The constructors MUST use three closed option-object shapes. The following helper names are
specification notation and need not be exported:

```ts
type InputOptions<M> =
  InputOf<M> extends void ? { readonly input?: never } : { readonly input: InputOf<M> };

type SelectedContextOptions<M> = keyof SelectedContextOf<M> extends never
  ? { readonly context?: never }
  : { readonly context: SelectedContextOf<M> };

type ContextBindingOptions<M> = keyof SelectedContextOf<M> extends never
  ? { readonly contextBindings?: never }
  : { readonly contextBindings: StoryContextBindingsOf<M> };

type StoryContextBindingsOf<M> = {
  readonly [K in keyof SelectedContextOf<M>]:
    ActorRef<ProviderMachineAt<M, K>> | StoryActorRecipe<ProviderMachineAt<M, K>>;
};

type FixtureOptions<Owner> =
  RequirementsOf<Owner> extends never
    ? { readonly fixtures?: readonly FixtureDefinition[] }
    : {
        readonly fixtures: FixtureTupleClosing<RequirementsOf<Owner>>;
      };
```

`StoryContextBindingsOf`, `ProviderMachineAt`, and `StoryActorRecipe` describe the exact contextual
type relationship; they do not require public helper exports. In this notation, `FixtureDefinition`
denotes an immutable value returned by `fixture({ id, implementation, seeds? })`. Its `implementation`
provides the complete service identities required by the owner; its optional `seeds` are preloaded
Runtime-owned resource state and do not satisfy a missing service requirement. A Fixture Implementation
overrides an App Implementation for the same service identity, while duplicate Fixture providers are
rejected rather than resolved by ordering. The provider is constructed once per Runtime and Story runs
receive fresh Runtime-scoped provider state.

In this notation, `Implementation<Output, ImplementationError>` denotes the provider graph whose combined outputs
satisfy `Output` and whose acquisition may fail with `ImplementationError`; it is the accepted semantic name for the
implementation-layer boundary, not a second testing runtime or a required public helper constructor. An
Implementation supplies complete service functions. It does not replace resource, transaction, or stream
operation kernels, and the Story does not install argument/output matchers or a control registry. The
`FixtureTupleClosing<R>` denotes a readonly tuple whose combined provider outputs satisfy `R`; neither
needs to be an exported alias.

The three complete option shapes are:

```ts
type AppStoryOptions<App> = FixtureOptions<App> & {
  readonly maxTurns?: number;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
};
type MachineStoryOptions<M> = InputOptions<M> & SelectedContextOptions<M> & FixtureOptions<M> & {
  readonly maxTurns?: number;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
};
type ActorRecipeOptions<M> = InputOptions<M> & ContextBindingOptions<M>;
```

Checkpoint-name accumulation uses the following specification-only notation. `CheckpointEvidence` and
`EndEvidence` stand for the existing App- or Machine-Story evidence shapes; these aliases do not require new
public exports:

```ts
type NewCheckpointName<Names extends string, Name extends string> =
  string extends Name
    ? never
    : Extract<Name, Names> extends never
      ? Name
      : never;

interface StoryPlan<Names extends string = never> {
  checkpoint<const Name extends string>(
    name: NewCheckpointName<Names, Name>,
  ): StoryPlan<Names | Name>;
  run(options?: { readonly signal?: AbortSignal }): Promise<StoryRun<Names>>;
}

type StoryRun<Names extends string> = {
  readonly checkpoints: {
    readonly [Name in Names]: CheckpointEvidence;
  };
  readonly end: EndEvidence;
};
```

Every other builder command preserves `Names` while returning a new plan value. A literal checkpoint name or
known string union extends `Names`; a widened `string` is rejected and MUST NOT erase already known names.

```ts
const common = story.machine(editorMachine, options)
  .send(Editor.E.Opened())
  .process()
  .checkpoint("opened");

const saved = common.send(Editor.E.SaveRequested()).process().checkpoint("saved");
const discarded = common.send(Editor.E.Discarded()).checkpoint("discarded");
const cancelled = common.send(Editor.E.Cancelled()).checkpoint("cancelled");

const savedRun = await saved.run();
const discardedRun = await discarded.run();
savedRun.checkpoints.opened; // valid
savedRun.checkpoints.saved; // valid
savedRun.checkpoints.typo; // TypeScript error

// @ts-expect-error duplicate literal checkpoint name
common.checkpoint("opened");

declare const runtimeName: string;
// @ts-expect-error widened string cannot erase the known-name map
common.checkpoint(runtimeName);

// Specification notation for the package-private defensive path only.
declare function lookupCheckpointInternal<Names extends string>(
  run: StoryRun<Names>,
  name: string,
): CheckpointEvidence;
declare const untrustedCheckpointName: string;
lookupCheckpointInternal(savedRun, untrustedCheckpointName); // unknown own key throws existing FlowUsageError
```

### Surface

- These aliases are specification notation, not required exports. Constructors are
  `story.app(runtimeSetup, options?)`, `story.machine(machine, options?)`, `story.actor(machine, options?)`.

### Rule

- Required input required; void input rejects authored input; focused context exact/required when declared;
  fixtures close requirements; Persistence only RuntimeSetup; maxTurns default 100.
- Plans immutable/inert until run. Checkpoint names accumulate immutably, and duplicate literal names fail
  while the plan is built. Every builder command returns a new plan and leaves its prefix unchanged. Derived
  plans replay that prefix independently in fresh isolated production Runtimes; this is static plan branching,
  never a live Runtime fork, and no live state, handle, or Runtime is shared between runs. Both Story kinds:
  process/advance/advanceTo/advanceToNextTimer/checkpoint/run; app adds target-taking send; machine adds
  target-free send/setContext. No implicit process.
- Checkpoints are frozen evidence cuts only, never resumable Runtime snapshots. `run().checkpoints` is a
  readonly mapped type keyed exactly by accumulated literal names; known names compile and unknown literal
  indexing fails while the existing evidence shape, `run.end`, and failure behavior remain unchanged.
- Package-private runtime-string lookup for JavaScript, CLI, or untrusted input checks own-key membership and
  rejects unknown names with existing `FlowUsageError` semantics. It adds no public dynamic-string getter or
  new error type.

### Accepts

- Exact conditional option closure, immutable checkpoints, command types, and run.end.

### Rejects

- Bare app/live runtime, focused boot/memory/state/snapshot overrides, machine-family targets, and old
  perform/deliver/receive/flush/settle/setTime/replay/run.final surfaces; duplicate checkpoint literals;
  widened-string checkpoint names; unknown literal checkpoint indexing; `fork`, `restore`, `fromCheckpoint`,
  public dynamic-string checkpoint lookup, and shared live state/handles/Runtimes between derived runs.

### Observable guarantee

- Story command scope accumulates exactly and cannot inject pending operation results.

### Proof

- Positive/negative Story option, target, command, exact checkpoint-name accumulation/run-key inference,
  duplicate-name, widened-string, unknown-index, immutable-prefix, fresh-run isolation, and run.end fixtures.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-014`; public owner: `PUBLIC_API.md#API-013`–`API-014`.

## TYPE-015 — Story-local recipes

~~~ts
const recipe = story.actor(machine, { input, contextBindings });
~~~

### Surface

- Recipe is deeply frozen inert exact machine/input/bindings; no runtime/mailbox/snapshot/operation/
  disposal/live handle.

### Rule

- Binding key is declared slot and value exact compatible app-owned ActorRef or Story recipe. Same recipe
  object resolves one actor per run; distinct recipes are independent. App targets accept exact recipe or
  stable ref only. Materialize with production createActor, retain leases, observe only lease.actor,
  dispose reverse dependency. App-owned shared actors remain Runtime-owned.

### Accepts

- Exact fresh input/context bindings and admitted refs/recipes.

### Rejects

- Missing/extra/foreign/cyclic bindings, machine families as targets, foreign refs, unadmitted recipes,
  runtime/ownership in recipe.

### Observable guarantee

- Recipe identity, not structural equality, controls per-run actor materialization.

### Proof

- Exact binding, target, inertness, materialization, and lease-cleanup fixtures.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-015`; identity: `GLOSSARY_AND_IDENTITY.md#GLO-06`.

## TYPE-016 — Fixture Implementation closure

~~~ts
const fixtureDef = fixture({ id: "test-api", implementation: TestApi, seeds });
~~~

### Surface

- Fixture is immutable/inert and its Implementation closes complete App/focused-machine services.

### Rule

- App provider overridden by fixture provider by identity; duplicates reject. Seeds do not remove a
  requirement even when lookup skipped. Providers replace complete service functions preserving authored
  input/success/failure/cancellation/lifetime; never kernels, matchers, registries. Seeds are preloaded
  Runtime-owned resource state. Provider constructed once per Runtime; Story runs get fresh scoped state
  unless application ownership shares it. Kernels own admission/completion/writes/projections/evidence.

### Accepts

- Complete typed provider graphs and optional seed state.

### Rejects

- Missing/duplicate services, seeds as requirements, kernel replacement, mock registries, arbitrary cache
  mutation, and result-injection commands.

### Observable guarantee

- Fixture setup cannot weaken application requirement closure or take kernel ownership.

### Proof

- Fixture service closure, duplicate identity, provider variance, freshness, and kernel ownership proofs.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-016`; public owner: `PUBLIC_API.md#API-015`.

## TYPE-017 — Pure model base

~~~ts
const modelDef = model(machineStory, { stateKey: ({ value, memory }) => [value.id, memory] });
~~~

### Surface

- `model(baseStory,{stateKey})` preserves machine, exact fresh input, selected context, fixtures, progress
  policy, empty command tuple. `path.story` extends base with exact candidate events and empty checkpoints.

### Rule

- Reject app Story, boot, extra command, non-fresh restoration, non-pure stateKey. Candidate events are
  per traversal call. Expose only `getShortestPaths`/`getSimplePaths`; no Effects, async route synthesis,
  replay/provide/clock helpers, or parallel named path/result classes. `FlowStoryExecutionError` is sole
  named testing runtime class, with package-owned frozen envelope accepted by REV-TEST-006/008 including
  complete public `Cause.Cause<unknown>`. Snapshots/inferred values still hide raw Cause.

### Accepts

- Command-empty machine Story and pure CanonicalKeyInput state key.

### Rejects

- App/non-empty model, cross-call candidate retention, testing/path/TurnRecord/receipt/inspection
  hierarchies, Effects, and raw Cause in snapshots.

### Observable guarantee

- Path exploration remains pure; each returned path is an ordinary runnable Story extension.

### Proof

- Model construction, path isolation, purity, and failure-envelope compile/runtime proofs.

### Trace

- Provenance: `provenance/TYPE_SYSTEM.md#TYPE-017`; public owner: `PUBLIC_API.md#API-015`.

## Required compile proofs

The following union is schematic local proof-index notation and is not a required public export.

~~~ts
type TypeProof = "TYPE-P01" | "TYPE-P02" | "TYPE-P03" | "TYPE-P04";
~~~

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
  `PUBLIC_API.md` `API-006`;
- machine -> named module record -> App.M requirements union and Implementation closure;
- exact actor refs, local/shared owner leases, context-binding keys, and four lifecycle states;
- passive actor-bound useView, exact selector values, and command-only useActor/useActorByRef;
- app and machine Story option closure, exact Story targets, operation outcomes, command types,
  immutable checkpoints, run.end, and command-empty model bases;
- strict, isolated-modules, isolated-declarations, packed package, React 18, and React 19 consumer modes.

### TYPE-P02 — Negative proofs

The compile-time portion of this proof does not require conditional types to perform UTF-8 byte
arithmetic or lone-surrogate validation. Those are runtime definition/codec failures owned and
proved by the relevant production boundary; compile fixtures still prove exact literal spelling and
the structural name closure required by the public API.

Compile fixtures using `@ts-expect-error` MUST prove rejection of:

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
- duplicate checkpoints, result-injection commands, missing or duplicate Fixture Implementations, missing
  fixture services, app Stories with direct context injection, and app Stories without exact targets;
- model construction from an app or non-empty command plan, cross-call candidate retention, and named
  testing, path, TurnRecord, receipt, or inspection-result type hierarchies;
- public snapshot raw Effect `Cause.Cause<unknown>` values, receipts, child-machine types, root/dynamic
  actor categories, missing Implementation services, Implementations with remaining inputs, and wrong-app
  boot payloads;
- any or assertion-based erasure in provider, runtime, descriptor, actor, selector, Story, fixture, or
  model boundaries.

### TYPE-P03 — Acyclic carrier and inference-cost proof

Phase 1 MUST compile an isolated private-vNext consumer with at least 25 named module-root machines, 100
total resource/transaction/stream descriptors, cross-module shared descriptors, exact actor-bound passive
views, and strict and isolated-declarations modes. The proof MUST assert exact RequirementsOf<App> and
declaration emit, run `tsc --extendedDiagnostics`, and record a baseline tied to the checked-in TypeScript
version. Instantiation count MUST remain within 10% of the approved baseline, and a paired fixture that
doubles only unrelated roots MUST remain below 2.25 times the smaller fixture. Peak memory is trend evidence
only. A negative fixture MUST reject recursive carrier expansion without an excessive-instantiation error.
The approved baseline MUST NOT include type-level UTF-8 encoders, exhaustive Unicode code-unit unions, or
encoded-byte tuple counters. Runtime `GLO-01` validation is outside this inference-cost proof.

### TYPE-P04 — Production-owner declaration proof

Public declaration output MUST contain no `any` or assertion-based erasure in provider, runtime, descriptor,
actor, passive selector, Story, fixture, or model boundaries. Declaration proofs MUST be paired with the
production-owner runtime, React, Story, persistence, and deletion absence proofs; focused source-text or
type checks cannot stand in for those behavior proofs.
