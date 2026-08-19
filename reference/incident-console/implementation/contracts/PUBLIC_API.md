# Public API contract

Status: normative vNext contract

This contract defines the supported package routes, public values, definition and machine grammar,
operation families, actor and host surface, Story surface, inspection surface, and CLI surface. Type
propagation is specified in [`TYPE_SYSTEM.md`](./TYPE_SYSTEM.md), host behavior in
[`REACT_AND_HOSTS.md`](./REACT_AND_HOSTS.md), and old-surface dispositions in
[`revision-spec/accepted/07-deletions-and-cutover.md`](../revision-spec/accepted/07-deletions-and-cutover.md).

The live package publishes the root, React, testing, server, inspect, and package-manifest routes
(`packages/flow-state/package.json:33-54`). Those route names remain the vNext package boundary.

## Package routes

### API-001 — Routes are isolated named-export surfaces

The package MUST publish these runtime-value exports and MUST NOT publish a package-owned `flow`,
`test`, `inspect`, or `hooks` namespace object. Consumers choose aliases locally.

```ts
import * as flow from "flow-state";
import * as flowTest from "flow-state/testing";
import * as inspect from "flow-state/inspect";
```

```ts
// flow-state
export {
  actorRef,
  app,
  can,
  decodeRuntimeBoot,
  definition,
  FlowBootDecodeError,
  FlowDehydrateError,
  FlowDisposeError,
  machine,
  module,
  resource,
  runtime,
  stream,
  transaction,
};

// flow-state/react
export { FlowProvider, useActor, useActorByRef, useView };

// flow-state/testing
export { behavior, control, fixture, model, story };
export { FlowStoryExecutionError };

// flow-state/server
export { withRequestRuntime };

// flow-state/inspect
export {
  analyzeTrace,
  attachInspectionSink,
  buildBehaviorContract,
  compressTraceArtifact,
  createInspectionBufferSink,
  decompressTraceArtifact,
  diffBehaviorContracts,
  diffTrace,
  exportTraceArtifact,
  formatInspectionEvent,
  formatInspectionTimeline,
  formatNoTransitionSummary,
  formatRehydrationSummary,
  formatResourceFreshnessReport,
  formatTrace,
  formatTransactionOverlapSummary,
  graphOf,
  importTraceArtifact,
  inspectActivities,
  inspectMicrosteps,
  inspectTransition,
  renderBehaviorContract,
  renderBehaviorCoverage,
  renderBehaviorDiff,
  sliceBehaviorContract,
  summarizeTrace,
  whyNoTransition,
};
```

Non-root routes MUST NOT export root builders, and no route exports a package-owned namespace object
(`packages/flow-state/src/public-api-types.test.ts:63-106`).

### API-002 — Root type exports are consumer-facing contracts only

The root MUST export the companion types needed to name or infer its accepted values, including
`Definition`, `StateToken`, `EventToken`, `StateOf`, `EventOf`, `Machine`, `MemoryOf`, `InputOf`,
`RequirementsOf`, `Resource`, `Transaction`, `ActorRef`, `ActorSnapshot`, `Module`, `App`, `Runtime`,
and `CanonicalKeyInput`, together with the app-branded
`RuntimeBootPayload` accepted as immutable boot input. Exact operation-family state shapes are the inferred
unions defined by `REV-OPS-017`; this contract does not export support aliases for them.

The root MUST NOT export `FlowReceipt`, standalone status aliases, full diagnostic facts, or TurnRecord
types, registered-view types, child-machine types, root/dynamic actor category types,
generic operation-ref types, or testing and inspect artifact types. Ordinary actor handles expose their
exact `ActorRef` but carry no individual disposal authority; the owner lease is the separate construction
result and does not require a parallel exported helper type.

`FlowDisposeError` and `FlowStoryExecutionError` are public error boundaries and may carry the installed
Effect `Cause.Cause<unknown>` value without Flow re-exporting a standalone `Cause` namespace or type. Raw
Cause is not part of actor snapshots, passive selector inputs, or serialized artifact and CLI projections;
those boundaries use the package-owned diagnostic or `CauseProjection` shape defined elsewhere.

The root MUST NOT export internal service tags, store or orchestrator implementations, `ManagedRuntime`,
pending outcome records, boot artifact types, test harness types, or inspect artifact types. The public
package boundary exposes only the consumer-facing routes and values above.

## Definition and machine grammar

### API-003 — One definition owns the complete static actor shape

`definition` MUST own the durable machine identity, recursive state and event schemas, optional inherited
context selectors, input-to-memory initialization, and one flat named operation record:

