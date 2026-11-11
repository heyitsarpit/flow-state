# Round 5: a gate at the boundary, one judge with versions, and the rest of streams

Status: proposed, throwaway. Everything marked ran was run on 2026-11-02, Bun 1.4.2, Effect 4.0.5, this Mac, one process at a time, under `conformance/watch.ts`. Decisions: [../convergence-5.md](../convergence-5.md). Outputs here: `suite-output.txt`, `mutants-builder.txt`, `search-*.txt`; red: `../conformance/red-round-5.txt`.

**This round evolved round 4.** `round-4/` is untouched. **Two parts were redone from requirements: the gate's enforcement and the entity confirm path.** `sessions.ts` was grown from T1. **The step, the fence and `Phase` are not implicated.** No finding of mine touches them; `lane.ts` has no logic change.

**Verdict.** Every High is fixed on what ran, and the rest of streams ran on this seam with no new core mechanism past what convergence-5 listed. **One old bug turned up that the review missed** (below, r3). Against that: **this is one builder's suite and reading.** Round 4's review found 9 Highs behind 357 green cases, and an independent review of this round is owed before anyone trusts 458. Streams carry the least evidence: one round, thin where marked.

## What ran

| Item | Result |
| --- | --- |
| Red, round 4's code on the repaired suite | 36 cases failed of 411 (`red-round-5.txt`); SEARCH-SESSION failed on H7 at depth 3. Red was round 4's code under the copied adapter with one read added |
| Scenarios | **458/458 cases**, about 10 s, peak about 230 MB (`suite-output.txt`). One run took 118 s; I did not find why. Unlogged changes: none. Replay on every case |
| Builder mutants | **114/126 killed. Copied from the output file's last line. Not an independent number.** The review's 9 spike mutants, re-created from their names and tables: **8/9**. 3 kills by crash or watchdog are in the file. First pass, before streams: 74/101 |
| Deep-freeze | World, inputs, outputs frozen around every step (`FLOW_DEEP_FREEZE=1`, plain objects only): **458/458**; SEARCH-FRAG, CROSS, REPAIRING, LISTEN (version), FRAGSTORE (nothing) depth 5 complete; SEARCH-SESSION depth 3, stopped by my 30 s limit. No failure |
| `tsc --strict` on `adapter.ts`'s graph | No error in `round-5/` or `conformance/`. 1 error outside them, not read |
| Format | `oxfmt` from `node_modules/.bin` with defaults, because `vp` is not on the path and `nub run fmt` targets `flow-state-rewrite`. **So the repo's config was not used** |
| Lint on `round-5` and `conformance` | 0 errors, 11 warnings, `oxlint` defaults. Not chased |

| Search | Limit | Depth complete | States | Result |
| --- | --- | --- | --- | --- |
| SEARCH-PAY, narrowed pins | 95 s | **8, completed** | 22,002 | 25 classes, 0 unpinned. Depth 9 not run |
| SEARCH-PAY on `pay.fixed.ts`, no pins | 45 s | **8, completed** | 6,715 | **4 classes, all `... place.ok Start PayRequested`: the fake charges the same intent after an order. As the review predicted** |
| SEARCH-ODD | 80 s | 3 | 964 | No failure. Slow per state |
| SEARCH-ODD-ALL (new) | 155 s | enumerated | 24 kinds x 18 values = 432 scripts | No failure, 47 s. In the suite: 24 x 6 |
| SEARCH-CROSS | 80 s | 6 | 93,428 | No failure |
| SEARCH-LIKE | 65 s | 5 | 24,798 | No failure |
| SEARCH-FRAG | 65 s | 7 | 38,283 | No failure |
| **SEARCH-FRAGSTORE row (new)** | 60 s | 7 | 58,098 | No failure, with a silent-wrongness oracle |
| FRAGSTORE no version | 30 s | 6 | 27,442 | No failure |
| FRAGSTORE nothing carried | 30 s | 5 | 7,159 | No failure. An earlier 90 s run reached depth 7, 89,444 |
| **SEARCH-SESSION (new)** | 95 s | 5 | 90,333 | No failure on the final code. An earlier 90 s run reached 6 before streams. Failed on H7 when red |
| SEARCH-REPAIRING (new) | 65 s | 5 | 50,003 | No failure. A 60 s run reached 6 |
| **SEARCH-LISTEN version (new)** | 60 s | 6 | 45,510 | No failure |
| **SEARCH-LISTEN none (new)** | 60 s | 5 | 31,633 | No failure, **with one hole cut out on purpose: below** |

