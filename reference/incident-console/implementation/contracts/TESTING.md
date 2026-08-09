# Testing and deterministic story execution contract

Status: normative

This contract defines the one supported testing framework for Flow State. It replaces the
current `test(...)`, `flowTest(...)`, `runFlowScenario(...)`, static story-object, mutable
harness, and model-replay families with one immutable story plan and one scoped runner.
Vitest or another host runner owns test cases, assertions, retries, and pass or fail. Flow
owns deterministic execution and immutable evidence only.

The contract depends on the compiled application graph, exact resource and transaction refs,
the Queue-based actor engine, atomic actor publication, and idempotent ManagedRuntime disposal.
It must not introduce a testing-only actor engine, resource store, transaction interpreter,
clock, scheduler, or lifetime model.

## TEST-001: One public declarative execution framework

```ts
import {
  FlowStoryExecutionError,
  behavior,
  control,
  fixture,
  model,
  story,
} from "flow-state/testing";
```

`story({ app, machine, title?, description?, tags? })` is the only public declarative
execution builder. It binds the app and target machine immediately and produces an immutable,
lazy plan. Private test stories, registered behavior stories, fresh or boot starts, and
model-generated paths all compile to this plan and execute through its `.run(...)` method.

The public testing surface exports the runtime values `story`, `fixture`, `control`, `model`,
`behavior`, and `FlowStoryExecutionError`. `checkpoint` is a story builder method, not a
separate export. The route does not export `test`, `flowTest`, `runFlowScenario`,
`runFlowScenarioWithDiagnostics`, `scenarioToReport`, a public runtime-backed harness, or a
second diagnostic runner.

## TEST-002: Story plans are inert, immutable, and linear

Authoring a story or appending a builder command must not acquire a Layer, create a runtime or
actor, allocate a Scope, instantiate a fixture, subscribe to a stream, or execute an Effect.
Every builder call returns a new frozen plan and preserves the previous plan unchanged.

A plan is one linear command sequence. It contains no runtime branches, loops, predicates,
promises, callbacks, or arbitrary Effects. Ordinary TypeScript may generate several plans
before execution; machine transitions own conditional application behavior.

The supported commands are:

- `send(event)` for typed machine input;
- `perform(controlCommand)` for a typed controlled external outcome;
- `flush()` for ready work at the current time;
- `settle()` for finite current-time work;
- `advance(duration)`, `setTime(instant)`, and `advanceToNextTimer()` for explicit TestClock
  movement;
- `checkpoint(name)` for immediate immutable capture.

## TEST-003: Story starts are one exclusive union

The `story({ app, machine, start? })` start configuration is exactly one of `fresh` or `boot`.
Omitting it means a fresh start only when the machine input is `void`.
A fresh start MUST require exact input for a non-void machine and MAY provide a partial memory
override. The runner MUST invoke the same definition memory factory once when present, otherwise
start from the canonical empty readonly memory record, then shallowly apply that override before
the first snapshot or activity starts. Boot starts hydrate one complete runtime boot payload and select an actor from it, with
an actor ID required whenever compatible selection would otherwise be ambiguous.

Boot starts MUST NOT invoke the definition memory factory. Fresh input or memory and a boot
payload cannot be combined. A public `ActorSnapshot` is observation only and MUST NOT be accepted
as restoration input because it omits StoreState, binding cursors, and pending outcomes. Invalid app, machine, start, or actor
selection fails during prepare with a structured story execution error; it is never a returned
`blocked` status.

A fresh story sets TestClock to epoch zero. A boot story first sets TestClock to the envelope's
`capturedAt`, then performs hydration/freshness normalization, so production timestamps do not
appear to be in the future; later time changes remain explicit commands. A production runtime
instead compares the same absolute timestamps with its current Effect Clock.

## TEST-004: A fixture is the only reusable story environment

`fixture({ id, seeds?, controls?, layer? })` defines one immutable reusable setup.
A story installs direct fixture definition references through `.with({ fixtures: [...] })`.
There is no fixture name lookup, production app fixture registry, module fixture metadata, raw
Layer story input, or raw resource-seed story input.

