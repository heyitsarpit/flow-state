# Core runtime API resolution proposal

Status: proposal only. Scope: CS-01, CS-02, and CS-08.

Current resolution overlay: `RuntimeSetup` replaces the user-facing `RuntimeFactory` term, and
`Implementation` is the provider boundary. The exact construction/readiness, operation grammar, and
diagnostic choices remain in the archived [GRILL_REQUIRED_DECISIONS.md](./GRILL_REQUIRED_DECISIONS.md). This proposal's
`RuntimeFactory` signatures are candidate notation, not accepted API.

This proposal resolves the missing core consumer surface around runtime
discovery/construction, operation authoring, family-specific P/K and outcome
types, and public failure envelopes. It does not define simulation, fixtures,
CLI commands, persistence formats, React bindings, or the Todo implementation.

The accepted revisions remain the semantic authority. The recommendations
below make currently schematic or unspecified signatures concrete. A requested
contract amendment is called out explicitly; it is not treated as accepted by
this file.

## 1. Recommendation

Change `runtime({ ... })` into a pure, inert `RuntimeFactory<App>` constructor.
The factory exposes synchronous discovery and an Effectful construction
boundary:

```ts
const factory = runtime({ app, layer, boot });

const discovery = factory.discover();       // synchronous, inert
const live = await Effect.runPromise(factory.construct()); // owned runtime
```

`runtime` itself does not acquire a Layer, create an actor, start a fiber,
allocate a mailbox, or return a live handle. `construct` performs the complete
bootstrap transaction and returns a usable `Runtime` only after activation. A
failed construction returns no partial runtime, actor, lease, or public
registry.

This is the smallest surface that gives live hosts and Stories the same typed
bootstrap authority while making discovery observable and testable. It also
prevents a direct `Runtime` value from being mistaken for a factory that has
not yet validated its boot input or installed its providers.

## 2. Contract position

### Accepted now

The following decisions are already required by the contracts and accepted
revisions and are used here without semantic change:

- App and operation definitions are plain, closed, synchronous, and inert.
- `App.M` is the closed machine set. There are no automatic roots, dynamic
  machines, generic operation registries, old operation references, or old
  story execution APIs.
- P is a complete executable parameter value. K is an ordered readonly
  canonical tuple. `key(P)` is pure and canonicalizes before admission,
  mutation, ownership, or external work.
- Named resource, transaction, and stream families own their own P/K and
  outcome types. Listing and plan construction are inert.
- A runtime owns the application Layer, actor Scopes, mailboxes, operation
  state, fibers, and finalizers. An actor lease owns one shared actor claim;
  runtime disposal subsumes remaining leases.
- Typed operation failure, defect, and interruption stay distinct. Planned
  cancellation/release/supersession does not create a mapped interrupt event.
- Complete `Cause` values are private runtime facts. Only
  `FlowDisposeError` and `FlowStoryExecutionError` may carry the installed
  Effect `Cause.Cause<unknown>` publicly. Serialized diagnostics use the
  private `CauseProjection` boundary.
- Disposal is asynchronous, idempotent, terminal, and cached. Cleanup failure
  is reported rather than silently discarded.

### Contract amendment required

The following text is needed before implementation can claim contract closure:

1. Add the `RuntimeFactory<App, LayerError>` type, `RuntimeDiscovery<App>`,
   initial-claim shape, and the `construct` return contract to API-002/API-012
   and TYPE-010. Change the currently schematic `runtime` return from an
   already-created runtime to the factory specified here.
2. Add exact generic declarations for `resource`, `transaction`, and `stream`,
   including descriptor policy fields, operation callback requirements, and
   the typed outcome/writes option grammar in API-005/API-006 and
   REV-OPS-005. The support aliases below are explanatory names for that
   amendment; they need not all become root exports.
3. Add `FlowUsageError` and complete the stable diagnostic code/detail table
   for runtime admission, operation-plan misuse, and canonical-key failures.
   Complete the field-presence rules for `FlowBootDecodeError`,
   `FlowDehydrateError`, `FlowDisposeError`, and `FlowStoryExecutionError` in
   API-002/API-012 and WIRE-020B. Do not export the private diagnostic union
   or `CauseProjection`.

Everything else in this proposal is an implementation choice constrained by
the accepted laws above.

## 3. RuntimeFactory and runtime ownership (CS-01)

### 3.1 Public signatures

The following are the recommended consumer-facing declarations. `AppDefinition`,
`RequirementsOf`, `RuntimeBootPayload`, `Machine`, `ActorRef`, `Actor`, and
the existing named errors retain their contract meanings.

