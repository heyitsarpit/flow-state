# Round 1: independent review

Status: advice to the coordinator. Everything here is proposed. Reviewer: Opus, did not build round 1. Revision: `6adc8459` on `flow-rewrite`, working tree clean for `packages/flow-state-v3`. Nothing in the prototype was changed; every experiment ran on a scratch copy.

**Verdict.** The shape holds: one pure step, a fence and a small driver. It can widen in round 2 without a redesign of the step. The suite cannot yet be trusted to say so: its fault scenario is vacuous, an independent mutant set mostly survives, and L3 cannot see a stuck world. Round 2 must first settle the module seam and D10, and repair the suite, before any green counts.

Evidence marks: **[ran]** I ran it, **[read]** I read the text or code, **[estimate]**.

## Counts

| Item | RESULTS says | I got | |
| --- | --- | --- | --- |
| Scenario cases | 35/35 | 35/35 [ran] | reproduced |
| SEARCH-PAY verdict | inconclusive, no oracle failed | same [ran] | reproduced |
| Search printout | `scripts 157,998`, `steps 1,376,001`, fingerprint depth 8, 9,171 replays, 1,968 states | identical [ran] | reproduced, **but mislabelled**: M2 |
| Peak RSS | 171 MB | 172 MB by the search, 168 MB by my watchdog [ran] | reproduced |
| Lines | 1,632 and 798 | same [ran] | reproduced |
| F5, F6, F7, F2 traces, turn cost | `measure.txt`; 0.44 and 1.05 us | same behaviour; 0.44 and 1.06 us [ran] | reproduced |
| 22/22 mutants | killed | **not re-run**: `mutate.ts` runs every mutant in one process with no memory limit of its own, so I could not confirm it bounded. Instead 16 mutants of my own, one process each, under a 1.8 GB watchdog: H2 | |

Run: `bun packages/flow-state-v3/prototypes/conformance/main.ts --round 1 --runtime ../round-1/adapter.ts`, no `--lock`. Memory: an RSS watchdog that kills above 1.8 GB, rather than `ulimit -v`, one process at a time. Nothing came near it.

---

## High

### H1. PAY-12/shuffle tests nothing it claims

`conformance/scenarios/pay.scenario.ts:469-503`, `round-1/adapter.ts:78-93`, `conformance/fake-world.ts:51-55`. SCENARIOS asks for "leave and cancel at each tick"; RESULTS line 106 reports "8 seeds, 7 ticks, 2 events".

- `settle()` line 90 clears `tickPlan` the first time it sees an empty queue. The fault step itself settles with an empty queue, so every plan with `atTick > 0` is thrown away before Pay is pressed.
- **[ran, instrumented copy]** of 112 planned injections, 96 discarded, 16 injected, all at tick 0, **0 with a live fiber**. The event lands in CARD, before the commit exists.
- **[ran]** of 1,344 scheduler picks, **0 had more than one task to choose from.** The seed changes nothing. Convergence section 8 called S5's `B-rand7` vacuous for this exact reason.
- The `try { d.answer } catch {}` at lines 486-490 also swallows `Mismatch`, so an L3 failure in that step is silently ignored.

So D5, D6 and S4 under interleaving have no check. PAY-06 and PAY-12/duplicate do exercise the fence on its direct paths.

**Proposal.** Fix `settle` so a plan survives until its tick. Assert at the end of the scenario that injections happened with a fiber live and that picks had a choice, so it cannot go vacuous again. Catch only the "no held request" case. To get a real choice, run a second fiber (a read beside the commit; UNSURE has two). Correct RESULTS line 106.

### H2. "22/22 killed" overstates the suite; an independent set mostly survives

The 22 were written by the builder, and each early survivor became a test, so that number measures convergence on that list. I wrote 16 others from the cited rules. **[ran]** each in its own process: scenarios, then search at depth 5 (cap 30k) when scenarios passed. **14 of 16 survived both.** One, `timeout-not-disarmed`, is close to equivalent (a ghost timer that finds no wire). So 13 are real gaps.

