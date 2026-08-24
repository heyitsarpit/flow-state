
# Public API contract

Status: normative vNext contract

This file owns supported package routes, public values, authoring grammar, operation families, actor
and host surface, Stories, inspection, CLI boundary, and public proof obligations. Inference and
variance live in [TYPE_SYSTEM.md](./TYPE_SYSTEM.md); terminology and identity live in
[GLOSSARY_AND_IDENTITY.md](./GLOSSARY_AND_IDENTITY.md). Host detail, deletion detail, and exact
artifact/CLI laws remain in their named contracts.

## API-001 — Package routes

~~~ts
import * as flow from "flow-state";
import * as flowTest from "flow-state/testing";
import * as inspect from "flow-state/inspect";
~~~

### Surface

- Root runtime values: `actorRef`, `app`, `can`, `definition`, `FlowDisposeError`,
  `FlowPersistenceError`, `FlowUsageError`, `Implementation`, `indexedDbStorage`, `machine`, `module`, `persistence`,
  `resource`, `runtimeSetup`, `stream`, `transaction`, `webStorage`.
- `flow-state/react`: `FlowProvider`, `useActor`, `useActorByRef`, `useView`.
- `flow-state/testing`: `behavior`, `fixture`, `model`, `story`, `FlowStoryExecutionError`.
- `flow-state/inspect`: `analyzeTrace`, `attachInspectionSink`, `buildBehaviorContract`,
  `compressTraceArtifact`, `createInspectionBufferSink`, `decompressTraceArtifact`,
  `diffBehaviorContracts`, `diffTrace`, `exportTraceArtifact`, `formatInspectionEvent`,
  `formatInspectionTimeline`, `formatNoTransitionSummary`, `formatRehydrationSummary`,
  `formatResourceFreshnessReport`, `formatTrace`, `formatTransactionOverlapSummary`, `graphOf`,
  `importTraceArtifact`, `inspectActivities`, `inspectMicrosteps`, `inspectTransition`,
  `renderBehaviorContract`, `renderBehaviorCoverage`, `renderBehaviorDiff`, `sliceBehaviorContract`,
  `summarizeTrace`, `whyNoTransition`.

### Rule

- Routes are isolated named-export surfaces. Consumers alias locally.
- Root `Implementation` is the runtime namespace for exactly `succeed`, `effect`, and `merge`; the same-named
  public type remains owned by API-002 and TYPE-009B. It is not an umbrella package namespace or alternate route.

### Accepts

- The exact routes and names above.

### Rejects

- Package-owned `flow`, `test`, `inspect`, or `hooks` namespace objects; root builders from non-root
  routes; private deep imports.

### Observable guarantee

- Non-root routes cannot re-export root builders or package-owned namespace objects.

### Proof

- Packed export-map and route-isolation tests.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-001`.

## AMEND-API-001 — Maintained common-path quickstart

Status: vNext additive amendment; this section is new target guidance and is not transferred provenance.

- Surface: The maintained consumer quickstart for the existing root, React, testing, and inspection routes.
- Rule: The quickstart MUST show one complete common path from `definition`/`machine` authoring through
  `app`, `runtimeSetup`, readiness, actor command/snapshot use, and one focused proof. It MUST use only
  the named package routes and public values in this file, remain valid against the packed package, and
  be updated with any accepted public-surface change.
- Accepts: A minimal root-runtime example plus a React or Story continuation where the route is relevant.
- Rejects: Private deep imports, compatibility aliases, deleted APIs, invented helper builders, or examples
  that bypass readiness, ownership, or the production runtime.
- Observable guarantee: A new consumer can reach the first successful actor turn by following one current,
  checked-in path without reconstructing package topology from separate contract sections.
- Proof: `AMEND-P05` quickstart compile/run and packed-consumer proof.
- Trace: vNext additive amendment; no provenance source.

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

## API-002 — Public type boundary

~~~ts
type PublicRootNames =
  | "Definition" | "StateToken" | "EventToken" | "StateOf" | "EventOf" | "Machine"
  | "MemoryOf" | "InputOf" | "RequirementsOf" | "Resource" | "Transaction" | "ActorRef"
  | "ActorSnapshot" | "Module" | "App" | "RuntimeSetup" | "Runtime" | "Implementation"
  | "Persistence" | "PersistenceStorage" | "PersistenceStorageError" | "PersistenceCodec"
  | "PersistenceSlot" | "PersistenceValue" | "PersistenceEntry" | "CanonicalKeyInput"
  | "FlowPath" | "FlowUsageCode" | "FlowUsageError";
~~~

### Surface

- Root exports the consumer-facing names above and exact operation-family unions only through inferred
  `API-006` shapes.
- `FlowDisposeError` and `FlowStoryExecutionError` are public error boundaries and may carry installed
  Effect `Cause.Cause<unknown>`.

### Rule

- Ordinary handles expose exact `ActorRef` but no disposal; owner lease is a separate construction result.
- Raw Cause is not in snapshots, passive selectors, serialized artifacts, or CLI; those use the
  package-owned diagnostic/`CauseProjection` shape.

### Accepts

- Naming/inference of the public values and types listed above.

### Rejects

- `FlowReceipt`, standalone status aliases, full diagnostic facts, `TurnRecord`, registered-view,
  child-machine, root/dynamic actor category, generic operation-ref, testing artifact, inspect artifact,
  internal service-tag/store/orchestrator/ManagedRuntime/boot/harness types.

### Observable guarantee

- Public boundaries expose only consumer-facing route values/types; raw Cause has the two stated error
  exceptions only.

### Proof

- Public declaration and packed-package absence proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-002`; diagnostics: `API-002A`.

## API-002A — Usage diagnostics

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

### Surface

- Immutable usage/admission error with exact `_tag`, code, path, and scalar/null details.

### Rule

- Usage/admission failures use this shape. `FlowPersistenceError` owns storage, codec, identity, and
  restoration failures. Serialized diagnostics use private ordered `CauseProjection`.

### Accepts