```ts
export type RuntimeConstructionHost = Readonly<{
  /** Optional deterministic clock; no arbitrary application Layer is accepted here. */
  readonly clock?: Clock.Clock;
}>;

export type RuntimeDiscovery<App extends AppDefinition<unknown>> = Readonly<{
  readonly app: App;
  readonly boot: RuntimeBootPayload<App> | undefined;
  readonly initialActors: readonly InitialActorClaimOf<App>[];
}>;

export type InitialActorClaim<M extends Machine> = Readonly<{
  readonly ref: ActorRef<M>;
  readonly input: InputOf<M>;
  readonly contextBindings?: ContextBindingsOf<M>;
}>;

export type ActorLease<M extends Machine> = Readonly<{
  readonly actor: Actor<M>;
  readonly dispose: () => Promise<void>;
}>;

export type RuntimeFactory<
  App extends AppDefinition<unknown>,
  LayerError = never,
> = Readonly<{
  readonly discover: () => RuntimeDiscovery<App>;
  readonly construct: (
    host?: RuntimeConstructionHost,
  ) => Effect.Effect<
    Runtime<App, LayerError>,
    FlowBootDecodeError | FlowUsageError | FlowDisposeError | LayerError,
    never
  >;
}>;

export declare function runtime<App extends AppDefinition<never>>(options: {
  readonly app: App;
  readonly boot?: RuntimeBootPayload<App>;
  readonly initialActors?: readonly InitialActorClaimOf<App>[];
}): RuntimeFactory<App, never>;

export declare function runtime<
  App extends AppDefinition<unknown>,
  LayerError,
>(options: {
  readonly app: App;
  readonly layer: Layer.Layer<RequirementsOf<App>, LayerError, never>;
  readonly boot?: RuntimeBootPayload<App>;
  readonly initialActors?: readonly InitialActorClaimOf<App>[];
}): RuntimeFactory<App, LayerError>;

export declare function withRequestRuntime<
  App extends AppDefinition<unknown>,
  LayerError,
  A,
  E,
>(
  factory: RuntimeFactory<App, LayerError>,
  use: (runtime: Runtime<App, LayerError>) => Effect.Effect<A, E, never>,
  host?: RuntimeConstructionHost,
): Effect.Effect<
  A,
  FlowBootDecodeError | FlowUsageError | FlowDisposeError | LayerError | E,
  never
>;
```

`InitialActorClaimOf<App>` is a distributive, package-defined union over
`App.M` that preserves the correlation between a machine, its `ActorRef`, and
its `InputOf`. It must not be widened to `{ ref: ActorRef<Machine>; input:
unknown }`. The helper can remain non-exported if the declaration emits the
inferred union correctly.

The runtime handle keeps the accepted actor and Effect bridge surface and
adds no public phase or `ManagedRuntime`:

```ts
export type Runtime<App extends AppDefinition<unknown>, LayerError> = Readonly<{
  readonly ensureActor: <M extends App["M"]>(
    ref: ActorRef<M>,
    options: Readonly<{
      readonly input: InputOf<M>;
      readonly contextBindings?: ContextBindingsOf<M>;
    }>,
  ) => ActorLease<M>;

  readonly createActor: <M extends App["M"]>(
    machine: M,
    options: Readonly<{
      readonly input: InputOf<M>;
      readonly contextBindings?: ContextBindingsOf<M>;
    }>,
  ) => ActorLease<M>;

  readonly getActor: <M extends App["M"]>(
    ref: ActorRef<M>,
  ) => Actor<M> | undefined;

  readonly runPromise: <A, E, R extends RequirementsOf<App>>(
    effect: Effect.Effect<A, E, R>,
  ) => Promise<A>;

  readonly runPromiseExit: <A, E, R extends RequirementsOf<App>>(
    effect: Effect.Effect<A, E, R>,
  ) => Promise<Exit.Exit<A, E | LayerError>>;

  readonly dehydrate: () => Effect.Effect<
    RuntimeBootPayload<App>,
    FlowDehydrateError,
    never
  >;

  readonly dispose: () => Promise<void>;
}>;
```

The actor methods are intentionally synchronous after construction. `send`
enqueues a typed event into the actor's production mailbox and returns `void`.
`ensureActor` returns a lease only after the complete admission transaction
has succeeded. `getActor` is lookup-only and never creates, starts, or grants
disposal authority. `createActor` creates a fresh local actor with no stable
application identity.

### 3.2 Discovery and construction ownership

Discovery owns only an immutable description:

- `app` is the closed AppPlan identity.
- `boot` is already decoded or absent.
- `initialActors` is an immutable claim list.

Discovery does not expose the captured Layer, Clock, service instances,
ManagedRuntime, Scope, actor cells, mailboxes, operation stores, fibers, or
leases. The factory may retain those inputs in its closure, but the discovery
value cannot be used to acquire them.

Construction owns the following transaction, in order:

1. Validate the boot payload, App identity, initial machine/ref/input
   correlations, duplicate claims, context bindings, provider graph, and
   operation descriptors.
2. Acquire the application Layer and create the one internal
   `ManagedRuntime`; install Flow-owned scopes and finalizers.
3. Install initial actor claims without exposing them.
4. Run factory ensures and resolve context providers.
5. Seal the graph and activate mailboxes, fibers, and operation admission.
6. Return the `Runtime` handle.

The internal phase sequence is `constructed -> booting -> ready`, with
`failed` and `disposed` terminal branches. It is not a public runtime field.
Any failure or interruption before step 6 rolls back in reverse acquisition
order. A rollback cleanup failure is reported as a `FlowDisposeError` with
`scope: "runtime"`; the primary bootstrap failure remains identifiable in its
diagnostic fields and the complete Cause is retained on that error only.

`withRequestRuntime` constructs one runtime, runs `use`, and disposes it on
success, typed failure, defect, or interruption. It does not reuse a runtime
across requests and does not expose its internal Scope. If request work and
cleanup both fail, the primary request Cause and ordered cleanup diagnostics
follow the accepted `FlowDisposeError`/Cause rules.

`RequirementsOf<App>` contains application requirements, not the internal
Flow-owned `Scope`. The supplied Layer must be closed (`R = never`). The
factory's `construct` effect therefore has `R = never`; callers do not need to
manage a second Scope or a competing top-level runtime.

### 3.3 Runtime failure behavior

- `decodeRuntimeBoot(App, unknown, options)` remains the only parser for
  unknown boot data and throws `FlowBootDecodeError` synchronously. Its public
  envelope contains no raw Cause.
- Invalid graph, foreign ref, wrong machine/input, duplicate claim, invalid
  canonical value, missing provider, or provider cycle fails construction with
  `FlowUsageError` before actor handles or external work escape.
