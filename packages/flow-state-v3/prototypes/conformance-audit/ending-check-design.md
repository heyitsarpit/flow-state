# Oracle (j), redesigned once: an ending reaches exactly the right recipient

Status: **proposed** (stage K, `convergence-10.md`). Written before reading (j)'s code in `conformance/drive.ts` or `convergence-10.md`'s stages C-J, from the gate reports (`re-audit-round-10.md`, `re-check-round-10c.md` to `10j`), the lies in `conformance/falsify.ts`, the interfaces in `conformance/harness.ts`, `round-10/adapter.ts`, `conformance/fixtures/compiled.ts`, `conformance/reference/model.ts`, and rules 14, 44, 51-54 and 60 of `machine-design.md`. Section 5 was written after reading the old code, to list what this design drops.

## 0. Why one more design

Eight gate re-checks in a row (10c to 10j) failed (j), each one step further: excuses taken at the runtime's word (10c, 10d), counts not destinations (10e), the wrong copy (10e, 10f), the wrong actor (10f), a second run elsewhere (10g), a boot counted but not placed (10h), a boot placed but not state-checked (10i), and a boot state-checked against the runtime's own decode (10j). Each fix closed one dimension of one question, and the next re-check found the same question one dimension over. Under `policy-convergence` that is one root cause, so this design lists every dimension once and answers them with one rule.

### Root causes (what was assumed, and is false)

