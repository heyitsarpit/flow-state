# Oracle (j), redesigned once: an ending reaches exactly the right recipient

Status: **proposed**. Stage K's design, revised once at stage L (`convergence-10.md`) from all of `review-ending-check.md`'s findings together (policy-convergence step 8). The "Revision" section at the end says what changed and why. After this, what is left is a stated limit with a named case (section 4). Stage K wrote sections 0-4 before reading (j)'s old code, from the gate reports (`re-audit-round-10.md`, `re-check-round-10c.md` to `10j`), the lies in `conformance/falsify.ts`, the interfaces (`conformance/harness.ts`, `round-10/adapter.ts`, `conformance/fixtures/compiled.ts`, `conformance/reference/model.ts`), and rules 13-15, 44, 51-54 and 60 of `machine-design.md`. Section 5 was written after reading the old code.

## 0. Why one more design

Eight gate re-checks in a row (10c to 10j) failed (j), each one step further: excuses taken at the runtime's word (10c, 10d), counts not destinations (10e), the wrong copy (10e, 10f), the wrong actor (10f), a second run elsewhere (10g), a boot counted but not placed (10h), a boot placed but not state-checked (10i), and a boot state-checked against the runtime's own decode (10j). Each fix closed one dimension of one question, and the next re-check found the same question one dimension over. Under `policy-convergence` that is one root cause. So this design lists every dimension once and answers them with one rule. The stage K review found a new class (R6, R7), not a step further along a listed dimension. It is answered here once.

### Root causes (what was assumed, and is false)

