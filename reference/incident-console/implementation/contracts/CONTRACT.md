# Proposed Flow State Rewrite Contract

Status: proposed replacement; not formally accepted.

This is one implementer-facing proposed replacement contract for packages/flow-state-rewrite. It is intentionally
API-documentation-like: every public route is named, public functions and values are explained, specified signatures
are retained, ownership/lifecycle/failure rules are stated, and accepted examples are preserved where the active
contracts provide them.

The active files under reference/incident-console/implementation/contracts/ remain normative until this proposal is
formally promoted. revision-spec/README.md states that those active contract files are the current normative
authority; archived revisions, provenance records, UNRESOLVED_BEHAVIOR.md, implementation, and proofs do not
promote this document. This proposal MUST NOT add an API, behavior, default, exception, compatibility path, or proof
obligation. Where an active contract supplies only a name or behavior, this proposal records that limitation instead
of fabricating a signature or example.

`DEFERRED.md` is the non-normative record of guarantees deliberately removed or relaxed during simplification.
It does not remove any public route or feature family listed here, create future work, or override the retained
normative behavior in the active contract files.

Examples are source-faithful. Undeclared names represent definitions, services, refs, implementations, or fixtures
specified by their owning active contract; their appearance adds no overload or public route.

## 1. Routes and root API

Accepted route imports:

~~~ts
import * as flow from "flow-state";
import * as flowTest from "flow-state/testing";
import * as inspect from "flow-state/inspect";
~~~

The root flow-state route MUST expose exactly:

actorRef, app, can, definition, FlowDisposeError, FlowPersistenceError, FlowUsageError, Implementation,
indexedDbStorage, machine, module, persistence, resource, runtimeSetup, stream, transaction, and webStorage.

flow-state/react MUST expose FlowProvider, useActor, useActorByRef, and useView.

flow-state/testing MUST expose behavior, fixture, model, story, and FlowStoryExecutionError.

flow-state/inspect MUST expose exactly:

analyzeTrace, attachInspectionSink, buildBehaviorContract, compressTraceArtifact, createInspectionBufferSink,
decompressTraceArtifact, diffBehaviorContracts, diffTrace, exportTraceArtifact, formatInspectionEvent,
formatInspectionTimeline, formatNoTransitionSummary, formatRehydrationSummary, formatResourceFreshnessReport,
formatTrace, formatTransactionOverlapSummary, graphOf, importTraceArtifact, inspectActivities, inspectMicrosteps,
inspectTransition, renderBehaviorContract, renderBehaviorCoverage, renderBehaviorDiff, sliceBehaviorContract,
summarizeTrace, and whyNoTransition.

Routes are isolated named-export surfaces. The package MUST NOT add package-owned flow, test, inspect, or hooks
namespace objects, private deep imports, root builders on non-root routes, or compatibility aliases.

### Root function/value reference

| Public value | Accepted purpose and signature/example | Ownership and failure behavior |
| --- | --- | --- |
| definition | definition({ id, states, events, context?, operations?, memory? }); see section 2. | Inert static authoring; creates no actor, runtime, operation, or work. Invalid grammar fails before side effects. |
| machine | machine(definition, callback); callback receives S, E, O, onContext, onMemory, invalidate, and clear; see section 2. | Inert reusable behavior. Planning defects leave prior published truth unchanged. |
| module | module({ id, machines }); exact keyed record preserved. | Inert tooling grouping; duplicate machine values or ownership reject. |
| app | app({ id, persistenceVersion, modules }); exact flattened App.M. | Inert closed admission universe; compilation creates no actors. |
| actorRef | actorRef(machine, id, { persist?: boolean }); persist defaults false. | Inert machine-branded identity only; no input, bindings, ownership, callbacks, or disposal. |
| resource | Resource descriptor with id, key(P), lookup, and optional persist, staleTime, gcTime; see section 3. | Inert declaration. Canonical input failure precedes ownership, mutation, admission, and external work. |
| transaction | Transaction descriptor with id, key(P), commit(P, { signal }), optional persist, concurrency; see section 3. | Inert declaration. Commit is admitted only by an accepted action; writes are explicit. |
| stream | Stream descriptor with id, key(P), subscribe(P, { signal }), optional persist; see section 3. | Inert declaration. Declaration slot and actor lifecycle own the subscription. |
| runtimeSetup | Exact overloads in section 5; returns inert RuntimeSetup. | construct() is synchronous/inert; only runtime.ready() bootstraps and restores. |
| Implementation | Namespace has exactly succeed, effect, and merge; see section 5. | Inert provider graph. Runtime owns acquisition, scopes, and finalizers. |
| persistence | persistence({ storage, scope, codec?, filter? }); see section 7. | Inert optional provider; Runtime owns restore, observation, writes, and cleanup. |
| webStorage | webStorage(storage: Storage): PersistenceStorage. | Host adapter to typed storage boundary; adapter failures remain persistence failures. |
| indexedDbStorage | indexedDbStorage(storage: IndexedDBStorage): PersistenceStorage. | Same boundary; active contracts do not specify the IndexedDBStorage input shape. |
| can | Root name is accepted by API-001. Active contracts only specify bound pure use as can(event); no standalone signature/example is specified. | No standalone behavior may be inferred. Bound legality reads remain pure and passive. |
| FlowUsageError | Exact class in section 2. | Stable usage/admission diagnostic; consumers use _tag and code, not message parsing. |
| FlowPersistenceError | Persistence/storage/codec/restoration boundary; complete class declaration is not specified. | Preserves storage, codec, identity/version, malformed-data, concurrent-capture, and non-durable-provider truth. |
| FlowDisposeError | Frozen _tag, cause, and scope; exact additional declaration is not specified. | Actor/runtime disposal boundary; disposal is async, idempotent, cached, terminal, and owner-scoped. |

Common accepted path:

~~~ts
import { Effect } from "effect";
import { app, definition, machine, module, runtimeSetup } from "flow-state";

const Counter = definition({
  id: "Quickstart/Counter",
  states: ["IDLE"],
  events: { Increment: null },
  memory: () => ({ count: 0 }),
});

const CounterMachine = machine(Counter, ({ S }) => ({
  default: S.IDLE,
  states: {
    IDLE: {
      on: { Increment: { target: S.IDLE, updateMemory: ({ memory }) => ({ count: memory.count + 1 }) } },
    },
  },
}));

const CounterApp = app({
  id: "quickstart",
  persistenceVersion: "1",
  modules: [module({ id: "counter", machines: { counter: CounterMachine } })],
});

const runtime = runtimeSetup({ app: CounterApp }).construct();
await Effect.runPromise(runtime.ready());
const lease = runtime.createActor(CounterMachine);
lease.actor.send(Counter.E.Increment());
const snapshot = lease.actor.getSnapshot();
await lease.dispose();
~~~

## 2. Public types, definitions, and machines

The public root type names are exactly:

~~~ts
type PublicRootNames =
  | "Definition" | "StateToken" | "EventToken" | "StateOf" | "EventOf" | "Machine"
  | "MemoryOf" | "InputOf" | "RequirementsOf" | "Resource" | "Transaction" | "ActorRef"
  | "ActorSnapshot" | "Module" | "App" | "RuntimeSetup" | "Runtime" | "Implementation"
  | "Persistence" | "PersistenceStorage" | "PersistenceStorageError" | "PersistenceCodec"
  | "PersistenceSlot" | "PersistenceValue" | "PersistenceEntry" | "CanonicalKeyInput"
  | "FlowPath" | "FlowUsageCode" | "FlowUsageError";
~~~

The public types have these purposes. Where the active contracts do not publish a complete declaration, this table
intentionally records the accepted role without inventing generic parameters, members, or aliases.