| Mutant | What it breaks | Test that should have failed |
| --- | --- | --- |
| `restore-forgets-mayHaveApplied` (`lane.ts:275`) | **Rule 18 across a reload.** After a reload, a re-send's decline is reported "declined" though the first send may have landed. Money | none; PAY-05 only covers no reload |
| `timeout-after-resend-not-rearmed` (`lane.ts:174`) | D8 "per send": a hung re-send waits forever | PAY-06 covers the first send only |
| `storage-refused-resend-resolves` (`lane.ts:209`) | The row's re-send half: `Held`, `unknown { StorageRefused }` | PAY-10 cites the cell, covers first sends only. This is where H3 lives |
| `rejected-ending-not-delivered` (`lane.ts:136`) | Rule 16 "delivered": the decline never reaches the machine | PAY-02: `PayNotSent { Rejected }` changes nothing visible, and the evidence is written before delivery |
| `mail-lifo-not-fifo` (`world.ts:207`) | D1 | PAY-14 cites D1 |
| `read-gen-unfenced` (`reads.ts:48`) | D23: a superseded read's stale exit ends the newest read | PAY-03 cites D23 |
| `read-no-supersede-interrupt` (`reads.ts:19`) | D23 replace-latest | same |
| `restore-resets-retryCount` (`persistence.ts:172`) | Rule 46: `retryCount` persists | PAY-15/retry-budget has no reload |
| `settled-during-disposal-not-parked` (`lane.ts:262`) | Disposal row: an ending that settles before the final capture is saved | PAY-13 has no interruptible commit |
| `disposal-ignores-fibers-ending` (`step.ts:563`) | D6 "finish when the set empties" | PAY-13: only the bound runs |
| `after-memory-reads-before` (`step.ts:415`) | Rule 22: `retryInMs` from after memory | busy-then-new-write advances 500 ms and never checks it did not fire earlier |
| `cancelled-flag-not-reset` (`lane.ts:189`) | Rule 24 reason on a later send | none |
| `defect-issue-not-raised-reads` (`step.ts:85`) | 2.7.1: a defect is an actor issue, for reads | none |

The two killed: `restored-not-forced-current`, `retry-count-at-retry-cell`.

A related gap: SCENARIOS requires "each send has one ending" on every run. `closing` (`conformance/main.ts:30-36`) only rejects duplicates, so a **missing** ending passes, and ending evidence is written at settlement rather than delivery.

**Proposal.** Have a second author write mutants from the rule text each round, and report that kill rate rather than the builder's. Add `ends == sends` to `closing`, and count delivered endings through turn evidence. Add one scenario per row above before reusing these paths in round 2.

### H3. Runtime bug: a re-send whose capture was refused sticks forever on the next retry

`round-1/persistence.ts:52-59` returns without clearing `asked`; `persistence.ts:121-122` then treats the tag as already asked, so the next retry writes nothing and arms no bound.

**[ran]** `pay, ack, answer lost, advance 3000, order null, intent rpm, storage refuse` gives UNSURE, correct. The next tick and `rpm` move to PAYING with `waits.capture: true`. Ten minutes later: PAYING, row `pending`, no request, no storage write, no timer, `waits: ["capture:pay:..."]`, no issue. L1's "capture: same bound" is broken, and L3 passes because `capture:` is a named wait.

Nothing found it because the search has no `storage refuse` and no scenario covers a re-send's refusal. A real bug in code, not the design.

**Proposal.** Clear the tag on refusal. More to the point, derive "is a write outstanding for this wait" rather than keeping a list, and add the scenario. M1 is what makes this class visible.

### H4. A fourth money bug nobody listed: Leave during PLACING voids the hold while the order is on the wire

`checkout/features/Pay/pay.machine.ts:113-122` and `:178-188`. Fixture lines match. PLACING has no `Leave` override, and "Back to shop" always shows (`Pay.tsx:137`). `authorized && receipt === null` holds in PLACING, so Leave commits `void` beside the live `place`.

**[ran]** with `pay, ack, answer ok, ack, Leave, ack`, both on the wire:

- Void answers first, then place: state **PAID**, receipt shown, `placed: 1, voided: 1`, notice "The hold on your card was released." An order with its authorization voided.
- Place answers first: `Placed` is late and would leave LEFT, which owns the void, so it is `Denied { LateMayNotLeave }`. Then void lands. State **LEFT**, `placed: 1, voided: 1`, **no receipt**. The order exists and nobody is told.
- With a new PAYING in between: `pay, ack, ok, ack, Leave, Start, pay, ack, place ok` stays in PAYING, `placed: 1`, no receipt, with the void still on the wire. **PAY-07/late-may-not-leave pins this denial as the expected result** without saying the order was lost.

