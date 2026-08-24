# Normative proof matrix

Status: normative contract proof matrix.

## Surface and rule

This matrix defines evidence required to claim the accepted revision surface correct. A green test count does
not close a proof unless it exercises the named mechanism through its production owner. Filename scans,
exported-token scans, and helper-placement assertions cannot substitute for type, behavior, race,
interruption, lifetime, or artifact evidence.

`REV-MIG-003` requires compile-time proofs to preserve exact machine, actor-ref, event, input, context, memory,
operation, selected-value, Story-target, observation, and checkpoint types. Runtime proofs exercise the real
actor lifecycle, mailbox, context graph, scheduler, operation kernels, inspection, persistence, evidence
capture, and cleanup paths. Focused source-text or type checks never stand in for behavior proofs.

`PROOF-*` rows are requirements, not task-closure units. Retired Phase 0 subcase IDs and receipts are historical
evidence only: they add no semantic authority and do not choose current ownership. Current executable proofs
are owned by production code and tests named by the implementation task and this matrix.

## Cross-contract traceability

### Accepted revision ownership

| Accepted source area | Revision IDs | Central proof rows |
| --- | --- | --- |
| Composition and app plans | `REV-COMP-001`–`REV-COMP-015` | `PROOF-001`, `PROOF-002`, `PROOF-004`, `PROOF-005`, `PROOF-012`, `PROOF-014`, `PROOF-015` |
| Machine authoring | `REV-MACH-001`–`REV-MACH-011` | `PROOF-001`, `PROOF-002`, `PROOF-003`, `PROOF-017` |
| Operations | `REV-OPS-001`–`REV-OPS-018` | `PROOF-001`, `PROOF-003`, `PROOF-005`–`PROOF-007`, `PROOF-009`, `PROOF-014` |
| React and hosts | `REV-HOST-001`–`REV-HOST-008` | `PROOF-001`, `PROOF-003`, `PROOF-004`, `PROOF-005`, `PROOF-012`, `PROOF-013` |
| Stories and testing | `REV-TEST-001`–`REV-TEST-010` | `PROOF-001`, `PROOF-003`, `PROOF-004`, `PROOF-008`–`PROOF-011` |
| Migration and proofs | `REV-MIG-001`–`REV-MIG-006` | all affected rows; cross-cutting closure in `PROOF-017` |
| Deletions and cutover | `REV-MIG-004`, `DEL-001`–`DEL-011`, `RET-001`–`RET-005` | `PROOF-017` |

### Revision-specific obligations

The rows below refine central proof owners; they do not create a runtime receipt system. An implementation
proof record names the exact executable test, fixture, example, or artifact evidence when it exists, and keeps
the obligation open when it does not.

| Revision | Obligation | Central proof rows |
| --- | --- | --- |
| `REV-OPS-015` | StoreFanout ordering: canonical-only fanout enters actor mailboxes; initiating publication precedes recipients; stale/unrelated revisions do not publish; only adjacent projection-only facts coalesce. | `PROOF-003`, `PROOF-006` |
| `REV-OPS-015` | Actor-scoped preview/CAS: owner-only visibility; promotion, rollback, post-boundary unknown, and canonical-base CAS preserve canonical truth and issue evidence. | `PROOF-005`, `PROOF-007` |
| `REV-OPS-015` | Projection-only publication: one complete immutable snapshot without transition evaluation; mapped events are later ordinary mailbox turns. | `PROOF-003`, `PROOF-006`, `PROOF-007` |
| `REV-OPS-015` | Latest stream projection/hydration: latest value, `hasValue`, emission count, generation, and terminal status update without replay; live executable input is required for rematerialization. | `PROOF-007`, `PROOF-014` |
| `REV-OPS-015` | Timer polling: `after` targets an explicit refresh event, one exact-key refresh is in flight, scheduling follows settlement, and suspension/disposal fences it; no implicit retry or `poll` API. | `PROOF-009` |
| `REV-HOST-007` | Passive `useView` dependency replacement: exact descriptor/`K` reads are recorded per evaluation, replaced after evaluation, matching StoreFanout reruns at one tear-free boundary, and selection does no work or mutation. | `PROOF-012` |
| `REV-OPS-017` | Exact resource/transaction/stream unions narrow with typed `K`; retained values, post-boundary `unknown`, stream latest/count/generation, passive cross-actor reads, and duplicate-live-stream rejection. | `PROOF-001`, `PROOF-005`, `PROOF-014` |
| `REV-OPS-018` | Bounded invalidation/clear: target validation, stable expansion/deduplication, 256-identity bound, missing/zero-match no-op, one revision, active-work fencing, no direct lookup. | `PROOF-006`, `PROOF-007` |
| `REV-HOST-008` | Construction-owned seeding/trusted host writes: seed validation and duplicate rejection, capability provenance/revocation, StoreKernel fencing/fanout, no occurrence or public writer. | `PROOF-005`, `PROOF-006`, `PROOF-014` |
| `REV-MIG-005` | V2 artifact/CLI and public error Cause: bounded round-trip, ordered CauseProjection, Story/CLI parity, exact result envelope, Cause preservation, atomic publication, legacy-shape rejection. | `PROOF-001`, `PROOF-008`, `PROOF-010`, `PROOF-014`, `PROOF-017`, `CLI-P01`, `CLI-P02` |
| `REV-MIG-006` | Child-capability removal: compile/runtime single-actor recursive states, explicit-actor replacement, persistence/artifact/CLI absence. | `PROOF-001`, `PROOF-002`, `PROOF-003`, `PROOF-011`, `PROOF-014`, `PROOF-015`, `PROOF-017` |

