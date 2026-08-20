# Host, persistence, and inspection resolution proposal

Status: proposal-only design pass. No implementation or contract edit is included.

Scope: CS-05, CS-06, CS-07, and CS-10 from PRESERVATION_AUDIT.md.

Current resolution overlay: retain one request-owned production Runtime, opaque app-branded boot/artifact
carriers, one private codec/model owner, and one bounded evidence sink. Exact public carriers and lifecycle
signatures remain in the archived [GRILL_REQUIRED_DECISIONS.md](./GRILL_REQUIRED_DECISIONS.md); candidate RuntimeFactory,
Layer, and carrier spellings below are not accepted API.

The proposal closes the four assigned public boundaries while preserving the accepted rules in
REV-COMP-005, REV-COMP-015, REV-OPS-015, REV-HOST-001 through REV-HOST-008, REV-MIG-005,
WIRE-003 through WIRE-024, API-012, API-016, HOST-012 through HOST-016, and TYPE-010 through
TYPE-011. The v2 wire model, TurnRecord, AppPlan, ManagedRuntime, Scope, and runtime service tags
remain package-private.

## 1. Resolution at a glance

| Blocker | Recommended resolution | Public boundary | Sole owner |
| --- | --- | --- | --- |
| CS-05 | Decode Flow structure first, then call one synchronous application decoder for every opaque domain slot in canonical path order. | decodeRuntimeBoot(app, unknown, { decodeDomain }) -> RuntimeBootPayload<App> | The application owns opaque values; Flow owns structural validation and the boot brand. |
| CS-06 | Make request execution a callback-scoped host adapter. It creates one production runtime, waits for its private readiness barrier, invokes the callback once, and disposes that runtime in all exits. | withRequestRuntime(factory, options, use) -> Promise<A> | The request adapter owns the runtime; React owns only attachment suspension. |
| CS-07 | Make inspection a projection of one runtime-global evidence hub and one explicitly installed bounded sink. | createInspectionBufferSink, attachInspectionSink, pure projection and formatter functions | The runtime owns evidence admission; each sink owns only its bounded retained window. |
| CS-10 | Use app-branded immutable boot carriers and opaque canonical artifact carriers. Keep decoded v2 artifacts private and share one codec path between Story and CLI. | TraceArtifactText, CompressedTraceArtifact, importTraceArtifact, exportTraceArtifact | Flow owns envelope validation/encoding; the application owns opaque domain encode/decode. |

This proposal makes no second runtime, second history, public artifact schema, mutable hydration API,
manual operation subscription API, or replay API.

### Contract decisions versus implementation choices

| Contract decision | Replaceable implementation choice |
| --- | --- |
| The public calls, brands, export routes, ownership, lifecycle meanings, failure lanes, no-replay rules, and exact persistence/inspection bounds described below. | One private `FlowRuntimeShell` backed by one `ManagedRuntime`, one runtime-global evidence hub, and one private readiness barrier. |
| `withRequestRuntime` owns one request runtime and returns only the callback result; React owns attachment suspension; owner leases/runtime own terminal disposal. | `Queue`, `Deferred`, `Effect.forkScoped`, `Effect.acquireRelease`, and `TestClock` orchestration used to implement those lifetimes. |
| Boot and artifact carriers are immutable/opaque at the public boundary; application values cross only through `DecodeDomain`/`EncodeDomain`. | The private v2 decoded model, canonical walker, gzip library, projection cache, and internal locator representation. |
| Inspection is bounded observation, not a second history; projections cannot invent runtime facts. | Ring-buffer layout, sink worker scheduling, and formatter-specific intermediate structures. |

Changing a left-column item requires contract review. Changing a right-column item is allowed only when
the same public behavior, deterministic proof, ownership, and failure classification remain true.

## 2. Shared public vocabulary and boundaries

The following TypeScript is proposal notation for the exact shapes. Names marked public are exported only
from the route that owns them when a consumer needs to name them. Private aliases are implementation
notation and must not appear in declaration output.

~~~ts
import type { Effect, Exit, Layer } from "effect";

type PathSegment = string | number;
type CanonicalCarrier =
  | null
  | string
  | boolean
  | number
  | readonly CanonicalCarrier[]
  | { readonly [key: string]: CanonicalCarrier };

type DomainSlot =
  | {
      readonly source: "boot" | "trace";
      readonly kind: "memory";
      readonly path: readonly PathSegment[];
      readonly machineId: string;
      readonly actorRef: string;
      readonly value: unknown;
    }
  | {
      readonly source: "boot" | "trace";
      readonly kind: "resource-value" | "resource-error";
      readonly path: readonly PathSegment[];
      readonly descriptorId: string;
      readonly key: readonly CanonicalCarrier[];
      readonly value: unknown;
    }
  | {
      readonly source: "boot" | "trace";
      readonly kind: "transaction-value" | "transaction-error" | "stream-value" | "event-payload";
      readonly path: readonly PathSegment[];
      readonly machineId: string;
      readonly descriptorId: string;
      readonly key: readonly CanonicalCarrier[] | null;
      readonly value: unknown;
    };

type DecodeDomain = (slot: DomainSlot) => unknown;
type EncodeDomain = (slot: DomainSlot) => CanonicalCarrier;
~~~

DomainSlot is a discriminator, not a generic operation registry. It never contains executable P,
callbacks, Effects, fibers, queues, scopes, actor handles, or runtime references. key is already a
Flow-owned, validated, frozen K; the application decoder never receives an opportunity to redefine
operation identity.

The application decoder's return value is application-owned. It must be a value accepted by the receiving
app and stable for the lifetime of the boot cut. Flow freezes its own carrier containers and does not
claim ownership of an application class, client, or domain object. EncodeDomain is required only when a
public artifact projection contains an opaque value that must cross the canonical JSON boundary; it must
return the bounded CanonicalCarrier form. The application therefore owns domain immutability and domain
encoding, while Flow owns carrier validation.

### Branded values

- `RuntimeBootPayload<App>` is declared as an opaque package brand:

~~~ts
declare const RuntimeBootPayloadBrand: unique symbol;
type RuntimeBootPayload<App> = Readonly<{
  readonly [RuntimeBootPayloadBrand]: App;
}>;
~~~

The brand symbol and payload fields are not exported. The runtime can consume only a value created by the
receiving app's decoder or by that app's `dehydrate()` implementation.