Rule 15 says a late handler must end in an alternative that does not move, checked by `flow check`, and `Placed` has only one, which moves. So the denial half is a Pay bug that `flow check` should catch, and the void half is a Pay bug nothing in the design catches. Unverified: the fake answers what scripts say, so a real server might refuse one of the pair.

**Proposal.** Pay: `Leave` in PLACING denied or deferred, `O.place.idle` on the void alternative, and a non-moving late `Placed` that records the receipt. Runtime: nothing. Suite: an oracle over the end state (M2).

### H5. D10 is unsound, and worse than F2 says

`round-1/driver.ts:59-61`, `:150-154`. F2 is real: a module throw on a `sent` step loses the only completion [ran]. The other input kinds fail too:

- **A `timer` step:** the driver already deleted the host timer, the world keeps the entry. **[ran]** UNSURE, one abort at the tick: reconcile stops for good, no new request in 10 minutes, row `uncertain`, `waits` still lists the timer as due. L3 passes. `pay`'s timeout does not save this one.
- **An `acked` step:** by reading, a landed ack is lost, and the bound then says `NotSent { StorageRefused }` for a stored record, which leads to M3.
- **A `turn` step:** by reading, `afterAbort` drops the head, so a settled lane is left with no mail. F2 says this; L3 does flag it as `stuck:`, but no scenario runs it.

PAY-11/module only covers a `send`, and asserts a click is lost. No scenario pins the completion case; it lives in `measure.txt`. So D10's "the value stays" holds for the value and drops the input. Entities will add hooks at settlement, where a throw would also lose store effects.

**Proposal.** Decide a rule per input kind before round 2. Try: hooks run after the core's own work in a separate attempt, so a hook throw disables that module with an issue and the core's result stands. An abort of core code itself is fatal to the Runtime, since a deterministic bug would repeat. Add scenarios for `sent`, `timer`, `acked`.

### H6. D9's break is a sign the seam is wrong, not a shortcut. Decide it first

`round-1/world.ts:150-170`, `round-1/persistence.ts:51-67,126-140`, `round-1/lane.ts:109,120,140-146`, `round-1/step.ts:47-50`.

It breaks in both directions. The module reaches into the core: `cell`, `restoreDelivery`, `armTimer`, direct writes to `tx.w.lanes` and `tx.w.dirty`. The core knows the module: `Attempt.waits`, `Attempt.acked`, `Compiled.persisted`, `mint` and `resend` set persistence's waits. Because the invoked, storage-refused and restore rows are lane-table rows, this persistence is not an optional bystander. Section 7's `Result<S>` could never express it.

Purity is not the casualty: `tx` is local to the step (see "Is the core pure"). What was lost is the discipline of who writes what, and it cost one real bug (`hook` evaluating the spread before the hook).

Only `init`, `onInput`, `onTimer` (not in section 7), `onCommit`, `blocksInvoke` and `restore` ran. `onSettled`, `onMember`, `claims`, `desired`, `admitSoft`, `read`, `capture` have no use yet. Entities needs `startWrite` at P6 with a verdict and `endWrite` at N with repairs, so round 2 hits this harder. `Compiled.modules` is empty, so "a contract imports its module" is unbuilt too.

**Proposal.** Pick in round 2's first decision round, with entities on paper against it:

- **A (recommended to try).** A small capability object: `cx.cell`, `cx.arm`, `cx.disarm`, `cx.command`, `cx.dirty`, `cx.note`, read-only world, own slice only. It keeps synchronous reads after a cell, which an effect list loses (ordering of effects would itself need rules).
- **B.** The builder's effect list on `Result`. Purer on paper, and needs an order for effects.
- Either way: decide whether write-ahead is core, with only the codec and storage in a module. The code says it is.

---

## Medium

### M1. L3 is the runtime's own report, so it cannot see a stuck world

