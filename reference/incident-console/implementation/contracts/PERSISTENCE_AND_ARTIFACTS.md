# vNext persistence and artifact contract

This contract defines the durable identity domain, runtime-boot envelope, revision-consistent
capture, TurnRecord export, and story evidence. All Flow-owned envelopes are v2 and are
decoded and encoded through private Effect Schema codecs.

## Canonical durable values

### WIRE-001 — One finite JSON-like carrier defines identity

Canonical ref arguments and keys MAY contain `null`, strings, booleans, finite numbers,
readonly arrays of canonical values, and readonly string-keyed plain records of canonical
values. Record keys MUST be sorted during canonical encoding. `undefined`, bigint, symbols,
functions, class instances, cycles, sparse arrays, and non-finite numbers MUST be rejected
synchronously at ref construction.

### WIRE-002 — Exact refs retain descriptor ID and arguments

A durable resource or transaction ref MUST contain the descriptor ID and canonical argument
value sufficient to reconstruct the ref and rerun its operation. A projected key alone MUST
NOT be treated as restart input. Deserialization resolves the descriptor only through the
runtime's compiled `AppPlan`.

### WIRE-003 — Flow validates structure; applications validate domain data

Flow owns validation of artifact versions, app identity, descriptor IDs, token IDs, exact
refs, primitive statuses, revisions, and structural bounds. Actor memory and domain payloads
remain opaque. An application that changes them MUST migrate and validate the unknown value
before passing boot to Flow.

## Runtime boot v2

### WIRE-004 — Boot is immutable runtime input

The only hydration surface is `flow.runtime({ app, layer?, boot? })`. Its private,
service-free structural Schema MUST decode boot synchronously during construction so the
prepared hydrated snapshot exists before any host read or root activation. A runtime MUST
NOT expose mutable `hydrateBoot`, and v1 or unknown artifacts MUST fail with a version
diagnostic rather than being guessed into v2.

### WIRE-005 — The v2 envelope carries compatibility identity

The envelope MUST contain the Flow artifact version, Flow definition-format version,
explicit app ID, application-owned persistence version, and bounded extensions. A mismatch
MUST be rejected before Layer-dependent work or root activity begins.

### WIRE-006 — The v2 envelope carries one canonical store

The store section MUST contain its captured revision, authoritative resource bases,
freshness timestamps, lookup-generation history needed to suppress stale completion, and
materialized ordered optimistic overlays. Placeholder projections and Effect programs MUST
NOT be persisted.

### WIRE-007 — Actor entries retain ownership and observation identity

Each actor entry MUST contain actor ID, machine ID, root or dynamic kind, parent identity or
stable host ID where applicable, materialized state and memory, primitive identities,
receipts and issues required by the snapshot contract, exact referenced refs, and the last
store revision observed by that actor. It MUST also retain materialized activity identities,
activation generations, and active or consumed state so restoration does not rerun selectors
or finite work. Canonical resource values MUST NOT be duplicated as independent actor-owned
bases.

### WIRE-008 — Durable dynamic actors require stable identity

An omitted dynamic actor ID creates a runtime-local opaque identity and is not restorable.
A restorable dynamic actor MUST have an explicit stable host ID or a stable parent-child
activity key. Root IDs are always `${app.id}/root/${machine.id}`.

## Capture and restoration

### WIRE-009 — Dehydration is revision-consistent, not linearizable

A dehydration Effect MUST capture StoreState exactly once. It MUST read each actor through
its internally atomic snapshot boundary and retain that actor's observed store revision.
Actors MAY represent different instants. The envelope MUST NOT claim one globally
linearizable multi-actor cut.

### WIRE-010 — Hydration rematerializes projections

Hydration MUST install the canonical store and then rebuild each actor's resource and
transaction projections from its exact refs and the installed StoreState. Recorded store
revisions explain capture skew; duplicated actor resource values MUST NOT override the
canonical base.

### WIRE-011 — Pending resource execution normalizes safely

An in-flight lookup MUST NOT resume from serialized execution. Hydration retains any last
canonical value, removes placeholder data, records the interrupted generation, recomputes
freshness from the runtime Clock, and lets reconstructed activity ownership decide whether
ordinary policy starts a new lookup.

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
through `Schema.decodeUnknownSync`, translating its failure to a structured Flow boot
diagnostic so boot can produce a prepared snapshot before returning. Both paths MUST share one
Schema and identical validation rules; raw Schema errors MUST NOT escape a public Flow API.

### WIRE-015 — Artifact decoding preserves failure categories

Unsupported version, malformed structure, violated bounds, invalid canonical carrier,
unknown descriptor, and decompression failure MUST remain distinguishable Flow diagnostics.
Opaque-domain migration and validation happen in application code before runtime
construction, so Flow MUST preserve an application-reported failure rather than relabel it as
a Flow decode failure. Import MUST NOT collapse any of these failures to `undefined` or a
generic corrupt-artifact result.

### WIRE-016 — Durable envelopes are bounded

Codecs MUST enforce finite depth, node, array, string, and total payload limits before
allocating unbounded runtime structures. Cycles and arbitrary class instances MUST be
rejected rather than traversed or stringified heuristically.

## TurnRecords, inspection, and exported artifacts

### WIRE-017 — TurnRecord is the sole committed history event

One immutable TurnRecord MUST be created from each committed actor turn after actor
publication. Receipts, inspection events, traces, CLI events, and optional artifact records
MUST be projections delivered to sinks from that record. No second runtime-owned mutable
history may compete with actor snapshots and TurnRecords.

### WIRE-018 — Inspection buffering is bounded and explicit

`createInspectionBufferSink()` MUST default to capacity 256. A caller MAY choose another
non-negative integer capacity; zero retains no records while preserving truncation counts.
When records are evicted, reads and exports MUST include an explicit truncation marker
carrying enough sequence or count information to identify the missing prefix; silent
dropping is forbidden.

### WIRE-019 — Runtime observation is not persistence

TurnRecords become durable only when a caller explicitly exports records from a configured
sink. Ordinary runtime buffering, receipts in the current actor snapshot, and inspector
subscriptions MUST NOT imply persistence. Artifact export MUST preserve record order,
truncation markers, app identity, and format version.

### WIRE-020 — Changed refs are revision-local hints

A StoreState TurnRecord MAY include the exact changed refs for its revision. An importer or
consumer that skips revisions MUST perform a full relevant reread; it MUST NOT combine or
trust an incomplete latest hint as a historical diff.

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

Pure behavior discovery MAY persist event plans, fixture-declared outcomes, checkpoints, and
model diagnostics. It MUST NOT serialize or execute transaction Effects, stream programs,
patch functions, runtime fibers, Queues, Deferreds, or Scopes.
