# Normative proof matrix

Status: normative

This matrix defines the evidence required to claim the target implementation correct. A green
test count does not close a proof unless the test exercises the named mechanism through its
production owner. Source-text assertions about filenames, exported token strings, or helper
placement are not substitutes for type, behavior, race, interruption, lifetime, or artifact
proof.

Every implementation phase must list the `PROOF-*` IDs it changes, name the exact executable
tests that cover them, and carry unresolved IDs into its receipt. No phase may mark an ID
closed from prose, snapshots fabricated by a test helper, or a legacy harness that bypasses
the target actor engine.

The broad `PROOF-*` rows are requirements, not receipt closure units. Phase 0 must assign stable
subcase IDs and exactly one closing phase to every independently executable case; later phases may
rerun an earlier subcase as dependency evidence but cannot claim a second closure.
The normative atomic case and local-proof index is
[`../phase-0/proof-index.json`](../phase-0/proof-index.json).

## PROOF-001: Public typing and inference

Prove definition and machine inference, including definition-owned input and initial memory,
descriptor-plus-argument resource refs, exact transaction refs, fixture and control channel types,
exclusive story starts, typed events, literal checkpoint result keys, inferred model path shapes,
root versus statically admitted dynamic-machine authority, computed invalidation targets,
lookup-only durable dynamic actors, `FlowDehydrateError` narrowing, and inaccessible internal
acknowledgment APIs. Run the same declarations through source TypeScript, packed declarations,
strict mode, isolated modules, isolated declarations, multi-entry consumers, and packed React
18 and React 19 consumers.

Required negative proofs include invalid start combinations, wrong-machine events, missing
control channels when error is `never`, duplicate literal checkpoint names where statically
detectable, resource `key` or canonical-key invalidation filters, unsatisfied app services,
dynamic-machine factories or inputs in AppPlan, unreachable actor creation, and import attempts for
removed legacy testing exports. Packed consumers MUST prove `FlowStoryExecutionError` is the
only named testing runtime class and reject named run-result, path, command, evidence,
pending-work, cleanup, model-diagnostic, and general diagnostic imports.

Root and secondary entry-point consumers MUST also reject imports of `ActorState`,
`PendingOutcome`, and acknowledged outcome-command types.

Packed consumers MUST import `story`, `fixture`, `control`, `model`, `behavior`, and
`FlowStoryExecutionError` from `flow-state/testing` and prove that none of those values is
available from the root route.

Run a representative small, medium, and large story/model compile fixture through
`tsc --extendedDiagnostics`. Record wall time, type count, instantiation count, and memory, and
fail the package-owned type-performance gate when growth is superlinear across the fixtures or
the checked-in type/instantiation ceiling is exceeded. Wall time and peak memory are recorded as
trend evidence and never gate because they vary by host. A declaration that is correct but impractical to instantiate
does not close this proof.

## PROOF-002: Pure compilation and identity

Prove app and story compilation executes no Effect and registers nothing globally. Repeating
the same fixture or endpoint definition reference deduplicates in first-seen order; distinct
definitions with the same ID fail deterministically; endpoint collisions fail across endpoint
kinds; duplicate exact-ref seeds fail; and independent app compilations cannot resolve through
one another.

Prove `dynamicMachines` is an inert exact tuple: it contributes the admitted machine's complete
closure and Effect requirements, creates no actor, does not make the machine a root, deduplicates
the same machine value, and rejects colliding distinct definitions before Layer acquisition.

Prove final nodes accept only `{ type: "final" }`. Prove flat machine grammar rejects hierarchy,
parallel regions, and history; AppPlan rejects post-construction extension; activity declarations
reject runtime-sized keyed collection forms. Asynchronous pre-bootstrap module assembly remains
ordinary userland composition and mutates no compiled app.

Use acquisition counters and hostile definition objects in addition to ordinary equality
cases. Failure must occur before Layer acquisition, fixture instantiation, actor creation, or
control-state allocation.

## PROOF-003: Actor turn acknowledgment and publication

Prove a package-private acknowledged send completes after redirect stabilization, immediate
reconciliation, one immutable snapshot publication, and command acknowledgment. It must
complete before a deliberately blocked resource, transaction, stream, timer, or child outcome.

