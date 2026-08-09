# vNext persistence and artifact contract

This contract defines the durable identity domain, runtime-boot envelope, revision-consistent
capture, TurnRecord export, and story evidence. All Flow-owned envelopes are v2 and are
decoded and encoded through private Effect Schema codecs.

## Canonical durable values

### WIRE-001 — One finite JSON-like carrier defines identity

Canonical ref arguments and keys MAY contain `null`, strings, booleans, finite numbers other than negative zero,
readonly arrays of canonical values, and readonly string-keyed plain records of canonical
values. Record keys retain their exact spelling and MUST be sorted by raw ascending UTF-16
code-unit order during canonical encoding. Unicode normalization and locale collation are
forbidden, so canonically distinct source strings never collapse.
`undefined`, bigint, symbols, functions, class instances, cycles, sparse arrays, accessors,
symbol keys, reserved prototype keys, unsupported prototypes, throwing proxies, negative zero,
strings with lone surrogates, and non-finite numbers MUST be rejected synchronously at ref
construction through the same bounded walker used for artifacts.

### WIRE-001A — Canonical encoding is byte-exact

The canonical encoder emits compact JSON with no whitespace or BOM. It uses JSON `null`/boolean
literals, ECMAScript `JSON.stringify` finite-number spelling, JSON string escaping, array order,
and object properties sorted by GLO-05's raw UTF-16 key order; it appends no newline for an
in-memory identity and exactly one LF at an artifact file boundary. UTF-8 encoding happens only
after the canonical string is complete, while the bounded walker accounts bytes incrementally.
Input JSON rejects duplicate decoded property names, including escape-equivalent spellings. Equal
canonical values MUST produce equal retained identity strings across independent construction and
processes; ref equality compares descriptor ID plus that string and never requires object interning
or `Object.is`.

### WIRE-002 — Resource and transaction refs preserve different durable facts

A durable resource ref MUST contain its descriptor ID and canonical lookup-argument tuple,
which is sufficient to reconstruct the ref, recover its identity, and rerun its lookup. A
resource has no second projected identity key.

A durable transaction ref MUST contain its descriptor ID and canonical key projection. The
materialized activity binding separately retains the concrete commit params for that attempt;
the ref does not duplicate them and pending work never resumes generically after restore.
Deserialization resolves either descriptor only through the runtime's compiled `AppPlan`.

### WIRE-003 — Flow validates structure; applications validate domain data

Flow owns validation of artifact versions, app identity, descriptor IDs, token IDs, exact
refs, primitive statuses, revisions, and structural bounds. Actor memory and domain payloads
remain opaque. Unknown storage MUST enter through
`decodeRuntimeBoot(app, value, { decodeDomain })`: Flow validates the envelope first, then asks the
application to validate or normalize each opaque slot through the locator union below, and only
then returns `RuntimeBootPayload<App>`. Application code MUST NOT assertion-cast the brand or pass
unknown data directly to `runtime`.

The decoder accepts only the receiving app's exact `persistenceVersion`. VNext deliberately has no
generic Flow-envelope or identity migration API: changing IDs, declaration slots, state/event
tokens, or `persistenceVersion` rejects old boot. The application must discard it and reconstruct
current state through ordinary application behavior; Flow does not expose mutable wire internals
or guess how old identities map to the current AppPlan.

`decodeDomain` receives every opaque value once in canonical path order and returns the validated
replacement value. Its locator is the frozen union whose `kind` is exactly `actorMemory`,
`resourceValue`, `resourceFailure`, `optimisticValue`, `transactionParams`, `transactionSuccess`,
`transactionFailure`, `streamParams`, `streamValue`, `streamFailure`, `pendingEventPayload`, or
`childTerminalSnapshot`; each member also contains `path`, `value`, and only its applicable stable
`actorId`, `machineId`, `descriptorId`, or `eventId`. Child memory is ordinary
`actorMemory`. Before invoking application code, Flow completes structural validation and copies
the envelope into private immutable data; each callback receives a frozen slot value, so it cannot
mutate the caller's input or later traversal. Flow re-runs WIRE-016 over every returned value,
copies it into the prepared payload, and never retains callback-owned mutable containers. The
callback is synchronous; returning a Promise is invalid. A callback throw escapes unchanged as the
application validation failure, while a hostile return is a Flow bound/carrier failure at that
slot path.

