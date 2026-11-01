# Round 2: two actors, the store, one rewrite

Status: proposed, throwaway. Everything marked ran was run on 2026-11-02, Bun 1.4.2, Effect 4.0.5, this Mac, one process at a time. Decisions: [../convergence-2.md](../convergence-2.md). Outputs in this folder: `suite-output.txt`, `mutants.txt`, `mutants-second.txt`, `mutants.first.txt`, `mutants-second.first.txt`, `search-*.txt`, `s4.txt`, `measure.txt`; red run `../conformance/red-round-2.txt`. Commits: decisions `d0eb5e0c`, red `397a2e2c`.

**Verdict.** The shape survived widening: one pure step, a fence and a small driver carry two or more actors, `latest`, `serialize`, a record queue, predictions and repair, inside the budget, with the entity module out of the core. The suite is better and still imperfect: a second author's first mutant set killed 26 of 36, against 2 of 16 last round. Converted Pay has real money bugs, and my proposed fixes for them are **not enough**: the search still fails on the fixed copy.

## What I read

`AGENTS.md`, `prototypes/README.md`, `convergence-1.md`, `SCENARIOS.md`, `round-1/RESULTS.md`, `round-1/review.md`, all of round 1's code and `conformance/`. `machine-design.md`: 2.5, 2.7.13, 2.7.14, 2.8.2-2.8.14, rules 26-38. Checkout: `Cart/*`, `Refunds/*`, `Pay/pay.machine.ts` lines 100-200 and 392-420. S1 and S2 results and models. Prior art, cited in `entities.ts` and `driver.ts`: `tanstack-query/.../mutationCache.ts`, `db/.../KeyScheduler.ts`, `db/.../transactions.ts`, `mono/.../pending-mutations.ts`, `mutation-tracker.ts`. `db/.../collection/state.ts` by grep only. Skills: execute-task, policy-code-correctness, principle-claim-only-what-you-checked in full; to-design and policy-code-composition, opening sections. Desk code not read: no desk flow here.

## What ran