```ts
const NewIntent = definition({
  id: "Incidents/Console",
  states: ["INACTIVE", { ACTIVE: ["EDITING", "SUBMITTING"] }],
  events: {
    SessionEnded: null,
    IntentOpened: (intentId: string) => ({ intentId }),
  },
  context: {
    sessionState: Session.select(({ state }) => state),
    themeMode: Theme.select(({ memory }) => memory.mode),
  },
  operations: {
    routeConfig,
    orderById,
    submitIntent,
    submissionProgress,
  },
  memory: ({ input }: { readonly input: { readonly draftId: string } }) => ({
    draftId: input.draftId,
    mode: "dark",
  }),
});
```

The ordered state declaration MUST accept a string leaf or a recursive single-key compound group. Every
node MUST receive one exact definition-derived token preserving its complete path, such as
`S.ACTIVE.S.EDITING`; transitions MUST use those tokens rather than relative strings or runtime path
lookup. Flow MUST accept at most ten state levels, counting the top-level state as depth one.

Definition event members MUST be frozen nominal tokens. A callable event token MUST return a frozen
readonly plain event envelope whose `type` is the full event identity and whose payload constructor does
not own `type`; a `null` declaration MUST produce a zero-argument constructor. The `id` and event/state
names remain definition-owned and MUST NOT be repeated in a second declaration.

`context` MAY declare readonly pure selectors over other actor definitions. These selectors create typed
definition-level provider edges; they are not long-lived registrations. `memory` MUST be the single
inference and fresh-initialization source: `memory: ({ input }) => Memory` consumes input exactly once,
while omitting the initializer argument fixes `Input = void`. An absent initializer means `Input = void`
and a readonly empty memory record. Restoration installs persisted memory without replaying input or
invoking the initializer. Input MUST NOT classify actors as local or shared.

The `operations` record MUST be flat, named, and inert. Listing a descriptor does not acquire a resource,
run a transaction, or subscribe to a stream; it makes the named operation part of static AppPlan
reachability and preserves its exact value, failure, and requirement types.

### API-004 — Machine construction compiles one behavior callback

The public machine constructor MUST be `machine(definition, callback)`. Its callback receives the exact
definition-derived `S`, `E`, `O`, `onContext`, `onMemory`, `invalidate`, and `clear` capabilities and
returns the machine configuration:

```ts
const newIntentMachine = machine(
  NewIntent,
  ({ S, E, O, onContext, onMemory, invalidate, clear }) => {
    onContext.select(
      ({ context }) => context.sessionState,
      (current) => current === Session.S.SIGNED_OUT && E.SessionEnded(),
    );

    return {
      default: S.INACTIVE,
      states: {
        INACTIVE: {},
        ACTIVE: {
          default: S.ACTIVE.S.EDITING,
          states: {
            EDITING: {},
            SUBMITTING: {},
          },
        },
      },
    };
  },
);
```

The root configuration MUST contain `default` and an exact `states` record for every root declaration.
Each compound node MUST contain its required direct-child `default` and exact nested `states` record;
leaf nodes remain explicit, so `{}` means an empty leaf configuration. Event handlers, activities, timers,
and redirects on a compound node are siblings of its nested `states`. The compiler MUST join the
definition and configuration trees, reject missing, extra, misplaced, duplicate, and non-direct nodes,
and compile the result into static handler and lifecycle tables rather than doing a runtime tree walk.

Machine state nodes MAY contain the existing behavior fields `on`, `redirect`, `activities`, and `timers`,
plus the recursive `default` and `states` fields required by compound nodes. An event `on` entry MAY be a
state-token shorthand, one transition, or an ordered readonly list. Transitions MAY contain only `target`,
`guard`, `updateMemory`, `actions`, and exact-token `reenter`. A redirect MAY be one redirect or an ordered
readonly list with `when` and required `target`. Timer entries retain `delay`, `guard`, required `target`,
and `updateMemory`; timers target events only, and timer-owned finite `actions` MUST NOT be inferred under
`REV-OPS-015`.

The machine grammar MUST NOT expose a final-state kind, `onDone`, final output, child actor, `context`
mutation, `entry`, `exit`, `invoke`, `always`, Boolean `reentry`, transition `submit`, or anonymous
Effect callbacks. A terminal-looking state is an ordinary leaf and does not complete the actor, close its
mailbox, or stop its subscriptions.

`onContext.select` is a machine-level registration. Its initial selected value is recorded silently from
the bootstrapped context baseline; a later changed selection invokes the handler with defined
`(current, previous)`, and the handler returns one typed self-event, `false`, or `null`. The emitted event
enters the ordinary mailbox, whose handler owns legality, guards, memory updates, and finite actions.

`onMemory` and `onMemory.select` own continuing resource or stream plans independently by declaration
slot. Each entry receives current immutable memory, returns one continuing plan, `false`, or `null`, and
releases only that entry when its state exits, normalized identity changes, or the callback returns a
sentinel. A single entry MUST NOT return a runtime-sized array. `onMemory.select` uses the shared selector
equality and receives `(current, previous)` selected values; equal normalized operation identity retains
the existing generation and materialized executable input.

