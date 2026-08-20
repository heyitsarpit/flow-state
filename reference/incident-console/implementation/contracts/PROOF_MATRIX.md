# Normative proof matrix

Status: normative contract proof matrix

This matrix defines the evidence required to claim the accepted revision surface correct. A green test
count does not close a proof unless the test exercises the named mechanism through its production owner.
Source-text assertions about filenames, exported token strings, or helper placement are not substitutes for
type, behavior, race, interruption, lifetime, or artifact proof.

`REV-MIG-003` requires compile-time proofs to preserve exact machine, actor-ref, event, input, context,
memory, operation, selected-value, Story-target, observation, and checkpoint types. Runtime proofs MUST
exercise the real production actor lifecycle, mailbox, context graph, scheduler, operation kernels,
inspection, persistence, evidence capture, and cleanup paths. Focused source-text or type checks MUST NOT
stand in for behavior proofs.

The broad `PROOF-*` rows are requirements, not task closure units. The retired Phase 0 material assigned
stable subcase IDs and phase ownership to historical executable cases; those labels are no longer current
status, do not add semantic authority, and do not choose active ownership. Current executable proofs are
owned by the production code and tests named by the implementation task and this matrix.

## Accepted revision ownership

These are the accepted revision owners; the proof rows below refine their obligations without adding a second
semantic owner.

| Accepted source area      | Revision IDs                                            | Central proof rows                                                                        |
| ------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Composition and app plans | `REV-COMP-001`–`REV-COMP-015`                           | `PROOF-001`, `PROOF-002`, `PROOF-004`, `PROOF-005`, `PROOF-012`, `PROOF-014`, `PROOF-015` |
| Machine authoring         | `REV-MACH-001`–`REV-MACH-011`                           | `PROOF-001`, `PROOF-002`, `PROOF-003`, `PROOF-017`                                        |
| Operations                | `REV-OPS-001`–`REV-OPS-018`                             | `PROOF-001`, `PROOF-003`, `PROOF-005`–`PROOF-007`, `PROOF-009`, `PROOF-014`               |
| React and hosts           | `REV-HOST-001`–`REV-HOST-008`                           | `PROOF-001`, `PROOF-003`, `PROOF-004`, `PROOF-005`, `PROOF-012`, `PROOF-013`              |
| Stories and testing       | `REV-TEST-001`–`REV-TEST-010`                           | `PROOF-001`, `PROOF-003`, `PROOF-004`, `PROOF-008`–`PROOF-011`                            |
| Migration and proofs      | `REV-MIG-001`–`REV-MIG-006`                             | all affected rows, with cross-cutting closure in `PROOF-017`                              |
| Deletions and cutover     | `REV-MIG-004`, `DEL-001`–`DEL-011`, `RET-001`–`RET-005` | `PROOF-017`                                                                               |

## Revision-specific proof obligations

The accepted revisions below refine central proof rows; they do not create a runtime receipt system. An
implementation proof record MUST name the exact executable test, fixture, example, or artifact evidence
when that evidence exists and MUST carry the item as an open obligation when it does not. The named obligations
are:

| Accepted revision | Named obligation                                                                                                                                                                                                                                              | Central proof rows                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `REV-OPS-015`     | `StoreFanout ordering`: canonical-only fanout enters actor mailboxes, initiating publication precedes recipients, stale or unrelated revisions do not publish, and only adjacent projection-only facts may coalesce.                                          | `PROOF-003`, `PROOF-006`                                                                  |
| `REV-OPS-015`     | `Actor-scoped preview/CAS`: preview visibility is owner-only; promotion, rollback, post-boundary unknown, and canonical-base compare-and-set conflict behavior preserve canonical truth and issue evidence.                                                   | `PROOF-005`, `PROOF-007`                                                                  |
| `REV-OPS-015`     | `Projection-only publication`: external facts publish a complete immutable snapshot without transition evaluation; mapped events are later ordinary mailbox turns.                                                                                            | `PROOF-003`, `PROOF-006`, `PROOF-007`                                                     |
| `REV-OPS-015`     | `Latest stream projection/hydration`: latest value, `hasValue`, emission count, generation, and terminal status update without emission replay; live executable input is required for rematerialization.                                                      | `PROOF-007`, `PROOF-014`                                                                  |
| `REV-OPS-015`     | `Timer polling`: the existing `after` timer targets an explicit refresh event, permits one exact-key refresh in flight, schedules after settlement, and fences suspension/disposal without an implicit retry or `poll` API.                                   | `PROOF-009`                                                                               |
| `REV-HOST-007`    | `Passive useView dependency replacement`: exact descriptor/`K` reads are tracked per evaluation, the dependency set is replaced after each evaluation, matching StoreFanout reruns at one tear-free boundary, and passive selection does no work or mutation. | `PROOF-012`                                                                               |
| `REV-OPS-017`     | `Exact operation state unions`: resource, transaction, and stream discriminants narrow with typed `K`; retained values, post-boundary `unknown`, stream latest/count/generation, passive cross-actor reads, and duplicate-live-stream rejection are proved.   | `PROOF-001`, `PROOF-005`, `PROOF-014`                                                     |
| `REV-OPS-018`     | `Bounded invalidation and clear`: target validation, stable expansion/deduplication, 256-identity bound, missing/zero-match no-op, one revision, active-work fencing, and no direct lookup are proved.                                                        | `PROOF-006`, `PROOF-007`                                                                  |
| `REV-HOST-008`    | `Construction-owned seeding and trusted host writes`: seed validation/duplicate rejection, capability provenance/revocation, StoreKernel fencing/fanout, and no occurrence or public writer are proved.                                                       | `PROOF-005`, `PROOF-006`, `PROOF-014`                                                     |
| `REV-MIG-005`     | `V2 artifact/CLI model and public error Cause`: bounded round-trip, ordered serialized CauseProjection, Story/CLI parity, exact result envelope, public error-Cause preservation, atomic publication, and legacy-shape rejection are proved.                  | `PROOF-001`, `PROOF-008`, `PROOF-010`, `PROOF-014`, `PROOF-017`, `CLI-P01`, `CLI-P02`     |
| `REV-MIG-006`     | `Child-capability removal`: compile/runtime single-actor recursive states, explicit-actor replacement, and persistence/artifact/CLI absence proofs are proved.                                                                                                | `PROOF-001`, `PROOF-002`, `PROOF-003`, `PROOF-011`, `PROOF-014`, `PROOF-015`, `PROOF-017` |