- The exact 18 `FlowUsageCode` values and exact details value domain.

### Rejects

- Raw Cause in serialized diagnostics or alternate usage-error shapes.

### Observable guarantee

- Consumers can discriminate every public usage/admission failure by `_tag` and `code`.

### Proof

- Runtime negative and declaration-shape proofs for every code and field.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-002A`.

## AMEND-API-002 — Usage-diagnostic remediation

Status: vNext additive amendment; API-002A remains the exact machine-readable error shape.

- Surface: `FlowUsageError.message` and the per-code remediation documentation for API-002A.
- Rule: Every one of the exact 18 `FlowUsageCode` values MUST have a maintained documentation row naming
  the failure meaning, the relevant `path`/`details`, and the next corrective action. The inherited
  `Error.message` MUST be human-readable and action-oriented, but is not a stable parsing surface.
  Consumers MUST discriminate with `_tag` and `code`, then use `path` and `details` for programmatic data.
- Accepts: Rich message text, code-linked documentation, and scalar/null details that explain the failing
  boundary without exposing raw Cause.
- Rejects: A new public `cause` member, alternate error shape, message parsing as control flow, or a
  message-stability guarantee that would make prose a second API.
- Observable guarantee: Every usage/admission failure gives a consumer both a stable diagnostic code and
  a practical human remediation path.
- Proof: `AMEND-P03` exhaustive code/message/documentation proof.
- Trace: vNext additive amendment; API-002A remains the transferred shape authority.

| Code | Failure meaning | Example path/details | Human message | Corrective action |
| --- | --- | --- | --- | --- |
| `InvalidCanonicalValue` | A canonical key/value contains an unsupported or non-canonical value. | `path: ["key"]`; `details: { "reason": "unsupported" }` | `The operation key contains a value that cannot be canonicalized.` | Replace it with a bounded JSON-safe canonical value. |
| `ForeignActorRef` | The ref belongs to another app or runtime. | `path: ["actorRef"]`; `details: { "reason": "foreign" }` | `This actor ref belongs to a different runtime.` | Use a ref created by the receiving app/runtime. |
| `MismatchedActorRef` | The ref is branded for a different machine. | `path: ["actorRef"]`; `details: { "machine": "Editor" }` | `This actor ref is for a different machine.` | Pass the exact machine-branded ref required by the operation. |
| `MissingActorRef` | An operation requires an actor ref that was not supplied. | `path: ["actorRef"]`; `details: { "required": true }` | `An actor ref is required for this operation.` | Provide the admitted stable ref or use the explicit local-actor path. |
| `DisposedActorRef` | A command addressed an actor after terminal disposal. | `path: ["actorRef"]`; `details: { "disposed": true }` | `This actor has been disposed and cannot accept commands.` | Acquire a valid owner/runtime and do not reuse the disposed ref. |
| `RuntimeNotReady` | A handle or command escaped before readiness completed. | `path: ["runtime"]`; `details: { "phase": "booting" }` | `The runtime is still booting.` | Await the sole public `runtime.ready()` Effect before use. |
| `RuntimeDisposed` | A command or lookup targeted a disposed runtime. | `path: ["runtime"]`; `details: { "phase": "disposed" }` | `The runtime is disposed and cannot accept work.` | Construct and own a new runtime execution scope. |
| `MissingContextProvider` | A declared context binding has no admitted provider. | `path: ["contextBindings", "session"]`; `details: { "provider": "missing" }` | `The required context provider is not admitted.` | Admit the exact provider ref before constructing the consumer. |
| `ContextDependencyCycle` | Context bindings contain a dependency cycle. | `path: ["contextBindings"]`; `details: { "cycle": "Session>Theme>Session" }` | `Context bindings contain a dependency cycle.` | Remove the cycle and keep provider dependencies acyclic. |
| `DuplicateActorClaim` | Two admissions claim one stable actor identity incompatibly. | `path: ["actorRef"]`; `details: { "claim": "duplicate" }` | `This stable actor is already claimed incompatibly.` | Join the existing ensure or use a distinct stable identity. |
| `UnadmittedMachine` | A machine is not part of the closed `AppPlan`. | `path: ["machine"]`; `details: { "machine": "Editor" }` | `This machine is not admitted by the application plan.` | Include the machine in the app before runtime construction. |
| `ActorNotActive` | Work was sent while the actor was not active. | `path: ["actor"]`; `details: { "lifecycle": "suspended" }` | `The actor is not active and cannot accept this work.` | Resume through its owning host or wait for runtime activation. |
| `InvalidOperationPlan` | An authored operation plan is structurally invalid. | `path: ["operation"]`; `details: { "reason": "invalid-plan" }` | `The operation plan is invalid.` | Fix the descriptor-owned operation fields before admission. |
| `WrongOperationKind` | A resource, transaction, or stream API received another family. | `path: ["operation", "kind"]`; `details: { "expected": "resource" }` | `The operation belongs to a different operation family.` | Use the API matching the declaration's exact operation kind. |
| `OperationNotPending` | An action requires a pending operation but none is pending. | `path: ["operation"]`; `details: { "status": "idle" }` | `This operation is not pending.` | Start or observe the correct occurrence before acting on it. |
| `OperationAlreadySettled` | A completion/cancellation attempted to settle an occurrence twice. | `path: ["operation", "occurrence"]`; `details: { "settled": true }` | `This operation occurrence is already settled.` | Do not reuse the settled occurrence; issue a new authored attempt. |
| `DuplicateStreamDeclaration` | One actor declaration installed the same stream slot twice. | `path: ["streams", "progress"]`; `details: { "duplicate": true }` | `This stream declaration is duplicated.` | Keep one declaration per slot or give the declarations distinct identities. |
| `BlockedByDependents` | Disposal would violate active or suspended context dependents. | `path: ["actorRef"]`; `details: { "dependents": 1 }` | `This actor cannot be disposed while dependents remain bound.` | Dispose or rebind every named dependent before disposal. |

## API-003 — Definition authoring

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

### Surface

- `definition` owns durable ID, recursive state/event schemas, optional readonly context selectors,
  input-to-memory initialization, and one flat named operation record.

### Rule

- State declarations are string leaves or recursive single-key compounds, max ten levels, with exact
  path tokens such as `S.ACTIVE.S.EDITING`. Event members are frozen nominal tokens. Callable events
  return frozen readonly envelopes with full `type`; null events are zero-argument constructors.
- Context selectors are typed definition-level provider edges, not registrations. `memory` is the sole
  input/memory source; absent initializer means `Input=void` and readonly empty memory. Restoration
  installs memory without input replay.
- Operations are flat, named, inert, and contribute exact types/reachability to AppPlan.

### Accepts

- Exact state/event/context/operation names and the single memory factory.

### Rejects

- Duplicate state/event declarations, relative string targets, runtime path lookup, operation work on
  declaration, and input classification of actors.

### Observable guarantee

- The definition is the complete static actor shape and no actor/work is created by authoring.

### Proof

- Positive/negative recursive grammar, token, input, memory, and operation inference fixtures.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-003`; terminology: `GLOSSARY_AND_IDENTITY.md#GLO-01`–`GLO-04`.