The shared selector MUST be synchronous, pure, and side-effect-free. Scalar and non-record results use
complete-value `Object.is`; named non-null plain-record results use fixed-key, field-by-field `Object.is`.
Selectors do not accept per-registration comparators, and `false` or `null` are no-output sentinels only
for callbacks that map a selection to an event or continuing plan.

Every event macrostep selects the winning transition, evaluates its guard, evaluates `updateMemory` and
then `actions` from the same immutable pre-turn snapshot and event, applies target and memory to a
candidate, stabilizes redirects, validates the complete finite-action batch, stages actor and synchronous
store changes, publishes them atomically, and only then starts or joins asynchronous work. A callback,
redirect, key, target, or batch-validation defect aborts the unpublished whole turn. Timer redirect and
duration behavior remains explicit and bounded by the existing timer contract.

## Named operation families

### API-005 — Resources separate executable input `P` from canonical key `K`

`resource` MUST accept a descriptor ID, one synchronous canonical key projection, a lookup adapter, and
descriptor-owned freshness or collection policy:

```ts
type OrderInput = Readonly<{
  orderId: string;
  client: OrderClient;
}>;

const orderById = resource({
  id: "everclear.order-by-id",
  key: ({ orderId }: OrderInput) => [orderId] as const,
  lookup: ({ orderId, client }: OrderInput, { signal }) => client.getOrder(orderId, { signal }),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});
```

`P` is complete immutable executable input retained by a lookup, transaction attempt, or stream
subscription; it may contain clients and functions and is never identity. `K` is the ordered readonly
canonical tuple returned by `key(P)`. Exact resource identity is descriptor ID plus canonical `K`.
Projection, validation, canonicalization, and defensive freezing MUST finish before ownership, actor/store
mutation, admission, or external work.

Canonical `K` follows `REV-OPS-016`. Flow accepts ordinary dense arrays and plain records, copies them
into Flow-owned containers, recursively freezes them, and freezes the top-level tuple. It sorts record
keys, normalizes `-0` to `0`, and rejects `undefined`, non-finite numbers, bigint, symbols, functions,
accessors, class instances, unsupported objects, cycles, branded secret values, sparse arrays, extra
array properties, symbol keys, and hostile or inconsistent reflection. The exact UTF-8 `KBytes` grammar
has no whitespace or trailing newline, and the limits are 16 nested levels, 256 value nodes, and 8192
encoded bytes. Failure names the exact `K[index]` or nested record path and aborts the candidate turn.
Every result-changing capability, tenant, account, network, permission, or session discriminator MUST be
represented in `K`; runtime partitioning is not a substitute.

The descriptor MUST NOT expose a second identity projection, custom hash, or equality callback. Explicit
freshness and collection policy belong to the descriptor family; this revision establishes no new policy
defaults. Tags derive from canonical `K`, and placeholders remain passive descriptor-owned projection
metadata; neither adds an identity or read method.

### API-006 — Families expose exact passive and executable methods

The machine callback receives the exact named `O` catalogue from the definition. The following notation is
schematic local notation, not a declaration of exported support aliases:

```ts
interface ResourceFamily<P, K extends readonly unknown[], A, E> {
  key(params: P): K;
  getData(key: K): A | undefined;
  getState(key: K): StateShapeNotYetAccepted;
  lookup(params: P, options?: FiniteResourceOptions<A, E>): FiniteOperationPlan;
  subscribe(params: P, options?: ResourceSubscriptionOptions<A, E>): ContinuingOperationPlan;
  refetch(params: P, options?: FiniteResourceOptions<A, E>): FiniteOperationPlan;
  setData(key: K, value: A | ((current: A | undefined) => A | undefined)): CacheWritePlan;
  cancel(key: K): CancellationPlan;
}

interface TransactionFamily<P, K extends readonly unknown[], A, E> {
  key(params: P): K;
  getState(key: K): StateShapeNotYetAccepted;
  commit(params: P, options?: CommitOptions<P, A, E>): TransactionCommitPlan;
  cancel(key: K): CancellationPlan;
}

interface StreamFamily<P, K extends readonly unknown[], V, E> {
  key(params: P): K;
  getState(key: K): StateShapeNotYetAccepted;
  subscribe(params: P, options?: StreamSubscriptionOptions<P, K, V, E>): ContinuingOperationPlan;
}
```

`StateShapeNotYetAccepted` and the option and plan names are documentation sentinels, not public types;
the family-specific state unions are discriminated by the named operation and canonical `K`. Resources
may expose retained data while refreshing; transactions expose finite terminal lanes including uncertain
or reconciliation-required truth; streams expose continuing status, latest value presence, emission count,
generation, and terminal lanes. `lookup`, `commit`, and `subscribe` are the accepted verbs. An omitted
transaction key projector behaves as `key(P) => []`, giving one actor-local identity.