## PROOF-001: Public typing and inference

Prove definition-owned input and memory inference, inherited readonly context and exact context bindings,
recursive state declarations and configuration through the accepted ten-level bound, named module records,
closed `App.M` admission, exact operation `O` catalogues, descriptor `P`/canonical `K` identity, actor refs
and owner leases, React hook surfaces, closed Story constructor options, exact Story targets and observations,
and checkpoint and `run.end` evidence types. Include the accepted machine, event, selected-value, resource,
transaction, stream, input, context, memory, and lifecycle domains.

Run the declarations through source TypeScript, packed declarations, strict mode, isolated modules,
isolated declarations, multi-entry consumers, and packed React 18 and React 19 consumers. Packed consumers
MUST prove the accepted Story values through the testing route, preserve the typed failure boundary without
naming an unresolved failure class, and reject deleted testing names, types, overloads, properties, and
authoring shapes under `DEL-009`.

Required negative proofs include invalid recursive configuration, missing or extra compound nodes, non-direct
defaults, depth eleven, wrong-machine events, missing required input or context, extra closed-option fields,
invalid context-binding keys, incompatible recipe or ref bindings, invalid Story targets, operation `P`/`K`
misuse, per-registration selector comparators, and imports for deleted surfaces. A declaration that is
correct but impractical to instantiate does not close this proof.

Story option proofs MUST cover every conditionally required or forbidden `input`, selected `context`,
`contextBindings`, and `fixtures`, exact fixture-requirement closure, app/RuntimeSetup compatibility,
metadata placement, absence of public boot fields, and rejection of fields not belonging to the selected
constructor.

Shared selector proofs MUST cover the required selected-value type, explicit nullable domains, an initial
result with no previous value, changed results with the immediately preceding selected value, complete-value
`Object.is` suppression, named-record field suppression, fresh structured results, selector purity, and
rejection of per-registration comparators. Context proofs MUST additionally show one current/previous
selected-value pair per selected-value change, no intermediate projection combination, and no context work for
an equal result.

Run representative small, medium, and large Story/model compile fixtures through `tsc --extendedDiagnostics`.
Record wall time, type count, instantiation count, and memory; wall time and peak memory are trend evidence
and never gate because they vary by host. The checked-in type and instantiation ceiling remains the package
proof boundary.

## PROOF-002: Pure compilation, admission, and graph identity

Prove app and Story construction is immutable and inert: app compilation creates zero actors, descriptor
declarations and plans cause no acquisition or external work, and the compiled `AppPlan` contains the
complete admitted machine and operation graph. Repeating the same fixture or named descriptor reference
deduplicates in first-seen order; distinct definitions with the same required identity fail deterministically;
independent app compilations cannot resolve through one another.

Prove named module records flatten into one exact `App.M` catalogue, duplicate machine property names and
repeated machine values are rejected, each admitted machine has exactly one tooling owner, module IDs remain
tooling identity only, and a running runtime cannot expand the statically compiled machine-admission universe.
Prove context dependency validation rejects missing or ambiguous providers, foreign refs, and instance cycles
before the accepted bootstrap barrier can expose a handle or start work. A repeated machine value MUST NOT be
deduplicated into several module owners.

RuntimeSetup discovery MUST be synchronous and inert: prove that retaining app identity, Clock,
external capabilities, the optional Persistence provider, and initial actor claims acquires no Implementation,
creates no actor, starts no work, and exposes no handle. Bootstrap proofs MUST cover provider validation,
application Implementation acquisition,
initial ensure ownership, graph sealing, actor activation, and handle escape in that order, with reverse
rollback on failure or disposal race.