- Layer acquisition failure remains the supplied `LayerError` in the
  construction Effect error channel. It is not converted into a domain
  operation failure or hidden inside a string message.
- Construction interruption follows the accepted interruption rules. If
  cleanup succeeds, the caller observes interruption; if cleanup fails, the
  caller observes `FlowDisposeError` with ordered cleanup diagnostics.
- After disposal, actor admission and lookup fail deterministically with an
  immutable `FlowUsageError` carrying `RuntimeDisposed` or `DisposedActorRef`.
  A second `dispose()` returns the cached successful completion or the cached
  cleanup failure; it does not run finalizers twice.

### 3.4 Rejected alternatives

- **Direct `runtime()` -> live `Runtime`:** rejected because discovery would
  acquire resources and would not be the same bootstrap authority used by
  Stories. It also makes construction failure and partial ownership ambiguous.
- **A callable factory (`factory(host)`) with hidden discovery:** rejected
  because discovery is a required inert proof surface and a callable value
  makes accidental construction easier to confuse with ordinary data.
- **A public `ManagedRuntime` or `Scope`:** rejected because it creates a
  second ownership model and leaks implementation lifetime mechanics.
- **A global actor registry or automatic root discovery:** rejected by the
  deletion ledger and because it defeats App.M closure and deterministic
  ownership.
- **An arbitrary host Layer argument to `construct`:** rejected because it
  bypasses the factory's captured application requirements and makes
  ownership/provider provenance unverifiable. The host argument is limited to
  deterministic Clock substitution.

### 3.5 Interactions

- CS-02 plans are admitted only after construction seals the operation graph;
  a plan cannot execute against a discovery value.
- CS-08 supplies the stable envelopes for construction, admission, and
  disposal failures. Layer errors remain typed separately.
- API-013 Stories receive this same `RuntimeFactory<App>` and invoke the same
  bootstrap path. Fixture/TestClock composition is outside this proposal.
- Persistence boot/dehydrate uses the same App identity and diagnostic rules;
  its artifact projection remains private and is not the in-process runtime
  type.

## 4. Descriptor and operation-plan authoring (CS-02)

### 4.1 Descriptor grammar

The public authoring functions infer P, K, A/V, E, and R from the callbacks.
The following support aliases describe the exact shapes; implementation may
inline them in declarations.

```ts
export type OperationExecutionOptions = Readonly<{
  readonly signal: AbortSignal;
}>;

export declare function resource<
  const Id extends string,
  P,
  const K extends readonly CanonicalKeyInput[],
  A,
  E,
  R,
>(config: Readonly<{
  readonly id: Id;
  readonly key: (params: P) => K;
  readonly lookup: (
    params: P,
    options: OperationExecutionOptions,
  ) => Effect.Effect<A, E, R>;
  readonly staleTime: Duration.Input;
  readonly gcTime: Duration.Input;
}>): Resource<Id, P, K, A, E, R>;

export declare function resource<
  const Id extends string,
  P,
  const K extends readonly CanonicalKeyInput[],
  A,
  E,
  R,
>(config: Readonly<{
  readonly id: Id;
  readonly key: (params: P) => K;
  readonly lookup: (
    params: P,
    options: OperationExecutionOptions,
  ) => Effect.Effect<A, E, R>;
  readonly subscribe: (
    params: P,
    options: OperationExecutionOptions,
  ) => Stream.Stream<A, E, R>;
  readonly staleTime: Duration.Input;
  readonly gcTime: Duration.Input;
}>): Resource<Id, P, K, A, E, R>;

export declare function transaction<
  const Id extends string,
  P,
  const K extends readonly CanonicalKeyInput[],
  A,
  E,
  R,
>(config: Readonly<{
  readonly id: Id;
  readonly key: (params: P) => K;
  readonly commit: (
    params: P,
    options: OperationExecutionOptions,
  ) => Effect.Effect<A, E, R>;
  readonly concurrency: "reject" | "cancel" | "allow" | "serialize";
}>): Transaction<Id, P, K, A, E, R>;

export declare function stream<
  const Id extends string,
  P,
  const K extends readonly CanonicalKeyInput[],
  V,
  E,
  R,
>(config: Readonly<{
  readonly id: Id;
  readonly key: (params: P) => K;
  readonly subscribe: (
    params: P,
    options: OperationExecutionOptions,
  ) => Stream.Stream<V, E, R>;
}>): StreamDescriptor<Id, P, K, V, E, R>;
```

The two resource overloads are deliberate: a finite-only resource does not
pretend to support a remote continuation. A resource's `subscribe` family
method is present only when its descriptor carries the second callback. There
are no omitted policy defaults; `staleTime` and `gcTime` are explicit on every
resource descriptor. A descriptor callback receives P and the abort signal;
the public plan does not expose an Effect, `Cause`, fiber, or signal.

`key` must be synchronous and deterministic. The returned K is copied/frozen
by the Flow boundary before it becomes an identity. Invalid values, mutable
containers, non-canonical numbers, symbols, functions, and unsupported object
graphs fail with `InvalidCanonicalValue` before cache mutation, ownership, or
adapter invocation. P may contain clients and functions because P is an
executable input; those values never become identity.

### 4.2 Family-specific plans and outcomes

The following are the exact option grammars to infer against the current
machine's `EventOf<M>`. They are not a generic `Record<string, unknown>`.