## API-004 — Machine behavior grammar

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

### Surface

- `machine(definition, callback)` receives exact `S`, `E`, `O`, `onContext`, `onMemory`, `invalidate`,
  and `clear`; returns complete machine configuration.

### Rule

- The root configuration MUST contain `default` and an exact `states` record for every root declaration.
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
- `onContext.select` is a machine-level registration. Its initial selected value is recorded silently from
  the bootstrapped context baseline; a later changed selection invokes the handler with defined
  `(current, previous)`, and the handler returns one typed self-event, `false`, or `null`. The emitted event
  enters the ordinary mailbox, whose handler owns legality, guards, memory updates, and finite actions.

- `onMemory` and `onMemory.select` own continuing resource or stream plans independently by declaration
  slot. Each entry receives current immutable memory, returns one continuing plan, `false`, or `null`, and
  releases only that entry when its state exits, normalized identity changes, or the callback returns a
  sentinel. A single entry MUST NOT return a runtime-sized array. `onMemory.select` uses the shared selector
  equality and receives `(current, previous)` selected values; equal normalized operation identity retains
  the existing generation and materialized executable input.

- The shared selector MUST be synchronous, pure, and side-effect-free. Scalar and non-record results use
  complete-value `Object.is`; named non-null plain-record results use fixed-key, field-by-field `Object.is`.
  Selectors do not accept per-registration comparators, and `false` or `null` are no-output sentinels only
  for callbacks that map a selection to an event or continuing plan.

- Every event macrostep selects the winning transition, evaluates its guard, evaluates `updateMemory` and
  then `actions` from the same immutable pre-turn snapshot and event, applies target and memory to a
  candidate, stabilizes redirects, validates the complete finite-action batch, stages actor and synchronous
  store changes, publishes them atomically, and only then starts or joins asynchronous work. A callback,
  redirect, key, target, or batch-validation defect aborts the unpublished whole turn. Timer redirect and
  duration behavior remains explicit and bounded by the existing timer contract.

### Accepts

- Existing `on`, `redirect`, `activities`, `timers`, recursive `default`/`states`, context and memory
  registrations, and finite action plans.

### Rejects

- Final state/`onDone`/output, child actors, context mutation, `entry`/`exit`/`invoke`/`always`, Boolean
  reentry, transition `submit`, anonymous Effects, runtime-sized single-entry arrays, and timer actions.

### Observable guarantee

- A callback/redirect/key/target/batch defect changes neither published actor/store state nor starts work.

### Proof

- Grammar, macrostep atomicity, selector equality, action admission, context, and onMemory proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-004`; inference: `TYPE_SYSTEM.md#TYPE-002`–`TYPE-004`.

## API-005 — Resources and canonical `P`/`K`

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

### Surface

- `resource` accepts descriptor ID, synchronous key projector, lookup adapter, and descriptor-owned
  freshness/collection policy.
- `P` is complete retained executable input; `K=key(P)` is ordered canonical tuple; identity is ID+K.

### Rule

- Project/validate/canonicalize/freeze before ownership, mutation, admission, or external work.
- `P` is complete immutable executable input retained by a lookup, transaction attempt, or stream
  subscription. It MAY contain clients and functions and is never operation identity. Runtime-owned
  capabilities remain outside `P`; service dependencies belong to the inferred Effect/Stream requirement
  `R`. `K` is the ordered readonly canonical tuple returned by `key(P)`. Exact resource identity is
  descriptor ID plus canonical `K`.
- Source containers are ordinary dense arrays/plain records; Flow copies/freezes recursively and freezes
  top tuple. Reject `undefined`, non-finite numbers, bigint, symbols, functions, accessors, classes,
  unsupported objects, cycles, branded secrets, sparse/extra-property arrays, symbols, hostile or
  inconsistent reflection. Limits: depth 16, value nodes 256, UTF-8 bytes 8192. Exact `K[index]` or
  nested-record path names failure.
- `KBytes` has no whitespace/trailing newline:

~~~text
KBytes ::= "[" [ Value *( "," Value ) ] "]"
Value ::= "null" | "true" | "false" | Number | String
        | "[" [ Value *( "," Value ) ] "]"
        | "{" [ Member *( "," Member ) ] "}"
Member ::= String ":" Value
~~~

- Number uses finite `JSON.stringify` (`-0`→`0`); strings use JSON escaping/no normalization; records
  sort raw UTF-16 keys and require Object.prototype/null prototype, enumerable own data properties/no
  symbols; arrays dense ordinary/no extra props. Read data descriptors only; no getters/coercion/
  `toJSON`/user iteration. Every result-changing discriminator belongs in K.
- No second key, custom hash/equality, or new freshness defaults. Tags derive from K; placeholders are
  passive descriptor metadata.

### Accepts

- Complete `P` for executable methods, exact `K` for passive reads, `persist?: boolean` false by default.