Runtime proofs MUST show that entering a compound target follows its authored default path and that execution
uses the compiled tables rather than runtime parent lookup. Compile proofs MUST accept recursive named
substates, reject parallel-region and history forms, reject post-construction extension, reject duplicate
nodes and ancestor/descendant handler ambiguity, and reject runtime-sized keyed collection forms. Runtime
proofs MUST match the exact active leaf, keep terminal-looking leaves as ordinary active actors without
completion semantics, and validate that each `reenter` token names the exact active restart boundary.

Compile and runtime proofs MUST use hostile definitions and acquisition counters where the accepted owner
requires pre-activation rejection. They MUST NOT add an automatic root, a dynamic-machine admission path, or
any testing-only registration path.

## PROOF-003: Actor turns, mailbox acknowledgment, and publication

Prove the package-private Story acknowledgment completes after the ordinary event turn stabilizes and MUST
NOT invoke transition logic directly or drain unrelated ready work. Reentrant sends retain production mailbox
order, public `actor.send(event): void` exposes no Promise or acknowledgment, and equivalent live-host and
Story commands use the same production mailbox and actor implementation.

Prove event macrostep planning reads one pre-turn snapshot, evaluates guard, `updateMemory`, and `actions`
in the accepted order, validates the complete finite-action batch before publication, publishes actor and
synchronous store changes atomically, and starts or joins asynchronous work only after publication. A
planning, redirect, key, target, or batch-validation failure publishes no valid prefix.

Under `REV-OPS-015`, the `StoreFanout ordering` proof MUST show that canonical revision facts use the
StoreFanout path into actor mailboxes, that the initiating actor publishes before other actors receive the
fact, that stale or out-of-dependency revisions do not publish, and that adjacent projection-only facts may
coalesce without reordering lifecycle, terminal-operation, cancellation, stream-terminal, or mapped-event
facts. The `projection-only publication` proof MUST show one complete immutable actor snapshot with no
transition, guard, `always`, action, redirect, memory, finite-work, or hidden-event evaluation; any mapped
event is a later ordinary mailbox turn.

Context-bootstrap proofs MUST show that the initial selected value is recorded without invoking its handler or
emitting an event, that a later change receives defined current and immediately preceding selected values,
and that returning `false` or `null` emits no event.

Terminal-looking leaves MUST remain ordinary active actors: they MUST NOT publish completion, stop their
mailbox, or acquire final-node semantics.

## PROOF-004: Runtime, actor, lease, and cleanup lifetime

Prove live hosts and Stories use one production `RuntimeSetup`, `Runtime`, actor creation and lookup,
mailbox, operation kernel, context propagation, scheduler, inspection, read barrier, and disposal path. Story
code MUST NOT contain a stateful second runtime, actor, mailbox, scheduler, operation store, transition engine,
cache, snapshot implementation, or cleanup engine.

Prove `runtime.ensureActor` and `runtime.createActor` return separate owner leases, lookup does not create or
grant disposal authority, ordinary handles and refs do not dispose, and lease disposal is asynchronous,
idempotent, terminal, and production-owned. Cover one shared stable-ref owner lease, Persistence-restored runtime
ownership, `Runtime.ensureActor` joining, freshly ensured leases, concurrent ensure or create disposal, runtime
shutdown, dependent-consumer rejection without partial cleanup, terminal command rejection through escaped
handles, stable-ref tombstones, and absence of disposal on non-owner surfaces. Prove Persistence membership
for only declared non-disposed stable actors, including suspended actors, exact transitive stable-provider
closure, exclusion of local/disposed/tombstoned actors, and opaque-provider failure. Prove `persist: false`
defaults for actors and all operation families, descriptor-owned opt-in, provider filters that can only
exclude declared entries, default JSON codec rejection of unsupported values, custom codec success,
restore-before-subscribe ordering, ordered/coalesced writes, stale-write fencing, fresh isolated Story
providers, and final disposal flush.
The stable-ref tombstone MUST be installed only after successful cleanup; rejected disposal MUST leave no
tombstone, and a separately constructed runtime MUST be able to restore or create the same durable ref.

## PROOF-005: Exact operation identity and generation fencing

Prove every operation identity uses the exact descriptor and canonical `K`, while complete executable `P`
remains available to the admitted binding or occurrence. Cover every accepted canonical category, record-order
equivalence, acceptance of `key(-0)` as canonical `0`, rejection of negative zero in general artifact carriers,
defensive copying and freezing, hostile reflection, every rejected category, cycles, exact rejection paths, the
depth/node/byte bounds, capability/tenant discriminator separation, and invalid-input
failure before ownership, actor/store mutation, admission, or external work. Prove the exact `REV-OPS-016`
byte encoding under `REV-OPS-016`; the proof MUST exercise that accepted boundary rather than rely on a
proposal-only encoding.

Prove equal descriptor-and-`K` resource owners join one shared generation without replacing its pinned `P`,
explicit `refetch(P)` creates a replacement generation, hydrated key-only data remains passive until a live
binding supplies `P`, and a supplying binding release cannot switch a running generation. Cover deterministic
equal-key ordering across hydration, simultaneous eligibility, first admission, equal-key joining, later
automatic admission, explicit refetch, settlement cleanup, and inert hydrated key-only data; a later automatic
generation MUST use the oldest remaining eligible binding.

