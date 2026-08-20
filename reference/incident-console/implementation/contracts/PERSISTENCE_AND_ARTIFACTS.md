# vNext persistence and artifact contract

Status: normative target vNext contract; not shipped

This contract defines the durable identity domain, runtime boot, revision-consistent capture, TurnRecord
export, and Story evidence. Flow-owned persistence and artifact values remain bounded and must represent the
accepted app, actor, operation, lifecycle, compound-state, and Story identities.

This contract is the sole Flow-owned vNext internal schema authority for boot, behavior artifacts, trace
artifacts, Story evidence, and the package-private decoded model consumed by the Story runner and CLI. It
owns the shared validation/codec boundary and semantic invariants; [`CLI.md`](./CLI.md) owns command and
transport behavior but does not define a competing artifact or evidence schema. The shared decoded model
is internal and is not a public package type or a promise that any private member is exported.

`BEH-033` status: closed by `REV-MIG-005` — the exact artifact, trace, and CLI schema is defined here as a
package-private v2 model and is not a public package type. Historical design notes, retired Phase 0
fixtures/goldens, and retired phase records are inputs or migration evidence only; none is schema authority
or shipped-behavior evidence by itself.

## Persistence provider and declaration ownership

### WIRE-000 — Persistence is one optional RuntimeSetup provider

The public persistence surface MUST be one inert `Persistence` provider attached to `RuntimeSetup`:

```ts
const persistenceProvider = persistence({
  storage: webStorage(window.localStorage),
  scope: "user:42",
  codec: todoPersistenceCodec, // optional
  filter: ({ kind, id, key }) => kind !== "stream" || id === "todo.updates", // optional narrowing
});

const setup = runtimeSetup({
  app: TodoApp,
  implementation: TodoLive,
  persistence: persistenceProvider,
});
```

The provider options are `storage`, required `scope`, optional `codec`, and optional identity-only
`filter`. The filter receives only stable declaration metadata (`kind`, descriptor or actor identity, and
canonical `K` when applicable); it receives no mutable actor state, executable `P`, service, or operation
result. Omitting the filter keeps every declaration whose owning actor/resource/operation explicitly opted in.

The public type notation is:

```ts
type PersistenceStorage = {
  read(): Effect.Effect<Uint8Array | undefined, PersistenceStorageError>;
  write(value: Uint8Array): Effect.Effect<void, PersistenceStorageError>;
  remove(): Effect.Effect<void, PersistenceStorageError>;
};

type PersistenceCodec = {
  encode(value: unknown, slot: PersistenceSlot): PersistenceValue;
  decode(value: PersistenceValue, slot: PersistenceSlot): unknown;
};

type Persistence = Readonly<{
  storage: PersistenceStorage;
  scope: string;
  codec: PersistenceCodec;
  filter?: (entry: PersistenceEntry) => boolean;
}>;

declare function persistence(options: {
  storage: PersistenceStorage;
  scope: string;
  codec?: PersistenceCodec;
  filter?: (entry: PersistenceEntry) => boolean;
}): Persistence;
```

These aliases describe the public contract. `PersistenceValue` is the bounded canonical JSON union;
`PersistenceSlot` identifies an actor, resource, transaction, or stream value; `PersistenceEntry` exposes
only its kind, stable identity, owning stable actor when applicable, and canonical `K`; and
`PersistenceStorageError` is the typed adapter failure. The codec methods are pure and synchronous;
the provider catches validation failures and reports them as `FlowPersistenceError`. `webStorage(...)` and
`indexedDbStorage(...)` are the supplied adapters for browser Web Storage and IndexedDB.

`Persistence` is host configuration, not an `Implementation`, `AppPlan` input, or second runtime. It is
inert until `RuntimeSetup.construct()` attaches it to one `Runtime`. The provider supplies storage access,
scope, codec, and the identity-only filter. The `Runtime` owns restoration, observation, ordered writes, and
cleanup through that provider; the provider does not own a second lifecycle. No provider means no persistence
reads, writes, or storage access.

The provider MUST NOT decide which application values are durable. Stable actor refs and resource,
transaction, and stream descriptors declare persistence intent with `persist: true`; machines never opt their
actors in implicitly. The provider persists only declared values. An optional provider filter MAY further exclude already-declared entries by stable
actor or descriptor identity, but it MUST NOT opt an undeclared value into persistence or inspect mutable `P`
values to make that decision.

### WIRE-000A — Persistable declarations are explicit and default off

The following declarations MAY carry `persist: true`, which defaults to `false`:

```ts
const todos = resource({
  id: "todo.todos",
  key: ({ listId }: { readonly listId: string }) => [listId] as const,
  lookup: loadTodos,
  persist: true,
});

const saveTodo = transaction({
  id: "todo.save",
  key: ({ id }: { readonly id: string }) => [id] as const,
  commit: saveTodoEffect,
  persist: true,
});

const updates = stream({
  id: "todo.updates",
  key: ({ listId }: { readonly listId: string }) => [listId] as const,
  subscribe: subscribeToTodoUpdates,
  persist: true,
});

const PrimaryTodoActor = actorRef(TodoMachine, "primary", { persist: true });
```

`actorRef(..., { persist: true })` declares that the stable actor identity is eligible for complete actor
snapshot persistence. It does not create an actor. Opaque local actor refs are never restorable, even when
the machine or operation declaration is persistable. A persistable actor snapshot includes the exact stable
ref, machine state, memory, durable bindings, and the operation facts required by its declared persistable
bindings; it never includes a mailbox, queue, fiber, Scope, callback, service, or pending command.

Persistable resources retain committed canonical entries by descriptor ID and `K`. Persistable transactions
and streams retain only their contracted actor-owned facts and projections, and only for a persistable stable
actor. A transaction or stream declaration MUST NOT cause its owning actor to become durable implicitly.

### WIRE-000B — Codec is optional application-value translation

A codec is a pure application-value encoder/decoder. It translates opaque application values such as actor
memory, resource data, operation outcomes, and diagnostic payloads to and from the bounded persisted
representation. It does not access storage, create actors, run Effects, resume work, or decode a complete
runtime/boot payload.

When omitted, `Persistence` MUST use the package's default JSON-safe persistence codec. The default accepts
only the bounded canonical JSON value family and MUST reject unsupported values rather than stringify them
or silently lose information. An application MAY supply one codec for non-JSON domain values; the codec's
validation or migration failure MUST remain a typed persistence failure. Flow continues to own envelope,
app identity, `persistenceVersion`, plan compatibility, structural bounds, and executable-work rejection.

### WIRE-000C — Storage adapters share one Effect-backed contract

The public storage adapter MUST expose one logical record with `read`, `write`, and `remove` operations.
Synchronous Web Storage and asynchronous IndexedDB adapters MUST normalize to the same typed Effect failure,
cancellation, and lifetime boundary. A provider MUST attach one storage record to one runtime and scope;
the first implementation does not define cross-tab synchronization, conflict resolution, or concurrent
same-scope writers.

### WIRE-000E — Persistence failures retain typed ownership

`FlowPersistenceError` MUST distinguish storage failure, codec failure, incompatible app or persistence
identity, malformed persisted data, concurrent capture, and non-durable context-provider closure failure.
The error MUST carry the stable kind and structured details needed for programmatic recovery; a raw Effect
Cause MAY be retained only at the readiness or disposal boundary. A persistence write failure MUST NOT
mutate the Runtime's canonical state or make an actor turn fail after its committed publication; it remains
the provider's reported write failure and preserves the last successfully stored record.

### WIRE-000D — Restore, observation, and disposal order