### Rejects

- Noncanonical values/bounds, hostile reflection, omitted discriminators, competing identity policy,
  resource refs, and mutation/work on invalid input.

### Observable guarantee

- Invalid input publishes/mutates nothing and starts no work; equal bytes share identity and differing
  bytes separate identity.

### Proof

- Byte identity, order, `-0`, defensive freeze, exact rejection paths, no reflection execution, identity
  separation, and 16/256/8192 boundary tests; next value rejects.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-005`; identity owner: `GLOSSARY_AND_IDENTITY.md#GLO-05`.

## API-006 — Named operation families and states

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

Transaction outcomes map `success(A)`, `failure(E)`, `defect()`, and `interrupt()`. A commit MAY declare
authoritative writes, but results never become canonical data implicitly:

~~~ts
O.submitIntent.commit(params, {
  writes: ({ value }) => [O.orderById.setData([value.order.id], value.order)],
  outcomes: {
    success: (receipt) => E.SubmitSucceeded(receipt),
    failure: (error) => E.SubmitFailed(error),
  },
});
~~~

The accepted mapping includes explicit `setData` plans, not completion-side `invalidates` or `clears`
options. Exact public state union fields follow `API-006`; occurrence terminality and completion-side
preview ordering follow `SEM-016` and `SEM-018`.

### Surface

- The machine receives exact named `O`. The schematic family/state aliases here are not required
  standalone exports.
- Resource states: `missing`, `pending`, `ready`, `refreshing`, `failure`, `defect`, `interrupted`;
  optional retained `data` where applicable. Transaction states: `idle`, `pending`, `success`,
  `failure`, `defect`, `interrupted`, `unknown` with `reconcileRequired: true`. Stream states:
  `idle` (generation null), `running`, `complete`, `failure`, `defect`, `interrupted`, each with
  `hasValue`, optional `latest`, and `emissionCount`.

### Rule

- `undefined` is not `A`; it means missing `getData` or updater decline. Counts/generations are
  non-negative safe integers. Failure/defect/interruption may retain last resource data; refreshing
  always retains usable data. Unknown is not interruption.
- Passive reads never acquire/start/refresh/mutate/collect. Missing reads do not materialize entries.
  Same actor+descriptor+K second live stream declaration rejects before replacement/release; other actors
  remain independent. Declaration slots stay private.
- Omitted transaction key is `[]`. Accepted verbs are `lookup`, `commit`, `subscribe`; operations execute
  only from accepted action/continuing declarations and retain complete `P`.
- `invalidate`/`clear` validate and expand exact resource/K, tags, families against one pre-mutation
  snapshot in stable descriptor/K order; deduplicate first-seen; max 256 identities; missing/zero-match
  no-op. Invalidate retains data/overlays and does not replace/cancel generations. Clear fences,
  cancels final owner, removes data/overlays, leaves survivors at missing. Conflicting target changes reject.

### Accepts

- Exact named-family methods and the state unions above, including retained-data/unknown/stream-value
  discriminators.

### Rejects

- Generic registries, `byKey`, `byLane`, bound refs, descriptor parent selectors, operation enumeration,
  stream actor cancel, and standalone support aliases.

### Observable guarantee

- Passive reads are inert; family state discriminants expose exact value-presence, generation, terminal,
  and reconciliation truth.

### Proof

- Exact family inference/union fixtures and runtime passive-read, sharing, bounded expansion, invalidation,
  and clear proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-006`; type owner: `TYPE_SYSTEM.md#TYPE-005`–`TYPE-007`.

## API-007 — Finite actions and continuing plans

~~~ts
actions: ({ event, memory }) => [
  O.submitIntent.commit(buildSubmissionInput(event, memory), { outcomes: submitOutcomes }),
];
~~~

### Surface

- `actions` admits one inert finite plan, readonly list, `null`, or empty list. Accepted finite work:
  lookup/refetch, commit/cancel, cache write, invalidate, clear.

### Rule

- Omission/null/empty admits none; actions are not inferred on timers, activation, passive reads,
  memory/store revisions, completion, or reconciliation.
- Finite outcomes: `success(A)`, `failure(E)`, `defect()`, `interrupt()`. Continuing resources:
  `value(A)`, `failure(E)`, `defect()`, `interrupt()`. Mappers return one typed event and receive no
  Exit/Cause/state/lifecycle metadata. Occurrences admit once; reconciliation does not restart them.
- Continuing resources are activities; memory-derived plans are `onMemory`. Declarations own subscriptions;
  machine code does not manually unsubscribe. `after` targets explicit refresh event and is not polling.

### Accepts

- Guard-accepted finite plans and declaration-owned continuing plans.

### Rejects

- Timer/activation inference, completion-side occurrence restart, user-managed unsubscribe for correctness,
  and polling API inference.

### Observable guarantee

- A finite occurrence is admitted exactly once from its accepted transition; continuing identity governs
  retain/release.

### Proof

- Action admission, mapper, occurrence, activity, and onMemory proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-007`.

## API-008 — Transactions

~~~ts
const submitIntent = transaction({
  id: "everclear.submit-intent",
  key: ({ submissionId }: SubmitIntentInput) => [submissionId] as const,
  commit: (params, { signal }) => IntentSubmitter.submit(params, { signal }),
  persist: true, concurrency: "reject",
});
~~~

### Surface

- Transaction family: passive `key`/`getState`, finite `commit`, actor-owned `cancel`. Missing key is `[]`.

### Rule

- `commit(P, options?)` inert until accepted event action. Actor-local descriptor+K concurrency:
  `reject | cancel | allow | serialize`; retry is a new commit from a new event.
- Outcomes map success/failure/defect/interruption. Writes are explicit `setData` plans; results never
  implicitly become canonical data. No completion-side `invalidates` or `clears` options.
- Exact state fields, terminality, and preview ordering follow `API-006`, `SEM-016`, `SEM-018`.

### Accepts

- Explicit `writes` and typed `outcomes` mappings.

### Rejects

- Parent machine/memory/event/selector/route/preview type capture, implicit result promotion, retry helper,
  completion-side invalidation/clear options.

### Observable guarantee

- Transaction completion changes canonical data only through explicit authored writes.

### Proof

- Transaction P/K/A/E/R, concurrency, writes, outcome, cancellation, and unknown-lane proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-008`; type owner: `TYPE_SYSTEM.md#TYPE-006`, `TYPE-008`.