Prove every successful authoritative `setData` write fences older lookup generations, retains attached
continuing subscribers, suppresses hostile late success, failure, and finalization, and applies through every
accepted machine, transaction, stream, or trusted-host writer. An updater returning `undefined` MUST decline
with no change. The `actor-scoped preview/CAS` proof MUST show owner-only effective reads, promotion and
failure/defect/pre-boundary rollback of only the initiating layer, post-boundary `unknown` or reconciliation
truth, canonical-base compare-and-set conflict handling, preservation of remote canonical success, and an
initiating-actor conflict issue without preview facts reaching other actors. Also prove equal-value revision
rules and the separate `REV-HOST-008` trusted-host boundary.

## PROOF-006: Runtime resource store, passive reads, and continuing ownership

Prove one canonical resource store per Flow runtime, same-runtime sharing and cross-actor fanout, independent
actor ownership and release, and isolation between runtimes, SSR requests, tests, and browser roots. Prove
the exact resource, transaction, and stream family methods, descriptor-specific `P` versus `K` arguments,
passive `key`, `getData`, and `getState` reads, absence of generic registries, operation refs, lanes, status
aliases, enumeration, and custom selection comparators.

Prove finite transition `actions` admit only inert returned plans, continuing resources and streams remain
state `activities` or independent `onMemory` declarations, and only accepted event transitions admit finite
work. Cover activation, re-entry, memory changes, independent entries, `false`, `null`, state exit, actor
stop, exact-once release, equal normalized identity retention, and replacement on field, kind, descriptor, or
key change.

Prove actor-owned cancellation affects only the calling actor's matching finite occurrence, preserves
canonical data, continues shared work while another owner remains, interrupts the final owner, fences late
completion, and does not cancel a continuing resource subscription or map a planned release to a domain
outcome. Cover first-, middle-, and final-owner cancellation, including truthful adapter behavior before and
after its point of no return and the absence of a mapped planned outcome.

For `onMemory.select`, prove the shared selector contract, nullable selected domains, initial invocation with
`previous: undefined`, current and immediately preceding handler values, field-wise named-record suppression,
fresh equal-plan retention, replacement on field/kind/descriptor/key change, selector purity, and no custom
comparator. Equality MUST suppress the factory and `false` or `null` MUST release only that declaration.

Prove exact, tag, family, and mixed invalidation/clear targets, first-seen deduplication, whole-batch
validation, atomic mutation, generation fencing/interruption, surviving subscriptions, logout, and runtime
disposal. Expansion bounds, zero-match behavior, active-lookup interaction, and closed state unions follow
`REV-OPS-017` and `REV-OPS-018`. Prove duplicate stream reads, tags, placeholders, effective reads, updater
input, equal-value writes, and hydration restart under the accepted `REV-OPS-015` rules.
Negative proofs MUST reject resource-family invalidation methods, zero-argument or wildcard clear, and
ordinary runtime cache clear.

## PROOF-007: Transition actions, transactions, streams, and Causes

Prove event-only finite admission, winning/declined/losing transitions, omitted/null/empty/single/list action
results, returned versus merely constructed plans, pre-turn reads, redirect retention, mixed memory/cache
changes, atomic publication, no valid prefix, and work starting only after publication.

Prove transaction `key`, passive `getState`, finite `commit`, actor-owned `cancel`, and each accepted
`reject`, `cancel`, `allow`, and `serialize` policy. Prove no automatic retry or readmission, current-generation
suppression, explicit writes before mapped outcomes, no implicit canonical writes, and no unaccepted mapping
options. Prove the adapter's pre-effect and post-point-of-no-return cancellation behavior, durable remote
operation identity before dispatch, reconciliation without a new remote request, and separate compensation
identity. Prove stream emission, equal-key retention, key replacement, release/disposal, completion/failure,
exact finalization, late-emission suppression, explicit writes before outcomes, latest-value coalescing, and
hydration without emission replay. The `latest stream projection/hydration` proof MUST cover `hasValue`, the
latest value, emission count, generation, terminal status, pressure coalescing, rematerialization from live
executable input, missing-input failure, and terminal non-restart.

Closed transaction and stream settlement, occurrence, action-batch conflict, completion publication, and
hydration proofs are required by `REV-OPS-015`. Exact public state unions and expansion/zero-match behavior
follow `REV-OPS-017` and `REV-OPS-018`. Timer-owned finite actions remain forbidden; polling proofs use
`after` plus an explicit refresh event.

## PROOF-008: Story Implementations, seeds, and actor recipes

Prove each Story run materializes fresh recipe actors through the production runtime, validates the complete
recipe dependency graph, creates providers before consumers, retains owner leases, and cleans up consumers
before providers in reverse dependency order. Cover repeated bindings to one provider, separate recipes with
equal machine and input, stable-ref providers, transitive providers, missing providers, cycles, and unadmitted
machines.