## Proof family: types, composition, and admission

```ts
App.M
P // complete executable input
K // canonical operation identity
actorRef // stable identity
```

### PROOF-001 — Public typing and inference

- Surface: definition-owned input/memory inference; inherited readonly context and exact bindings; recursive
  states/configuration through the ten-level bound; named modules; closed `App.M`; exact `O`; `P`/`K`; refs,
  leases, hooks, closed Story options, targets, observations, checkpoints, `run.end`, and machine/event/
  selected-value/resource/transaction/stream/input/context/memory/lifecycle domains.
- Rule: public declarations preserve exact accepted types and remain practical to instantiate.
- Accepts: source and packed declarations, strict, isolated modules, isolated declarations, multi-entry
  consumers, packed React 18/19 consumers, accepted Story values through the testing route, and the typed
  failure boundary without naming an unresolved failure class.
- Rejects: invalid recursive config; missing/extra compound nodes; non-direct defaults; depth eleven;
  wrong-machine events; missing input/context; extra closed-option fields; invalid binding keys or recipe/ref
  bindings; invalid Story targets; `P`/`K` misuse; per-registration selector comparators; deleted imports.
- Observable guarantee: selectors require the selected-value type and explicit nullable domains; initial
  results have no previous value; changes expose the immediately preceding selected value; complete values use
  `Object.is`; named-record fields suppress independently; structured results are fresh; selectors are pure;
  context has one current/previous pair per change, no intermediate projection combination, and no equal-result
  context work.
- Proof: compile small, medium, and large Story/model fixtures with `tsc --extendedDiagnostics`; record wall
  time, type count, instantiations, and memory. Wall time/peak memory are trend evidence, never gates; the
  checked-in type and instantiation ceiling is the package boundary.
- Trace: `REV-COMP-001`–`REV-COMP-015`, `REV-MACH-001`–`REV-MACH-011`, `REV-OPS-001`–`REV-OPS-018`,
  `REV-HOST-001`–`REV-HOST-008`, `REV-TEST-001`–`REV-TEST-010`, `DEL-009`, `PROOF-017`.

### PROOF-002 — Pure compilation, admission, and graph identity

- Surface: immutable app/Story construction, `AppPlan`, named module records, `App.M`, context graph,
  RuntimeSetup discovery/bootstrap, recursive states, defaults, reentry, and actor admission.
- Rule: compilation is inert and complete; runtime admission cannot expand the compiled machine universe.
- Accepts: zero actors/acquisition/external work during compilation and discovery; first-seen deduplication;
  one exact tooling owner per admitted machine; synchronous inert retention of app identity, Clock,
  capabilities, optional Persistence, and initial claims; bootstrap in provider validation, Implementation
  acquisition, initial ensure ownership, graph sealing, activation, handle escape order with reverse rollback.
- Rejects: distinct same-identity definitions; cross-app resolution; missing/ambiguous providers, foreign refs,
  cycles; parallel/history states; post-construction extension; duplicate nodes; ancestor/descendant handler
  ambiguity; runtime-sized keyed collections; automatic roots; dynamic admission; testing-only registration.
- Observable guarantee: compound entry follows authored default through compiled tables; terminal-looking leaves
  are ordinary active actors with no completion semantics; `reenter` names the exact active restart boundary.
- Proof: hostile definitions and acquisition counters prove rejection before activation; runtime behavior proves
  exact active leaf and bootstrap rollback. No testing-only owner is added.
- Trace: `REV-COMP-001`–`REV-COMP-015`, `REV-MACH-001`–`REV-MACH-011`, `REV-MIG-006`.

## Proof family: runtime ownership, turns, and publication

```ts
actor.send(event): void
runtime.ensureActor
runtime.createActor
```

### PROOF-003 — Actor turns, mailbox acknowledgment, and publication

- Surface: package-private Story acknowledgment, public mailbox, reentrant sends, macrostep planning, context
  bootstrap, StoreFanout, projection-only publication, terminal-looking leaves.
- Rule: acknowledgment waits for the ordinary event turn to stabilize; all commands use the production mailbox;
  planning validates the full finite-action batch before publication.
- Accepts: reentrant production mailbox order; public `actor.send(event): void`; one pre-turn snapshot;
  `guard`, `updateMemory`, then `actions`; atomic actor/synchronous-store publication; work starts or joins only
  after publication; initial selected context is recorded silently; later changes receive defined current and
  immediately previous values.
- Rejects: direct transition invocation; unrelated ready-work draining; public Promise/ack send; valid-prefix
  publication after planning, redirect, key, target, or batch failure; event for `false`/`null`; completion,
  mailbox shutdown, or final-node semantics for terminal-looking leaves.
- Observable guarantee: canonical StoreFanout facts enter actor mailboxes; initiating publication precedes
  recipients; stale/out-of-dependency revisions do not publish; adjacent projection-only facts may coalesce but
  never reorder lifecycle, terminal-operation, cancellation, stream-terminal, or mapped-event facts. A
  projection-only fact publishes one complete immutable snapshot without transition, guard, `always`, action,
  redirect, memory, finite-work, or hidden-event evaluation; mapped events are later ordinary turns.