## API-009 — Streams

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

### Surface

- Stream family: passive `key`/`getState`, continuing `subscribe`; no actor `cancel`, no resource entry.
- State retains status, `hasValue`, latest value when present, emission count, generation, terminal status.

### Rule

- Equal key in one live declaration retains generation/original `P`; changed key releases once and starts
  another. Different actors are independent. Exit/replacement/disposal/false/null finalizes once; late
  emissions are fenced by slot/key/generation; emissions coalesce to latest projection.
- Outcomes: `value(V)`, `complete()`, `failure(E)`, `defect()`, `interrupt()`. Release maps no outcome.
  Hydration rematerializes active declaration from live P without replaying emissions; terminal does not
  restart; missing P fails closed rather than reconstructing from K.
- Invalidation/clear are actor-level finite actions over exact resource/K, reachable nominal tags, and
  families; no zero-arg/wildcard/whole-runtime cache clear. Runtime disposal is complete removal.

Invalidation and clearing are actor-level finite actions over exact `[O.resource, K]` targets, declared
reachable nominal tags, and admitted resource families. Planning resolves, validates, and deduplicates
targets before mutation. Invalidation retains data and marks matches stale without starting work directly;
clear removes matched data and metadata, fences generations, interrupts work, and publishes atomically.
There is no zero-argument, wildcard, whole-runtime, or ordinary cache-clear escape hatch. Complete removal
belongs to `runtime.dispose()`.

### Accepts

- Continuing stream declarations and typed value/failure/defect/interruption/completion mappings.

### Rejects

- Stream actor cancel, resource-store identity, replay from K, terminal restart, arbitrary cache clear,
  and direct durable state mutation from an emission.

### Observable guarantee

- Only mapped events or explicit authoritative writes make emissions durable actor/store state.

### Proof

- Stream P/K/V/E/R, latest-value projection, declaration-slot, hydration, terminal, and no-cancel proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-009`; identity owner: `GLOSSARY_AND_IDENTITY.md#GLO-09`.

## API-010 — Modules, apps, and `App.M`

~~~ts
const CoreModule = module({ id: "core", machines: { router: routerMachine, auth: authMachine } });
const TodoApp = app({ id: "todo-app", persistenceVersion: "1", modules: [CoreModule, TodosModule] });
TodoApp.M.router;
~~~

### Surface

- `module({ id, machines })` preserves exact keyed machine record. `app({ id, persistenceVersion,
  modules })` flattens ordered unaliased modules into exact `App.M`.

### Rule

- Reject duplicate property names, machine values, tooling ownership. Module IDs are unique tooling
  identity for CLI/trace/inspection/artifacts/diffs only. Rename is artifact-breaking without alias;
  runtime/persistence identity stays compatible and history needs explicit migration.
- Every local/shared/Story-local actor uses a listed machine; every listed machine contributes graph and
  requirements to immutable AppPlan. Compilation creates no actor. No `dynamicMachines`, automatic-root,
  or runtime family lookup. No XState `setup()`/`machine.provide()` layer: definitions shape, machines
  behavior, apps reachability, Implementations services, fixtures tests.

### Accepts

- Ordered modules and exact `App.M` admission.

### Rejects

- Duplicate machine/tooling ownership, dynamic admission, automatic roots, and behavior variants without
  distinct definition/machine identity.

### Observable guarantee

- A running runtime cannot expand AppPlan; module IDs do not enter runtime/persistence identity.

### Proof

- App/module exact-record, duplicate, closed-universe, and requirements proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-010`; terminology: `GLOSSARY_AND_IDENTITY.md#GLO-07`.

## API-011 — Actor refs, leases, and construction

~~~ts
const ref = actorRef(editorMachine, "primary-editor", { persist: true });
const sharedLease = runtime.ensureActor(ref, { input, contextBindings });
const sharedActor = runtime.getActor(ref);
const localLease = runtime.createActor(editorMachine, { input, contextBindings });
await sharedLease.dispose();
~~~

### Surface

- Stable ref is inert durable `actor:` address; `persist` defaults false and is metadata, not identity.
- `ensureActor` returns `{ actor, dispose }` and restores or creates; `getActor` is lookup-only/no lease;
  `createActor` creates fresh local opaque ref/no stable ID and returns lease.

### Rule

- Concurrent ensures join one construction. Restored memory/bindings do not rerun init. Dropping a lease
  does not dispose. Stable disposal tombstones current runtime ref; later runtime may reuse.
- The wire form is `actor:` followed by the GLO-01 length-prefixed UTF-8 machine-ID and authored stable-ID
  segments in that order. Refs contain no input, bindings, callbacks, ownership, subscription, or disposal.
- Context slots bind one-for-one to exact provider refs; missing/ambiguous/foreign/cyclic rejects and
  edges create no parentage/ownership/command channel. Rebinding cannot retain memory/context history.
- Readiness restores persistable actors/resource-operation state using AppPlan, seals graph, then activates
  or exposes handles.

### Accepts

- Exact machine-branded refs and Runtime-owned/Story-local owner leases.

### Rejects

- Stable IDs on local creation, disposal on handles/refs, foreign/mismatched/disposed refs, and context
  graph defects.

### Observable guarantee

- `getActor` never creates/adopts or grants ownership; stable tombstones reject lookup/ensure in-runtime.

### Proof

- Lease, ref, context graph, admission ordering, tombstone, and local/shared lifecycle proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-011`; identity owner: `GLOSSARY_AND_IDENTITY.md#GLO-06`, `#GLO-08`.