| Public type | Purpose, shape, and constraints |
| --- | --- |
| `Definition` | Inert static actor shape produced by `definition`; retains literal durable ID, recursive state/event schema, selected context, named operations, input, and memory. Complete generic declaration unspecified. |
| `StateToken` | Nominal exact state-path token, including recursive paths such as `S.ACTIVE.S.EDITING`; it is not a relative string or runtime lookup key. Complete generic declaration unspecified. |
| `EventToken` | Nominal frozen event constructor/envelope retaining the exact event name, parameter tuple, readonly payload, and full `type`; structural impostors reject. Complete generic declaration unspecified. |
| `StateOf` | Type-level extractor accepting a Definition or Machine and returning its exact active-leaf token union. Complete declaration unspecified beyond that behavior. |
| `EventOf` | Type-level extractor accepting a Definition or Machine and returning its exact event-envelope union. Complete declaration unspecified beyond that behavior. |
| `Machine` | Inert reusable behavior compiled from one Definition and exact machine grammar; retains input, memory, events, context, operations, and requirements. Complete generic declaration unspecified. |
| `MemoryOf` | Type-level extractor for the exact memory inferred from the Definition's sole memory initializer. Complete declaration unspecified. |
| `InputOf` | Type-level extractor for exact fresh-construction input; resolves to `void` when the initializer/input is absent. Complete declaration unspecified. |
| `RequirementsOf` | Type-level extractor for the complete inferred Effect service environment of a descriptor, Machine, Module, or App, excluding only Flow-owned Scope at the Runtime boundary. Complete declaration unspecified. |
| `Resource` | Public inert resource descriptor type carrying exact executable P, canonical K, success A, typed failure E, and requirements R. Its family methods are inferred through named O, not exported as a generic operation ref. |
| `Transaction` | Public inert transaction descriptor type carrying exact P/K/A/E/R and explicit concurrency/persistence policy. Its family remains independent of the parent Machine. |
| `ActorRef` | Exact machine-branded inert actor identity. Stable refs may carry authored identity and persistence declaration metadata; refs carry no input, bindings, ownership, subscriptions, or disposal. Complete generic declaration unspecified. |
| `ActorSnapshot` | Deeply immutable current actor projection containing exact active leaf, readonly memory/context, revision/storeRevision, lifecycle, issues, and passive named O readers. Complete generic declaration unspecified. |
| `Module` | Inert exact keyed machine record plus tooling ID; module identity does not enter machine, actor, operation, Runtime, or persistence identity. Complete generic declaration unspecified. |
| `App` | Inert closed application description with exact flattened `App.M`, app ID, persistence version, requirements, ownership, and reachability. Complete generic declaration unspecified. |
| `RuntimeSetup` | Inert result of `runtimeSetup`; `construct()` synchronously returns one Runtime without I/O. Its App and ImplementationError parameters are fixed by the runtimeSetup overloads in section 5. |
| `Runtime` | Public host handle over one production owner. Accepted operations are readiness, exact actor ensure/lookup/create, requirement-closed Effect bridges, and async idempotent disposal; no complete interface declaration is published. |
| `Implementation` | Inert typed provider graph whose outputs close `RequirementsOf<App>` and whose acquisition may fail with its typed ImplementationError. The same root name is also the value namespace with exactly `succeed`, `effect`, and `merge`. |
| `Persistence` | Deeply readonly inert provider `{ storage, scope, codec, filter? }`; exact notation is in section 7. It is not a Runtime, AppPlan input, or synchronization/conflict protocol. |
| `PersistenceStorage` | Typed Effect boundary with exactly `read`, `write`, and `remove`; exact notation is in section 7. |
| `PersistenceStorageError` | Typed failure channel for storage adapter operations. The active contracts do not publish its complete declaration or constructor, so both remain unspecified. |
| `PersistenceCodec` | Synchronous pure slot codec with `encode(value, slot)` and `decode(value, slot)`; it performs no storage, Effect, actor creation, work resumption, or complete boot decoding. |
| `PersistenceSlot` | Public bounded identity describing the actor/resource/transaction/stream slot being encoded or decoded. Complete nested union is not published and remains unspecified. |
| `PersistenceValue` | Public bounded canonical JSON value accepted/emitted by PersistenceCodec. Complete recursive declaration is not published and remains unspecified. |
| `PersistenceEntry` | Public metadata supplied to the persistence filter: stable kind/identity, owning stable actor, and canonical K as applicable. It carries no executable P. Complete declaration unspecified. |
| `CanonicalKeyInput` | Bounded canonical JSON-safe value accepted by operation keys and model `stateKey`; canonicalization copies/freezes and applies the grammar and limits in section 3. Complete type declaration unspecified. |
| `FlowPath` | Exact immutable diagnostic path `readonly (string | number)[]`. |
| `FlowUsageCode` | Exact 18-member usage/admission discriminant union shown below. |
| `FlowUsageError` | Public immutable usage/admission Error carrying `_tag`, code, path, and scalar/null details; exact declaration shown below. Message text is human remediation, not a parsing surface. |

Internal AppPlan, TurnRecord, StoreState, ManagedRuntime, boot carriers, fixture artifacts, operation registries, and
the private v2 artifact model MUST NOT become public types.

### Usage errors

~~~ts
type FlowPath = readonly (string | number)[];
type FlowUsageCode =
  | "InvalidCanonicalValue" | "ForeignActorRef" | "MismatchedActorRef" | "MissingActorRef"
  | "DisposedActorRef" | "RuntimeNotReady" | "RuntimeDisposed" | "MissingContextProvider"
  | "ContextDependencyCycle" | "DuplicateActorClaim" | "UnadmittedMachine" | "ActorNotActive"
  | "InvalidOperationPlan" | "WrongOperationKind" | "OperationNotPending"
  | "OperationAlreadySettled" | "DuplicateStreamDeclaration" | "BlockedByDependents";

class FlowUsageError extends Error {
  readonly _tag: "FlowUsageError";
  readonly code: FlowUsageCode;
  readonly path: FlowPath;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}
~~~

There are exactly 18 FlowUsageCode values. FlowPersistenceError owns persistence failures. Raw Effect Cause MUST
NOT appear in snapshots, selectors, serialized artifacts, or CLI results. Only FlowDisposeError and
FlowStoryExecutionError retain complete Cause.Cause<unknown> in process.

FlowDisposeError is frozen and has _tag: "FlowDisposeError", cause: Cause.Cause<unknown>, and
scope: "actor" | "runtime". FlowStoryExecutionError has one deeply frozen package-owned failure envelope with
completed checkpoints, optional end, failure boundary, primary/ordered cleanup diagnostics, cancellation evidence,
accepted/drained evidence facts, and complete public Cause. Their complete class declarations are not specified.

### definition

~~~ts
const NewIntent = definition({
  id: "Incidents/Console",
  states: ["INACTIVE", { ACTIVE: ["EDITING", "SUBMITTING"] }],
  events: { SessionEnded: null, IntentOpened: (intentId: string) => ({ intentId }) },
  context: {
    sessionState: Session.select(({ state }) => state),
    themeMode: Theme.select(({ memory }) => memory.mode),
  },
  operations: { routeConfig, orderById, submitIntent, submissionProgress },
  memory: ({ input }: { readonly input: { readonly draftId: string } }) => ({
    draftId: input.draftId, mode: "dark",
  }),
});
~~~

definition owns durable identity, recursive states/events, readonly context selectors, one input-to-memory
initializer, and one flat named operation record. State leaves are strings; compound states are recursive
single-key declarations, max ten levels. Exact path tokens include S.ACTIVE.S.EDITING. Null events are
zero-argument nominal constructors; callable events return frozen readonly envelopes with full type.

Definition values are inert. Duplicate declarations, relative targets, runtime path lookup, operation work during
authoring, and using actor input as identity MUST reject. Without memory, Input is void and memory is readonly
empty. Restoration installs memory without replaying input.

Accepted inference:

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

Input and memory use the definition's one accepted inference path:

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

### machine

~~~ts
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
~~~

The machine callback receives exact S, E, O, onContext, onMemory, invalidate, and clear, and returns the complete
mirrored configuration. Root and compound nodes require default and exact direct-child states; leaves remain
explicit and {} is an empty leaf.

State nodes may contain on, redirect, activities, and timers. Event entries are token shorthand, one transition, or
an ordered readonly list. Transitions contain only target, guard, updateMemory, actions, and exact-token reenter.
Redirects contain when and required target; timers contain delay, guard, target, and updateMemory, and target events
only.

onContext.select records its initial selection silently; changed selections call (current, previous) and return one
typed self-event, false, or null. onMemory and onMemory.select own continuing resource/stream plans by declaration
slot. Equal normalized identity retains generation and executable P; exit, identity change, false, or null releases
only that slot. Selectors are synchronous, pure, and side-effect-free. Scalar/non-record selection uses complete-
value Object.is; named plain records use fixed-key fieldwise Object.is.

Each event macrostep plans from one pre-turn snapshot, evaluates guard then memory update then actions, stabilizes
redirects, validates all finite actions, stages actor/store changes, publishes atomically, and only then starts async
work. Planning defects leave prior published truth unchanged.

Final nodes, onDone, final output, child actors, context mutation, entry, exit, invoke, always, Boolean reentry,
transition submit, anonymous Effects, runtime-sized single-entry arrays, and timer-owned finite actions MUST NOT be
exposed. A terminal-looking leaf never completes the actor.

## 3. Operations, resources, transactions, and streams

### Resource, P, and K

~~~ts
type OrderInput = Readonly<{
  orderId: string;
}>;

const orderById = resource({
  id: "everclear.order-by-id",
  key: ({ orderId }: OrderInput) => [orderId] as const,
  lookup: ({ orderId }: OrderInput, { signal }) =>
    Effect.gen(function* () {
      const client = yield* OrderClient;
      return yield* client.getOrder(orderId, { signal });
    }),
  persist: true,
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});
~~~

P is complete immutable executable input retained by live operation work. K=key(P) is the ordered readonly
canonical tuple; identity is descriptor ID plus K. P may contain clients/functions for execution; runtime
capabilities remain in inferred requirements R. K is never executable input and never inverted into P.

Flow MUST copy/freeze accepted values before ownership or external work. It MUST reject undefined, non-finite
numbers, bigint, symbols, functions in canonical positions, accessors, classes, unsupported objects, cycles,
sparse/extra-property arrays, hostile reflection, and inconsistent reflection. Bounds are depth 16, 256 value nodes,
and 8192 UTF-8 bytes. There is no second key, custom hash/equality, or invented freshness default.

~~~text
KBytes ::= "[" [ Value *( "," Value ) ] "]"
Value ::= "null" | "true" | "false" | Number | String
        | "[" [ Value *( "," Value ) ] "]"
        | "{" [ Member *( "," Member ) ] "}"
Member ::= String ":" Value
~~~

Finite numbers use JSON.stringify (-0 becomes 0); strings use JSON escaping without normalization; records sort raw
UTF-16 keys and use ordinary/null prototypes with enumerable own data properties and no symbols; arrays are dense
and have no extra properties. Read data descriptors only: no getters, coercion, toJSON, or user iteration.