- ActorRef<M> is an immutable, opaque, machine-branded identity. A stable ref has durable identity; an
  opaque local ref cannot enter boot, dehydration, artifacts, or CLI selectors.
- RuntimeBootPayload<App> is an immutable, opaque, app-branded in-process carrier. Consumers can pass a
  value returned by decodeRuntimeBoot or runtime.dehydrate() to the same app's runtime, but cannot
  construct it with an object literal or pass it to another app.
- CanonicalKeyInput is the existing Flow-owned frozen K container. It is not executable input and does
  not reconstruct P.
- InspectionSnapshot, TraceProjection, and BehaviorContractProjection are deeply frozen public
  projections. They are not TurnRecord, ActorState, AppPlan, or the v2 decoded model.
- TraceArtifactText is an opaque branded canonical UTF-8 string with exactly one trailing newline.
  It is immutable and serializable as text. Its brand is not a promise that arbitrary strings are valid.
- CompressedTraceArtifact is an opaque immutable byte carrier returned by Flow. Its implementation may
  expose a defensive Uint8Array copy internally, but the public value exposes no mutable byte array and
  is not a JSON artifact. File and HTTP adapters convert it at the host edge.

No public carrier exposes ManagedRuntime, Scope, a live fiber, a queue, an Effect, raw Cause, or a
decoded v2 envelope. FlowDisposeError and FlowStoryExecutionError remain the only public in-process
boundaries that retain the complete installed Cause.Cause<unknown>.

## 3. CS-05 — Application-owned boot decoding

### Decision

decodeRuntimeBoot remains synchronous. Flow first validates the unknown input using the receiving app's
structural boot rules. It then walks every opaque slot in canonical path order and calls the supplied
application decoder exactly once for each slot. Flow builds the branded payload only after all structural
and domain slots succeed.

The public call is:

~~~ts
function decodeRuntimeBoot<App>(
  app: App,
  input: unknown,
  options: {
    readonly decodeDomain: DecodeDomain;
  },
): RuntimeBootPayload<App>;
~~~

Consumer example:

~~~ts
const boot = decodeRuntimeBoot(IncidentApp, storedBoot, {
  decodeDomain: (slot) => {
    if (slot.kind === "memory" && slot.machineId === "Incident") {
      return IncidentMemoryCodec.decode(slot.value);
    }

    if (slot.kind === "resource-value" && slot.descriptorId === "incident") {
      return IncidentCodec.decode(slot.value);
    }

    return DomainCodecs.decodeFor(slot);
  },
});

const flowRuntime = runtime({
  app: IncidentApp,
  layer: IncidentLive,
  boot,
});
~~~

The callback receives the Flow-validated locator, not an arbitrary path and not a mutable boot object.
The walk is deterministic: envelope root, actor identity, state/memory, store entries, operation facts,
and remaining opaque fields in the canonical encoded order. A decoder failure stops the walk; later slots
are not visited and no runtime is constructed.

### Failure behavior

FlowBootDecodeError is a frozen package-owned error for Flow-owned failures. The proposal closes its
stable public facts as:

~~~ts
type BootDecodeKind =
  | "MalformedInput"
  | "StructuralBoundExceeded"
  | "UnsupportedVersion"
  | "AppIdentityMismatch"
  | "ArtifactIncompatible"
  | "InvalidCanonicalValue"
  | "ApplicationDomain";

class FlowBootDecodeError extends Error {
  readonly _tag = "FlowBootDecodeError" as const;
  readonly kind: BootDecodeKind;
  readonly path: readonly PathSegment[];
  readonly retryable: false;
  readonly applicationCause: unknown | null;
}
~~~

applicationCause is populated only for ApplicationDomain and preserves the application error as a
foreign value; Flow does not reinterpret it as malformed JSON or identity failure. It does not contain
an Effect Cause. Structural failures include the exact path and, for a bound failure, the limit and
actual measurement. Unknown fields, duplicate keys, accessors, sparse arrays, cycles, reserved prototype
keys, unsupported prototypes, lone surrogates, non-finite numbers, negative zero, invalid counters,
foreign refs, and opaque local refs are rejected before the application callback can see them.

The decoder must not catch arbitrary application exceptions and turn them into MalformedInput. The
implementation catches only its own structural failure sentinel; an application exception is rethrown as
the applicationCause of the package-owned domain boundary. This preserves the distinction while keeping
the public host boundary deterministic.

RuntimeBootPayload<App> is accepted only by the matching app. runtime({ app: OtherApp, boot }) is a
type error when the brands are visible and a synchronous AppIdentityMismatch when an untrusted value has
crossed JavaScript or declaration boundaries.

### Ownership and Effect decision

**IF** the operation is synchronous structural decoding, canonical walking, app validation, or immutable
carrier construction, **THEN** keep it plain TypeScript with A = RuntimeBootPayload<App>, expected
failures represented by the package error at the synchronous host boundary, and R = never.

**BECAUSE** adding Effect would not provide lifetime, cancellation, concurrency, or dependency injection;
it would also encourage asynchronous domain decoding even though boot must be validated before runtime
acquisition.

**CHECK** a decoder that throws on the second canonical slot must leave no acquired Layer, actor, owner
lease, context edge, lifecycle record, operation, or external work.

The application Layer.Layer<RequirementsOf<App>, LayerError, never> is acquired only by runtime() after
the branded payload exists. The runtime's private ManagedRuntime owns the internal Scope.Scope; no scope is
included in RuntimeBootPayload, DecodeDomain, or public R. Hydration uses the same production bootstrap
and not a separate hydrateBoot Effect.

### Hydration carrier and no-replay rule

runtime.dehydrate() is the only public dehydration operation:

~~~ts
interface Runtime<App, LayerError> {
  dehydrate(): Promise<RuntimeBootPayload<App>>;
  dispose(): Promise<void>;
}
~~~

The result captures every registered, non-disposed durable stable actor and the transitive stable provider
closure. It includes exact bindings and provider revisions. It excludes local actors, tombstones,
disposed actors, selected context duplicates, queues, fibers, scopes, finite commands, running transport,
stream emission history, and executable P.