Prove reentrant sends retain mailbox order, one command produces one published revision,
store fan-out reaches other actors only after the initiating actor publishes, and public
`actor.send(event): void` exposes no Promise or acknowledgment. Actor snapshots contain current
public facts, not receipt history; the post-publication TurnRecord owns receipt and inspection
projection. Disposal must fail buffered acknowledgments before Queue shutdown.

Prove every fresh root, dynamic actor, child, and story actor invokes its definition memory
factory once when present before its first snapshot and activity start; an omitted factory
produces the canonical empty readonly record. Hydration and snapshot restoration must invoke it
zero times; a throwing factory must publish no partial actor and start no work.

Prove CommitPlan interpretation cannot start a user Effect before the pending actor snapshot
and TurnRecord exist. The package-private post-commit reconciliation fact is queued before
acknowledgment, so a story `.send()` observes the pending turn and a following `.flush()` starts
the staged work deterministically without waiting for it to settle.

For every activity kind, prove the projection/cursor turn atomically records one durable pending
outcome before offering its mailbox command. Capture between publication and command processing,
hydrate, and drain must apply the materialized event exactly once without rerunning its mapper;
duplicate outcome-ID commands are stale no-ops, and an inapplicable event still clears its record.
Ordinary binding release must not drop an admitted outcome. Actor/runtime disposal may clear it as
cleanup. On boot, restored IDs must precede the activation barrier and every early host event; the
barrier must prevent restored activity work from starting until those IDs drain.

Entering a final state MUST publish its final token once, release prior activities after
publication, remain readable and persistable as an active root, and produce ordinary no-transition
turns for later events. It MUST NOT publish output, auto-dispose, or complete the snapshot stream.

## PROOF-004: Runtime and scope lifetime

Prove early sends wait on one lazy Layer acquisition and execute exactly once, acquisition
failure reaches all waiters, every activity is reachable from the ManagedRuntime Scope, and
runtime disposal interrupts owned work, runs each finalizer once, reports full cleanup Causes,
and is idempotent.

Cover normal completion, typed failure, defect, interruption, state exit, replacement, actor
stop, runtime disposal, story cancellation, and simultaneous execution plus cleanup failure.
After a successful dispose, no owned fiber, lease, queue worker, controlled endpoint waiter, or
host subscription remains live, and no pending outcome remains routable.

Prove a managed child reaches final through one ordinary child turn, the parent observes one
complete projection and one durably admitted completion outcome, the child is released exactly
once, and the terminal projection remains consumed until reentry. Boot MUST not restart a terminal
child or replay completion. Parent-to-managed-child command syntax and handles MUST not compile.

## PROOF-005: Exact primitive identity and stale-generation safety

Prove two canonically different resource argument tuples in one descriptor family remain distinct
in runtime snapshots, stories, model starts, inspection, persistence, and CLI artifact rendering,
including a hostile pair that a removed projected key would have collapsed. Two actors may execute the
same transaction ref without generation collision, while shared resource lookup generation
remains store-global.

Prove the `SNAP-*` reader laws: a missing read is frozen idle and side-effect-free, placeholder
never satisfies `require`, terminal transaction projection follows its consumed binding rather
than accumulating by actor lifetime, and old immutable snapshots cannot change after later
turns.

Compile and execute every legal `ResourceSnapshot` member. Prove `value`, `error`, and
`generation` narrow only on their contracted discriminants, illegal combinations do not compile,
and a large resource family remains within the checked-in declaration-instantiation budget.

Every late completion compares actor, ref, and generation immediately before publication.
Older resource, transaction, stream, child, timer, lease, and collection generations cannot
overwrite or evict newer ownership.

## PROOF-006: Resource ownership, freshness, and collection

Prove machine activity leases, rather than React observers, own refresh and retention.
TestClock drives stale publication, `gcTime: 0`, finite GC, infinite GC, exact-deadline
reacquisition, reconnect and focus rules, in-flight retention, hydration freshness, and
lease-epoch eviction.

Explicit ensure, observe, and refresh MUST still admit while the host is offline, and going
offline MUST NOT cancel in-flight work. Reconnect MUST refresh only actively observed missing or
stale refs without an existing generation. Fresh refs, joined generations, and public snapshot
types MUST gain no paused state.

Placeholder data exists only during an active lookup projection, never becomes canonical or
persisted data, and never emits a success outcome. A late store subscriber receives the latest
state; a revision gap causes a full reread instead of trusting the latest ordered changed-ref vector.