```ts
type FiniteOutcome<A, E, Event> = Readonly<{
  readonly success?: (value: A) => Event;
  readonly failure?: (error: E) => Event;
  readonly defect?: () => Event;
  readonly interrupt?: () => Event;
}>;

type ResourceContinuationOutcome<A, E, Event> = Readonly<{
  readonly value?: (value: A) => Event;
  readonly failure?: (error: E) => Event;
  readonly defect?: () => Event;
  readonly interrupt?: () => Event;
}>;

type StreamOutcome<V, E, Event> = Readonly<{
  readonly value?: (value: V) => Event;
  readonly complete?: () => Event;
  readonly failure?: (error: E) => Event;
  readonly defect?: () => Event;
  readonly interrupt?: () => Event;
}>;

type CacheWrite<A, K extends readonly unknown[]> = Readonly<{
  readonly key: K;
  readonly value: A | ((current: A | undefined) => A | undefined);
}>;

type ResourceOperations<P, K extends readonly unknown[], A, E, Event> = Readonly<{
  readonly key: (params: P) => K;
  readonly getData: (key: K) => A | undefined;
  readonly getState: (key: K) => ResourceState<A, E, K>;
  readonly lookup: (
    params: P,
    options: Readonly<{
      readonly outcomes: FiniteOutcome<A, E, Event>;
    }>,
  ) => FiniteResourceOperationPlan;
  readonly refetch: (
    params: P,
    options: Readonly<{
      readonly outcomes: FiniteOutcome<A, E, Event>;
    }>,
  ) => FiniteResourceOperationPlan;
  readonly setData: (
    key: K,
    value: A | ((current: A | undefined) => A | undefined),
  ) => CacheWritePlan;
  readonly cancel: (key: K) => CancellationPlan;
}>;

type TransactionOperations<P, K extends readonly unknown[], A, E, Event> = Readonly<{
  readonly key: (params: P) => K;
  readonly getState: (key: K) => TransactionState<A, E, K>;
  readonly commit: (
    params: P,
    options: Readonly<{
      readonly writes?: (input: Readonly<{ readonly value: A }>) =>
        readonly CacheWritePlan[];
      readonly outcomes: FiniteOutcome<A, E, Event>;
    }>,
  ) => TransactionCommitPlan;
  readonly cancel: (key: K) => CancellationPlan;
}>;

type StreamOperations<P, K extends readonly unknown[], V, E, Event> = Readonly<{
  readonly key: (params: P) => K;
  readonly getState: (key: K) => StreamState<V, E, K>;
  readonly subscribe: (
    params: P,
    options: Readonly<{
      readonly outcomes: StreamOutcome<V, E, Event>;
    }>,
  ) => ContinuingOperationPlan;
}>;
```

The operation-plan types above are opaque, branded, readonly package types.
Their P/K and descriptor identity remain private live binding facts. A plan
can be returned only from an accepted action/activity/onMemory callback. It
cannot be executed by a consumer, converted between families, serialized, or
constructed from an object literal.

Action return inference is:

```ts
type ActionResult<M extends Machine> =
  | PlanOf<M>
  | readonly PlanOf<M>[]
  | null;

// Empty arrays are also accepted as the no-plan result.
type Action = (...args: never[]) => ActionResult<CurrentMachine>;
```

Finite operations are valid from event handlers. Continuing resource and
stream operations are valid only from the accepted continuing declaration
locations (`activities`/`onMemory`, as applicable to the machine contract).
There is one plan per continuing declaration, not a runtime-sized array of
continuations. Action batches validate all plans and keys before admitting any
one of them; there is no valid prefix when a later plan is invalid.

A successful transaction applies declared cache writes before mapping the
success event. A result never becomes canonical implicitly. `writes` may return
only cache-write plans from the same operation catalogue; it cannot return a
transaction plan, arbitrary event, or foreign descriptor.

The mapper receives only its declared value or typed error. Defect and
interrupt callbacks receive no `Cause`, state, lifecycle, generation, or
internal occurrence. The runtime classifies the full Effect Exit privately as
defect, typed failure, or interruption before selecting the mapper.

### 4.3 Plan ownership and failure behavior

- The immutable AppPlan owns descriptor identity and policy.
- The machine operation catalogue owns the family-specific plan brands.
- The runtime owns admitted P, canonical K, generation, abort controller,
  fiber, and result state. A shared resource store pins the executable P for a
  descriptor/K generation; K is never used to reconstruct P.
- The actor mailbox owns the decision to admit a plan. The adapter owns only
  its external request and receives an AbortSignal controlled by the runtime.
- `key`, passive reads, and plan construction have no acquisition, mutation,
  freshness, ownership, or external-work effects.
- A typed adapter failure is an operation outcome and may map to a typed event.
  A defect is a defect outcome. An interrupt is an interrupt outcome.
  Planned release/cancel/supersession has no mapped interrupt event.
- A forged/foreign plan, wrong family, invalid K, invalid action location,
  duplicate continuing declaration, or plan used after its actor/runtime is
  disposed fails with `FlowUsageError` before adapter work.

### 4.4 Rejected alternatives

- **P equals K:** rejected because clients/functions are valid executable
  inputs but invalid identity values, and because K cannot reconstruct the
  request input needed by an adapter.
- **Generic operation registry/ref:** rejected by the deletion ledger and
  because it erases named family P/K/outcome inference.
- **`options: Record<string, unknown>`:** rejected because it permits wrong
  family options, loses mapper event inference, and makes negative proofs
  impossible.
- **Public `plan.run()` or public Effect-valued plans:** rejected because
  mailbox admission, generation, cancellation, and actor ownership must stay
  in the production kernel.
- **Implicit failure/defect/interrupt mapping:** rejected because it hides
  distinct outcome lanes and makes typed state/event proofs incomplete.
- **Implicit cache writes from every result:** rejected because API-008
  requires explicit writes before mapped outcomes.
- **Compatibility overloads for deleted APIs:** rejected by the hard-delete
  revision; there are no aliases or adapters.