Hydration installs the canonical store, restores providers before consumers, evaluates context selectors
from provider snapshots, installs the derived values as the silent baseline, drains pending outcomes, and
only then reconciles live continuing declarations. It never reruns the fresh memory initializer, replays a
finite operation, emits an onContext event for the baseline, or replays a stream emission. A restored
nonterminal transaction becomes unknown/reconciliation-required; a stream needs live executable P for a
new generation and fails closed when that input is unavailable.

FlowDehydrateError has two distinct assigned failure lanes:

~~~ts
type DehydrateKind = "ConcurrentDehydrate" | "NonDurableContextProvider" | "DehydrateInvariant";

class FlowDehydrateError extends Error {
  readonly _tag = "FlowDehydrateError" as const;
  readonly kind: DehydrateKind;
  readonly retryable: boolean;
  readonly consumerId: string | null;
  readonly providerId: string | null;
  readonly providerMachineId: string | null;
  readonly bindingPaths: readonly string[];
}
~~~

ConcurrentDehydrate is retryable and contains no partial payload. NonDurableContextProvider is terminal
for that attempt, is not repaired by promoting or recreating the local provider, and identifies every
failing contextBindings.<key> path. Disposing the consumer or replacing it with a stable-provider binding
is the host remedy. A failed capture returns no boot payload.

### Rejected alternatives

- **input as RuntimeBootPayload<App>:** rejected because it bypasses app identity, structural bounds,
  domain validation, and malformed-input failure before actor admission.
- **A generic decodeDomain(value: unknown): unknown without a locator:** rejected because the app could
  not distinguish memory from resource, transaction, stream, or event payloads without re-parsing Flow's
  private schema.
- **Flow-owned schemas for domain values:** rejected because Flow cannot know application invariants or
  migration policy and would become a competing application codec.
- **Async Effect decoders:** rejected because boot must be synchronous and no Layer, Scope, actor, or
  external work may be acquired before the domain boundary closes.
- **Mutable hydrateBoot or serialized selected context:** rejected by REV-COMP-005, WIRE-004, and
  WIRE-010; derived context must have one provider-owned source of truth.

### Proof obligations

1. Pure decoder vectors prove canonical callback order, one callback per slot, stable paths, app identity,
   all structural bounds, duplicate-key rejection, hostile reflection rejection, and distinction between
   Flow structural and application-domain failures.
2. A production bootstrap proof proves decoder failure occurs before Layer acquisition, actor admission,
   lifecycle evidence, owner leases, and external work.
3. A hydration proof covers fresh, restored, suspended, disposed, local, and tombstoned membership;
   transitive stable-provider closure; factory omission of a restored actor; dependency order; restored
   provider revision checks; and ConcurrentDehydrate retry.
4. A no-replay proof asserts the memory initializer, onContext, finite adapter, stream emission, and
   transaction retry are each invoked zero times during restoration.
5. A type proof rejects a boot payload from another app and rejects a hand-built structural object even
   when its fields look correct.

## 4. CS-06 — Request runtime and SSR ownership

### Decision

withRequestRuntime is a callback-scoped adapter. It accepts an already decoded boot payload, never accepts
unknown, and does not make React or the application callback responsible for disposal.

The narrow factory handoff required by this blocker is:

~~~ts
type RuntimeFactory<App, LayerError> = Readonly<{
  readonly app: App;
  readonly create: (options: {
    readonly boot?: RuntimeBootPayload<App>;
  }) => Runtime<App, LayerError>;
}>;

function withRequestRuntime<App, LayerError, A>(
  factory: RuntimeFactory<App, LayerError>,
  options: {
    readonly boot?: RuntimeBootPayload<App>;
    readonly signal?: AbortSignal;
  },
  use: (runtime: Runtime<App, LayerError>) => A | PromiseLike<A>,
): Promise<A>;
~~~

RuntimeFactory construction is inert. factory.app is identity only. factory.create closes over the
request's application Layer and private initial actor claims; calling it creates one runtime shell and
starts one production bootstrap. A request object, cookies, headers, or database transaction are not
Flow options: they stay in the application-owned Layer closure or in the callback's ordinary lexical
scope.

Consumer example:

~~~tsx
const requestFactory: RuntimeFactory<typeof IncidentApp, IncidentLayerError> = {
  app: IncidentApp,
  create: ({ boot }) =>
    runtime({
      app: IncidentApp,
      layer: makeIncidentRequestLayer(request),
      boot,
    }),
};

const responseBody = await withRequestRuntime(
  requestFactory,
  { boot: decodedBoot, signal: request.signal },
  async (flowRuntime) =>
    renderToString(
      <FlowProvider runtime={flowRuntime}>
        <IncidentAppView />
      </FlowProvider>,
    ),
);
~~~

The callback may pass the runtime to FlowProvider, create and attach actors through the production
runtime, call runPromise/runPromiseExit, and call dehydrate() before it resolves. It must not call
runtime.dispose(); the adapter owns that authority and disposal remains idempotent if a lower-level
failure has already closed admission. A later public refinement may narrow the callback view, but this
proposal keeps the existing Runtime type so FlowProvider runtime={flowRuntime} remains source-faithful.

The callback result is the request result, not a runtime or owner lease. A streaming SSR adapter must keep
the callback Promise open until the response's runtime-dependent work is complete; returning a stream whose
producer still reads the runtime after use resolves is invalid. This rule prevents premature disposal
without adding a stream-specific Flow API.

### Exact ownership sequence

1. The host decodes unknown storage with decodeRuntimeBoot before calling this adapter.
2. withRequestRuntime verifies the factory app and boot brand, then calls factory.create exactly once.
3. The helper awaits the private runtime readiness barrier. No callback or prepared actor escapes before
   graph sealing, Layer availability, provider resolution, and activation prerequisites.
4. The helper invokes use once with the same production runtime used by browser hosts and Stories.
5. It awaits the callback result, closes request command admission, and runs non-abortable production
   disposal. It drains accepted lifecycle and TurnRecord evidence before closing sinks and queues.
6. It resolves the callback result only if disposal succeeds. A cleanup failure rejects and never returns a
   successful request result.

The runtime is isolated per request and is not placed in a module singleton, React state, or a shared browser
runtime. FlowProvider receives only the already-created runtime and never acquires, constructs, or disposes
it. React cleanup suspends local actors; request/runtime disposal is the terminal runtime owner.

### Failure and cancellation behavior

- A pre-aborted signal prevents factory.create and use; no Layer, actor, scope, queue, or evidence is
  acquired.
