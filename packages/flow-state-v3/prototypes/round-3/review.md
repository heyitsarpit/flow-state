# Round 3: independent review

Status: advice to the coordinator. Everything here is proposed. Reviewer: Opus, did not build round 3. Revision: `3f869003` on `flow-rewrite`. Nothing in the prototype was changed; experiments ran from the OS temp folder or on scratch copies, under `conformance/watch.ts`, one process at a time, peak 295 MB.

**Verdict.** The lane, the fence, `Phase`, D3's queue and purity hold: no search or probe of mine broke one-Attempt-per-record, lost a send's completion, or found a mutation in the step. The round's other two claims do not hold as written. **D47 is half right**: a stale read still overwrites a confirmed write, silently, and a success it refuses to believe clears the mark and can leave the screen wrong for good. **Fragments run on the shapes the fixtures chose, not on the real ones**: a `.each` key with `:` loses its copy on every turn, a subroutine's own exit runs `whenAbandoned` (real Checkout and Resolve say "not on an exit"), and round 2's H2 is back under new names (a release that removes a state, or one odd list item, kills the Runtime). H1-H6 are small fixes, hours each; H7 is the suite. Do not start streams yet: fix these, then settle the seam gaps in M8. Fragments' shape should stay; D24's cut should not be decided by a 56-line margin.

Evidence marks: **[ran]** I ran it, **[read]** I read the code or text, **[estimate]**.

## Counts

| Item                                            | RESULTS says                                  | I got                                                                 |                                                                |
| ----------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| Scenario cases                                  | 234/234, under 1 s, 160 MB                    | 234/234, 0.7 s, 161 MB [ran]                                          | reproduced                                                     |
| **Deep-freeze purity, not run by the builder**  | not run                                       | world and inputs frozen around every step: 234/234; SEARCH-FRAG depth 8 and SEARCH-CROSS to 8,000 states, no failure [ran] | **pure on what ran**                                           |
| SEARCH-PAY                                      | depth 8 sum 22,032; depth 9 adds 57,690       | depth 8: 22,032, 39 s, 226 MB [ran]                                   | reproduced exactly                                             |
| SEARCH-PAY on `pay.fixed.ts`                    | depth 8, 10,684 states, 14 classes            | depth 8, 10,720 states, the same 14 [ran]                             | classes reproduced; states moved after `mayHave`, as it warned |
| SEARCH-CROSS                                    | depth 7 complete, 183,350                     | depth 6: 43,877, matches its count to that depth [ran]                | consistent; depth 7 not rerun                                  |
| SEARCH-LIKE                                     | depth 8, 234,168                              | stopped at 60,000 states, depth 6, no failure [ran]                   | consistent; not reproduced to depth 8                          |
| SEARCH-FRAG                                     | depth 10, 18,043                              | depth 10, 18,131 [ran]                                                | consistent                                                     |
| **Fragments × store × reload, 2 copies, mine**  | not run                                       | depth 7 complete, 32,126 states, 19 s, no oracle failed [ran]         | **new, holds**                                                 |
| Budget lines                                    | 4,033; `turn.ts` 1,081 from 312               | 4,033; 1,081, 312 [ran]                                               | reproduced; see M11                                            |
| Core gzip; entities gzip                        | 16.8 KB; 2.6 KB                               | 16,854 bytes; 2,586 bytes; no `startRepair` or `readRecord` in core [ran] | reproduced                                                     |
| "The review's Highs are fixed on what ran"      |                                               | H1, H3, H6 yes. H2, H4 partly: my H3, H4, H1, H2                      | **overstated**                                                 |
| `pay.fixed.ts` "applies them" (convergence-3)   |                                               | file last changed in round 2 (`git log`)                              | **false, M10**                                                 |

**My mutant kill rate: 18/32 raw; 18/30 (60%) with two equivalents removed.** Written from rule text before opening any mutant list, one process each, scenarios then the search. Disclosure: I had read RESULTS and convergence-3 first, so I had seen the ten survivor names there; two of mine overlap them (`r6-abandoned-reads-after`, `r54-reset-after-adoption`), and I left the other eight names out on purpose. Nine survivors are new. The series is 20/31, 26/36, 35/50, 18/30: flat, 60-72%. Survivors in the Tests section.

---

## High

### H1. D47's comparison ties: a stale read overwrites a confirmed write, silently. M3 is half fixed