`RuntimeSetup.construct()` MUST perform no storage I/O. Runtime readiness MUST restore and validate the
provider record once, install the canonical store, restore persistable actors in provider-before-consumer
context order, and complete the existing bootstrap barrier before any actor handle or external work escapes.
The provider MUST subscribe to committed runtime publications only after restore succeeds. It MUST capture
through the existing revision/context-closed `DehydrateBarrier`, coalesce notifications, serialize writes
per scope, and prevent an older asynchronous write from overwriting a newer one. Runtime disposal MUST stop
observation, finalize the latest accepted persistence write, and then release the provider lifecycle.

Stories have no persistence by default. An app Story MAY use an explicitly supplied provider, preferably an
isolated in-memory storage adapter for persistence tests; `story.machine` and Story fixtures never inherit
browser or session storage implicitly.

## Canonical durable values

### WIRE-001 — Operation identity follows the accepted `P`/`K` split

Operation identity MUST follow the accepted `P`/`K` split. `P` is the complete immutable executable
input retained by a live binding or admitted generation and is never operation identity. `K` is the
ordered readonly canonical tuple returned synchronously by `key(P)`; exact operation identity is the
descriptor ID plus `K`. `P` MUST NOT be reconstructed from `K`, and equal `K` values MUST NOT be used to
switch clients or other omitted capabilities.

Canonical `K` MUST follow `PUBLIC_API.md` `API-005`. Flow accepts ordinary dense arrays and plain records, copies them
into Flow-owned containers, recursively freezes them, and freezes the top-level tuple. It sorts record keys,
normalizes `-0` to `0`, rejects hostile reflection and unsupported values, and validates the exact UTF-8
`KBytes` encoding synchronously before ownership, mutation, admission, or external work. The limits are 16
nested levels, 256 total value nodes, and 8 KiB of encoded bytes. Capability, tenant, account, network,
permission, session, and other result-changing discriminators MUST be in `K`; runtime partitioning does not
replace that requirement. Secret material remains observable in persistence, inspection, diagnostics, and
artifacts unless the application hashes or replaces it before key projection.

### WIRE-001A — Canonical encoding follows the PUBLIC_API contract