- A signal during bootstrap or use interrupts request-owned Effect work, closes admission, and waits for
  production finalization. The host Promise rejects with the signal's interruption failure at the outer
  boundary; it never resolves a partial response.
- A FlowBootDecodeError is thrown before this adapter when the host decodes storage. A Layer acquisition
  failure remains the LayerError in the runtime readiness/runPromiseExit lane and is the primary rejected
  request failure when the adapter must produce a Promise.
- A callback rejection remains the primary callback failure when cleanup succeeds. If cleanup also fails,
  the adapter rejects with the frozen FlowDisposeError shape (`_tag`, complete cleanup `cause`, and
  `scope: "runtime"`); callback and cleanup diagnostics retain deterministic ordering internally without
  widening that public error shape, and the adapter never returns a response.
- A successful callback followed by failed disposal rejects with FlowDisposeError and retains no usable
  request result. This matches the accepted Story rule that successful work implies completed cleanup.
- Repeated signal delivery, callback-finally disposal, and repeated runtime disposal all join one cached
  terminal cleanup; finalizers run once.

### Effect and host decision

**IF** a host must run many Effects against one request runtime and own cancellation and cleanup, **THEN**
construct one ManagedRuntime inside the request's production bootstrap, attach all actor/activity work to
its Scope.Scope, and release it through one Effect.acquireRelease/Effect.scoped owner.

**BECAUSE** the request is the lifetime boundary. A per-render runtime would duplicate stores and leases;
detached fibers would outlive the request and make disposal unobservable.

**CHECK** abort during Layer acquisition, actor activation, callback rendering, sink drain, and finalizer
execution. Use Deferred barriers to force each interleaving; never use a sleep.

**IF** a callback crosses into a Promise, React renderer, or HTTP response, **THEN** translate once in
withRequestRuntime; domain services retain their A, E, and R until that edge.

**IF** an application Layer is required, **THEN** require
Layer.Layer<RequirementsOf<App>, LayerError, never> and keep Scope.Scope supplied by Flow's private
runtime Layer. **BECAUSE** the public runtime has no unsatisfied R, and Layer failures remain visible as
LayerError rather than being asserted away.

**IF** React renders an actor, **THEN** prepare one final inert actor with a real bounded mailbox and attach
that same actor during commit. **BECAUSE** the accepted host lifecycle prohibits shell-and-swap and
abandoned renders must leave no registration or disposal obligation.

### Exact React public signatures and private lifecycle boundary

These are the public call shapes. `ActorHandleOf`, `ActorViewContextOf`, `InputOptionsOf`, and
`ContextBindingOptionsOf` below name existing inferred contract types; they are not additional exports.

~~~ts
type UseActorOptionsOf<M> =
  InputOptionsOf<M> & ContextBindingOptionsOf<M>;

function useActor<M>(
  machine: M,
  options?: UseActorOptionsOf<M>,
): ActorHandleOf<M>;

function useActorByRef<M>(ref: ActorRef<M>): ActorHandleOf<M>;

function useView<M, Selected>(
  actor: ActorHandleOf<M>,
  selector: (view: ActorViewContextOf<M>) => Selected,
): Selected;

function FlowProvider<App, LayerError>(props: {
  readonly runtime: Runtime<App, LayerError>;
  readonly children: React.ReactNode;
}): React.ReactElement;
~~~

`useActor` requires exact fresh `input` and declared `contextBindings` through the inferred option type;
it accepts no stable ID. `useActorByRef` is synchronous lookup-only and returns no owner lease. `useView`
accepts one exact handle, no machine family, ref, or comparator; its selector receives the atomic passive
context described by HOST-011. The hooks are command-only except for `useView`'s internal reactive lease.

The following lifecycle object is package-private and is not a public hook return value:

~~~ts
interface HostAttachment<M> {
  readonly actor: ActorHandleOf<M>;
  readonly attach: Effect<void, HostAttachError, RuntimeServices>;
  readonly suspend: Effect<void, HostSuspendError, RuntimeServices>;
  readonly resume: Effect<void, HostResumeError, RuntimeServices>;
}
~~~

Render creates the final prepared actor/ref/handle and a 64-entry command mailbox without registration,
scope, subscription, evidence, or external work. Commit rechecks provider identity/revisions, installs
the current context baseline, activates that same actor, and drains commands once. React effect cleanup
calls `suspend`; it never calls `dispose`. Suspension immediately closes command admission, releases
active scopes/subscriptions/timers, and preserves ref, handle, memory, context baseline, cursors, and
absolute deadlines. Resume reacquires production resources and reconciles current providers without
replaying input, initial memory, finite work, streams, or `onContext`. Runtime/owner disposal is the only
terminal path. `HostAttachment` and all `Host*Error` types remain private so React cannot acquire a
second runtime or gain terminal-disposal authority.

### Rejected alternatives

- **Return Runtime from withRequestRuntime:** rejected because callers could retain a live runtime after
  the helper's lifetime and ownership would be ambiguous.
- **Return { runtime, dispose } to SSR:** rejected because it duplicates owner-lease semantics at the
  request boundary and makes early disposal easy to forget.
- **Let FlowProvider construct or dispose the runtime:** rejected by HOST-001, HOST-013, and ARCH-018;
  React owns attachment, not runtime state or terminal cleanup.
- **Create a runtime per render or per hook:** rejected because it duplicates ManagedRuntime, stores,
  context graphs, evidence sequence ownership, and scopes.
- **Use the old public shell and swap it during commit:** rejected by REV-HOST-002; it cannot guarantee
  final ref/handle identity or truthful abandoned-render cleanup.
- **Call public runPromise from inside an Effect service:** rejected because it leaves one runtime and
  re-enters another host boundary. The adapter translates only at the outer host edge.

### Proof obligations

1. Inert-factory and request-isolation proofs show no acquisition, actor, scope, registration, or evidence
   at factory discovery and no sharing between two requests.
2. Bootstrap proofs force missing providers, foreign refs, duplicate refs, cycles, Layer failure,
   cancellation, and disposal races before handle escape; all rollback is reverse ordered and leaves no
   partial public snapshot or lifecycle record.
3. SSR proofs cover 64 prepared commands, same actor/ref/handle through attachment, stale provisional
   context replacement, abandoned render closure, no actor:prepare, and no work after abandonment.
