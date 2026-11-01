# S2: can the driver guarantee exactly one completion input per started Attempt?

Status: proposed, throwaway. Everything below is what `bun main.ts` printed (kept in `out.txt`; about 3 min, 190 lines of code, Bun 1.4.2, effect 4.0.5).

## Inputs and conditions

- Input: compiled commands `{ k: "invoke", attempt, commit }`, `commit` an Effect. Each run starts two Attempts (the scenario's, plus a 3-yield success "bystander") from a plain-JS pump, then injects one event, then drains.
- Shapes (same recipe, `mk()` in main.ts): A `forkIn`+`onExit` (the 3.5/4.A sketch); B `runFork`+`addObserver`; C `forkIn`+`addObserver`; D `FiberMap.run`+`addObserver`; E `FiberSet.run`+`addObserver`. Classification (ok, failed, defect, cancelled, owner-closed, unknown) runs in the observer, outside the fiber, except in A where it runs inside `onExit`.
- Scheduler: a replaceable `Scheduler` (Scheduler.ts: `shouldYield`, `makeDispatcher`) with one queue; the harness pops one task per tick in seeded random order, and `shouldYield` is true on every third check. Injection at tick k = 0..14 (0 = before the first tick), seeds 4 (2 for hanging scenarios, k 0..6): `cancel` (interrupt Attempt 0's fiber, flagged as the driver's cancel), `close` (scope close, or interrupt-all for B), or none. 954 runs per shape.
- Scenarios: success, failure, defect, sync completion (`Effect.succeed`, done before registering), finalizer running (`acquireUseRelease` with a 4-yield release), uninterruptible commit, hang + inner timeout (`Effect.timeoutOption`), hang + outer timeout (driver timer), uninterruptible hang with each, and three commits translated from the converted Checkout: `pay` (no signal, promise lands late), `placeOrder` (signal, aborts, `OrderExists` becomes success), `authenticate` (3-D Secure, waits on a person; outer timeout).
- Pass means the Attempt's completion count and the bystander's count are both exactly 1.

## Results

| Shape | runs | wrong count | dispose never finished | fiber unfinished or Attempt left in flight |
| --- | --- | --- | --- | --- |
| A forkIn+onExit | 954 | **220** | 28 | 238 |
| B runFork+addObserver | 954 | 30 | 60 | 60 |
| C forkIn+addObserver | 954 | 6 | 25 | 25 |
| D FiberMap.run+addObserver | 954 | 30 | 60 | 60 |
| E FiberSet.run+addObserver | 954 | 30 | 60 | 60 |

- **The review's claim reproduced.** A lost the completion for every cancel or scope close that landed before the child fiber's first tick (count 0), in every scenario including sync and success; a scope close also lost the bystander's. Minimal probe (fork, then interrupt in the same fiber turn): `body 0, onExit 0, observer 1`. B to E never lost one.
- **Every wrong count for B to E is the `uninterruptible-hang+inner` scenario**: an inner `Effect.timeoutOption` cannot fire in an uninterruptible region, so nothing ever completes (a never-ending fiber, and dispose waits for it: the "dispose never finished" column is exactly these runs). The same commit with an outer timeout passes in all five shapes: count 1, class `unknown`.
- Outside that scenario B, C, D, E: zero wrong counts across all other scenarios and injection points, no doubles, no leaks, no unfinished fibers after dispose. Disposal did await fibers (when disposal returned, no fiber was unfinished).
- Interrupt before start in C: the fiber's observer fired with an interrupt-only cause, classed `cancelled` (driver flag) or `owner-closed`. Uninterruptible commits that were cancelled mid-way also exit as interrupt, even when the commit's work finished: the classifier cannot tell "landed" from "did not", so a cancel after the call started must map to `unknown` (as 2.7.1 says `Cancelled` is).
- Timeouts, rule 25 cancelled: an outer driver timer that reports `unknown`, interrupts the fiber and drops the later exit with a per-Attempt latch gave exactly one `unknown` in 100% of its runs (including uninterruptible hangs, and the 3DS-shaped commit). An inner timeout inside the fiber also reports `unknown` (the timeout error is classified, not a failure) but only works for interruptible commits. A timed-out write can report `unknown`; the harness did not check it against a landed write because no outside world was built.
- Mutation sanity (shape C, success): none 0 of 22 flagged, dropped 22 of 22, doubled 22 of 22.
- Cost per invoke, success commit, default scheduler, **Bun only**, N=5000, unforced GC (heap figures are noise): A 2.06 us, B 0.18 us, C 0.55 us, D 0.34 us, E 0.51 us.
- Driver-side facts: `Effect.runSync` installs its own sync scheduler that flushes a forked child inline, so "interrupt before start" cannot be seen through it; the plan's pump is plain JS, so the harness runs a setup fiber with `runFork` and reads `pollUnsafe()`. `runFork` with a pending interrupt cannot lose either: it starts synchronously. `FiberMap.run` and `FiberSet.run` start immediately by default and interrupt the earlier fiber on a duplicate key (not exercised).

## Recommended shape (proposed)

C: `forkIn(scope)` for ownership by the Runtime's scope, plus `fiber.addObserver` registered by the driver right after the fork, classification there (outside the fiber, which also meets rule 25), plus an outer driver timer for the 5 s disposal bound and any per-operation bound: report `unknown`, interrupt, latch so a later exit is dropped. B is the cheapest and equally correct but has no owner scope, so disposal needs its own set (that is what D and E are). Never `onExit` for the completion.
Open for the owner: an uninterruptible commit that hangs is never completed by anything except the outer timer, so Runtime O6's 5 s bound must be an outer timer, not an Effect timeout.

## Broken rules

- None broken. Rule 25 is cancelled here (timeouts used). Note a conflict: `Runtime.plan` O6 gives a 5 s disposal bound making an in-flight commit `unknown`; machine-design.md 2.7.1 says Flow has no timeout (rule 25). The design wins, and this spike did not build from the plan's version: the outer timer is only a test of what a timeout could report.

## Compared with real code

- `codebases/tanstack-query/packages/query-core/src/retryer.ts` (lines 85-125): one `isResolved()` guard, `resolve` and `reject` are no-ops once settled, and `cancel` rejects with `CancelledError` itself. That is the outer-latch shape: the completion belongs to the tracker, not to the work.
- `codebases/xstate/packages/core/src/actors/promise.ts` (lines 160-215): a per-actor `AbortController`; `stopped` status is set by the owner, and a later promise result is ignored. Same: the owner decides, the late result is dropped.
- Neither runs the completion inside the work's own cleanup.

## Read

- Flow design: `workflow/plans/flow/references/explorations/machine-fragments/machine-design.md` 2.7.1 (endings, reasons table), 2.7.13 (write lane, lines about 2114-2150); `runtime-architecture/discussion.md` 3.5 and 4.A; `review-1.md` F2/3.2.
- Plans, only for disposal: `Runtime.plan` O6 (lines 126-146), `Operations.plan` lines around 84-110 and 183. Per the coordinator, these are outdated; the design supersedes them.
- Commits: `references/checkout/features/Pay/pay.contracts.ts` (`pay`, `authenticate`, `voidAuthorization`), `Cart/cart.contracts.ts` (`placeOrder`, `setQuantity`, `removeLine`, `applyCoupon`); dispatch-desk: only listed its `commit:` sites (`Assistant/assistant.contracts.ts`, `Comments/comments.contracts.ts`, `Tickets/ticket.contracts.ts`), **not read in detail** (the `progress` and streaming commit is not exercised).
- Effect: `node_modules/effect/src/Effect.ts` (`forkIn`, `runFork`), `Fiber.ts` (`addObserver`, `interruptUnsafe`, `pollUnsafe`), `FiberMap.ts`, `FiberSet.ts`, `Scheduler.ts`, `internal/effect.ts` (`forkUnsafe`, `runForkWith`, `runSyncExitWith`).

## Unverified

- Real network, a landed-versus-not write, `Outcome.*` classification, the `signal` plumbing and idempotency are not modelled; `unknown` is only the driver's label.
- Throwing or async code inside the observer callback; the pump re-entering from `addObserver` for a synchronous exit (it ran inline, and counts held, but queue ordering was not asserted).
- The outer latch was always on in outer-timeout runs; dropping it was not tried.
- Uninterruptible hangs leak a fiber forever in every shape; no shape fixes that.
- Interleaving covers two Attempts and Effect's yield points, not every microtask or browser throttling. Node not run. Timing is one run each.
- Dispatch-desk streaming and `progress` commits; `FiberMap` duplicate-key interruption.