| # | Assumed | False because | Findings it explains |
|---|---|---|---|
| R1 | A runtime's report about an ending (an evidence kind, a wait, a published state, `at`) can pay for it, or say what was expected | A wrong runtime reports its wrong behaviour consistently. Anything it says is a claim to check, never a payment or an expectation | re-audit H1, 10c H1', 10d H1'' M2'' M3'', 10e A4', 10f M1'''', 10j S1' |
| R2 | Pairing each owed ending with some observation is enough | Pairing in one direction leaves extra runs, and runs paired by event name go unexamined | 10g H1⁵, the send-stolen pair, 10h `h.boot-dup` |
| R3 | A recipient is named by event, op path or memory value | Two actors or copies can share all three. Only an incarnation identity names one | 10e H1''', 10f H1'''', 10g equal views |
| R4 | A boot can be judged by looser rules | Entities reload many rows with writes in flight. A boot is where endings matter most | 10h H1⁶ T1, 10i S1, 10j S1' |
| R5 | An excuse or an order can be judged at the batch's end, or at the run's time | An excuse holds at the time its cause was due. A dispose that arrives after the boot does not excuse an ending owed at the boot | 10d M1'', 10f decline let-go, 10h credits across batches, 10j boot order |
| R6 | What the runtime leaves out (no publish, no `ending`, no `boot`, no `leaves` answer, an `Unhandled`) is neutral | Silence is a report too. A wrong runtime that drops a row, skips a held head's ending or never says `boot` turns the checks off by saying nothing | review H1, H2, H3, H7, M1, M2, M8 |
| R7 | A cause names its recipient, and that is enough | A cause owes a recipient, an **event** (rule 13's mapping of its ending), a **start node** (rule 14), an **order** (rule 44) and a **count across boots** (rule 17) | review H4, H5, H6, M3, M4, M6, M7, L1 |

## 1. Every dimension of "an ending reaches exactly the right recipient"

Each row names the source and the lie that shows a wrong runtime passing it. Rows D14-D18 and the changes to D3, D5 and D11 are from the review.

| # | Dimension | Requirement | Source | Lie |
|---|---|---|---|---|
| D1 | Who: actor | The ending runs in the actor that owns the attempt (rule 14), never another live actor of the machine, equal views included | 10f H1'''', 10g item 1 | `e8.wa-unknown`, `e8.wa-failure`, `q1.wa-eq-any`, `q5.send-stolen` |
| D2 | Who: copy | Inside the actor, it runs in the incarnation whose subject path is the lane's (rule 53). What the runtime says of the path (`at`, `binding`) is a claim | 10e H1''', 10f M1'''' | `e2.subject-fan-fail-att`, `e2.subject-fan-att`, `e5.at-intent-fail`, `e5.at-intent-fail-3`, `ref.binding-first-copy` |
| D3 | Who: life | It runs in the owner's current life, or, after a dispose and a new ensure, it is the new life's adopted lane (rule 44). A ghost actor is no recipient: no run, and no publishing, in an actor the suite disposed and has not ensured since | 10d M2'', 10h stale serial, review H5 | `a1.ghost-like2`, `a1.ghost-save`, **`k.ghost-life`** |
| D4 | Once, not zero | Every owed ending runs once, unless an excuse the suite computes itself holds: owner not alive (**the suite's own record of ensures, disposes and records on disk**), not bound (reference on the anchored state) so parked, or the lane let go by a cause the suite drove. A delivery no run answered is red when the recipient's state handles the event with an alternative no token gates | re-audit H1, 10c H1', 10d H1'' M1'' M3'', 10e M1''', 10f decline let-go, review H3, H7 | the 30 excuse lies of stage K, **`k.vanish-live`**, **`k.claim-unhandled`** |
| D5 | Once, not twice | No run of a mapped event is left over. **Across boots too:** an ending a run took is not restored again (rule 17), and with every write landed nothing is parked on disk that the ledger does not owe | 10g H1⁵, review M6 | `q3.dup-other`, `q3.dup-copy`, `h.boot-dup`, **`k.parked-every-boot-silent`** |
| D6 | Supersede | An attempt said superseded has a newer attempt on its lane under a policy that supersedes; a settled head is never superseded or released; **a write the fake saw sent is never superseded** (2.7.13 item 1) | 10c M3', review L1 | `lie.settled-superseded`, `lie.serialize-as-latest`, `lie.settled-released`, **`k.supersede-head`** |
| D7 | Reload: who | A restored ending reaches the same actor and copy as a live one would | 10h H1⁶ | `h.boot-other`, `h.boot-copy` |
| D8 | Reload: routing state | It runs from the current leaf of its recipient (rule 14, rule 44) | 10i S1 | `h.boot-stale`, `h.boot-state` |
| D9 | Reload: restored state | The recipient's leaf at a boot is the one its record on disk holds, for the actor and each copy, checked **before the first run in it**, whenever the runtime says `boot` | 10j S1', review M1 | `h.restore-at-send`, **`k.ev-late+at-send`** |
| D10 | Reload: restored memory | A restore-less memory comes back as stored | 10h T1 | `h.restore-absent-lost` (`--part mutants`) |
| D11 | Order where promised | A restored incarnation receives its restored endings before any later event addressed to it (rule 44, rule 54): **for every op, a copy's included**; per incarnation; and an actor with restored endings owed does not move but by their runs. **A lane's parked endings run in their saved order** | 10j section 5, review H4, M4, M7, L6 | `h.boot-order`, **`k.send-ahead`**, **`k.parked-reversed`** |
| D12 | The suite's own causes | A run caused by a suite `send`, a timer or a follow-up pays only its own recipient and event, once; it never pays an ending's run. **No schedule sends an event an op maps** (rule 47, asserted at `start`) | 10g send-stolen, 10h credits, review L5 | `q5.send-stolen`, `a4p.refused-turn` |
| D13 | Identity | The recipient is named by a serial the suite mints, never by memory equality; **life is part of it** (D3) | 10h, 10i D177, 10j D181, review H5 | `d180.no-reads`, `d181.own-parse` (loud) |
| **D14** | **What: the event** | The run's event is the compiled mapping of this ending's channel and reason (rule 13), for an attempt or a decline. A restored head ends `unknown { Restored }`, restored queued work `NotSent { Restored }` (2.7.13) | review M3 | **`k.restored-as-success`**, **`k.failure-as-success`** |
| **D15** | **Where in the recipient: the start node** | Current (every `Restored`, and an adopted lane): the first alternative tried is at the deepest node up from the active leaf that handles the event, past only token-gated ones. Late: from the owner's nearest ancestor alive since the ask, or above it. A late turn does not leave a state that owns another pending call (rule 15) | review H6 | **`k.late-as-current`**, **`k.restored-from-root`** |
| **D16** | **Existence** | An actor the suite left alive with a record on disk is restored; the codec reads a leaf for it (no answer is red); every live copy is in both the record and what the runtime publishes; an actor the suite never disposed does not stop publishing. A quarantine excuses only for a cause the suite drove (a release, bytes it edited, a compiled restore it saw throw) | review H1, H3 | **`k.no-leaves+at-send`**, **`k.drop-row`**, **`k.drop-copy`**, **`k.vanish-live`** |
| **D17** | **Owed from the disk** | What a boot owes is read from the bytes: every head and every parked ending on disk, when the boot was given them, has an ending said at that boot. "Loading" is the fake's fact; a load answered with no `boot` evidence is red | review H2, M2 | **`k.held-silent`**, **`k.no-boot-ev+at-send`**, **`k.no-boot-ev+boot-order`** |
| **D18** | **Streams** | A stream's delivery runs in an incarnation that opened a session of that stream, from the active leaf | review M5 | limit L10: the review's `k.stream-other` lands in an actor that streams too |