`key`, `getData`, and `getState` are passive: they start no work, acquire no ownership, change no
freshness or collection state, and perform no mutation. Methods that execute descriptor work accept
complete `P`; `K` need not reconstruct it. A `useView` selector receives only passive `O` capabilities.
Operation plans are inert until an accepted event transition action or continuing declaration returns
them.

### API-007 — Transition actions admit finite plans and `onMemory` owns continuing plans

An event transition MAY return one inert finite plan, a readonly list, `null`, or an empty list through
`actions`. Omission, `null`, and an empty list admit no finite work. Actions may admit resource lookup or
refetch, transaction commit or cancel, cache writes, invalidation, and clear. They MUST NOT be inferred on
timers, state activation, passive reads, memory/store revisions, completion, or reconciliation.

```ts
on: {
  SubmitRequested: {
    target: S.SUBMITTING,
    actions: ({ event, memory }) => [
      O.submitIntent.commit(
        buildSubmissionInput(event, memory),
        { outcomes: submitOutcomes },
      ),
    ],
  },
}
```

Finite resource outcomes are `success(A)`, `failure(E)`, `defect()`, and `interrupt()`. Continuing
resource outcomes are `value(A)`, `failure(E)`, `defect()`, and `interrupt()`. Each mapper returns one
typed machine event and receives no `Exit`, `Cause`, state, or lifecycle metadata. A finite occurrence is
admitted once by the accepted event transition; ordinary reconciliation does not restart a consumed
occurrence.

Continuing resource plans remain state `activities`; memory-derived continuing plans remain independent
`onMemory` declarations. These declarations own their runtime subscriptions; machine code MUST NOT manually
unsubscribe for actor correctness. Runtime resource observation remains an explicit external observation
escape hatch and is not required to synchronize actor state. An `after` timer targets an explicit refresh
event; it does not directly admit finite actions or create a polling API.

### API-008 — Transactions are keyed finite actor-owned operations

```ts
const submitIntent = transaction({
  id: "everclear.submit-intent",
  key: ({ submissionId }: SubmitIntentInput) => [submissionId] as const,
  commit: (params: SubmitIntentInput, { signal }) => IntentSubmitter.submit(params, { signal }),
  concurrency: "reject",
});
```

The transaction family exposes only `key`, passive `getState`, finite `commit`, and actor-owned
`cancel`. A missing key projector uses `[]`. `commit(P, options?)` is inert and is admitted only by an
accepted event `actions` declaration. Concurrency is actor-local by transaction descriptor and canonical
`K`; accepted policies are `reject`, `cancel`, `allow`, and `serialize`. Retry is a new `commit(P)` from
a new accepted event, not a retry helper.

Transaction outcomes map `success(A)`, `failure(E)`, `defect()`, and `interrupt()`. A commit MAY declare
authoritative writes, but results never become canonical data implicitly:

```ts
O.submitIntent.commit(params, {
  writes: ({ value }) => [O.orderById.setData([value.order.id], value.order)],
  outcomes: {
    success: (receipt) => E.SubmitSucceeded(receipt),
    failure: (error) => E.SubmitFailed(error),
  },
});
```

The accepted mapping includes explicit `setData` plans, not completion-side `invalidates` or `clears`
options. Exact public state union fields follow `REV-OPS-017`; occurrence terminality and completion-side
preview ordering follow `SEM-016` and `SEM-018`.

### API-009 — Streams are keyed continuing subscriptions

```ts
const submissionProgress = stream({
  id: "everclear.submission-progress",
  key: ({ submissionId }: ProgressInput) => [submissionId] as const,
  subscribe: ({ submissionId, client }: ProgressInput, { signal }) =>
    client.progress(submissionId, { signal }),
});
```

The stream family exposes only passive `key`, passive `getState`, and continuing `subscribe`; it has no
actor `cancel` and does not become a runtime resource entry. Its state retains status, `hasValue`, the
latest value when present, emission count, generation, and terminal status. Equal keys in one live
declaration retain the generation and original `P`; changed keys release exactly once and start another.
Different actors subscribe independently. State exit, selector replacement, actor disposal, `false`, or
`null` finalizes the stream once, and late emissions are suppressed by slot, key, and generation. Emissions
coalesce to the latest projection and become durable state only through mapped events or explicit
authoritative resource writes.

Stream outcomes map `value(V)`, `complete()`, `failure(E)`, `defect()`, and `interrupt()`. Planned release
maps no outcome. Hydration rematerializes an active declaration from live executable input without replaying
old emissions; terminal streams do not restart, and missing executable input fails closed rather than being
reconstructed from `K`.

