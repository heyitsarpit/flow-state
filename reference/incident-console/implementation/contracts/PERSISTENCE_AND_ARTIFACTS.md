# Persistence and artifacts contract

Status: normative target vNext contract; not shipped

This file is the single Flow-owned semantic and schema authority for persistence, boot, capture/hydration,
publication, artifact boundaries, Story evidence timing, the package-private model handoff, and the exact
nested WIRE-020A/B rules. `ARTIFACT_WIRE.md` is the enhanced-format relocated notation mirror used by Story
and CLI; it does not extend or override this file, and any mismatch resolves to this file. This file does not
define CLI transport or duplicate runtime, operation, or public API contracts.
The corresponding file under `contracts/provenance/` is the current semantic source and provenance record
for this restoration; it is retained for traceability, not as a competing active authority. Its transferred
wording and WIRE-* clause IDs remain represented by this file and `ARTIFACT_WIRE.md`. Historical records,
retired fixtures, and unrelated provenance notes add no semantics. BEH-033 is closed by REV-MIG-005: the
v2 model is package-private, not a public type.

## Persistence provider and declarations

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

### Rule card — WIRE-000, WIRE-000A, WIRE-000B, WIRE-000C, WIRE-000D, WIRE-000E

- Surface: RuntimeSetup persistence, persistable declarations, codecs, storage adapters, readiness,
  observation, disposal, and typed failures.
- Rule: Persistence is one inert optional provider. Its options are storage, required scope, optional
  pure synchronous codec, and optional identity-only filter. The Runtime owns restore, observation,
  ordered writes, coalescing, and cleanup. Persistable actor refs and resource, transaction, and stream
  declarations explicitly opt in with persist: true; the default is false. A transaction or stream
  never makes its actor durable implicitly.
- Accepts: PersistenceStorage with read, write, and remove Effects; default bounded JSON-safe codec or
  one application codec; Web Storage and IndexedDB adapters normalized to the same typed Effect
  failure/cancellation/lifetime boundary; a filter seeing only kind, stable identity, owning stable actor,
  and canonical K. Fixtures and story.machine never inherit browser/session storage.
- Rejects: provider access to mutable actor state, executable P, services, operation results, or storage
  ownership; undeclared values selected by a filter; a provider as an Implementation, AppPlan input,
  second runtime, cross-tab synchronizer, conflict resolver, or same-scope writer protocol; unsupported
  codec values silently stringified; RuntimeSetup.construct storage I/O; Story persistence by default.
  The adapter represents one logical storage record attached to one Runtime and scope; it does not define
  cross-tab synchronization, conflict resolution, or concurrent same-scope writers.
- Observable guarantee: No provider means no persistence I/O. Runtime readiness restores and validates
  once, installs the canonical store, restores provider actors before consumers, completes bootstrap
  before handles or external work escape, then observes committed publications through a shared
  DehydrateBarrier. Writes are serialized per scope and an older write cannot replace a newer one.
  Disposal stops observation, finalizes the latest accepted write, and releases the provider.
  FlowPersistenceError distinguishes storage, codec, identity/version, malformed-data, concurrent-
  capture, and non-durable-context-provider failures. A write failure preserves Runtime state and the
  last successfully stored record; it remains the provider's reported write failure and does not make an
  actor turn fail after committed publication. A raw Effect Cause may be retained only at readiness or
  disposal boundaries.
- Proof: Provider type/codec purity, explicit-default-off declarations, readiness ordering, no-I/O
  construction, failure typing, write ordering, and disposal tests through production RuntimeSetup.
- Trace: WIRE-000, WIRE-000A, WIRE-000B, WIRE-000C, WIRE-000D, WIRE-000E.

The public notation is:

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

PersistenceValue is the bounded canonical JSON union. PersistenceSlot identifies an actor, resource,
transaction, or stream value. PersistenceEntry exposes only stable identity metadata and canonical K.
`Storage` and `IndexedDBStorage` are host adapter inputs; their adapter implementations normalize browser
Web Storage and IndexedDB into the same `PersistenceStorage` boundary. The codec never accesses storage,
creates actors, runs Effects, resumes work, or decodes a complete runtime/boot payload. The default codec
rejects unsupported values rather than stringifying or silently losing them; Flow retains ownership of the
envelope, app identity, persistenceVersion, plan compatibility, structural bounds, and executable-work
rejection.