### Exact operation family methods

~~~ts
interface ResourceFamily<P, K extends readonly unknown[], A, E> {
  key(params: P): K; getData(key: K): A | undefined; getState(key: K): ResourceState<A, E, K>;
  lookup(params: P, options?: FiniteResourceOptions<A, E>): FiniteOperationPlan;
  subscribe(params: P, options?: ResourceSubscriptionOptions<A, E>): ContinuingOperationPlan;
  refetch(params: P, options?: FiniteResourceOptions<A, E>): FiniteOperationPlan;
  setData(key: K, value: A | ((current: A | undefined) => A | undefined)): CacheWritePlan;
  cancel(key: K): CancellationPlan;
}
interface TransactionFamily<P, K extends readonly unknown[], A, E> {
  key(params: P): K; getState(key: K): TransactionState<A, E, K>;
  commit(params: P, options?: CommitOptions<P, A, E>): TransactionCommitPlan;
  cancel(key: K): CancellationPlan;
}
interface StreamFamily<P, K extends readonly unknown[], V, E> {
  key(params: P): K; getState(key: K): StreamState<V, E, K>;
  subscribe(params: P, options?: StreamSubscriptionOptions<P, K, V, E>): ContinuingOperationPlan;
}
~~~

These are inferred named O family shapes, not extra routes. Resource methods are key/getData/getState,
lookup/subscribe/refetch/setData/cancel. Transaction methods are key/getState/commit/cancel. Stream methods are
key/getState/subscribe and have no actor cancel.

| Family method | Purpose and behavioral constraint |
| --- | --- |
| Resource `key(params)` | Canonicalizes complete executable P to exact K; it MUST NOT acquire ownership, mutate state, or start lookup. |
| Resource `getData(key)` | Passively returns actor-effective data or `undefined`; a miss MUST NOT materialize or refresh. |
| Resource `getState(key)` | Passively returns the exact resource-state union for K without acquiring, retaining, or mutating. |
| Resource `lookup(params, options?)` | Returns one inert finite lookup plan admitted only when an accepted transition action returns it. |
| Resource `subscribe(params, options?)` | Returns one inert continuing resource plan owned by an authored declaration slot and actor lifecycle. |
| Resource `refetch(params, options?)` | Returns a finite replacement-generation lookup plan carrying its own complete P. |
| Resource `setData(key, valueOrUpdater)` | Returns an explicit cache-write plan; it does not mutate until admitted in an accepted finite action batch. |
| Resource `cancel(key)` | Returns an actor-local cancellation plan for matching owned finite resource work. |
| Transaction `key(params)` | Canonicalizes transaction P to K without admission or execution. |
| Transaction `getState(key)` | Passively returns the exact transaction-state union for K. |
| Transaction `commit(params, options?)` | Returns one inert commit plan with explicit writes/outcome mappers and descriptor concurrency policy. |
| Transaction `cancel(key)` | Returns an actor-local cancellation plan for matching owned transaction occurrences. |
| Stream `key(params)` | Canonicalizes stream P to K without starting a subscription. |
| Stream `getState(key)` | Passively returns exact latest/count/generation/terminal stream projection for K. |
| Stream `subscribe(params, options?)` | Returns one continuing subscription plan owned by a declaration slot; the family intentionally exposes no actor `cancel`. |

~~~ts
type ResourceRetention<A> = { data?: never } | { data: A };
type ResourceState<A, E, K extends readonly unknown[]> =
  | { status: "missing"; key: K }
  | { status: "pending"; key: K; generation: number }
  | { status: "ready"; key: K; generation: number; data: A }
  | { status: "refreshing"; key: K; generation: number; data: A }
  | ({ status: "failure"; key: K; generation: number; error: E } & ResourceRetention<A>)
  | ({ status: "defect"; key: K; generation: number; defect: unknown } & ResourceRetention<A>)
  | ({ status: "interrupted"; key: K; generation: number } & ResourceRetention<A>);
type TransactionState<A, E, K extends readonly unknown[]> =
  | { status: "idle"; key: K }
  | { status: "pending"; key: K; generation: number }
  | { status: "success"; key: K; generation: number; value: A }
  | { status: "failure"; key: K; generation: number; error: E }
  | { status: "defect"; key: K; generation: number; defect: unknown }
  | { status: "interrupted"; key: K; generation: number }
  | { status: "unknown"; key: K; generation: number; reconcileRequired: true };
type StreamValue<V> =
  | { hasValue: false; latest?: never; emissionCount: 0 }
  | { hasValue: true; latest: V; emissionCount: number };
type StreamState<V, E, K extends readonly unknown[]> =
  | ({ status: "idle"; key: K; generation: null } & StreamValue<V>)
  | ({ status: "running"; key: K; generation: number } & StreamValue<V>)
  | ({ status: "complete"; key: K; generation: number } & StreamValue<V>)
  | ({ status: "failure"; key: K; generation: number; error: E } & StreamValue<V>)
  | ({ status: "defect"; key: K; generation: number; defect: unknown } & StreamValue<V>)
  | ({ status: "interrupted"; key: K; generation: number } & StreamValue<V>);
~~~

Resource statuses are missing/pending/ready/refreshing/failure/defect/interrupted. Transaction statuses are
idle/pending/success/failure/defect/interrupted/unknown; unknown requires reconcileRequired: true. Stream statuses
are idle/running/complete/failure/defect/interrupted with exact hasValue/latest/emissionCount.

### Actions and outcomes

Finite actions admit one inert plan, a readonly list, null, or empty list. Accepted finite work is lookup/refetch,
commit/cancel, cache write, invalidate, or clear. Work is never inferred from activation, timers, passive reads,
store revisions, completion, or reconciliation. Finite outcomes are success/failure/defect/interruption; continuing
resource outcomes are value/failure/defect/interruption. Mappers return one typed event and receive no Cause/state/
lifecycle metadata. Occurrences settle once.

~~~ts
const submitIntent = transaction({
  id: "everclear.submit-intent",
  key: ({ submissionId }: SubmitIntentInput) => [submissionId] as const,
  commit: (params, { signal }) => IntentSubmitter.submit(params, { signal }),
  persist: true, concurrency: "reject",
});

O.submitIntent.commit(params, {
  writes: ({ value }) => [O.orderById.setData([value.order.id], value.order)],
  outcomes: {
    success: (receipt) => E.SubmitSucceeded(receipt),
    failure: (error) => E.SubmitFailed(error),
  },
});
~~~

Transaction concurrency is exactly reject/cancel/allow/serialize; retry is a new commit from a new event. Results
never become canonical data implicitly; completion-side invalidates/clears options do not exist.

~~~ts
const submissionProgress = stream({
  id: "everclear.submission-progress",
  key: ({ submissionId }: ProgressInput) => [submissionId] as const,
  subscribe: ({ submissionId }: ProgressInput, { signal }) =>
    Effect.gen(function* () {
      const progressClient = yield* ProgressClient;
      return yield* progressClient.progress(submissionId, { signal });
    }),
  persist: true,
});
~~~

Equal key in one live stream declaration retains generation and original P. Changed key releases once and starts
another. Late emissions are fenced by slot/key/generation and coalesce to latest. Hydration rematerializes from live
P without emission replay; terminal streams do not restart and missing P fails closed.

~~~ts
actions: ({ event, memory }) => [
  O.submitIntent.commit(buildSubmissionInput(event, memory), { outcomes: submitOutcomes }),
];
~~~

invalidate and clear are actor-level finite actions over exact resource/K targets, nominal tags, and admitted
families. They validate/expand/deduplicate before mutation. Missing/zero-match is a no-op; invalidate retains data
and marks stale; clear fences generations, cancels final owners, removes data/overlays, and publishes atomically.
No wildcard, zero-argument, whole-runtime, or ordinary cache-clear escape hatch exists.

Passive reads:

~~~ts
const snapshot = actor.getSnapshot();
const orderKey = snapshot.O.orderById.key({ orderId });
const order = snapshot.O.orderById.getData(orderKey);
const orderState = snapshot.O.orderById.getState(orderKey);
const submitState = snapshot.O.submitIntent.getState([submissionId]);
~~~

Missing reads do not materialize, acquire, refresh, mutate, retain, collect, or advance revisions. Actor-effective
reads add only that actor's optimistic layers to canonical data; another actor's preview is never visible.

## 4. Modules, apps, refs, and actor handles

### module, app, and App.M

~~~ts
const CoreModule = module({ id: "core", machines: { router: routerMachine, auth: authMachine } });
const TodoApp = app({ id: "todo-app", persistenceVersion: "1", modules: [CoreModule, TodosModule] });
TodoApp.M.router;
~~~

module({ id, machines }) MUST preserve the exact keyed machine record. app({ id, persistenceVersion, modules })
MUST flatten ordered, unaliased modules into exact App.M. Duplicate property names, machine values, or tooling
ownership reject. Module IDs are tooling identity for CLI, trace, inspection, artifacts, and diffs only; they do not
enter runtime or persistence identity.

App.M and its immutable AppPlan are the closed machine, operation, requirement, and context admission universe.
Every listed machine contributes its graph and requirements. Definitions, machines, modules, apps, descriptors,
keys, fixtures, Story plans, and behavior values are inert. There are no dynamicMachines, automatic roots, runtime
family lookup, late setup/provide layers, or a second app identity.