Prove the complete resource outcome matrix. A fresh `ensure` settles once without lookup; stale
retained data waits for its registered generation; joined owners share execution but receive
their own mapped result; observe replays the current canonical value once and emits only changed
`valueRevision`s. Equal-value success, invalidation, freshness, overlay, generation, collection,
restoration, planned release, and stale completion MUST produce exactly the outcomes specified by
`SEM-011A/B`. Computed invalidation MUST materialize and deduplicate exact refs/tags, commit them
atomically, and never retain or execute a store predicate.

## PROOF-007: Transaction concurrency, overlays, and Causes

Prove exact-ref generation ownership for `reject`, `cancel`, `allow`, and `serialize` policies.
Serialized queues prove admission, FIFO order, generation allocation,
state-exit handling, and work that was queued but never started.

Overlapping optimistic attempts preserve global overlay order and remove only their own
generation on success, typed failure, defect, interruption, restore, or disposal. Success
invalidates canonical data, and no transaction or stream outcome may publish an authoritative
resource base. Typed
failure, defect, mixed Cause, and interruption-only exits project to distinct lanes while the
full original Cause remains inspectable.

## PROOF-008: Fixture and controlled endpoint isolation

Prove each story run receives new fixture instances, endpoint ordinals, invocation logs,
Deferreds, queues, subscriptions, and cancellation state. Concurrent executions of one plan
cannot share any of them.

Prove `call(1)` may complete before `call(0)`, repeated equal arguments still receive distinct
ordinals, missing and terminated targets fail immediately with exact pending-work diagnostics,
and every control outcome reaches the real application service and production primitive before
Flow publishes evidence.

## PROOF-009: Story progress and TestClock

Prove one TestClock drives machine timers, resource stale and GC clocks, retries, schedules,
serialized activities, and controlled dependencies without wall-clock sleeps. `flush` drains
only ready work, `settle` stays at current time, and only `advance`, `setTime`, or
`advanceToNextTimer` moves time.

Continuing observations, streams, child actors, and future timers do not block settlement.
Finite lookups and transactions do. Every looping command enforces the story's one `maxTurns`
bound and reports exact finite and continuing pending work on exhaustion.

## PROOF-010: Checkpoint and run-result integrity

Prove `.send(event).checkpoint(name)` captures the acknowledged event turn without flushing a
later operation completion. A checkpoint never progresses execution. Its snapshot,
pending-work roots, time, and derived projections remain frozen after later publications,
retention pruning, and disposal.

Checkpoint and final observations contain no receipt, trace, or inspection history. When a
proof needs those projections it installs a run-local TurnRecord sink and correlates by turn
identity rather than reading receipts from an actor snapshot.

Completed product failures return ordinary story evidence with no Flow-owned correctness
status. Prepare, command, cancellation, and disposal failures throw `FlowStoryExecutionError`
with the correct phase, command index, completed checkpoints, mutually exclusive `atFailure`
or `final`, primary Cause, and cleanup status.

## PROOF-011: Pure model and live-path parity

Use both a structural test and behavioral spies. The pure model package must have no Effect
import or `Effect.run*` call, and discovery must leave service, lookup, transaction, stream,
Layer, and control counters at zero. The base story must be command-empty, and each traversal
call's concrete typed event array must be the sole candidate source. Fixture seeds may establish
pure initial facts; fixtures, controls, outcomes, registered stories, and CLI input must not
produce candidates.

For representative guarded, redirected, memory-updating, and fresh fixture-seeded paths,
compare each predicted final snapshot with `path.story.run().final`. Compare intermediate steps
by running the corresponding model-generated prefix stories and checking each prefix's `final`.
The live proof must use the ordinary story runner and actor engine, without invented model
checkpoint names or a replay-specific harness.

## PROOF-012: View, React, and host boundaries

Prove `runtime.actor(machine)` accepts only roots, dynamic creation accepts only app-reachable
machines, early command handles never drop sends, and command-only `useActor` does not
subscribe. `useView` reads one atomic actor snapshot through `useSyncExternalStore` and applies
one internal structural-sharing policy.

Prove an app-level dynamic seed is creatable but not root-addressable, carries its exact input and
requirements, and cannot be installed or replaced after runtime construction.

Prove `runtime.actor(dynamicMachine, { id })` returns the exact restored durable handle without
creating or adopting it and rejects missing, foreign, mismatched, opaque, disposed, and ambiguous
identities. `createActor` MUST continue to reject collisions.