`round-1/publish.ts:33-52`, `round-1/adapter.ts:171-181`, `conformance/scenarios/pay.scenario.ts:19-24`. Only the runtime can write `stuck:`, and it only does for two conditions. `wire:`, `capture:`, `timer:` and `held:` always pass, and `owner=` is the actor key, always present. H3, H5's timer, F2, F5 and F6 all pass. The builder is right that L3 is weak, and F5 and F6 are only part of it.

**Proposal.** Cross-check claims against the world the suite owns: each `wire:` has a live fiber (`rt.live()` exists at `driver.ts:192` and nothing calls it), each `ack:` or `capture:` has a held or hung write in the fake, each `timer:` has a host timer. That is cheap, independent, and fails on H3, H5 and F2 today. Keep the builder's `flow check` proposal for hold reachability, as rule 45's `UnresolvedHold` already asks.

### M2. SEARCH-PAY: what it proves and what would make it conclusive

**Reporting.** `scripts: 157,998` is not depth 6. **[ran, per-depth print]** nodes per depth: 6, 32, 174, 986, 5,798, **35,006**, then **214,840** for depth 7. Depth 6 is complete at 42,002 cumulative. `scripts` resets per depth and `cap` is cumulative (`pay.search.ts:207,216`), so 157,998 is the truncated depth 7 run (200,000 − 42,002). RESULTS line 24 should read: depth 6 complete, 35,006 scripts; depth 7 stopped at 74% by the cap. See the end of this section for the larger runs.

**What depth 6 proves.** After `Start`, the shortest re-send takes exactly six actions: `pay, ack, lost, advance, intent.rpm, ack`. So at depth 6 a re-send's only ending is the success drain feeds it. A lost or declined re-send (rule 18) needs depth 7, reached in full only by the larger run below or by the fingerprint phase, which merges hidden state and skips replay.

**Oracle strength, each one:**

| Oracle | Strength |
| --- | --- |
| New id while holding (S5, S6) | Good, on one lane. Killed its mutant |
| No ack, no request (S7) | Good for a first send. Does not cover a re-send's capture |
| NotSent `Restored` for a sent Attempt | Good, narrow |
| "Told not charged, was charged" | **Narrow:** requires `last.reason === "Restored"`. It would miss M3 |
| `charges(key) ≤ 1` (catalog) | **Vacuous and not coded:** `charged` is a Set of keys, so it cannot exceed 1 |
| One ending per send (S4) | **Cannot fail in reach:** the alphabet has no duplicate or late completion, as RESULTS says. Rejects duplicates only |
| L3 | Self-reported: M1 |
| After drain, not pending with nothing outstanding | Only `pay`'s row. `place` and `void` unchecked |

**Blind spots in the alphabet.** No `answer void` (H4 needs it), no `place` failure or loss, no `order`, no Busy, no `AbortPay`, no storage refuse or hang (H3, M3), no `never` and no timeout (drain always answers an open `pay`, so its 60 s is out of reach). The fake is not causal: `intent.rpm` can follow a landed charge.

**What would make it conclusive:**

1. Add a **money oracle independent of the design**, at quiescence after drain: every charged key is accounted for by a receipt, a void or a live hold; `placed` implies not voided. This fails today on F6 and H4, which is the point. Those are then findings the search reports rather than hand-written traces.
2. Widen the alphabet to the blind spots above.
3. Replace the Reads fingerprint with a sound one: `read.stateHash()` in the Harness, opaque to the suite, normalised for ids and absolute times. The world is a plain value, so this costs little and keeps the search world-independent. Dedupe on it until the state graph closes; "completed" then means every reachable state, with no depth at all.
4. Make the fake causal: `intent` answers from truth, with a scripted delay.

**Larger run [ran].** Cap 5M, 270 s deadline: exact depth 7 complete in 53 s at 170 MB, no oracle failed. Depth 8 reached 853,141 scripts before the deadline, peak 182 MB, no oracle failed. Each depth grows about 6x, so a full depth 8 is about 1.3M scripts and 6 minutes [estimate]. So the catalog's 200k cap, not memory, is what stops depth 8: the 2 GB limit is far away. The cap's 'inconclusive' could be removed by waiting, but a deeper run only adds states under oracles that cannot see the bugs, so do items 1-4 first.

### M3. D14 treats "no answer" as "refused", so a shopper told "not charged" can be charged with no click