### 4.5 Interactions

- CS-01 construction seals the catalogue and installs the requirements used
  by descriptor callbacks. `R` is honest at authoring time and closed by the
  factory Layer at construction time.
- CS-08 errors distinguish authoring/admission misuse from adapter E and from
  internal defect/interruption. A domain `E` is never reclassified as a
  `FlowUsageError`.
- State unions are the public observation of operation outcomes; snapshots do
  not contain raw Causes. Runtime generation and cancellation facts remain
  private except where a contract explicitly names a state field.

## 5. Public error and diagnostic envelopes (CS-08)

### 5.1 Stable public shape

The recommendation is one small public usage error plus complete fields on the
four already-named errors. The private WIRE diagnostic hierarchy remains
private.

```ts
export type FlowPath = readonly (string | number)[];

type FlowUsageCode =
  | "InvalidCanonicalValue"
  | "ForeignActorRef"
  | "MismatchedActorRef"
  | "MissingActorRef"
  | "DisposedActorRef"
  | "RuntimeNotReady"
  | "RuntimeDisposed"
  | "MissingContextProvider"
  | "ContextDependencyCycle"
  | "DuplicateActorClaim"
  | "UnadmittedMachine"
  | "ActorNotActive"
  | "InvalidOperationPlan"
  | "WrongOperationKind"
  | "OperationNotPending"
  | "OperationAlreadySettled"
  | "DuplicateStreamDeclaration"
  | "BlockedByDependents";

export declare class FlowUsageError extends Error {
  readonly _tag: "FlowUsageError";
  readonly code: FlowUsageCode;
  readonly path: FlowPath;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}

export declare class FlowBootDecodeError extends Error {
  readonly _tag: "FlowBootDecodeError";
  readonly code: "MalformedJson" | "InvalidCanonicalValue" | "ArtifactIncompatible";
  readonly path: FlowPath;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}

export declare class FlowDehydrateError extends Error {
  readonly _tag: "FlowDehydrateError";
  readonly code: "ConcurrentDehydrate" | "NonDurableContextProvider";
  readonly path: FlowPath;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}

export declare class FlowDisposeError extends Error {
  readonly _tag: "FlowDisposeError";
  readonly scope: "actor" | "runtime";
  readonly code: "CleanupFailed" | "BlockedByDependents";
  readonly path: FlowPath;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
  readonly cleanup: readonly FlowCleanupDiagnostic[];
  readonly cause: Cause.Cause<unknown>;
}

export declare class FlowStoryExecutionError extends Error {
  readonly _tag: "FlowStoryExecutionError";
  readonly phase: "command" | "checkpoint" | "cleanup";
  readonly commandIndex: number | null;
  readonly completedCheckpoints: readonly string[];
  readonly end: string | null;
  readonly primary: FlowStoryDiagnostic;
  readonly cleanup: readonly FlowCleanupDiagnostic[];
  readonly cancellation: FlowCancellationEvidence | null;
  readonly evidence: FlowStoryEvidence | null;
  readonly cause: Cause.Cause<unknown>;
}
```

The final declaration should use discriminated, closed detail types rather
than the shorthand `Record` shown above. The shorthand makes the envelope
readable here; the amendment must list the allowed fields for every code.
Unknown keys are rejected. Every envelope is immutable and deeply frozen.
Fields that are not applicable are present as `null`, not inconsistently
omitted. Paths are stable relative paths such as
`["app", "modules", 0, "machines", "editor"]` or
`["operation", "todo.todos", "key", 0]`.

### 5.2 Required code/detail table

| Code | Owner | Required stable details | Failure boundary |
| --- | --- | --- | --- |
| `InvalidCanonicalValue` | key/boot decoder | `reason`, `valueKind`; exact `path` | Before mutation or adapter work |
| `ForeignActorRef` | runtime admission | `expectedAppId`, `actualAppId`, `machineId` | No lease/actor escape |
| `MismatchedActorRef` | runtime admission | `expectedMachineId`, `actualMachineId` | No lookup or admission |
| `MissingActorRef` | runtime lookup | `machineId`, `stableId` | Lookup returns no actor or throws per API method contract; never creates |
| `DisposedActorRef` | lease/runtime | `machineId`, `stableId` | Send/admission rejected |
| `RuntimeNotReady` | construction race | `requestedOperation`, `internalPhase` | No public live handle; phase is diagnostic only |
| `RuntimeDisposed` | runtime | `scope` | All new work rejected |
| `MissingContextProvider` | graph/admission | `consumerRef`, `contextKey`, `providerMachineId` | Bootstrap/ensure rolls back |
| `ContextDependencyCycle` | graph validation | ordered `refs` path | Bootstrap/ensure rolls back |
| `DuplicateActorClaim` | bootstrap/ensure | `ref` | No partial actor set |
| `UnadmittedMachine` | runtime admission | `machineId`, `appId` | No actor/plan admission |
| `ActorNotActive` | actor lifecycle | `lifecycle` | Send/continuing work rejected |
| `InvalidOperationPlan` | plan admission | `kind`, `descriptorId` | No valid prefix and no adapter work |
| `WrongOperationKind` | family boundary | `expectedKind`, `actualKind`, `descriptorId` | Plan rejected before work |
| `OperationNotPending` | cancellation | `descriptorId`, canonical `key` | No state mutation |
| `OperationAlreadySettled` | outcome delivery | `descriptorId`, canonical `key` | Late completion ignored or reported according to operation contract; never double-commits |
| `DuplicateStreamDeclaration` | continuing declarations | `descriptorId`, canonical `key` | No second stream admitted |
| `BlockedByDependents` | actor disposal | `actorRef`, dependent refs/paths | Lease remains owned; cleanup is not falsely reported complete |
| `ConcurrentDehydrate` | dehydration | `runtimeId`, active operation count | `retryable: true`; no partial boot payload |
| `NonDurableContextProvider` | dehydration | consumer/provider IDs and failing binding paths | `retryable: false`; no partial boot payload |
| `CleanupFailed` | disposal | ordered cleanup diagnostic IDs and failed owner | `FlowDisposeError` or story cleanup evidence |