- Proof: production mailbox and actor tests cover acknowledgment, reentrancy, macrostep order, full-batch
  atomicity, context bootstrap, StoreFanout ordering, and projection-only publication.
- Trace: `REV-OPS-015`, `REV-MACH-001`–`REV-MACH-011`, `REV-TEST-006`, `RET-002`, `DEL-005`, `DEL-006`,
  `REV-MIG-006`.

### PROOF-004 — Runtime, actor, lease, and cleanup lifetime

- Surface: one production RuntimeSetup/Runtime, actor creation/lookup, mailbox, operation kernel, context,
  scheduler, inspection, read barrier, disposal, Persistence ownership, codecs, and Story isolation.
- Rule: live hosts and Stories share production ownership; only explicit owner leases dispose.
- Accepts: separate leases from `ensureActor` and `createActor`; lookup-only non-owning refs/handles; async,
  idempotent, terminal production-owned lease disposal; shared stable-ref ownership; restored ownership; joining
  and fresh leases; concurrent disposal; shutdown; dependent-consumer rejection without partial cleanup;
  stable-ref tombstones; Persistence membership for declared non-disposed stable actors including suspended
  actors and exact transitive stable-provider closure; `persist: false` defaults; descriptor opt-in; exclusion-only
  provider filters; default JSON rejection/custom codec success; restore-before-subscribe; ordered/coalesced
  writes; stale-write fencing; fresh Story providers; final disposal flush.
- Rejects: stateful second Story runtime, actor, mailbox, scheduler, operation store, transition engine, cache,
  snapshot, or cleanup engine; disposal from ordinary handles/refs; local/disposed/tombstoned actors in
  Persistence; opaque-provider acceptance; tombstones before successful cleanup.
- Observable guarantee: rejected disposal leaves no tombstone; a separately constructed runtime can restore or
  create the same durable ref; cleanup is production-owned and complete.
- Proof: lifecycle, race, lease, Persistence, codec, write-order, isolation, and disposal tests run through the
  production runtime and read barrier.
- Trace: `REV-COMP-013`, `REV-HOST-003`, `REV-TEST-001`–`REV-TEST-010`, `REV-MIG-003`, `DEL-004`,
  `DEL-008`.

## Proof family: operation identity, stores, and effects

```ts
key(P)
getState(K)
getData(K)
setData
```

### PROOF-005 — Exact operation identity and generation fencing

- Surface: descriptor identity, complete executable `P`, canonical `K`, byte encoding, resource generations,
  hydration, equal-key admission, authoritative writes, preview layers, CAS, and trusted host writes.
- Rule: identity always uses exact descriptor plus canonical `K`; `P` remains available to admitted bindings or
  occurrences; generation ownership and authoritative writes are fenced.
- Accepts: all accepted canonical categories; record-order equivalence; `key(-0)` canonical `0`; defensive
  copying/freezing; exact `REV-OPS-016` bytes; equal descriptor/`K` owners joining without replacing pinned `P`;
  explicit `refetch(P)` replacement; passive hydrated key-only data until live `P`; deterministic oldest-eligible
  binding; successful `setData` fencing old generations and retaining continuing subscribers; explicit updater
  decline on `undefined`; owner-only preview reads; layer-specific promotion/rollback; post-boundary unknown or
  reconciliation truth; canonical-base CAS and initiating-actor conflict evidence.
- Rejects: negative zero in general artifact carriers; cycles; hostile/unaccepted categories; depth/node/byte
  bound violations; capability/tenant discriminator confusion; invalid input after ownership, mutation,
  admission, or work; supplying-binding release switching a running generation; late success/failure/finalizer
  mutation; preview facts reaching other actors.
- Observable guarantee: equal-value revision behavior and remote canonical success are preserved; preview rollback
  removes only its layer and later layers remain visible; the trusted-host boundary is separate.
- Proof: hostile identity/encoding vectors, hydration/admission ordering, generation races, authoritative write,
  preview/CAS, and trusted-host tests.
- Trace: `REV-OPS-015`, `REV-OPS-016`, `REV-HOST-008`, `RET-004`, `CUT-005`.

### PROOF-006 — Runtime resource store, passive reads, and continuing ownership

- Surface: one canonical resource store per runtime; resource/transaction/stream families; passive reads;
  finite actions; continuing activities/onMemory; actor-owned cancellation; selectors; invalidation/clear;
  hydration and stream reads.
- Rule: sharing is runtime-scoped and ownership is independent; reads are passive; finite work is admitted only
  by accepted event transitions; continuing work is released exactly once.
- Accepts: same-runtime sharing/fanout and isolation across runtimes, SSR requests, tests, browser roots; exact
  family methods and descriptor-specific `P`/`K`; `key`, `getData`, `getState`; activation, re-entry, memory
  changes, independent entries, `false`, `null`, exit, stop, equal normalized retention, and replacement on
  field/kind/descriptor/key change; first/middle/final-owner cancellation; truthful adapter behavior before/after
  point of no return; exact selector previous/current values and named-record suppression; exact/tag/family/mixed
  invalidation and clear with stable deduplication, whole-batch validation, atomic mutation, fencing,
  interruption, surviving subscriptions, logout, and disposal.