## API-012 — Runtime and React lifecycle

~~~ts
const setup = runtimeSetup({
  app: IncidentApp,
  implementation: IncidentLive,
  persistence: persistence({ storage: webStorage(window.localStorage), scope: "user:42" }),
});
const runtime = setup.construct();
~~~

### Surface

- `construct()` is synchronous/inert. `ready()` is the sole public readiness Effect; Runtime also has
  Effect bridge, async disposal, create/ensure, and lookup-only get.
- Lifecycle is `prepared | active | suspended | disposed`.
- React: `FlowProvider`, `useActor(machine, options?)`, `useActorByRef(ref)`, `useView(actor, selector)`.

### Rule

- Readiness validates providers, codec, AppPlan, restores declarations and persistable actor-owned state,
  and caches success/terminal failure. Transaction and stream state restore only when both declaration and
  owning stable actor are persistable. Boot/decoders/hydration/DehydrateBarrier are private.
- Runtime must not expose boot/decode/mutable hydration/dehydrate, `runtime.actor`, roots, public
  ManagedRuntime, mutable resource/orchestrator services, test registries, or acknowledged dispatch.
- Prepared buffers; active admits/owns resources; suspended preserves continuity/rejects commands/owns no
  live attachments; disposed is terminal. React local actor is fresh; by-ref is existing lookup/no owner;
  both are command-only. useView is sole ordinary reactive path and passive.
- Render prepares final actor/ref/handle/snapshot/mailbox without registration/work; commit attaches,
  baseline-installs, activates, drains once; cleanup suspends same actor without shell swap/grace/terminal
  dispose. Imperative create is immediately attached/running.
- `useView` tracks exact O descriptor/K reads per evaluation and reruns matching actor/StoreFanout at one
  tear-free boundary; Object.is rules as `API-004`; no comparator/registered views/React per-actor context.
- Lifecycle publishes snapshot before evidence; retains start/restore/dispose and adds suspend/resume,
  not prepare. `FlowDisposeError` is frozen with `_tag: "FlowDisposeError"`,
  `cause: Cause.Cause<unknown>`, and `scope: "actor" | "runtime"`; actor/runtime
  scope; async lease/runtime disposal is idempotent/cached/terminal and blocked disposal identifies deps.

### Accepts

- One production lifecycle and one readiness boundary for live hosts, React, and Stories.

### Rejects

- Raw Cause in snapshots/selectors, reactive `useActor`/`useActorByRef`, shell replacement, grace period,
  public lifecycle controls, registered view APIs, and ordinary handle disposal.

### Observable guarantee

- No handle/work escapes before readiness; cleanup preserves actor identity via suspension.

### Proof

- Runtime, React 18/19, lifecycle, readiness, passive selector, disposal, and public absence proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-012`; host detail remains in `REACT_AND_HOSTS.md`.

## API-013 — Story constructors

~~~ts
story.app(runtimeSetup, options?);
story.machine(machine, options?);
story.actor(machine, options?);
~~~

### Surface

- `story.app`: fixtures/maxTurns/title/description/tags. `story.machine`: exact required input,
  selected initial context, fixtures, metadata; `story.actor`: exact required input/contextBindings.

### Rule

- Void-input machines reject authored input. Focused Stories reject boot, refs, extra actors, raw memory,
  initial state, snapshots. App Story uses typed RuntimeSetup, not bare app/runtime. Every run uses
  production bootstrap, fixtures, TestClock, restoration, ensure, AppPlan validation, graph sealing,
  activation, and cleanup. Machine Story uses package-private one-machine AppPlan and same production
  engine. `maxTurns` defaults 100.
- Plans are immutable/inert until run; no handles, loops, predicates, callbacks, assertions, branches.

### Accepts

- The three non-callable namespace constructors and closed conditional options.

### Rejects

- Callable Story, `.with`, live runtime/bare app inputs, focused overrides, and extra actors.

### Observable guarantee

- Direct Story runs use the same production runtime/engine/cleanup boundary as live behavior.

### Proof

- Story constructor/options, execution, and package absence compile proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-013`; type owner: `TYPE_SYSTEM.md#TYPE-014`.

## API-013A — Behavior gateway

~~~ts
const gateway = behavior({
  app: IncidentApp,
  stories: { smoke: incidentStory, "machine-model": incidentMachineStory },
});
~~~

### Surface

- Testing route exports one inert `behavior` constructor requiring explicit app and non-empty readonly
  Story record. Record keys are external IDs.

### Rule

- Synchronously validates/registers only; acquires no Implementation, Runtime, actor, Story, sink, or
  cleanup. Rejects empty/duplicate keys, mixed app, missing app, ActorRecipe values, incompatible app/
  machine. App Stories use supplied RuntimeSetup; machine Stories require machine in supplied App.M.
- Brand/AppPlan/gateway internals are private. CLI is only public consumer; direct `.run` and CLI share
  production runtime/kernel/evidence/cleanup; gateway is not a runner.

### Accepts

- Non-empty external Story ID record bound to one App identity.

### Rejects

- Story titles/tags/files/object identity as discovery identity, second app identity, and execution in gateway.

### Observable guarantee

- Discovery preserves one supplied App identity and has no runtime side effects.

### Proof