Prove each Fixture closes every declared service requirement through complete Implementation providers,
rejects duplicate providers within one Fixture set, applies Fixture-over-App precedence by service identity,
constructs each provider once per Runtime, and isolates provider state across fresh Story Runtimes. Prove
resource seeds preload only the named Runtime-owned resource/key state, do not satisfy service requirements,
do not invoke service functions, and do not authorize arbitrary cache mutation.

The recipe itself MUST be deeply frozen and inert: it may contain only the exact machine, required fresh input,
and required context bindings, with no runtime, mailbox, snapshot, operation binding, disposal authority, or
live actor handle.

Story execution MUST have no separate pending-external-work or result-injection command. Prove that complete
service Implementations provide typed Effects or Streams while operation admission, completion, writes,
projections, and evidence remain owned by the production kernels.

## PROOF-009: Story processing and TestClock

Prove the closed Story command surface: `process`, `advance`, `advanceTo`, `advanceToNextTimer`, `checkpoint`,
`run`, target-aware app `send`, and target-free machine Story forms. `process` MUST drain ready production
work without advancing time or inventing external results. Prove continuing observations, streams, and future deadlines remain
visible while finite work is processed, and repeated unknown finite work is bounded by the Story's `maxTurns`.

Prove the `maxTurns` default of `100` and explicit-time command behavior. Clock movement MUST have executable
negative proofs showing that it does not call `process()` or drain any queued work implicitly;
only an explicit `process()` command may drain ready work. Prove command-admission closure,
non-abortable finalization, reverse dependency cleanup, deterministic cleanup diagnostics, and the frozen
package-owned `FlowStoryExecutionError` envelope for execution, cancellation, and cleanup failure.

Under `REV-OPS-015`, the `timer polling` implementation proof obligation MUST prove that one exact key has
at most one refresh in flight, the next `after` timer is scheduled only after settlement, failures wait for
the next scheduled refresh, and suspension or disposal cancels and fences the timer. Resume MUST perform at
most one overdue refresh. The proof MUST use an explicit refresh event and MUST reject timer-owned finite
actions, implicit retry, and a new `poll` API.

Machine Story proofs MUST cover one production-created actor, the production memory initializer, exact input and
selected initial context, and rejection of boot, refs, additional actors, raw memory, initial state, and
snapshot overrides. App Story proofs MUST use the typed production `RuntimeSetup` and constructed `Runtime`, and MUST not inject selected
context directly.

## PROOF-010: Atomic checkpoints, end evidence, and failures

Prove app checkpoints and end evidence address exact Story recipes or app-owned stable refs through
`actor(...)`, while machine checkpoints expose the single actor snapshot. Prove reserved `runtime.now` and
`runtime.pendingWork`, actor issues in actor snapshots, deeply frozen checkpoint and successful `run.end`
evidence, and one atomic production read barrier for the captured instant.

Failed execution MUST retain completed checkpoints and typed failure-boundary and cleanup evidence and MUST
preserve the complete public error Cause without manufacturing a successful `run.end`. Prove one `DehydrateBarrier` cut after the Store commit permit,
the complete static Story-plan capture closure, the evidence-sequence fence, deep freezing before lease
release, no live lookup or external work during capture, pre-cleanup `run.end`, and deterministic cleanup
aggregation. Artifact and CLI Cause projection follows WIRE-020B; only `FlowDisposeError` and
`FlowStoryExecutionError` preserve the complete Effect `Cause.Cause<unknown>`.

## PROOF-011: Pure model and live-host parity

Prove pure model discovery accepts only a command-empty fresh `story.machine` plan. App Stories MUST exercise
real cross-actor orchestration and MUST NOT be reduced to one predicted machine model. Structural and
behavioral tests MUST show that model discovery has no runtime work or production side effects and that live
hosts and Stories share the same production runtime implementation.

Parity proofs MUST execute equivalent domain-command sequences through live and Story hosts and compare
snapshots, `TurnRecord`s, pending work, operation facts and generations, context turns, and cleanup
evidence. React attachment lifecycle evidence remains outside the machine timeline and does not require
synthetic Story suspend or resume commands.

Parity may ignore only fields explicitly declared nondeterministic by the relevant contract. It MUST
preserve contract-relevant ordering, ownership, lifecycle, generation, and cleanup evidence.

## PROOF-012: Actor refs, React, and host boundaries

Prove `actorRef` is inert stable identity, its fixed `actor:` wire form round-trips exact machine and authored
stable-ID segments, same IDs under different machines remain distinct, and opaque refs never enter durable
output. Prove `useActor` creates one fresh local actor, `useActorByRef` performs
lookup-only shared resolution, and `useView(actor, selector)` is the sole ordinary reactive subscription
path. Prove handles expose exact refs without disposal authority and that hooks cannot create, dispose, or
recover an owner lease through lookup or observation.

Prove render prepares one final actor with its final ref, snapshot, handle, and command-buffering mailbox;
commit attaches that same actor; abandoned preparation is inert; and imperative `runtime.createActor` remains
the immediately attached non-React path. Cover the exact `prepared | active | suspended | disposed` lifecycle,
coherent lifecycle snapshots before inspection evidence, `actor:start`, `actor:restore`, `actor:suspend`,
`actor:resume`, and `actor:dispose`, with no `actor:prepare` evidence.