- Rejects: generic registries, operation refs/lanes/status aliases/enumeration, custom selection comparators,
  resource-family invalidation methods, zero-argument or wildcard clear, ordinary runtime cache clear, release
  mapped to a domain outcome, continuing-subscription cancellation, and late completion mutation.
- Observable guarantee: canonical data survives actor-local cancellation while shared work has owners; final-owner
  cancellation interrupts and fences; equal selector plans retain resources; `false`/`null` releases only its
  declaration; duplicate stream reads and accepted `REV-OPS-015` rules hold.
- Proof: runtime-store ownership, selector, cancellation, invalidation/clear, bounds, zero-match, active lookup,
  stream, tag, placeholder, updater, equal-value, and hydration tests.
- Trace: `REV-OPS-015`, `REV-OPS-017`, `REV-OPS-018`, `REV-HOST-007`, `REV-HOST-008`, `RET-002`–`RET-004`.

### PROOF-007 — Transition actions, transactions, streams, and Causes

- Surface: event-only finite admission; action batches; transaction `key`/`getState`/`commit`/`cancel`; policies;
  durable remote identity; streams; Cause/result mappings; latest projection/hydration; polling boundary.
- Rule: only returned accepted transition plans admit finite work; writes, outcomes, finalization, and Cause
  projections remain explicit and production-owned.
- Accepts: omitted/null/empty/single/list actions; winning/declined/losing transitions; pre-turn reads,
  redirect retention, mixed memory/cache changes, atomic publication; `reject`, `cancel`, `allow`, `serialize`;
  no automatic retry/readmission; current-generation suppression; explicit writes before mapped outcomes;
  pre-effect and post-point-of-no-return cancellation; durable identity before dispatch; reconciliation without a
  new request; separate compensation identity; stream emission, equal-key retention, replacement, release,
  completion/failure, exact finalization, late suppression, latest coalescing, and no emission replay.
- Rejects: merely constructed plans, valid prefixes, implicit canonical writes, unaccepted mapping options,
  timer-owned finite actions, implicit retry, `poll` API, replayed hydrated emissions, terminal stream restart.
- Observable guarantee: `hasValue`, latest value, emission count, generation, terminal status, pressure
  coalescing, live-input rematerialization, missing-input failure, and terminal non-restart follow the exact public
  unions; expansion/zero-match behavior follows `REV-OPS-017`/`REV-OPS-018`.
- Proof: production operation-kernel tests cover closed transaction/stream settlement, occurrence, action-batch
  conflict, completion publication, Cause behavior, hydration, and latest stream projection; these obligations
  are required by `REV-OPS-015`.
- Trace: `REV-OPS-015`, `REV-OPS-017`, `REV-OPS-018`, `REV-MIG-005`, `CUT-005`.

## Proof family: Stories, clocks, checkpoints, and parity

```ts
story.app(runtimeSetup, options?)
process
advanceTo
checkpoint.actor(...)
run.end
```

### PROOF-008 — Story Implementations, seeds, and actor recipes

- Surface: Story recipe actors, dependency graph, provider Implementations, Fixtures, resource seeds, leases,
  cleanup order, and service Effects/Streams.
- Rule: every Story materializes fresh recipe actors through the production runtime; recipes are inert and
  complete; provider construction precedes consumers and cleanup reverses dependencies.
- Accepts: repeated bindings to one provider; separate equal machine/input recipes; stable-ref and transitive
  providers; complete Implementations; duplicate-provider rejection; Fixture-over-App precedence by service
  identity; one provider per Runtime; isolated fresh Story Runtimes; seeds preloading only named runtime-owned
  resource/key state; typed Effects/Streams supplied by services.
- Rejects: missing/cyclic/unadmitted dependencies; seeds satisfying service requirements, invoking service
  functions, or authorizing arbitrary cache mutation; recipe runtime/mailbox/snapshot/operation/disposal/live
  handle; separate pending-external-work or result-injection commands.
- Observable guarantee: recipe is deeply frozen and contains only exact machine, required fresh input, and
  required context bindings; production kernels own admission, completion, writes, projections, and evidence.
- Proof: Story dependency, provider precedence/construction, seed isolation, recipe immutability, lease, and
  reverse-cleanup evidence through production owners.
- Trace: `REV-TEST-001`–`REV-TEST-005`, `REV-TEST-009`, `DEL-009`.

### PROOF-009 — Story processing and TestClock

- Surface: closed Story commands, processing, TestClock movement, timers, command admission, finalization,
  cleanup diagnostics, machine/app construction, and `REV-OPS-015` timer polling.
- Rule: `process` drains ready production work without advancing time or inventing external results; clock
  movement never calls `process` implicitly; explicit time commands remain explicit.
- Accepts: `process`, `advance`, `advanceTo`, `advanceToNextTimer`, `checkpoint`, `run`, target-aware app
  `send`, target-free machine forms; continuing observations/streams/future deadlines visible during finite work;
  `maxTurns` default `100`; reverse dependency cleanup; frozen package-owned `FlowStoryExecutionError`.