Each run instantiates every unique fixture definition once. Its resource seeds, controlled
endpoint instances, and application Layer belong to that same run. A Layer factory receives
the run-local control adapter and returns an ordinary application Layer. Flow does not inspect
duplicate Effect service tags or define Layer override precedence; an application that needs
an override composes it explicitly inside one fixture.

Fixtures cannot provide or replace `Clock` or `TestClock`. The fixture Layer output type MUST
exclude both services, and the runner MUST install its private TestClock after the application
Layer at a non-overridable composition boundary. Runtime identity proof MUST catch a widened or
disguised fixture Layer; the runner owns the only Clock for the run.

## TEST-005: Fixture and control identity is deterministic

Fixture definitions are deduplicated by definition identity in first-seen order. Repeating the
same definition is valid; two distinct fixture definitions with the same fixture ID fail pure
story compilation.

Controlled endpoint definitions are collected transitively from the deduplicated fixtures and
deduplicated by definition identity. Distinct endpoint definitions cannot share an ID, even
when their endpoint kinds differ. Effect and stream endpoints share one flat endpoint-ID
namespace for a run; adding a future endpoint kind would have to join that same namespace by
an explicit contract change. Fixture IDs and endpoint IDs occupy separate namespaces.

Two seeds for the same exact resolved resource ref fail compilation even when their values are
equal. Identity validation finishes before fixture instantiation or Layer acquisition. A
fixture ID is diagnostic identity, not a story-authored lookup key.

## TEST-006: Controls deliver outcomes through real dependency boundaries

`control.effect(...)` and `control.stream(...)` create immutable endpoint
definitions. They do not generate an application service or own a mocking DSL. A fixture uses
its run-local adapter to implement an application service with the same endpoint definition
later used to author control commands.

An Effect endpoint assigns a zero-based ordinal when an invocation starts. A stream endpoint
assigns a zero-based ordinal when a subscription starts. Ordinals are local to one endpoint
instance and reset for each run. `call(index)` and `subscription(index)` are inert refs that
may be authored before execution.

Finite call refs expose `succeed`, typed `fail`, `die`, and `interrupt` where those channels
exist. Stream subscription refs expose `emit`, `complete`, typed `fail`, `die`, and
`interrupt`. `perform(...)` accepts only a branded inert command. It fails immediately when
the exact ordinal has not started, has terminated, or never existed; it never waits for a
future target.

A control command completes the awaited application dependency. It cannot assign a resource
or transaction snapshot, status, receipt, issue, or generation directly. Normal production
logic owns publication, preview commit or rollback, invalidation, routing, and inspection.
After successfully completing that exact dependency, `perform` runs the same current-time `flush`
as TEST-012 before its command boundary completes. It never advances time, waits for another
external control, or settles continuing work, so `.perform(...).checkpoint(...)` deterministically
captures every resulting currently-ready primitive and actor turn.

## TEST-007: Public send stays synchronous; stories use package-private acknowledgment

The public actor command API remains `actor.send(event): void`. It synchronously admits a
typed event or reports synchronous admission failure, does not subscribe the caller, and does
not return a Promise, Effect, actor, snapshot, or acknowledgment handle.

The actor engine also exposes a package-private acknowledged dispatch used by the story runner
and package-owned lifecycle tests. Its mailbox command carries an Effect `Deferred`. The
mailbox consumer stabilizes redirects, completes immediate reconciliation, publishes exactly
one immutable actor snapshot for that command, and then completes the Deferred with the
published turn identity. Later resource, transaction, stream, timer, and child completions
materialize durable pending outcomes and enter the mailbox as later commands; they are not awaited
by the original send. `flush()` MUST drain restored pending-outcome commands through the ordinary
actor engine and MUST NOT use a replay-only path.

Activity ownership created by that turn is staged until a package-private post-commit
reconciliation fact. The actor queues that fact before acknowledgment, but the story author
MUST place a `flush` between any `send` and the next `perform`. Pure plan preparation rejects a
`perform` reached after a send with no intervening flush, regardless of whether production
scheduling happened to start the target; this avoids making story semantics depend on Effect
Deferred waiter handoff. `.send(event).flush().perform(command)` is the deterministic form, and
`perform` still never waits for a future target.

