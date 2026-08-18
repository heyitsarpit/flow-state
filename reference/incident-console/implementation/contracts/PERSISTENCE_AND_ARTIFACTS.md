# vNext persistence and artifact contract

Status: normative target vNext contract; not shipped

This contract defines the durable identity domain, runtime boot, revision-consistent capture, TurnRecord
export, and Story evidence. Flow-owned persistence and artifact values remain bounded and must represent the
accepted app, actor, operation, lifecycle, compound-state, and Story identities.

This contract is the sole Flow-owned vNext internal schema authority for boot, behavior artifacts, trace
artifacts, Story evidence, and the package-private decoded model consumed by the Story runner and CLI. It
owns the shared validation/codec boundary and semantic invariants; [`CLI.md`](./CLI.md) owns command and
transport behavior but does not define a competing artifact or evidence schema. The shared decoded model
is internal and is not a public package type or a promise that any unresolved member is exported.

`BEH-033` status: open — exact artifact, trace, and CLI schema closure is incomplete and not shipped. Until
that item closes, this contract MUST NOT freeze an exact envelope, version, field set, Cause projection,
diagnostic union, or codec representation that the accepted public contracts have not resolved. The
non-normative [`DESIGN_BEHAVIOR_DISPOSITIONS.md`](../archive/provenance/DESIGN_BEHAVIOR_DISPOSITIONS.md) and
[`DESIGN_BEHAVIOR_SOLUTIONS.md`](../archive/provenance/DESIGN_BEHAVIOR_SOLUTIONS.md), and
[`OPEN_QUESTIONS_AND_FUTURE_EXPLORATIONS.md`](../OPEN_QUESTIONS_AND_FUTURE_EXPLORATIONS.md), Phase 0
fixtures/goldens, and phase receipts are inputs or evidence only; none is schema authority or
shipped-behavior evidence by itself.

## Canonical durable values

### WIRE-001 — Operation identity follows the accepted `P`/`K` split

Operation identity MUST follow the accepted `P`/`K` split. `P` is the complete immutable executable
input retained by a live binding or admitted generation and is never operation identity. `K` is the
ordered readonly canonical tuple returned synchronously by `key(P)`; exact operation identity is the
descriptor ID plus `K`. `P` MUST NOT be reconstructed from `K`, and equal `K` values MUST NOT be used to
switch clients or other omitted capabilities.

Canonical `K` MUST contain only `null`, booleans, strings, finite numbers, readonly arrays, and plain readonly
records. Canonicalization MUST sort record keys and normalize `-0` to `0`. It MUST reject `undefined`,
non-finite numbers, bigint, symbols, functions, accessors, class instances, mutable structures, cycles, and
branded secret values. It MUST be validated synchronously before ownership, mutation, admission, or external
work, using the accepted limits of 16 nested levels, 256 total value nodes, and 8 KiB in the canonical
encoding. The exact byte grammar, hostile-reflection behavior, and copying/freezing rule remain unresolved
under `BEH-027`; this contract MUST NOT choose among those alternatives. Secret material remains observable in
persistence, inspection, diagnostics, and artifacts unless the application hashes or replaces it before key
projection.

### WIRE-001A — Canonical encoding remains unresolved

Canonical key equality MUST use the accepted ordered `K` result. The exact canonical byte grammar and
encoding used for equality, persistence, diagnostics, and artifacts remain owned by `BEH-027`; this
contract MUST NOT prescribe a JSON spelling, a string normalizer, a duplicate-key policy, or an artifact
newline rule beyond any separately retained file-publication clause.

### WIRE-002 — Persisted operation facts preserve descriptor identity

Persisted resource entries MUST use the descriptor ID plus canonical `K` identity owned by the runtime's
single canonical resource store. A persisted entry MUST NOT introduce an actor-private cache or a second
projected resource identity. Live bindings and generations retain their complete executable `P` as required
by `REV-OPS-003`; `K` alone is not executable input and does not authorize a lookup.