The existing WIRE-020B codes remain normative for command, gateway, artifact,
story, I/O, interruption, and invariant boundaries. This proposal adds only
the missing core runtime/operation/dehydrate codes above. It does not export
the WIRE `Diagnostic` union or make artifact `CauseProjection` an in-process
runtime field.

### 5.3 Failure classification

The following distinctions are mandatory:

- A descriptor's declared `E` is typed domain failure and is delivered through
  the family outcome/state grammar.
- An Effect defect is classified as defect. A defect mapper is zero-argument;
  its raw defect is retained only in private runtime evidence or the two
  explicitly permitted raw-Cause errors.
- Interruption is classified separately from defect and typed failure. Its
  mapper is zero-argument. Planned cancellation, release, and supersession
  do not invoke it as a user event.
- Invalid keys, foreign references, wrong-kind plans, disposed ownership, and
  graph failures are Flow usage/boot errors. They are not domain E values.
- Layer acquisition errors remain `LayerError` in the factory construction
  Effect. `runPromiseExit` reports `E | LayerError` for application Effects.
- A cleanup failure is not converted into a successful disposal result. The
  error carries ordered cleanup facts and the complete Cause where the named
  contract permits it.

### 5.4 Rejected alternatives

- **Raw `Error` plus message:** rejected because callers cannot reliably branch
  on code, path, ownership, or retryability.
- **One universal public diagnostic hierarchy:** rejected because it would
  export artifact/story internals and the private CauseProjection model.
- **Squash every failure into Flow error:** rejected because LayerError and
  domain E are typed contracts, not usage failures.
- **Expose raw `Cause` on all errors:** rejected by API-002 and the snapshot /
  serialization boundary.
- **Optional fields with ad hoc omission:** rejected because consumers cannot
  distinguish absent data from an inapplicable field and deterministic proof
  becomes structural rather than semantic.
- **JSON-shaped errors as the runtime API:** rejected because in-process
  disposal and Story errors must preserve complete Cause values while
  serialized artifacts must project them.

### 5.5 Interactions

- CS-01 owns boot, graph, provider, actor-ref, lease, and runtime-disposal
  errors.
- CS-02 owns canonical-key, plan-kind, operation-admission, and late-outcome
  errors. Domain E and operation outcome state remain separate.
- Story execution may reuse the same diagnostic codes but adds its accepted
  checkpoint, command, cancellation, evidence, and ordered-cleanup fields.
- Persistence/CLI may serialize a private projection of these diagnostics;
  the proposal does not add a public artifact type or CLI command.

## 6. Complete minimal Todo consumer path

This example is intentionally one vertical path. It shows the recommended
consumer surface, including the typed failure/defect/interruption lanes and
disposal. The exact `definition`/`machine` callback names follow the existing
contract examples; no legacy API is used.