`cx.pos()` reads `nextId` without moving it (`world.ts:295`). A read's `pos` is taken after its own `nextGen`. A write that lands next applies at that same number, because settling mints nothing before `confirm`. Then `r.changedAt > pos` (`entities.ts:134`, also `:292` for a repair) is false.

**[ran, as-built Issues fixture]** MED-03 tests read, then write. I ran the other order: write on the wire, then the read.

```text
Load, list truth; Toggle liked:true (on the wire); Load (out); like apply (confirmed); list answers its old rows
record: liked false, predicted false, uncertain false      server: liked true      repairs open: 0
```

The screen is wrong, nothing is marked, nothing will repair it. A read overlapping a slow write is ordinary traffic.

**[ran on a copy]** `>` to `>=` in both places: this trace forces a repair and the record reads `liked: true`; 234/234 still pass, so no scenario tells them apart. Implication for the whole system: D47's table says "`filled` and `listen` values are answers too: same comparison". They are not. A frame has no position at which its request started, so the comparison is always false for a frame, and a frame sent before a write lands and arriving after goes backwards the same way. That needs a server version, or T7's rule, and is a round 4 decision.

### H2. A success D47 refuses to believe still clears the mark. One failed repair and the screen is wrong for good

`onEnded` is `removeEntry(clearMarks(confirm(...)))`. `confirm` skips the stale fields and starts a repair; `clearMarks` removes the mark regardless. RESULTS names the extra read as D47's cost and says "the screen shows old data until it answers". It does not cover the repair failing.

**[ran, as-built]**

```text
Toggle true; answer lost; repair truth (not there: liked false, uncertain true); ReconcileLike; like apply (success, server true)
during:  liked false, uncertain false, predicted false      one repair open
repair fails NoResponse; advance 1 hour
after:   liked false, uncertain false; no request, no timer, no issue       server: liked true
```

This is the common retry path (RESULTS: a re-send landing fresh after a repair said "not there" always differs), and it ends with a charged-card class of silence: told success, shows failure, marked clean. The `confirms` throw branch has the same shape [read].

**Proposal.** A mark whose answer was not applied stays until a repair answers. And consider what RESULTS offers the owner: show the answer during that read. A write this client just had confirmed is the best evidence it holds; only a differing newer read should outrank it. Same question as H1, so settle them together.

### H3. Round 2's H2, renamed: an ordinary release, or a record short of a field, is Fatal on every boot

`goodInc` checks `id`, `leaf` is a string, `activations` is an object. The first read of a node then throws in core. Restore is per record for what `JSON.parse` catches and for a removed machine or operation, and for nothing else.

**[ran, Notes fixture, each edited with `corruptStored`, each booted twice]**

| Stored actor or lane record | Boot 1 | Boot 2 |
| --- | --- | --- |
| `root.leaf` names a state this release removed | Fatal | Fatal |
| a kid's `frag` names a fragment this release removed | Fatal | Fatal |
| actor record without `timers` | Fatal | Fatal |
| lane record without `w` | Fatal | Fatal |

The first two are an ordinary deploy, and the likeliest kind. Rule 46 wants the opposite: "a lane whose actor record no longer decodes is adopted by the fresh incarnation". `s-bad-record-reaches-boot` is on RESULTS' survivor list as a test gap; it is a live bug. **Proposal:** validate each record against the current `Compiled` (every leaf, activation and frag resolves) inside restore's per-record path, or wrap each record's restore in a try. On failure quarantine, start fresh, and let the lanes be adopted.

### H4. D46's table says a value core must encode refuses the turn. In fragments it kills the Runtime

`encodable` covers keys, inputs and persisted memory. New fragment code encodes outside `run`: `JSON.stringify(run(p.resetOn, ...))` at `turn.ts:343,754`, `inc.ts:92`; `membership` at `inc.ts:151-156`. Non-persisted machine, no scenario in the suite.

**[ran]** Each is one `send`:

| A user's value | Result |
| --- | --- |
| `.each` list `[null]` with `by` | Fatal |
| `.each` field `5` | Fatal |
| `resetOn` returning a `BigInt`, or a cycle | Fatal |
| A server's success with a `BigInt`, parked on a persisted lane (`encodeLane`) | Fatal |

One odd API value stops every actor in the tab until reload. **Implication:** this is the third time this class has come back (round 1 H5, round 2 H2, here), because "core encodes" is a property of each call site. Rule 9's "Repair, never refuse" should cover a bad list too. **Proposal:** one helper for every user value crossing into core, and a search action that feeds odd values into every machine, so a new call site cannot pass quietly.

