# Phase 3 — Transitions and actor-owned asynchronous work

[Back to the plan tracker](../TASK.md) · [Previous: Phase 2](./PHASE_2.md) · [Next: Phase 4](./PHASE_4.md)

Status: blocked by Phase 2 closure.

Effect construction is governed by the
[binding Effect architecture blueprint](./PHASE_0.md#binding-effect-architecture-blueprint)
and the approved P0.6 `EFFECT_ARCHITECTURE.md` receipt. Machine, Stream, timer,
and child packets must use the selected Scope/fiber/Queue/Stream/Clock/Schedule
owners and may not create adapter/test substitutes.

## Phase 3A — Machine transitions and callback correctness

### `P3A.1` Canonical transition semantic and async-binding differential closure

- [ ] Preserve existing machine object/generic forms and literal state/event types.
- [ ] Prove rejected events cannot update state or start work.
- [ ] Add differential tests proving `flow.can(snapshot, event)` agrees with actual dispatch.
- [ ] Prove target/update/entry/exit/re-entry/terminal behavior and stable binding generations.
- [ ] Verify P1C.5's canonical transition owner remains the only planner/
      application implementation after all async-binding families are present;
      remove any residual test-only evaluator rather than replacing the owner.
- [ ] Close BUG-32: a thrown guard is a defect with zero transition-owned work,
      never a false guard or ordinary rejection.
- [ ] Close BUG-40 using DEC-12: guards are pure over snapshot/event facts and
      cannot make wall-clock decisions that differ between `flow.can` and dispatch.

Files: `core/machines/**`, canonical orchestrator dispatch, `flow.can` owner,
machine snapshot/receipt types, and machine/runtime differential tests.

Tests: unmatched event; false guard; ordered multiple guards; target-only;
update-only; target plus update/actions; exit/entry/re-entry; terminal state;
rejected event starts no submit/invoke/timer/child; `flow.can` agrees before and
after restore; thrown guard is a distinct defect; synthetic/runtime clock cannot
change acceptance; listener-triggered reentrant send queues after the current
microstep; binding generation stays stable unless ownership actually restarts.

Reference reading — ideas/tests only: inspect
`docs/codebases/xstate/packages/core/src/Mailbox.ts` and
`docs/codebases/xstate/packages/core/test/transition.test.ts` for
append-while-processing FIFO, non-reentrant delivery, and deterministic
transition/action ordering cases. Do not copy the assumption that mailbox
processing cannot throw: Flow State must classify guard/action defects, preserve
mailbox coherence, and keep the semantic commit/publication boundary explicit.

Commands: `F(packages/flow-state/src/machine.test.ts
packages/flow-state/src/machine-callbacks.test.ts
packages/flow-state/src/runtime-invokes.test.ts
packages/flow-state/src/flow-transition-inspection.test.ts)`, `T`, `P`, `E`, `C`.

### `P3A.2` Exact machine callback-family typing

- [ ] Give initialization, guard, update, target, params, and route callbacks only
      their exact documented inputs.
- [ ] Remove universal/bivariant callback bags family-by-family with focused proof.
- [ ] Keep explicit annotations where recursive contextual inference genuinely needs them.

Files: `core/api/machine-core-types.ts`, machine callback/config helpers, directly
affected transaction/stream/child owner inputs, callback tests, public/packed
type fixtures. Do not combine this packet with runtime transition edits.

Tests: exact Context/Event/State per callback; a handler for a narrower event is
rejected where it may receive the union; impossible event/state target rejects;
updater result is `Partial<Context>` without permitting unknown keys; recursive
machine annotation exception remains local and nameable; explicit generic form
and object inference remain compatible.

Commands: `F(packages/flow-state/src/machine-callbacks.test.ts
packages/flow-state/src/public-api-types.test.ts
packages/flow-state/src/public-typing-architecture.test.ts)`, `T`, `P`, `E`, `V`, `C`.

### Phase 3A closure

- [ ] Callback variance and invalid state/event fixtures pass.
- [ ] `flow.can` and dispatch agree across guards and states.
- [ ] Machine core has no test-only transition evaluator.
- [ ] BUG-18M/32/40 are closed without widening callbacks or swallowing defects.

---

## Phase 3B — Stream ownership, pressure, and interruption

### `P3B.1` Production stream ownership and generation lifecycle

- [ ] Prove value, typed failure, defect, end, interruption, unsubscribe, and finalization.
- [ ] Prove producer interruption and consumer/actor disposal terminate ownership once.
- [ ] Prove restart, detach/reattach, keep-alive, and stale-generation emission rejection.
- [ ] Keep Effect Stream primary; controlled AsyncIterable bridges remain test compatibility only.
- [ ] Close BUG-41S with discriminated stream active/terminal states; value,
      failure, defect, end, interruption, and stale generations cannot form
      contradictory snapshots.
- [ ] Close BUG-50S: install generation and publish running state before
      subscribing/running a Stream that may emit, fail, or end synchronously.

Files: `core/orchestrator/orchestrator-stream-ownership.ts`, stream/timer
coordinator and inspection facts, `core/streams/**`, snapshot/receipt/issue types,
testing controlled bridge after P1D.2, and runtime stream tests.

Tests: Stream value/failure/defect/end; actor/state exit interruption; explicit
stop/runtime dispose; unsubscribe/finalizer exactly once; restart generation;
late value/end/failure from old generation ignored; route detach/reattach does
not duplicate producer ownership; keep-alive actor semantics; immediately
emitting/ending/failing Stream preserves one valid running-to-terminal sequence.

Commands: `F(packages/flow-state/src/runtime-streams.test.ts
packages/flow-state/src/stream-route.test.ts
examples/launch-workspace/src/runtime-stream-generations.test.ts)`, `T`, `P`, `E`, `C`.

### `P3B.2` Bounded deterministic pressure policies

- [ ] Test every advertised pressure policy with bounded deterministic producers:
      queue limit, coalescing/latest behavior, dropping, and backpressure as applicable.

Before implementation, inventory the actual exported policy union. Do not add a
policy because it appears in old docs. For each advertised policy define buffer
capacity, ordering, overflow fact/counter, producer blocking/interruption, and
drain behavior. Tests use bounded producers and deterministic controls—no sleeps,
unbounded loops, or timing assumptions.

Apply the capacity defaults fixed by P0.6. A missing limit cannot mean unlimited;
coalesce-latest has a total distinct-key bound as well as a per-key latest value.
Every overflow is either backpressure or an explicit typed drop/rejection fact—
never silent. Close BUG-36 without inventing a new public pressure policy.

Files: stream pressure config/runtime owner, controlled stream fixture only as a
producer control, pending-work facts, snapshots/receipts, and stream tests.

Tests: capacity boundary and one-overflow case per policy; FIFO where promised;
latest/coalesce exact retained value; drop-new/drop-old fact if advertised;
distinct-key coalesce cardinality; backpressured producer resumes and interrupts;
stream termination races state exit; scheduled coalesced value races generation
replacement; settle remains non-idle while a blocked producer or queued value exists.

Commands: `F(packages/flow-state/src/runtime-streams.test.ts
packages/flow-state/src/flow-test-streams.test.ts
packages/flow-state/src/flow-test-settle.test.ts)`, `T`, `P`, `C`.

### `P3B.3` Input-first stream and requirement typing

- [ ] Make stream Params contextualize subscribe/routes before inferring value/failure/requirements.
- [ ] Preserve acquisition requirements separately from Stream requirements. `[SMART]`
- [ ] Remove stream-family bivariant callback unsoundness only after a failing regression exists.

Files: `core/api/machine-view-stream-types.ts`, stream callback helpers, runtime
consumer seams, public/packed type fixtures.

Tests: explicit/inferred Params; wrong narrower callback; exact value/error;
subscribe acquisition Effect requirements versus returned Stream requirements;
possible/impossible value and typed-failure routes; exact event type; no untyped
intermediate invoke descriptor reaches consumers.

Commands: `F(packages/flow-state/src/stream-callbacks.test.ts
packages/flow-state/src/public-api-types.test.ts
packages/flow-state/src/public-typing-architecture.test.ts)`, `T`, `P`, `E`, `V`, `C`.

### Phase 3B closure

- [ ] Pressure and cleanup matrix passes without real sleeps or unbounded drains.
- [ ] No parallel test stream engine remains.
- [ ] BUG-18S is closed and exact acquisition/Stream requirements survive packing.
- [ ] BUG-36 is closed with bounded, explicit overflow behavior for every policy.
- [ ] BUG-41S is closed with impossible contradictory stream states eliminated.
- [ ] BUG-50S is closed; synchronously emitting/ending/failing Streams publish a
      valid running-to-terminal sequence under one generation.

---

## Phase 3C — Timer correctness

### `P3C.1` One-shot timer lifecycle, restore, and typing

- [ ] Preserve `flow.after` string durations and current call shape.
- [ ] Prove TestClock start, cancel, re-entry, actor stop, runtime disposal, and exactly-once fire.
- [ ] Prove restore resumes valid remaining delay and rejects stale generation firing.
- [ ] Prove timer target/event typing against the owning machine.
- [ ] Keep recurring/general schedules deferred.

Files: `core/orchestrator/orchestrator-after-timer-ownership.ts`, delayed-work
owner, timer snapshots/receipts, duration parsing, test controls after P1D.2,
timer public types, and timer/runtime/rehydration tests.

Semantics: one timer generation belongs to one actor state/binding; state exit,
re-entry, actor stop, or runtime dispose interrupts it; restore validates owner,
generation, target, and remaining nonnegative delay before scheduling; a stale
callback can finalize itself but cannot route or publish.

In-memory scheduling uses Effect Clock. A portable encoded timer stores remaining
duration at the serialization boundary and resumes from the destination Clock.
Current v1 absolute `dueAt` remains accepted as a legacy same-clock behavior but
is not cross-host safe; do not add unversioned fields to v1. If portable timer
facts require v2, P3C proves the internal remaining-duration model and P4C owns
the separately approved wire version. This closes BUG-37 without falsifying v1.

Tests: string duration parse and invalid duration; TestClock just-before/at
deadline; state exit cancellation; re-entry creates one new generation; repeated
flush does not double-fire; stop/dispose finalizer once; restore remaining delay;
source/destination clock-skew case through the approved portable format; callback
queued immediately before stop/restore; old callback after restore/replacement
ignored; invalid target/event fails in source and packed types.

Reference reading — ideas/tests only: inspect
`docs/codebases/xstate/packages/core/src/SimulatedClock.ts`,
`docs/codebases/xstate/packages/core/src/system.ts`, and
`docs/codebases/xstate/packages/core/test/clock.test.ts` for same-deadline
ordering and callbacks that schedule or cancel timers while a virtual-time flush
is running. Do not add a second Flow State clock, use `Date.now`, persist an
absolute portable deadline, or copy XState's scheduler identity; express every
case through Effect TestClock and the actor/timer generation owner above.

Commands: `F(packages/flow-state/src/flow-test-timers.test.ts
packages/flow-state/src/runtime-invokes.test.ts
packages/flow-state/src/runtime-rehydration.test.ts
packages/flow-state/src/public-api-types.test.ts)`, `T`, `P`, `E`, `C`.

### Phase 3C closure

- [ ] Timer lifecycle/restore matrix passes under virtual time.
- [ ] No real-time or test-only timer semantics remain.
- [ ] No recurring/general schedule API or completion claim was added.
- [ ] BUG-37 is closed or the portable wire portion is explicitly blocked on an
      approved v2 while no cross-host v1 claim remains.

---

## Phase 3D — Child supervision and restore

### `P3D.1` Current child contract and exact expressible typing

- [ ] Preserve the current `flow.child({ id, machine, supervision? })` call shape
      and exact child machine/context/event/state/supervision types.
- [ ] Keep child input/output/failure/routes deferred according to P0.4 unless a
      separate additive contract is explicitly approved.
- [ ] Allow a focused child callback annotation where TypeScript cannot infer soundly;
      do not widen to `unknown` or add a new API. `[SMART review]`

Files: `core/api/machine-invoke-types.ts`, child definition helper, directly
affected machine invoke types, public/packed type fixtures, and child type tests.

Tests: exact child machine retained through definition/invoke/snapshot helpers;
wrong machine/parent ownership and invalid supervision reject; existing generic
and inferred calls remain valid; no phantom input/output/failure types are
claimed; selected keyed child invoke array shape remains stable.

Commands: `F(packages/flow-state/src/public-api-types.test.ts
packages/flow-state/src/flow-test-child-helpers.test.ts)`, `T`, `P`, `E`, `C`.

### `P3D.2` Child supervision, generation, restore, and finalization

- [ ] Prove parent start/stop/exit, child success/failure/defect/interruption, and finalization.
- [ ] Prove existing supervision policies, manual failed-child retry, replacement,
      and currently expressible failure propagation only.
- [ ] Prove restore generation, stale completion rejection, actor identity, and parent ownership.
- [ ] Prove a child finalizer runs once across stop/restart/restore/disposal.

Files: `core/orchestrator/orchestrator-children.ts`, child lifecycle/inspection
facts, actor registry/lifecycle integration, child snapshots/issues/receipts,
restore serialization, and child/runtime/rehydration tests. Testing helpers must
control/observe this production owner after P1D.2.

Semantics: child identity includes parent actor, binding, child descriptor/key,
and generation; only the active generation can publish; manual retry targets
failed children only; parent stop awaits child finalizers; restore preserves
generation so pre-restore completions remain stale. No automatic restart budget,
backoff, or new supervision policy is active in this plan.

Tests: parent state exit/stop/runtime dispose; child normal terminal behavior if
currently expressible, typed issue/failure, defect and interruption; both
supervision policies; retry failed only; replacement; currently expressible
failure behavior; restore
then late old completion; child terminal notification racing parent stop/retry;
duplicate actor ID; finalizer once across every path.

Reference reading — ideas/tests only: inspect
`docs/codebases/xstate/packages/core/test/rehydration.test.ts`,
`docs/codebases/xstate/packages/core/test/invoke.test.ts`, and the
persisted-snapshot section of
`docs/codebases/xstate/packages/core/src/createActor.ts` for no entry-action
replay, active-versus-done child registration, no repeated terminal
notification, deep child-tree restore, and stopping a restored child. Translate
those cases to Flow State's current child contract and generation facts; do not
adopt XState's snapshot shape, private internals, or unapproved child
input/output/restart features.

Commands: `F(packages/flow-state/src/flow-test-child-helpers.test.ts
packages/flow-state/src/runtime-invokes.test.ts
packages/flow-state/src/runtime-rehydration.test.ts
examples/launch-workspace/src/launchWorkspace.test.ts)`, `T`, `P`, `E`, `V`, `C`.

### Phase 3D closure

- [ ] Child supervision/restore/stale-generation matrix passes.
- [ ] No static/test-only child definition or lifecycle engine disagrees with production.
- [ ] Serialized and live snapshots preserve the same generation facts.
- [ ] The phase claims only types/lanes expressible by the reconciled P0.4 contract.

---