## Runtime boot v2

### WIRE-004 — Boot is immutable runtime input

The only hydration surface is `flow.runtime({ app, layer?, boot? })`, and its boot argument can be
obtained only from `runtime.dehydrate()` for the same app or
`decodeRuntimeBoot(app, unknown, { decodeDomain })`.
The decoder and runtime constructor share one private service-free structural Schema, which MUST
decode boot synchronously during construction so the
prepared hydrated snapshot exists before any host read or root activation. A runtime MUST
NOT expose mutable `hydrateBoot`, and v1 or unknown artifacts MUST fail with a version
diagnostic rather than being guessed into v2. Hydration MUST use materialized actor memory and
MUST NOT invoke a definition's fresh-memory factory.

### WIRE-005 — The v2 envelope carries compatibility identity

The envelope MUST contain the Flow artifact version, Flow definition-format version,
explicit app ID, application-owned persistence version, capture Clock instant `capturedAt`, and
the AppPlan persistence fingerprint. VNext has no arbitrary boot-extension bag. The fingerprint is
the canonical encoding of every durable machine/token/descriptor ID and compiled activity/timer
slot in AppPlan order; it is structural rather than cryptographic. Any mismatch, including
declaration reordering under an unchanged persistence version, fails as `AppPlanMismatch` before
Layer-dependent work or root activity begins.

### WIRE-006 — The v2 envelope carries one canonical store

The store section MUST contain its captured revision, authoritative resource bases,
each base's monotonic `valueRevision`, freshness timestamps, lookup-generation history needed to
suppress stale completion, each materialized exact ref's frozen deduplicated tag-ID vector, and
materialized ordered optimistic overlays. Placeholder projections
and Effect programs MUST NOT be persisted.

VNext captures the complete canonical StoreState subject to WIRE-016. It MUST NOT apply a
descriptor persistence predicate, omit unreferenced warm data, infer sensitivity, or select bases
from the current actor projection. Selective persistence cannot preserve prepared passive views or
one canonical store deterministically. If complete encoding exceeds a bound, dehydration fails
with terminal `FlowDehydrateError { kind: "ArtifactBoundExceeded" }`; applications may encrypt or
discard the whole boot artifact outside Flow.

### WIRE-007 — Actor entries retain ownership and observation identity

Each actor entry MUST contain actor ID, machine ID, root or dynamic kind, parent identity or
stable host ID where applicable, materialized state and memory, primitive identities,
current issues, exact referenced refs, and the last store revision observed by that actor. It
MUST also retain materialized activity identities,
activation generations, and active or consumed state so restoration does not rerun selectors
or finite work. Canonical resource values MUST NOT be duplicated as independent actor-owned
bases.

Each active observe binding MUST retain its `lastEmittedValueRevision`. Each active finite
resource binding MUST retain the exact lookup generation it joined when one exists; consumed
finite bindings retain only their consumed activation fact. These cursors prevent hydration from
replaying an outcome already represented by the captured actor.

Each materialized timer retains its compiled timer slot, declaring state token, generation,
status, `startedAt`, `dueAt`, and `firedAt` only when fired. Hydration restores terminal fired or
interrupt timers as consumed and never resolves delay again. A scheduled timer retains its
absolute deadline; after the first hydrated publication, readiness, and pending-outcome barrier,
Flow offers already-overdue due facts in stable actor/timer-slot order and schedules future ones for
their remaining duration. Planned state exit removes the projection; disposal may retain interrupt
only on the terminal actor snapshot.

Each actor entry MUST also retain every package-private pending mapped outcome admitted by
`SEM-006A`, including its stable outcome ID, binding and generation identity, exact event token ID,
outcome kind, sequence, and opaque materialized event payload. Each actor entry retains its next
outcome sequence. Queue cells and commands are not serialized. The same Flow-owned bounds and
application-owned opaque-payload migration rules as actor memory apply. Decode MUST reject an
outcome whose actor, binding, generation, sequence, or event token does not resolve inside the same
actor entry and compiled definition.