### H5. `.each` keys are spliced into strings: a `:` loses the copy on every turn, a `/` loses its schedules

`part = name:key`, read back with `part.split(":")[1]` (`inc.ts:47-48`). `tagsOf` joins a path with `/` and splits it again (`turn.ts:663,667`). Rule 9: "Keys are strings", nothing narrower.

**[ran, Form fixture]**

```text
SetIds ["user:1"]; Changed "typed" into rows:user:1; any other turn
value "seed user:1"  (the typed text is gone);  goneRows ["user","user"]    (control, key "u1": value "typed", goneRows [])
```

`keyOf` gives `user`, which is not in the list, so `applyLists` ends the copy and seeds a new one, each turn, firing `whenAbandoned` with the wrong key. A held write would be parked or released (rule 60) by an unrelated click. **[ran]** A key `a/b` with an `armOn` schedule: never armed, `due: 0`; key `a`: `due: 1`.

Real keys include `user:1`, ISO times and `gid://shop/Product/1`. The fixtures use `r1`, `d1`, `T-1`. **Proposal:** store `key` on the incarnation, compare paths as arrays, never parse a string. Twenty lines. The hash normaliser and `Ev.to`'s `"uploads:r1"` need the same look.

### H6. A subroutine's own exit runs `whenAbandoned`. Real Checkout and Resolve say not to, and the fixture that would show it was flattened

Rule 6: "when an incarnation ends other than by its own exit". `checkout/.../address.subroutine.ts:69`: `whenAbandoned: [callbacks.onDraft...] // not on Done`. `resolve-wizard.subroutine.ts:232`: "Not on an exit." `applyLeaving` has no such test; `endInc` puts every ended incarnation in `w.ended`.

**[ran, a small subroutine of that shape]**

```text
Go; Finish (exit Done, filling targets DONE)    state DONE, drafts ["d"]     expected []
```

So a finished address form hands its draft back and the next entry resumes it. `whenAbandoned.release` (rule 60) goes through the same list, so a release would fire on an exit too [read]. No fixture has `exit` and `whenAbandoned` together: `pay-full` states "no ADDRESS", and that is exactly the cost of the flattening. `FRAG-*` cites rule 6 without reaching it. **Proposal:** record the exiting path in the walk and skip it. Keep ADDRESS in the next fixture.

### H7. Features RESULTS says "run" have no test that can fail, so green says little about fragments

Survivors of my set, all from rule text, none on the second author's list unless marked:

| Mutant | Rule | Why nothing failed |
| --- | --- | --- |
| `r1-thaw-rearms-fresh`: a thaw re-arms at now + 1 s | Rule 1 "keeps its `dueAt`", F12, Countdown's whole point | Only the overdue branch runs |
| `r1-history-ignored`: `.history` goes to the default child | Rule 1 | `history-restores-control-only` runs BANK, Help, CloseHelp, and BANK is the default. **It cannot fail** |
| `r53-frozen-binds`: an ending binds to a frozen incarnation | Rule 53 | No write ends during a freeze |
| `r52-end-keeps-reads`: an ended incarnation's lookup is not interrupted | Rule 52 | Late answer goes to evidence either way; nothing checks the abort |
| `r52-thaw-order`: interrupted lookups not first | Rule 52, rule 54 | One parked ending only |
| `r51-restore-no-recheck`: no reset on restore | Rule 51, rule 58's "a reload that loses a pending reset" | Named in the design's list of walks; absent |
| `r14-late-always-root`: a late ending starts at root, not the nearest ancestor | Rule 14 | Nothing at depth |
| `r60-parked-kept`: parked endings survive a mark | Rule 60 | Nothing parks first |
| `r23-disarm-ignored` | Rule 23 | No fixture uses `disarmOn` |
| `r1-reentry-refreeze` | Rule 1 | Second author found the bug by reading; no scenario was added |
| `r6-abandoned-reads-after`, `r54-reset-after-adoption` | Rule 6, 54 | Also on his list |