## Durable identity and restoration

    const todos = resource({
      id: "todo.todos",
      key: ({ listId }: { readonly listId: string }) => [listId] as const,
      lookup: loadTodos,
      persist: true,
    });
    const Primary = actorRef(TodoMachine, "primary", { persist: true });

### Rule card — WIRE-001, WIRE-001A, WIRE-002, WIRE-003

- Surface: Operation identity, canonical values, persisted operation facts, and validation ownership.
- Rule: P is the complete immutable executable input retained by a live binding/generation. K is the
  ordered readonly synchronous result of key(P); descriptor ID plus K is identity, and P is never
  reconstructed from K. Flow validates structure and the application codec validates opaque domain
  values. Receiving-app AppPlan compatibility is required; there is no generic identity migration API.
- Accepts: Dense arrays and plain records copied into Flow-owned frozen containers; sorted record keys,
  normalized -0 to numeric 0 before the general artifact walker, exact KBytes UTF-8 encoding, and capability/tenant/account/network/session
  discriminators in K. Persisted resources use descriptor ID plus K in the one canonical store.
  Transaction and stream records retain only accepted descriptor, actor, binding, generation, occurrence,
  and canonical identity facts.
- Rejects: K used as executable input or as a substitute for omitted capabilities; hostile reflection,
  unsupported values, limits above 16 nested levels, 256 value nodes, or 8 KiB KBytes; assertion-cast
  persisted input; silently aliased durable machine/descriptor/state/event/actor identities; actor-private
  canonical resource caches; serialized executable work.
- Observable guarantee: Canonical encoding is synchronous, stable, and owned before admission or
  external work. Structural failures and application-domain failures remain distinct. Secret material
  remains observable unless the application hashes or replaces it before key projection.
- Proof: Canonical-key, receiving-AppPlan compatibility, codec boundary, and one-store identity tests.
- Trace: WIRE-001, WIRE-001A, WIRE-002, WIRE-003; PUBLIC_API API-005 and API-006.

Persisted transaction and stream records are not generic operation refs or serialized executable work.
Descriptor resolution uses the receiving runtime's compiled `AppPlan`; occurrence and post-hydration input
behavior follow WIRE-011, WIRE-012, and `PUBLIC_API.md` API-006. The application codec boundary is
synchronous and pure at the value boundary, returns data accepted by the receiving app, and never encodes
executable work. The deleted subordinate-machine persistence surface has no replacement here.

### Rule card — WIRE-004, WIRE-005, WIRE-006

- Surface: Runtime boot and provider restoration.
- Rule: Provider data is immutable runtime input. Readiness validates the record, acquires the
  Implementation, installs declared persistable actors and the one canonical resource store, completes
  initial ensureActor calls, resolves exact context refs, seals the graph, and only then activates or
  exposes handles. Boot retains app ID, application-owned persistenceVersion, and durable identity facts
  resolved through the receiving AppPlan.
- Accepts: Prepared materialized memory and restored committed bases, generation fencing, overlay
  provenance, stale-completion facts, actor observed-store revisions, exact contextBindings refs and
  provider revisions. Hydrated state is installed without invoking fresh-memory initialization.
- Rejects: public mutable hydration, public boot payload/decoder, unvalidated input, reset revisions,
  preview restoration as executable work, actor-private canonical bases, or a fingerprint API. A
  provider may exclude declared entries by identity-only filter but cannot replace declaration ownership.
- Observable guarantee: Context consumers receive a silent provider-closed baseline before continuing
  activity reconciliation or handle escape. No actor, external work, or public handle escapes failed or
  incomplete bootstrap.
- Proof: Bootstrap ordering, app compatibility, context closure, canonical-store ownership, and
  prepared-installation tests.
- Trace: WIRE-004, WIRE-005, WIRE-006.

The production runtime and `story.app` consume only the optional Persistence provider for restoration.
`RuntimeSetup.construct()` remains synchronous and inert: it may retain app identity, Clock, external
capabilities, and the provider, but it does not acquire an Implementation, create or register actors, start
work, or expose handles. The boot fingerprint is not a public or boot-level API; the package-private
behavior/trace fingerprint is owned and verified by WIRE-020B during artifact construction/import.

### Rule card — WIRE-007, WIRE-008