- Rejects: implicit queue draining on clock movement; unbounded unknown finite work; abortable finalization;
  implicit retry; timer-owned finite action; `poll`; machine boot/refs/additional actors/raw memory/initial state/
  snapshot overrides; direct selected-context injection into App Stories.
- Observable guarantee: one exact key has at most one refresh in flight; next `after` timer follows settlement;
  failure waits for the next scheduled refresh; suspension/disposal cancels and fences; resume has at most one
  overdue refresh; cleanup failure is deterministic.
- Proof: negative clock tests, `maxTurns` bounds, command-admission and finalization tests, timer fencing tests,
  machine Story construction, and typed App Story RuntimeSetup/Runtime tests.
- Trace: `REV-OPS-015`, `REV-TEST-001`–`REV-TEST-010`.

### PROOF-010 — Atomic checkpoints, end evidence, and failures

- Surface: app/machine checkpoints, exact Story recipes or app-owned stable refs, `runtime.now`,
  `runtime.pendingWork`, actor issues, read barrier, static Story-plan capture, `run.end`, cleanup, Cause, and
  WIRE-020B artifact/CLI projection.
- Rule: capture one atomic production read barrier; successful evidence is deeply frozen and failure never
  fabricates a successful `run.end`.
- Accepts: `actor(...)` lookup for app checkpoints; single actor machine checkpoint; completed checkpoints on
  failure; typed failure-boundary and cleanup evidence; one `DehydrateBarrier` cut after Store commit permit;
  complete static Story-plan closure; evidence-sequence fence; deep freeze before lease release; pre-cleanup
  `run.end`; deterministic cleanup aggregation.
- Rejects: live lookup or external work during capture; successful end evidence after failure; incomplete Cause;
  alternate artifact/CLI Cause owner.
- Observable guarantee: only `FlowDisposeError` and `FlowStoryExecutionError` preserve complete
  `Effect Cause.Cause<unknown>`; WIRE-020B supplies the artifact/CLI CauseProjection.
- Proof: checkpoint/evidence immutability, capture-barrier, sequence-fence, failure, cleanup, and artifact/CLI
  Cause tests.
- Trace: `REV-MIG-005`, `WIRE-020B`, `REV-TEST-006`–`REV-TEST-010`.

### PROOF-011 — Pure model and live-host parity

- Surface: pure model discovery, live hosts, Story hosts, snapshots, `TurnRecord`, pending work, operation facts/
  generations, context turns, cleanup, and React attachment lifecycle.
- Rule: only a command-empty fresh `story.machine` plan is a pure model; App Stories use real cross-actor
  orchestration and the production runtime.
- Accepts: structural/behavioral proof that model discovery has no runtime work or side effects; equivalent
  domain-command sequences through live and Story hosts; parity comparison of snapshots, turns, pending work,
  operation facts/generations, context turns, and cleanup evidence; explicit nondeterministic-field exceptions.
- Rejects: reducing App Stories to one predicted machine model, synthetic Story suspend/resume commands, or
  ignoring contract-relevant ordering, ownership, lifecycle, generation, or cleanup evidence.
- Observable guarantee: live and Story execution have one production implementation and matching relevant evidence.
- Proof: independent model oracle plus live/Story parity runs; React attachment lifecycle remains outside the
  machine timeline.
- Trace: `REV-TEST-001`–`REV-TEST-010`, `REV-MIG-003`.

## Proof family: refs, React hosts, and inspection

```ts
useActor
useActorByRef
useView(actor, selector)
```

### PROOF-012 — Actor refs, React, and host boundaries

- Surface: stable actor refs, wire form, hook ownership, render/commit preparation, lifecycle, context cuts,
  command buffering, suspension/resume, passive views, dependency leases, Strict Mode/Activity cleanup.
- Rule: refs are inert identity; lookup and observation never create or dispose ownership; `useView(actor,
  selector)` is the sole ordinary reactive subscription path; React attaches production actors.
- Accepts: fixed `actor:` wire round-trip of exact machine/authored stable-ID segments; same IDs under different
  machines distinct; opaque refs excluded from durable output; `useActor` one fresh local actor; lookup-only
  `useActorByRef`; exact `prepared | active | suspended | disposed`; render prepares one final actor with its
  final ref, snapshot, handle, and command-buffering mailbox; commit attaches that actor; imperative
  `runtime.createActor` immediately attached; passive provisional context recheck; prepared mailbox capacity 64;
  suspended provider edges, resource release, state/ref/handle/memory/context/cursors/occurrences/deadlines
  retained; production-kernel resume without replay; one context reconciliation on resume; shared `Object.is`,
  named-record suppression, optional `useShallow`; balanced dependency lease and lifecycle; one tear-free
  actor/store boundary; serialized lifecycle lane, FIFO settlement at its close point, per-kind finite
  normalization, remote-boundary uncertainty, stream/timer rules, cleanup-failure truth, and late-completion
  fencing.
- Rejects: actor creation/disposal/lease recovery from hooks; changed construction tuple without keyed-remount
  diagnostic; changed lookup ref resolving unregistered handles; prepared overflow/abandonment mutation or
  cleanup; commands while suspended or buffered during suspension; partial actor on selector defect; comparator
  argument; operation acquisition/mutation from selectors; `actor:prepare` inspection evidence; overlapping live
  generations; manual subscription requirement; transition evaluation on projection-only rerun; resume from
  missing, foreign, or tombstoned provider.