For each stream binding captured with `status: "running"`, the actor entry MUST additionally
retain the exact concrete subscription-parameter tuple selected for that materialized binding.
Those params are restart input, not stream execution, and every value in the tuple MUST satisfy
the canonical carrier in WIRE-001. The canonical stream key alone is insufficient because it
need not be invertible to descriptor params. If the tuple cannot be encoded canonically,
dehydration MUST fail with a typed `NonDurableActiveStreamParams` diagnostic carrying actor,
stream declaration, and offending path; it MUST NOT omit the binding or emit a payload that
cannot reconstruct its active ownership.

### WIRE-008 — Durable dynamic actors require stable identity

An omitted dynamic actor ID creates a runtime-local opaque identity and is not restorable.
A restorable dynamic actor MUST have an explicit stable host ID or a stable parent-child
activity key. Root IDs use the canonical length-prefixed `root` identity in GLO-08.

After boot or ordinary host creation, `runtime.actor(dynamicMachine, { id })` resolves any existing
live stable host-ID dynamic incarnation without creating or adopting it. Parent-child identities
remain internal to their owning parent binding.

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

Actors MAY still represent different state-only instants, so the envelope MUST NOT claim one
globally linearizable multi-actor cut. Resource bases may be newer than an actor's last
projection and are rematerialized from the captured canonical store during hydration.

The capture set MUST include every root, every durable dynamic actor selected at capture
start, and every child actor transitively referenced by those captured snapshots. All
parent/child IDs, machine and descriptor IDs, exact refs, activity identities, and overlay
owners MUST resolve within the payload or AppPlan. Opaque runtime-local dynamic actors are
excluded. If excluded ownership affects durable state, dehydration MUST fail with
`NonDurableActorOwnsPersistentState`; if concurrent graph change prevents closure after
leased capture, it MUST fail with retryable `ConcurrentDehydrate`. Partial or orphaned
payloads are forbidden. Actor entries MUST encode in canonical actor-ID order.

“Affects durable state” is exact: an excluded actor ID owns a persisted optimistic overlay, is the
parent/owner named by an included child or binding, or is otherwise required to resolve an included
actor/store record. A canonical resource base, lookup-generation history, or ordinary activity
lease is StoreKernel-owned and does not fail capture merely because an opaque actor first caused or
currently leases it; execution and leases are normalized/rebuilt. Excluded actor-local memory,
terminal projections, and pending outcomes are omitted with that actor because no included record
depends on them.

### WIRE-010 — Hydration rematerializes projections

Hydration MUST install the canonical store and then rebuild each actor's resource and
transaction projections from its exact refs and the installed StoreState. Recorded store
revisions explain capture skew; duplicated actor resource values MUST NOT override the
canonical base. Resource `valueRevision` and actor emission cursors MUST be restored before
ordinary activity reconciliation. Pending outcomes MUST be installed before the first hydrated
publication. Their IDs MUST then be preseeded into the real actor mailbox in stable outcome
sequence order, followed by the actor's restored-activity barrier, before its handle escapes.
Managed consumption waits for readiness, drains those outcomes first, and only then reconciles
restored activities. Restoration MUST NOT rerun outcome mappers or let new work overtake a durable
outcome.

A root restored in a final state publishes that final value, owns no activity, and remains active
until runtime disposal. A terminal managed child restores its retained complete projection and
consumed completion cursor without recreating the child actor or replaying its parent outcome.

### WIRE-011 — Pending resource execution normalizes safely

An in-flight lookup MUST NOT resume from serialized execution. Hydration retains any last
canonical value, removes placeholder data, records the interrupted generation, recomputes
freshness from the runtime Clock, and lets reconstructed activity ownership decide whether
ordinary policy starts a new lookup.

### WIRE-011A — Active streams restart from durable binding input