### actorRef, leases, and Runtime methods

~~~ts
const ref = actorRef(editorMachine, "primary-editor", { persist: true });
const sharedLease = runtime.ensureActor(ref, { input, contextBindings });
const sharedActor = runtime.getActor(ref);
const localLease = runtime.createActor(editorMachine, { input, contextBindings });
await sharedLease.dispose();
~~~

actorRef(machine, id, { persist?: boolean }) returns an inert stable, machine-branded durable address. Its wire
form is actor: followed by length-prefixed UTF-8 machine-ID and authored stable-ID segments. It contains identity
only. ensureActor(ref, options?) restores or creates a shared actor and returns { actor, dispose }; concurrent
ensures join one construction. getActor(ref) is lookup-only and never creates, adopts, leases, or grants disposal.
createActor(machine, options?) creates a fresh local actor with an opaque ref and no stable ID.

Exact context bindings map each declared slot to one provider ref. Missing, ambiguous, foreign, mismatched,
disposed, tombstoned, cyclic, or opaque-provider cases fail before side effects. Dropping a lease does not dispose;
only the owner lease or whole-runtime disposal does. Stable disposal tombstones the ref for that Runtime incarnation.

An ordinary handle exposes only actor.ref, actor.send(event): void, getSnapshot(), and actor.snapshots. It has no
disposal, ownership, mailbox, receipt, raw Cause, or operation-registry authority. send synchronously admits the
exact typed event to the production mailbox and returns void; it does not return a Promise, Effect, Fiber, snapshot,
actor, acknowledgment, or subscription. A synchronous admission error is reported before work.

The public snapshot contains exact active-leaf state, readonly memory, monotonic safe-integer revision, observed
storeRevision, lifecycle, typed named-operation readers, and active issue summaries. Containers are immutable.
Lifecycle is exactly prepared | active | suspended | disposed:

| Lifecycle | Commands | Attachments |
| --- | --- | --- |
| prepared | Buffer at least 64; exact internal bound is implementation-defined | Become live on activation |
| active | Admit | Remain live |
| suspended | Reject without buffering | Release live attachments and retain continuity |
| disposed | Reject | Terminal snapshot/replay and completion |

Suspension preserves ref, handle, state, memory, inherited context, cursors, occurrence records, and absolute timer
deadlines. It releases registrations, subscriptions, activities, and timers; resume reattaches the same actor and
reconciles current providers. It does not rerun input, initialization, events, finite actions, or emissions. A cleanup
defect leaves the actor suspended and blocks resume until owner/runtime disposal. Disposal is async, idempotent,
terminal, reverse-dependency ordered, and blocked by active/suspended dependents with precise diagnostics.

## 5. Implementation and runtimeSetup

### Implementation

The namespace has exactly succeed, effect, and merge:

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

Implementation.succeed(service, value) is a complete synchronous non-failing provider. Implementation.effect
accepts provider acquisition and is acquired at most once per Runtime; its typed error is an implementation
readiness failure and its scope/finalizer are Runtime-owned. Implementation.merge composes providers without
changing service identity. The active contract does not publish complete generic signatures for effect or merge;
no additional method is permitted. Duplicate service identity rejects and order never selects a winner.

### runtimeSetup, RuntimeSetup, and Runtime

The active type contract specifies:

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

Accepted calls:

~~~ts
runtimeSetup({ app: PublicApp });
runtimeSetup({ app: ProjectApp, implementation: ProjectLive });
~~~

The active architecture contract also preserves this complete ownership path:

~~~ts
const setup = flow.runtimeSetup({
  app: TodoApp,
  implementation: TodoLive,
  persistence: persistence({ storage, scope: "user:42" }),
});

const runtime = setup.construct();
await runtime.ready();
const lease = runtime.ensureActor(TodoRefs.primary, {
  input: { userId: "user-42" },
  contextBindings,
});
lease.actor.send(Todo.E.RefreshRequested());
~~~

The first overload applies only when requirements are never; otherwise Implementation closes RequirementsOf<App>.
construct() is synchronous and performs no I/O. runtime.ready() is the sole public readiness Effect and has the
active shape Effect<void, ImplementationError | FlowPersistenceError>; it bootstraps/restores once and caches the
terminal result. Runtime bridge methods accept only Effects whose requirements are closed by installed Context.
runPromiseExit retains acquisition failure in Exit rather than rejecting for that reason. The active contract does
not publish one complete Runtime declaration; accepted methods are ready, ensureActor, getActor, createActor, the
Effect bridge, and async disposal.

Readiness validates providers, codecs, AppPlan, refs, input, bindings, requirements, tombstones, cycles, persisted
identity/versions/bounds, and context closure before activation or handle escape. It restores providers before
consumers, installs derived context silently, seals the graph, activates actors, and exposes handles last. One
production Runtime owns provider graph, scopes, fibers, activities, finalizers, readiness, cleanup, canonical
StoreState, and runtime-global evidence. Stories, React, SSR, requests, live hosts, and CLI use these same owners.
The implementation may choose its private phases, Effect runtime composition, cells, queues, and shell layout;
those choices are not compatibility surfaces provided construction remains inert, readiness starts at most once and
caches its terminal Exit, no usable handle escapes early, and failure/interruption/disposal release every acquired
owner exactly once without partial graph or evidence.

## 6. React route and host integration

Accepted host-first example:

~~~ts
const setup = runtimeSetup({
  app: TodoApp,
  implementation: TodoLive,
  persistence: persistence({
    storage: webStorage(window.localStorage),
    scope: "user:42",
  }),
});
const runtime = setup.construct();
await runtime.ready();

const shared = runtime.ensureActor(PrimarySessionRef, {
  input,
  contextBindings,
});
shared.actor.send(Session.E.SignOutRequested());
await shared.dispose();

const existing = runtime.getActor(PrimarySessionRef);
const local = runtime.createActor(editorMachine, { input, contextBindings });
local.actor.send(Editor.E.SaveRequested());
await local.dispose();
~~~

FlowProvider accepts only an already-created Runtime:

~~~tsx
<FlowProvider runtime={runtime}>
  <TodoAppView />
</FlowProvider>
~~~

It is the sole React context wrapper and observes cached runtime.ready(). It MUST NOT accept App, Implementation,
factory, actor ID, storage, codec, restore callback, or startup policy. React does not acquire, assemble, hydrate,
or dispose Flow state.

useActor(machine, options?) prepares one fresh local actor per component incarnation, including void-input machines.
It accepts exact fresh input and declared bindings, never a stable ID. Render preparation produces the final opaque
ref, pure initial snapshot, stable handle, bounded 64-command mailbox, and optional passive provisional context cut
without registration, ownership, subscription, work, or evidence. Commit attaches that actor, rechecks providers,
installs baseline, activates, and drains once. Cleanup suspends that actor; it does not terminally dispose or replace.

~~~tsx
const actor = useActor(newIntentMachine, { input: { draftId: "draft-1" } });
const model = useView(actor, ({ state, memory, context, O, can }) => ({
  state,
  amount: memory.amount,
  themeMode: context.themeMode,
  balance:
    memory.account === null || memory.assetId === null
      ? undefined
      : O.assetBalance.getData([memory.account, memory.assetId]),
  canSubmit: can(NewIntent.E.SubmitRequested()),
}));
~~~

useActorByRef(ref) is lookup-only: it synchronously resolves one registered shared actor in the current Provider
Runtime and returns a command-only handle. A changed ref resolves a new registered handle; it never ensures,
constructs, leases, disposes, subscribes, or accepts an opaque/mismatched/foreign/disposed ref.

useView(actor, selector) is the sole ordinary reactive read path. The selector receives atomic state, readonly
memory/context, lifecycle, issues, bound pure can(event), and passive O. O exposes only key, getData, and getState.
It tracks exact descriptor/K reads and reruns at one tear-free actor/StoreFanout publication boundary.
Scalar/non-record selection uses complete-value Object.is; named records use fixed-key fieldwise Object.is. There is
no comparator argument, registered view, broad subscription, acquisition, refresh, subscribe, commit, write,
invalidate, clear, or selector retry loop.

SSR preparation follows the same inert render rule and only attaches during commit. Request hosts construct and own
an isolated production Runtime per request. Host callbacks enter the production Runtime. React lifecycle evidence
is not a machine turn.

## 7. Persistence and artifact boundary

### Persistence provider, storage, codec, and declarations

Accepted provider example:

~~~ts
const setup = runtimeSetup({
  app: TodoApp,
  implementation: TodoLive,
  persistence: persistence({
    storage: webStorage(window.localStorage),
    scope: "user:42",
    codec: todoPersistenceCodec,
    filter: ({ kind, id }) => kind !== "stream" || id === "todo.updates",
  }),
});
~~~

The active public notation is:

    type PersistenceStorage = {
      read(): Effect.Effect<Uint8Array | undefined, PersistenceStorageError>;
      write(value: Uint8Array): Effect.Effect<void, PersistenceStorageError>;
      remove(): Effect.Effect<void, PersistenceStorageError>;
    };

    type Persistence = Readonly<{
      storage: PersistenceStorage;
      scope: string;
      codec: PersistenceCodec;
      filter?: (entry: PersistenceEntry) => boolean;
    }>;

    declare function webStorage(storage: Storage): PersistenceStorage;
    declare function indexedDbStorage(storage: IndexedDBStorage): PersistenceStorage;

    type PersistenceCodec = {
      encode(value: unknown, slot: PersistenceSlot): PersistenceValue;
      decode(value: PersistenceValue, slot: PersistenceSlot): unknown;
    };

    declare function persistence(options: {
      storage: PersistenceStorage;
      scope: string;
      codec?: PersistenceCodec;
      filter?: (entry: PersistenceEntry) => boolean;
    }): Persistence;

