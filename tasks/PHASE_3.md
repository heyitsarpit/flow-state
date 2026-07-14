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

### [x] P3A.1 Transition/model differential

- Production dispatch owns guard, exit, update, target, entry, state
  publication, and activation of transaction/stream/timer/child bindings.
- `flow.can` evaluates the same acceptance rule without mutation or owned work.
  Guard false is rejection; guard throw is a distinct defect.
- An independent transition model covers accepted/rejected events, re-entry,
  nested dispatch, synchronous family completion, stop/replacement, and stale work.
- Runtime and Flow Test produce equivalent observable snapshots, facts, issues,
  pending work, and Cause.
- [x] Audit correction: [BUG-54](./BUGS.md#bug-54-the-differential-model-is-self-referential)
      requires an independent oracle that does not import production semantic
      helpers or repeat descriptor-ID bookkeeping.
- [x] The independent property models now cover state stop, re-entry replacement,
      stale transaction/stream work, pending work, and nested routed events on
      both runtime and Flow Test surfaces without importing production semantic
      owners.
- [x] Immediate `Effect.succeed` transaction completion now has an independent
      nested-event projection on both surfaces, and a source-boundary test keeps
      all three Phase 3 oracle models independent from production semantic helpers.
- [x] One bounded accepted-transition parity proof now covers exit/update/entry
      action order across `flowTest` and runtime actors with identical snapshots,
      receipts, and issues after one synchronous event.
- [x] One bounded clock-sensitive guard rejection parity proof now covers a
      live `TestClock` runtime actor and a clocked `flowTest` harness rejecting
      the same guarded event with identical snapshots, receipts, and issues.
- [x] One bounded explicit self-reentry parity proof now covers a runtime actor
      and `flowTest` reentering the same state with identical snapshots,
      receipts, exit/entry action order, and empty issues.
- [x] One bounded `always` follow-up parity proof now covers the same event and
      `always` microsteps producing identical snapshots, receipts, and empty
      issues on `flowTest` and runtime actors.
- [x] One bounded action-only self-transition parity proof now covers a
      same-state transition with transition-phase action receipts and identical
      snapshots/issues on `flowTest` and runtime actors.
- [x] One bounded synchronous state-owned `flow.run` success-route parity
      proof now covers the immediate pending turn and flushed completion with
      identical snapshots, receipts, and issues on `flowTest` and runtime
      actors.
- [x] One bounded synchronous state-owned `flow.run` failure-route parity
      proof now covers the immediate pending turn and flushed handled-failure
      completion with identical snapshots, receipts, and issues on `flowTest`
      and runtime actors.
- [x] One bounded synchronous state-owned `flow.run` interrupt-route parity
      proof now covers the immediate pending turn and flushed handled-interrupt
      completion with identical snapshots, receipts, and issues on `flowTest`
      and runtime actors.
- [x] One bounded synchronous state-owned `flow.run` defect-route parity
      proof now covers the immediate pending turn and flushed handled-defect
      completion with identical snapshots, receipts, and issues on `flowTest`
      and runtime actors.
- [x] One bounded synchronous submit failure-route parity proof now covers the
      immediate pending turn and flushed handled-failure completion with
      identical snapshots, receipts, and issues on `flowTest` and runtime
      actors.
- [x] One bounded synchronous submit interrupt-route parity proof now covers
      the immediate pending turn and flushed handled-interrupt completion with
      identical snapshots, receipts, and issues on `flowTest` and runtime
      actors.
- [x] One bounded synchronous submit defect-route parity proof now covers the
      immediate pending turn and flushed handled-defect completion with
      identical snapshots, receipts, and issues on `flowTest` and runtime
      actors.
- [x] One bounded same-state serialized submit queue-path parity proof now
      covers the second accepted save staying queued behind the active preview
      with identical context, resource, transaction, receipt, issue, and
      pending-work facts on `flowTest` and runtime actors.
- [x] One bounded same-state serialized submit overflow-path parity proof now
      covers the third accepted save being rejected at queue capacity while the
      active preview stays current with identical context, resource,
      transaction, receipt, issue, and pending-work facts on `flowTest` and
      runtime actors.
- [x] One bounded nested synchronous submit-success routed-event receipt parity
      proof now covers the flushed `SAVED` machine-event/transition receipts and
      outer success receipt correlation split with identical snapshots,
      receipts, and issues on `flowTest` and runtime actors.

### [x] P3A.2 Callback-family typing

- Guards, updates, entry/exit, routes, bindings, targets, and helpers receive
  exact Context/Event/State/Input and owner families.
- Unsafe narrower callbacks fail locally; no bivariant/universal callback bag or
  restated generic family is introduced.
- [x] Audit correction: [BUG-18M](./BUGS.md#bug-18t--bug-18m--bug-18s-public-callbacks-remain-bivariant)
      remains visible in exported machine guards, updates, and actions.
- [x] Phase 4 audit correction: [BUG-60](./BUGS.md#bug-60-ordinary-machine-inference-no-longer-accepts-a-checked-config)
      restores annotation-free `flow.machine(config)` inference for an existing
      checked config in source, isolated, and multi-entry declarations.

## P3B — Streams

### [x] P3B.1 Production ownership and generation lifecycle

- The actor-owned scoped Stream runner is the only semantic stream engine.
  Testing controls foreign input but delegates execution and state.
- Install generation/running state before synchronous value/end/failure can
  publish. Only the active binding generation publishes values, routes, facts,
  pending state, or terminal status.
- State exit, restart, actor stop, runtime shutdown, and replacement interrupt
  and finalize exactly once; stale emissions and terminal events are ignored.
- Value, typed failure, defect, end, interruption, and stale remain distinct.
- [x] Audit correction: [BUG-41S](./BUGS.md#bug-41s-emitted-undefined-is-erased)
      requires present `undefined` values to survive running and terminal stream
      snapshots without being collapsed into absence.
- [x] Phase 4 audit correction: [reopened BUG-41S](./BUGS.md#reopened-bug-41s-receipt-facts-erase-a-present-undefined-value)
      derives receipt availability from the snapshot discriminant across runtime
      and Flow Test, including absent and present `undefined` facts.

### [x] P3B.2 Bounded pressure

- Every exported pressure policy has explicit bounded capacity, FIFO/coalescing/
  drop/backpressure semantics, typed overflow where applicable, and cleanup.
- No unbounded collect/drain, detached producer, silent overflow, timing
  assumption, or false-idle settle result is allowed.
- [x] Audit correction: [BUG-36](./BUGS.md#bug-36-coalescing-has-unbounded-cardinality)
      requires a capacity/overflow rule for distinct coalescing keys, not only
      replacement behavior for one repeated key.

### [x] P3B.3 Input-first stream typing

- Params flow into subscription and routes; Stream value/error/requirements flow
  outward through runtime, testing, and packed declarations.
- Impossible typed lanes disappear without erasing defect, interruption, end,
  cleanup, or missing requirements.
- [x] Audit correction: [BUG-18S](./BUGS.md#bug-18t--bug-18m--bug-18s-public-callbacks-remain-bivariant)
      remains visible in exported stream params, subscription, and defect
      callback fields.
- [x] Audit correction: [BUG-56](./BUGS.md#bug-56-carried-stream-typing-was-replaced-by-an-erased-copy)
      must remove the locally restated erased stream family from invoke typing
      and carry the canonical exact definition instead.
- [x] Phase 4 audit correction: [reopened BUG-56](./BUGS.md#reopened-bug-56-canonical-stream-syntax-still-erases-invoke-inputs)
      validates the exact canonical stream params input captured by the machine
      config against its owning Context in source, isolated, and multi-entry
      declarations.

## P3C — Timers

### [x] P3C.1 One-shot lifecycle and restore

- `flow.after` remains a one-shot actor-owned timer using Effect Clock and
  `Duration.Input`; this is the supported timer call shape.
- State exit, re-entry, stop, disposal, replacement, and stale generation cancel
  exact timer fibers. Firing publishes once through the actor owner.
- Internal restore validates nonnegative remaining duration, actor/state/binding/
  target/generation compatibility, and resumes under destination TestClock.
- Do not claim cross-host portability for a wire version that stores absolute time.
- Cutover marker: keep `flow.after` as the timer API and remove legacy timer
  engines or aliases rather than preserving parallel execution paths.
- [x] Phase 4 audit correction: [BUG-61](./BUGS.md#bug-61-timer-restore-accepts-an-infinite-deadline)
      rejects non-finite timer snapshots and persisted schedule facts before
      runtime or Flow Test actor registration.

## P3D — Children

### [x] P3D.1 Current child contract and typing

- Keep the current child machine, binding, start/stop, retry, and public typing
  contract as the supported child API. Do not invent child input selectors, outcome routes,
  independent output/failure generics, or automatic restart budgets.
- Parent/app ownership and child definition types remain exact in source and packed declarations.
- Cutover marker: current child calls/types are the contract; richer child
  selectors, outcome routes, and restart budgets require a future approved
  feature proposal rather than hidden legacy shims.

### [x] P3D.2 Supervision, generation, restore, and finalization

- Parent actor Scope owns child incarnations by parent/binding/child/generation.
- Replacement, retry, parent state exit, stop, and runtime shutdown interrupt
  and await exact child finalizers; stale completion cannot publish.
- Restore validates and preserves generation facts before activation. Parent
  stop awaits children before final eviction.
- Testing helpers delegate to the production child owner.
- [x] Audit correction: [BUG-53](./BUGS.md#bug-53-child-generations-are-not-observable-or-restorable)
      requires child generation in owned entries, snapshots, lifecycle facts,
      restore validation, and stale-publication gates.
- [x] Audit correction: [BUG-55](./BUGS.md#bug-55-child-boundaries-escape-flush-accounting)
      requires pending child finalizers/replacements to participate in flush and
      settle accounting without publishing an idle ghost child.

## Phase 3 exit

- Transition/model differential and production/test parity pass.
- Streams, timers, and children have one production owner, bounded lifecycle,
  exact generations, and deterministic finalizer proof.
- Public and packed family types remain exact for the supported contract.
- No React, server, inspection, CLI, or documentation substitute was added.