Canonical key equality MUST use the accepted ordered `K` result and the exact `KBytes` UTF-8 encoding defined
by [`PUBLIC_API.md` API-005](./PUBLIC_API.md#api-005--identity-and-canonical-key-k). `KBytes` has no whitespace or trailing newline; the artifact file boundary may add its
own required newline after encoding the containing artifact. `-0` normalization occurs before the general
artifact walker, so `WIRE-016` sees canonical `0` and does not reject a canonical key for negative zero.

### WIRE-002 — Persisted operation facts preserve descriptor identity

Persisted resource entries MUST use the descriptor ID plus canonical `K` identity owned by the runtime's
single canonical resource store. A persisted entry MUST NOT introduce an actor-private cache or a second
projected resource identity. Live bindings and generations retain their complete executable `P` as required
by `REV-OPS-003`; `K` alone is not executable input and does not authorize a lookup.

Persisted transaction and stream records MUST retain only the accepted descriptor, actor, binding, generation,
occurrence, and canonical-identity facts needed by their owning production kernels. They MUST NOT be treated
as generic operation refs or as serialized executable work. Descriptor resolution MUST use the receiving
runtime's compiled `AppPlan`; occurrence and post-hydration input behavior follow `WIRE-011`, `WIRE-012`,
and `PUBLIC_API.md` `API-006`.

### WIRE-003 — Flow validates structure; applications validate domain data

Flow owns validation of artifact versions, app identity, exact machine-branded actor identities, descriptor
IDs, token IDs, primitive statuses, revisions, and structural bounds. Actor memory and domain payloads remain
opaque. Unknown persisted storage MUST enter through the package-private provider boundary, where Flow
validates the structure first and the default or application-supplied codec validates or normalizes each
opaque slot before the value reaches the production runtime. Application code MUST NOT assertion-cast
persisted input or pass unknown data directly to the runtime.

Persisted input MUST be compatible with the receiving app and its compiled `AppPlan`. Changing durable machine IDs,
declaration slots, state/event tokens, or the app's `persistenceVersion` MUST NOT be silently guessed into
the new plan. The accepted revision does not add a generic Flow identity-migration API; incompatible input
must remain a rejected input for the owning Persistence provider/runtime path.

The application codec boundary MUST preserve the distinction between Flow-owned structural validation and
application-owned opaque values. It MUST be synchronous and pure at the value boundary, return data accepted
by the receiving app, and never encode executable work. The deleted subordinate-machine persistence surface
has no replacement here and MUST NOT survive as active contract fields.

## Internal runtime restoration

### WIRE-004 — Provider restoration is immutable runtime input

The production runtime and `story.app` MUST consume only the optional Persistence provider for restoration.
The provider record MUST be app-compatible and MUST be validated rather than guessed into the current plan.
Flow MUST NOT expose mutable hydration, a public boot payload, or a public decoder. Internal installation MUST
use materialized actor memory and MUST NOT invoke a definition's fresh-memory initializer.

Runtime readiness/bootstrap MUST validate the provider record, acquire the application Implementation, install and
validate declared persistable actors, complete the `Runtime`'s initial `ensureActor` calls, resolve
exact context-provider refs, seal the instance graph, and only then activate or expose a runtime or actor
handle. RuntimeSetup discovery MUST be synchronous and inert: it may retain app identity, Clock, external
capabilities, and the optional Persistence provider, but MUST NOT acquire an Implementation, create or register
actors, start work, or expose handles.
Hydration MUST establish each consumer's silent context baseline before initial continuing-activity
reconciliation or handle escape.

### WIRE-005 — Boot carries compatibility identity

Boot compatibility MUST retain the receiving app identity, its application-owned `persistenceVersion`, and
the durable machine, state/event, descriptor, and actor identity facts required to resolve the payload through
the receiving compiled `AppPlan`. A changed durable identity or persistence version MUST NOT be silently
aliased to the current app. The exact behavior/trace envelope members and package-private `appPlanFingerprint`
representation are owned by `WIRE-020B`; boot remains compatible through the receiving compiled `AppPlan` and
does not expose a fingerprint API.

### WIRE-006 — Boot carries one canonical store

The store section MUST represent the one runtime-scoped canonical resource store, keyed by descriptor ID
and canonical `K`; actors MUST retain ownership and projections rather than private canonical resource caches.
It MUST preserve committed bases, generation fencing, actor-scoped overlay provenance, and stale-completion
facts needed by the production kernels. Uncommitted previews are never restored as executable work or made
visible to another actor; a restored nonterminal owner becomes `unknown` or reconciliation-required. A
resource descriptor's explicit `persist: true` declaration is the sole opt-in for its committed canonical
entries. The provider MAY apply an additional identity-only exclusion filter, but it MUST NOT replace the
descriptor declaration with a provider-owned persistence predicate or silently persist an undeclared resource.

### WIRE-007 — Actor entries retain ownership and observation identity

Each actor entry MUST contain its exact machine-branded `ActorRef`, machine identity, materialized state and
memory, primitive identities, current issues, exact referenced refs, and the last store revision observed by
that actor. A stable ref identifies a durable shared actor; an opaque ref identifies a runtime-local actor and
is not restorable. The entry MUST retain each included consumer's exact `contextBindings` refs and the provider
revision observed for every binding. It MUST also retain accepted actor-owned declaration and identity facts
needed by the coordinated hydration boundary. Active projections are restored as immutable actor truth,
selector reruns use the internal dependency leases, and finite work is never replayed. Canonical resource
values MUST NOT be duplicated as independent actor-owned bases. Automatic-root, dynamic-actor, and
subordinate-machine persistence categories are removed by `DEL-002` and `DEL-003`.

The exact retention of observe revisions, finite-binding cursors, timer due facts, consumed activation
facts, and pending mapped outcomes is package-private actor state. Queue cells and commands are not
serialized; finite work is never replayed and pending nonterminal work is normalized by `WIRE-012`.

For a captured running stream binding, persistence MUST retain the accepted actor-owned declaration, descriptor,
canonical key, generation, ownership facts, and latest projection when present without serializing the running
fiber, Scope, cursor, transport, or emission history. The canonical key need not reconstruct executable `P`.
Hydration rematerializes the declaration from its current live `P` after pending outcomes drain, creates a new
generation, and does not replay the captured emission. A terminal stream does not restart; missing executable
input fails closed with a precise diagnostic.

### WIRE-008 — Durable actors require explicit stable identity

Each actor MUST carry one exact machine-branded `ActorRef`. An authored stable ref may identify a durable
shared actor across runtime restarts; its wire form is the fixed `actor:` namespace tag followed by the
GLO-01 length-prefixed UTF-8 machine-ID segment and authored stable-ID segment, in that order. A generated
opaque ref identifies a local actor and is neither durable nor restorable; it MUST NOT appear in boot,
dehydration, artifacts, or CLI selectors. `actorRef(machine, id, { persist?: boolean })` is an inert identity
and MUST NOT create an actor; `persist` defaults to `false` and is declaration metadata, not part of the
actor wire identity. Durable restoration MUST resolve the stable machine identity through the receiving app's `App.M` and
MUST use `runtime.ensureActor(ref, ...)` for restore-or-create ownership. `runtime.createActor(machine, ...)`
remains ID-free and always creates a fresh local actor with an opaque ref. The deleted
`runtime.actor(machine, { id })`, automatic-root, dynamic-root, and parent-child persistence surfaces MUST
NOT survive as aliases.

## Capture and restoration

### WIRE-009 — Dehydration is closed and revision-consistent

Each successful capture attempt MUST acquire a package-private DehydrateBarrier shared with
the StoreKernel commit window, so it cannot observe StoreState after a commit but before the
initiating actor publication. It then leases the actor registry selection, captures StoreState
exactly once, and reads each actor through its internally atomic `ActorState` boundary. Every
captured actor MUST have `observedStoreRevision <= capturedStoreRevision`; a newer actor
revision or a concurrent closure change aborts that attempt with retryable
`ConcurrentDehydrate`. A caller may retry the whole operation, but a successful attempt never
mixes two StoreState captures.

Dehydration MUST begin only between completed context-propagation waves and MUST capture a context-closed
cut. Every included consumer MUST retain its exact `contextBindings` refs and the provider revision observed
for each binding; every referenced provider snapshot MUST be present at that exact revision. A concurrent
mismatch MUST fail with retryable `ConcurrentDehydrate`. Unrelated actors MAY still represent different
state-only instants, but the stronger closure applies along context edges.

Persistence MUST capture only registered non-disposed stable actors whose `actorRef(..., { persist: true })`
declaration opts them in, including suspended stable actors, plus the transitive closure of exact context-provider
refs. Membership MUST be derived from declaration metadata, runtime registration, and fixed bindings, not
automatic roots, dynamic actor categories, child actors, current projections, or whether the current `Runtime`
called `ensureActor`. Runtime-local actors, runtime-incarnation tombstones, and disposed stable actors MUST be
excluded; a restored stable actor remains captureable even when the current `Runtime` does not repeat `ensureActor`.
An included durable consumer with a direct or transitive dependency on an opaque local provider MUST fail terminally with the accepted
`NonDurableContextProvider` behavior; Flow MUST NOT serialize, promote, recreate, substitute, or rebind that
provider automatically. Partial or orphaned payloads are forbidden.

### WIRE-010 — Hydration rematerializes projections

Hydration MUST install the canonical store and then rebuild each actor's resource and transaction projections
from its exact refs and the installed StoreState. Recorded store revisions explain capture skew; duplicated
actor resource values MUST NOT override the canonical base. Hydration MUST reconcile accepted actor and store
identity without duplicating canonical data, drain pending outcomes before rematerializing continuing
declarations, preserve latest projections without replaying emissions, and never replay finite work.

Hydration MUST restore the included context graph in dependency order, evaluate selectors from the restored
provider snapshots, and install derived context as each consumer's silent baseline before initial continuing-
activity reconciliation or handle escape. Hydration MUST NOT replay or manufacture `onContext` events, and
serialized selected context values MUST NOT override provider truth. Compound substates remain part of one
actor; subordinate-machine snapshots, completion, and parent-outcome replay are deleted by `DEL-002`.

### WIRE-011 — Pending resource execution normalizes safely

An in-flight lookup MUST NOT resume from serialized execution. A hydrated key-only resource entry remains
passively readable and MUST NOT start lookup work until a live binding supplies executable `P`. Equal-key
bindings retain the running generation's pinned `P`; the oldest eligible live binding supplies a later
automatic generation, while explicit refetch uses its caller's `P`. Actor-effective reads apply only the
owner's preview layers, and hydration never invents a replacement lookup policy.

### WIRE-011A — Active stream hydration remains an explicit closure boundary

A captured running stream fiber, Scope, cursor, transport session, buffered element, or emission history MUST
NOT be serialized or resumed. The latest stream projection may be captured as actor snapshot truth, but
hydration creates a new owned-stream generation from live executable `P` after pending outcomes drain; it does
not replay emissions. Terminal streams do not restart, and missing executable input fails closed.

### WIRE-012 — Pending transactions become interrupted

Pending or queued transaction execution MUST NOT resume from serialized external work or be treated as a
generic automatic retry. A restored nonterminal occurrence is never replayed; if its remote identity is
durable, its projection becomes `unknown` or reconciliation-required and reconciliation reuses that identity.
Terminal transaction state may restore only through the accepted production operation state representation.

### WIRE-013 — Restored collection gets a new owned lifetime

Collection, ownership, and retained-value behavior for restored resources follow the exact operation state
and collection contract in `PUBLIC_API.md` `API-006`; this contract does not choose a restored idle countdown or a
`gcTime` default beyond the descriptor's existing policy.

## Artifact codecs and failures

### WIRE-014 — Flow owns one validated persistence and artifact path

Internal restoration and artifact import/export MUST use one Flow-owned validation and encoding path that preserves the
distinction between structural Flow failures and application-owned opaque-domain validation. Artifact and
trace decoding MUST produce the shared package-private v2 decoded model owned by this contract, which is
consumed by both Story and CLI. Runtime readiness/bootstrap MUST apply the same persisted-structure rules as
the Persistence provider boundary before any actor or external work begins. Raw implementation-library parse
failures MUST NOT escape a public Flow API.

The production bootstrap owns provider validation, constructor phase ordering, and prepared installation. The
resource, transaction, stream, artifact, and Story owners MUST use the production kernels and accepted
schemas rather than a second hydration, operation, Story, or artifact interpretation path.

### WIRE-015 — Artifact decoding preserves failure categories

Artifact import MUST preserve the distinction between structural, bound, identity, external-input, and
application-domain failures required by the retained artifact path. Opaque-domain validation happens before
runtime construction, so Flow MUST preserve an application-reported failure rather than relabel it as a Flow
decode failure. `DiagnosticCode` below is the closed code vocabulary for artifact, gateway, usage, Story,
cleanup, interruption, I/O, and invariant failures; import MUST NOT collapse a failure to `undefined` or an
invented generic corrupt-artifact result.

### WIRE-016 — Durable envelopes are bounded

Every boot, trace, and behavior artifact codec, including opaque carriers, MUST use
the same limits with no per-envelope override:

- maximum decoded nesting depth 32, with the envelope root at depth zero;
- maximum 10,000 visited scalar-or-container nodes;
- maximum array length 4,096;
- maximum 262,144 UTF-8 bytes in one string or property key;
- maximum 2,097,152 decompressed or canonical-encoded UTF-8 bytes.

Compressed import MUST stop when the decompressed-byte limit is crossed. Structural walking
MUST reject accessors, symbol keys, unsupported prototypes, sparse arrays, cycles, reserved
prototype keys, throwing proxies, negative zero, strings with lone surrogates, and non-finite
numbers before building runtime indexes. Revisions,
generations, sequences, timestamps, and counts MUST be non-negative safe integers. Boot decoding
MUST also prove that every restored actor revision has one remaining terminal-publication credit
and that StoreState has one remaining runtime-cleanup revision; a value at
`Number.MAX_SAFE_INTEGER` is therefore structurally valid JSON but an invalid boot counter. A bound
failure MUST report its limit and path separately from version, identity, decompression, and
application domain-validation failures.

## TurnRecords, inspection, and exported artifacts

### WIRE-017 — TurnRecord is the sole committed history event

Before StoreState mutation, the actor acquires the hub's global commit permit and reserves the next
safe-integer sequence. One immutable TurnRecord MUST then be created after actor publication and
accepted by the runtime TurnRecord hub before command acknowledgment and StoreFanout release. The hub uses the
reserved runtime-global sequence and queues the record behind a closed release gate without invoking sinks
inline. The actor completes any acknowledgment, opens the gate, and releases StoreFanout in that
order. After the gate opens, receipt, inspection, trace, CLI, and optional artifact sinks MAY process it;
sink processing and failure MUST NOT delay StoreFanout or mutate committed state. No second
runtime-owned mutable history may compete with TurnRecords.

Prepared fresh snapshots start at publication revision zero. Hydrated snapshots restore their persisted
publication and machine-turn revisions without resetting them; neither is a committed turn or creates a
`TurnRecord`. Actor lifecycle transitions, including `actor:start`, `actor:restore`, `actor:suspend`,
`actor:resume`, and `actor:dispose`, are inspection evidence and MUST NOT create a machine revision or
`TurnRecord`. Each later committed mailbox turn creates one. Actor admission and ordinary commits MUST
preflight any changing actor, store, and sequence reserves required by the retained cleanup contract; runtime
disposal MUST preserve the accepted reverse-dependency cleanup ordering without manufacturing a terminal
actor-disposal turn.

### WIRE-018 — Inspection buffering is bounded and explicit

`createInspectionBufferSink()` MUST default to capacity 256. A caller MAY choose another
non-negative integer capacity; zero retains no records while preserving truncation counts.
When records are evicted, reads and exports MUST include an explicit truncation marker
`truncatedBeforeSequence` equal to the greatest dropped or explicitly cleared runtime-global
sequence, or `null` when no prefix is missing. `snapshot()` returns a frozen stable copy;
`clear()` advances the marker through the current retained tail without resetting sequence. Silent
dropping is forbidden.

The buffer surface is exactly `snapshot(): { records: readonly InspectionRecord[];
truncatedBeforeSequence: number | null }` and `clear(): void`; a pre-attachment snapshot is empty
with a null marker. One sink instance may attach exactly once to one runtime. Concurrent attachment,
attachment to another runtime, or reattachment after disposal throws synchronously, preventing
runtime-local sequences from being mixed.

At attachment, a buffer that did not observe the runtime's earlier prefix sets
`truncatedBeforeSequence` to the hub's current sequence, or leaves it null only when that sequence
is zero. A late attachment can therefore never represent an incomplete window as complete.

`attachInspectionSink(runtime, sink)` queues records admitted after successful attachment behind
each record's acknowledgment-release gate without
blocking actor acknowledgment or StoreFanout. Its attachment owns ordered `drain` and idempotent
`dispose`; disposal stops new admission and drains the accepted prefix before detaching. Sink
failure never rolls back runtime state, detaches only that sink, and rejects its drain/dispose
boundary with the retained Cause diagnostic.

Hub acceptance atomically snapshots the attachment registry. Attach returns only after its registry
CAS. `drain()` snapshots that attachment's highest accepted sequence and waits only through that
prefix. Attachment `dispose()` performs one stop-admission CAS, drains its accepted prefix,
detaches, and returns one cached Promise. `clear()` removes only records already processed into the
buffer; accepted queued records may arrive afterward. Runtime disposal admits and opens the gate for every
already-linearized terminal lifecycle record and TurnRecord, then stops sink admission and gracefully drains/detaches
active attachments before closing ManagedRuntime. A slow sink may delay runtime disposal, but a
sink callback failure remains isolated to that attachment and does not make runtime cleanup fail.

### WIRE-019 — Runtime observation is not persistence

TurnRecords become durable only when a caller explicitly exports records from a configured
sink. Ordinary runtime buffering and inspector subscriptions MUST NOT imply persistence.
Artifact export MUST preserve record order, truncation markers, app identity, and format
version.

### WIRE-020 — Changed refs are revision-local hints

A StoreState TurnRecord MAY include the exact changed refs for its revision. An importer or
consumer that skips revisions MUST perform a full relevant reread; it MUST NOT combine or
trust an incomplete latest hint as a historical diff.

### WIRE-020A — Behavior and trace artifacts use one internal schema authority

A behavior artifact MUST represent the compiled app's module tooling ownership, named machine records,
recursive compound-state declarations, context requirements, operation identities and requirements, and
registered Story metadata. Module IDs remain tooling identity only; machine IDs remain durable machine and
artifact identity. Behavior artifacts contain declarations and coverage identity only, never callbacks,
Effects, fixtures, runtime actors, or runtime state.

A trace artifact MUST preserve app and persistence compatibility, ordered TurnRecords, retained-window
truncation evidence, operation identities and facts, inspection lifecycle records, and Story evidence through
exact actor lookup. App Story checkpoints MUST support `checkpoint.actor(storyActor | actorRef)` and reserved
`runtime` metadata; successful evidence MUST use `run.end`, whose evidence does not imply actor completion.
Failure evidence MUST retain completed checkpoints, the failure boundary, the package-owned primary
diagnostic, and cleanup truth. The shared decoded model is the sole internal handoff between artifact
decoding, Story evidence, and CLI projections; text, JSON, and file publication are projections of that
model, not independent schema authorities.

### WIRE-020B — Behavior and trace v2 envelopes are exact

The internal JSON envelopes are exact. Object keys are sorted by their UTF-8 byte sequences. Finite JSON
numbers use the `JSON.stringify(number)` serialization, strings use JSON string escaping without Unicode
normalization, and strings MUST be strict UTF-8 with no lone surrogates. Duplicate keys, non-finite numbers,
negative zero, accessors, sparse arrays, and reserved prototype keys reject. ID-indexed declaration arrays are
sorted by their UTF-8 byte comparator. Authored state-child order, authored event order, checkpoint order,
record sequence order, Cause-reason order, and fact order are preserved. Requirement-ID lists are sorted by
the same comparator because they are identity indexes. The file boundary adds one trailing newline only after
canonical encoding.

These rejection rules apply to serialized artifact carriers. Canonical operation keys are validated by
`PUBLIC_API.md` `API-005`, which defensively copies and freezes accepted dense arrays and plain records and normalizes
`-0` to `0` before applying its separate `KBytes` bounds.

A behavior artifact contains `kind: "behavior-contract"`, `version: "flow-state/behavior-contract.v2"`,
`appId`, `persistenceVersion`, `appPlanFingerprint`, `requirements`, `modules`, `machines`, and `stories`.
`requirements` is the normalized package-private static requirement table; every operation requirement ID
MUST resolve to exactly one record. `modules` is an ID-indexed array of `{ id, machineIds }`; each machine
contains its recursive state tree, root default, events, context-provider requirements, operation requirements,
activity slots, and timer slots. Each Story is an app or machine metadata record. Actor recipes are run-local
construction inputs and are not artifact Story kinds. The artifact contains declarations and coverage identity
only: no callbacks, Effects, fixtures, runtime actors, live refs, or runtime state.

`appPlanFingerprint` is package-private lowercase hexadecimal SHA-256. Its preimage is the exact canonical
UTF-8 JSON encoding, without a trailing newline, of `{ appId, persistenceVersion, requirements, modules, machines }`
after ID-indexed sorting and semantic-order preservation; `stories` are artifact metadata and are not part
of the plan preimage. The encoder recomputes and verifies the field. Empty IDs, duplicate IDs, duplicate
machine values, duplicate module ownership, missing module references, invalid direct-child defaults,
duplicate operation or slot IDs, unresolved requirement IDs, invalid Story metadata, malformed trace records,
invalid lifecycle tuples, and inconsistent Story evidence reject compilation or artifact construction with
the following closed codes: invalid IDs use `InvalidDescriptorId`; duplicate IDs and duplicate operation or
slot IDs use `DuplicateDescriptorId`; duplicate machine values use `DuplicateMachineValue`; duplicate module
ownership uses `DuplicateModuleOwnership`; missing module references use `MissingModuleReference`; invalid
defaults use `InvalidStateDefault`; unresolved operation requirements use `UnresolvedRequirementId`; invalid
Story metadata uses `InvalidStoryMetadata`; malformed trace records use `InvalidTraceRecord`; impossible
lifecycle combinations use `InvalidLifecycleTransition`; and inconsistent end/failure/cleanup invariants use
`InvalidStoryEvidence`. A mismatched fingerprint rejects import with `ArtifactIdentityMismatch`. No fingerprint
or collision-resolution API is public.

Trace artifacts are Story-run artifacts and contain `kind: "trace-artifact"`,
`version: "flow-state/trace-artifact.v2"`, `storyId`, `appId`, `persistenceVersion`, `appPlanFingerprint`,
`capturedAt`, `truncatedBeforeSequence`, `records`, `checkpoints`, `outcome`, `end`, `failure`, and `cleanup`.
Records are an ordered discriminated union of exact TurnRecord and LifecycleRecord projections. A checkpoint
is an app or machine projection; in-process named checkpoint lookup is serialized as an ordered array and
duplicate names reject. `end` is named `end`, never `final`, and never implies actor completion. A completed
artifact has a non-null `end`, `failure: null`, and complete cleanup. A failed artifact has a non-null
`failure`; its root cleanup status MUST agree with the failure cleanup diagnostics.

`failure` is either `null` or `{ phase, commandIndex, completedCheckpoints, end, diagnostic, secondary,
cleanup, cancellation, evidence }`, where phase is `prepare`, `command`, `cancellation`, `cleanup`, or
`artifact`, `commandIndex` is a non-negative safe integer or `null`, `secondary` and `cleanup` are ordered
diagnostic arrays, `cancellation` is either `null`, `{ kind: "signal", signal: "SIGINT" | "SIGTERM" }`, or
`{ kind: "programmatic" }`, and `evidence` is `{ acceptedThrough, drainedThrough }`. A cancellation phase
MUST carry cancellation evidence; a non-cancellation phase MUST NOT invent it. Both sequence values are the
last accepted/drained runtime-global evidence sequence for this run, zero means no evidence was accepted,
and `drainedThrough` MUST NOT exceed `acceptedThrough`. `cleanup` at the artifact root is either
`{ status: "complete" }` or `{ status: "failed", diagnostics }`, and failed diagnostics MUST equal the
failure cleanup diagnostics.

The following TypeScript-like aliases are exact local wire notation, not exported package types:

```ts
type StableId = string;
type RunLocalId = string;
type ActorIncarnationId = string;
type Nullable<T> = T | null;
type StringList = readonly string[];
type NonNegative = number;
type CanonicalCarrier =
  | null
  | string
  | boolean
  | number
  | readonly CanonicalCarrier[]
  | { readonly [key: string]: CanonicalCarrier };

type Slot = {
  machineId: StableId;
  stateId: StableId;
  kind: "activity" | "timer";
  name: StableId;
};

type Requirement = {
  id: StableId;
  operationIds: StringList;
};

type StateNode =
  | { token: StableId; kind: "leaf"; default: null; states: readonly [] }
  | { token: StableId; kind: "compound"; default: StableId; states: readonly StateNode[] };
type ContextRequirement = {
  key: StableId;
  providerMachineId: StableId;
  providerRef: Nullable<StableId>;
};
type Operation = {
  id: StableId;
  kind: "resource" | "transaction" | "stream";
  requirementIds: StringList;
};
type BehaviorMachine = {
  machineId: StableId;
  moduleId: StableId;
  default: StableId;
  states: readonly StateNode[];
  events: StringList;
  contextRequirements: readonly ContextRequirement[];
  operations: readonly Operation[];
  activitySlots: readonly Slot[];
  timerSlots: readonly Slot[];
};
type StorySummary =
  | {
      id: StableId;
      kind: "app";
      machineId: null;
      title: Nullable<string>;
      description: Nullable<string>;
      tags: StringList;
    }
  | {
      id: StableId;
      kind: "machine";
      machineId: StableId;
      title: Nullable<string>;
      description: Nullable<string>;
      tags: StringList;
    };
type BehaviorArtifact = {
  kind: "behavior-contract";
  version: "flow-state/behavior-contract.v2";
  appId: StableId;
  persistenceVersion: string;
  appPlanFingerprint: string;
  requirements: readonly Requirement[];
  modules: readonly { id: StableId; machineIds: StringList }[];
  machines: readonly BehaviorMachine[];
  stories: readonly StorySummary[];
};

type CauseReasonProjection =
  | { _tag: "Fail"; error: CanonicalCarrier }
  | { _tag: "Die"; defect: CanonicalCarrier | { _tag: "Error"; name: string; message: string } }
  | { _tag: "Interrupt"; fiberOrdinal: NonNegative };
type CauseProjection = { reasons: readonly CauseReasonProjection[] };
type DiagnosticCode =
  | "InvalidCommand"
  | "InvalidOption"
  | "InvalidSelector"
  | "UnknownSelector"
  | "InvalidArtifactOperand"
  | "InvalidProjectRoot"
  | "ManifestNotFound"
  | "InvalidManifest"
  | "InvalidGatewayFile"
  | "GatewayEscape"
  | "UnsupportedGatewayImport"
  | "UndeclaredGatewayImport"
  | "PackageIdentityMismatch"
  | "InvalidGatewayExport"
  | "MixedAppBehavior"
  | "StoryNotFound"
  | "WrongArtifactKind"
  | "UnsupportedArtifactVersion"
  | "MalformedUtf8"
  | "MalformedJson"
  | "DuplicateJsonKey"
  | "DecompressionFailed"
  | "CompressedInputBoundExceeded"
  | "DecompressedOutputBoundExceeded"
  | "CanonicalEncodingBoundExceeded"
  | "StructuralBoundExceeded"
  | "InvalidCanonicalValue"
  | "InvalidDescriptorId"
  | "DuplicateDescriptorId"
  | "DuplicateMachineValue"
  | "DuplicateModuleOwnership"
  | "MissingModuleReference"
  | "InvalidStateDefault"
  | "UnresolvedRequirementId"
  | "InvalidStoryMetadata"
  | "InvalidTraceRecord"
  | "InvalidLifecycleTransition"
  | "InvalidStoryEvidence"
  | "ArtifactIdentityMismatch"
  | "ArtifactIncompatible"
  | "NonCanonicalTraceCause"
  | "EvidenceUnavailable"
  | "StoryExecutionFailed"
  | "CleanupFailed"
  | "ApplicationValidationFailed"
  | "ArtifactInputReadFailed"
  | "DestinationExists"
  | "UnsupportedAtomicPublication"
  | "ArtifactTempCreateFailed"
  | "ArtifactWriteFailed"
  | "ArtifactFlushFailed"
  | "ArtifactCloseFailed"
  | "ArtifactCommitFailed"
  | "BrokenPipe"
  | "Interrupted"
  | "InternalInvariant";
type UsageCode = "InvalidCommand" | "InvalidOption" | "InvalidSelector";
type GatewayCode =
  | "InvalidProjectRoot"
  | "ManifestNotFound"
  | "InvalidManifest"
  | "InvalidGatewayFile"
  | "GatewayEscape"
  | "UnsupportedGatewayImport"
  | "UndeclaredGatewayImport"
  | "PackageIdentityMismatch"
  | "InvalidGatewayExport"
  | "MixedAppBehavior";
type ArtifactCode =
  | "InvalidArtifactOperand"
  | "WrongArtifactKind"
  | "UnsupportedArtifactVersion"
  | "MalformedUtf8"
  | "MalformedJson"
  | "DuplicateJsonKey"
  | "DecompressionFailed"
  | "CompressedInputBoundExceeded"
  | "DecompressedOutputBoundExceeded"
  | "CanonicalEncodingBoundExceeded"
  | "StructuralBoundExceeded"
  | "InvalidCanonicalValue"
  | "InvalidDescriptorId"
  | "DuplicateDescriptorId"
  | "DuplicateMachineValue"
  | "DuplicateModuleOwnership"
  | "MissingModuleReference"
  | "InvalidStateDefault"
  | "UnresolvedRequirementId"
  | "InvalidStoryMetadata"
  | "InvalidTraceRecord"
  | "InvalidLifecycleTransition"
  | "InvalidStoryEvidence"
  | "ArtifactIdentityMismatch"
  | "ArtifactIncompatible"
  | "NonCanonicalTraceCause";
type StoryCode = "StoryNotFound";
type StoryExecutionCode = "StoryExecutionFailed";
type CleanupCode = "CleanupFailed";
type ApplicationCode = "ApplicationValidationFailed";
type IoCode =
  | "ArtifactInputReadFailed"
  | "DestinationExists"
  | "UnsupportedAtomicPublication"
  | "ArtifactTempCreateFailed"
  | "ArtifactWriteFailed"
  | "ArtifactFlushFailed"
  | "ArtifactCloseFailed"
  | "ArtifactCommitFailed"
  | "BrokenPipe";
type InterruptionCode = "Interrupted";
type InternalCode = "InternalInvariant";
type DiagnosticBase = { message: string; cause: Nullable<CauseProjection> };
type ArtifactDetails = {
  path: readonly (string | NonNegative)[];
  limit: Nullable<NonNegative>;
  actual: Nullable<NonNegative>;
};
type Diagnostic =
  | (DiagnosticBase & {
      category: "usage";
      code: UsageCode;
      details: { argument: Nullable<string> };
    })
  | (DiagnosticBase & {
      category: "gateway";
      code: GatewayCode;
      details: { path: Nullable<string>; importSpecifier: Nullable<string> };
    })
  | (DiagnosticBase & { category: "artifact"; code: ArtifactCode; details: ArtifactDetails })
  | (DiagnosticBase & {
      category: "artifact";
      code: "UnknownSelector";
      details: ArtifactDetails & { selector: string };
    })
  | (DiagnosticBase & {
      category: "artifact";
      code: "EvidenceUnavailable";
      details: ArtifactDetails & { truncatedBeforeSequence: NonNegative };
    })
  | (DiagnosticBase & { category: "story"; code: StoryCode; details: { storyId: StableId } })
  | (DiagnosticBase & {
      category: "story-execution";
      code: StoryExecutionCode;
      details: { storyId: StableId; failure: StoryFailure };
    })
  | (DiagnosticBase & { category: "cleanup"; code: CleanupCode; details: { operation: string } })
  | (DiagnosticBase & {
      category: "application";
      code: ApplicationCode;
      details: { path: StringList; value: CanonicalCarrier };
    })
  | (DiagnosticBase & {
      category: "io";
      code: IoCode;
      details: { path: Nullable<string>; operation: string; errno: Nullable<string> };
    })
  | (DiagnosticBase & {
      category: "interruption";
      code: InterruptionCode;
      details: { kind: "signal"; signal: "SIGINT" | "SIGTERM" } | { kind: "programmatic" };
    })
  | (DiagnosticBase & { category: "internal"; code: InternalCode; details: { invariant: string } });
type DiffSection = { name: string; equal: boolean; lines: StringList };
type EqualDiffData = { equal: true; sections: readonly DiffSection[] };
type DifferentDiffData = { equal: false; sections: readonly DiffSection[] };
type TraceDiffData =
  | { equal: true; complete: true; sections: readonly DiffSection[] }
  | { equal: false; complete: true; sections: readonly DiffSection[] }
  | { equal: true; complete: false; sections: readonly DiffSection[] }
  | { equal: false; complete: false; sections: readonly DiffSection[] };
type RunLocalRecipeId = { runId: RunLocalId; recipeId: RunLocalId };
type ActorEvidenceId =
  { kind: "stable-ref"; value: StableId } | { kind: "story-recipe"; value: RunLocalRecipeId };
type ActorLifecycle = "prepared" | "active" | "suspended" | "disposed";
type IssueProjection = {
  id: StableId;
  kind: StableId;
  message: string;
  cause: Nullable<CauseProjection>;
};
type ActorSnapshotProjection = {
  state: StableId;
  memory: CanonicalCarrier;
  context: CanonicalCarrier;
  lifecycle: ActorLifecycle;
  issues: readonly IssueProjection[];
  publicationRevision: NonNegative;
  storeRevision: NonNegative;
};
type ActorEvidence = {
  actor: ActorEvidenceId;
  machineId: StableId;
  snapshot: ActorSnapshotProjection;
};
type PendingWork = {
  finite: readonly { kind: string; id: StableId }[];
  continuing: readonly { kind: string; id: StableId }[];
  nextTimerAt: Nullable<NonNegative>;
};
type RuntimeEvidence = { now: NonNegative; pendingWork: PendingWork };
type AppCheckpoint = {
  kind: "app";
  name: string;
  commandIndex: NonNegative;
  actors: readonly ActorEvidence[];
  runtime: RuntimeEvidence;
};
type MachineCheckpoint = {
  kind: "machine";
  name: string;
  commandIndex: NonNegative;
  snapshot: ActorSnapshotProjection;
  runtime: RuntimeEvidence;
};
type Checkpoint = AppCheckpoint | MachineCheckpoint;
type LifecycleCause =
  | "fresh-creation"
  | "boot-restoration"
  | "attachment-commit"
  | "attachment-cleanup"
  | "attachment-reacquisition"
  | "owner-disposal"
  | "runtime-disposal";
type StoryFailure = {
  phase: "prepare" | "command" | "cancellation" | "cleanup" | "artifact";
  commandIndex: Nullable<NonNegative>;
  completedCheckpoints: readonly Checkpoint[];
  end: Nullable<Checkpoint>;
  diagnostic: Diagnostic;
  secondary: readonly Diagnostic[];
  cleanup: readonly Diagnostic[];
  cancellation: Nullable<
    { kind: "signal"; signal: "SIGINT" | "SIGTERM" } | { kind: "programmatic" }
  >;
  evidence: { acceptedThrough: NonNegative; drainedThrough: NonNegative };
};
type OperationTraceIdentity = {
  operationId: StableId;
  operationKind: "resource" | "transaction" | "stream";
  actor: ActorEvidenceId;
  generation: Nullable<NonNegative>;
  occurrence: Nullable<NonNegative>;
  key: CanonicalCarrier;
};
type TraceOperationBase = {
  kind: "operation";
  identity: OperationTraceIdentity;
};
type TraceRetention = { data?: never } | { data: CanonicalCarrier };
type ResourceTraceFact = TraceOperationBase &
  (
    | {
        identity: OperationTraceIdentity & { operationKind: "resource"; generation: null; occurrence: null };
        status: "missing";
      }
    | {
        identity: OperationTraceIdentity & { operationKind: "resource"; generation: NonNegative };
        status: "pending";
      }
    | {
        identity: OperationTraceIdentity & { operationKind: "resource"; generation: NonNegative };
        status: "ready" | "refreshing";
        data: CanonicalCarrier;
      }
    | ({
        identity: OperationTraceIdentity & { operationKind: "resource"; generation: NonNegative };
        status: "failure";
        error: CanonicalCarrier;
      } & TraceRetention)
    | ({
        identity: OperationTraceIdentity & { operationKind: "resource"; generation: NonNegative };
        status: "defect";
        defect: CanonicalCarrier;
      } & TraceRetention)
    | ({
        identity: OperationTraceIdentity & { operationKind: "resource"; generation: NonNegative };
        status: "interrupted";
      } & TraceRetention)
  );
type TransactionTraceFact = TraceOperationBase &
  (
    | {
        identity: OperationTraceIdentity & { operationKind: "transaction"; generation: null; occurrence: null };
        status: "idle";
      }
    | {
        identity: OperationTraceIdentity & { operationKind: "transaction"; generation: NonNegative; occurrence: NonNegative };
        status: "pending";
      }
    | {
        identity: OperationTraceIdentity & { operationKind: "transaction"; generation: NonNegative; occurrence: NonNegative };
        status: "success";
        value: CanonicalCarrier;
      }
    | {
        identity: OperationTraceIdentity & { operationKind: "transaction"; generation: NonNegative; occurrence: NonNegative };
        status: "failure";
        error: CanonicalCarrier;
      }
    | {
        identity: OperationTraceIdentity & { operationKind: "transaction"; generation: NonNegative; occurrence: NonNegative };
        status: "defect";
        defect: CanonicalCarrier;
      }
    | {
        identity: OperationTraceIdentity & { operationKind: "transaction"; generation: NonNegative; occurrence: NonNegative };
        status: "interrupted";
      }
    | {
        identity: OperationTraceIdentity & { operationKind: "transaction"; generation: NonNegative; occurrence: NonNegative };
        status: "unknown";
        reconcileRequired: true;
      }
  );
type StreamTraceValue =
  | { hasValue: false; latest?: never; emissionCount: 0 }
  | { hasValue: true; latest: CanonicalCarrier; emissionCount: NonNegative };
type StreamTraceFact = TraceOperationBase &
  (
    | ({
        identity: OperationTraceIdentity & { operationKind: "stream"; generation: null; occurrence: null };
        status: "idle";
      } & StreamTraceValue)
    | ({
        identity: OperationTraceIdentity & { operationKind: "stream"; generation: NonNegative };
        status: "running" | "complete" | "interrupted";
      } & StreamTraceValue)
    | ({
        identity: OperationTraceIdentity & { operationKind: "stream"; generation: NonNegative };
        status: "failure";
        error: CanonicalCarrier;
      } & StreamTraceValue)
    | ({
        identity: OperationTraceIdentity & { operationKind: "stream"; generation: NonNegative };
        status: "defect";
        defect: CanonicalCarrier;
      } & StreamTraceValue)
  );
type TraceFact = ResourceTraceFact | TransactionTraceFact | StreamTraceFact
  | {
      kind: "context";
      consumer: ActorEvidenceId;
      key: StableId;
      provider: ActorEvidenceId;
      providerRevision: NonNegative;
      value: CanonicalCarrier;
    }
  | {
      kind: "store";
      revision: NonNegative;
      changedRefs: StringList;
      value: CanonicalCarrier;
    }
  | { kind: "timer"; timerId: StableId; dueAt: NonNegative; status: StableId }
  | { kind: "issue"; issueId: StableId; source: StableId; value: CanonicalCarrier };

Operation facts are the closed projection of the exact resource, transaction, and stream state unions in
`PUBLIC_API.md` `API-006`; they are not a generic status/value record. Missing and idle lanes have `null` generation and
`null` occurrence. Resource and stream lanes carry a generation except when missing or idle; a trace occurrence
is either `null` or a non-negative value and is present when the owning kernel has an associated
finite/declaration occurrence. Transaction non-idle lanes carry both generation and occurrence. `hasValue`,
`latest`, and `emissionCount` follow the stream value union. Failure, defect, success, unknown, and retention
fields are present only on the matching discriminant. Raw Effect `Cause` never enters these carriers. The
WIRE-020B decoder MUST reject missing, extra, or inconsistent fields—including impossible generation,
occurrence, retention, `latest`, or `reconcileRequired` combinations—with `InvalidTraceRecord` before
application or runtime acquisition.
type TraceRecordBase = {
  sequence: NonNegative;
  actor: ActorEvidenceId;
  actorIncarnation: ActorIncarnationId;
  appId: StableId;
  appPlanFingerprint: string;
  publicationRevision: NonNegative;
  machineTurnRevision: NonNegative;
  snapshot: ActorSnapshotProjection;
  timestamp: NonNegative;
};
type TurnRecordProjection = TraceRecordBase & {
  kind: "turn";
  cause: Nullable<CauseProjection>;
  facts: readonly TraceFact[];
};
type LifecycleRecordProjection = TraceRecordBase &
  (
    | {
        kind: "lifecycle";
        event: "actor:restore";
        from: "prepared";
        to: "prepared";
        cause: "boot-restoration";
      }
    | {
        kind: "lifecycle";
        event: "actor:start";
        from: "prepared";
        to: "active";
        cause: "fresh-creation" | "boot-restoration" | "attachment-commit";
      }
    | {
        kind: "lifecycle";
        event: "actor:suspend";
        from: "active";
        to: "suspended";
        cause: "attachment-cleanup";
      }
    | {
        kind: "lifecycle";
        event: "actor:resume";
        from: "suspended";
        to: "active";
        cause: "attachment-reacquisition";
      }
    | {
        kind: "lifecycle";
        event: "actor:dispose";
        from: "prepared" | "active" | "suspended";
        to: "disposed";
        cause: "owner-disposal" | "runtime-disposal";
      }
  );
type TraceRecord = TurnRecordProjection | LifecycleRecordProjection;
type TraceArtifactBase = {
  kind: "trace-artifact";
  version: "flow-state/trace-artifact.v2";
  storyId: StableId;
  appId: StableId;
  persistenceVersion: string;
  appPlanFingerprint: string;
  capturedAt: NonNegative;
  truncatedBeforeSequence: Nullable<NonNegative>;
  records: readonly TraceRecord[];
  checkpoints: readonly Checkpoint[];
};
type TraceArtifact =
  | (TraceArtifactBase & {
      outcome: "completed";
      end: Checkpoint;
      failure: null;
      cleanup: { status: "complete" };
    })
  | (TraceArtifactBase & {
      outcome: "failed";
      end: Nullable<Checkpoint>;
      failure: StoryFailure;
      cleanup: { status: "complete" } | { status: "failed"; diagnostics: readonly Diagnostic[] };
    });
```

`truncatedBeforeSequence` is `null` exactly when the trace contains the complete retained prefix; a
non-null value marks the first omitted runtime-global sequence. Decoding rejects a missing or inconsistent
truncation marker, and summary projection preserves the same null/non-null distinction.

The same decoded model projects CLI results through one package-private `flow-state/cli-result.v2` envelope.
The envelope is exactly:

```ts
type CliCommand =
  | "behavior.build"
  | "behavior.render"
  | "behavior.diff"
  | "behavior.check"
  | "story.list"
  | "story.describe"
  | "story.run"
  | "trace.summarize"
  | "trace.proof"
  | "trace.diff";
type CliDataByCommand = {
  "behavior.build": { artifact: BehaviorArtifact; appId: StableId; appPlanFingerprint: string };
  "behavior.render": {
    appId: StableId;
    moduleId: Nullable<StableId>;
    section: "contract" | "coverage";
    lines: StringList;
  };
  "behavior.diff": EqualDiffData | DifferentDiffData;
  "behavior.check": EqualDiffData | DifferentDiffData;
  "story.list": { stories: readonly StorySummary[] };
  "story.describe": { story: StorySummary };
  "story.run": {
    storyId: StableId;
    checkpoints: readonly Checkpoint[];
    end: Checkpoint;
    failure: null;
    traceOutput: Nullable<string>;
  };
  "trace.summarize": TraceSummaryData;
  "trace.proof": TraceProofData;
  "trace.diff": TraceDiffData;
};
type CliData = CliDataByCommand[CliCommand];
type TraceSummaryData =
  | {
      complete: true;
      truncatedBeforeSequence: null;
      counts: { records: NonNegative; issues: NonNegative; actors: NonNegative };
      timeline: readonly { sequence: NonNegative; actor: ActorEvidenceId; summary: string }[];
    }
  | {
      complete: false;
      truncatedBeforeSequence: NonNegative;
      counts: { records: NonNegative; issues: NonNegative; actors: NonNegative };
      timeline: readonly { sequence: NonNegative; actor: ActorEvidenceId; summary: string }[];
    };
type TraceProofData = {
  selector: string;
  complete: true;
  evidence: readonly {
    sequence: NonNegative;
    actor: ActorEvidenceId;
    facts: readonly TraceFact[];
  }[];
};
type CliEnvelope<C extends CliCommand, O extends string, D> = {
  version: "flow-state/cli-result.v2";
  kind: "result";
  command: C;
  outcome: O;
  data: D;
};
type CliResultByCommand = {
  "behavior.build": CliEnvelope<"behavior.build", "completed", CliDataByCommand["behavior.build"]>;
  "behavior.render": CliEnvelope<
    "behavior.render",
    "completed",
    CliDataByCommand["behavior.render"]
  >;
  "behavior.diff":
    | CliEnvelope<"behavior.diff", "equal", EqualDiffData>
    | CliEnvelope<"behavior.diff", "different", DifferentDiffData>;
  "behavior.check":
    | CliEnvelope<"behavior.check", "equal", EqualDiffData>
    | CliEnvelope<"behavior.check", "different", DifferentDiffData>;
  "story.list": CliEnvelope<"story.list", "completed", CliDataByCommand["story.list"]>;
  "story.describe": CliEnvelope<"story.describe", "completed", CliDataByCommand["story.describe"]>;
  "story.run": CliEnvelope<"story.run", "completed", CliDataByCommand["story.run"]>;
  "trace.summarize":
    | CliEnvelope<"trace.summarize", "completed", Extract<TraceSummaryData, { complete: true }>>
    | CliEnvelope<"trace.summarize", "incomplete", Extract<TraceSummaryData, { complete: false }>>;
  "trace.proof": CliEnvelope<
    "trace.proof",
    "completed",
    Extract<TraceProofData, { complete: true }>
  >;
  "trace.diff":
    | CliEnvelope<"trace.diff", "equal", Extract<TraceDiffData, { equal: true; complete: true }>>
    | CliEnvelope<
        "trace.diff",
        "different",
        Extract<TraceDiffData, { equal: false; complete: true }>
      >
    | CliEnvelope<
        "trace.diff",
        "different",
        Extract<TraceDiffData, { equal: false; complete: false }>
      >
    | CliEnvelope<
        "trace.diff",
        "incomplete",
        Extract<TraceDiffData, { equal: true; complete: false }>
      >;
};
type CliResult = CliResultByCommand[CliCommand];
type CliError = {
  version: "flow-state/cli-result.v2";
  kind: "error";
  command: Nullable<CliCommand>;
  diagnostic: Diagnostic;
  secondary: readonly Diagnostic[];
};
```

The envelope `command` member discriminates the `data` union; it is not serialized a second time inside
`data`. A successful command uses `outcome: "completed"`; comparison commands use `"equal"`, `"different"`, or
`"incomplete"` according to their data, and `trace.summarize` uses `"completed"` or `"incomplete"`.
`trace.proof` is successful only for complete evidence; truncation emits `CliError` with
`code: "EvidenceUnavailable"`. A successful `story.run` has `outcome: "completed"`, a non-null `end`, and
`failure: null`.
Execution, cancellation, cleanup, and trace-write failures use `CliError` with the partial Story failure in
the primary diagnostic and ordered `secondary` diagnostics. Every nullable field is present with `null`;
omitted fields, unknown members, and duplicate keys reject before projection. The envelopes are package-private,
deeply frozen, and are not public artifact types or exported CLI API.

Raw Effect `Cause` is public only on the declared in-process Flow error boundaries `FlowDisposeError` and
`FlowStoryExecutionError`. It is not JSON data: artifact and CLI projections use the
ordered `CauseProjection` above, preserving Effect v4 traversal order and duplicate multiplicity. Full
Effect `Cause`, fiber objects, closures, and runtime references never enter a serialized envelope.

Opaque application memory, event payloads, operation values/errors, and diagnostic carriers use the owning
application codec and the bounded canonical carrier walker; they contain no callbacks, Effects, fibers,
Queues, Scopes, actor handles, or live refs. Unknown fields, duplicate JSON keys, reserved prototype keys,
unsupported versions/kinds, and legacy `final`, `children`, Scenario, and v1 trace shapes reject before
projection. Artifact input is either stable-key UTF-8 JSON or exactly one gzip member. Gzip is detected by
the standard magic header, concatenated members and trailing bytes are rejected as `DecompressionFailed`,
compressed and decompressed streams are each capped at 2,097,152 bytes. Artifact files are always
uncompressed stable-key UTF-8 JSON with exactly one trailing newline at the file boundary; CLI command
output follows the selected `--format` rules in `CLI-008`.

## Story evidence

### WIRE-021 — Checkpoints capture immutable published evidence

A story checkpoint MUST capture the published evidence for its exact actor targets, the runtime pending-work
inventory, and the TestClock time at that command boundary. App Stories MUST expose exact actor evidence
lookup, while a machine Story exposes its single actor snapshot. Checkpoint capture MUST be atomic and MUST
NOT process work, move time, or copy an independently mutable issue or resource registry.

### WIRE-022 — Cancellation preserves partial evidence and cleanup truth

Story cancellation MUST close command admission, retain completed checkpoints and truthful failure and
cleanup evidence, await non-abortable production disposal, and fail rather than return success. The
package-owned deeply frozen `FlowStoryExecutionError` envelope contains the failure boundary, primary
diagnostic, ordered cleanup diagnostics, cancellation evidence when applicable, and accepted/drained
evidence-sequence facts. A captured `end` remains in the error when cleanup fails, but no successful result
is returned; failure before end capture does not manufacture `run.end`. Only `FlowDisposeError` and
`FlowStoryExecutionError` preserve the complete Effect `Cause.Cause<unknown>`; the artifact Cause projection uses the ordered private
`CauseProjection` in WIRE-020B.

### WIRE-023 — Story success implies completed cleanup

A successful Story result contains immutable named checkpoints and `run.end`, and implies runtime disposal
completed. `run.end` MUST NOT imply actor finality or completion. If every command finishes but disposal fails,
the runner MUST retain the end evidence and failed cleanup status in the failure result rather than return
success.

### WIRE-024 — Pure model artifacts contain no executable Effect

Pure model discovery MUST accept only a command-empty fresh `story.machine` plan. It MUST NOT stand in for
app Story cross-actor orchestration or persist fixture-declared outcomes, candidate event sets, live actors, or
runtime execution. It MUST NOT serialize or execute transaction Effects, stream programs, patch functions,
runtime fibers, Queues, Deferreds, or Scopes; candidates belong to the traversal call and the base Story
remains command-empty.