```ts
import { Context, Effect, Layer, Schema, Stream } from "effect";
import {
  actorRef,
  app,
  definition,
  machine,
  module,
  resource,
  runtime,
  transaction,
  type RuntimeFactory,
} from "flow-state";

class Todo extends Schema.Class<Todo>("Todo")({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Boolean,
}) {}

class TodoGatewayError extends Schema.TaggedError<TodoGatewayError>()(
  "TodoGatewayError",
  {
    operation: Schema.Literal("list", "add"),
    reason: Schema.Literal("unavailable", "duplicate-title"),
  },
) {}

type TodoGatewayService = {
  readonly list: (
    listId: string,
    options: Readonly<{ readonly signal: AbortSignal }>,
  ) => Effect.Effect<readonly Todo[], TodoGatewayError>;
  readonly add: (
    listId: string,
    title: string,
    options: Readonly<{ readonly signal: AbortSignal }>,
  ) => Effect.Effect<Todo, TodoGatewayError>;
};

class TodoGateway extends Context.Tag("todo/TodoGateway")<
  TodoGateway,
  TodoGatewayService
>() {}

type TodoInput = Readonly<{ readonly listId: string }>;
type AddTodoInput = Readonly<{ readonly listId: string; readonly title: string }>;

const todos = resource({
  id: "todo.todos",
  key: ({ listId }: TodoInput) => [listId] as const,
  lookup: ({ listId }, { signal }) =>
    TodoGateway.use((gateway) => gateway.list(listId, { signal })),
  staleTime: "0 seconds",
  gcTime: "5 minutes",
});

const addTodo = transaction({
  id: "todo.add",
  key: ({ listId }: AddTodoInput) => [listId] as const,
  commit: ({ listId, title }, { signal }) =>
    TodoGateway.use((gateway) => gateway.add(listId, title, { signal })),
  concurrency: "reject",
});

const TodoDefinition = definition({
  id: "Todo/Editor",
  states: ["EMPTY", "LOADING", "READY", "SAVING", "ERROR"] as const,
  events: {
    LoadRequested: Schema.Void,
    ListLoaded: Schema.Array(Todo),
    ListLoadFailed: TodoGatewayError,
    ListDefected: Schema.Void,
    ListInterrupted: Schema.Void,
    AddRequested: Schema.String,
    TodoAdded: Todo,
    AddFailed: TodoGatewayError,
    AddDefected: Schema.Void,
    AddInterrupted: Schema.Void,
    RetryRequested: Schema.Void,
  },
  memory: ({ input }: Readonly<{ readonly input: TodoInput }>) => ({
    listId: input.listId,
    todos: [] as readonly Todo[],
    error: undefined as TodoGatewayError | undefined,
  }),
  operations: { todos, addTodo },
});

const todoMachine = machine(TodoDefinition, ({ S, E, O }) => ({
  initial: S.EMPTY,
  states: {
    [S.EMPTY]: {
      on: {
        LoadRequested: {
          target: S.LOADING,
          actions: ({ memory }) => [
            O.todos.lookup(
              { listId: memory.listId },
              {
                outcomes: {
                  success: (value) => E.ListLoaded(value),
                  failure: (error) => E.ListLoadFailed(error),
                  defect: () => E.ListDefected(),
                  interrupt: () => E.ListInterrupted(),
                },
              },
            ),
          ],
        },
      },
    },
    [S.LOADING]: {
      on: {
        ListLoaded: {
          target: S.READY,
          updateMemory: ({ event }) => ({ todos: event }),
        },
        ListLoadFailed: {
          target: S.ERROR,
          updateMemory: ({ event }) => ({ error: event }),
        },
        ListDefected: { target: S.ERROR },
        ListInterrupted: { target: S.ERROR },
      },
    },
    [S.READY]: {
      on: {
        AddRequested: {
          target: S.SAVING,
          actions: ({ event, memory }) => [
            O.addTodo.commit(
              { listId: memory.listId, title: event },
              {
                outcomes: {
                  success: (value) => E.TodoAdded(value),
                  failure: (error) => E.AddFailed(error),
                  defect: () => E.AddDefected(),
                  interrupt: () => E.AddInterrupted(),
                },
                writes: ({ value }) => [
                  O.todos.setData([memory.listId], (current) => [
                    ...(current ?? []),
                    value,
                  ]),
                ],
              },
            ),
          ],
        },
      },
    },
    [S.SAVING]: {
      on: {
        TodoAdded: {
          target: S.READY,
          updateMemory: ({ event, memory }) => ({
            todos: [...memory.todos, event],
            error: undefined,
          }),
        },
        AddFailed: {
          target: S.ERROR,
          updateMemory: ({ event }) => ({ error: event }),
        },
        AddDefected: { target: S.ERROR },
        AddInterrupted: { target: S.ERROR },
      },
    },
    [S.ERROR]: {
      on: {
        RetryRequested: { target: S.EMPTY },
      },
    },
  },
}));

const TodoModule = module({
  id: "todo",
  machines: { editor: todoMachine },
});

const TodoApp = app({
  id: "todo-app",
  persistenceVersion: "1",
  modules: [TodoModule],
});

const TodoLayer = (gateway: TodoGatewayService) =>
  Layer.succeed(TodoGateway, TodoGateway.of(gateway));

export const makeTodoRuntimeFactory = (
  gateway: TodoGatewayService,
): RuntimeFactory<typeof TodoApp, never> =>
  runtime({
    app: TodoApp,
    layer: TodoLayer(gateway),
  });

export const startTodo = async (gateway: TodoGatewayService) => {
  const factory = makeTodoRuntimeFactory(gateway);
  const discovery = factory.discover();
  // discovery.app is TodoApp; discovery has no actor, Layer, or live handle.

  const runtime = await Effect.runPromise(factory.construct());
  const primary = actorRef(todoMachine, "primary-editor");
  const lease = runtime.ensureActor(primary, {
    input: { listId: "inbox" },
  });

  lease.actor.send(TodoDefinition.E.LoadRequested());
  // list failure maps to ListLoadFailed(TodoGatewayError).
  // defect maps to ListDefected(); interruption maps to ListInterrupted().

  await lease.dispose();
  await lease.dispose(); // idempotent; the cached result is reused.

  await runtime.dispose();
  await runtime.dispose(); // idempotent and terminal.

  return { discovery, runtime };
};
```

After `lease.dispose()`, a send through the disposed actor is rejected with
`FlowUsageError`/`DisposedActorRef`; it does not enqueue work. If runtime
disposal has to stop an outstanding operation, its interruption is internal
cleanup evidence, not an automatically mapped `ListInterrupted` or
`AddInterrupted` event. If a finalizer fails, `dispose()` rejects with
`FlowDisposeError` and its ordered cleanup diagnostics.

The example intentionally uses an explicit transaction write. The gateway
result does not update `O.todos` unless the `writes` callback declares that
write, and the write is applied before `TodoAdded` is mapped.

## 7. Proof matrix

All proofs are deterministic and must run against the production construction
path. Type-only proofs must include both positive and negative cases; runtime
proofs must assert the absence of work, not only the final state.