Prove the construction tuple rejects changed machine, runtime, input, or context-binding identity with the
keyed-remount diagnostic, while changed `useActorByRef` refs resolve only already-registered handles.
Prepared mailboxes accept at most 64 commands; overflow and abandonment close admission synchronously
without mutation or cleanup obligation. Prove passive provisional context cuts recheck provider identity
and publication revisions before silent baseline installation, and selector defects during attachment or
hydration expose no partial actor.

Prove suspension rejects commands without buffering, retains suspended provider edges and rejects provider
disposal until all active or suspended dependents are gone, releases attachment-owned resources, preserves
ref, handle, memory, context baseline, cursors, occurrences, and absolute timer deadlines, and resumes
through production kernels without replaying input, initialization, events, finite actions, or baseline
context. Prove the serialized lifecycle lane, FIFO settlement at its close point, per-kind finite
normalization, remote-boundary uncertainty, stream/timer rules, cleanup-failure truth, late-completion
fencing, and fail-closed resume for missing, foreign, or tombstoned providers.
Prove exact passive `useView` selection and shared `Object.is` equality, named-record field suppression,
declared-value preservation, no comparator argument, optional `useShallow` shared record equality, and no
operation acquisition or mutation from selectors. Under `REV-HOST-007`, the `passive useView dependency
replacement` proof MUST show that each evaluation records every exact descriptor and canonical `K` read,
replaces the dependency set after the evaluation, reruns only for actor publication or matching StoreFanout,
and reads one tear-free actor/store boundary. The runtime-owned dependency lease MUST be balanced with the
actor view lifetime; no manual subscription is required for actor correctness, and a projection-only rerun
MUST NOT evaluate transitions. Strict Mode and Activity cleanup MUST be balanced, live generations MUST NOT
overlap, resume MUST perform one context reconciliation, and final unmount MUST leave no active runtime work.
Prepared context/SSR, lifecycle publication identity, suspended dependency cleanup, hook tuple changes,
prepared mailbox bounds, selector defects, and handle capabilities are owned by `REV-HOST-002` through
`REV-HOST-006`; passive-read reactivity is owned by `REV-HOST-007`.

## PROOF-013: Lifecycle and inspection evidence

Prove each lifecycle transition publishes one coherent immutable snapshot through the existing handle before
its inspection event, that inspection retains start/restore/dispose and adds suspend/resume without a prepare
event, and that lifecycle evidence creates neither a machine revision nor a `TurnRecord`. An inspection
listener reading the actor after the event MUST observe the event's `to` lifecycle.

Prove private publication and machine-turn revision counters, hydration counter restoration, the exact
LifecycleRecord cause tags and restore `prepared -> prepared` fact, one publication barrier and global
sequence allocator, asynchronous release gates, per-sink truncation and failure isolation, accepted-prefix
drain, sequence-exhaustion refusal, and runtime disposal drain without a synthetic terminal TurnRecord.

Equivalent live-host and Story execution proofs MUST compare accepted `TurnRecord` and `LifecycleRecord`
facts without introducing a second mutable trace or inspection history. Exact ordered lifecycle evidence,
sequence allocation, sink overflow, drain, and failure behavior are owned by `REV-HOST-004`.

## PROOF-014: Persistence, artifacts, server, and CLI

Prove the accepted production bootstrap restores and validates declared persistable actors, completes initial `Runtime.ensureActor` calls,
resolves exact context-provider refs, rejects missing providers, duplicate registrations, foreign machines,
and instance cycles before activation or handle escape, and restores context-derived projections in dependency
order without replaying `onContext` events. Prove that baseline installation is silent, later context changes
provide defined current and previous values to handlers, and `false` or `null` handlers emit no event.

Prove Persistence captures a context-closed cut with exact binding refs and provider revisions, rejects an
opaque local provider for an included persistable consumer with `NonDurableContextProvider`, and restores derived
context from provider truth. RuntimeSetup discovery and bootstrap ownership are covered above; exact host
seeding follows `REV-HOST-008`.

Continuing-stream persistence MUST capture the contracted latest projection and terminal status without
serializing or replaying old emissions. Hydration MUST rematerialize an active declaration from live executable
input, fail closed when that input is missing, and never restart a terminal stream. The implementation proof
for this obligation is owned by `REV-OPS-015`; this matrix does not invent a receipt path.

Persistence proofs MUST also cover synchronous Web Storage and asynchronous IndexedDB normalization,
`read`/`write`/`remove` storage failures, malformed data, app/persistence identity mismatch, default-codec
rejection, custom-codec failure, `ConcurrentDehydrate`, `NonDurableContextProvider`, and preservation of the
last successfully stored record after a write failure. These failures MUST be reported without mutating
committed runtime state or allowing an older asynchronous write to replace a newer record.

