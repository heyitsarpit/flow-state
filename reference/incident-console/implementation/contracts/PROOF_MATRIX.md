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

## PROOF-001: Public typing and inference

Prove vocabulary and machine inference, exact resource and transaction refs, fixture and
control channel types, exclusive story starts, typed events, literal checkpoint result keys,
model path types, root versus reachable machine authority, and inaccessible internal
acknowledgment APIs. Run the same declarations through source TypeScript, packed declarations,
strict mode, isolated modules, isolated declarations, multi-entry consumers, and packed React
18 and React 19 consumers.

Required negative proofs include invalid start combinations, wrong-machine events, missing
control channels when error is `never`, duplicate literal checkpoint names where statically
detectable, unsatisfied app services, unreachable actor creation, and import attempts for
removed legacy testing exports.

## PROOF-002: Pure compilation and identity

Prove app and story compilation executes no Effect and registers nothing globally. Repeating
the same fixture or endpoint definition reference deduplicates in first-seen order; distinct
definitions with the same ID fail deterministically; endpoint collisions fail across endpoint
kinds; duplicate exact-ref seeds fail; and independent app compilations cannot resolve through
one another.

Use acquisition counters and hostile definition objects in addition to ordinary equality
cases. Failure must occur before Layer acquisition, fixture instantiation, actor creation, or
control-state allocation.

## PROOF-003: Actor turn acknowledgment and publication

Prove a package-private acknowledged send completes after redirect stabilization, immediate
reconciliation, one immutable snapshot publication, and command acknowledgment. It must
complete before a deliberately blocked resource, transaction, stream, timer, or child outcome.

Prove reentrant sends retain mailbox order, one command produces one published revision,
store fan-out reaches other actors only after the initiating actor publishes, and public
`actor.send(event): void` exposes no Promise or acknowledgment. Disposal must fail buffered
acknowledgments before Queue shutdown.

## PROOF-004: Runtime and scope lifetime

Prove early sends wait on one lazy Layer acquisition and execute exactly once, acquisition
failure reaches all waiters, every activity is reachable from the ManagedRuntime Scope, and
runtime disposal interrupts owned work, runs each finalizer once, reports full cleanup Causes,
and is idempotent.

Cover normal completion, typed failure, defect, interruption, state exit, replacement, actor
stop, runtime disposal, story cancellation, and simultaneous execution plus cleanup failure.
After a successful dispose, no owned fiber, lease, queue worker, controlled endpoint waiter, or
host subscription remains live.

## PROOF-005: Exact primitive identity and stale-generation safety

Prove two parameterized refs in one descriptor family remain distinct in runtime snapshots,
stories, model starts, inspection, persistence, and CLI addressing. Two actors may execute the
same transaction ref without generation collision, while shared resource lookup generation
remains store-global.

Prove the `SNAP-*` reader laws: a missing read is frozen idle and side-effect-free, placeholder
never satisfies `require`, terminal transaction projection follows its consumed binding rather
than accumulating by actor lifetime, and old immutable snapshots cannot change after later
turns.

Every late completion compares actor, ref, and generation immediately before publication.
Older resource, transaction, stream, child, timer, lease, and collection generations cannot
overwrite or evict newer ownership.

## PROOF-006: Resource ownership, freshness, and collection

Prove machine activity leases, rather than React observers, own refresh and retention.
TestClock drives stale publication, `gcTime: 0`, finite GC, infinite GC, exact-deadline
reacquisition, reconnect and focus rules, in-flight retention, hydration freshness, and
lease-epoch eviction.

Placeholder data exists only during an active lookup projection, never becomes canonical or
persisted data, and never emits a success outcome. A late store subscriber receives the latest
state; a revision gap causes a full reread instead of trusting incomplete changed-ref hints.

## PROOF-007: Transaction concurrency, overlays, and Causes

Prove exact-ref generation ownership for reject-while-running, cancel-previous, concurrent,
and serialized policies. Serialized queues prove admission, FIFO order, generation allocation,
state-exit handling, and work that was queued but never started.