Invalidation and clearing are actor-level finite actions over exact `[O.resource, K]` targets, declared
reachable nominal tags, and admitted resource families. Planning resolves, validates, and deduplicates
targets before mutation. Invalidation retains data and marks matches stale without starting work directly;
clear removes matched data and metadata, fences generations, interrupts work, and publishes atomically.
There is no zero-argument, wildcard, whole-runtime, or ordinary cache-clear escape hatch. Complete removal
belongs to `runtime.dispose()`.

## Actors, modules, applications, and hosts

### API-010 — Modules preserve named machine records in `App.M`

```ts
const CoreModule = module({
  id: "core",
  machines: {
    router: routerMachine,
    auth: authMachine,
  },
});

const TodoApp = app({
  id: "todo-app",
  persistenceVersion: "1",
  modules: [CoreModule, TodosModule],
});

TodoApp.M.router;
TodoApp.M.auth;
TodoApp.M.todos;
```

`module({ id, machines })` MUST accept an exact keyed machine record and preserve each property name.
`app({ id, persistenceVersion, modules })` MUST accept an ordered array of unaliased modules and flatten
their records into one exact `App.M` catalogue. Duplicate machine property names, repeated machine values,
and duplicate tooling ownership across modules MUST be rejected. Module IDs are unique tooling identity for CLI slicing, trace and inspection grouping, behavior
artifact sections, and module-scoped diffs; they contribute to no machine, actor, persistence, context, or
operation identity.

Renaming a module ID is artifact-breaking: the new build MUST use a different tooling group and artifact
path and MUST NOT silently compare or alias the old module section. The rename remains runtime- and
persistence-compatible because admitted machines, stable actor refs, restored actor state, context
bindings, and operation addresses do not contain the module ID; preserving history requires explicit
artifact migration.

`App.M` is the complete machine-admission catalogue. Every local, shared, and Story-local actor MUST use a
listed machine, and every listed machine contributes its complete operation graph and requirements to the
immutable AppPlan. App compilation creates no actor and a listed machine is not an automatic root. The app
MUST NOT accept `dynamicMachines`, automatic-root identity, or a runtime machine-family actor lookup.

Flow MUST NOT add an XState-style `setup()` or `machine.provide()` layer. Definitions own static actor
shape and the reachable operation catalogue; machines own behavior; apps close ownership and reachability;
runtime Layers supply services; and Story fixtures control test boundaries. Behavior variants require a
distinct definition and durable machine identity.

### API-011 — Actor refs, owner leases, and exact construction authority

```ts
const ref = actorRef(editorMachine, "primary-editor");
const sharedLease = runtime.ensureActor(ref, { input, contextBindings });
const sharedActor = runtime.getActor(ref);
const localLease = runtime.createActor(editorMachine, { input, contextBindings });

sharedLease.actor.send(Editor.E.SessionEnded());
await sharedLease.dispose();

const existingActor = runtime.getActor(ref);
```

Every actor backed by machine `M` carries one exact `ActorRef<M>` exposed as `actor.ref`. A stable ref is an
inert durable address made by `actorRef(machine, id)`; its wire form is the fixed `actor:` namespace tag
followed by the GLO-01 length-prefixed UTF-8 machine-ID and authored stable-ID segments, in that order. An
opaque ref is generated for a local actor and is runtime-local, non-durable, and non-restorable. Refs contain
no input, context bindings, callbacks, ownership, subscription, or disposal authority. Several refs may
address independent actors of one machine, and refs are branded to the exact machine rather than to an app.

`runtime.ensureActor(ref, { input, contextBindings? })` is the durable restore-or-create boundary and
returns an owner lease `{ actor, dispose }`. A restored actor keeps its exact memory and bindings without
rerunning initialization. Otherwise the supplied input and exact bindings create the actor. Concurrent
ensures for one identity join one construction and return authority over that actor. `runtime.getActor(ref)`
is lookup-only, returns the ordinary actor handle, rejects missing, foreign, mismatched, and disposed refs,
and grants no disposal authority.

`runtime.createActor(machine, { input, contextBindings? })` always creates one fresh local actor, accepts
no stable ID, assigns an opaque ref, and returns an owner lease. The actor handle may be passed
independently, but `dispose` exists only on the lease. Dropping a lease does not dispose its actor. A
successful stable-actor disposal tombstones that ref for the current runtime incarnation; lookup and ensure
reject it until runtime shutdown, while a later runtime may reuse the durable ref under ordinary boot rules.

Actor construction MUST bind every declared context slot one-for-one through exact provider refs. Missing,
ambiguous, foreign, and cyclic providers are rejected, and a context edge creates no actor parentage,
lifetime ownership, or command channel. A consumer cannot be rebound while retaining its memory or context
history. Initial runtime construction validates boot actors, completes initial ensures, resolves providers,
seals the graph, and only then activates actors or escapes handles.

### API-012 — Runtime and React expose one production lifecycle

Unknown persisted input enters through the app-bound decoder and returns an immutable branded boot payload:

```ts
const boot = decodeRuntimeBoot(IncidentApp, unknownStoredValue, {
  decodeDomain: ({ kind, value, machineId, descriptorId }) =>
    decodeIncidentDomainValue({ kind, value, machineId, descriptorId }),
});
```

The decoder validates the exact app and persistence identity and visits opaque domain slots in canonical
path order. It returns `RuntimeBootPayload<App>` or throws the frozen package-owned `FlowBootDecodeError`;
unknown values MUST NOT be assertion-cast directly into `runtime`.

Runtime construction retains the app/layer requirement boundary:

```ts
runtime({ app, boot? }); // only when the app has no requirements
runtime({ app, layer, boot? });
```

The runtime exposes the existing readiness, Effect bridge, dehydration, and asynchronous disposal
operations, plus `createActor`, `ensureActor`, and lookup-only `getActor`. It MUST NOT expose
`runtime.actor(machine)`, automatic roots, a public ManagedRuntime, mutable resource/orchestrator services,
test controls, or a public acknowledged-dispatch operation. `dehydrate()` returns an app-branded boot
payload and MUST capture a context-closed cut; `FlowDehydrateError` includes the accepted non-retryable
`NonDurableContextProvider` case. Stream restart after hydration rematerializes from live executable `P`
without replaying emissions; terminal streams do not restart and missing input fails closed.

The production actor lifecycle is the closed union `prepared | active | suspended | disposed`. Prepared
actors are inert and buffer commands; active actors admit commands and own live resources; suspended actors
preserve continuity while rejecting commands and owning no live attachment resources; disposed actors are
terminal. React `useActor(machine, options?)` creates one fresh local actor, `useActorByRef(ref)` resolves
one already-registered shared actor without ownership, and `useView(actor, selector)` is the sole ordinary
reactive observation path. `useActor` and `useActorByRef` are command-only and non-reactive.

Render preparation creates one final prepared actor with its final ref, handle, snapshot, and command-
buffering mailbox without runtime registration or work. Commit attaches that actor, installs its context
baseline, activates it, and drains buffered commands once. Cleanup suspends the same actor; it does not shell-
swap, grace-period, or terminally dispose it. Imperative `createActor` is immediately attached and running.

`useView(actor, selector)` receives one atomic passive actor context containing state, readonly memory,
inherited context, lifecycle, issues, bound `can(event)`, and snapshot-bound read-only `O`. The selector
cannot acquire, refresh, subscribe, commit, write, invalidate, clear, or otherwise mutate runtime state.
Scalar and non-record selected values use complete-value `Object.is`; named records use fixed-key,
field-by-field `Object.is`; no comparator is accepted. Registered view values, view IDs, module view
registration, per-actor React Context, and view-object hooks are removed.

Lifecycle transitions publish one coherent immutable snapshot before inspection evidence. Inspection retains
`actor:start`, `actor:restore`, and `actor:dispose`, adds `actor:suspend` and `actor:resume`, and adds no
`actor:prepare`. Lifecycle evidence is not a machine turn or `TurnRecord`. During each `useView` selector
evaluation, Flow tracks every exact descriptor/`K` read through passive `O.getData` or `O.getState`, replaces
the dependency set after evaluation, and reruns the selector for matching actor or canonical StoreFanout
publications against one tear-free actor/store boundary. This tracking is internal; callers do not manually
subscribe for machine correctness. Projection-only reruns publish a complete actor snapshot and do not
evaluate machine transitions. Exact publication identity, suspended context dependency handling, cleanup
normalization, and prepared SSR bounds remain governed by their existing clauses.

`FlowDisposeError` remains the frozen package-owned cleanup error with `_tag: "FlowDisposeError"`,
`cause: Cause.Cause<unknown>`, and `scope: "actor" | "runtime"`. Lease and runtime disposal are
asynchronous, idempotent, terminal, and cached; disposal rejected because an active or suspended
consumer remains leaves the actor in its current lifecycle and identifies the dependent refs and context paths.

### API-013 — Story is a non-callable namespace with three constructors

The public Story constructors MUST be:

```ts
story.app(runtimeFactory, options?);
story.machine(machine, options?);
story.actor(machine, options?);
```

`story.app` accepts `boot?`, `fixtures?`, `maxTurns?`, `title?`, `description?`, and `tags?`.
`story.machine` accepts exact required `input`, selected initial `context`, `fixtures?`, `maxTurns?`,
`title?`, `description?`, and `tags?`, with conditionally forbidden fields rejected. `story.actor` accepts
only exact required `input` and `contextBindings` for the recipe. Focused Stories reject boot, refs, extra
actors, raw memory, initial state, and actor snapshots. A void-input machine rejects authored `input`.