Actor disposal stops admission and fails every buffered acknowledgment before Queue shutdown.
No package-private acknowledgment capability is exported from `flow-state`,
`flow-state/react`, or `flow-state/testing`.

## TEST-008: A checkpoint captures without progress

`checkpoint(name)` records an immediate command boundary. It does not send, flush, settle,
advance time, resolve a control, or wait for operation completion. Duplicate checkpoint names
fail while the immutable plan is built. Literal names accumulate into the result type.

Each checkpoint captures exactly three frozen roots:

- the complete public actor snapshot;
- the exact pending-work inventory;
- the current TestClock time.

The inferred observation value MUST expose those roots under the stable property names
`snapshot`, `pendingWork`, and `now`. `TEST-011` forbids exporting a parallel named observation
type; it does not make these public result keys implementation-defined.

Resource, transaction, timer, stream, child, issue, and authored-view readers are pure
projections over those roots. Actor snapshots and checkpoints do not contain receipt, trace, or
inspection histories; those are TurnRecord projections retained only by an explicitly installed
sink. Readers never consult a live actor or copy an independently mutable registry into the
checkpoint. A completed command sequence captures `final` through the same mechanism before
disposal; `final` is not a user checkpoint name.

## TEST-009: One runner owns the whole run

`story.run({ signal? })` is the only operation that creates runtime state. One outer Effect
owns fixture instances, their Layer, the fresh Flow runtime, the selected actor, controlled
endpoint state, TestClock, command interpretation, capture, and final disposal. Internally the
runner uses scoped acquire/use/release and complete `Exit` and `Cause`; the returned Promise is
only the host adapter.

The runner disposes the runtime after normal completion, product failure, contained defect,
contained primitive interruption, prepare failure after acquisition, command failure,
progress exhaustion, host cancellation, and internal failure. A successful return means
runtime disposal and all finalizers completed. The returned value never exposes a live
runtime, actor, registry, controller, or mutable harness.

## TEST-010: Cancellation is execution failure with truthful cleanup

An AbortSignal interrupts the command interpreter and prevents later commands. If an actor
exists, the runner captures `atFailure` before disposal using the same three-root capture as a
checkpoint. Cleanup is non-abortable from Flow's perspective: the runner waits for runtime
disposal before rejecting.

Cancellation rejects with `FlowStoryExecutionError`; it is not a returned status and is not
hidden as an Effect interruption visible only to an internal caller. Completed checkpoints,
`atFailure`, the original interruption Cause, and cleanup status remain attached. When command
execution and disposal both fail, the error preserves both causes and reports cleanup failure.

Host process termination may prevent any result, but Flow must not report successful cleanup
while finalizers are still running.

## TEST-011: Product outcomes return evidence; execution failures throw

A completed authored command sequence returns a frozen value with `kind: "story-run"`, named
`checkpoints`, and `final`. Typed resource or transaction failure, a contained defect, or a
primitive interruption remains product evidence in snapshots and issues. The result has no
`success`, `domain-failure`, `defect`, `interruption`, `blocked`, or `internal-error` status.

`FlowStoryExecutionError` is reserved for a plan that cannot execute as authored. Its exact
readonly class shape is fixed by API-013A: `_tag`, phase, primary Cause, optional command, completed
checkpoints, one discriminated evidence member, and cleanup settlement. The evidence union makes
`atFailure` and `final` structurally mutually exclusive rather than optional sibling properties.

`FlowStoryExecutionError` is the only named testing runtime class. Story plans, completed run
values, observations, checkpoint maps, pending-work inventories, model paths, traversal
diagnostics, and cleanup details remain structurally inferred from the public values that
produce them; `flow-state/testing` does not export named `StoryRun`, result, path, command,
evidence, or general diagnostic aliases.

## TEST-012: One TestClock drives production code