A captured running stream fiber, Scope, cursor, transport session, and buffered element MUST
NOT be serialized or resumed. Before the first hydrated actor publication, hydration MUST
normalize the captured generation to terminal `interrupt` with a restoration receipt and issue,
and MUST NOT route that synthetic interruption through the binding's outcome map. Public stream
status MUST use the existing `interrupt` member; hydration MUST NOT invent a `stopped` status.

The materialized binding remains desired ownership. Hydration MUST restore its compiled binding
slot, canonical key, activation generation, and persisted concrete params
without rerunning the parent selector. After runtime readiness, hydrated publication, and the
restored-pending-outcome barrier, ordinary post-commit reconciliation MUST invoke the descriptor
with those params and start one fresh subscription generation under a new Scope. This is resubscription, not continuation: the
new generation has no cursor, buffer, or delivery guarantee inherited from the captured fiber.

Normal completion, typed failure, defect, and interruption of the fresh generation MUST use the
ordinary full-Cause classification and outcome routing. A synchronous throw while constructing
the fresh Stream is a defect of that new generation. A terminal `complete`, `failure`, `defect`,
or `interrupt` binding captured before dehydration remains consumed and MUST NOT restart merely
because it was hydrated; later removal and reactivation or explicit reentry owns any retry.

### WIRE-012 — Pending transactions become interrupted

Pending or queued transactions MUST restore as terminal interruption with a restoration
receipt and issue. Hydration MUST remove those generations' materialized overlays before
the first actor publication and MUST NOT fire routes or automatically retry. Terminal
transaction snapshots restore normally.

### WIRE-013 — Restored collection gets a new owned lifetime

After root ownership is reconstructed, an unowned restored resource receives one fresh full
`gcTime`; an idle countdown from the previous process is not resumed. Collection MUST
publish the idle projection through a new store revision.

## Schema codecs and failures

### WIRE-014 — Effect Schema owns Flow envelopes

Artifact import/export codecs MUST use `Schema.decodeUnknownEffect` and
`Schema.encodeEffect`, then translate parse failures into typed Flow artifact diagnostics
while retaining the original Schema error as internal cause evidence. The runtime constructor
is already a synchronous JavaScript host boundary and MUST use the same service-free Schema
through beta.86 `Schema.decodeUnknownExit`, translating its complete failure Cause to a
structured Flow boot diagnostic so BootCoordinator can produce PreparedBoot before returning.
Both paths MUST share one Schema and identical validation rules; raw Schema errors MUST NOT
escape a public Flow API.

BootCoordinator owns the shared private boot Schema, constructor phase ordering, and
PreparedBoot installation. StoreKernel owns resource normalization; the transaction kernel
owns transaction and overlay normalization. Artifact import/export owns trace and behavior
Schemas and reuses the boot Schema; none may implement a second hydration path.

### WIRE-015 — Artifact decoding preserves failure categories

Unsupported version, malformed structure, violated bounds, invalid canonical carrier,
unknown descriptor, and decompression failure MUST remain distinguishable Flow diagnostics.
Opaque-domain validation happens at the decoder callback boundary before runtime construction, so
Flow MUST preserve an application-reported failure rather than relabel it as a Flow decode
failure. Import MUST NOT collapse any of these failures to `undefined` or a generic
corrupt-artifact result.

### WIRE-016 — Durable envelopes are bounded

Every v2 boot, trace, and behavior codec, including opaque carriers, MUST use
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

Prepared fresh and hydrated revision-zero snapshots are construction facts, not committed turns,
and create no TurnRecord. The activation barrier and every later committed mailbox turn do create
one, including a terminal actor-disposal turn. The runtime reserves one actor-revision and one
TurnRecord-sequence credit per live actor plus one StoreState cleanup revision; dynamic actor
creation and ordinary commits MUST preflight those changing reserves before admitting work. Runtime
disposal spends the reserved StoreState credit once, then the actor and TurnRecord credits in raw
actor-ID order. Counter exhaustion therefore rejects the initiating ordinary operation before any
state mutation and can never make terminal cleanup unpublishable.

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
buffer; accepted queued records may arrive afterward. Runtime disposal admits and opens the gate
for every terminal actor TurnRecord, then stops sink admission and gracefully drains/detaches
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