`story.app` accepts the same typed `RuntimeFactory<App>` used by live hosts, not a bare app or created
runtime. Every run uses production bootstrap, fixture-backed capabilities, TestClock, boot restoration,
factory ensures, AppPlan validation, graph sealing, activation, and cleanup. `story.machine` uses a
package-private one-machine AppPlan and the same production runtime, actor engine, operation kernels,
context-turn path, scheduler, inspection, read barrier, and cleanup. `maxTurns` bounds repeated processing
and defaults to `100` when omitted.

Plans are immutable and inert until `run()`; they contain no live actor handles, loops, predicates,
arbitrary execution callbacks, embedded assertions, or behavior branches. Runtime factories are bootstrap
authority, not command callbacks.

### API-014 — Story commands, controlled observations, and evidence

The complete command surface is:

```ts
// Both Story kinds
process();
advance(duration);
advanceTo(epochMilliseconds);
advanceToNextTimer();
checkpoint(name);
run({ signal? });

// App Story
send(target, event);
simulate(target, operationPlan, observation);

// Machine Story
send(event);
simulate(operationPlan, observation);
setContext(context);
```

`send` targets an exact app-owned `ActorRef` or exact Story actor recipe in app Stories and omits a target
only in machine Stories. A machine family is never a Story target. `setContext` exists only on machine
Stories and injects exact already-selected values through the production context-turn path; app Stories do
not inject context.

`process()` replaces `flush()` and `settle()` and drains ready production work until no work can progress
without another command or future time. It does not advance time or invent external results. Clock movement
and `simulate` do not process implicitly. `advance` moves duration, `advanceTo` moves to an absolute
epoch-millisecond value, and `advanceToNextTimer` moves the TestClock to the next timer. `checkpoint` reads
evidence immediately without progressing or creating restoration input.

`simulate` uses one package-private interception point at the production external-execution boundary.
Flow atomically validates actor incarnation, operation family, descriptor, canonical `K`, one-based
occurrence, and shared generation/lease epoch when applicable. It accepts only an admitted pending
occurrence owned by an active actor; missing, foreign, mismatched, not-yet-admitted, already-settled,
wrong-kind, suspended, and disposed targets fail through the package diagnostic before external execution
is replaced. The family-specific observation enters the ordinary completion kernel, which alone settles
the occurrence or shared generation, releases ownership, applies writes and overlays, updates projections
and status, maps authored events, and emits evidence. `simulate` creates no work and does not cancel, retry,
process unrelated work, bypass lifecycle admission, or mutate runtime state directly. A terminal shared
generation observation updates every attached actor occurrence once; later terminal observations fail as
already settled. Live hosts retain ordinary adapter execution. Actor-local ordinals are one-based,
monotonic, and non-reused within an incarnation and are independent of executable `P`, plan identity, and
callback identity; streams retain declaration occurrences while generations and lease epochs identify shared
execution. Bounded occurrence facts fence cancellation, supersession, suspension, and hydration, and
hydration never replays external work. Occurrence history is not a public registry or handle.

App checkpoints and end evidence use exact actor lookup:

```ts
appRun.checkpoints["signed-out"].actor(editor).snapshot;
appRun.checkpoints["signed-out"].actor(PrimarySessionRef).snapshot;
appRun.checkpoints["signed-out"].runtime.now;
appRun.checkpoints["signed-out"].runtime.pendingWork;
appRun.end.actor(editor).snapshot;

machineRun.checkpoints["signed-out"].snapshot;
machineRun.end.snapshot;
```

Checkpoints and successful `run.end` are deeply frozen through one production `DehydrateBarrier` read cut.
The barrier follows the Store commit permit, captures the complete static Story-plan closure (single
machine actor or every app recipe plus exact refs in boot, context bindings, command targets, and
transitive providers), one StoreState revision, published snapshots, pending work, TestClock time, and
the accepted runtime evidence prefix, then deeply freezes the roots before releasing registry leases.
Unrelated runtime actors are excluded and `actor(...)` performs no live lookup. Capture does not process,
move time, create, dispose, restore, or perform external work; `run.end` is captured after commands and
before cleanup and does not imply actor completion. Failed execution retains completed checkpoints and a
package-owned frozen `FlowStoryExecutionError` envelope with `cause: Cause.Cause<unknown>`, optional end evidence, failure boundary,
primary and ordered cleanup diagnostics, cancellation evidence, and accepted/drained evidence-sequence
facts. Command admission closes before non-abortable finalization; cleanup runs in reverse dependency and
deterministic phase order even after failures. A cleanup failure retains captured end evidence but never
returns success; failure before end capture never manufactures `run.end`. Its public failure envelope carries
the complete Effect `Cause.Cause<unknown>` alongside the package-owned diagnostic facts.

### API-015 — Fixtures and models remain inferred production inputs

Fixtures remain the reusable Story environment input. Stories install fixture capabilities through their
closed constructor options; a Story layer MUST close the app or focused-machine requirements. Existing
control refs retain typed success, failure, defect, interruption, emission, and completion capabilities
only where their endpoint supports them, and ordinals remain run-local.