React 18 and 19 proofs must cover readiness, acquisition failure, subscribe/unsubscribe races,
Strict Mode, SSR server snapshots, selector failure, actor replacement attempts, and mount or
unmount independence from resource leases, stale time, refresh, and GC. Server and CLI hosts
must use root lookup without creating a duplicate dynamic actor.

## PROOF-013: TurnRecord and inspection sink retention

Prove one immutable TurnRecord is derived from each committed actor turn after publication and
drives receipt, inspection, and trace projections. No independently mutable trace or inspection
history may disagree with it.

For pending outcomes, the causal record must identify admission and the later event turn must
identify applied, inapplicable-and-cleared, stale-duplicate, or cleanup-cleared disposition. No
sink may infer delivery merely from the resource or activity projection.

`createInspectionBufferSink()` retains 256 records by default, validates explicit capacities,
supports zero, drops the oldest records deterministically, and exposes
`truncatedBeforeSequence` after loss. Captured sink snapshots remain stable. Actors and runtimes
without a buffer sink retain no inspection history. Runtime boot excludes sink history, while
explicit v2 trace artifacts round-trip records and truncation markers.

## PROOF-014: Boot, artifacts, server, and CLI

Prove v2 boot decoding finishes before root activity starts; incompatible artifact version,
app ID, persistence version, descriptor ID, token ID, and canonical ref fail with structured
typed diagnostics. Domain memory and payload validation remains application-owned.

Prove successful dehydration captures the complete canonical StoreState and never applies a
descriptor predicate, current-view heuristic, or unreferenced-warmth omission. Every
`FlowDehydrateError.kind` MUST narrow through the packed declaration; only
`ConcurrentDehydrate` is retryable, while non-durable ownership/params, identity closure, payload
encoding, bounds, and disposed runtime are terminal.

Prove a running stream round trip persists canonical concrete params, does not serialize or
resume its old fiber/Scope/cursor, records the old generation as an unrouted restoration
interruption, and starts exactly one fresh scoped generation after hydrated publication and
readiness without rerunning the selector. Active noncanonical params must fail capture as
`NonDurableActiveStreamParams`; terminal streams must remain consumed.

Round-trip pending resource, transaction, stream, timer, and child outcomes captured after their
causal projection but before mailbox processing. Boot must restore the materialized token/payload,
schedule the stable outcome ID once after readiness, and clear it only in the resulting actor turn.
Boot and trace payloads must never serialize Queue cells or rerun outcome mappers.

Server requests use an isolated preload runtime, dehydrate/dispose it, and construct a separate
immutable render runtime from that boot; both dispose after render or failure and the client first
selection matches the render cut. CLI discovery finds registered stories through behavior,
executes the same story runner, renders checkpoints and execution errors, and never fabricates
arbitrary payload-bearing events. CLI help and invocation tests MUST prove `story paths`,
path-check/list flags, and `--event` are unsupported and that no deleted helper is reachable.

The CLI proof implements `CLI-001` through `CLI-012`. It MUST pair source-level
handler/parser/codec tests with a freshly built binary invoked
through an installed packed-consumer shim. It MUST run from a read-only project root, prove
temporary gateway output is cleaned, and fail if the binary predates checked-in source. Text and
JSON MUST derive from one result and prove the contracted stdout/stderr and exit behavior for
success, comparison mismatch, usage, artifact decode, gateway load, story execution, cleanup,
interruption, local I/O, and internal defects.

Gateway loading MUST validate the branded behavior value before access and acquire no Layer,
runtime, story fixture, or inspection sink for discovery commands. Direct story execution and CLI
execution MUST produce identical checkpoints, final observation, execution error, primary Cause,
and cleanup truth. A trace-output run MAY add exactly one bounded run-local sink; a run without it
MUST retain no history. Artifact proofs MUST include v1, wrong-kind, oversized, over-deep,
compressed, hostile-identity, malformed, and truncated inputs through the packed binary. A trace
diff over truncated windows MUST NOT report complete equality.

## PROOF-015: Scoped remote leases

Prove a domain-significant remote lease is owned by a child actor and its activity Scope, with
no new operation kind. Cover acquisition, normal remote completion, local navigation,
replacement, parent disposal, runtime disposal, and external interruption.