- Gateway validation, app compatibility, inertness, and CLI parity proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-013A`.

## API-014 — Story commands and evidence

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

### Surface

- Both: `process`, `advance`, `advanceTo`, `advanceToNextTimer`, `checkpoint`, `run`.
- App: target + event `send`. Machine: target-free `send` and `setContext`.

### Rule

- App targets exact app-owned ref or recipe; machine family is never target. App does not inject context.
- `process` replaces flush/settle and drains ready work without time/results; clock movement does not
  process. Checkpoint reads evidence immediately. `.run()` sole execution boundary.
- Runs never inject pending results; complete Implementations provide behavior. Capture uses exact closure,
  one StoreState revision, snapshots, pending work, TestClock, and accepted runtime evidence prefix;
  the closure includes the single machine actor or every app recipe plus exact refs in bindings, targets,
  and transitive providers, and excludes unrelated actors;
  no lookup/progress/work/time/create/dispose/restore. `run.end` follows commands before cleanup and does
  not imply completion.
- Failed execution retains checkpoints and frozen `FlowStoryExecutionError` with Cause, boundary,
  cleanup/cancellation/evidence diagnostics. Admission closes before non-abortable finalization; cleanup
  is reverse dependency/deterministic phase. Cleanup failure retains end evidence but never success;
  failure before capture never fabricates `run.end`.

`send` targets an exact app-owned `ActorRef` or exact Story actor recipe in app Stories and omits a target
only in machine Stories. A machine family is never a Story target. `setContext` exists only on machine
Stories and injects exact already-selected values through the production context-turn path; app Stories do
not inject context.

`process()` MUST drain ready production work until no work can progress without another command or future
time. It does not advance time or invent external results. Clock movement does not process implicitly, and
`checkpoint` reads evidence immediately without progressing or creating restoration input.

`FlowStoryExecutionError` carries one deeply frozen package-owned failure envelope with `cause:
Cause.Cause<unknown>`, optional end evidence, the failure boundary, primary and ordered cleanup diagnostics,
cancellation evidence when applicable, and accepted/drained evidence-sequence facts. A cleanup failure
retains captured end evidence but never returns success; failure before end capture never manufactures
`run.end`.

### Accepts

- Exact command set and checkpoint access:

~~~ts
appRun.checkpoints["signed-out"].actor(editor).snapshot;
appRun.checkpoints["signed-out"].actor(PrimarySessionRef).snapshot;
appRun.checkpoints["signed-out"].runtime.now;
appRun.checkpoints["signed-out"].runtime.pendingWork;
appRun.end.actor(editor).snapshot;
machineRun.checkpoints["signed-out"].snapshot;
machineRun.end.snapshot;
~~~

### Rejects

- `flush`, `settle`, `perform`, `deliver`, `receive`, `setTime`, replay/final helpers, result injection,
  implicit time processing, machine-family targets, and false successful cleanup.

### Observable guarantee

- Evidence is a deeply frozen production read cut; failure reports no synthetic end evidence.

### Proof

- Story command, checkpoint, DehydrateBarrier, signal/cancellation, cleanup, and evidence-sequence proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-014`; glossary: `GLOSSARY_AND_IDENTITY.md#GLO-15`.

## API-015 — Fixtures and models

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

### Surface

- `fixture({ id, implementation, seeds? })` supplies complete services; seeds preload Runtime-owned
  resource state. Fixture provider overrides app provider by service identity; duplicates reject.
- `model(baseStory, { stateKey })` accepts command-empty fresh machine Story; only
  `getShortestPaths`/`getSimplePaths`; it returns frozen inferred path collections and paths use ordinary
  Story result shape.

### Rule

- Kernels remain live; Implementations replace complete service functions preserving input/success/failure/
  cancellation/lifetime. No argument/output matcher, operation mock, control registry, pending-work or
  result-injection command. Seeds do not satisfy requirements, mock services, create global state, or
  authorize cache mutation.
- Candidate events belong to traversal calls, not model/base state. `stateKey` receives exact predicted
  snapshot and returns CanonicalKeyInput. Model does not run Effects/synthesize async routes/expose
  replay/provide/clock helpers or named path/result classes. `FlowStoryExecutionError` is the only named
  testing runtime class and carries a frozen envelope accepted by REV-TEST-006 and REV-TEST-008 with the
  complete public Cause.

### Accepts

- Complete inert per-run fixture Implementations and command-empty machine model bases.

### Rejects

- Missing/duplicate providers/services, app/non-empty model plans, cross-call candidate retention,
  function-mocking registries, and parallel testing/path/result hierarchies.

### Observable guarantee

- Provider state is fresh per Runtime/Story run unless application ownership explicitly shares it.

### Proof

- Fixture closure, implementation variance, model restriction, path, and Story execution proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-015`; type owner: `TYPE_SYSTEM.md#TYPE-016`–`TYPE-017`.

## API-016 — Inspection and artifacts

~~~ts
const attachment = attachInspectionSink(runtime, sink);
await attachment.drain();
const bytes = new Uint8Array(); // illustrative artifact input
const trace = importTraceArtifact(bytes);
const artifact = exportTraceArtifact(trace);
~~~

### Surface

- Pure graph/transition functions consume inert definitions/snapshots. Live inspection consumes committed
  private `TurnRecord` and immutable `LifecycleRecord`; route owns private v2 codecs/artifacts.
- Sink attachment returns frozen `{ drain, dispose }`; buffer sink has explicit capacity. Artifact bytes
  use one file-neutral defensive-copy carrier.

### Rule

- Inspection has no second mutable history and cannot fabricate traces from arbitrary snapshots. Planner
  output may show selection/microsteps/memory patches/desired plans, not actual starts/releases/generations/
  pending outcomes/finalizers. TurnRecord remains private; projections are inferred immutable.
- Slow sink cannot delay ack/StoreFanout; failed sink detaches and other sinks continue. Import/export
  never exposes private v2 model, TurnRecords, runtime ownership, or raw Cause. Formatters remain one per
  projection; the attachment observes records admitted after attachment.

### Accepts

- Only route-created sinks and validated immutable inferred projections.

### Rejects

- Arbitrary snapshot history, unbounded implicit retention, caller mutation of bytes, parallel public
  evidence hierarchies, and raw Cause/artifact internals.

### Observable guarantee

- Inspection observes committed production records after publication without owning runtime history.

### Proof