4. Lifecycle proofs cover prepared -> active -> suspended -> active -> disposed, command rejection while
   suspended, release of scopes/timers/subscriptions, absolute timer deadlines, no finite replay, and
   cleanup defects blocking resume.
5. Host tests force pre-abort, abort during bootstrap, abort during render, callback failure, cleanup
   failure, and repeated disposal with Deferred, Exit, and TestClock; no test uses wall-clock timing.

## 5. CS-07 — Inspection and trace projections

### Decision

There is one runtime-global evidence hub. It accepts immutable TurnRecord and LifecycleRecord payloads
after actor publication. Public inspection sees only an immutable projection. A sink is opt-in and bounded;
runtime observation does not imply persistence.

The public sink shapes are:

~~~ts
type InspectionSnapshot = Readonly<{
  readonly records: readonly InspectionRecord[];
  readonly truncatedBeforeSequence: number | null;
}>;

type InspectionBufferSink = Readonly<{
  snapshot(): InspectionSnapshot;
  clear(): void;
}>;

type InspectionAttachment = Readonly<{
  drain(): Promise<void>;
  dispose(): Promise<void>;
}>;

function createInspectionBufferSink(options?: {
  readonly capacity?: number;
}): InspectionBufferSink;

function attachInspectionSink<App, LayerError>(
  runtime: Runtime<App, LayerError>,
  sink: InspectionBufferSink,
): InspectionAttachment;
~~~

capacity defaults to 256 and must be a non-negative safe integer. 0 observes records but retains none.
snapshot() is a frozen stable copy; clear() advances the truncation marker through the current retained
tail and never resets the runtime-global sequence. A sink attaches once to one runtime. The sink does not
expose subscribe, setRetention, includeHistory, a callback serializer, or a second mutable trace log.

Consumer example:

~~~ts
const sink = createInspectionBufferSink({ capacity: 256 });
const attachment = attachInspectionSink(flowRuntime, sink);

const beforeDrain = sink.snapshot();
await attachment.drain();
const completeWindow = sink.snapshot();

if (completeWindow.truncatedBeforeSequence !== null) {
  throw new Error("trace history was truncated");
}

await attachment.dispose();
await attachment.dispose(); // same cached completion; no second detachment
~~~

InspectionRecord is a public immutable projection, not the private TurnRecord or LifecycleRecord. It exposes
enough stable data for the named inspection projections, but no runtime owner, queue, Scope, fiber,
callback, or mutable actor state. Lifecycle records carry the published to snapshot, so a listener reading
the actor after receiving actor:suspend, actor:resume, or actor:dispose observes the event's target
lifecycle. actor:prepare is never emitted. Lifecycle records share the runtime-global sequence allocator
and are not machine turns.

### Exact pure inspection signatures

The following signatures keep projection input explicit and prevent arbitrary snapshots from being treated
as history:

~~~ts
type TraceSource<App> = Readonly<{
  readonly app: App;
  readonly storyId: string;
  readonly inspection: InspectionSnapshot;
  readonly evidence: TraceEvidence;
}>;

function analyzeTrace<App>(source: TraceSource<App>): TraceProjection<App>;
function buildBehaviorContract<App>(app: App): BehaviorContractProjection<App>;
function diffTrace(
  left: TraceProjection<unknown>,
  right: TraceProjection<unknown>,
): TraceDiffProjection;
function diffBehaviorContracts(
  left: BehaviorContractProjection<unknown>,
  right: BehaviorContractProjection<unknown>,
): BehaviorDiffProjection;
~~~

TraceEvidence is the frozen Story evidence projection supplied by the production Story result: ordered
checkpoints, end: Checkpoint | null, outcome, failure evidence, cleanup status, and accepted/drained
sequence facts. It is not a callback or runtime object. A source with an incomplete retained window remains
incomplete; analyzeTrace does not invent dropped records. diffTrace preserves complete: false when either
side is truncated, while still returning deterministic section differences.

The remaining inspect route functions are one-input pure projections over these exact result values:

~~~ts
formatInspectionEvent(record: InspectionRecord): string;
formatInspectionTimeline(source: TraceProjection<unknown>): string;
formatTrace(source: TraceProjection<unknown>): string;
summarizeTrace(source: TraceProjection<unknown>): TraceSummaryProjection;
graphOf<AppOrMachine>(appOrMachine: AppOrMachine): GraphProjection<AppOrMachine>;
sliceBehaviorContract(
  contract: BehaviorContractProjection<unknown>,
  selector: string,
): BehaviorContractProjection<unknown>;
renderBehaviorContract(contract: BehaviorContractProjection<unknown>): string;
renderBehaviorCoverage(contract: BehaviorContractProjection<unknown>): string;
renderBehaviorDiff(diff: BehaviorDiffProjection): string;
~~~

graphOf accepts only inert app/machine values at its actual generic boundary; unknown above is shorthand
for the corresponding inferred overload, not a public assertion escape. Transition inspection functions
accept immutable definitions/snapshots and report planning facts only. They cannot report actual starts,
generations, finalizers, or pending outcomes unless those facts came from the runtime evidence source.

### Effect and sink ownership decision

**IF** a caller asks for a bounded current window or a pure graph/formatting projection, **THEN** keep the
public operation plain TypeScript with R = never; the public sink facade exposes synchronous immutable
reads and the pure functions return frozen values.

**BECAUSE** no service, cancellation, or resource lifetime is needed for construction, comparison, or
formatting.

**IF** a sink is attached to a live runtime, **THEN** use an internal bounded Queue plus one runtime-owned
Effect.forkScoped consumer, with an attachment Scope and a cached Deferred for ordered drain/dispose.

**BECAUSE** evidence delivery is asynchronous behind the release gate, must not block actor acknowledgment
or StoreFanout, and must stop deterministically at runtime disposal.

**CHECK** sink failure detaches only that sink, does not roll back committed state, preserves the failure
for drain/dispose, and leaves other sinks active. A slow sink may delay runtime disposal but never actor
acknowledgment or StoreFanout.

The internal attachment Effect retains truthful A/E/R: success is an attachment or drained prefix,
expected sink failure is E, and R is the runtime evidence service plus Scope. The public Promise adapter
translates once at the inspect/host edge. No sink gets a detached fiber; runtime Scope owns it.

### Failure behavior and bounds