Every run installs one fresh Effect `TestClock` in the same ManagedRuntime as the machine,
resources, transactions, activities, timers, retries, freshness, and collection. The clock
starts at Effect's epoch zero for fresh stories and boot `capturedAt` for boot stories. `advance` delegates to `TestClock.adjust`, `setTime` delegates
to `TestClock.setTime`, and next-timer advancement adjusts that clock to the next recorded
deadline. No deterministic story uses wall-clock sleep.

`advance`, `setTime`, and progress configuration accept only non-negative safe-integer
milliseconds. `advance` rejects a negative duration; `setTime` rejects a value earlier than the
current TestClock and permits an equal value. `advanceToNextTimer()` throws a command-phase
`FlowStoryExecutionError` containing current pending work when no recorded Flow-owned deadline
exists. Flow-owned timer, freshness, GC, and retry owners register those deadlines explicitly;
pinned beta.86 does not expose arbitrary TestClock sleeps, so application-authored `Effect.sleep`
is unknown finite work and is never guessed into next-timer advancement. Equal
earliest deadlines advance once and production ordering decides their turns. `maxTurns` MUST be a
positive safe integer validated during pure plan preparation before fixture or runtime acquisition.
After moving TestClock, each of the three time commands performs the same current-time `flush`
before its command boundary completes; none settles arbitrary finite external work or advances a
second deadline implicitly.

One progress sweep drains every currently ready root/child mailbox command, yields once through the
Effect scheduler, yields one JavaScript microtask, and then resnapshots pending work. `flush`
repeats that sweep until no ready mailbox or same-time TestClock deadline remains. It does not wait
for external completion or move time.

`settle` repeats the same sweep while ready mailboxes or finite resource/transaction work can make
current-time progress. It returns when those categories are empty or every remaining finite fiber
is parked only on a recorded future TestClock deadline. Open observations, streams, active child
actors, future timers, and future-clock-blocked finite work remain visible in pending work but do
not prevent settlement. Controlled Deferreds, application sleeps, external asynchronous work, and finite fibers whose
blocking reason is unknown are not future-clock-blocked; if they remain unchanged, `settle`
continues until `maxTurns` and fails with the exact pending inventory rather than reporting a false
settlement.

No progress command silently performs a future-time jump. A story has one progress policy,
`maxTurns`, defaulting to 100. The bound resets per looping command. Exhaustion throws a
command-phase execution error with the command, bound, partial evidence, and exact pending
work. Concurrency width is not a progress bound.

## TEST-013: Pending work reports lifetimes, not an aggregate fiber count

Pending work separately reports ready mailboxes, finite lookup refs and generations,
transaction refs and generations, controlled calls or subscriptions, observations, streams,
children, timers and deadlines, and current time where relevant. It does not expose
`activeFibers`, `maxFibers`, or a testing-only scheduler counter.

A durable pending outcome counts as ready mailbox work until its command commits and clears the
record. Pending work exposes the ready actor identity, not the internal event payload or
`PendingOutcome` implementation type. Ordinary binding release does not remove it. Actor or
runtime disposal may clear it as cleanup, after which it is no longer ready or routable.

Settlement depends only on the finite current-time categories in TEST-012. Continuing work is
diagnostic evidence, not a reason to hang or force a timer advance.

## TEST-014: Model discovery is structurally pure

`model(baseStory, { stateKey })` accepts only a command-empty fresh-start story: app, machine,
fresh input/memory override, metadata,
fixtures, and progress policy may already be bound, but no `send`, `perform`, progress, or
checkpoint command may have been appended. Boot starts are rejected because their restored
pending outcomes and activation barrier require the real mailbox; boot parity remains an ordinary
live story concern. The required pure `stateKey(predictedSnapshot)` returns a
`CanonicalKeyInput` containing every state/memory/seed fact that affects future guards and
redirects. Flow validates/encodes it with WIRE-001 and never falls back to object identity or state
token alone. It explores that story's machine using only pure
transition, guard, redirect, and memory logic. The pure model implementation cannot import
`effect`, call
`Effect.run*`, acquire a service, run a resource lookup or transaction commit, subscribe to a
stream, synthesize a success route, instantiate a fixture Layer, or mutate control state.