- Observable guarantee: lifecycle snapshots are coherent before inspection; `actor:start`, `actor:restore`,
  `actor:suspend`, `actor:resume`, and `actor:dispose` are ordered production evidence; final unmount leaves no
  active runtime work; each view evaluation replaces exact descriptor/`K` dependencies and reruns only for actor
  publication or matching StoreFanout.
- Proof: React 18/19 packed consumers and browser/lifecycle tests cover identity, attachment, SSR/preparation,
  mailbox bounds, suspension, context reconciliation, selector defects/equality, dependency replacement,
  Strict Mode, Activity cleanup, and handle capabilities.
- Prepared context/SSR, lifecycle publication identity, suspended dependency cleanup, hook tuple changes,
  prepared mailbox bounds, selector defects, and handle capabilities are owned by `REV-HOST-002` through
  `REV-HOST-006`; passive-read reactivity is owned by `REV-HOST-007`.
- Trace: `REV-HOST-001`–`REV-HOST-008`, `REV-OPS-015`, `DEL-001`, `DEL-007`, `DEL-008`, `RET-005`.

### PROOF-013 — Lifecycle and inspection evidence

- Surface: lifecycle snapshots, inspection events/sinks, publication and machine-turn counters, hydration,
  `LifecycleRecord`, sequence allocation, release gates, truncation, failure isolation, drain, and disposal.
- Rule: each lifecycle transition publishes one coherent immutable snapshot through the existing handle before
  its inspection event; lifecycle evidence is not a machine turn.
- Accepts: start/restore/dispose plus suspend/resume; listener reads observing event `to` lifecycle; private
  publication and machine-turn counters; hydration counter restoration; exact cause tags including restore
  `prepared -> prepared`; one publication barrier/global sequence allocator; async release gates; per-sink
  truncation/failure isolation; accepted-prefix drain; sequence-exhaustion refusal; runtime disposal drain.
- Rejects: prepare event; machine revision or `TurnRecord` for lifecycle evidence; second mutable trace/history;
  synthetic terminal `TurnRecord` during disposal.
- Observable guarantee: equivalent live/Story executions produce equivalent accepted `TurnRecord` and
  `LifecycleRecord` facts; ordered lifecycle evidence remains observable through production inspection.
- Proof: lifecycle/inspection ordering, counter, sink, sequence, drain, failure, and parity tests.
- Trace: `REV-HOST-004`, `PROOF-011`, `DEL-004`, `DEL-008`.

## Proof family: persistence, artifacts, CLI, and cutover

```ts
WIRE-020B
WIRE-020C
CLI-P01
CLI-P02
```

### PROOF-014 — Persistence, artifacts, server, and CLI

- Surface: production bootstrap, persistable actors, context-provider refs, context-closed cuts, host seeding,
  stream hydration, Web Storage/IndexedDB, codecs, artifacts, inspection, CLI, and failure envelopes.
- Rule: restore and validate before activation or handle escape; baseline installation is silent; exact raw wire
  and CLI representation follows `WIRE-020B`, and the export-only redacted projection follows `WIRE-020C`; this
  row does not create a second decoder/result owner.
- Accepts: declared persistable actors; completed initial `Runtime.ensureActor`; exact provider refs; dependency-
  ordered context-derived projections without replaying `onContext`; later defined current/previous context
  values; `false`/`null` no event; context-closed cuts with binding refs/provider revisions; `NonDurableContextProvider`
  for opaque local providers; latest stream projection/terminal status without emission replay; live-input
  rematerialization; synchronous Web Storage and async IndexedDB normalization; storage read/write/remove
  failures; malformed data; identity mismatch; default/custom codec outcomes; `ConcurrentDehydrate`; last good
  record retention; accepted app Story, actor lookup, `run.end`, module ownership, compound state, context,
  lifecycle, operation identity, bounds, sinks, and formatting; custom-codec failure is reported without mutating
  committed runtime state; omitted/empty redaction byte equivalence; exact protected tuple paths; deterministic
  share manifest/bytes; and WIRE-020C wrong-kind raw-import rejection.
- Rejects: missing providers, duplicate registrations, foreign machines, instance cycles, missing live stream
  input, terminal stream restart, older async writes replacing newer records, mutation of committed runtime on
  failure, deleted root/child/final/replay/old Story shapes, invalid descriptor IDs, duplicate IDs/machines/module
  ownership, missing module refs, invalid defaults, unresolved requirements, invalid Story metadata, malformed
  traces, impossible lifecycle tuples, inconsistent end/failure/cleanup evidence, missing/duplicate/overlapping/
  structural redaction paths, mutation of raw/runtime/persisted truth, or share artifacts used as CLI, import,
  replay, persistence, boot, or evidence-authority input.
- Observable guarantee: invalid vectors report exact rejection code/category/path/bound; `EvidenceUnavailable`
  has a non-null truncation marker; artifact/CLI Cause projection is ordered and byte-stable under WIRE-020B;
  WIRE-020C is deterministic privacy-reduced output that cannot be mistaken for raw evidence.
- Proof: bootstrap, persistence, hydration, codec/storage, write-fencing, artifact round-trip/negative, inspect,
  API-P04 redacted-export production tests, CLI grammar/gateway/execution/formatting, and Story/CLI parity
  evidence. This is the owner of current `API-P04` and `CLI-P01`.