- Synchronous misuse—negative/non-integer capacity, second attachment, another runtime, reattachment after
  disposal, or attachment of a foreign sink—throws a package-owned inspection error before mutation.
- snapshot() before attachment is { records: [], truncatedBeforeSequence: null }.
- A late attachment that did not observe the earlier prefix sets the marker to the runtime hub's current
  sequence, or leaves it null only when the sequence is zero.
- Eviction and clear() advance truncatedBeforeSequence; they never silently claim complete history.
- drain() waits only through the highest accepted sequence captured at its call. It does not wait for future
  records.
- Runtime disposal opens the gate for every already-linearized terminal lifecycle record, drains accepted
  evidence, stops admission, detaches sinks, and then closes queues and the ManagedRuntime. It does not
  create a synthetic terminal TurnRecord.

### Rejected alternatives

- **Unbounded runtime history:** rejected because it makes retention an accidental persistence API and has
  no bounded cleanup proof.
- **Public TurnRecord/LifecycleRecord:** rejected because it exposes runtime internals and freezes an
  implementation representation instead of the stable projection.
- **Manual operation subscriptions for React correctness:** rejected by REV-HOST-007; useView tracks
  passive reads internally and the runtime owns the lease.
- **Inline sink callbacks:** rejected because a user callback could delay acknowledgment, StoreFanout, or
  lifecycle linearization.
- **Fabricating trace from an arbitrary actor snapshot:** rejected because a snapshot cannot prove order,
  truncation, lifecycle evidence, or committed operation facts.

### Proof obligations

1. Sink tests cover default 256, zero, capacity one, eviction markers, clear markers, stable frozen
   snapshots, late attachment, duplicate attachment, cross-runtime attachment, and idempotent disposal.
2. Ordering tests force actor publication, lifecycle publication, evidence acceptance, acknowledgment,
   StoreFanout, sink delivery, and drain boundaries with Deferred; they assert snapshot-before-event and
   no synthetic terminal turn.
3. Failure tests prove one failed sink detaches without changing actor/store state or other sinks and that
   a slow sink cannot delay actor acknowledgment.
4. Projection tests prove transition inspection cannot invent starts or generations, diffTrace preserves
   incomplete status, and no second mutable history exists in runtime, actors, Stories, or CLI.
5. Packed consumers can use snapshot, drain, dispose, and formatter/projection return values without
   importing TurnRecord, AppPlan, or private deep paths.

## 6. CS-10 — Public persistence and artifact carriers

### Decision

The public carrier is deliberately smaller than the private v2 model. The carrier boundary is:

~~~ts
declare const TraceArtifactTextBrand: unique symbol;
type TraceArtifactText = string & {
  readonly [TraceArtifactTextBrand]: "flow-state/trace-artifact.v2";
};

declare const CompressedTraceArtifactBrand: unique symbol;
type CompressedTraceArtifact = {
  readonly [CompressedTraceArtifactBrand]: "flow-state/trace-artifact.v2+gzip";
  readonly byteLength: number;
  readonly toUint8Array: () => Uint8Array;
};

function exportTraceArtifact<App>(
  trace: TraceProjection<App>,
  options: {
    readonly encodeDomain: EncodeDomain;
  },
): TraceArtifactText;

function importTraceArtifact<App>(
  app: App,
  input: TraceArtifactText | CompressedTraceArtifact,
  options: {
    readonly decodeDomain: DecodeDomain;
  },
): TraceProjection<App>;

function compressTraceArtifact(input: TraceArtifactText): CompressedTraceArtifact;
function decompressTraceArtifact(input: CompressedTraceArtifact): TraceArtifactText;
~~~

The concrete CompressedTraceArtifact implementation is an opaque package-owned object; the shown
toUint8Array() always returns a fresh copy. Consumers cannot construct a valid brand by copying fields,
and Flow never trusts byteLength without rechecking the returned bytes. The carrier is deliberately
file-neutral: filesystem and HTTP code own filenames, streams, status codes, and atomic publication.

RuntimeBootPayload<App> is not a TraceArtifactText. It is an app-branded in-process constructor carrier.
If an application stores it, it stores the application-defined canonical representation and decodes it
again with decodeRuntimeBoot; JSON.stringify(boot) is not a supported persistence protocol. Trace text
is the supported public artifact carrier because WIRE-020B defines canonical JSON and the required trailing
newline. Compression is optional and never changes the canonical text representation.

Behavior contracts use the same private codec and canonical encoding internally. buildBehaviorContract
returns a frozen public projection; the CLI's behavior artifact writer is the only owner that projects it
to the package-private behavior-contract v2 envelope. No public BehaviorArtifact, AppPlanFingerprint,
decoded model, or collision-resolution API is exported.

### Shared codec ownership

There is one private codec pipeline:

~~~text
public boot input -> Flow structural walker -> app domain decoder -> PreparedBoot
public trace source -> Flow projection validator -> app domain encoder -> v2 model
v2 text/bytes -> Flow bounded decoder -> app domain decoder -> v2 model -> inspect/CLI projection
~~~

Story and CLI consume the same decoded v2 model. CLI does not decode a second schema, Story does not export
its own artifact hierarchy, and public import does not return the private model. The encoder sorts object
keys
by UTF-8 bytes, preserves semantic order for states/events/checkpoints/records/Cause reasons, emits one
trailing newline at the file boundary, and validates the WIRE-016 bounds.

### Error propagation

Malformed public artifact input must not leak JSON.parse, gzip, UTF-8, or implementation-library errors.
The inspect route adds one route-owned package error for these failures:

~~~ts
type InspectionErrorKind =
  | "InvalidArtifactOperand"
  | "MalformedUtf8"
  | "MalformedJson"
  | "DuplicateJsonKey"
  | "DecompressionFailed"
  | "CompressedInputBoundExceeded"
  | "DecompressedOutputBoundExceeded"
  | "StructuralBoundExceeded"
  | "InvalidCanonicalValue"
  | "ArtifactIdentityMismatch"
  | "ArtifactIncompatible"
  | "InvalidTraceRecord"
  | "InvalidLifecycleTransition"
  | "InvalidStoryEvidence"
  | "NonCanonicalTraceCause"
  | "EvidenceUnavailable"
  | "ApplicationValidationFailed";