Release runs exactly once. Planned release does not synthesize an interruption outcome.
Cancellation failure and finalizer defect retain their full Cause as actor cleanup issues and
cannot be erased with `Effect.ignore`.

## PROOF-016: Final proving applications

Todo Essentials proves ordinary resource, transaction, optimistic overlay, machine, view,
React, fixture, story, checkpoint, and TestClock paths. Incident Console proves multiple refs,
transaction conflicts, Effect Stream backpressure, children, scoped leases, inspection, diagnostics,
CLI, and browser lifetime. Hydrated Offline Notes proves request isolation, root-machine
preload, v2 boot, first-render consistency, persisted outbox, reconnect drain, and disposal.

Bounded-feed behavior remains a package contract fixture with dropping/coalescing authored inside
the application Stream rather than a Flow `pressure` option. React 18/19 and isolated TypeScript
modes remain packed/type proof packages, not showcase applications.

## PROOF-017: Deletion and package hygiene

Prove removed exports cannot be imported from source or packed declarations, deleted files and
example packages are absent, package export maps contain only supported entries, root scripts
delegate to live packages, and no legacy executor, mutable harness, controlled stream,
production fixture registry, actor shell, direct resource hook, mutable hydration API,
parallel trace history, CLI path request/envelope/renderer/model helpers, or source-text
architecture assertion survives.

Deletion proof must combine exact filesystem or export inspection with package typecheck,
packed consumers, package tests, example tests, browser tests, and the broad workspace gate.

Before deleting root tasks, contracts, audit ledgers, receipts, or historical documentation, map
every still-live packed-route, peer identity, React 18/19, exact-inference, isolation, capacity,
hostile-input, lifecycle, and independent-oracle obligation to a current proof. Exact inbound-link
and filesystem checks MUST then show that the deleted authority has no remaining consumer.

## Local proof crosswalk

Local `*-P*` sections refine the central proof rows and MUST be named by the same phase receipt:

| Local obligation     | Central proof owner                                            |
| -------------------- | -------------------------------------------------------------- |
| `API-P01`            | `PROOF-001`, `PROOF-017`                                       |
| `API-P02`            | `PROOF-001`, `PROOF-002`                                       |
| `API-P03`            | `PROOF-003`, `PROOF-005`–`PROOF-008`, `PROOF-011`, `PROOF-014` |
| `TYPE-P01`           | `PROOF-001`                                                    |
| `TYPE-P02`           | `PROOF-001`, `PROOF-017`                                       |
| `TYPE-P03`           | `PROOF-001`                                                    |
| `TYPE-P04`           | `PROOF-001`                                                    |
| `SNAP-P01`           | `PROOF-001`, `PROOF-005`, `PROOF-006`                          |
| `HOST-P01`           | `PROOF-003`, `PROOF-004`, `PROOF-012`                          |
| `HOST-P02`           | `PROOF-003`, `PROOF-010`                                       |
| `HOST-P03`           | `PROOF-003`, `PROOF-005`                                       |
| `HOST-P04`           | `PROOF-012`                                                    |
| `HOST-P05`           | `PROOF-004`, `PROOF-012`                                       |
| `CUT-P01`–`CUT-P03`  | `PROOF-001`, `PROOF-017`                                       |
| `CUT-P04`            | `PROOF-001`, `PROOF-012`, `PROOF-014`, `PROOF-017`             |
| `CUT-P05`, `CUT-P06` | `PROOF-016`, `PROOF-017`                                       |

Phase 0 MUST record this crosswalk in its proof index. A local proof section is normative and
cannot disappear merely because its prefix is not `PROOF-*`.

## Required gate layers

Focused tests establish one proof mechanism quickly, but closure requires the next owning
layer:

1. focused proof files for the affected `PROOF-*` IDs;
2. `pnpm --filter flow-state check:cli-source-types`;
3. `pnpm --filter flow-state test`;
4. `pnpm --filter flow-state build`;
5. `pnpm --filter flow-state check:typescript-mode-proofs` and
   `pnpm --filter flow-state check:packed-consumers` for public or declaration changes;
6. affected example tests and builds;
7. `pnpm test:browser` for browser ownership or lifecycle changes;
8. `pnpm verify` for final phase closure.

The live script owners are `packages/flow-state/package.json:59-69` and root
`package.json:6-30`. The required architecture invariants originate in
`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:757-800`.