Equivalent, removed: `r15-own-call-blocks` (that clause in `leavesWork` is dead: an admitted ending's Attempt is never a non-held head); `r32-clears-newer-given` (a newer given mark cannot exist under D3, same reason as the third clause).

Also absent from every fixture: `each.by` and `item` (all real placements with records use `by`), a by-reason `unknown` map (M6), a nested trait with its own schedule below a resumable host (M2), a key that is not a tiny token (H5), a persisted host with entities (mine above is the first). **Proposal:** before more code, a fixture pass that copies the real `AttachmentUpload`, `Comments`' pinned and react paths, `AddressForm`, and a `panels`-style `resumable` + `resetOn` as written. Round 3's own finding, "a green suite here is weak evidence", is right. This says where.

---

## Medium

### M1. D48's replace path: a declined replacement supersedes the head and wedges the lane

`commitOverWaiting` calls `queueBehind` (which can decline) and sets `then: "replace"` regardless. `afterAck` then supersedes the head with `next` undefined.

**[ran, persisted Issues, `queueMax: 1`]** `Toggle true; Toggle false` (start refused, `Overloaded`); `ack`:

```text
endings: NotSent { Overloaded } for the second; the first: Superseded, after its ack; requests for like: 0
row pending:true forever; waits: { kind: "ack", op: "like", key: ... } with no attempt; a later ack is fenced
```

Both intents gone, and a head with no id stays until reload. Default `queueMax` is 64, so the plain reach is rare. `ModuleDisabled` reaches the same line after any module defect [read]. **Proposal:** set `then` only when the queue took it. A search action on `queueMax: 1` would have found it.

### M2. The recursive freeze: right for a live child, wrong for a child already frozen

Named by RESULTS as unverified. Built with a resumable `Pa` holding resumable `Ch` on `Pa`'s node X.

- **[ran] Right:** child armed, host left, no timers while frozen; overdue fires once on return.
- **[ran] Wrong:** child armed; `Pa` goes X to Y (child frozen); host leaves and returns, `Pa` still Y. `freezeInc` overwrites the child's `frozen`, losing its timers, and `thawInc` thaws every frozen kid whatever its node. Back to X, 5 s later: `due: 0`, expected 1.

**Proposal:** a freeze from above stacks on what is there; a thaw checks the child's own node.

### M3. Frozen copies are not reconciled every turn

Rule 9: "frozen copies are still reconciled every turn"; rule 52: a removed frozen copy "has ended". `applyLists` walks `placementsActive` only. **[ran]** A resumable `.each`, host left, key removed: copy still in the view, `gone []`; only on return does it end. Rule 60's mark on a removed copy's upload waits for a return that may never come.

### M4. Past the follow-up bound, adopted and thawed endings are dropped. Round 2's L2 in a new place

`finish` builds one `mail` list of recheck, thaw, adoption and follow-ups, and past `followUps` drops all of it after adoption has already cleared the lane's parked list. **[ran, `followUps: 1`]** parked 1, then 0, copy `saved: 0`, one `InvalidTurn`, and `checkEndings` says "an ending was never delivered". Convergence-3 L2's own sentence: "A lost completion is D6's class". **Proposal:** the bound drops only `send` mail. Reaching it at 64 needs a long chain, hence Medium.

### M5. D50 covers endings only; rule 8 lists timer firings too

**[ran]** A state whose `Due` handler throws once: firing refused, state `WAIT`, timers 0, one `InvalidTurn`. Stays there an hour later. Real shape: `EXPIRED`'s `GiveUp` is the only way out. D50's reason applies word for word. **Proposal:** give `fire` the same one redelivery.

### M6. By-reason `unknown` is untested and the format disagrees with itself

`compiled.ts:118` types it as `Record<string, Mapped>`; `turn.ts:928` tests `"byReason" in u`; no fixture has either. **[ran]** The typed shape: event `undefined`, `Unhandled`, no issue, row `uncertain` with no owner told. With `byReason`: works; a reason not listed gives `UnmappedEnding` and the ending is gone. Real `AttachmentUpload` maps by tag, and its list has no `Abandoned`. D15's new reason (and `NotSent { ModuleDisabled }`, which real handlers map generically) reaches such a list with nothing to catch it. [read for that last link] **Proposal:** one format, a fixture from the real upload, and `flow check`/design text naming the new reason.

### M7. Copies in the view: wrong order, and absent when none

**[ran]** Ids `["a","b"]` then `["b","a"]`: view `a, b`. Rule 9: "in that field's order". With no copies `memory.rows` is `undefined`, so a filling's `memory.rows.map` refuses a turn. Real views iterate. Small, and it is the public shape.

### M8. The seam's paper does not cover the streams table

Walked against T1-T9, S5's Form A and `turn.ts` [read, reasoning; nothing built]. Convergence-3's table is mostly right, and the choice of Form A holds. Missing, in order of cost:

| Gap | Where the table asks | Why the paper fails |
| --- | --- | --- |
| **Members** | T1, T3: `O.x.bookmark`, `O.x.refetch` are step 5 members, on after memory | `applyMembers` knows `commit`, `retry`, `cancel`, `lookup`. No hook takes a member in action order with the turn's rollback. A third hook, not two |
| **Actor and incarnation lifecycle outside a turn** | T9: Disposal, Restore, Freeze; rule 70 | `reconcile` is placed in P7. `startRoot`, `onDisposeActor`, restore and retired rebind are not turns. `dispose(s, cx)` is the Runtime's only. Each needs a call |
| **Where the bookmark lives** | Rule 71: "of the slice's saved record"; T3 "New slice: the partition is new"; frozen slices keep it | `save(s, { actor })` is per actor; the partition is per incarnation and travels with `Inc`. `restored` takes a `WriteRef`. `flush` writes only `touchedActors`, and `Cx` has no way to touch one. Who owns it decides atomicity across a reload, S5's main reason for Form A |
| **`deliver(actor, event, tag)` has no incarnation** | Rule 70: a session belongs to its placement's activation; T9's `resetOn` | Mail must be fenced by incarnation like `fire`, or a reset's old value reaches the new slice. `retract` must reach `follow` too |
| **D50 against T1** | "`InvalidTurn` on a delivery: `end(Defect)`", rule 47: deliveries count as endings | A `failure` delivery is both. Paper silent |
| **`tell` is not enough for `listen`** | T7: `readStart[r]`, `subscribed[r]`, refetch each covered read | Round 3's reads are thin: no registry of answers to refetch. That is cache/resources work first |
| **Module fail-closed** | D46 | A session module's defect: fail closed means no streams; rule 8 means no values lost. Unsaid |

So expect 3-4 hooks and 6-7 capabilities, not 2 and 4. None of this argues against the seam's shape; `ended`, `read`, `waits`, `dispose` are good cuts. Fragments truly needed no hook.

### M9. Oracles: `mayHave`, pins, and a search header that claims more than it does

- **`mayHave`: a correct fix, a little too wide.** "A definite answer to any send decides it" is right for `ok`, and the trace in the log was right to reject the old oracle. A `fail` does not decide: rule 18 says a failed re-send is `StillUnknown` because the first send may still land, and the fake's own `landLate` can do it. **[ran on a copy]** Only non-`fail` answers decide: SEARCH-PAY depth 9 complete, 79,620 states, no S6 failure. So the tighter oracle costs nothing here, and it should be the one used.
- **Pins are narrower in form, not in fact.** `via: /Leave/` or `/Start/` on 4 of 10 pins: any occurrence of that class in a script containing the word. D53's point was to stop new bugs hiding. A pin should name the two or three steps that make the bug.
- **`frag.search.ts` line 2** claims "one request per Attempt, a copy's status never contradicting the fake". Its code has neither. Only `checkClaims`, `checkEndings`, and rule 17. "Memory-free handlers" removes the rest. My crossed search adds S5 and R18 and held; the status check is still unwritten.
- **Rule 44's order [ran]: right.** The fake reversed: 234/234. Reversed and `sort` removed: only SURV-03 fails, correctly. The survivor was the fake's. A shuffled `load` belongs in the fake permanently.

### M10. Pay on `pay.fixed.ts`: not the fix list, mostly one missing guard and one compensation

Convergence-3 line 267 says `pay.fixed.ts` applies P5's half and P6. It does not; the file is round 2's, so its 14 classes measure the old list. Split by alphabet, depth 8 **[ran]**:

| Alphabet | Unpinned |
| --- | --- |
| Full | 14 |
| No same-intent `Start` | 9 |
| No `Start` at all | **1**: `PayRequested Leave ack pay.ok reload` |
| No `Leave` | 2: `Start` on an intent already placed, then Pay |
| Full, `Start` guarded on `pay`, `void`, `place` idle (one token per alternative) | 8, of which 7 descend from that same 1, one is same-intent |

My view: **Pay first, oracle second, fixes third, and the redesign may be smaller than proposed.** 13 of 14 need `Start` while something is live, which is what rule 56's default guard is for, and the real `start` guards only `OrderSummary.O.shipping.idle`. The remaining root is real money: Leave's `void` is lost by a reload (`NotSent { Restored }`, no retry), so a hold is never voided. Same-intent `Start` after an order is the fake: Stripe would refuse, and `void` voids every authorization on an intent. A set of authorizations by intent is only needed if the owner wants `Start` to work during a live charge. Owner's call. The runtime is not implicated.

### M11. Budget accounting: not a cheat, and not evidence either

The split was stated in advance, though convergence-3 states it twice and differently: line 255 "`inc.ts` plus the growth of `turn.ts`", the budget table "with `turn.ts`'s growth over 400" (which would be 544). RESULTS used the first. `turn.ts`'s 769 includes non-fragment fixes (D46's encoding, D50, D48 routing), maybe 100-150 lines. Fragments also live outside both: `step.ts` grew 177 (seeding, `armAll`, `hasResetOn`, retire), `world.ts` 66, plus `durable.goodInc`, `publish.bound`, lane subjects, read incarnations, perhaps 130-170 lines [estimate]. Those roughly cancel: **about 950-1,000 today**, and H5, H6, M2, M3, M7 add 60-120 that are fragments' own. **So fragments cost about 1,050 once fixed, past the stop on a fair count, and that should not matter.** D24's cut (fragments lose operations) would remove what the real Upload, Comments and Autosave are. Decide D24 on merit, in words, and move the row's stop or not as the owner's own act. The first row at 2,168 against 1,800 is only over because it holds the fragment turn; fine.