## 2. The rule

> **One ledger, matched both ways, at the cause's time, from the suite's own facts.** For every batch, a boot's included and with no rule of its own, the observed runs of mapped events and the causes due in that batch must match one to one. A cause and its run match only if they have the same recipient incarnation (actor key, life, copy path), the cause's own **event** (rule 13), and a **start node** rule 14 gives it in the recipient's anchored chain. What is owed, and whether a recipient is alive, comes from the suite's own facts: its steps, the bytes it owns read through the codec, the compiled data and the answers it gave. A cause may close with no run only by an excuse computed from those facts, at the time the cause was due. Anything left over on either side is red, and so is any silence where those facts expect an answer.

### The facts it uses (all observed by the harness)

| Fact | Observed how |
|---|---|
| F1 a run | the ear: a guard Slot of an alternative on a mapped event (or a stream's) is called. It gives the alternative's node, the event, the memory view, and the recipient's published leaf at that moment |
| F2 the recipient | the serial on that view, minted by the suite (`Host.decode` on an actor record, the wrapped `memory.initial`), resolved to actor key, life and copy path |
| F3 the suite's causes | the steps it drove, in order: `send`, `ensure`, `dispose`, `reload`, `advance`, `answer`, `storage` (the load answered or failed) |
| F4 an attempt's owner | the suite's wrap of each commit and lookup input Slot: the node the alternative's transition names, in the asking incarnation (rule 14) |
| F5 what is on disk | the bytes the suite owns, copied, read through the declared codec: `kind`, `scope`, `heads`, `parked` (with its lane, in saved order), `leaves` |
| F6 what the compiled machine allows | the reference model and the compiled data: `binds`, `copies`, `moveLetsGo`, `cancelsOn`, `mappedEvents`, outcomes, parents, tokens, activities |
| F7 who is alive | the suite's own record: ensured and not disposed; at a reload, kept only with an actor record on disk |

The runtime's reports are claims. An `ending` says what the ending is (the channel, reason), and the restore table and rule 13 check it. `delivered`, `parked` and the waits name what happened, and the ledger checks them. A missing report is red where F3-F7 expect one.

### The anchored chain (D8, D9, D15)

- **At a boot that was given the records**, before the first run in it, at its `boot` evidence, or at the end of the suite's step, whichever comes first: each alive actor with a record must publish the leaf `disk.leaves` reads, and so must every live copy. Then every restored run is checked against that chain.
- **After that**, each run's node must be in the chain of the recipient's published leaf at that moment, and must be where rule 14 starts it.

### The cause's time (D4, D11)

- A restored ending is due **at the reload**, before any input the suite drove after it (rule 44). "Life over" is read from the lives at the reload. A park after the owner was disposed since, or a run of a suite send in the same incarnation, or any move of the actor while it is owed, is red.
- An owner node's activation is alive while the node stays in the incarnation's published chain at every batch end since the ask (D15's "late").

## 3. Lies, one per dimension

All are red by (j) with `--no-output`, in `falsify --part lies` (D10 in `--part mutants`). Counts are failing cases, those with the mark first, at `c93813f1` (section 6).

| Dimension | Lie | Named check | Status |
|---|---|---|---|
| D1-D13 | stage K's 56 lies | as listed in section 1 | existing |
| D3 | `k.ghost-life` | `(j) ... a ghost life` | review |
| D4 | `k.vanish-live`, `k.claim-unhandled` | `(j) ... stopped publishing`; `(j) delivered, and no handler ran` | review |
| D5 | `k.parked-every-boot-silent` | `(rule 17)` | review |
| D6 | `k.supersede-head` | `(j) superseded after it was sent` | review |
| D9 | `k.ev-late+at-send` | `(j) restored in` | review |
| D11 | `k.send-ahead`, `k.parked-reversed`; `h.boot-order` now also in FRAG-24's slow-load variant | `moved before its restored endings`; `(j) parked endings out of their saved order` | review |
| D14 | `k.restored-as-success`, `k.failure-as-success` | `(j) delivered` (as the wrong event, or with no handler run) | review |
| D15 | `k.late-as-current`, `k.restored-from-root` | `rule 14 starts it`, `(rule 15)` | review |
| D16 | `k.no-leaves+at-send`, `k.drop-row`, `k.drop-copy` | `(j) the codec reads no leaf`, `(j) not restored`, `(j) a copy on disk was not restored` | review |
| D17 | `k.held-silent`, `k.no-boot-ev+at-send`, `k.no-boot-ev+boot-order` | `(j) on disk at the reload, and the boot said no ending`, `(j) the load was answered, and the runtime said no boot` | review |

## 4. Out of scope: stated limits

Each limit names a case that would pass, and why it stays.

| Limit | Named case that would pass | Why it stays |
|---|---|---|
| L1 The codec is the format's declaration (D142). A Port whose `leaves` reader and whose restore share one wrong decode passes D9 | A runtime that stores the asking node with each attempt and decodes the actor's leaf from it, in both its restore and its codec | The suite owns the bytes, not their meaning. The Port contract now says `leaves` must not share restore's decode (`harness.ts`). One legal "no answer" no longer turns D9 off (D16) |
| L2 Between anchors, the published leaf is the expectation for the next run; a turn's target is not derived | A runtime that, after a live turn, publishes and routes by the wrong target of the alternative it ran | Deriving the target needs the guards and tokens the reference does not run. Each run's node and start are still checked (D15). A move with no matched run is red while restored endings are owed (D11) |
| L3 Order across actors is not promised (owed rule 4) and not checked | Actor B's restored ending before actor A's | Not a promise of the design |
| L4 A delivery that no guard can see stays allowance A2: an event the recipient's state handles only with token-gated alternatives, or does not handle (143 at `c93813f1`) | A delivery to a state whose every alternative on the event has a token, run nowhere | A token's verdict is the runtime's to evaluate. A delivery to a state with a token-free alternative is red (D4) |
| L5 A serial moved by a spread of a nested restored object | `patch: ({ memory }) => ({ ...memory.extra })` | Resolved by where the scan finds it; not a wrong pass alone |
| L6 A copy's binding at a boot is judged when its restored ending runs | A copy's restored ending parked because a lost reset (rule 1) unplaced it, while the actor stayed | A lost reset legitimately runs first. The actor's own dispose is no longer covered by this limit (D11) |
| L7 "Late" is sampled at batch ends. A leave and re-entry of the owner state inside one batch looks current | A follow-up that leaves the owner state and comes back in the same step | The suite reads the published chain between steps only. The start node and rule 15 are checked where the owner is known: 6,288 runs at `c93813f1`. An ask in a placement's callback, or a resend by a retry, has no owner the suite saw, so it is not checked |
| L8 Rule 15's "or an active subroutine" is not checked; only "a state that owns another pending call" | A late turn that leaves a state with an active subroutine and no pending call | The subroutine's activity is the runtime's. `k.late-as-current` is red in 5 of 6 without it; REV5-S's hand assert sees the sixth |
| L9 The live channel of an ending is its `ending` evidence's word; only the restore table checks it at a boot | A runtime that says `success` for an attempt the fake answered with a failure, and runs it as success | The commit is user code: its Effect turns the fake's answer into the channel (for example `unknownWhenLost`). Deriving the channel means running the commit, which the runtime does |
| L10 A stream delivery is placed only "in an incarnation that opened a session of that stream" | REV6-H4/other-machines-keep-streaming under `k.stream-other`: a's frame runs in b, which streams too | Which session a frame reaches is the fake's newest open connection, and the suite cannot see which session opened which connection without a hook in the stream |
| L11 A frozen copy's restored leaf is not anchored, and a thaw is not an anchor | A frozen copy restored in its parked ending's asking node, then thawed | `leaves` skips frozen copies and the runtime publishes none; no case reaches the shape (the review's `k.frozen-at-send` is a no-op) |
| L12 Identity is (actor, life, path): a copy removed and re-added at one path is one recipient | A lookup's ending delivered to the new copy at its old path (`k.read-to-new-inc`) | Its trigger fires in no case (`probe.read-orphan`) |
| L13 A boot with no records, after the runtime gave up on a slow load (O5's own bound) or a failed load, owes nothing | A runtime that boots empty early, before its bound, with a `StorageFailure` | The bound is the runtime's. With the fake's answer the suite sees an empty boot, not why it was early |

## 5. What this design drops, against the old (j)

Stage K (read after sections 1-4 were written):

| Dropped or changed | Why |
|---|---|
| **Dropped:** the `booting` flag, `Ear.boot`, `recipients.atBoot` and the boot-only wording | A boot has no rule of its own |
| **Changed:** row 2 of stage D's inventory (`inst.state`, "Observed") | It is the runtime's word, anchored at the boot to the record on disk |
| **Changed:** `lifeOver` for a restored ending | Judged at the reload |
| **Added:** the D11 park and send checks; `quiet().loading` | The order of rule 44 |

Stage L (the revision):

| Dropped or replaced | By |
|---|---|
| `lifeOver`'s `publishedNow(actor) === undefined` ("gone from what it publishes") | `ensured`: the suite's own record (D16). A drop that the suite did not cause is red, never an excuse |
| `due` built from the boot's `ending` and `unparked` evidence; its `bound` field (definition ops only) | `due` from `disk.heads` and `disk.parked` (with W from the evidence, owed only), and a park red for every op once the owner's life changed since the reload |
| `anchor()` at the `boot` evidence, skipping actors the codec does not answer for | `anchorOnce()` at the first run, the boot evidence or the step's end; no answer, a missing actor or copy, or an extra copy is red |
| `quiet().loading` from `!bootSeen` | `fake.loadPending`; the boot's anchor runs off the fake's `loadAnswered` |
| `ledgerOff` for a tear or a corrupted record | `offActors`: only the actors whose bytes were edited or torn |
| any event the op maps as "the same event" | `eventOf`: rule 13's mapping of the ending said |
| the batch's `Unhandled`/`turn` paying any unobserved delivery | the same, only where no token-free alternative handles the event (D4, L4) |
| the D11 send check per actor | per incarnation (rule 54) |
| RECIPIENTS printed only | held to `expected-recipients.txt` under the lock (review M8) |
| the codec handed the suite's live map | a copy (review L4) |

## Revision (stage L): what changed and why

The review of stage K (`review-ending-check.md`) found seven Highs and nine Mediums. They come from two root causes the design had not named: R6 (the runtime's silence counted as neutral) and R7 (a cause named its recipient and nothing else it owes). The revision takes them all together. It does not patch the trace of each finding:

1. **Every expectation from the suite's own facts (R6).** Who is alive (F7), what a boot owes (F5's heads and parked endings), whether the boot was given its records (the fake's load), and when to anchor (the first run) are all the suite's. A runtime that says nothing where those facts expect an answer is red: no `leaves` answer, no `ending` for a head on disk, no `boot` after a load the suite answered, an actor or copy not restored, an actor that stops publishing. That closes H1, H2, H3, M1, M2 and, with H7, the `Unhandled` that paid for a run that never happened.
2. **A cause names everything it owes (R7).** The event (D14), the start node and rule 15 (D15), the order (D11: every op, per incarnation, no move while owed, saved parked order), the count across boots (D5), and life as identity (D3). That closes H4, H5, H6, M3, M4, M6, M7, L1 and L6.
3. **Scope and locks.** An edited or torn record excuses only its own actor (M9). The coverage counts are under the lock (M8). The codec reads a copy (L4). Rule 47 is asserted, which makes the timer-credit limit vacuous (L5). The Port contract states that `leaves` must not share restore's decode (L7).

What did not close, each as a stated limit in section 4: L10 (streams, M5) has a reason that holds, since a frame's session is invisible without a hook. The late half of H6 is closed by sampling the owner's presence (L7), and rule 15 in part (L8). The live channel stays the runtime's word (L9), because the commit, which is user code, decides it. The review's L2 and L3 are limits L11 and L12. The old L3 (order among one incarnation's restored endings) is now checked. The old L8 is now an assertion. The old L9 is mostly closed by D11's "no move while owed".

This is the single revision. There is no further re-check cycle (coordinator, stage L). What is above is the boundary.

## 6. Counts at `c93813f1`

Suite 742/742 with output and catalog at round 10, stale lock 0. `RECIPIENTS observed 45650; ambiguous 0; with no copy recorded 0; unplaceable 0; restored states checked against their record 1074; one serial in two places 0; unobserved (A2) 143; paid by sends 175; left over 0; start node checked 6288; stream deliveries placed 180`, now locked. 5 s gate 30 failed, 30 expected. The review's lies (`--no-output`, failing cases with the mark / all failing cases): `k.no-leaves+at-send` 107/107; `k.held-silent` 8/8; `k.drop-row` 62/68; `k.drop-copy` 9/9; `k.vanish-live` 80/85; `k.ghost-life` 9/9; `k.late-as-current` 5/6; `k.restored-from-root` 13/15; `k.claim-unhandled` 49/56; `k.ev-late+at-send` 17/17; `k.no-boot-ev+at-send` 149/152; `k.no-boot-ev+boot-order` 149/152; `k.restored-as-success` 57/60; `k.failure-as-success` 90/96 (the mark `(j) delivered`); `k.send-ahead` 1/2; `k.parked-every-boot-silent` 24/25; `k.parked-reversed` 1/1; `k.supersede-head` 11/13; `h.boot-order` 2/2. The gate runs of every part are in `round-10/STATUS.md`.