PersistenceStorage owns only typed read, write, and remove Effects. PersistenceCodec is synchronous and pure; it
does not access storage, create actors, run Effects, resume work, or decode a complete runtime/boot payload.
PersistenceValue, PersistenceSlot, and PersistenceEntry are public named types, but the active contract does not
provide complete nested declarations; their behavior remains bounded canonical JSON, actor/resource/transaction/
stream slot identity, and stable identity plus canonical K metadata.

Persistence is one inert optional provider. persist: true is required independently on stable actor refs and
resource/transaction/stream declarations; operation persistence never makes an actor durable implicitly. A filter
sees only kind, stable identity, owning stable actor, and canonical K and can exclude only declaration-owned entries.
It cannot select undeclared values or access executable P.

Without a provider there is no persistence I/O. Runtime readiness restores and validates once, installs canonical
store state, restores providers before consumers, completes bootstrap before handles/external work escape, and
observes committed publications through one DehydrateBarrier. Writes are serialized per scope; an older write cannot
replace a newer one. Disposal stops observation, finalizes the latest accepted write, and releases the provider.
Persistence MUST NOT be a second Runtime, AppPlan input, Implementation, cross-tab synchronizer, conflict resolver,
or same-scope writer protocol. Stories do not inherit browser/session storage by default.

Durable capture includes registered non-disposed stable actors marked persist: true, including suspended ones, plus
exact transitive stable context providers. It excludes opaque local refs, runtime-local actors, disposed actors,
tombstones, automatic/dynamic/child actors, queues, fibers, scopes, callbacks, services, cursors, transport,
buffered emissions, and pending commands. Hydration restores providers before consumers, installs derived context
silently, and never replays input, finite work, onContext events, or stream emissions. Running streams rematerialize
from live P in a new generation; pending transactions become interrupted or unknown/reconciliation-required by their
durable identity; K alone never authorizes execution.

### Artifacts and evidence

~~~ts
const attachment = attachInspectionSink(runtime, sink);
await attachment.drain();
const bytes = new Uint8Array(); // illustrative artifact input
const trace = importTraceArtifact(bytes);
const artifact = exportTraceArtifact(trace);
~~~

attachInspectionSink(runtime, sink) attaches one route-created sink to one Runtime and returns frozen { drain,
dispose }. It observes records admitted after attachment. createInspectionBufferSink({ capacity? }) creates an
explicit bounded sink; capacity defaults to 256 and zero retains no records while preserving truncation. Its exact
surface is snapshot(): { records: readonly InspectionRecord[]; truncatedBeforeSequence: number | null } and
clear(): void. Sink failure detaches only that sink and never delays acknowledgment, StoreFanout, or committed truth.

Inspection and trace use one truncation convention: `truncatedBeforeSequence` is null exactly when no accepted
record was omitted and otherwise is the greatest omitted runtime-global sequence. `trace proof` requires a null
marker. Internal attachment, retention, and drain algorithms are not compatibility surfaces.

importTraceArtifact(bytes) accepts one defensive Uint8Array WIRE-020B trace and returns the private validated model.
exportTraceArtifact(trace, options?) returns Uint8Array. The active contract specifies no complete signatures for
compressTraceArtifact or decompressTraceArtifact. Artifact import/export MUST validate the bounded v2 model and
MUST NOT expose private TurnRecords, ownership, raw Cause, persistence, boot, replay, or a CLI-only decoder.

Public persistence and artifact bytes pass through strict UTF-8, one supported compression member, decompressed
byte limits, JSON parsing, and one package-private Effect Schema decoder into fresh package-owned canonical data.
Malformed, unsupported, cyclic, or over-bound public input fails before runtime mutation with stable diagnostic
category and available path/bound data. Behavior of proxies, getters, custom prototypes, descriptors, symbol
properties, sparse arrays, or concurrent mutation supplied directly to private decoder functions is unspecified.
Serialized evidence contains ordered stable Flow diagnostics rather than an Effect Cause tree projection; full
Cause remains available only at the two documented in-process error boundaries.

PERSISTENCE_AND_ARTIFACTS.md WIRE-020A/B/C is the sole artifact schema authority. Raw WIRE-020B is canonical
stable-key UTF-8 JSON, bounded, byte-stable v2 evidence with exactly one trailing newline. WIRE-020C is export-only
and importTraceArtifact rejects it as WrongArtifactKind.

Accepted redaction API:

~~~ts
type ArtifactExportOptions = Readonly<{
  redactions?: readonly Readonly<{
    path: ArtifactValuePath;
    replacement: "[REDACTED]";
  }>[];
}>;

type ArtifactCanonicalPath = readonly (string | number)[];
type ArtifactValuePath =
  | readonly ["records", number, "snapshot", "memory" | "context", ...ArtifactCanonicalPath]
  | readonly ["records", number, "facts", number, "data" | "value" | "error" | "defect" | "latest", ...ArtifactCanonicalPath]
  | readonly ["checkpoints", number, "actors", number, "snapshot", "memory" | "context", ...ArtifactCanonicalPath]
  | readonly ["checkpoints", number, "snapshot", "memory" | "context", ...ArtifactCanonicalPath];

declare function exportTraceArtifact(
  trace: ReturnType<typeof importTraceArtifact>,
  options?: ArtifactExportOptions,
): Uint8Array;
~~~

Omitted or empty redactions return byte-identical raw WIRE-020B. A non-empty policy emits WIRE-020C, replacing
application-owned values at exact finite paths with "[REDACTED]". It MUST NOT target identity, fingerprint, version,
discriminants, ordering, sequences, truncation, diagnostic codes, or cleanup/status. Missing, duplicate,
ancestor/descendant, wildcard, or structural paths reject before projection. Share output is never raw trace input,
persistence, boot, replay, evidence authority, or CLI input.

All boot/artifact codecs use host-neutral TextEncoder, reject lone surrogates, and apply bounds of depth 32, 10,000
visited nodes, array length 4,096, one string/key 262,144 UTF-8 bytes, and 2,097,152 decompressed/canonical bytes.
Shared package code MUST NOT use Node-only Buffer encoding.

## 8. Testing route: Stories, fixtures, behavior gateways, and models

The testing route is a production-runtime test authoring surface. It MUST expose exactly `story`, `fixture`,
`behavior`, `model`, and `FlowStoryExecutionError`. It MUST NOT expose a second Runtime, actor engine, mailbox,
scheduler, store, operation kernel, persistence model, assertion framework, replay engine, or mutable test harness.

### Public testing value reference

| Public value | Purpose and accepted input/output | Behavioral constraints |
| --- | --- | --- |
| `story` | Non-callable namespace with exactly `app(runtimeSetup, options?)`, `machine(machine, options?)`, and `actor(machine, options?)`. The first two return immutable Story plans; `actor` returns an inert Story-local recipe. Complete generic signatures are not published. | Builder calls are synchronous and inert. `run()` is the sole execution boundary. |
| `fixture` | `fixture({ id, implementation, seeds? })` returns an immutable fixture definition supplying complete services and optional preloaded Runtime-owned resource state. A complete generic signature is not published. | Fixtures are fresh per Runtime/run. Seeds do not satisfy service requirements or bypass production kernels. Duplicate providers reject rather than use order. |
| `behavior` | `behavior({ app, stories })` returns an inert gateway over one explicit App and one non-empty readonly record of Story IDs to compatible Story plans. | Validation/registration is synchronous. It creates no Implementation, Runtime, actor, sink, Story execution, or cleanup. The CLI is its only public consumer. |
| `model` | `model(baseStory, { stateKey })` returns a pure structural model with only `getShortestPaths(options)` and `getSimplePaths(options)`. `baseStory` MUST be a fresh command-empty machine Story; `stateKey` returns `CanonicalKeyInput`. | Traversal executes no Effects, services, fixtures, operations, runtime mutation, or synthesized async outcomes. |
| `FlowStoryExecutionError` | Rejection boundary for Story execution/cancellation/cleanup failure. It carries the complete public Effect Cause plus deeply frozen checkpoints, optional end evidence, failure boundary, cleanup diagnostics, cancellation facts, and accepted/drained evidence facts. | The active contracts do not publish a complete class signature or constructor example. This proposal intentionally leaves both unspecified. |

### Constructing app, machine, and actor Stories

The accepted construction example is:

~~~ts
const storyRun = story
  .app(runtimeSetup, {
    fixtures: [documentsFixture],
    maxTurns: 100,
    tags: ["smoke"],
  })
  .send(editor, Editor.E.EditRequested("Updated"))
  .process()
  .checkpoint("saved")
  .run();

const focused = story.machine(editorMachine, {
  input: { documentId: "document-1" },
  context: { sessionState: Session.S.ACTIVE, themeMode: "dark" },
  fixtures: [editorFixture],
});

const local = story.actor(editorMachine, {
  input: { documentId: "document-1" },
  contextBindings: { sessionState: sessionRecipe },
});
~~~