- Surface: Actor entries, durable refs, and stream-owned persistence.
- Rule: A durable actor requires an authored stable machine-branded actorRef(machine, id, { persist:
  true }); persist is declaration metadata and defaults false. runtime.ensureActor owns restore-or-create.
  runtime.createActor(machine) is ID-free and always creates a fresh opaque local actor. Stable actors
  retain exact refs, machine identity, state, memory, durable bindings, operation facts, issues, and
  observed revisions. Running stream persistence retains declaration/key/generation/ownership/latest
  projection, never the fiber or emission history.
- Accepts: Registered non-disposed stable actors, including suspended ones, and the transitive exact
  context-provider closure. Stable actor wire identity uses the actor: namespace and GLO-01 length-
  prefixed machine and authored-ID segments.
- Rejects: opaque refs in boot, dehydration, artifacts, or CLI selectors; automatic roots, dynamic
  actors, subordinate-machine or parent-child persistence; mailbox, queue, fiber, Scope, callback,
  service, cursor, transport, buffered emission, or pending command serialization; implicit durable
  actors from operation declarations.
- Observable guarantee: Runtime-local actors, tombstones, and disposed stable actors are excluded.
  A captured stream hydrates only after pending outcomes drain, from live P, in a new generation; a
  terminal stream does not restart and missing P fails closed. An included durable consumer depending
  on an opaque provider fails NonDurableContextProvider; Flow never promotes or substitutes it. A
  restored stable actor remains captureable even if the current Runtime did not repeat ensureActor.
- Proof: Stable/opaque ref, transitive closure, stream boundary, missing-input, and non-durable-
  provider tests.
- Trace: WIRE-007, WIRE-008; DEL-002 and DEL-003.

Actor entries retain the exact machine-branded `ActorRef`, materialized state and memory, primitive
identities, current issues, exact referenced refs, and the last store revision observed by that actor.
Included context bindings retain their exact refs and provider revisions. Package-private actor state may
also retain observe revisions, finite-binding cursors, timer due facts, consumed activation facts, and
pending mapped outcomes; queue cells and commands are never serialized. Durable restoration resolves the
stable machine identity through the receiving app's `App.M` and uses `runtime.ensureActor(ref, ...)`; the
ID-free `runtime.createActor(machine, ...)` always creates a fresh opaque local actor. Deleted automatic-root,
dynamic-root, parent-child, and subordinate-machine persistence surfaces have no aliases.

## Capture and hydration

### Rule card — WIRE-009, WIRE-010

- Surface: DehydrateBarrier capture and context-closed hydration.
- Rule: Capture shares the StoreKernel commit window, leases actor selection, captures StoreState once,
  reads each actor atomically, and requires every actor observedStoreRevision <= capturedStoreRevision.
  Capture begins only between completed context-propagation waves and includes the exact static durable
  actor/context closure. Hydration installs the canonical store, rebuilds projections from exact refs,
  restores context providers in dependency order, and installs derived context as a silent baseline.
- Accepts: Unrelated actors at different state-only instants; published actor snapshots; suspended stable
  actors; the exact provider revision observed by each binding.
- Rejects: mixed StoreState captures, newer actor revisions, concurrent closure changes, orphan/partial
  payloads, runtime-local actors, current-projection membership, serialized selected-context overrides,
  synthetic onContext events, subordinate-machine replay, or duplicated actor-owned canonical values.
- Observable guarantee: Concurrent mismatch is retryable ConcurrentDehydrate. Persisted capture is
  revision-consistent on context edges, never replays finite work, and never performs external work while
  capturing or installing a baseline.
- Proof: Commit/capture interleavings, context closure, hydration order, projection rebuild, and
  no-replay tests.
- Trace: WIRE-009, WIRE-010.

Capture membership is derived from declaration metadata, runtime registration, and fixed bindings: it
includes registered non-disposed stable actors declared with `actorRef(..., { persist: true })`, including
suspended stable actors, plus the transitive exact context-provider closure. It excludes automatic roots,
dynamic actors, child actors, current projections, runtime-local actors, incarnation tombstones, disposed
stable actors, and whether the current Runtime repeated `ensureActor`. A durable consumer depending directly
or transitively on an opaque provider fails terminally with `NonDurableContextProvider`; Flow never
serializes, promotes, recreates, substitutes, or rebinds that provider. Partial and orphaned payloads are
forbidden. Hydration rebuilds resource and transaction projections from exact refs and the installed
StoreState, restores the context graph in dependency order, evaluates selectors from restored providers,
and installs derived context as the silent baseline before continuing-activity reconciliation or handle
escape. It never replays or manufactures `onContext` events.