Artifact, persistence, inspect, and CLI proofs MUST update schemas and evidence for app Stories, exact actor
lookup, `run.end`, module tooling identity, compound states, context requirements, lifecycle records, and
operation identities without preserving deleted surfaces. They MUST retain accepted bounds, inspection sinks,
CLI formatting, and production-owner proof discipline only where compatible. Exact representation, byte
stability, and parity follow WIRE-020B; this row does not create a second decoder or result owner. Negative
artifact vectors MUST assert the exact rejection code, category, path, and bound for invalid descriptor IDs,
duplicate IDs, duplicate machine values, duplicate module ownership, missing module references, invalid state
defaults, unresolved requirement IDs, invalid Story metadata, malformed trace records, impossible lifecycle
tuples, and inconsistent Story end/failure/cleanup evidence. `EvidenceUnavailable` vectors MUST assert the
non-null truncation marker.

## PROOF-015: Individual actor ownership without child capability

Prove individual disposal is owned only by explicit leases, dependent consumers block provider disposal with
exact refs and binding paths, cleanup is idempotent, stable-ref tombstones prevent same-runtime recreation,
and a new runtime may use the durable ref under ordinary boot rules.

This row defines no remote-lease behavior. Child-machine APIs, child lifecycles, child mailboxes, child
memory, child completion, and child-equivalent Story surfaces are absent under `DEL-002` and `REV-MIG-006`;
independent subordinate workflows require explicit actors.

## PROOF-016: Final proving applications

Todo Essentials proves ordinary definitions, compound machine states, actor refs and leases, named operation
families, transition actions, views, React, fixtures, Stories, checkpoints, and TestClock paths.

Incident Console proves multiple exact refs, context bindings, transaction conflicts, continuing streams,
scoped leases, inspection, diagnostics, CLI/artifact integration, and browser lifetime through accepted
production owners. Hydrated Offline Notes proves request isolation, context-closed persistence, first-render
consistency, persisted outbox behavior, reconnect behavior, and disposal; hydration and host-seeding details
follow the exact `WIRE-*` and `REV-HOST-008` clauses rather than inferred application requirements.

Bounded-feed behavior remains a package contract fixture with dropping or coalescing authored inside the
application Stream rather than a Flow `pressure` option. React 18/19 and isolated TypeScript modes remain
packed/type proof packages, not showcase applications.

## PROOF-017: Deletion, retained boundaries, and package hygiene

Prove the complete old-contract disposition audit for `DEL-001` through `DEL-011` and `RET-001` through
`RET-005`. Runtime export inspection and packed declaration negatives MUST show that every deleted value,
namespace, type, overload, property, deep import, file-level registry, example, proof, and task reference is
absent from active authority, while retained package routes, ESM/import conditions, Effect peer identity,
React peer compatibility, synchronous send, status discriminants, canonical operation methods, transition
actions, and revised host surfaces remain available.

Prove deleted authoring shapes fail before actor creation, memory mutation, operation acquisition, event
publication, external work, or evidence. Prove active documents, glossaries, examples, Stories, fixtures,
tests, and task files use only accepted replacements or retained boundaries; live examples and Stories MUST
exercise replacements through the production owners; no alias, adapter, registry, translator, parser branch,
second runtime, mutable harness, child capability, registered view, or old Story/operation surface survives
solely for compatibility. Replacement behavior MUST execute through the production owners.

`REV-MIG-003` remains the cross-cutting proof boundary. Deletion proof does not authorize a second runtime,
actor, Story, operation, or selector implementation. Old names may appear only in negative absence proofs;
they MUST NOT appear in positive examples, supported overloads, active glossary definitions, or replacement
recipes.

Deletion proof MUST combine runtime export inspection with package typecheck, packed consumers,
package tests, example tests, browser tests, and the broad workspace gate. Before deleting historical
authority, map every still-live route, peer identity, React compatibility, exact-inference, isolation,
capacity, hostile-input, lifecycle, and independent-oracle obligation to a current proof, then prove that
the deleted authority has no remaining consumer. Source scans support this audit but do not replace runtime
or declaration absence proofs.

## Local proof crosswalk

Local `*-P*` sections refine the central proof rows and MUST be named by the same implementation task or proof
record. The IDs below are the active stable crosswalk; retired phase, receipt, and task files are historical
evidence only and do not choose current ownership. `CLI-P01` covers current CLI grammar, gateway, execution, artifact, and
formatting behavior; `CLI-P02` covers fresh packaged-binary and deleted-surface cutover evidence.

| Local obligation | Central proof owner                                            |
| ---------------- | -------------------------------------------------------------- |
| `API-P01`        | `PROOF-001`, `PROOF-017`                                       |
| `API-P02`        | `PROOF-001`, `PROOF-002`                                       |
| `API-P03`        | `PROOF-003`, `PROOF-005`–`PROOF-008`, `PROOF-011`, `PROOF-014` |
| `CLI-P01`        | `PROOF-014`                                                    |
| `CLI-P02`        | `PROOF-014`, `PROOF-017`                                       |
| `TYPE-P01`       | `PROOF-001`                                                    |
| `TYPE-P02`       | `PROOF-001`, `PROOF-017`                                       |
| `TYPE-P03`       | `PROOF-001`                                                    |
| `TYPE-P04`       | `PROOF-001`                                                    |
| `SNAP-P01`       | `PROOF-001`, `PROOF-005`, `PROOF-006`                          |
| `HOST-P01`       | `PROOF-003`, `PROOF-004`, `PROOF-012`                          |
| `HOST-P02`       | `PROOF-003`, `PROOF-010`                                       |
| `HOST-P03`       | `PROOF-003`, `PROOF-005`                                       |
| `HOST-P04`       | `PROOF-012`, `PROOF-014`                                       |
| `HOST-P05`       | `PROOF-004`, `PROOF-012`                                       |
| `CUT-P01`        | `PROOF-001`, `PROOF-017`                                       |
| `CUT-P02`        | `PROOF-001`, `PROOF-017`                                       |
| `CUT-P03`        | `PROOF-001`, `PROOF-017`                                       |
| `CUT-P04`        | `PROOF-001`, `PROOF-012`, `PROOF-014`, `PROOF-017`             |
| `CUT-P05`        | `PROOF-017`                                                    |
| `CUT-P06`        | `PROOF-017`                                                    |