All inconclusive past the depth stated: time limits stopped them, none closed. Rounds differ in limits, so do not read depth against round 4's: this round's limits were shorter and SEARCH-CROSS and SEARCH-LIKE reached less than round 4 did. Oracles also got heavier (every mint).

## The review's findings

| Id | State | How |
| --- | --- | --- |
| H1, H2, L3, L8, L10 | fixed, ran | D65: `seal`. Prototype names at every door, all kinds of closure, frozen items. A frozen ending of a removed operation is `Orphaned` evidence and the actor keeps its memory |
| H3, H8, M14 in part | fixed, ran | D66, D67. Real `archive`, `remove`, `markRead`, `.one` with `revision`, a tombstone with a version |
| H4, M12 | fixed, ran | D68, D69 |
| H5, H6, M1, M2, M13 | fixed, ran | D72, D73, a tree walk, `applyLists` |
| H7, M3-M7, L2, L4, L5, L7 | fixed, ran, except L7 | D70, D69, T1. L7's cell is now unreachable: see Plan wrong |
| H9 | done | 8/9, and the ninth is equivalent under D71 |
| M8 | stated | Accepted; a differing frame or later read asks again |
| M9 | void | No stop |
| M10, M11 | done | Guard, retried void. Audit stopped reading belief; it showed one composition, pinned as P5 |
| L1 | done | Numbers above are from the files |
| L6 | fixed, no scenario | Reading only. Both L6 mutants survive |
| L9 | stated | |

## Findings

### Plan right, code wrong

| Age | Finding |
| --- | --- |
| **r3, new** | **`tx.w = { ...tx.w, follow: [...startActor(tx, rec), ...tx.w.follow] }` spreads the world before adoption's own writes, and loses them.** A parked ending delivered at a rebind stayed on its lane, so it would come again at the next boot. Same class as round 4's H1 first fix. The review did not name it; REV5-M1 found it. Mutant `h5-spread-loses-adoption` dies |
| r4-spike, new | T3's "a releasing turn may raise `filled`, never lower it" was not built. 2.11.8's clear-and-leave read as cleared, not wiped |
| r5, mine, at once | `settled` cleared a doubt on a success; LIKE-01 caught it. `cx.note("Stale", { kind })` overwrote evidence's kind, because `note` spreads fields after it: **a hazard that remains for any module**, caught here by a scenario |
| all | H1-H9, M1-M7 as reviewed |

### Plan wrong (proposed)

| Id | Finding | Evidence |
| --- | --- | --- |
| "same comparison"; D60 | D67. The version places evidence; positions are the fallback | Ran. **SEARCH-LISTEN with a version has no hole.** Without one: below |
| T1 "queued values", "at the queue's head" under `every` with no `catchUp` | **Under T4's pull, Live's queue holds at most a notice and one value, and a drop cannot overtake a value already taken.** So `t1-member-notice-at-tail`, `m5-end-drops-queue` and `l7-lose-keeps-moving` have nothing to act on outside Repairing. The rows are not wrong, only mostly dead. A consequence the plan does not state | Ran: the cases and survivors |
| T6 with T4 in Repairing | **A full `buf` stops pulling, and T6 fails `Overflow` only when pulled to the end of its queue. So during a stalled read of a pushed source the session cannot hear `Overflow` until the read answers.** T1's `stalls` needs `lose(Overflow)` in `Repairing`, reached only by a source that fails outright. `idle` is unarmed then too, so a read that never answers beside a full buffer waits forever | Ran: `overflow-with-no-reconnect-ends-it`, read for the rest. **Should T6's failing interrupt a stopped pull? I think so. Not built: the owner's table** |
| T3 "dispose then `ensure`: the partition is new" | Review M13 is right: not a conflict. D73 | Ran |
| T9 "a `when` throw refuses the turn" | Keeps the session, one issue. **Owner's** | Built, one reading; no case throws `when` in the suite (the fixture's flag has no event) |