### Rule card — WIRE-011, WIRE-011A, WIRE-012, WIRE-013

- Surface: Nonterminal operation normalization and restored ownership.
- Rule: In-flight resources never resume serialized execution; key-only entries remain passive until a
  live binding supplies P. Running equal-key generations retain pinned P; automatic generations use the
  oldest eligible live binding and explicit refetch uses the caller P. Running streams get a new owned
  generation from live P without replaying emissions. Pending transactions become interrupted; durable
  remote identities become unknown/reconciliation-required and are reconciled with the same identity.
  `K` alone is never executable input and never authorizes a lookup; only a live binding supplies P.
  Restored resources follow PUBLIC_API API-006 collection/ownership rules.
- Accepts: Terminal transaction state in the accepted production representation, latest stream
  projection, passive key-only resource data, and new collection lifetime according to existing policy.
- Rejects: serialized fibers, scopes, cursors, transport sessions, buffered elements, emission history,
  generic automatic transaction retry, invented lookup policy, terminal-stream restart, or a new gcTime
  default in this contract.
- Observable guarantee: Hydration drains pending outcomes before rematerializing continuing declarations;
  finite work is never replayed and missing executable input fails closed.
- Proof: Resource P pinning, stream restart boundary, transaction unknown/reconciliation, and collection
  lifetime tests.
- Trace: WIRE-011, WIRE-011A, WIRE-012, WIRE-013, REV-OPS-003.

Actor-effective resource reads apply only the owner's preview layers; hydration never invents a replacement
lookup policy. A restored nonterminal transaction occurrence is never replayed. If its remote identity is
durable, its projection becomes `unknown` or reconciliation-required and reconciliation reuses that identity.
Terminal transaction state restores only through the accepted production operation representation. Restored
collection and retained-value behavior follow `PUBLIC_API.md` API-006; this contract chooses no restored
idle countdown or new `gcTime` default.

## Artifact path, bounds, history, and Cause

    type NonNegative = number; // accepted only when Number.isSafeInteger(value) && value >= 0
    type CauseProjection = {
      reasons: readonly (
        | { _tag: "Fail"; error: CanonicalCarrier }
        | { _tag: "Die"; defect: CanonicalCarrier | { _tag: "Error"; name: string; message: string } }
        | { _tag: "Interrupt"; fiberOrdinal: NonNegative }
      )[];
    };

### Rule card — WIRE-014, WIRE-015, WIRE-016

- Surface: Persistence/artifact validation and failure categories.
- Rule: Restoration and artifact import/export share one Flow-owned structural validation and encoding
  path and produce the same package-private v2 decoded model. Flow validates versions, identities,
  descriptors, tokens, revisions, and bounds; the application codec validates opaque values before
  runtime construction. DiagnosticCode is closed and failures retain structural, bound, identity,
  decompression, external-input, application, cleanup, interruption, I/O, or invariant ownership.
- Accepts: Stable-key UTF-8 JSON or exactly one gzip member; bounded canonical carriers; non-negative
  safe integer revisions, generations, sequences, timestamps, and counts; strict UTF-8 without lone
  surrogates.
- Rejects: raw parser failures escaping Flow, unsupported prototypes, accessors, symbol keys, sparse
  arrays, cycles, reserved prototype keys, throwing proxies, negative zero in serialized artifact carriers,
  non-finite numbers,
  duplicate keys, concatenated gzip members, trailing bytes, and any envelope exceeding:
  depth 32 (root zero), 10,000 visited nodes, array length 4,096, one string/key 262,144 UTF-8 bytes,
  or 2,097,152 decompressed/canonical bytes. A boot counter at MAX_SAFE_INTEGER is invalid because
  terminal-publication and runtime-cleanup credits must remain available.
- Observable guarantee: A bound diagnostic reports its limit and path separately from version, identity,
  decompression, and application validation. No failure becomes undefined or a generic corrupt-artifact
  result. Raw Effect Cause never enters a carrier.
- Proof: Hostile carrier, gzip, duplicate-key, bound, application-codec, and cause-projection tests.
- Trace: WIRE-014, WIRE-015, WIRE-016.