Overlapping optimistic attempts preserve global overlay order and remove only their own
generation on success, typed failure, defect, interruption, restore, or disposal. Success
invalidates canonical data unless an explicit authoritative-response mapping exists. Typed
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

Completed product failures return ordinary story evidence with no Flow-owned correctness
status. Prepare, command, cancellation, and disposal failures throw `FlowStoryExecutionError`
with the correct phase, command index, completed checkpoints, mutually exclusive `atFailure`
or `final`, primary Cause, and cleanup status.

## PROOF-011: Pure model and live-path parity

Use both a structural test and behavioral spies. The pure model package must have no Effect
import or `Effect.run*` call, and discovery must leave service, lookup, transaction, stream,
Layer, and control counters at zero. Explicit candidate events are the only async outcomes.

For representative guarded, redirected, memory-updating, restored, and resource-seeded paths,
compare the predicted path snapshots with named checkpoints from `path.story.run()`. The live
proof must use the ordinary story runner and actor engine, not a replay-specific harness.

## PROOF-012: View, React, and host boundaries

Prove `runtime.actor(machine)` accepts only roots, dynamic creation accepts only app-reachable
machines, early command handles never drop sends, and command-only `useActor` does not
subscribe. `useView` reads one atomic actor snapshot through `useSyncExternalStore` and applies
one internal structural-sharing policy.

React 18 and 19 proofs must cover readiness, acquisition failure, subscribe/unsubscribe races,
Strict Mode, SSR server snapshots, selector failure, actor replacement attempts, and mount or
unmount independence from resource leases, stale time, refresh, and GC. Server and CLI hosts
must use root lookup without creating a duplicate dynamic actor.

## PROOF-013: TurnRecord and inspection sink retention

Prove one immutable TurnRecord is derived from each committed actor turn after publication and
drives receipt, inspection, and trace projections. No independently mutable trace or inspection
history may disagree with it.

`createInspectionBufferSink()` retains 256 records by default, validates explicit capacities,
supports zero, drops the oldest records deterministically, and exposes
`truncatedBeforeSequence` after loss. Captured sink snapshots remain stable. Actors and runtimes
without a buffer sink retain no inspection history. Runtime boot excludes sink history, while
explicit v2 trace artifacts round-trip records and truncation markers.

## PROOF-014: Boot, artifacts, server, and CLI

Prove v2 boot decoding finishes before root activity starts; incompatible artifact version,
app ID, persistence version, descriptor ID, token ID, and canonical ref fail with structured
typed diagnostics. Domain memory and payload validation remains application-owned.

Server requests use isolated request-scoped runtimes, preload through root-machine events, and
dispose after render or failure. CLI discovery finds registered stories through behavior,
executes the same story runner, renders checkpoints and execution errors, and never fabricates
arbitrary payload-bearing events.

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
transaction conflicts, streams, pressure, children, scoped leases, inspection, diagnostics,
CLI, and browser lifetime. Hydrated Offline Notes proves request isolation, root-machine
preload, v2 boot, first-render consistency, persisted outbox, reconnect drain, and disposal.

Bounded-feed behavior remains a package contract fixture. React 18/19 and isolated TypeScript
modes remain packed/type proof packages, not showcase applications.

## PROOF-017: Deletion and package hygiene

Prove removed exports cannot be imported from source or packed declarations, deleted files and
example packages are absent, package export maps contain only supported entries, root scripts
delegate to live packages, and no legacy executor, mutable harness, controlled stream,
production fixture registry, actor shell, direct resource hook, mutable hydration API,
parallel trace history, or source-text architecture assertion survives.

Deletion proof must combine exact filesystem or export inspection with package typecheck,
packed consumers, package tests, example tests, browser tests, and the broad workspace gate.

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
`reference/incident-console/IMPLEMENTATION_BLOCKERS.md:765-800`.