class FlowInspectionError extends Error {
  readonly _tag = "FlowInspectionError" as const;
  readonly kind: InspectionErrorKind;
  readonly path: readonly PathSegment[];
  readonly limit: number | null;
  readonly actual: number | null;
  readonly applicationCause: unknown | null;
}
~~~

FlowInspectionError is exported only from flow-state/inspect, not from the root. Its applicationCause is
populated only for application validation and is not converted into a structural failure. It never
contains raw Effect Cause; the artifact projection uses ordered duplicate-preserving CauseProjection
with Fail, Die, and Interrupt reasons. Noncanonical or duplicate Cause reasons reject before projection.
EvidenceUnavailable carries the truncation sequence and is used when a caller requests a complete proof
from an incomplete sink window.

For a valid artifact with an application domain failure, importTraceArtifact invokes decodeDomain and
throws FlowInspectionError(kind: ApplicationValidationFailed) while retaining the application cause. It
does not construct a runtime or execute a Story. For a valid artifact with a wrong app or fingerprint,
it throws ArtifactIdentityMismatch before domain decoding. This ordering prevents an attacker from using
the domain decoder as an app-identity oracle.

exportTraceArtifact rejects an incomplete or malformed projection before writing any bytes. It returns no
partial string. File publication is outside this function; the CLI's atomic publication owner must write
a temporary file, flush/close it, and commit it only after canonical encoding succeeds.

### Effect and codec decision

**IF** encoding, decoding, bounded walking, canonical sorting, projection validation, compression framing,
or diffing is deterministic local work, **THEN** keep it plain TypeScript with R = never and synchronous
failure at the inspect boundary.

**BECAUSE** these operations do not own a service, time, fiber, or resource. Plain functions make the
canonical preimage and rejection path directly testable.

**IF** artifact bytes come from a file, stream, or network, **THEN** adapt the foreign I/O once at the host
edge into string or CompressedTraceArtifact; keep gzip bounds, UTF-8 validation, and canonical decoding
inside the single Flow codec.

**BECAUSE** raw platform errors and partial buffers must not become an alternate schema authority.

**CHECK** compressed input with one gzip member, concatenated members, trailing bytes, compressed-size and
decompressed-size limits, and interruption during host I/O. The decompressed limit must stop the stream
before a larger model is built.

### Rejected alternatives

- **Export the v2 BehaviorArtifact or TraceArtifact aliases:** rejected by REV-MIG-005 and WIRE-020B;
  private schema fields would become a permanent compatibility promise.
- **Accept arbitrary string | Uint8Array and trust a cast:** rejected because carrier identity, gzip
  framing, bounds, and app compatibility would be unchecked at the call site.
- **Use JSON.stringify as the canonical encoder:** rejected because it does not enforce duplicate-key
  rejection at parse time, UTF-8 ordering, semantic array order, negative-zero rejection, or exact bounds.
- **Expose a mutable Uint8Array as the artifact type:** rejected because consumers could mutate a value
  after validation and cause time-of-check/time-of-use drift. The opaque carrier returns defensive copies.
- **Serialize raw Effect Cause, fibers, scopes, or closures:** rejected by SEM-023, WIRE-020B, and
  REV-MIG-005; only the ordered private Cause projection crosses JSON.
- **Keep separate Story and CLI codecs:** rejected because they would allow different schema, truncation,
  cleanup, or failure semantics. The shared decoded model is the sole internal handoff.

### Proof obligations

1. Type proofs show that a RuntimeBootPayload<AppA> cannot be passed to runtime<AppB>, a forged text
   string cannot satisfy TraceArtifactText, and compressed carriers expose no mutable byte storage.
2. Canonical round-trip proofs cover object-key ordering, semantic ordering, trailing newline, all exact
   v2 identity fields, Cause reason order and duplicate multiplicity, and opaque domain encode/decode.
3. Malformed-input proofs cover wrong kind/version, unknown fields, duplicate keys, invalid UTF-8, lone
   surrogates, non-finite numbers, negative zero, sparse arrays, cycles, accessors, proxies, reserved keys,
   unsupported prototypes, all WIRE-016 bounds, concatenated gzip members, trailing bytes, and truncated
   evidence.
4. Identity proofs reject another app, persistence-version mismatch, plan fingerprint mismatch, foreign
   machine/ref, deleted children/final/Scenario/v1 shapes, and impossible lifecycle or Story evidence
   before application decoding or runtime acquisition.
5. Hydration/artifact parity proves no finite replay, no stream-emission replay, terminal streams do not
   restart, nonterminal transactions become unknown, and restored context is derived from providers rather
   than serialized selected values.
6. Error-lane proofs keep typed failure, defect, interruption, application-domain failure, structural
   failure, and cleanup failure distinct. Only FlowDisposeError and FlowStoryExecutionError retain raw
   Effect Cause; artifacts retain only ordered CauseProjection.
7. Packed-consumer proofs import the root, React, server, testing, and inspect routes through the package
   export map, use the branded carriers without private deep imports, and reject old artifact, hydration,
   inspection, and runtime names.

## 7. Consolidated deterministic proof matrix

Every row is a required executable proof, not a source-text assertion. Use `Deferred`, `Queue`, `Exit`,
`TestClock`, and controlled fake application decoders/adapters to force the listed cut; use no wall-clock
sleep. The production-owner rows must run through the same runtime construction used by browser hosts,
SSR, Story, and packed consumers.