Internal restoration and artifact import/export use one Flow-owned validation and encoding path. Artifact
and trace decoding produce the shared package-private v2 model consumed by Story and CLI; runtime readiness
applies the same persisted-structure rules before any actor or external work begins, and raw implementation-
library parse failures never escape a public Flow API. Every boot, trace, and behavior codec, including
opaque carriers, uses these limits with no per-envelope override: depth 32 with the envelope root at zero,
10,000 visited scalar-or-container nodes, array length 4,096, one string or property key at 262,144 UTF-8
bytes, and 2,097,152 decompressed or canonical-encoded UTF-8 bytes. Compressed import stops when the
decompressed limit is crossed. Bound diagnostics report limit and path separately from version, identity,
decompression, and application-domain failures.

### Rule card — WIRE-017, WIRE-018, WIRE-019, WIRE-020

- Surface: Committed runtime evidence, bounded inspection, and export.
- Rule: One immutable TurnRecord is accepted after actor publication and before acknowledgement and
  StoreFanout release, using one runtime-global sequence behind a release gate. The global commit permit
  and next sequence reservation are acquired before StoreState mutation; publication/capture, TurnRecord
  acceptance, acknowledgement, gate opening, and StoreFanout release then occur in that order. Lifecycle records are
  inspection evidence, not machine turns. Inspection buffering is explicit, bounded, and attach-once;
  capacity defaults to 256 and zero retains no records but preserves truncation. Runtime observation is
  not persistence; only explicit export makes records durable.
- Accepts: Frozen inspection-sink snapshots with records and `truncatedBeforeSequence`; attachment drain/dispose
  ordered through the accepted prefix; changed refs as revision-local hints; late attachment markers set
  to the greatest unseen runtime-global sequence.
- Rejects: a second mutable history, inline sink processing that delays StoreFanout, silent dropping,
  mixed-runtime attachment, actor-owned retention, persisted inspection buffers, or treating a skipped
  revision-local hint as a complete historical diff.
- Observable guarantee: Inspection-buffer snapshots expose `truncatedBeforeSequence` as the greatest
  dropped or explicitly cleared runtime-global sequence; this WIRE-018 inspection marker is not the
  WIRE-020B `TraceArtifact` marker. Clear does not reset sequence. Sink failure cannot roll back runtime
  state and is isolated to that attachment. `clear()` advances only through the retained tail; accepted
  queued records may arrive afterward. Attachment uses one CAS, attaches once, and drains only its accepted
  prefix before detaching. Disposal drains accepted evidence before detaching. A fresh snapshot starts at
  publication revision zero; hydration restores persisted publication and machine-turn revisions.
  actor:start, actor:restore, actor:suspend, actor:resume, and actor:dispose are lifecycle evidence only,
  never machine revisions or TurnRecords. The exact sink surface is snapshot() plus clear(); one sink
  attaches once to one Runtime. After the release gate opens, receipt, inspection, trace, CLI, and optional
  artifact sinks may process the record; sink processing or failure never delays StoreFanout or mutates
  committed state. The buffer surface is exactly `snapshot(): { records: readonly InspectionRecord[];
  truncatedBeforeSequence: number | null }` and `clear(): void`; a pre-attachment snapshot is empty with a
  null marker. A late attachment marks the current runtime-global sequence as missing unless that sequence
  is zero. Attachment drain and disposal wait only through their accepted prefixes, and a sink callback
  failure is isolated to that attachment. Actor admission and ordinary commits preflight the changing
  actor, store, and sequence reserves required by the cleanup contract. Runtime disposal preserves
  reverse-dependency cleanup ordering and never manufactures a terminal actor-disposal turn.
- Truncation boundary: Inspection-buffer and trace-artifact truncation markers are different surfaces and
  are not interchangeable. `TraceArtifact.truncatedBeforeSequence` is null exactly when the trace contains
  the complete retained prefix; otherwise it is the first omitted runtime-global sequence. An export MUST
  derive the trace marker from the first sequence omitted by the trace's retained prefix rather than copy
  the inspection marker or apply a fixed increment/decrement; the contract defines no arithmetic conversion
  between the two fields. A WIRE-020B decoder MUST interpret its field using the first-omitted rule and
  reject a marker inconsistent with the trace's retained prefix.
- Proof: Publication ordering, lifecycle/turn distinction, capacity/truncation, late attachment,
  sink failure, drain, and explicit-export tests.
- Trace: WIRE-017, WIRE-018, WIRE-019, WIRE-020.

