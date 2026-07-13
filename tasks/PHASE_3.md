# Phase 3 — Transitions and actor-owned asynchronous work

[Back to the roadmap](../TASK.md)

Goal 3 uses the canonical owners from Phases 1 and 2. It owns transition,
stream, timer, and child semantics only. Phase 4 adapters remain out of scope.
Phase 3 also preserves the current store boundary: TanStack Store may remain a
private backing primitive for selection/publication batching, but the semantic
contract stays Flow-owned through `SelectionSource`, `ResourceStore`, and actor
owners rather than new TanStack-specific API or lifecycle coupling.
React/store adapter integration continues in Phase 4 on top of that boundary
rather than pulling Phase 3 async ownership work into adapter redesign.

You can reference the effect-v4 codebase to learn how to use a Effect feature: `/Users/arpit/Developer/flow-state/docs/codebases/effect-v4`.

## P3A — Machine transitions

### [ ] P3A.1 Transition/model differential

- Production dispatch owns guard, exit, update, target, entry, state
  publication, and activation of transaction/stream/timer/child bindings.
- `flow.can` evaluates the same acceptance rule without mutation or owned work.
  Guard false is rejection; guard throw is a distinct defect.
- An independent transition model covers accepted/rejected events, re-entry,
  nested dispatch, synchronous family completion, stop/replacement, and stale work.
- Runtime and Flow Test produce equivalent observable snapshots, facts, issues,
  pending work, and Cause.
- [x] One bounded accepted-transition parity proof now covers exit/update/entry
      action order across `flowTest` and runtime actors with identical snapshots,
      receipts, and issues after one synchronous event.
- [x] One bounded clock-sensitive guard rejection parity proof now covers a
      live `TestClock` runtime actor and a clocked `flowTest` harness rejecting
      the same guarded event with identical snapshots, receipts, and issues.
- [x] One bounded explicit self-reentry parity proof now covers a runtime actor
      and `flowTest` reentering the same state with identical snapshots,
      receipts, exit/entry action order, and empty issues.

### [ ] P3A.2 Callback-family typing

- Guards, updates, entry/exit, routes, bindings, targets, and helpers receive
  exact Context/Event/State/Input and owner families.
- Unsafe narrower callbacks fail locally; no bivariant/universal callback bag or
  restated generic family is introduced.

## P3B — Streams

### [ ] P3B.1 Production ownership and generation lifecycle

- The actor-owned scoped Stream runner is the only semantic stream engine.
  Testing controls foreign input but delegates execution and state.
- Install generation/running state before synchronous value/end/failure can
  publish. Only the active binding generation publishes values, routes, facts,
  pending state, or terminal status.
- State exit, restart, actor stop, runtime shutdown, and replacement interrupt
  and finalize exactly once; stale emissions and terminal events are ignored.
- Value, typed failure, defect, end, interruption, and stale remain distinct.

### [ ] P3B.2 Bounded pressure

- Every exported pressure policy has explicit bounded capacity, FIFO/coalescing/
  drop/backpressure semantics, typed overflow where applicable, and cleanup.
- No unbounded collect/drain, detached producer, silent overflow, timing
  assumption, or false-idle settle result is allowed.

### [ ] P3B.3 Input-first stream typing

- Params flow into subscription and routes; Stream value/error/requirements flow
  outward through runtime, testing, and packed declarations.
- Impossible typed lanes disappear without erasing defect, interruption, end,
  cleanup, or missing requirements.

## P3C — Timers

### [ ] P3C.1 One-shot lifecycle and restore

- `flow.after` remains a one-shot actor-owned timer using Effect Clock and
  `Duration.Input`; this is the supported timer call shape.
- State exit, re-entry, stop, disposal, replacement, and stale generation cancel
  exact timer fibers. Firing publishes once through the actor owner.
- Internal restore validates nonnegative remaining duration, actor/state/binding/
  target/generation compatibility, and resumes under destination TestClock.
- Do not claim cross-host portability for a wire version that stores absolute time.
- Cutover marker: keep `flow.after` as the timer API and remove legacy timer
  engines or aliases rather than preserving parallel execution paths.

## P3D — Children

### [ ] P3D.1 Current child contract and typing

- Keep the current child machine, binding, start/stop, retry, and public typing
  contract as the supported child API. Do not invent child input selectors, outcome routes,
  independent output/failure generics, or automatic restart budgets.
- Parent/app ownership and child definition types remain exact in source and packed declarations.
- Cutover marker: current child calls/types are the contract; richer child
  selectors, outcome routes, and restart budgets require a future approved
  feature packet rather than hidden legacy shims.

### [ ] P3D.2 Supervision, generation, restore, and finalization

- Parent actor Scope owns child incarnations by parent/binding/child/generation.
- Replacement, retry, parent state exit, stop, and runtime shutdown interrupt
  and await exact child finalizers; stale completion cannot publish.
- Restore validates and preserves generation facts before activation. Parent
  stop awaits children before final eviction.
- Testing helpers delegate to the production child owner.

## Phase 3 exit

- Transition/model differential and production/test parity pass.
- Streams, timers, and children have one production owner, bounded lifecycle,
  exact generations, and deterministic finalizer proof.
- Public and packed family types remain exact for the supported contract.
- No React, server, inspection, CLI, or documentation substitute was added.