`story.app` accepts a typed RuntimeSetup rather than a bare App or already-created Runtime. Its options may contain
fixtures, `maxTurns`, title, description, and tags. `story.machine` owns one implicit fresh actor and may additionally
accept exact required input and exact already-selected context. `story.actor` contains only an exact machine, input,
and context bindings; recipe object identity identifies one actor per run. Reusing a recipe reuses that actor, while
two distinct recipes create independent actors.

Void-input machines MUST reject authored input. Focused Stories MUST reject boot payloads, refs, extra actors, raw
memory, initial-state overrides, and snapshot overrides. App Story targets MUST be an exact app-owned ActorRef or
Story actor recipe; a Machine value is never a target. Missing, incompatible, foreign, disposed, cyclic, or
unadmitted refs/recipes/bindings MUST reject before partial materialization. Story-local owner leases MUST be cleaned
up in reverse dependency order; app-owned shared actors remain Runtime-owned.

The three option shapes are closed. Their full exported generic declarations are not specified; TYPE-014 uses
`InputOptions`, `SelectedContextOptions`, `ContextBindingOptions`, `StoryContextBindingsOf`, `FixtureOptions`,
`AppStoryOptions`, `MachineStoryOptions`, and `ActorRecipeOptions` only as specification notation. This proposal MUST
NOT promote those helper names to public exports.

### Commands, time, execution, and evidence

The command surface is exactly:

~~~ts
// Both Story kinds
process();
advance(duration);
advanceTo(epochMilliseconds);
advanceToNextTimer();
checkpoint(name);
run({ signal? });

// App Story
send(target, event);

// Machine Story
send(event);
setContext(context);
~~~

`send` enters the exact production mailbox and waits only for that command's package-private acknowledgment.
`process()` drains ready mailboxes, context turns, reconciliation, same-time deadlines, scheduler work, and finite
fibers until no work can progress without another command or future time. It MUST NOT advance time or invent an
external result. `advance`, `advanceTo`, and `advanceToNextTimer` move the injected TestClock and MUST NOT process
implicitly. `checkpoint` captures immediately without processing, time movement, creation, disposal, or restoration.
`run({ signal? })` constructs one fresh production Runtime, executes the immutable plan, and owns cancellation and
non-abortable finalization. `maxTurns` defaults to 100; exhaustion is a failure.

Story plans are immutable persistent values. Every builder command returns a new plan and leaves the previous plan
unchanged, so one common prefix can be retained and extended into multiple derived plans. Each derived plan run
creates a fresh isolated production Runtime and replays the shared prefix independently. This is static plan
branching, not a live Runtime fork; derived runs share no live state, handles, or Runtime.

Checkpoint-name accumulation uses the following specification-only notation. `CheckpointEvidence` and `EndEvidence`
stand for the existing App- or Machine-Story evidence shapes; `StoryPlan`, `NewCheckpointName`, `StoryRun`,
`CheckpointEvidence`, and `EndEvidence` are helper aliases and MUST NOT become public exports:

~~~ts
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
~~~

Every other builder command preserves `Names` while returning a new plan value. A literal checkpoint name or known
string union extends `Names`; a widened `string` is rejected and MUST NOT erase already known names.

~~~ts
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
~~~

`checkpoint(name)` captures a frozen read cut as evidence only. It is not a resumable Runtime snapshot and does not
expose `fork()`, `restore()`, or `fromCheckpoint()`. Literal checkpoint names accumulate in the inferred plan type,
duplicate literals reject while building, and widened `string` names cannot erase the known-name map; a literal or
known string union is required. `run()` exposes `checkpoints` as a readonly mapped type with exactly those accumulated
names while preserving the existing evidence shape, `run.end`, and failure behavior. Package-private checkpoint
lookup for JavaScript, CLI, or other untrusted input MUST test own-key membership and reject an unknown name with the
existing `FlowUsageError` semantics. There is no public dynamic-string checkpoint getter or checkpoint-specific error
type.

The accepted focused-context example is:

~~~ts
const signedOutStory = story
  .machine(editorMachine, {
    input: { documentId: "document-1" },
    context: {
      sessionState: Session.S.ACTIVE,
      themeMode: "dark",
    },
    fixtures: [editorFixture],
    maxTurns: 100,
  })
  .send(Editor.E.EditRequested())
  .setContext({
    sessionState: Session.S.SIGNED_OUT,
    themeMode: "dark",
  })
  .process()
  .checkpoint("signed-out");
~~~

Checkpoint and end evidence are deeply frozen atomic production read cuts. App evidence exposes
`actor(storyActor | actorRef)`; machine evidence exposes the single actor snapshot directly. Both expose
`runtime.now` and `runtime.pendingWork`. The exact result vocabulary is `run.end`, never `final`, and end evidence
does not imply actor completion:

~~~ts
appRun.checkpoints["signed-out"].actor(editor).snapshot;
appRun.checkpoints["signed-out"].actor(PrimarySessionRef).snapshot;
appRun.checkpoints["signed-out"].runtime.now;
appRun.checkpoints["signed-out"].runtime.pendingWork;

appRun.end.actor(editor).snapshot;
appRun.end.actor(PrimarySessionRef).snapshot;

machineRun.checkpoints["saved"].snapshot;
machineRun.checkpoints["saved"].runtime.now;
machineRun.end.snapshot;
machineRun.end.runtime.pendingWork;
~~~

A failed run MUST retain completed checkpoints and truthful failure, cancellation, evidence-sequence, and ordered
cleanup diagnostics. Cleanup failure MUST NOT return success. Failure before end capture MUST NOT fabricate
`run.end`. Stories MUST use complete Implementations and production operation kernels; `perform`, `deliver`,
`receive`, `simulate`, result injection, pending-occurrence interception, and replay of restored work remain rejected.

### Behavior gateway

~~~ts
const gateway = behavior({
  app: IncidentApp,
  stories: { smoke: incidentStory, "machine-model": incidentMachineStory },
});
~~~

The record keys are external Story IDs. The gateway MUST reject empty or duplicate keys, missing/mixed app identity,
ActorRecipe values, incompatible machine Stories, and foreign machines. Direct Story `.run()` and CLI `story run`
MUST share the production executor, decoded evidence model, operation kernels, and cleanup path. The gateway itself
MUST NOT run anything.

### Structural models

~~~ts
const baseStory = story.machine(incidentMachine, { fixtures: [incidentApiFixture] });
const incidentModel = model(baseStory, {
  stateKey: ({ value, memory }) => [value.id, memory],
});

const result = incidentModel.getShortestPaths({
  events: [NewIntent.E.IntentOpened("incident-1"), NewIntent.E.SessionEnded()],
  maxDepth: 20,
  limit: 100,
});

await result.paths[0]!.story.run();
~~~

Traversal options are exactly `{ events, maxDepth?, limit? }`. `maxDepth` defaults to 20 and MUST be a non-negative
safe integer; `limit` defaults to 100 and MUST be a positive safe integer. `getShortestPaths` performs breadth-first
search in candidate order and retains the first path to each unseen canonical state key, including the zero-step
path. `getSimplePaths` performs depth-first search in candidate order and does not repeat a state key in one path.
Both return frozen `{ paths, truncated, explored }` and stop at the declared bounds. Canonical-key defects fail
synchronously before a partial result. Each returned path carries `path.story`; running it is the production live
proof. The model MUST NOT expose replay/provide/clock helpers, infer candidate events, execute async kernels, or
create a second evidence hierarchy.

## 9. Inspect route

The inspect route is an immutable projection and artifact boundary over compiled definitions, snapshots, committed
TurnRecords, LifecycleRecords, and the private validated v2 evidence model. It MUST NOT own a second mutable history,
runtime, actor, scheduler, store, planner, persistence system, or CLI-only decoder.

### Public inspect function reference

The active contracts list every name below but publish complete standalone signatures only where shown in this
section. For every row marked unspecified, this proposal intentionally leaves the exact parameter types, return type,
overloads, failure type, and code example unspecified rather than inferring them from the name.

| Function | Contracted purpose | Signature/example status |
| --- | --- | --- |
| `graphOf` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `inspectTransition` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `inspectMicrosteps` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `inspectActivities` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `whyNoTransition` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `formatNoTransitionSummary` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `analyzeTrace` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `summarizeTrace` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `diffTrace` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `formatTrace` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `formatInspectionEvent` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `formatInspectionTimeline` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `formatRehydrationSummary` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `formatResourceFreshnessReport` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `formatTransactionOverlapSummary` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `buildBehaviorContract` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `sliceBehaviorContract` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `diffBehaviorContracts` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `renderBehaviorContract` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `renderBehaviorCoverage` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `renderBehaviorDiff` | Individual purpose intentionally unspecified: `PUBLIC_API.md` names this export but does not define a standalone contract. | Input/output/signature/overloads/failure/example intentionally unspecified. |
| `attachInspectionSink` | Attaches one route-created sink to one Runtime and returns frozen `{ drain, dispose }`. It observes records admitted after attachment. | Accepted example below; complete generic signature unspecified. |
| `createInspectionBufferSink` | Creates an explicit bounded sink. `capacity` defaults to 256 and MUST be a non-negative integer; zero retains no records while preserving truncation. | `createInspectionBufferSink({ capacity? })`; returns a sink exposing `snapshot()` and `clear()` as described below. |
| `importTraceArtifact` | Defensively copies, decodes, bounds-checks, and validates one raw WIRE-020B trace artifact. | `importTraceArtifact(bytes)` accepts `Uint8Array`; exact private decoded return type and complete signature unspecified. |
| `exportTraceArtifact` | Encodes a validated imported trace as raw WIRE-020B bytes or, with a non-empty valid redaction policy, export-only WIRE-020C bytes. | Exact redaction overload is specified in section 7; returns `Uint8Array`. |
| `compressTraceArtifact` | Public artifact compression boundary. | Active contracts publish no standalone purpose beyond artifact handling and no signature/input/output/example; intentionally unspecified. |
| `decompressTraceArtifact` | Public artifact decompression boundary. | Active contracts publish no standalone purpose beyond artifact handling and no signature/input/output/example; intentionally unspecified. |