| Proof | Boundary | Deterministic setup and negative case | Required assertion |
| --- | --- | --- | --- |
| HOST-P-CS05-1 | Boot decode | Feed malformed, duplicate-key, hostile-prototype, sparse, cyclic, non-finite, negative-zero, over-bound, wrong-version, foreign-app, and opaque-local inputs. | `FlowBootDecodeError` reports the Flow-owned kind/path/limit; the domain decoder is not called for rejected structure; no Layer, Scope, actor, lease, lifecycle record, or external work exists. |
| HOST-P-CS05-2 | Domain slots | Give three canonical opaque slots and make the second decoder call fail or defect. | Calls are exactly one-per-visited-slot in canonical order; later slots are not called; the application failure remains distinct from structural failure; no runtime is acquired. |
| HOST-P-CS05-3 | Dehydrate/hydrate | Capture registered stable actors plus a transitive stable provider closure while a local actor, tombstone, disposed actor, suspended actor, and concurrent mutation are present. | The cut is context-closed and revision-checked; local/tombstone/disposed entries are excluded; `ConcurrentDehydrate` has no partial payload; opaque provider closure fails with `NonDurableContextProvider` and exact binding paths. |
| HOST-P-CS05-4 | Hydration no replay | Restore memory, selected context, finite operation, stream, transaction, and provider revisions with spies on initializers, `onContext`, adapters, emissions, and retries. | Provider dependency order is respected; derived context is the silent baseline; every replay spy remains at zero; nonterminal transaction becomes unknown/reconciliation-required; terminal stream does not restart; missing live input fails closed. |
| HOST-P-CS06-1 | Factory/request ownership | Discover a factory twice, run two requests concurrently, and use a pre-aborted signal. | Discovery is inert; each request creates exactly one isolated production runtime; pre-abort calls neither `create` nor `use`; no shared Layer, Scope, actor, evidence, or disposal owner exists. |
| HOST-P-CS06-2 | Request failure lanes | Gate Layer acquisition, callback rendering, sink drain, and finalizers with `Deferred`; force typed failure, defect, interruption, callback rejection, cleanup failure, and repeated abort/dispose. | `runPromiseExit` preserves `Exit<A, E \| LayerError>`/Cause truth; the callback runs at most once; cleanup runs once; cleanup failure is deterministic and prevents a false success; no runtime survives the Promise. |
| HOST-P-CS06-3 | SSR preparation | Render concurrently, issue 64 prepared commands, abandon one render, and change provider identity/revision before commit. | Preparation registers no actor or work; the bounded mailbox accepts exactly 64 and rejects the 65th; commit attaches the same ref/handle, rechecks context, drains once; abandonment closes inert state with no evidence or disposal obligation. |
| HOST-P-CS06-4 | React lifecycle | Force `prepared -> active -> suspended -> active -> disposed`, Strict Mode reconnection, Activity hide/reveal, due absolute timers, suspended commands, missing provider, and cleanup defect. | Suspension rejects later commands without buffering and releases live resources; resume preserves identity/cursors/deadlines and uses ordinary provider reconciliation; no finite replay or synthetic TurnRecord occurs; cleanup defects block resume and leave suspended state. |
| HOST-P-CS07-1 | Inspection bounds | Exercise sink capacities `0`, `1`, `256`, eviction, `clear`, late attachment, duplicate/cross-runtime attachment, and snapshots before/after drain. | Retention is bounded; snapshots are frozen defensive copies; `truncatedBeforeSequence` is truthful; drain waits only for the accepted prefix; no second history or unbounded queue is created. |
| HOST-P-CS07-2 | Inspection ordering/failure | Gate publication, lifecycle evidence, StoreFanout, sink delivery, and disposal with `Deferred`; make one sink slow and another fail. | Publication precedes evidence; acknowledgment and StoreFanout do not wait on sinks; failed sink detaches without state rollback or impact on other sinks; runtime disposal drains accepted evidence and emits no terminal synthetic turn. |
| HOST-P-CS07-3 | Projections | Give `analyzeTrace` a truncated source, give `graphOf` inert definitions with no runtime evidence, and compare complete/incomplete traces. | Projections never invent starts/generations/cleanup; diff completeness is false when either input is truncated; formatter output cannot make incomplete data appear complete; `useView` remains the only ordinary reactive path. |
| HOST-P-CS10-1 | Artifact carriers/codecs | Round-trip canonical text and compression; test key ordering, semantic ordering, trailing newline, UTF-8, gzip bounds, concatenated members, trailing bytes, and all WIRE-016 malformed values. | Only Flow-created branded carriers cross the public boundary; decompression is bounded and defensive; canonical text is deterministic; no partial output or platform parser/gzip error leaks. |
| HOST-P-CS10-2 | Identity/error propagation | Import wrong app/version/fingerprint/ref, deleted legacy shapes, impossible lifecycle/evidence, application-domain failure, defect, interruption, and truncated evidence. | Identity/structure fail before domain decode; `FlowInspectionError` preserves application cause only in its application lane; artifacts retain serializable `CauseProjection`, never raw Cause; complete evidence is required for export. |
| HOST-P-PACKED | Export map/consumers | Typecheck and run packed root, React, server, testing, and inspect consumers against positive carrier/hook/runtime examples and negative private/deleted names. | Public declarations expose only the proposed routes and brands; no `TurnRecord`, v2 envelope, `ManagedRuntime`, raw Cause, mutable hydration, old inspection, or old CLI surface is recoverable by deep import. |

## 8. Cross-blocker interactions and implementation order

1. **CS-05 before CS-06.** A request or Story runtime accepts only a decoded app-branded boot payload.
   withRequestRuntime never decodes unknown storage and therefore cannot accidentally acquire a Layer
   before application validation.
2. **CS-05 with CS-10.** Both use the same DomainSlot locator and bounded Flow walker. Boot decode uses
   DecodeDomain; artifact export/import uses EncodeDomain/DecodeDomain. Selected context is absent
   from both as an independent source of truth.
3. **CS-06 with host lifecycle.** Browser construction happens outside React bootstrap. SSR preparation
   creates no runtime registration or Effect scope; request construction owns one production runtime;
   React commit attaches the same prepared actor; React cleanup suspends it; request/runtime disposal is
   terminal.
4. **CS-06 with CS-07.** Inspection attachment is explicit after runtime creation. Request disposal drains
   accepted evidence before closing sink queues and the ManagedRuntime. Sink disposal never becomes actor
   disposal.
5. **CS-07 with CS-10.** A sink snapshot is the only live trace source. Its truncation marker flows into
   trace analysis, diff completeness, artifact export, and CLI proof. No formatter may make truncated data
   appear complete.
6. **CS-10 with runtime hydration.** Artifact import validates app identity and private v2 structure but
   does not hydrate or create actors. Runtime hydration is construction-owned and uses the same structural
   rules with the app-branded boot carrier.
7. **CS-10 with error boundaries.** Public actor snapshots and selectors never expose raw Cause; the two
   declared in-process errors preserve complete Cause; inspection/artifact/CLI projections preserve only
   ordered serializable Cause reasons and cleanup/evidence facts.

Recommended implementation order is the dependency order above: pure carrier brands and bounded walkers,
boot/domain codec, production request owner, sink attachment, projection functions, then artifact text and
compression adapters. Each implementation slice must prove its owner through the production runtime before
the next boundary is accepted.