A local proof section is normative and cannot disappear merely because its prefix is not `PROOF-*`.

## Contract-family closure crosswalk

Every contract family below MUST be represented by one or more dependency-ordered implementation issues.
The issue description MUST copy the listed contract clauses, proof rows, source owner, focused proof path,
and non-goals; proposal files and retired receipts are evidence only.

| Contract family | Normative sources | Central proof rows | Greenfield dependency |
| --- | --- | --- | --- |
| Static foundation | `GLOSSARY_AND_IDENTITY.md`; `PUBLIC_API.md` API-001–010; `TYPE_SYSTEM.md` TYPE-001–009; accepted composition/machine revisions | `PROOF-001`, `PROOF-002`, `TYPE-P01`–`TYPE-P04` | first |
| Runtime ownership | `ARCHITECTURE.md` ARCH-007–020; `SEMANTICS.md` admission/mailbox/lifecycle clauses; `REACT_AND_HOSTS.md` HOST-001–006; `TYPE_SYSTEM.md` TYPE-010–015 | `PROOF-003`, `PROOF-004`, `PROOF-015`, `HOST-P01`–`HOST-P05` | after static foundation |
| Operation kernels | `TYPE_SYSTEM.md` operation inference; `SEMANTICS.md` SEM-011–021 and SEM-029–030; `SNAPSHOTS.md`; accepted operations revision | `PROOF-005`–`PROOF-007`, `SNAP-P01` | after runtime ownership |
| Persistence and evidence | `PERSISTENCE_AND_ARTIFACTS.md` WIRE-000–023; capture/hydration clauses in `SNAPSHOTS.md` | `PROOF-009`, `PROOF-010`, `PROOF-014`, `CLI-P01` | after runtime and operation kernels |
| Hosts, Stories, and CLI | `TESTING.md` REV-TEST-001–010; `REACT_AND_HOSTS.md`; `CLI.md`; `PUBLIC_API.md` API-011–017 | `PROOF-008`, `PROOF-010`, `PROOF-012`, `PROOF-014`, `CLI-P01` | after runtime; operation/evidence edges where used |
| Cutover and absence | `COMPATIBILITY_AND_DELETIONS.md`; `PROOF-016`–`PROOF-017`; accepted migration/deletion revisions | `PROOF-016`, `PROOF-017`, `CLI-P02`, `CUT-P01`–`CUT-P06` | after every prior family |

The crosswalk is a decomposition boundary, not a second semantic specification. Splitting a row into
multiple issues is valid only when each child retains its exact contract references, proof ownership,
acceptance behavior, dependencies, and non-goals.

### Greenfield proof boundary

Before the replacement becomes a package, focused proof issues MUST run against
`packages/flow-state-rewrite/`:

```sh
nubx tsc -p packages/flow-state-rewrite/tsconfig.json --noEmit
vp test packages/flow-state-rewrite/src/<focused-proof>.test.ts
vp lint packages/flow-state-rewrite/src
```

The frozen `packages/flow-state/` package is migration evidence and its green gates do not prove
replacement conformance. Once the replacement has package entrypoints, its package-local type, test, lint,
build, and packed-consumer gates become the active proof boundary. The existing published-package, example,
browser, and full-workspace gates are late cutover obligations under `PROOF-016` and `PROOF-017`.

## Required gate layers

Focused tests establish one proof mechanism quickly, but closure requires the next owning boundary:

1. focused proof files for the affected `PROOF-*` IDs;
2. `nub run --filter flow-state check:cli-source-types`;
3. `nub run --filter flow-state test`;
4. `nub run --filter flow-state build`;
5. `nub run --filter flow-state check:typescript-mode-proofs` and
   `nub run --filter flow-state check:packed-consumers` for public or declaration changes;
6. affected example tests and builds;
7. `nub run test:browser` for browser ownership or lifecycle changes;
8. `nub run verify` for final phase closure.

The live script owners are `packages/flow-state/package.json:59-69` and root `package.json:6-30`. These gate
commands are unchanged by the revision overlay. The accepted architecture and parity proof boundary is
`REV-MIG-003`; any reopened behavior or contract ID must remain carried in an explicit blocking implementation
task until the contract authority is updated or the proof is complete.