**My projection against 10,000 [estimate].** RESULTS' list: 8,180-10,830. Add what it omits: robustness and this review's fixes 200-350; fragments' omissions 150-300; SSR and hydration, absent from its list, 200-400; seam beyond paper 80-150. **8,800-12,000, midpoint about 10,400. More likely over than under.** Line hit around round 5, with cache or the entity remainder. So a cut should be chosen before then, not found. Cheapest candidates: public `stalled`, the `cancel`/`allow` families if `latest` and `serialize` serve, `activities` as sugar over reconcile.

**16.8 KB against 14 KB [ran]:** 20% over with about 40% of the projected lines, so about 40-45 KB at 10,000 lines if the ratio holds [estimate]. A step and its table do not tree-shake. The 14 was round 2's target with no stated reason: restate it from a real need, or drop it.

---

## Low

- **L1.** D46's rollback **[ran]: right.** A hook that arms, commands, notes and throws, on `ended` and on `start`, called directly on the step: no command, no timer, no evidence, slice unchanged, disabled. The one leak: `cx.issue` survives. RESULTS' "no test" stays true for the suite; add this one.
- **L2.** Rule 60's `markResend` fix **[ran]: right.** Persisted `serialize` copy: held head, W behind it, retry (capture out), remove the copy, ack: one request only, one `Released`, lane gone, `stored` holds no lane record, claims and endings pass. Held-with-W too. Add as a scenario.
- **L3.** Thaw with a changed `resetOn`. RESULTS says not built. **[ran] It works by accident:** `recheckResets` catches it, so the follow-up resets it and `whenAbandoned` runs. Cost: one published frame of the old subject's memory under the new one. Real `panels` is exactly this shape. Decide whether a thaw checks first.
- **L4.** A read replaces the whole base, a write merges (`entities.ts:266` against `:145`). **[ran]** A row with fewer fields drops the rest. List and detail reads will meet. Design row not checked.
- **L5.** `restore` runs parked then head, per lane; 2.7.13 says all parked, then per lane. Hidden today because a parked-only lane sorts at mint 0. Interleaves only for a lane with both [read].
- **L6.** A firing moved to mail is off disk (`touchedActors`, `flush`) and mail is not persisted, so a crash in that drain loses it (rule 8) [read].
- **L7.** A redelivered ending (D50) is mail only, so a reload loses it after its lane is gone [read]. Narrow.
- **L8.** `startAll`'s no-op `attempt` for a module the machine doesn't use (`hooks.ts:142-150`), `e.path.length === e.host.length + 1` (`turn.ts:547`, always true), `(void a, tx)`. Dead code from the fault module's history.
- **L9.** `onEnsure`'s rollback keeps evidence (`step.ts:303`). A second module's `start` having run is not rolled back when a later one declines (rule 35); one module here, so unreachable until two [read].
- **L10.** Convergence-3 cites Query's scope as "blocks the same way" (`mutationCache.ts:161-173`). `canRun` looks for `status === 'pending'` only: a mutation that ended in error no longer blocks, and nothing there is held for a person. TanStack DB's `KeyScheduler` and Replicache are the fair prior art. D3 has no precedent for an unbounded hold, which should be said.