- Trace: `REV-OPS-015`, `REV-HOST-008`, `REV-MIG-005`, `WIRE-020B`, `WIRE-020C`, `API-P04`, `CLI-P01`, `DEL-010`.

### PROOF-015 — Individual actor ownership without child capability

- Surface: explicit actor leases, dependent consumers, stable-ref tombstones, durable refs, and independent
  subordinate workflows.
- Rule: only explicit leases own individual disposal; child-machine capability does not exist.
- Accepts: exact refs/binding paths blocking provider disposal; idempotent cleanup; same-runtime tombstone
  preventing recreation; new runtime use of durable ref under ordinary boot rules; independent subordinate work
  represented by explicit actors.
- Rejects: remote-lease behavior defined here; child APIs, lifecycles, mailboxes, memory, completion, or
  child-equivalent Story surfaces.
- Observable guarantee: ownership and disposal authority are explicit and no child capability survives through a
  compatibility path.
- Proof: lease/dependent-cleanup/tombstone and cross-runtime tests; child absence is proved by `PROOF-017` and
  persistence/artifact/CLI negatives.
- Trace: `DEL-002`, `DEL-004`, `REV-COMP-013`, `REV-MIG-006`.

### PROOF-016 — Final proving applications

- Surface: named proving apps and package fixtures.
- Rule: final proof apps exercise accepted production owners; they are evidence, not additional APIs.
- Accepts: Todo Essentials for ordinary definitions, compound states, refs/leases, named operations, actions,
  views, React, fixtures, Stories, checkpoints, TestClock; Incident Console for exact refs, bindings,
  transaction conflicts, continuing streams, leases, inspection, diagnostics, CLI/artifacts, browser lifetime;
  Hydrated Offline Notes for request isolation, context-closed persistence, first-render consistency, outbox,
  reconnect, disposal, and exact `WIRE-*`/`REV-HOST-008` hydration/seeding behavior; bounded-feed package fixture
  with dropping/coalescing authored inside the application Stream; React 18/19 and isolated TypeScript proof
  packages.
- Rejects: a Flow `pressure` option, inferred application requirements, or React/type proof packages treated as
  showcase applications.
- Observable guarantee: every final proving application exercises the intended ownership and no fixture invents
  an API.
- Proof: named application tests/builds and packed/type packages under the late cutover gates.
- Trace: `REV-MIG-003`, `REV-MIG-005`, `REV-HOST-008`, `PROOF-017`.

### PROOF-017 — Deletion, retained boundaries, and package hygiene

- Surface: complete `DEL-001`–`DEL-011` and `RET-001`–`RET-005` disposition, package exports/declarations,
  active docs/examples/Stories/fixtures/tests/tasks, replacement owners, and repository authority.
- Rule: combine runtime export absence, packed declaration negatives, production behavior, package/example/
  browser tests, and broad workspace gates; source scans support but never replace those proofs.
- Accepts: retained package routes/import conditions/Effect peer/React peer; synchronous send; status
  discriminants; canonical operation methods; actions; revised host surfaces; replacement behavior through
  production owners; mapping of every live obligation before deleting historical authority.
- Rejects: deleted values/namespaces/types/overloads/properties/deep imports/registries/examples/proofs/tasks;
  deleted shapes reaching actor/memory/operation/event/work/evidence; aliases, adapters, translators, parser
  branches, second runtimes/actors/Stories/operations/selectors, mutable harnesses, child capabilities,
  registered views, and old Story/operation surfaces kept solely for compatibility; old names in positive
  examples, supported overloads, active glossary, or replacement recipes.
- Observable guarantee: one active authority survives for each live obligation; deleted surfaces fail closed;
  retained boundaries remain available without deleted API names.
- Proof: runtime export inspection; package typecheck; packed consumers; package tests; example tests; browser
  tests; broad workspace gate; final mapping and no-consumer audit before `DEL-011` removal/classification. The
  mapping explicitly covers live routes, peer identity, React compatibility, exact inference, isolation,
  capacity, hostile input, lifecycle, races, and independent-oracle obligations.
- Trace: `REV-MIG-003`/`REV-MIG-004`, `DEL-001`–`DEL-011`, `RET-001`–`RET-005`, `CUT-P01`–`CUT-P06`,
  `CLI-P02`.

## Local proof crosswalk

Local `*-P*` sections refine central rows and are normative even without a `PROOF-*` prefix. They are named by
the same implementation task or proof record; retired phase, receipt, and task files are historical only.