Persisted transaction and stream records MUST retain only the accepted descriptor, actor, binding, generation,
occurrence, and canonical-identity facts needed by their owning production kernels. They MUST NOT be treated
as generic operation refs or as serialized executable work. Descriptor resolution MUST use the receiving
runtime's compiled `AppPlan`; exact occurrence and post-hydration input behavior remains under the applicable
unresolved operation boundaries.

### WIRE-003 — Flow validates structure; applications validate domain data

Flow owns validation of artifact versions, app identity, exact machine-branded actor identities, descriptor
IDs, token IDs, primitive statuses, revisions, and structural bounds. Actor memory and domain payloads remain
opaque. Unknown boot storage MUST enter through the app-branded boot boundary, where Flow validates the
structure first and the application validates or normalizes each opaque slot before the value reaches the
production runtime. Application code MUST NOT assertion-cast the brand or pass unknown data directly to the
runtime.

Boot MUST be compatible with the receiving app and its compiled `AppPlan`. Changing durable machine IDs,
declaration slots, state/event tokens, or the app's `persistenceVersion` MUST NOT be silently guessed into
the new plan. The accepted revision does not add a generic Flow identity-migration API; incompatible boot
must remain a rejected input for the owning application/runtime path.

The application domain-decoder boundary MUST preserve the distinction between Flow-owned structural
validation and application-owned opaque values. Its exact locator union, callback mechanics, and artifact
encoding are not redefined by the accepted revisions. The deleted subordinate-machine persistence surface
has no replacement here and MUST NOT survive as active contract fields. Any application decoder used for
boot MUST be synchronous at the host boundary and MUST return data accepted by the receiving app; this
contract does not add a codec, envelope, default, or diagnostic shape.

## Runtime boot

### WIRE-004 — Boot is immutable runtime input

The production runtime and `story.app` MUST consume only an app-compatible, app-branded boot payload for
the receiving `App`. A boot payload may come from the same app's dehydration boundary or the accepted
application validation boundary; an unknown or incompatible payload MUST be rejected rather than guessed into
the current plan. Flow MUST NOT expose mutable `hydrateBoot`. Boot installation MUST use materialized actor
memory and MUST NOT invoke a definition's fresh-memory initializer.

Initial construction MUST install and validate boot actors, complete the production factory's initial
`ensureActor` calls, resolve exact context-provider refs, seal the instance graph, and only then activate or
expose a runtime or actor handle. Hydration MUST establish each consumer's silent context baseline before
initial continuing-activity reconciliation or handle escape.

### WIRE-005 — Boot carries compatibility identity

Boot compatibility MUST retain the receiving app identity, its application-owned `persistenceVersion`, and
the durable machine, state/event, descriptor, and actor identity facts required to resolve the payload through
the receiving compiled `AppPlan`. A changed durable identity or persistence version MUST NOT be silently
aliased to the current app. The exact envelope members and any plan-fingerprint representation remain part of
the coordinated artifact closure and MUST NOT be invented here.

### WIRE-006 — Boot carries one canonical store