Each programmatic `getShortestPaths` or `getSimplePaths` call solely owns its concrete typed
candidate-event array. Fixture definitions may contribute inert exact-ref seed facts when the
pure fixture compiler can read them without instantiation; fixture Layers, controls, declared
outcomes, registered stories, and CLI inputs never contribute or infer candidates.

Traversal options are exactly `{ events, maxDepth?, limit? }`; `maxDepth` defaults to 20 and is a
non-negative safe integer, while `limit` defaults to 100 and is a positive safe integer. Event
cost is always one. `getShortestPaths` performs breadth-first search in candidate-array order and
retains the first path to each unseen state key, including the zero-step initial path.
`getSimplePaths` performs depth-first search in candidate-array order and never repeats a state key
within one path. Both stop before expanding beyond `maxDepth` or returning more than `limit`, and
return a frozen `{ paths, truncated, explored }` result; `truncated` is true when either bound hid
an otherwise reachable candidate. State-key defects or noncanonical results throw synchronously
before returning a partial collection. Filters, source/target selectors, weights, duplicate
policies, custom event serializers, and hidden candidate registries are not vNext options.

## TEST-015: A model path becomes an ordinary live story

Every path retains its predicted final pure machine projection, per-step event/projection data, issues,
weight, description, and traversal metadata. `path.story` is the base story extended with the
path's events in order. `path.story.run()` is the live Effect-backed proof;
`path.story.flush().run()` records an explicit ready-work boundary.

Live parity applies the model's same `stateKey` callback to the returned story's final actor
snapshot and compares that key with the predicted final key. Per-step parity runs the corresponding
model-generated prefix stories and compares each prefix key. Primitive snapshots remain ordinary
live-story evidence and are deliberately not predicted, because doing so would execute a forbidden
second resource/transaction/stream interpreter. Paths that depend on asynchronous outcomes include
their already-authored domain events as candidate events; the model never synthesizes them or
invents checkpoint names/a second evidence shape.

There are no model-owned `replay` or `replayFlushed` methods and no replay-only Layer or clock
options. Live model proof returns the same run value, execution error, checkpoints, and cleanup
guarantees as any authored story.

## TEST-016: Inspection retention belongs to an explicit sink

The actor engine publishes one immutable `TurnRecord` after each atomic actor snapshot. Core
runtime, actor snapshots, and story results do not own a second mutable inspection or trace
history. Receipts, inspection events, and trace projections derive from the same TurnRecord.

Retained inspection history belongs to `createInspectionBufferSink({ capacity? })`. Its
default capacity is 256 records. Capacity is a validated non-negative integer; zero retains no
records while the sink may still observe live turns. When records are dropped, every sink
snapshot includes an explicit `truncatedBeforeSequence` marker identifying the greatest
sequence no longer retained. Captured sink snapshots are immutable and do not change after
later pruning.

Hosts that need history explicitly install the sink. The story runner and CLI may install one
run-local sink when their requested evidence needs turn history. Boot payloads never persist
the buffer; durable history exists only in an explicitly encoded trace artifact. There is no
actor-owned `setRetention`, global mutable inspection log, or separate mutable TraceLog.

## TEST-017: App roots and reachable machines have distinct authority

Module-declared machines and their public views are app roots. Resources, transactions,
streams, services, and child machines are inferred transitively. `runtime.actor(machine)`
accepts only a compiled module root. `runtime.createActor(machine, ...)` accepts any machine
reachable in the compiled app graph, including a child definition, and rejects an unreachable
definition.

Reachable dynamic machines are not auto-created, root-addressable, or independent behavior
roots. Stories bind only machines accepted by this compiled authority model.

## TEST-018: Host runners own assertions

Flow checkpoints and run results contain evidence, not expectations. The story builder has no
`expect`, matcher callback, expected-state field, expected-facts field, retry policy, or
portable assertion language. Vitest and other host runners call ordinary matchers after
`story.run()` returns or inspect `FlowStoryExecutionError` after rejection.