`round-1/persistence.ts:87-92`, `round-1/lane.ts:205-213`. **[ran]** `pay, landNoAck` (the ack landed, its confirmation was lost), `advance 10000`: CARD, "You haven't been charged." The deletion waits behind the hung write. Reload: the record says acknowledged, so `unknown { Restored }`, UNSURE. `intent rpm`, `ack`: **`pay` is sent with no click**, and charged.

Rule 17 and the restore row allow it, and section 7 item 21 records the same hole for a cancel. D14 widens it. S6 and S7 hold, one id, so this is not a double charge. It breaks the sentence the UI said. F8 lists the store behaviour without this consequence. Note also that the hung key held back the whole batch, so the actor record stayed stale too (`fake-world.ts:131-134`).

**Proposal.** Re-open D14 with this trace. Options: keep the row `pending` while storage is silent, with a notice from the machine, and refuse only on a real refusal; or fence by a tombstone, as item 21's option B. My lean is the first: correctness first, and a storage that never answers is rare enough to wait on.

### M4. F6 is wider than reported: another intent's late charge is never voided

`pay.machine.ts:125-141`, `pay.definition.ts:57`. **[ran]** `pay, ack, Leave, Start pi2, pay, ack`, then pi1's confirm lands: root `self`, `authorized` false. Then pi2 proceeds and `Leave` voids `pi2` only. **pi1's hold is never voided.** `Confirmed` carries no intent and `authorized` is one bit, against rule 44's "reading what they need from the event, never from memory an earlier incarnation set".

**Proposal.** Carry `intentId` in `Confirmed` and void what the event names. Add the alternative `Authenticated` already has in the same position (`:157-171`): that handler records `authorized: true` and has a `S.CARD` branch to PLACING; `Confirmed` has neither.

### M5. The money bugs and design findings, one by one

Traces are in `round-1/measure.txt`, reproduced by re-running them. None uses `AbortPay`.

| # | Real? | Whose | Note |
| --- | --- | --- | --- |
| F5 press Pay in UNSURE | **Yes** | **Pay's code.** Rule 16 says Flow adds no guard and `flow check` warns. The fixture dropped `mayPay` and `NoDelivery`, but neither looks at state, so the fixture did not cause it: `Pay.tsx:110` enables the button from `check()` | Fix is `O.pay.idle(intent)` on the moving alternative. Then CARD after a Leave with a hold (trace "LEFT hold, new Start, Pay" [ran]) still needs a path: rule 45's `UnresolvedHold` applies |
| F6 late `Confirmed` in new PAYING | **Yes** | **Pay's code.** Fixture lines match. M4 | Rule 15 would allow leaving, since this PAYING owns no live call, so a guarded alternative fixes it |
| F7 throw on an ending's turn | Behaviour yes; **not a Pay bug** | **Design.** `capturable` cannot throw; only injection makes it. 2.7.13 keeps the cell and drops the turn on purpose | RESULTS' verdict line ("three stuck worlds ... in the converted Pay machine") overclaims this one, and files it under "Code wrong, plan right". Real question for the owner: is an `InvalidTurn` on an ending acceptable with the fact gone? |
| F1 two writes | Real for per-record KV; **"cannot work" overclaims** | Plan | One write works if the actor capture waits for the lane's ack: lane present means acknowledged, both absent means the click never happened. It loses `NotSent { Restored }` and PAY-09's notice. Compare at S3 |
| F2 | Real, worse | Plan | H5 |
| F3 ordinary timers persist | Real | Plan silent | Alternative not tried: re-arm entry schedules fresh on restore. Saved `dueAt` is right for a countdown, and over-fires after a long absence |
| F4 seam | Real | Plan | H6 |
| F8 | Real | Plan | M3 is its consequence |
| L3 too weak | Real, wider | Plan | M1 |

`AbortPay` is not in Pay, and `O.pay.cancel` there only runs where the lane is `Held` (`pay.machine.ts:398,406,432`), so `cancel.Idle` and `cancel.InFlight` are unreachable in real Pay. It is disclosed in the fixture header and RESULTS, used by four cases, and it fakes no Pay behaviour. Move it: L2.

### M6. Citations that do not support the test

Checked each cited rule's text. These count as "tested" in the UNTESTED report and should not:

| Test | Cites | Problem |
| --- | --- | --- |
| PAY-14 | D1 | One actor, no order asserted. LIFO mail passes [ran] |
| PAY-01 | D2 | RESULTS itself says D2 cannot be observed, yet the citation removes it from UNTESTED |
| PAY-03 | D23 | No superseded read happens. Mutants pass [ran] |
| PAY-03 | rule:18 | Shows an unknown, not the send-history rule. PAY-05 is the test |
| PAY-08, PAY-09 | rule:38 | Rule 38 is about **domain** writes and predicted keys. Pay has none. Rule 46 is the right one |
| PAY-11 | sec:2.5.1 | No such heading in the design; 2.5 step 1 is meant. The runner does not validate `sec:` ids |
| PAY-10 | cell:lane.storageRefused.InFlight | First-send half only: H2, H3 |
| PAY-12 | D5, D6, S4 | Direct paths only: H1. D6's isolated commands and a start that throws are not tested |
| SEARCH-PAY | S4, rule:17, S5 | S4 unreachable; endings not delivery; S5 is about record queues, absent here |

The rest I checked hold: PAY-02 (except delivery, H2), PAY-04, PAY-05, PAY-06, PAY-07 on rules 14 and 15, PAY-09, PAY-10, PAY-11's cell-kept reading of 2.5 step 2 and 2.7.13, PAY-13's bound, PAY-15's cells against 2.7.13's table.

**Proposal.** A citation needs a mutant of that rule that fails the test, or it goes to `near:`, and `near:` stays in UNTESTED. Validate `sec:` ids.

### M7. Were expectations fitted? Mostly no; the gate proves less than it says

**Audit [ran].** A formatting-blind diff of scenarios from red `25d48681` to now: one expectation replaced, PAY-13's `waiting`, logged and argued from the table. Everything else is additive, and each tightening is logged. The fixture is unchanged since red except two type annotations (token-level diff), so it was not bent either; `AbortPay` was there before any code. The log's reasons I checked hold up: PAY-11's path was wrong (PAYING's own guard runs), the catalog's search oracle really did forbid every first send, and PAY-08's charge had no step landing it. Expected results were not bent to the code.

Weak points:

- `suite-output.txt` line 3 is `expected.lock written`: that run re-locked before comparing, so its "unlogged: none" is empty. The current lock does match; my run without `--lock` agrees.
- The hash (`conformance/main.ts:16-21`) covers scenario bodies only. `toResend`, `Ctx` and the fixture are out, and the fixture decides much of what is expected. Any log line starting with an id exempts that id forever.
- Three tests pin bugs as expected without marking them: `late-in-a-new-PAYING` (one comment), `late-may-not-leave` (none, H4), and `press-pay-while-held`. They will fight the fix.
- `SCENARIOS.md`, "source of truth", still has the old PAY-11 path, PAY-01 answer shape and search oracle.

**Proposal.** Hash helpers and fixture too, compare before any lock, and exempt per hash in the log rather than per id. Mark pinned bugs `pins: F6`. Update the catalog with the log.

### M8. Complexity hides in `Attempt`'s optional fields, not the driver

`round-1/world.ts:11-25`, `round-1/lane.ts:151-165,218,223-236`, `round-1/step.ts:256-269,481-499`. `InFlight` is really four states spelled by `waits.ack`, `waits.capture`, `wire`, `settled`, with `acked`, `cancelled` and `sends` beside them. The 2.7.13 table has 3 columns; the real branching sits in `cancelByHistory`, `disposeInFlight`, `hold` (which deletes the lane when not unknown) and `dispatch`. `idle` and `retryable` skip `TABLE` entirely and emit cell evidence by hand. So "the table as data" is true at the outer level only. Invalid combinations are representable, which is how H3 exists.

**Proposal.** `phase: { t: "waiting", on: "ack" | "capture" } | { t: "wire", gen } | { t: "settled", ending }`, with the table keyed by phase. Do it before `W`, promotion and two more policies multiply it.

### M9. Driver sinks can lose commands; D13 is not built