```ts
const baseStory = story.machine(incidentMachine, {
  fixtures: [incidentApiFixture],
});

const incidentModel = model(baseStory, {
  stateKey: ({ value, memory }) => [value.id, memory],
});

const result = incidentModel.getShortestPaths({
  events: [NewIntent.E.IntentOpened("incident-1"), NewIntent.E.SessionEnded()],
  maxDepth: 20,
  limit: 100,
});

await result.paths[0]!.story.run();
```

`model(baseStory, { stateKey })` accepts only a command-empty fresh machine Story. Candidate events
belong solely to each traversal call and are not retained by the model or base Story. The model exposes
only `getShortestPaths` and `getSimplePaths`, returns frozen inferred path collections, and does not run
Effects, synthesize asynchronous routes, or expose replay/provide/clock helpers. Each `path.story` extends
the base with that call's exact candidate events and starts with no checkpoints.

`FlowStoryExecutionError` is the only named testing runtime class. Run, path, checkpoint, status, phase,
evidence, and diagnostic shapes remain inferred unless accepted elsewhere. Its package-owned frozen failure
envelope is accepted by REV-TEST-006 and REV-TEST-008 and carries the complete public
`Cause.Cause<unknown>` value for the failed execution.

## Inspection and CLI

### API-016 — Inspection derives from production records and bounded artifacts

Pure graph and transition functions accept inert definitions or immutable snapshots. Live inspection
consumes committed `TurnRecord`s and immutable `LifecycleRecord`s after actor publication and uses the
shared private v2 codecs for trace and behavior artifacts. Inspection MUST NOT maintain a second mutable
history or fabricate a trace from an arbitrary snapshot.

Pure transition inspection performs one planner pass and may report transition selection, redirect
microsteps, memory patches, and desired authored operation plans. It cannot report actual starts, releases,
generations, pending outcomes, or finalizers that exist only after production interpretation. `TurnRecord`
remains package-private; inspect exports inferred immutable receipt, `CauseProjection`-bearing diagnostic, trace,
behavior, and artifact projections without recreating a parallel public hierarchy.

`attachInspectionSink(runtime, sink)` accepts only a sink created by this route and observes records admitted
after attachment. It returns a frozen attachment with `drain()` and `dispose()`; slow processing does not
delay actor acknowledgement or StoreFanout. A failed sink detaches after preserving committed state and
leaves other sinks active. `createInspectionBufferSink({ capacity })` owns explicit bounded retention and
does not make the runtime retain an implicit unbounded history. Formatters remain one per projection.

### API-017 — CLI consumes registered behavior and typed artifacts only

The installed `flow-state` binary MUST implement the exact grammar, TypeScript gateway boundary, bounded
v2 artifact path, Story-executor parity, immutable result envelopes, stdout/stderr, exit, signal,
atomic-file, and truncation laws in [`CLI.md`](./CLI.md). `behavior check` is the only new leaf beyond
the retained behavior, Story, and trace families. Model path discovery remains programmatic.

The CLI MUST NOT accept arbitrary payload-bearing event JSON, old Scenario/local-proof compatibility input,
batch Story execution, or another history/runner owner. Artifact and CLI schemas MUST represent app Stories,
exact actor evidence lookup, `run.end`, module tooling ownership, compound states, context requirements,
lifecycle records, and named operation identities before promotion.

## Proof obligations

### API-P01 — Export-map and deletion proof

Packed-package tests MUST assert the exact public routes and root runtime-value list, reject private deep
imports, and prove absence of deleted child, registered-view, automatic-root/dynamic-actor, generic
operation-ref/activity-kit, and old Story constructor/command surfaces. Non-root routes cannot import root
builders, and ordinary actor handles and refs cannot recover owner-lease disposal authority.

### API-P02 — Grammar and inference proof

Positive and negative compile fixtures MUST cover recursive states through depth ten, exact default paths,
compound handlers, exact leaf matching, `actions`, `onContext`, `onMemory`, `P`/`K`, named `O` families,
actor refs and leases, exact context bindings, four lifecycle states, passive `useView`, all three Story
constructors, exact Story targets, `simulate`, `process`, `advanceTo`, checkpoints, and model restrictions.

### API-P03 — Production semantic proof

Runtime tests MUST prove inert descriptor/key/passive reads, canonical identity bounds, atomic event/action
publication, runtime-scoped resource sharing, generation fencing, actor-owned cancellation, context graph
bootstrap, lease disposal and tombstones, prepared/active/suspended/disposed lifecycle, Story production
parity, exact controlled observations, evidence cuts, and CLI refusal of arbitrary event fabrication. The
historical `BEH-*` register and its accepted `REV-*` closures remain outside this public API contract; this
file MUST NOT invent a public surface to satisfy a proof obligation.