- Sink backpressure/failure, bounded retention, defensive bytes, planner-vs-runtime, and artifact proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-016`.

## AMEND-API-003 — Opt-in redacted artifact exports

Status: vNext additive amendment; raw runtime truth and the exact WIRE-020B export remain unchanged.

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

- Surface: An optional redaction policy on the existing `exportTraceArtifact` inspection route.
- Rule: Redaction MUST be explicit, pure, and applied to a defensive export projection. An omitted or empty
  policy returns the exact importable WIRE-020B bytes. A non-empty policy emits the exact export-only
  `TraceShareArtifact` envelope defined by WIRE-020C. A redaction policy may replace only application-owned value carriers at
  named `ArtifactValuePath`s with the fixed `"[REDACTED]"` replacement; it MUST NOT target identity,
  app-plan fingerprint, version, discriminants, ordering, sequence, truncation, diagnostic codes, or
  cleanup/status structure. The resulting share projection is not persistence or boot input and is rejected
  by `importTraceArtifact` as the wrong artifact kind.
- Accepts: An omitted or empty policy for raw export, or an explicit finite list of value paths with
  deterministic replacement. Paths use the artifact grammar in `ARTIFACT_WIRE.md`; array segments are
  exact non-negative indexes, wildcards are forbidden, paths MUST exist, and duplicate or ancestor/descendant
  overlaps reject as `InvalidArtifactOperand`.
- Rejects: In-place mutation of runtime state, canonical persistence, the live decoded model, missing-path
  redaction, structural/identity paths, or an export that changes identity/fingerprint/ordering semantics.
- Observable guarantee: Teams can share a privacy-reduced inspection export while the runtime, persisted
  record, raw artifact, and canonical evidence remain unchanged.
- Proof: `API-P04` default-equivalence, path-bound, non-mutation, deterministic-output, manifest-consistency,
  and wrong-kind import-rejection proofs.
- Trace: vNext additive amendment; `PERSISTENCE_AND_ARTIFACTS.md` remains the sole semantic and schema authority:
  WIRE-020A/B own raw importable artifacts and WIRE-020C owns only the share projection.

## API-017 — CLI boundary

~~~ts
const command: "flow-state behavior check" = "flow-state behavior check";
~~~

### Surface

- Installed `flow-state` binary follows exact grammar, typed gateway, bounded v2 artifact, Story-executor
  parity, immutable envelopes, stdout/stderr, exit/signal, atomic-file, and truncation laws in `CLI.md`.

### Rule

- `behavior check` is the only new leaf beyond retained behavior/Story/trace families. Model paths are
  programmatic. Schemas represent app Stories, exact actor evidence, `run.end`, module ownership,
  compound states, context requirements, lifecycle records, and operation identities before promotion.

### Accepts

- Registered behavior and typed artifacts only.

### Rejects

- Arbitrary payload-bearing event JSON, old Scenario/local-proof compatibility input, batch Story execution,
  or another history/runner owner.

### Observable guarantee

- CLI execution preserves the production Story/evidence owner and exact artifact boundary.

### Proof

- CLI grammar, gateway, parity, artifact, signal, exit, atomic-file, and truncation proofs.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-017`; exact laws: `CLI.md`.

## Public proof obligations

The following union is schematic local proof-index notation and is not a required public export.

~~~ts
type PublicProof = "API-P01" | "API-P02" | "API-P03" | "API-P04";
~~~

### API-P01 — Export-map and deletion proof

Packed-package tests MUST assert the exact public routes and root runtime-value list, reject private deep
imports, and prove absence of deleted child, registered-view, automatic-root/dynamic-actor, generic
operation-ref/activity-kit, and old Story constructor/command surfaces. Non-root routes cannot import root
builders, and ordinary actor handles and refs cannot recover owner-lease disposal authority.
Root `Implementation` MUST be a runtime value whose own exported members are exactly `succeed`, `effect`, and
`merge`; the same root declaration MUST also expose the public `Implementation` type. No alias, secondary route,
or private deep route may expose either constructor access or another provider-graph authority.

### API-P02 — Grammar and inference proof

Positive and negative compile fixtures MUST cover recursive states through depth ten, exact default paths,
compound handlers, exact leaf matching, `actions`, `onContext`, `onMemory`, `P`/`K`, named `O` families,
actor refs and leases, exact context bindings, four lifecycle states, passive `useView`, all three Story
constructors, exact Story targets, `process`, `advanceTo`, checkpoints, and model restrictions.

### API-P03 — Production semantic proof

Runtime tests MUST prove inert descriptor/key/passive reads, canonical identity bounds, atomic event/action
publication, runtime-scoped resource sharing, generation fencing, actor-owned cancellation, context graph
bootstrap, lease disposal and tombstones, prepared/active/suspended/disposed lifecycle, Story production
parity, Implementation-backed operation outcomes, evidence cuts, and CLI refusal of arbitrary event fabrication.
The historical `BEH-*` register and its accepted `REV-*` closures remain outside this public API contract;
this file MUST NOT invent a public surface to satisfy a proof obligation.

### API-P04 — Redacted trace-share export proof

Production-path tests MUST prove that omitted and empty policies return byte-identical WIRE-020B output;
non-empty policies emit only the WIRE-020C `trace-share-artifact` envelope; every manifest path exists,
targets an application-owned carrier, and resolves to `"[REDACTED]"`; manifest order and bytes are deterministic;
the live decoded model, runtime truth, persisted record, raw artifact, identity, fingerprint, sequence, ordering,
truncation, diagnostics, outcome, failure, and cleanup remain unchanged; invalid, duplicate, overlapping, missing,
or structural paths reject as `InvalidArtifactOperand`; and `importTraceArtifact` rejects share output as
`WrongArtifactKind` before raw-envelope member or identity validation. No share importer, CLI input, replay,
persistence, boot, or evidence-authority route exists.

### Rule

- Historical `BEH-*` and accepted `REV-*` closures are not public API and cannot justify inventing a surface.

### Accepts

- Named executable proof owners for each obligation.

### Rejects

- Source-text/type checks presented as behavior proof, or proof satisfaction by adding uncontracted API.

### Observable guarantee

- Public contract and proof ownership remain separate from implementation readiness.

### Proof

- The three obligations above, plus their named focused and broad gates.

### Trace

- Provenance: `provenance/PUBLIC_API.md#API-P01`–`API-P03`.