---

## Design moves, on merit

| Move | View |
| --- | --- |
| **D3, D40, D47, rule 32, D15 as one decision** | **Agreed they are one**, and agreed on A: keep D3 with a visible stall. The mutants and searches again found nothing past the queue, and rule 32's third clause stays unreachable (`r32-clears-newer-given`, same result). Correct the prior-art line (L10). The price is a person who hasn't pressed. It is honest; say so to him as a product cost |
| **D47** | **Keep the idea, fix it (H1, H2).** Its cost is larger than stated: not "one more read" but a confirmed write hidden until that read answers, on the common retry path. My lean: apply a success's own fields, mark until the repair answers. Replaces "base kept" in the table |
| **D15** | Keep, unbound only. 5 min is a guess. It needs a reason in the design's list (M6) |
| **D49 `stalled`** | **Do not make it public yet.** A row field no machine can react to, whose values name internals (`record`, `module`), against "don't leak wiring". Nothing in Checkout or the desk reads it. Keep the evidence and Inspection. D30's point stands. If a view needs it: `pending` with a reason, later |
| **D46 (replaces D27)** | **Keep.** Fail-closed is right, the table is the right artifact. Its promises fail at call sites (H3, H4), which is the build |
| **D50 (replaces D31)** | **Keep, and extend (M5).** Round 2's objection was right. Bound holds |
| **D39 narrowed** | **Keep.** SEARCH-CROSS and my crossed search agree. Safe only while H1 is fixed: a repair overtaken answers stale only if the comparison fires |
| **D48, rule 24 change, rule 29 change** | **Keep**, with M1. A hung disk leaves a stop pending for good, with `stalled` evidence: right trade by the priority order |
| **Rule 44 change (D15's release)** | Fine |
| **D45** | One bit was enough. Right, and well killed |
| **D51** | Good cuts; incomplete (M8) |
| **D52** | **Keep.** One tree, root as an incarnation, working copy per turn is the best thing in the round. Refusal is one assignment. The bugs are in strings (H5) and in code around it, not the shape |
| **D53** | Direction right; finish (M9, M10) |
| **D54** | Right. 10,000 stands until he moves it |

**A sync engine behind the seam: fits by type, not by meaning [read, reasoning; not built].** `prepare`, `start`, `ended`, `read`, `input` have the right names. Three things need decisions before Zero or TanStack DB is tried: (a) rule "one cut": memory, rows and store revision publish together, so an engine holding its own store outside the world (`codebases/db/.../collection/state.ts`) must mirror into the slice, or frames and S11's replay stop meaning anything; (b) two outboxes: lane records resend by Attempt, and Replicache or offline-transactions persist and resend their own (`codebases/mono/packages/replicache/src/pending-mutations.ts`, `db/.../KeyScheduler.ts`), so one must yield, and a persisted engine write means `persisted: false` with a held-less lane, which loses rule 17's restore row; (c) `blocks: false` drops D3, and with it the reason the third clause and contested were cut, so those belong to the engine's own text. Confirmation by txid in the feed (`ended` then `input`, either order) does fit. A one-module spike with a mirrored slice would answer this cheaply, and entity seam stays optional either way.

---

## Round 2's findings, checked

| Finding | State |
| --- | --- |
| H1 restored "never sent" | **Fixed** [ran: `d45-restore-keeps-flag` killed by 5; crossed search clean] |
| H2 poison records, user values | **Partly.** Parse and removed machine/op fixed; H3, H4 here |
| H3 fail open | **Fixed** [ran: mutant killed; L1] |
| H4 replayed response | Fixed for that trace; H1, H2 here are the same cause |
| H5 suite | **Better:** crossed search exists, holds, and I extended it. Fragments still thin (H7) |
| H6 | **Fixed** by `cx.user` [read; HIGH-03 green; mutant by second author killed] |
| M1 | Fixed; M1 here is its new edge |
| M2 | Visible. Same stall by choice |
| M3 | **Half.** H1 |
| M4 | Half, as stated |
| M5 | Fixed for endings; M5 here |
| M6 | On paper; M8 |
| M7 | Fixed [read; MED-07 green] |
| M8 | Fixed by `prepare`'s dry run [read; MED-08 green]. Reader safe (`safely`) |
| M9 | Improved [read] |
| M10 | Oracle re-keyed; fix list not applied (M10) |
| M11 | Fixed: 10,000 used |
| L2 | Moved (M4) |

## Tests sampled against rules

| Test | Judgement |
| --- | --- |
| FRAG-10/history-restores-control-only | **Cannot fail** (H7) |
| FRAG-10/overdue, reload-inside | Hold, real ThreeDS shape. Countdown's `dueAt` not asserted before due |
| FRAG-06, FRAG-20 releases | Hold; my `r60-*` mostly killed. FRAG-20 was added after his number, stated |
| FRAG-11 A, B, A | Holds: real story, killed `r51-seed-no-reset-part` |
| FRAG-15, SEARCH-FRAG | `THIN` mark is honest; header isn't (M9) |
| HIGH-01 to 04b, MED-01 | Hold for what they name. Each is one order of two (H1) |
| PAY-11, PAY-17 | Hold; PAY-17's fault still throws before any effect (L1) |
| CART-02 log line "same final value, one read more" | True there; H2 is the case it doesn't cover |
| FRAG-03, -04, -14, -19, -06/readd "as they run" | Changed to match the runtime on first run. Logged, reasons sound on reading, before green. Not fitted to hide anything, as far as I read |

No hack or faked feature found. Nothing passes because the adapter does the work: it wraps modules for faults and reads through `read`. What the fixtures do is simplify, and the simplifications hide H5, H6, M6: stated in part, not with their consequences. The fake's mint-order `load` did hide a test (M9).

## What round 4 must decide, in order

All proposed. 1-6 before any stream code. Most are hours.

1. **H1, H2:** `>=` or a ticking position; a confirmed write's fields during the repair; a mark until it answers. Owner sees this with D3.
2. **H3, H4:** one encoded-value helper; records validated against `Compiled`; a search action feeding odd values and removed nodes.
3. **H5, H6:** array paths; own exit. Then M1, M2, M3, M4, M5, M7 as a batch.
4. **H7:** fixtures copied from real Upload, Address, Comments, panels, as written. Scenarios per survivor; shuffle the fake's `load`. Reported number stays a new independent author's.
5. **M6:** one format for by-reason maps; `Abandoned` and `ModuleDisabled` in the design.
6. **M8:** on paper again for the seven gaps, above all bookmark ownership and the member hook. Then a thin spike of T1's `connect`/`register`, one value, one `O.x.bookmark`, on this runtime, not S5's, before full streams.
7. **D47 for streams:** frames have no start position. Server version, or T7 alone? Owner.
8. **D49:** public or Inspection. My lean: Inspection.
9. **D24:** on merit. My lean: no cut. **The stop:** his, with M11's number in front of him and a named cut chosen ahead of round 5.
10. **M10:** apply P5's half and P6 to the fixed copy, add `Start`'s idle guard and a durable void, rerun, and then ask whether memory needs a redesign.
11. **Sync engine:** spike or defer. Not before 6.

**Should streams start?** Not yet. Items 1-6 first; after those, yes. The turn and step held, and nothing here says the seam's shape is wrong.

## Not checked

- SEARCH-LIKE past 60,000 states; SEARCH-CROSS depth 7; SEARCH-PAY past depth 9. `cancel`, `allow`, keyed schedules, `activities`, `check()`, `flow check`: not built.
- S4, a real `fetch`, IndexedDB, Node, Safari, phone: not run. `tsc`, `vp lint` (RESULTS' 612 errors), `nub run verify`: not run.
- The second author's mutant list not rerun; I read names and results afterwards only. Mine are one reader's 32.
- Streams and the sync engine: reasoning only. No paper hook was built.
- Desk: read `upload.trait`, part of `comments.trait`, `panels.machine`, the end of `resolve-wizard`; not `assign-toggle`, `feed`, roster, stories. Checkout: `three-ds`, `countdown`, `order-summary`, `pay.machine`'s start; not its tests beyond grep.
- M1, M4 use small bounds to reach their lines. H3's records were edited by hand to model a release. H1's old rows are hand-written to model a read served before the write; a server that always serves its latest would not show it, and replicas and caches do.
- `.plan` files not read. Rule 44's order across lanes with parked endings only (L5) is by reading.
- My crossed search's drain is coarse: its `after-drain` classes are partly my drain stopping at a blocked plain write, so I report only that no oracle failed, not that nothing wedges. No probe of mine found a wedge beyond M1, M5.