`round-1/driver.ts:155-166`. `world` is assigned, then `onEvidence` and `onIssue` run, then the commands. A throwing sink skips every command of that step, which is the "lost command" class D6 names. The adapter's `TurnStorm` does throw there (`adapter.ts:72`). **[ran]** an hour in UNSURE throws `TurnStorm` out of `h.do`, so the harness cannot run a legitimate long poll, as RESULTS admits. There is no follow-up bound and no `TurnStorm` issue, and D13 is in section 11's "In" list. The log and frames grow without limit. `driver.ts` also never guards listeners.

**Proposal.** Exec commands before sinks, or guard sinks. Build D13's follow-up bound in the step, count turns per admitted item rather than evidence, and remove the adapter's stop. RESULTS discloses that D13 is the drain budget only, and UNTESTED lists it as owed, but section 11 has it in scope, so round 1 did not finish it.

### M10. Lines: the budget is wrong, not the code

**Is it padded? No.** Without comments and blanks: step 541, world 207, lane 272, reads 45, timers 53, publish 45, persistence 168, driver 180: **1,511** against the 1,632. About 160 of world's 218 lines are types the budget never counted. Fat I could find: the `{ actor, op, key, machine }` argument object built six times, and read-ending classification written twice next to `classify`. Perhaps 40-60 lines. Not padding.

**But the 1,632 is flattering.** Under-runs are unbuilt scope, not savings: publication 52 has no Inspection, reads and timers 114 have no reconcile, driver 196 has no T6 and no module halves. So "driver 12% against the 35% trigger" says nothing yet. Step has A1, P2, P3's parts and P4 still to come, on a flat machine, with no `check()`.