| Proof | Contract obligation | Positive proof | Negative/failure proof | Deterministic mechanism |
| --- | --- | --- | --- | --- |
| `CORE-TYPE-01` | P/K and app inference | `resource` infers `P`, readonly tuple K, A, E, R; `transaction` and `stream` infer their own families; `RuntimeFactory<typeof TodoApp, never>` accepts the Todo factory | Wrong P, wrong K, foreign machine ref, and wrong `Layer` requirement fail `tsc`; no `unknown` widening | `tsc --noEmit` consumer fixtures with `@ts-expect-error` |
| `CORE-TYPE-02` | Event mapper inference | `success`, `failure`, `defect`, `interrupt`, `complete`, and `writes` infer only `EventOf<M>` and correct A/E | Resource mapper cannot return an event from another machine; transaction options cannot be passed to a stream; writes cannot return a transaction plan | Positive/negative compile fixtures |
| `CORE-RUNTIME-01` | Discovery is inert | `runtime()` and `factory.discover()` return synchronously with app/boot/claims | Spied Layer acquisition, service constructor, actor creation, mailbox, adapter, and Clock show zero calls before `construct` | Synchronous spies plus a `Deferred` acquisition latch |
| `CORE-RUNTIME-02` | Bootstrap order and ownership | `construct` acquires the supplied Layer, installs claims, runs ensures, seals, then exposes a ready runtime | Invalid boot, duplicate claim, missing provider, cycle, wrong input/ref, Layer failure, and interruption expose no actor/lease/runtime and perform reverse cleanup | Ordered event log, `Effect.Exit`, `Deferred`, finalizer counters |
| `CORE-RUNTIME-03` | App.M closed world | Initial/ensure/create accept only machines in `App.M`; stable refs share one actor and local creation is fresh | Dynamic/foreign machine, automatic root, second registry, or `getActor`-as-creation attempt is rejected/absent | Compile fixtures plus actor identity assertions |
| `CORE-OPS-01` | Passive API and inert plans | `key`, `getData`, `getState`, descriptor construction, action plan construction, and empty actions perform no work | An unreturned plan, forged plan, or plan from a passive read does not invoke an adapter or mutate state | Adapter call counter and state snapshot before/after |
| `CORE-OPS-02` | Canonical K admission | Valid P yields one frozen ordered K; repeated canonicalization is stable; P retains executable client/function data privately | Invalid object graph, mutable key, unsupported value, wrong tuple, or foreign K fails before mutation/work | Frozen-value checks, counter, and deterministic `FlowUsageError` code/path |
| `CORE-OPS-03` | Atomic action batches | A valid finite action and explicit transaction writes commit in order; writes precede mapped success event | Invalid later plan admits no earlier prefix; duplicate stream, wrong family, and invalid declaration do no adapter work | One mailbox turn, ordered trace, `Deferred` adapter |
| `CORE-OPS-04` | Outcome lanes | Todo typed failure maps to `ListLoadFailed`/`AddFailed`; defect and interruption map to separate zero-arg events; stream complete is distinct | Mapper cannot inspect Cause; planned cancel/release does not create interrupt event; late completion cannot double-commit | `Effect.exit`, injected defect, `Deferred` interruption, generation/cancel trace |
| `CORE-ERROR-01` | Stable public envelopes | Every named error has stable tag/code/path/details and correct nullable field presence; values are deeply frozen | Unknown diagnostic code/detail, missing required field, mutable array, or raw Cause on the wrong error is rejected by type/structural proof | Exact object assertions and `Object.isFrozen` recursion |
| `CORE-ERROR-02` | Cause boundary | `FlowDisposeError` and `FlowStoryExecutionError` retain complete Cause; boot/dehydrate/usage errors do not | Snapshots and artifact-facing projections contain no Cause; domain E is not wrapped as Flow usage error | Cause with nested parallel/sequential failures and serialized projection assertion |
| `CORE-CLEANUP-01` | Lease/runtime ownership | Lease disposal releases one claim; runtime disposal releases remaining actors, operation fibers, scopes, and Layer exactly once | Double lease/runtime disposal does not double-finalize; blocked dependents produce `BlockedByDependents`; cleanup failure rejects with ordered diagnostics | `acquireRelease`, finalizer counters, cached Promise, deterministic failure finalizer |
| `CORE-TODO-01` | Minimal consumer path | Definition -> machine -> resource/transaction -> app -> factory -> discovery -> construct -> lease -> send reaches typed loading/saving paths | Gateway typed failure, defect, interruption, invalid send after disposal, and failed cleanup produce the specified lanes/envelopes | Production runtime, TestClock/Deferred, no sleeps, explicit state/event trace |

## 8. Implementation boundary

Keep these parts plain TypeScript:

- definition, machine, module, and app construction;
- descriptor IDs, P/K functions, canonicalization, deep freezing, and graph
  validation;
- operation-plan brands and static action-location validation;
- state unions, snapshots, event mapping, and deterministic projections;
- AppPlan discovery and all passive family methods.

Use Effect only for runtime-owned coordination and lifetimes:

- `Context.Service` for application capabilities and `Layer` for the closed
  application requirement graph;
- one internal `ManagedRuntime` and Flow-owned `Scope`/`acquireRelease` for
  Layer, actor, operation, and finalizer ownership;
- one mailbox `Queue` per actor, `SubscriptionRef` for current observable
  state, and fibers for admitted operation work;
- `Effect.try`/`Effect.tryPromise` at callback adapters;
- `Effect.exit` and one shared Cause classifier for success, typed failure,
  defect, and interruption;
- deterministic TestClock/Deferred-based proof infrastructure.

`Scope`, `ManagedRuntime`, Queue, Fiber, AbortController, Cause, generation,
and operation-store cells are not public consumer types. The runtime shell may
coordinate these objects, but it does not create a competing top-level
ownership system.

## 9. Decision checklist

Before implementation begins, accept or amend only these contract points:

1. `runtime` returns the inert `RuntimeFactory`; `construct` returns the ready
   runtime Effect with `R = never`.
2. `RuntimeDiscovery` exposes only app, decoded boot, and initial claims.
3. Descriptor generics and family outcome/writes options use the exact P/K/A/E/R
   grammar above, with explicit resource policies and no legacy overloads.
4. `FlowUsageError` and the stable code/detail/field-presence table are added;
   raw Cause remains limited to the two named errors.
5. The proof matrix is a release gate for CS-01/02/08, with the Todo vertical
   path as the minimum consumer proof.

No other blocker or package surface is resolved by this proposal.