TurnRecords become durable only when a caller explicitly exports records from a configured sink. Ordinary
runtime buffering and inspector subscriptions do not imply persistence; export preserves record order,
truncation markers, app identity, and format version. A StoreState TurnRecord may include exact changed refs
for its revision, but a consumer that skips revisions must perform a full relevant reread rather than combine
an incomplete latest hint into a historical diff.

## Exact v2 behavior, trace, and CLI model

### Rule card — WIRE-020A, WIRE-020B

- Surface: BehaviorArtifact, TraceArtifact, Story evidence, Cause projection, and CliResult; the complete
  nested wire model is mirrored in `ARTIFACT_WIRE.md`.
- Rule: Behavior and trace artifacts use one exact package-private schema. Canonical JSON sorts object
  keys by UTF-8 bytes, sorts ID-indexed declaration arrays and requirement lists by the same comparator,
  preserves authored child/event/checkpoint/record/Cause/fact order, uses JSON.stringify finite numbers,
  performs no Unicode normalization, and adds exactly one trailing newline only at the file boundary.
  The shared decoded model is the only handoff to Story and CLI; text, JSON, and file publication are
  projections, not schemas. `CLI.md` `CLI-008` owns deterministic text/JSON formatting and this contract
  owns only the decoded data and envelope fields.
- Accepts: A behavior artifact with kind behavior-contract, version flow-state/behavior-contract.v2,
  appId, persistenceVersion, appPlanFingerprint, requirements, modules, machines, and app/machine Story
  metadata. It contains declarations and coverage identity only. A trace artifact has kind
  trace-artifact, version flow-state/trace-artifact.v2, storyId, appId, persistenceVersion,
  appPlanFingerprint, capturedAt, truncation marker, ordered TurnRecord/LifecycleRecord projections,
  checkpoints, outcome, end, failure, and cleanup. App Story checkpoints support
  `checkpoint.actor(storyActor | actorRef)` and reserved runtime metadata. Operation facts are the closed resource/transaction/
  stream unions; context, store, timer, and issue facts retain their exact identities and order.
- Rejects: callbacks, Effects, fixtures, runtime actors, live refs, runtime state, legacy final or
  children, Scenario/v1 shapes, unknown members, omitted nullable fields, malformed operation
  discriminants, invalid lifecycle tuples, duplicate checkpoint names, unresolved requirements,
  duplicate IDs, bad state defaults, invalid Story metadata, and appPlanFingerprint mismatch. The
  fingerprint is private lowercase hexadecimal SHA-256 over canonical { appId, persistenceVersion, requirements,
  modules, machines } without stories or trailing newline; no fingerprint API is public.
- Observable guarantee: Completed trace evidence has non-null end, failure null, and complete cleanup.
  Failed evidence has failure and root cleanup status agreeing with its cleanup diagnostics. end is
  named end, never final, and never implies actor completion. Missing or inconsistent truncation markers
  reject. Every nullable field is serialized as null. Artifacts are uncompressed stable-key UTF-8 JSON
  with one trailing newline.
- Proof: Exact canonical encoding, fingerprint, schema rejection, operation-fact discriminants,
  lifecycle tuples, Story evidence invariants, and direct Story/CLI decoded-model parity.
- Trace: WIRE-020A, WIRE-020B; exact unions, nullable fields, bounds, and diagnostic codes are owned by
  this file and mirrored by `ARTIFACT_WIRE.md`; BEH-033 closed by REV-MIG-005.

The package-private behavior builder owns the plan fingerprint's preimage and the artifact encoder owns
recomputation and verification of the emitted field. Import compares the decoded fingerprint with the
receiving compiled AppPlan and rejects a mismatch as `ArtifactIdentityMismatch`; boot and the public API do
not expose a fingerprint or collision-resolution API. The normalized `requirements` table emits one record
per static requirement identity, and every operation requirement ID resolves to exactly one record. The
condition-to-code mapping is fixed: invalid IDs use `InvalidDescriptorId`; duplicate IDs and duplicate
operation or slot IDs use `DuplicateDescriptorId`; duplicate machine values use `DuplicateMachineValue`;
duplicate module ownership uses `DuplicateModuleOwnership`; missing module references use
`MissingModuleReference`; invalid defaults use `InvalidStateDefault`; unresolved operation requirements
use `UnresolvedRequirementId`; invalid Story metadata uses `InvalidStoryMetadata`; malformed trace records
use `InvalidTraceRecord`; impossible lifecycle combinations use `InvalidLifecycleTransition`; and
inconsistent end/failure/cleanup evidence uses `InvalidStoryEvidence`. A valid artifact carries exact
category, path, and bound details for the selected diagnostic rather than collapsing the failure to
`undefined` or a generic corrupt-artifact result.