API-016 separately documents route-wide constraints: pure graph/transition functions consume inert definitions or
snapshots; live inspection consumes committed private `TurnRecord` and immutable `LifecycleRecord`; projections
cannot fabricate traces from arbitrary snapshots; planner output cannot claim actual starts, releases, generations,
pending outcomes, or finalizers; sinks are bounded/isolated; and artifact import/export cannot expose private v2
models, runtime ownership, or raw Cause. Those route-wide constraints do not assign individual semantics to the
named exports above.

The accepted inspection/artifact example remains:

~~~ts
const attachment = attachInspectionSink(runtime, sink);
await attachment.drain();
const bytes = new Uint8Array(); // illustrative artifact input
const trace = importTraceArtifact(bytes);
const artifact = exportTraceArtifact(trace);
~~~

`createInspectionBufferSink({ capacity? })` exposes exactly
`snapshot(): { records: readonly InspectionRecord[]; truncatedBeforeSequence: number | null }` and `clear(): void`.
Snapshot results and records MUST be frozen. Hosts install history explicitly; persistence MUST NOT retain the buffer,
and actors MUST NOT expose mutable retention controls. Slow sinks MUST NOT delay acknowledgment or StoreFanout.
A failed sink MUST detach only itself; other sinks and committed runtime truth continue. Planner projections MAY show
selection, microsteps, memory patches, and desired plans, but MUST NOT report actual starts, releases, generations,
pending outcomes, or finalizers. Import/export MUST NOT expose private TurnRecords, Runtime ownership, raw Cause, or
the private v2 decoded model as public types.

## 10. Command-line interface

The installed `flow-state` binary is a process host over the same behavior gateway, Story executor, artifact codecs,
inspection projections, and production Runtime. It owns grammar, gateway selection, formatting, files, signals, and
exit status. It MUST NOT own machine semantics, actors, scheduling, stores, transition evaluation, runtime history,
artifact schema, or a competing Story/runtime/result model.

### Exact grammar

~~~text
flow-state behavior build --output <path> [--overwrite] [--project-root <dir>] --gateway <path> [--format text|json]
flow-state behavior render <artifact|-> [--section contract|coverage] [--module <id>] [--format text|json]
flow-state behavior diff <left> <right> [--module <id>] [--format text|json]
flow-state behavior check <expected|-> [--project-root <dir>] --gateway <path> [--format text|json]

flow-state story list [--project-root <dir>] --gateway <path> [--machine <id>] [--tag <tag>] [--format text|json]
flow-state story describe <story-id> [--project-root <dir>] --gateway <path> [--format text|json]
flow-state story run <story-id> [--project-root <dir>] --gateway <path> [--trace-output <path>] [--overwrite] [--format text|json]

flow-state trace summarize <artifact|-> [--format text|json]
flow-state trace proof <artifact|-> --selector <selector> [--format text|json]
flow-state trace diff <left> <right> [--section <section>] [--format text|json]
~~~

There are exactly ten leaves. `behavior check` is the only new vNext leaf. Each leaf has one purpose:

| Leaf | Purpose and result boundary |
| --- | --- |
| `behavior build` | Load the trusted typed gateway, compile its supplied App behavior, and atomically publish the canonical behavior artifact to required `--output`. |
| `behavior render` | Render the contract or coverage section from an artifact; defaults to `contract`. |
| `behavior diff` | Compare two behavior artifacts, optionally restricted to one module. |
| `behavior check` | Build live behavior in memory and compare its canonical artifact with the expected artifact through the same diff projection as `behavior diff`. |
| `story list` | Discover registered external Story IDs, optionally filtered by machine or tag, without executing a Runtime or Story. |
| `story describe` | Describe one registered Story without executing it. |
| `story run` | Execute one registered Story through the shared production executor; optionally atomically publish its trace artifact. |
| `trace summarize` | Summarize retained trace evidence; incomplete evidence remains explicitly marked and may still exit successfully. |
| `trace proof` | Evaluate one data-only selector against complete trace evidence; it MUST NOT claim proof from truncated evidence. |
| `trace diff` | Compare selected ordered trace sections; equal requires complete evidence on both sides. |

The accepted gateway example is:

~~~ts
const BehaviorGateway = behavior({
  app: IncidentApp,
  stories: {
    smoke: incidentAppStory,
    "machine-model": incidentMachineStory,
  },
});
~~~

`--project-root` defaults to the canonicalized current working directory. `--gateway` is required for every
gateway-loading command and resolves only below that root; no ancestor search or implicit filename is permitted.
`--format` defaults to `text`; `behavior render --section` defaults to `contract`; `trace diff --section` defaults to
the complete ordered section set. Each option may occur once. `--overwrite` is valid only with `behavior build
--output` or `story run --trace-output`.

Selectors are exactly `issues`, `timeline`, `actor:<id>`, or `correlation:<id>`. Actor and correlation selectors
split at the first colon and preserve the remainder. Parsing selectors MUST NOT load a gateway or evaluate code.
Unknown options, missing values, repeated/conflicting operands, invalid selectors, executable selector expressions,
legacy Story/scenario flags, and overwrite without an output target are usage failures.

Gateway loading is trusted local TypeScript, not a sandbox. The project root MUST contain its exact `package.json`;
the gateway MUST be an existing regular `.ts` or `.mts` file remaining under the root after symlink resolution.
Loading uses normal host or bundler module resolution. Flow/Effect package identity mismatch, structural gateway
lookalikes, and mixed/foreign app content MUST reject before registry access or Story execution. Temporary bundle
files MUST be outside the project and removed after success, failure, or interruption. Artifact-only commands MUST
NOT load application code.

### Artifact publication, output, signals, and exit status

Artifact inputs accept canonical stable-key UTF-8 JSON or exactly one gzip member through the bounded WIRE-020B
path. `-` means stdin; at most one operand may be `-`. Named operands MUST be regular files. WIRE-020C share output,
legacy formats, concatenated gzip, trailing bytes, unsupported compression, and bound/schema/identity failures MUST
reject. Files are uncompressed canonical JSON with exactly one trailing newline.

Output publication MUST preflight destination and parent before Runtime/fixture acquisition, encode and bound-check
before creating a sibling temporary file, use mode 0600, flush and close, then commit atomically. Without overwrite,
commit uses same-directory hard-link-to-absent-destination; with overwrite it uses same-directory atomic rename and
replaces a symlink entry rather than its referent. It MUST NOT truncate in place. Pre-commit failure or first-signal
interruption preserves the previous/absent destination; post-commit artifacts are not rolled back.

Each leaf creates one immutable private `flow-state/cli-result.v2` result. Text and JSON derive from that same result;
the exact `CliCommand` union and result schema are private and MUST NOT become public `FlowCli*` types. Success or
comparison writes one newline-terminated document to stdout and nothing to stderr. Failure writes one document to
stderr and nothing to stdout. JSON is the stable machine-readable projection. Text MUST be deterministic within one
invocation, readable, actionable, newline-terminated, and free of ANSI when non-interactive; its exact prose,
whitespace, and human-field order may evolve. Each stream is one complete buffer attempted with one write; EPIPE
exits 2 without recursive output.

Exit status is exact:

| Status | Meaning |
| --- | --- |
| `0` | Completed non-comparison, incomplete `trace summarize`, or complete equal comparison. |
| `1` | Different behavior/trace comparison or incomplete `trace diff`. |
| `2` | Usage, gateway, artifact, Story execution, cleanup, local-I/O, EPIPE, or internal failure. |
| `130` | First SIGINT after cleanup and requested partial-trace handling. |
| `143` | First SIGTERM after cleanup and requested partial-trace handling. |

The first SIGINT/SIGTERM MUST interrupt current work, close later Story admission, retain failure-boundary evidence,
await non-abortable cleanup, and attempt any requested partial trace. Cleanup or trace-write failures are ordered
secondary diagnostics and MUST NOT change 130/143. A second signal may terminate immediately. No cleanup guarantee
exists for SIGKILL or host loss.

## 11. Acceptance checklist and proof ownership

This is a proposal checklist, not a proof receipt. Every item remains unchecked until its named executable proof and
the required focused/broad gates have run against an implementation. Source review, typechecking, generated output,
or `git diff --check` alone MUST NOT mark an item complete.

Each normative invariant has one executable production-owner proof. Packed consumers, examples, browser tests,
Stories, and installed-CLI tests prove reachability and integration and do not repeat that owner's complete negative,
race, codec, or boundary matrix unless the integration adds a distinct failure mode. Final verification aggregates
the required receipts; it does not create a second semantic proof owner.

### Types, compilation, and runtime ownership