**Honest projection [estimate, one data point, F9's warning applies]:**

| Part | Budget | Stop | Projection |
| --- | --- | --- | --- |
| Step, loop, strata | 1,200 | 1,600 | 1,700-2,200 |
| Lane | 500 | 700 | 550-750 |
| Reads, timers, reconcile | 500 | 700 | 500-700 |
| Incarnations, parking, adoption | 1,000 | 1,400 | 1,300-1,500 |
| Entities | 1,200 | 1,600 | 1,500-1,900 |
| Streams | 900 | 1,200 | 1,100-1,400 |
| Persistence | 400 | 600 | 450-650 |
| Context, resources, cache | 800 | 1,100 | 900-1,100 |
| Publication, Inspection | 500 | 700 | 500-700 |
| Driver | 1,000 | 1,500 | 900-1,300 |
| **Total** | **8,000** | **10,000** | **9,500-12,000** |

So the stop line is likely hit somewhere around rounds 3-4, as section 10 foresaw. Plan on using discussion 9.6's cut rather than treating it as remote. Step is the part to watch: split it (strata, routing, turn) before it passes 1,000.

**Suite:** 2,590 against 700 to 1,000, for one flow. Whole-suite 3,000 cannot hold: expect 8,000-12,000 by round 6. The adapter at 215 is double "about 100", and much of it is faults and replay that should move to the suite. And `Fixture` 511 against 300, flat. Re-budget the suite.

### M11. Harness problems round 2 will hit

`round-1/publish.ts:15` and `round-1/adapter.ts:173`: rows by op name ("one key per operation") and a hard-coded op list break with `Cart` and two keys. D2 cannot be observed because `do` settles. Seven amendments in round one, against an interface called stable. Faults declared but never built: `interruptAt`, `reorderAnswers`, `wake`.

**Proposal.** Settle these as round 2's first edit, and count the edits against section 12's 10% failure line.

---

## Low

- **L1.** `round-1/persistence.ts:37,117`: a lane record whose actor record is missing throws in `onCommit`, so the **boot step aborts** and the world stays empty. [read, not run; outside the fake's reach, since both land together.] Rule 46 wants a fresh incarnation to adopt it. PERSIST-02 will hit it.
- **L2.** `conformance/fixtures/pay.compiled.ts:108-110`: move `AbortPay` to a small cells fixture so Pay stays Pay. Also `IntentRead[1]` there is `[2]` in the real machine, against the header's claim that indices count real alternatives.
- **L3.** `conformance/mutate.ts:190`: writes `.mut-*` into `prototypes/` and leaves them if killed; one process with no memory stop. Copy to the OS temp folder and run one process per mutant under a watchdog, as an 11.9 GB incident argues.
- **L4.** `round-1/world.ts:193`: `boot * 1_000_000 + n` collides after a million ids in a boot, harmless today. `laneOfAttempt` scans all lanes on every completion, and `enqueue` copies the mail; measure at round 2's 1,000 actors.
- **L5.** `StorageScript.holdCaptures` has no user: captures always land instantly and atomically. So crash windows between a capture and its landing are untested, beyond what RESULTS states for actor and lane.
- **L6.** RESULTS line 32 says the search has no script reaching `drop-fence` "at depth 5"; true at every depth, as the alphabet has no such move.

---

## Is the core pure?

**Yes, on what ran.**

- **[ran]** Deep-freezing the world and input before every step and the result after: 35/35, no mutation.
- **[read]** No `Date`, `Math.random` or module-level state in `step`, `lane`, `reads`, `timers`, `persistence`. Effect appears only in `driver.ts` and the fixture. `performance.now` only in the driver.
- `replay` re-executes each boot's log with logged draws and compares commands, sequence and whole world by JSON. It catches randomness (`id-not-from-env`). Limits: it compares evidence and issues not at all, shares closures with the first run, and treats each boot separately, so "across a reload" means the boot input's records are honest.
- Hidden state in closures: only the harness's fault counters, which replay re-arms. Fixture Slots are pure.

**Does the shape hold?** Yes. `pump`, `exec`, `invoke`, `readExit` are small and do what section 5 says. "Does the fence replace all latches" holds on direct paths; under interleaving it is untested (H1). What bends: the seam (H6) and `Attempt` (M8), plus the fault and replay logic in the adapter that a production runtime does not need. That logic is reasonably kept away from the core; faults truly reach it through Slots, a module, the Host and `input`, and I found no test seam in the core. Endings do come from the fake through a fiber. Duplicates re-enter by the driver's own port, so that is not an injected ending in the section 11 sense.

---

## Structure verdict

**Widen in round 2. Do not redesign the step, fence or driver. Do decide items 1-3 first, since each is cheaper before entities than after.**

**What round 2 must decide:**

1. **Module seam** (H6): capability object or effect list; is write-ahead core?
2. **D10** (H5): a rule per input kind.
3. **`Attempt` phases** (M8), before `W` and promotion.
4. **L3's replacement** (M1): cross-checks, plus `flow check` hold reachability.
5. **D14** (M3): silent storage means pending, or refused?
6. **One write or two** (F1), and **timers persist or re-arm** (F3): to S3 with both forms.
7. **`InvalidTurn` on an ending** (F7): keep losing the fact, or redeliver?
8. **Search method** (M2): `stateHash` in the Harness, money oracle, wider alphabet, causal fake. Revises section 11's no-BFS line in form, not spirit.
9. **Suite gate** (H1, H2, M6, M7): second-author mutants, citation needs a mutant, wider lock.
10. **Harness amendments** (M11), D2's observability, per-key rows, op list from the fixture.
11. **D13 for real** (M9): follow-up bound, what counts as a storm, log and frame growth.
12. **Pay's fixes** (H4, F5, F6, M4): change the converted Pay, or keep pinned as findings? Owner's call; machine-design says conversion disagreements are findings.
13. **World representation** (L4): plain copies against 1,000 actors, measured.
14. **Budgets** (M10): reset suite and step; state where 9.6's cut lands.

Items 1-3 and 5 are the ones to ask the owner about first, in a numbered round.

---

## Not checked

- `mutate.ts` was not run (reason above), so 22/22 is unverified by me; I read its edits.
- No Node, browser or real storage.
- `tsc` and `vp lint`, `nub run verify`: not run. RESULTS' figures are untested by me.
- `Persistence.plan` O6 not read: F1 is judged from rule 46 and the restore row. `pay.story.ts` beyond the parts cited; the design's 2.5 beyond steps 1, 2 and 5's text; rules 1-11, 26-37 and 48-72.
- `s1`, `s2`, `s5` spikes and convergence section 8's re-runs.
- Whether a real shop server would accept both void and place (H4) or answer as scripted. The fake decides.
- My mutants are one reader's list, chosen from the rules; none tested `step.ts`'s reachable late-routing branches beyond what the builder's did.
- My projection in M10 is a judgement from one round.
- Skills: review and check-task read and followed in spirit; one reviewer, so no merge step between reviewers.