The store section MUST represent the one runtime-scoped canonical resource store, keyed by descriptor ID
and canonical `K`; actors MUST retain ownership and projections rather than private canonical resource caches.
It MUST preserve committed bases, generation fencing, actor-scoped overlay provenance, and stale-completion
facts needed by the production kernels. Uncommitted previews are never restored as executable work or made
visible to another actor; a restored nonterminal owner becomes `unknown` or reconciliation-required. This
contract MUST NOT invent a descriptor persistence predicate, a selective warm-data rule, or a new cache API.

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
shared actor across runtime restarts; a generated opaque ref identifies a local actor and is neither durable nor
restorable. `actorRef(machine, id)` is an inert identity and MUST NOT create an actor. Durable restoration MUST
resolve the stable machine identity through the receiving app's `App.M` and MUST use `runtime.ensureActor(ref,
...)` for restore-or-create ownership. `runtime.createActor(machine, ...)` remains ID-free and always creates a
fresh local actor with an opaque ref. The deleted `runtime.actor(machine, { id })`, automatic-root, dynamic-root,
and parent-child persistence surfaces MUST NOT survive as aliases.

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

The exact durable actor membership, including treatment of suspended stable actors and runtime-local
tombstones, remains unresolved under `BEH-004`. This contract MUST NOT derive membership from automatic roots,
dynamic actor categories, child actors, or current actor projections. An included durable consumer with a direct
or transitive dependency on an opaque local provider MUST fail terminally with the accepted
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

Collection, ownership, and retained-value behavior for restored resources remain part of the unresolved
operation state and collection contract under `BEH-023`. This contract does not choose a restored idle
countdown, a `gcTime` default, or a collection publication rule.

## Artifact codecs and failures

### WIRE-014 — Flow owns one validated boot and artifact path

Boot and artifact import/export MUST use one Flow-owned validation and encoding path that preserves the
distinction between structural Flow failures and application-owned opaque-domain validation. Artifact and
trace decoding MUST produce the shared package-private vNext decoded model owned by this contract, which is
consumed by both Story and CLI. The runtime constructor remains a synchronous host boundary and MUST apply
the same boot-structure rules as the accepted application boot boundary before any actor or external work
begins. Raw implementation-library parse failures MUST NOT escape a public Flow API, but the accepted
revisions do not prescribe a codec library, method name, version, envelope, or internal error translation
shape.

The production bootstrap owns boot validation, constructor phase ordering, and prepared installation. The
resource, transaction, stream, artifact, and Story owners MUST use the production kernels and accepted
schemas rather than a second hydration, operation, Story, or artifact interpretation path.

### WIRE-015 — Artifact decoding preserves failure categories

Artifact import MUST preserve the distinction between structural, bound, identity, external-input, and
application-domain failures required by the retained artifact path. Opaque-domain validation happens before
runtime construction, so Flow MUST preserve an application-reported failure rather than relabel it as a Flow
decode failure. The exact closed diagnostic categories remain part of `BEH-033`; import MUST NOT collapse a
failure to `undefined` or an invented generic corrupt-artifact result.

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

Prepared fresh and hydrated revision-zero snapshots are construction facts, not committed turns, and create
no `TurnRecord`. Actor lifecycle transitions, including `actor:start`, `actor:restore`, `actor:suspend`,
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
Failure evidence MUST retain completed checkpoints, the failure boundary, primary Cause, and cleanup truth.
The exact artifact envelopes and nested members remain part of the coordinated artifact closure under
`BEH-033`; this contract MUST NOT invent a field, codec, envelope version, or replacement for the accepted
Story and actor identities. The shared decoded model is the sole internal handoff between artifact decoding,
Story evidence, and CLI projections; text, JSON, and file publication are projections of that model, not
independent schema authorities.

### WIRE-020B — Artifact Cause projection remains unresolved

In-memory inspection retains the original Effect v4 `Cause`. Export and import MUST preserve complete
failure evidence rather than stringify, drop, or silently collapse it. The artifact Cause projection,
accepted reason envelope, handling of defects and interruptors, noncanonical-payload diagnostics, and
exact nested members remain unresolved under `BEH-033`; this contract does not choose a projection
shape, codec, or diagnostic name.

If compressed artifact input is retained by the coordinated artifact path, its compressed-input and
decompressed-output counters MUST remain independent streaming caps and stop reading as soon as their own
limit is exceeded; canonical encoded size is checked again after artifact encoding. The accepted revisions do
not choose a compression member format or import representation.

## Story evidence

### WIRE-021 — Checkpoints capture immutable published evidence

A story checkpoint MUST capture the published evidence for its exact actor targets, the runtime pending-work
inventory, and the TestClock time at that command boundary. App Stories MUST expose exact actor evidence
lookup, while a machine Story exposes its single actor snapshot. Checkpoint capture MUST be atomic and MUST
NOT process work, move time, or copy an independently mutable issue or resource registry.

### WIRE-022 — Cancellation preserves partial evidence and cleanup truth

Story cancellation MUST retain completed checkpoints and truthful failure and cleanup evidence, await
production disposal, and fail rather than return success. The exact public failure-result members, cleanup
aggregation, and primary/secondary Cause representation remain unresolved under `BEH-022` and `BEH-033`;
this contract does not choose them.

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