| Local obligation | Central proof owner |
| --- | --- |
| `API-P01` | `PROOF-001`, `PROOF-017` |
| `API-P02` | `PROOF-001`, `PROOF-002` |
| `API-P03` | `PROOF-003`, `PROOF-005`–`PROOF-008`, `PROOF-011`, `PROOF-014` |
| `API-P04` | `PROOF-014` |
| `CLI-P01` | `PROOF-014` |
| `CLI-P02` | `PROOF-014`, `PROOF-017` |
| `TYPE-P01` | `PROOF-001` |
| `TYPE-P02` | `PROOF-001`, `PROOF-017` |
| `TYPE-P03` | `PROOF-001` |
| `TYPE-P04` | `PROOF-001` |
| `SNAP-P01` | `PROOF-001`, `PROOF-005`, `PROOF-006` |
| `HOST-P01` | `PROOF-003`, `PROOF-004`, `PROOF-012` |
| `HOST-P02` | `PROOF-003`, `PROOF-010` |
| `HOST-P03` | `PROOF-003`, `PROOF-005` |
| `HOST-P04` | `PROOF-012`, `PROOF-014` |
| `HOST-P05` | `PROOF-004`, `PROOF-012` |
| `CUT-P01` | `PROOF-001`, `PROOF-017` |
| `CUT-P02` | `PROOF-001`, `PROOF-017` |
| `CUT-P03` | `PROOF-001`, `PROOF-017` |
| `CUT-P04` | `PROOF-001`, `PROOF-012`, `PROOF-014`, `PROOF-017` |
| `CUT-P05` | `PROOF-017` |
| `CUT-P06` | `PROOF-017` |

## Contract-family dependency crosswalk

Each family MUST be represented by dependency-ordered implementation issues. The issue description copies its
listed clauses, proof rows, source owner, focused proof path, and non-goals. Proposal files and retired receipts
are evidence only. This is a decomposition boundary, not a second semantic specification.

| Contract family | Normative sources | Central/local proof rows | Dependency |
| --- | --- | --- | --- |
| Static foundation | `GLOSSARY_AND_IDENTITY.md`; `PUBLIC_API.md` `API-001`–`API-010`; `TYPE_SYSTEM.md` `TYPE-001`–`TYPE-009`; accepted composition/machine revisions | `PROOF-001`, `PROOF-002`, `TYPE-P01`–`TYPE-P04` | first |
| Runtime ownership | `ARCHITECTURE.md` `ARCH-007`–`ARCH-020`; `SEMANTICS.md` admission/mailbox/lifecycle; `REACT_AND_HOSTS.md` `HOST-001`–`HOST-006`; `TYPE_SYSTEM.md` `TYPE-010`–`TYPE-015` | `PROOF-003`, `PROOF-004`, `PROOF-015`, `HOST-P01`–`HOST-P05` | after static foundation |
| Operation kernels | `TYPE_SYSTEM.md` operation inference; `SEMANTICS.md` `SEM-011`–`SEM-021`, `SEM-029`–`SEM-030`; `SNAPSHOTS.md`; accepted operations revision | `PROOF-005`–`PROOF-007`, `SNAP-P01` | after runtime ownership |
| Persistence and evidence | `PERSISTENCE_AND_ARTIFACTS.md` `WIRE-000`–`WIRE-023`, including `WIRE-020C`, as sole schema authority; v2 notation mirror in `ARTIFACT_WIRE.md`; capture/hydration clauses in `SNAPSHOTS.md` | `PROOF-009`, `PROOF-010`, `PROOF-011`, `PROOF-014`, `API-P04`, `CLI-P01` | after runtime and operation kernels |
| Hosts, Stories, and CLI | `TESTING.md` `REV-TEST-001`–`REV-TEST-010`; `REACT_AND_HOSTS.md`; `CLI.md`; `PUBLIC_API.md` `API-011`–`API-017` | `PROOF-008`, `PROOF-010`, `PROOF-012`, `PROOF-014`, `CLI-P01` | after runtime; operation/evidence edges where used |
| Cutover and absence | `COMPATIBILITY_AND_DELETIONS.md`; `PROOF-016`–`PROOF-017`; accepted migration/deletion revisions | `PROOF-016`, `PROOF-017`, `CLI-P02`, `CUT-P01`–`CUT-P06` | after every prior family |

Splitting a row into multiple issues is valid only when each child retains exact contract references, proof
ownership, acceptance behavior, dependencies, and non-goals.

## Greenfield proof boundary

Before replacement becomes a package, focused proof issues run against `packages/flow-state-rewrite/`:

```sh
nubx tsc -p packages/flow-state-rewrite/tsconfig.json --noEmit
vp test packages/flow-state-rewrite/src/<focused-proof>.test.ts
vp lint packages/flow-state-rewrite/src
```

Frozen `packages/flow-state/` is migration evidence; its green gates do not prove replacement conformance.
After replacement has package entrypoints, its package-local type, test, lint, build, and packed-consumer gates
become the active proof boundary. Published-package, example, browser, and full-workspace gates remain late
cutover obligations under `PROOF-016` and `PROOF-017`.

## Required gate layers

Focused tests establish one mechanism quickly; closure requires the next owning boundary:

1. Focused proof files for affected `PROOF-*` IDs.
2. `nub run --filter flow-state check:cli-source-types`.
3. `nub run --filter flow-state test`.
4. `nub run --filter flow-state build`.
5. `nub run --filter flow-state check:typescript-mode-proofs` and `nub run --filter flow-state check:packed-consumers` for public/declaration changes.
6. Affected example tests and builds.
7. `nub run test:browser` for browser ownership or lifecycle changes.
8. `nub run verify` for final phase closure.

Live script owners are `packages/flow-state/package.json:59-69` and root `package.json:6-30`; these commands
are unchanged by the revision overlay. `REV-MIG-003` remains the accepted architecture/parity proof boundary.
Any reopened behavior or contract ID remains an explicit blocking implementation task until authority is
updated or proof is complete.