### WIRE-020A — Behavior and trace artifacts have exact envelopes

A behavior artifact has exactly `kind`, `version`, `appId`, `persistenceVersion`,
`appPlanFingerprint`, `machines`, and `stories`. `machines` is in compiled AppPlan order and each
entry has exactly `machineId`, ordered `states`, ordered `events`, ordered `activitySlots`, and
ordered `timerSlots`; a slot contains only its durable structured identity from GLO-09. `stories`
is ordered by raw UTF-16 external ID and each entry has exactly `id`, `machineId`, `title`,
`description`, and ordered deduplicated `tags`, with absent optional authored strings encoded as
`null`. It contains declarations and coverage identity only, never callbacks, Effects, fixtures,
or runtime state.

A trace artifact has exactly `kind`, `version`, `appId`, `persistenceVersion`,
`appPlanFingerprint`, `capturedAt`, `truncatedBeforeSequence`, `records`, `checkpoints`, `failure`,
and `cleanup`. Records are in strictly increasing sequence and use the exact immutable
TurnRecord-to-artifact projection: `sequence`, `actorId`, `actorRevision`, `storeRevision`,
`cause`, `snapshot`, and ordered `facts`. Snapshot maps become arrays sorted by canonical identity;
facts preserve authored/commit order and use discriminated exact records rather than an open
property bag. Checkpoints preserve story order; `failure` is `null` or the exact story phase,
command, evidence, and Cause projection; cleanup is exactly `{ status: "complete" }` or
`{ status: "failed", cause }`. Inapplicable fields are absent inside discriminated members, never
present as `undefined`.

Phase 0 MUST check in complete private Schema declarations and one minimal canonical byte golden
for boot, behavior, complete trace, truncated trace, and every Cause member before Phase 7
implementation begins. This section freezes the envelopes; those reviewed Schemas freeze every
nested snapshot and fact member and are the sole source for import, export, CLI rendering, and
diffing.

### WIRE-020B — Artifact Cause projection is stable and explicit

In-memory inspection retains the original `Cause`. Artifact projection recursively preserves
Effect's empty, fail, die, interrupt, sequential, and parallel structure. `fail` payloads and
non-`Error` defects must pass WIRE-001; an `Error` defect becomes exactly
`{ _tag: "Error", name, message }` with no stack or host fields; interruptors use the stable
runtime-local fiber ordinal assigned by the trace owner. Sequential and parallel children retain
Cause order. If any payload cannot be represented, export fails with `NonCanonicalTraceCause` at
the exact record/Cause path and MUST NOT stringify, inspect, or drop it.

Gzip import accepts exactly one member and rejects trailing bytes or additional members. The
compressed-input and decompressed-output counters are independent streaming caps and stop reading
as soon as their own limit is exceeded; canonical encoded size is checked again after Schema
encoding.

## Story evidence

### WIRE-021 — Checkpoints capture immutable published evidence

A story checkpoint MUST capture the published actor snapshot, pending-work inventory, and
TestClock time at that command boundary. It MUST NOT flush, settle, advance time, or copy an
independently mutable issue or resource registry.

### WIRE-022 — Cancellation preserves partial evidence and cleanup truth

Story cancellation MUST retain completed checkpoints and, after actor creation, an
`atFailure` observation. The runner MUST await disposal and reject with
`FlowStoryExecutionError` containing the primary Cause and cleanup status. Execution and
cleanup failures MUST both be retained when both occur.

### WIRE-023 — Story success implies completed cleanup

A successful story result contains immutable named checkpoints and `final`, and implies
runtime disposal completed. If every command finishes but disposal fails, the runner MUST
reject with `final` evidence and a failed cleanup status rather than return success.

### WIRE-024 — Pure model artifacts contain no executable Effect

Pure behavior discovery MAY persist traversal-produced event plans, fixture static seeds,
checkpoints, and model diagnostics. It MUST NOT persist fixture-declared outcomes or candidate
event sets; candidates belong to the traversal call and the base story remains command-empty.
It MUST NOT serialize or execute transaction Effects, stream programs, patch functions,
runtime fibers, Queues, Deferreds, or Scopes.