| # | Assumed | False because | Findings it explains |
|---|---|---|---|
| R1 | A runtime's report about an ending (an evidence kind, a wait, a published state, `at`) can pay for it, or say what was expected | A wrong runtime reports its wrong behaviour consistently. Anything it says is a claim to check, never a payment or an expectation | re-audit H1, 10c H1', 10d H1'' M2'' M3'', 10e A4', 10f M1'''', 10j S1' |
| R2 | Pairing each owed ending with some observation is enough | Pairing in one direction leaves extra runs, and runs paired by event name, unlooked at | 10g H1⁵, the send-stolen pair, 10h `h.boot-dup` |
| R3 | A recipient is named by event, op path or memory value | Two actors or copies can share all three. Only an incarnation identity names one | 10e H1''', 10f H1'''', 10g equal views |
| R4 | A boot can be judged by looser rules | Entities reload many rows with writes in flight. A boot is where endings matter most | 10h H1⁶ T1, 10i S1, 10j S1' |
| R5 | An excuse or an order can be judged at the batch's end, or at the run's time | An excuse holds at the time its cause was due. A dispose that arrives after the boot does not excuse an ending owed at the boot | 10d M1'', 10f decline let-go, 10h credits across batches, 10j boot order |

## 1. Every dimension of "an ending reaches exactly the right recipient"

Each row names the source, and the lie that shows a wrong runtime passing it.

| # | Dimension | Requirement | Source | Lie |
|---|---|---|---|---|
| D1 | Who: actor | The ending runs in the actor that owns the attempt (rule 14), never another live actor of the machine, equal views included | 10f H1'''', 10g item 1 | `e8.wa-unknown`, `e8.wa-failure`, `q1.wa-eq-any`, `q5.send-stolen` |
| D2 | Who: copy | Inside the actor, it runs in the incarnation whose subject path is the lane's (rule 53). What the runtime says of the path (`at`, `binding`) is a claim | 10e H1''', 10f M1'''' | `e2.subject-fan-fail-att`, `e2.subject-fan-att`, `e5.at-intent-fail`, `e5.at-intent-fail-3`, `ref.binding-first-copy` |
| D3 | Who: life | It runs in the owner's current life, or, after a dispose and a new ensure, it is the new life's adopted lane (rule 44). A ghost actor is no recipient | 10d M2'', 10h stale serial | `a1.ghost-like2`, `a1.ghost-save` |
| D4 | Once, not zero | Every owed ending runs once, unless an excuse the suite computes itself holds: owner not alive (suite's own record), not bound (reference on the anchored state) so parked (disk reader names the park), or the lane let go by a cause the suite drove | re-audit H1, 10c H1', 10d H1'' M1'' M3'', 10e M1''', 10f decline let-go | `lie.evidence-only`, `lie.released`, `lie.lane-cell`, `lie.lane-cell-noatt`, `lie.like2nc-released`, `lie.save-released`, `h1.*`, `a2.deliv-*`, `a3.park-*`, `e1.park-keyed*`, `a3p.park-decline`, `a4.refused-*`, `a4p.refused-turn`, `d154.moved-*`, `lie.dispose-start`, `a5.*`, `a6.*`, `g.decline-letgo-other-actor`, `lie.letgo-all-parked-on-cancel` |
| D5 | Once, not twice | No run of a mapped event is left over: a second recipient, or the same one twice, is red | 10g H1⁵ | `q3.dup-other`, `q3.dup-copy`, `h.boot-dup` |
| D6 | Supersede | An attempt said superseded has a newer attempt on its lane under a policy that supersedes; a settled head is never superseded or released | 10c M3' | `lie.settled-superseded`, `lie.serialize-as-latest`, `lie.settled-released` |
| D7 | Reload: who | A restored ending (parked, or a held head's `unknown { Restored }`) reaches the same actor and copy as a live one would | 10h H1⁶ | `h.boot-other`, `h.boot-copy` |
| D8 | Reload: routing state | It runs from the current leaf of its recipient, "whatever the owner" (rule 14, rule 44) | 10i S1 | `h.boot-stale`, `h.boot-state` |
| D9 | Reload: restored state | The recipient's current leaf at a boot is the one its record on disk holds, for the actor and each copy. Not the runtime's decode, not the state its owner sent from | 10j S1' | **`h.restore-at-send`** (new) |
| D10 | Reload: restored memory | A restore-less memory comes back as stored (the runtime's own branch runs) | 10h T1 | `h.restore-absent-lost` (`--part mutants`) |
| D11 | Order where promised | A restored incarnation receives its restored endings before any later event addressed to it (rule 44, rule 54), whether the load is synchronous or not | 10j section 5 (Medium) | **`h.boot-order`** (new), with a new named case |
| D12 | The suite's own causes | A run caused by a suite `send`, a timer the suite advanced, or a follow-up of an observed run pays only its own recipient and event, once; it never pays an ending's run | 10g send-stolen, 10h follow-up and credits | `q5.send-stolen`, `a4p.refused-turn` |
| D13 | Identity | The recipient is named by a serial the suite mints (the Host's decode, the wrapped `initial`), never by memory equality. A run on a view with no serial is red | 10h, 10i D177, 10j D181 | `d180.no-reads`, `d181.own-parse` (loud, not in the table: they are red in 57 and 64 cases at 10j) |

## 2. The rule

> **One ledger, matched both ways, at the cause's time.** For every batch, a boot's included and with no rule of its own, the observed runs of mapped events and the causes due in that batch must match one to one. A cause and its run match only if they have the same recipient incarnation (actor key, life, copy path), the same event, and a node in the recipient's anchored chain. A cause may close with no run only by an excuse the suite computes from its own facts, at the time the cause was due. Anything left over on either side is red.

### The facts it uses (all observed by the harness)

| Fact | Observed how |
|---|---|
| F1 a run | the ear: a guard Slot of an alternative on a mapped event is called. It gives the alternative's node (`alt.at`), the event, and the memory view |
| F2 the recipient | the serial on that view, minted by the suite (`Host.decode` on an actor record, the wrapped `memory.initial`), resolved to actor key, life and copy path |
| F3 the suite's causes | the steps it drove, in order: `send` (actor, event, `to`), `ensure`, `dispose`, `reload`, `advance`, `answer` |
| F4 an attempt's ending | the fake's requests and the answers the suite gave them |
| F5 what is on disk | the bytes the suite owns, read through the declared codec: `heads`, `parked`, and **`leaf` (new)** |
| F6 what the compiled machine allows | the reference model: `binds`, `copies`, `moveLetsGo`, `cancelsOn`, `mappedEvents`, `chain` |

### The anchored chain (D8, D9)

A recipient's expected state is never what the runtime says it is:

- **At a boot**, before any run: for each actor and copy that has a record on disk, the leaf `port.disk.leaf(entries, actorKey, path)` reads from the suite's bytes. The first published state of each must equal it; a difference is red (`(j) restored in ... but its record holds ...`). Then every restored ending's run is checked against that leaf's chain.
- **After that**, each run's node must be in the chain of the recipient's published leaf at that moment (the live state check). The published leaf moves only by runs the ledger has matched, so between anchors it is a claim checked by every run, not an excuse.

### The cause's time (D4, D11)

- A restored ending is due **at the boot**, before any input the suite drove after the reload began (rule 44, "before any external event"). An excuse for it ("owner not alive") is judged at the boot. A `dispose` that the suite drove while the load hung does not excuse it.
- A run of a suite `send` to an incarnation with restored endings still owed is red while any of them is unmatched (`(j) a driven event ran before the restored endings`).

## 3. Lies, one per dimension

Red by (j) with `--no-output`, in `falsify --part lies` (D10 in `--part mutants`). Counts are filled in by the build (section 6).

| Dimension | Lie | Named check | Status |
|---|---|---|---|
| D1 | `e8.wa-unknown`, `e8.wa-failure`, `q1.wa-eq-any`, `q5.send-stolen` | `(j) delivered to the wrong recipient` | existing |
| D2 | `e2.subject-fan-fail-att`, `e2.subject-fan-att`, `e5.at-intent-fail`, `e5.at-intent-fail-3`; `ref.binding-first-copy` | the same; `(ref) binding with subject` | existing |
| D3 | `a1.ghost-like2`, `a1.ghost-save` | (j) | existing |
| D4 | the 30 excuse lies listed in row D4 | (j) | existing |
| D5 | `q3.dup-other`, `q3.dup-copy`, `h.boot-dup` | `(j) a handler run nothing accounts for` | existing |
| D6 | `lie.settled-superseded`, `lie.serialize-as-latest`, `lie.settled-released` | (j), `(j) superseded`, a named oracle | existing |
| D7 | `h.boot-other`, `h.boot-copy` | `(j) delivered to the wrong recipient` | existing |
| D8 | `h.boot-stale`, `h.boot-state` | `a state its recipient` | existing |
| D9 | `h.restore-at-send` | `(j) restored in` | **new** |
| D10 | `h.restore-absent-lost` | a named oracle (`--part mutants`) | existing |
| D11 | `h.boot-order` (an input that waited on a slow `storage.load` steps before the restored endings) | `(j) a driven event ran before the restored endings`, or the boot's excuse at the cause's time | **new**, with case R10-BOOT-ORDER |
| D12 | `q5.send-stolen`, `a4p.refused-turn` | (j) | existing |

## 4. Out of scope: stated limits

| Limit | Named case that would pass | Why it stays |
|---|---|---|
| L1 The codec is the format's declaration (D142). A runtime whose `disk.leaf` reader and whose restore agree on the same wrong leaf passes D9 | A runtime that stores the asking node with each attempt and decodes the actor's leaf from it, in both places | The suite owns the bytes, not their meaning. Without a codec it would pin one format (re-audit M2). It takes two coordinated lies, one in the Port's declared contract |
| L2 Between anchors, the published leaf is the expectation for the next run | A runtime that, after a live turn, publishes and routes by the wrong target of the alternative it ran | The suite would need to step the leaf through guards and tokens it cannot see (stage J's reason against A). Each run's node is still checked, and hand `state:` asserts cover targets |
| L3 Order among restored endings of one incarnation (parked in saved order, then held heads in lane creation order) is not checked; only restored before driven | Two parked endings of one lane delivered in reverse | No case has two parked endings on one lane at a reload with handlers that tell them apart |
| L4 Order across actors is not promised (owed rule 4) and not checked | Actor B's restored ending before actor A's | Not a promise of the design |
| L5 A run with no guard on a mapped event is not observed (allowance A2, 143 at 10j) | An ending delivered to an alternative with no guard in the wrong actor | Observing it needs a probe in the compiled data on every alternative; the delivery is still counted by `delivered` and checked by its effect in hand cases |
| L6 A serial moved by a spread of a nested restored object (10j, Low) | `patch: ({ memory }) => ({ ...memory.extra })` | Resolved by where the scan finds it; not a wrong pass alone |
| L7 A copy's binding at a boot is judged when its restored ending runs, not at the boot. Only a definition's op is "bound at the boot" | A copy's restored ending parked after a waiting input removed the copy | A lost `resetOn` reset legitimately runs before restored endings (rule 1) and can unplace them, so the boot's own state does not decide a copy's binding |
| L8 Timer and follow-up credits are per actor and live until the kill (10h) | A timer's later firing pays a wrong run of the same event in that actor | A credit per firing needs the timer's identity, which only the runtime holds |
| L9 D11's order is seen at the ear, so only for a send of an event some op maps; a send of any other event is ordered by what its run does next | A runtime that runs a waiting `Review` before the restored `Unsure` | R10-BOOT-ORDER still sees it by its state and memory asserts (a in REVIEW hears `Unsure` there); a guard on every alternative would close it, at A2's cost (L5) |

## 5. What this design drops, against the old (j) (read after sections 1-4)

The old (j) (`drive.ts`, stages C-J) already matches observed runs to causes in both directions, by serial, with conservation (stage H) and the live state check (stage J). The redesign keeps that matching as the rule's core and changes three things. Nothing below was a separate oracle; each was a boot-specific path or count.

| Dropped or changed | Why |
|---|---|
| **Dropped:** the `booting` flag, `Ear.boot`, `recipients.atBoot` ("at a boot, placed") and the "a booting view" / "at a boot" wording | A boot has no rule of its own (rule's first clause). Its runs were already judged as any other's; the flag only counted them and changed messages |
| **Changed:** row 2 of stage D's inventory (`inst.state` before and after each batch, "Observed") | It is the runtime's word. It is now a claim anchored at the boot to the record on disk (`disk.leaves`) and checked by every run's node after that (D9). The RECIPIENTS line says `restored states checked against their record` in place of `at a boot, placed` |
| **Changed:** `lifeOver` for a restored ending | Judged at the reload (`lifeAtReload`), not at the run (D11). A restored ending whose owner was live at the boot is owed to it, whatever input the suite drove while the load hung |
| **Added:** the `parked` check for a restored ending of a definition's op whose owner was live at the boot and is gone at the park | The owner went before its restored endings: an input stepped ahead of them (rule 44) |
| **Added:** a send's run while its actor's restored endings are still owed is red | The same order, seen from the ear (D11) |
| **Added:** `quiet().loading` | Before a slow load answers, what was in flight is on disk only; `checkMints` waits for the boot instead of calling it vanished (R10-BOOT-ORDER's first reload) |

Kept as they were, because the rule needs them and they hold: the ear and serials (F1, F2), credits for the suite's sends, timers and follow-ups (D12, with L8), the reference's excuses (D4), the supersede check (D6), `bootOwed` (parked on disk, heard at the boot).