| Item                                                                 | Result                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Red, no runtime                                                      | 0/110 cases. One had first passed vacuously (ORDER-04's hour); fixed before the red commit                                                                                                                                                                                                                                                                                                                                  |
| Scenarios on `round-2/`                                              | **120/120 cases** across 51 scenarios (PAY 19, ORDER 5, DRV 4, LIKE 6, STORE 11, CART 2, REFUND 1, LIB 3). Unlogged expectation changes: none. Catalog disagreements: none. Under 1 s for all, DRV-01 included (2,160 runs)                                                                                                                                                                                                                                                          |
| Same with `FLOW_DRAIN_MS=0` (a run before the last tests were added) | 118/120. ORDER-03 and DRV-01 assume a send starts at once, which a yield after every step denies. By reading, not investigated further                                                                                                                                                                                                                                                                                      |
| SEARCH-PAY, exact                                                    | **depth 8 complete, 18,374 states**, 50,567 edges, 26 s, 208 MB. Depth 9 complete at 48,852 new states, stopped at my 240 s limit during depth 10: inconclusive beyond 9. Each depth grows about 3.6x, so the graph does not close soon. 24 alphabet actions                                                                                                                                                                |
| SEARCH-PAY oracles                                                   | S6, S7, D29 claims, one ending per send delivered: none failed. Money: 27 classes by depth 9, all pinned. Unpinned: none, after P6 was added on its evidence                                                                                                                                                                                                                                                                |
| SEARCH-LIKE, exact                                                   | **depth 9 complete, 183,828 states**, 143 s, 337 MB. 2 actors, 2 records, 3 mints, masks 1-3, late landing. No oracle failed: at most one Attempt on the wire per record, first sends in mint order, the server never backwards unless something was released, L2 and L3 claims, nothing left after drain. Not closed: depth 9 added 91,939. S1's model reached 33k-310k states; the two are not comparable state for state |
| SEARCH-PAY on `pay.fixed.ts`                                         | **Failed:** 17 classes unpinned at depth 8. See P1-P6 below                                                                                                                                                                                                                                                                                                                                                                 |
| Mutants, builder                                                     | First 85/95; now 92/94                                                                                                                                                                                                                                                                                                                                                                                                      |
| Mutants, **second author** (Opus, did not read scenarios or my list) | **First 26/36.** Now 35/36, but those tests were written after reading the survivors, so 26/36 is the independent number                                                                                                                                                                                                                                                                                                    |
| Citations with a killing mutant (D33)                                | 74/78. Near: F1, F2, L4, `lane.interrupt.InFlight`, `lane.runtimeDisposal.InFlight`, `notsent.Rejected`. These are cited but no mutant proves them through a test citing them                                                                                                                                                                                                                                               |
| UNTESTED owed by this round                                          | `lane.retry.Idle`, `retry.InFlight`, `idle.InFlight`, `idle.Held`, `restore.Idle`, `runtimeDisposal.Idle`, D7, D25, D26, D28, D29, D31, D41, D42 have no citing scenario. Several are hit by runs; a structural decision has no scenario by nature                                                                                                                                                                          |
| S4                                                                   | Ran, below                                                                                                                                                                                                                                                                                                                                                                                                                  |

Three mutant survivors remain. `drop-timer-fence`: equivalent under this fake, because the driver cancels the old host timer before re-arming, so a stale firing cannot arrive; the timer half of D5 is unproven. `success-clears-unresolved-marks` and its second-author twin: see "Plan wrong". Two mutants (`follow-not-head`, `follow-up-joins-tail`) were killed by the watchdog, not by a test: an infinite follow-up.

## Findings

### Plan right, code wrong

| Id           | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime      | No runtime bug was found after scenarios ran. Every first-run failure was a scenario or fixture bug (table in `expected-changes.log`). That a from-empty rewrite was green this fast is why the mutant result matters more than the 120                                                                                                                                                                                                                                                                                   |
| P1-P6        | **Pay's bugs, pinned, Pay unchanged.** The list with traces and proposed fixes is in convergence-2. SEARCH-PAY found one nobody listed: **P6**, pressing Pay in PLACING mints a new id beside the authorization; a reload then says "You haven't been charged", shortest `pay ack ok pay reload`. Scenario pins: PAY-07, PAY-15, PAY-19                                                                                                                                                                                   |
| Pay fixes    | `conformance/fixtures/pay.fixed.ts` applies my P1-P5 fixes to a copy. **They are not enough.** Shortest remaining: `charged-unaccounted:UNSURE` by `pay Leave Start2 ack advance60000`, `told-not-charged:CARD` by `pay Leave Start ack ok pay reload`. Some classes are my oracle's coarseness, for example a second `Start` after PAID clears the receipt. I did not iterate further. The owner should treat the fix column as a start, and the root may be that Pay's memory holds one intent and one `authorized` bit |
| Refunds test | `refunds.test.ts:65` expects `outstanding: 64` on the 65th refund. Rule 35's record queue declines it first, at head plus 63. Converted test against design. Logged                                                                                                                                                                                                                                                                                                                                                       |

### Plan wrong

| Id                              | Finding                                                                                                                                                                                                                                                        | Evidence                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Rule 32's third clause          | "A mark whose Attempt is still unresolved stays" looks unreachable under D3. A later write to the record cannot succeed while an older Attempt holds its queue entry. Two independent mutants that clear unresolved marks survive scenarios and a small search | Mutants ran; unreachability by reasoning and those survivors, no proof. Same family as D41 |
| Contested (rule 31, E7)         | Cut, D41. Unreachable in one Runtime under D3 by reasoning; SEARCH-LIKE's mint-order oracle held its premise to depth 9                                                                                                                                        | Ran                                                                                        |
| D12's "queue released at 30 s"  | Contradicts D3 for a live hold. D40: a live hold outranks the bound; only a released entry leaves                                                                                                                                                              | STORE-07                                                                                   |
| Catalog LIKE-06                 | "Mark stays" contradicts rule 32. A later success clears a released mark, and the screen is then wrong with no mark until a read. So the stated limit (OD20 F1) is **silent** on screen. The owner may want to revisit                                         | LIKE-06 pins it                                                                            |
| Seam, on paper in convergence-2 | `cx.wake` was not needed. Eligibility is rechecked after every step over `ready` lanes, so a module only answers `blocks`. `prepare` was needed, not on paper, so a prediction's throw refuses the turn before any cell                                        | Built                                                                                      |
| Section 12's stable interface   | Edits to old cases' expectations: PAY-08, PAY-10/hang, PAY-11/module, PAY-12/shuffle, 4 of 35, 11%: over the 10% line by a little, all but PAY-08 for decisions and not for the interface. Moving to a `Port` touched every helper                             | Counted                                                                                    |

### Plan silent

| Id                         | Finding                                                                                                                                                                                               | Decision                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Interrupted success        | A commit that lands after an interrupt in an uninterruptible region exits interrupted, so the Attempt reads `unknown` though the fake answered success. Safe, and reconcile finds it. S2 saw the same | Stated                                                             |
| Ensure mid-drain           | DRV-04: order unstated                                                                                                                                                                                | Queues like any input. Proposed                                    |
| Marks across a reload      | A released mark is not in any lane record, so it is lost on reload                                                                                                                                    | Stated limit. Rule 32 revision "a mark holds its record" not built |
| `Store` two-module `start` | With two modules answering `start`, a decline after the other's join would need a withdraw                                                                                                            | One module answers today. Stated in `hooks.ts`                     |

### Costs too much, or estimated wrong

| Part (formatted, comments in)  | Target    | Stop      | Actual                                 |
| ------------------------------ | --------- | --------- | -------------------------------------- |
| Step, turn, world, seam, hooks | 1,100     | 1,400     | 1,086                                  |
| Lane table                     | 400       | 550       | 419                                    |
| Reads, timers                  | 150       | 200       | 114                                    |
| Write-ahead                    | 220       | 300       | 242                                    |
| Publication, waits             | 100       | 150       | 78                                     |
| Driver                         | 280       | 400       | 247                                    |
| Entities                       | 450       | 650       | 314                                    |
| **Core + driver + entities**   | **2,700** | **3,350** | **2,500**                              |
| Adapter                        | 250       |           | 155                                    |
| Suite, `conformance/`          | no stop   |           | 6,295: scenarios 2,478, fixtures 1,837 |
| Mutants                        |           |           | 1,219                                  |

Driver share 11%, trigger 35%. Under budget is not evidence of a small system: no fragments, streams, resources, `check()` or real codecs here, as round 1's review warned.

**Size** (own code, `bun build --minify`, gzip, Effect external): core with driver 9.4 KB against 14; entities 2.1 KB against +8.

**Item 13, world copies [ran, Bun, microbenchmark].** Plain turn: 0.9 us at 1 and 100 actors, **19 us at 1,000, 216 us at 10,000**. Replacing one of 1,000 keys: object spread 17.5 us, Effect `HashMap.set` 0.53 us. So nearly all of the cost at 1,000 is the one `actors` copy. D37 stands for now: 19 us is small against an 8 ms budget. Above a few thousand actors a persistent map pays, by a factor of about 30, and it is one field.

## S4

**Ran**, unattended, Chrome 146 headless, raw CDP over a WebSocket, throwaway profile, no new dependency. `s4.ts` is this runtime with real timers, real fibers and `MixedScheduler`, no suite. Commits answer on the next macrotask. `performance.now` is clamped to 100 us here, so medians read 0 and only the batch mean and tails say anything.

| CPU throttle | Actors | Plain turn, batch mean | Plain turn p99, max | Click p99, max | Click to settled, median |
| ------------ | ------ | ---------------------- | ------------------- | -------------- | ------------------------ |
| 1x           | 1      | 1.4 us                 | 100, 400 us         | 200, 400 us    | 5.1 ms                   |
| 1x           | 1,000  | 2.9 us                 | 100, 100 us         | 200, 200 us    | 5.1 ms                   |
| 6x           | 1      | 10.7 us                | 500, 1,600 us       | 200, 500 us    | 4.6 ms                   |
| 6x           | 1,000  | 13 us                  | 800, 1,400 us       | 100, 300 us    | 4.6 ms                   |

A click is a commit, prediction, queue join, fiber start and one publication. Under 8 ms in all of these, by a wide margin. Click to settled is mostly the browser's timer floor. A first attempt hung and was killed at 200 s, leaving a Chrome process I then killed; I changed the plain-turn event to one that does not grow memory and it did not recur. The cause is **not established**. Not a phone, no React, no rendering, a small world.

## Questions

- **Did the entity module stay out of the core? Yes on what was checked.** No core file names it (grep on 11 files). A bundle from `driver.ts` holds none of `entities`, `prediction`, `marks`, `readRecord`, `startRepair`. Pay runs with no entities module loaded. The one coupling is D44's: `Compiled.uses` is a name and the adapter's registry resolves it. A real contract importing its module is unbuilt.
- **Is the seam right?** Thirteen hooks serve the store; that is larger than it looked on paper. A fourteenth, `commit`, is used only by the fault module today and is kept for round 4's `filled`. No hook needed a lane. Untested against a second real module; streams will be the test.
- **Harness enough?** Added `raw`, `subscribe`, `record`, `outside`, `stateHash`, `afterYield`, `mutateServer`, `landLate`. D2 is now observable. Settling moved to the suite; adapter 215 to 155 lines.
- **The money oracle:** independent of the design, and it found P6. Its classes are coarse, so a new bug in a pinned class hides: that is its weakness.

## Rules broken

- **D9, D10, D13, D14, D16:** replaced, D25, D27, D35, D30, D42.
- **Section 11's no-BFS line:** revised in form, D32. The search sees opaque text.
- **L1:** ack and capture no longer have an ending at their bound, D30.
- **Section 10's scope:** `serialize` came early, because Refunds is `serialize`. Its full policy suite stays round 5.
- **Rule 31:** a retry never rejoins (D3), and no contested response (D41).
- **Rule 36:** `optimistic` not built; STORE-10 lists it `near:`.
- **Rule 19's "random":** ids are a counter from the Host, so replay is exact.
- **Cart and Refunds flattened:** the stepper trait is on the host, ConfirmRemove is a state whose `Yes` carries the line, `subscribe` is a one-off lookup, `writes: invalidate` absent, keyed schedules absent.

## Solid, and shortcuts

**Solid on what ran:** the fence on direct and interleaved paths with a live fiber and real choices; mint-order queue with no cycle to depth 9; hooks in their own attempt; parked endings; `Phase`, which removed H3's class.

**Shortcuts:** flat machines. JSON instead of codecs. One server model per run. `check()` not built, so D11's dry form is unproven. Actor and lane records land in one fake write sequence, so PERSIST-01's crash windows stay open. Reads have no timeout. Repair has no answer position: its answer simply replaces the base. Stateless search re-runs the parent per action, which is simple and wasteful. `Bun.hash` is 64 bits, so a merge by collision is possible and very unlikely.

## Limits and unverified

- **1.8 GB limit:** the watchdog polls every 40 ms. Two runaway mutants reached 1.9-2.0 GB before the kill, and earlier, at 150 ms polling, a fixture bug reached 2.3 GB. **One early scenario run ran outside the watchdog**, by my error, for up to 120 s before I killed it; its peak was not measured.
- Fixed Pay's verdict, and every money result, is under a fake that answers what the search picks. A real server might refuse a void and a place together.
- Expected results and code still have one author. No Opus review of this round has run; section 11's check is owed, and D33's mutant rule is only a partial stand-in.
- `tsc` and `nub run verify` not run. `vp fmt` clean. `vp lint` on these folders: 376 errors, 1,876 warnings, nearly all `anti-slop` rules and unsafe assertions, not fixed, throwaway and outside the gate.
- `round-1/` no longer runs under the suite: the harness moved to `Port`. Its results stand at its own commit.
- No IndexedDB, no real `fetch`, no Node, no Safari. S3 still deferred.