### Plan silent

| Id | Finding | Decision |
| --- | --- | --- |
| A patch or tombstone at equal version beside a confirmed write | Equal cannot show it. Merge, keep `unconfirmed`; a removed record stays removed | D67's table |
| Versions of no shape | No version, an issue, positions | D67 |
| A frozen ending of a removed op | Evidence, keep the actor | D65 |
| An overdue close | Wakes the next session; the old connection may still be open, so rule 70's "one connection" is only until the bound | Ran; the oracle exempts it |
| A `listen` frame's patch of a record not held | Nothing; a tombstone is kept | From `feed.domain.ts`'s stated gap |

### The owner's question, with evidence

**SEARCH-LISTEN on an unversioned entity failed at depth 3:** `hello other frame.now frame.was`. A frame that arrives out of its server's order, with no write of ours outstanding, is applied, unmarked, and the record is silently wrong until its next read. D67 keeps this as the stated limit, so the search counts `frame.was` as "behind" there. The same search with a version found nothing. Real entities declare one. So: **D67 costs an unversioned entity nothing it had, and a versioned one gains the guarantee.** Over one connection that frame cannot happen; across a reconnect it can.

### Pay (M10, M11)

Guard and retried void applied in `pay.fixed.ts` only. 4 classes remain, all the fake. **Runtime not implicated, no argument for a memory redesign.** Cost stands: a shopper with a stranded hold cannot start again. `persisted` is per machine, so a compensation cannot go out when the disk refuses: stated, not built. Pay as written is unchanged and pinned.

## Streams: how far

| Part | State |
| --- | --- |
| Pull (D71), T4 | **Ran.** A pulled source stops when a turn refuses: `STREAM5-PULL` |
| `catchUp`, Repairing, T2 rows with `C`, pages, `through`, `gone`, retry, churn, `stalls` | Ran |
| `Flapping`, tag `failure`, `reconnect.while`, `when` | Ran |
| Overflow, T6 | **Thin.** A bound, drain-then-fail. **Signal groups not built; the bound lives in the fake**, not a `Feed.callback` |
| `ReleaseOverdue` | Ran |
| `listen` | **Thin. Frames apply under D67, gaps re-read.** No cache, so a gap reruns the read's commit. `current(r)` not published; "subscribed" means any answer of that machine |
| `latest`, T5 | Ran, no persisted age |
| SEARCH-SESSION, REPAIRING, LISTEN | Ran above |
| T8, `subscribe.each`, 256-entry bound, jitter, written `schedule`, `pageSched` exhaustion, `DuplicateSession`, flags | **Not built** |

**The seam:** 13 hooks, `told` closed. `Cx`: `placed`, `slice`, `machineOf`, `tell` in, `actor` out. `DriverIo`: `credit`, `open`. `sessions.ts` imports `own`, `text` from gate and one type from `inc`. **The review's fear that `exec`'s shape would stress the seam most was fair; it took one counted wait, about 20 driver lines.**

## Survivors, all read (12)

| Mutant | Reading |
| --- | --- |
| `d57-valid-leaf-unchecked` | Equivalent: the activation check catches it (round 4) |
| `d65-raise-key-unchecked` | Nearly: a bad key finds no child, refused anyway. Only a number's string form differs |
| `h5-frozen-adopts-at-rebind` | Equivalent in result: it parks again. **So the guard is not earning its line** |
| `m3-release-keeps-end`, `m3-fence-by-incarnation` | Each covers the other. Both off would fail; not run. The fence is reached with a disabled module only, as round 4 said |
| `t1-member-notice-at-tail`, `m5-end-drops-queue`, `l7-lose-keeps-moving` | Unreachable under D71: Plan wrong |
| `s-latest-down-keeps-confirmed` | Equivalent: `reconcile` also reads `st`. An earlier run counted it killed by the watchdog's clock, a false kill |
| `l6-fire-touches`, `l6-firing-not-saved` | **Real gap.** The harness cannot stop between a firing and its turn and reload |
| `r54-facts-before-reset` | **Real gap.** I could not build a pending reset beside an adoption in reasonable time. The review named it; it stays |

## Findings by age, so the owner can read convergence