The complete local wire notation, including nested behavior declarations, lifecycle records, StoryFailure,
operation-fact unions, diagnostics, and CLI result/error unions, is mirrored in `ARTIFACT_WIRE.md` for Story
and CLI. That file does not extend or override this contract; any mismatch resolves to this file, which remains
the semantic and schema authority for WIRE-020A/B, capture, and publication.

Resource facts are missing, pending, ready, refreshing, failure, defect, or interrupted; transaction
facts are idle, pending, success, failure, defect, interrupted, or unknown with reconcileRequired true;
stream facts are idle, running, complete, interrupted, failure, or defect with the exact
hasValue/latest/emissionCount union. Context, store, timer, and issue facts retain their closed fields.
Missing/idle operation lanes use null generation and occurrence where specified; the decoder rejects
missing, extra, or inconsistent generation, occurrence, retention, latest, and reconciliation fields
with InvalidTraceRecord before application or Runtime acquisition.

CliCommand is exactly behavior.build, behavior.render, behavior.diff, behavior.check, story.list,
story.describe, story.run, trace.summarize, trace.proof, or trace.diff. Build/render/list/describe/story.run
use completed; behavior and trace comparisons use equal/different, with trace incomplete when retained
facts match but either trace is truncated; trace.summarize uses completed or incomplete. trace.proof
requires complete evidence. Story-run execution, cancellation, cleanup, and trace-write failures use
CliError with partial Story failure primary and ordered secondary diagnostics. Only in-process
FlowDisposeError and FlowStoryExecutionError retain complete Effect Cause.Cause<unknown>; serialized
Cause is the ordered CauseProjection above, preserving Effect v4 traversal order and multiplicity.
FlowStoryExecutionError carries one deeply frozen package-owned envelope with completed checkpoints,
optional end, failure boundary, primary diagnostic, ordered cleanup diagnostics, cancellation evidence,
accepted/drained evidence-sequence facts, and the complete public Cause. A cleanup failure retains end
when it was captured but never returns successful Story evidence; failure before end capture never
manufactures run.end.

## Story evidence

### Rule card — WIRE-021, WIRE-022, WIRE-023, WIRE-024

- Surface: Checkpoints, run.end, cancellation, cleanup, and pure model artifacts.
- Rule: A checkpoint captures an atomic published evidence cut for exact actor targets, runtime pending
  work, and TestClock time. App evidence resolves storyActor or ActorRef; machine evidence exposes its
  one snapshot. Cancellation closes admission, preserves partial evidence, awaits non-abortable cleanup,
  and fails. Success implies complete disposal; run.end is evidence, not actor finality. Pure model
  artifacts accept only a command-empty fresh story.machine plan and contain no executable Effect. They do
  not stand in for app Story cross-actor orchestration or persist fixture-declared outcomes.
- Accepts: Deeply frozen named checkpoints and end, actor issues in snapshots, runtime.now and
  runtime.pendingWork, completed-checkpoint/failure-boundary/cleanup/evidence-sequence facts, and
  canonical pure state-key projections.
- Rejects: work processing, time movement, actor creation, restoration, live lookup, external work,
  manufactured end evidence after end-capture failure, successful return after cleanup failure, model
  Effects, runtime-backed traversal, fixture Implementation instantiation, hidden candidate registries,
  candidate event sets, persisted fixture-declared outcomes, or model-owned replay. Pure model discovery
  accepts only a command-empty fresh `story.machine` plan; candidates belong to the traversal call and the
  base Story remains command-empty. Model artifacts never serialize or execute transaction Effects, stream
  programs, patch functions, runtime fibers, Queues, Deferreds, or Scopes.
- Observable guarantee: Every capture uses the DehydrateBarrier, one store revision, published actor
  snapshots, TestClock, and accepted evidence prefix. A failed run retains completed checkpoints and
  truthful cleanup; FlowStoryExecutionError retains the complete public Cause only in process. A model
  path becomes an ordinary live Story and uses the production runtime.
- Proof: Atomic checkpoint/end cuts, cancellation and signal paths, cleanup aggregation, Cause privacy,
  model purity, and live/model parity tests.
- Trace: WIRE-021, WIRE-022, WIRE-023, WIRE-024; TEST-014 and TEST-015.