- [ ] `PROOF-001`: exact public typing and inference for definitions, machines, P/K/A/E/R, App.M, refs, selectors,
  Stories, models, persistence, errors, and requirements, including exact checkpoint-name accumulation and readonly
  run-key inference. Positive fixtures prove exact accumulation and readonly keys; negative fixtures prove duplicate
  literal names, widened-string names, and unknown literal indexing are rejected.
- [ ] `PROOF-002`: inert complete AppPlan compilation, closed admission, graph/identity validation, and rejection
  before activation or side effects.
- [ ] `PROOF-003`: production mailbox, reentrancy, macrostep planning, atomic publication, acknowledgment, context,
  StoreFanout, and projection-only ordering.
- [ ] `PROOF-004`: one production Runtime, actor/lease ownership, lifecycle, cleanup, persistence write ordering, and
  host/Story parity.
- [ ] `PROOF-015`: individual disposal only through explicit owner leases, dependent blocking, tombstones, and child
  capability absence with `PROOF-017`.

### Operation kernels and Stories

- [ ] `PROOF-005`: exact descriptor-plus-K identity, bounded canonical bytes, complete executable P retention,
  generation fencing, hydration ordering, preview/CAS behavior, and trusted seed/write fencing.
- [ ] `PROOF-006`: one Runtime-scoped canonical StoreState, passive reads, continuing ownership, cancellation,
  invalidation/clear, StoreFanout, and no hidden work from reads.
- [ ] `PROOF-007`: event-owned finite action batches, transaction policies, stream settlement/projection, writes,
  occurrence settlement, interruption, and stable serialized diagnostics after in-process Cause classification.
- [ ] `PROOF-008`: fresh Story Implementations/fixtures/seeds, inert recipes, provider graphs, leases, reverse cleanup,
  and app/focused execution through production owners.
- [ ] `PROOF-009`: exact Story commands, `process`, TestClock movement, maxTurns, timers, cancellation, finalization,
  immutable persistent prefix derivation, independent prefix replay, and fresh production-Runtime isolation across
  derived runs. The original common-prefix plan remains unchanged; this proves static plan branching, not a live
  Runtime fork.

### Evidence, React, persistence, and CLI

- [ ] `PROOF-010`: atomic deeply frozen checkpoints and `run.end`, exact closure, failure boundaries, cleanup truth,
  cancellation, and direct Story/CLI evidence parity. Evidence-only API absence checks reject `fork`, `restore`,
  `fromCheckpoint`, and a public dynamic-string getter; defensive package-private lookup proves known own-key access
  and unknown or inherited names reject with existing `FlowUsageError` semantics.
- [ ] `PROOF-011`: pure model order/bounds/canonical keys and live-host/Story parity without a second interpreter.
- [ ] `PROOF-012`: exact ActorRefs, React render/commit preparation, lookup-only hooks, passive tracked `useView`, SSR,
  request isolation, suspension/resume, and ownership absence.
- [ ] `PROOF-013`: lifecycle snapshots and inspection event/sink publication, sequence, drain, failure isolation, and
  parity without a second history.
- [ ] `PROOF-014`: bootstrap, persistence, hydration, codecs/storage, WIRE-020A/B/C round-trip and rejection, server,
  inspection, Story evidence, CLI grammar/output/files/signals/exits, and direct/CLI parity.

### Final proving applications and cutover

- [ ] `PROOF-016`: named proving applications and bounded-feed fixtures exercise accepted production owners; these
  fixtures remain evidence rather than APIs.
- [ ] `PROOF-017`: complete deletion/retention disposition, exact package exports/declarations, packed consumers,
  examples/docs, dependency hygiene, generated output, and absence of deleted compatibility surfaces.

Local proof IDs map to the central proof families as follows:

| Local proof | Central owner |
| --- | --- |
| `API-P01` | `PROOF-001`, `PROOF-017` |
| `API-P02` | `PROOF-001`, `PROOF-002` |
| `API-P03` | `PROOF-003`, `PROOF-005`–`PROOF-008`, `PROOF-011`, `PROOF-014` |
| `API-P04` | `PROOF-014` |
| `TYPE-P01`–`TYPE-P04` | `PROOF-001`; `TYPE-P02` also maps to `PROOF-017` |
| `HOST-P01`–`HOST-P05` | `PROOF-003`, `PROOF-004`, `PROOF-005`, `PROOF-010`, `PROOF-012`, `PROOF-014` as assigned by `PROOF_MATRIX.md` |
| `CLI-P01` | `PROOF-014` |
| `CLI-P02` | `PROOF-014`, `PROOF-017` |
| `SNAP-P01` | `PROOF-001`, `PROOF-005`, `PROOF-006` |
| `CUT-P01`–`CUT-P06` | `PROOF-001`, `PROOF-012`, `PROOF-014`, `PROOF-017` as assigned by `PROOF_MATRIX.md` |

No checklist item in this proposal asserts that its proof currently exists, passes, is fresh, or closes a Bead.

## 12. Provenance and authority map

This map records where the proposal's language and examples came from. It does not transfer formal acceptance to
this file. If this proposal conflicts with any active contract clause, the active contract wins until a formal
acceptance process explicitly replaces it.

| Proposal section | Active source authority | Preserved examples or constraints |
| --- | --- | --- |
| 1. Routes and root API | `PUBLIC_API.md` API-001, API-002, API-002A, AMEND-API-001 | Exact route/name sets, quickstart, public type boundary, usage-error shape. |
| 2. Types, definitions, machines | `PUBLIC_API.md` API-003/API-004; `TYPE_SYSTEM.md` TYPE-001–TYPE-004 | NewIntent definition/machine, exact Todo token inference, Editor input/memory inference, causal one-way inference. |
| 3. Operations | `PUBLIC_API.md` API-005–API-009; `TYPE_SYSTEM.md` TYPE-005–TYPE-008; `SEMANTICS.md` SEM-006A, SEM-008–SEM-021, SEM-029/SEM-030 | Order resource, canonical K grammar, family/state shapes, transaction, stream, action, and passive-read examples. |
| 4. Modules, apps, refs, handles | `PUBLIC_API.md` API-010/API-011; `ARCHITECTURE.md` ARCH-001–ARCH-004; `REACT_AND_HOSTS.md` HOST-001–HOST-004 | CoreModule/TodoApp, ActorRef/lease example, exact identity/admission/lifecycle ownership. |
| 5. Implementation and runtime | `TYPE_SYSTEM.md` TYPE-009A–TYPE-011; `ARCHITECTURE.md` ARCH-005, ARCH-007–ARCH-012; `PUBLIC_API.md` API-012 | Implementation providers, runtimeSetup overloads/calls, `runPromise`/`runPromiseExit` behavior, complete architecture ownership path, readiness and disposal boundaries. |
| 6. React and hosts | `REACT_AND_HOSTS.md` host-first examples and HOST-001–HOST-017; `PUBLIC_API.md` API-012; `TYPE_SYSTEM.md` TYPE-013 | Existing Runtime provider, useActor/useActorByRef/useView, passive selector, SSR/request, suspension/resume. |
| 7. Persistence and artifacts | `PERSISTENCE_AND_ARTIFACTS.md` WIRE-000–WIRE-024, especially WIRE-020A/B/C; `PUBLIC_API.md` API-016 and AMEND-API-003 | Provider/storage/codec forms, capture/hydration, inspection artifact example, redaction type example, canonical/bounded wire laws. |
| 8. Testing and Stories | `PUBLIC_API.md` API-013–API-015; `TYPE_SYSTEM.md` TYPE-014–TYPE-017 and TYPE-P02; `TESTING.md` REV-TEST-001–REV-TEST-010 and TEST-014/TEST-015; `PROOF_MATRIX.md` PROOF-001, PROOF-009, PROOF-010 | Story/recipe, focused-context, immutable common-prefix/three-branch plans, specification-only checkpoint-name accumulation, frozen evidence-only checkpoints, package-private defensive lookup, behavior gateway, fixture, and model examples. |
| 9. Inspect | `PUBLIC_API.md` API-001/API-016 and AMEND-API-003; `TESTING.md` explicit buffer-sink boundary; `PERSISTENCE_AND_ARTIFACTS.md` WIRE-014–WIRE-020C | Exact exported names, sink/artifact example, bounded retention, failure isolation, defensive/private artifact boundary. |
| 10. CLI | `PUBLIC_API.md` API-017; `CLI.md` CLI-001–CLI-012, CLI-P01, CLI-P02; `PERSISTENCE_AND_ARTIFACTS.md` WIRE-020A/B/C | Exact ten-leaf grammar, behavior gateway example, selectors/defaults, gateway containment, atomic files, output, signal, exit, truncation. |
| 11. Acceptance | `PROOF_MATRIX.md` PROOF-001–PROOF-017 and local proof crosswalk, especially PROOF-001, PROOF-009, and PROOF-010 | Unchecked typing, immutable-prefix isolation, and evidence-only checkpoint proof ownership; no completion claim. |

The active contract pack remains the sole normative source for exact nested artifact schemas, definitions not copied
here, conflict resolution, deletion inventory, and proof procedures. `revision-spec/README.md` remains the authority
index; accepted revisions override only direct conflicts, provenance files preserve lineage rather than semantics,
and `UNRESOLVED_BEHAVIOR.md` remains a closure register rather than an answer source. Any public name whose complete
signature or example is absent above is intentionally unspecified by this proposal.