Review's 33, and this round's new ones, by the age of the code at fault.

| Age | Review High | Review all | New this round |
| --- | --- | --- | --- |
| r1-2 | 2 | 4 | 0 |
| r3 | 2 | 4 | **1** (the spread) |
| r4-fix | 2 | 11 | 0 |
| r4-spike | 3 | 14 | 1 |
| r5 | | | 2, caught at once by this round's cases |

My reading, against round 4's sentence, which the review was right to doubt: **nothing here shows the core has converged.** The lane table, step, fence and `Phase` drew nothing again, which is three reviews' worth of "not implicated". The gate and confirm path are new and unreviewed; rewriting them resets their count. A silent-wrongness oracle over two new searches found only the stated limit, which I would trust more if a reviewer's mutants say the oracle can fail. Mine say it can: `d66-*` mutants died by scenario first, so **the searches' own killing power was not measured separately**.

**Decisions overturned this round: D60 (r4), D58's standing as the only rule (r4), D57's enumeration (r4), D63's door (r4). From rounds 1-3: 0**, apart from the line stop, void by the owner.

## Costs

**No stop. Reported only.**

| Part | Round 4 | Now |
| --- | --- | --- |
| Step, turn, world, seam, hooks, gate, `inc.ts` | 2,668 | 2,904 |
| Lane | 571 | 571 |
| Reads, timers | 78 | 78 |
| Write-ahead | 319 | 377 |
| Publication | 102 | 102 |
| Driver | 253 | 275 |
| Entities | 421 | 703 |
| **Core + driver + entities** | **4,412** | **5,010** |
| Sessions | 475 (spike) | 916 |
| **With sessions** | 4,887 | **5,926** |
| Adapter | 206 | 235 |

Formatted, comments in. **Bundle** (`bun build --minify`, gzip, Effect external) [ran]: core with driver 19.4 KB, entities 4.3 KB, sessions 5.7 KB. `seal`'s per-call cost not measured.

**Not cut:** nothing, for size. **`when` built.** No core file names a module.

**What a sync engine still lacks:** (a) one cut; (b) two outboxes; (c) `blocks: false` drops D3. (d) D67's shape is in entities, in the module, so an engine brings its own judge: **fits, not shown**. `cx.tell` is the path a push takes, used by sessions to entities only. `Inc.partition` as a cursor: unproved.

## Rules broken

- **D60:** replaced by D67, flagged.
- **D57's list:** replaced by D65. **D63's one door:** D68, against the review's lean.
- **T9:** a `when` throw does not refuse.
- **T6:** no signal groups; the bound in the fake.
- **T7:** no cache; thin coverage.
- **Rule 46's `orphaned` (P19):** evidence only, for frozen endings; a lane of a removed op still quarantines.
- **Flattened, stated:** `.alsoChanges`, `PredictionNotRetained`, `basedOn`'s rebase not built; desk feed's `bothLive` (a guard's view has no rows), `.slice(-ACTIVITY_KEPT)` not built. **Convergence-5's M14 row promised the feed parts on `desk.compiled.ts`; the tag failure and `when` went to `chat.compiled.ts`, a fixture I wrote, not a copy.**
- **Convergence-5 said no old expectation moves but by log:** SPIKE-02..04 moved for the slow close, logged. One log line says "SPIKE-02", but the unlogged check named only 03, 04 by hash.

## Not run

S4, a browser, a real `fetch`, a real socket, IndexedDB, Node, a phone. `nub run verify`. `allow`, `cancel` as a family, keyed schedules, `check()`, cache, resources. A second author, on instruction. Every search past the depth above. `when`'s throw. L6. Round 4's builder list in full: 18 of its mutants name replaced code and went. Lint was counted, not read.

## Limits

No limit breach. Highest: mutants killed by the watchdog at 1,411 and 1,521 MB, under the 2 GB rule (`m4-loops-unbound`, `s-latest-heard-ignored`, by design). One command of mine hung and was stopped; a too-broad `pkill` I tried was refused by the permission system and was not needed. One mutant run stopped twice on edits that no longer applied after a formatter; the numbers above are from a whole run after that. Two concurrent processes: none knowingly, one mutant run was started by a mistake of mine with an empty `--only` and left to finish as the full run, alone.
