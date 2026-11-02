# Round 4: one gate, what a position means, real shapes, and a thin stream on the seam

Status: proposed, throwaway. Everything marked ran was run on 2026-11-02, Bun 1.4.2, Effect 4.0.5, this Mac, one process at a time, under `conformance/watch.ts`. Decisions: [../convergence-4.md](../convergence-4.md). Outputs here: `suite-output.txt`, `mutants-builder.txt`, `search-*.txt`; red: `../conformance/red-round-4.txt`.

**This round evolved round 3.** `round-3/` is untouched at its commit. **Nothing was redone from scratch**, and no review argues for it: lane changed 26 diff lines (M1), `driver.ts` 0, `step.ts` 34, `timers.ts` 0. **The step, the fence and `Phase` are not implicated.**

**Verdict.** All seven Highs and every Medium are fixed on what ran, and the thin spike ran a real session on this runtime with **no new hook**. Three new bugs were found by the new scenarios, all in round 3's fragment code: a thaw never adopted what parked during a freeze (from History as written); a hold was dropped on a second boot, and a restored ending with no actor became evidence (from H3's quarantine cases). **This is still one builder's suite and reading.** Round 3's review found seven Highs behind 234 green cases, and an independent review of this round is owed before anyone trusts 357.

## What ran

| Item                                                         | Result                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Red, round 3's code                                          | 48 cases failed; REV4-H5's key with `:` ran away, watchdog at 1,814 MB; SEARCH-ODD failed on depth 1 (`list.five`)                                                                                                                                                                                                                                         |
| Scenarios                                                    | **357/357 cases**, 9 s, peak 223 MB. Unlogged changes: none. Replay on every case                                                                                                                                                                                                                                                                          |
| Builder-written mutants                                      | **35/42. Not an independent number; used to find gaps.** Survivors, all read: 3 equivalent (`d58-ge`: ticks are unique; `d57-valid-leaf-unchecked`: the activation check catches it; `seam-member-applied-at-once`: a partition is never written in a turn), 1 ineffective (`d57-to-unchecked`), 3 real gaps below. 8 first-run survivors became scenarios |
| SEARCH-PAY, narrowed pins                                    | **depth 8 complete, 22,002 states, 25 classes, 0 unpinned**, 65 s, 220 MB. A depth 9 run stopped by my 170 s limit at 48,935 states, finding one more composition, now pinned (P1 with P3); not rerun past depth 8                                                                                                                                         |
| SEARCH-PAY on `pay.fixed.ts`, no pins                        | **depth 8, 6,774 states, 8 classes** (round 3's stale file: 14). See Pay                                                                                                                                                                                                                                                                                   |
| SEARCH-CROSS                                                 | depth 7 complete, 179,062 states, 146 s, 326 MB. No oracle failed. Not closed: depth 7 added 135,632                                                                                                                                                                                                                                                       |
| SEARCH-LIKE                                                  | depth 7 complete, 82,939 states, 67 s, 237 MB. No oracle failed                                                                                                                                                                                                                                                                                            |
| SEARCH-FRAG, two copies, keys with `:` and `/`, status check | depth 8 complete, then my 90 s limit at 75,336 states. No oracle failed. Inconclusive past 8                                                                                                                                                                                                                                                               |
| **SEARCH-ODD (new, D57)**                                    | **depth 4 complete, 2,229 states, 145 s, 250 MB. No Fatal, no ModuleDefect.** Slow per state; also depth 2 inside the suite                                                                                                                                                                                                                                |
| Thin spike                                                   | SPIKE-01..05, 27 cases, in the 357. Not searched                                                                                                                                                                                                                                                                                                           |
| Deep-freeze purity                                           | Not rerun. The review's result was on round 3                                                                                                                                                                                                                                                                                                              |
| `tsc --strict` on `round-4/adapter.ts`'s graph               | No error in `round-4/` or `conformance/` [ran]. `nub run verify`: not run                                                                                                                                                                                                                                                                                  |
| Lint on `round-4` and `conformance`                          | 822 errors, 3,243 warnings. Not chased (round 3: 612, 2,646)                                                                                                                                                                                                                                                                                               |

## The review's findings

| Id                       | State      | How                                                                                                                                                                                                                                         |
| ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1                       | fixed, ran | D58. **My first fix was wrong in a way worth saying:** `{ ...tx.w, pos: position(tx) }` spreads before the tick, so the tick is lost and they tie again. REV4-H1 caught it. Round 3's H1 is the same class of thing: a counter nobody owned |
| H2                       | fixed, ran | D59. Trace now ends `liked: true, uncertain: true`                                                                                                                                                                                          |
| H3                       | fixed, ran | D57, D61: 14 kinds of record, most booted twice, adopted, re-sent with the same id                                                                                                                                                          |
| H4                       | fixed, ran | D57, and a store mapper of no shape, a `BigInt` field, `memory.initial`, a schedule's `ms`, an `Ev.to` of no shape                                                                                                                          |
| H5                       | fixed, ran | D57. Plus two the review did not name: key order made two lanes (an `idle` guard could pass on a live write), and every object reset value was one subject                                                                                  |
| H6                       | fixed, ran | Also two own exits in one turn, and a sibling on the node stays abandoned                                                                                                                                                                   |
| H7                       | done       | Real Address, Resolve shape, Upload, History, Comments' pin and react. One case per survivor the review named                                                                                                                               |
| M1-M7, L1-L5, L6, L8, L9 | fixed, ran | L5 and L6 by reading: no scenario reaches them                                                                                                                                                                                              |
| M8                       | Below      |                                                                                                                                                                                                                                             |
| M9                       | done       | `mayHave`; pins narrowed: **that narrowing found 3 compositions the wide pins were hiding** (P1+P6, P5+P6, P1+P3), all in Pay as written; `frag.search.ts` now does what its header says                                                    |
| M10                      | done       | Below                                                                                                                                                                                                                                       |
| M11                      | Budget     | Fair count stated, D24 left to the owner                                                                                                                                                                                                    |
| L10                      | Corrected  | D3's prior-art line                                                                                                                                                                                                                         |

**One place I did not follow the review.** M4: "the bound drops only `send` mail." A recheck can loop by itself (FRAG-03), so the bound drops sends and rechecks. Thaws and adoptions always run. Convergence-4's table says "Rechecks ... run"; it was wrong, corrected there.

## Findings

### Plan right, code wrong

| Id           | Finding                                                                                                                                                                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New, r53     | **A thawed incarnation never adopted what parked while it was frozen**: `thawInc` read only its own frozen list, and rule 54 covers the thaw. Found by History as written. Round 3's green suite had no write ending during a freeze (H7's `r53-frozen-binds`), so this is the bug that survivor was pointing at |
| New, rule 17 | **A hold with its own parked ending lost its lane at the next boot**, so a re-send minted a new id: a second charge's shape. Round 3's `ownParked` branch                                                                                                                                                        |
| New, rule 44 | **A restored parked ending with no lane and no actor became evidence**, because nothing could name its machine. Reached only through quarantine                                                                                                                                                                  |
| New, rule 60 | A parked ending dropped by a mark was counted twice as settled. Unreachable before M3                                                                                                                                                                                                                            |
| H1-H6, M1-M7 | As reviewed                                                                                                                                                                                                                                                                                                      |
| P1-P6        | Pay's bugs, unchanged, pinned                                                                                                                                                                                                                                                                                    |

### Plan wrong (proposed)

| Id                                               | Finding                                                                                                                                                                                                                                                 | Evidence                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| "same comparison" for frames                     | A frame has no start. D60                                                                                                                                                                                                                               | Reasoning; `listen` not built |
| "base kept" (D47)                                | D59                                                                                                                                                                                                                                                     | Ran: H2's trace               |
| Public `stalled` (D49)                           | Inspection                                                                                                                                                                                                                                              | Nothing reads it              |
| T3 "dispose then `ensure`: the partition is new" | A persisted identity's record comes back whole, memory included (FRAG-08, OD21), so the bookmark comes back with it. The table's line would give memory with no bookmark. SPIKE-04 pins what ran                                                        | Ran                           |
| T9 "a `when` throw refuses the turn"             | Under level-triggered lifecycle, nothing a session does can refuse the turn that placed it. `when` not built; `input`'s throw is D46's outside-a-turn case, no session. **If the owner wants the refusal, it costs a call in the turn, about 15 lines** | Ran, for `input`              |

### Plan silent

| Id                                               | Finding                                                               | Decision |
| ------------------------------------------------ | --------------------------------------------------------------------- | -------- |
| Which of a key's forms is canonical              | Sorted keys                                                           | D57      |
| What a repair of no shape does                   | Treated as failed                                                     | D57      |
| What a list of no shape does when `by` is absent | Repaired                                                              | D57      |
| A hold's Restored at a thaw                      | Not sent: the life that owned it has heard                            | Built    |
| A module's trees                                 | A frame must read the field and the bookmark, so `cx.actor` is needed | Built    |

### Pay (M10)

Applied at last: P5's half, P6's guard, `Start` idle on `pay`, `void`, `place`, and a void a reload took is sent again instead of called "released". **8 unpinned classes at depth 8, from two roots:**

1. Seven: `PayRequested Leave ack pay.ok refuse Start`. **Storage refuses the void's ack**, so the void ends `NotSent { StorageRefused }`, its lane is gone, the idle guard passes, and `Start`'s patch forgets the authorization. The review's root (`reload`) is gone; this is its neighbour.
2. One: `... place.ok Start PayRequested Leave`: same-intent `Start` after an order. The fake charges what it is told; Stripe would refuse.

So the review's reading holds: mostly a guard and a compensation; a retry on a refused void would very likely close (1). **Runtime not implicated. Pay's memory stays the owner's call, and this is less argument for a redesign than convergence-2 thought.**

## The thin spike: what the seam needs

`round-4/sessions.ts`, 475 lines. Desk feed's `activity`, `activitySignals` as written, `DeskFeed` as written less what is listed; `Room`, the same session in a trait under `resetOn` and `.resumable()`.

| Review's gap (M8)                     | What ran                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Members in action order with rollback | `Member { verb: "module" }` calls the module's `input` in order. A refused turn restores `tx.w`, so a pending bookmark goes (SPIKE-03). It applies after commit, in the same step: rule 71 says no guard reads it, so it cannot be observed. **No hook**                                                                                                               |
| Lifecycle outside a turn              | **One call, level-triggered:** after any step, `input({ k: "actors", changed })`, for a module with `observes`. Turn, start, dispose, restore, retired rebind, freeze, thaw and reset all reached the module that one way. Nothing else was needed                                                                                                                     |
| Bookmark ownership                    | **D62 held.** `Inc.partition`. Reload brings it with memory in one record write; frozen, kept; reset, gone; **all of it free**. `save(s, { actor })` not needed. A member with no session placed works (SPIKE-03), which is T3's sentence, and which a module slice would have had to invent                                                                           |
| `deliver` has no incarnation          | `cx.deliver` with `inc`, fenced as `fire` is; `cx.retract` reaches mail and follow-ups. **Finding: with level-triggered release, retract alone covers every live case, and the fence is reached only with a disabled module** (`seam-deliver-unfenced` survives). Kept, because a dead `path!` would be a Fatal. **A cut candidate once the disabled path is settled** |
| D50 against T1                        | A value: `InvalidTurn` is `end(Defect)`. A `failure`: redelivered once. Different items, both hold (SPIKE-05)                                                                                                                                                                                                                                                          |
| Module fail-closed                    | Frames drop; the bookmark has not moved; a reload replays (SPIKE-05). Cheap because delivery is at-least-once                                                                                                                                                                                                                                                          |
| `tell` for `listen`                   | Not built, needs reads' registry. Round 5                                                                                                                                                                                                                                                                                                                              |

|              | Round 3 built | Paper said                | Now built                                                                                  |
| ------------ | ------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| Hooks        | 12            | 14; review expected 15-16 | **12**. `reconcile`, `turned` and a members hook all became `input`                        |
| `Cx` methods | 10            | +4                        | **+4**: `deliver`, `retract`, `partition`, `actor`. `tell` not built                       |
| Other        |               |                           | One `observes` flag, one mail kind, one member kind, `Inc.partition`. About 110 core lines |

**The price of no hook:** `input` is an untyped door and a module narrows its own union; and a module's view goes stale when it writes its own partition (I hit this: `filled` overwrote a member's bookmark until it re-read through `cx.actor`). I would still take one door over three.

**Real gaps in the spike:** the fence on an old connection (`seam-old-conn-unfenced`) has no scenario: Effect's interruption leaves no frame to fence, so it may be dead. Nothing backpressures: a pushed source fills the slice's queue without bound; T4, T6 are unbuilt and may stress this seam more than anything that ran. Predecessor wait ran only for instant closes. `ReleaseOverdue` did not run. No SEARCH-SESSION.

**Streams may start, in my view, after the review.** The seam's shape is right; what remains is T4/T6's pull, Repairing, `latest` and `listen`.

## Findings by age, so the owner can read convergence

The review's seven Highs, against round 2's files [ran: `grep` for each construct]:

|                                            | Count      | Which                                                                                                                               |
| ------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Wholly in code carried from before round 3 | **0**      |                                                                                                                                     |
| Wholly in round 3's new code               | **5**      | H1 (`pos`), H3 (`goodInc`), H4 (three of its four rows; the fourth is round 2's `encodeLane`, reached by round 3's parking), H5, H6 |
| Round 3's new code meeting older code      | **2**      | H2 (`confirm`'s branch, round 3, over `clearMarks`, round 2), H7 (round 3's fixtures; the fake's mint-order `load`, round 1)        |
| **Old class, new code**                    | 2 of the 5 | H3, H4: the third appearance of "a value kills the Runtime". D57 is the first attempt to end the class rather than the case         |

Beyond the review, this round: 4 new bugs, all in round 3's code (above), and 1 of my own caught at once.

**Decisions from earlier rounds this round overturned: 2** (D47's "base kept", D49's public `stalled`), **both from round 3**. **Extended, not overturned: 2** (D46's row, D50). **From rounds 1 and 2: 0.** D3 and D28's `Phase`, D4's dispatch, the fence and the step stand.

My reading: **the core is converging; fragments were not, and I cannot yet say they are.** Old code stopped producing Highs. New code still does, at a rate that tracks how much of it is new, and the new scenarios found 4 bugs in code 234 cases called green. Fragments' second pass is this one; the independent review will say whether it is the last. Mutant rates stayed flat, as you noted, so they should not be read as convergence either way.

## Costs (formatted, comments in; stop 10,000 is **the owner's**)

| Part                                                                 | Round 3   | Round 3's target | Stop      | Now               |
| -------------------------------------------------------------------- | --------- | ---------------- | --------- | ----------------- |
| Step, turn, world, seam, hooks, gate, `inc.ts` (reported whole: M11) | 2,343     |                  |           | **2,668**         |
| Lane                                                                 | 561       | 520              | 650       | 571               |
| Reads, timers                                                        | 77        | 200              | 280       | 78                |
| Write-ahead                                                          | 298       | 320              | 420       | 319               |
| Publication                                                          | 97        | 110              | 160       | 102               |
| Driver                                                               | 253       | 280              | 360       | 253               |
| Entities                                                             | 404       | 420              | 550       | 421               |
| **Core + driver + entities**                                         | **4,033** | **4,050**        | **5,220** | **4,412**         |
| Adapter                                                              | 190       |                  |           | 206               |
| Spike, not in the count                                              |           |                  |           | `sessions.ts` 475 |

Fragments on the review's fair count: about 1,150 now [estimate], past D24's 1,000. **Argues nothing for the cut**, as the review says. Decide D24 on merit; my lean is no cut.

**Bundle** (`bun build --minify`, gzip, Effect external) [ran]: core with driver **18.7 KB**, entities 2.9 KB, sessions 3.5 KB. No core file names a module [ran]. The 14 KB target had no stated reason: **proposal, drop it**.

**Projection against 10,000 [estimate]:** 4,412 now, plus streams 1,100-1,500 (the spike is about a third of T1-T9), context and resources 700-1,000, cache and keyed schedules 500-800, entities' remainder 600-1,200, Inspection 400-600, driver's scopes 350-700, write-ahead 150-350, `check()` and `activities` 200-400, `cancel` and `allow` 100-200, SSR and hydration 200-400: **8,710-11,660, midpoint about 10,200. More likely over than under.**

**Named cut for round 5, proposed:** `allow` concurrency, `activities`' `when`, and `cancel` as a separate family: 200-350. **Then** keyed schedules as `.each` of a one-schedule trait: 150-250. Together they bring the midpoint to about 9,700. Stop not moved.

**What a sync engine still lacks** (entity module optional, not up for cutting; not built): (a) one cut: an engine with its own store must mirror into the slice, or frames and S11's replay stop meaning anything; (b) two outboxes: one must yield, and a persisted engine write loses rule 17's restore row; (c) `blocks: false` drops D3, so third clause and contested become the engine's text; (d) **new:** D60's option C, a server version compared for all three kinds of evidence, is what txid and LMID are, and it belongs here. `cx.partition` gives an engine somewhere to keep a per-slice cursor, unproved.

## Rules broken

- **D47:** replaced by D58, D59.
- **D49:** `stalled` off the public row.
- **T9:** a `when` throw does not refuse; `when` not built.
- **T3:** dispose then `ensure` keeps the partition.
- **Review M4's wording:** recheck stays bounded.
- **Rule 9:** a finite number key reads as a string; I widened "Keys are strings" by that much.
- **Flattened, stated in each fixture:** Address's `summary` raise is a memory write; Resolve has no parts or signature; Upload has no progress or bytes; History has no `latest`; no Comments `pinned` strip; desk feed has no `catchUp`, no `changes`, no `bothLive`.

## Not run

`catchUp`, Repairing, `latest`, `listen`, `Flapping`, Overflow, T4's pull, `.each subscribe`, `ReleaseOverdue`; SEARCH-SESSION. `cancel`, `allow`, keyed schedules, `check()`, `flow check`. S4, a browser, a real `fetch`, IndexedDB, Node, a phone. `nub run verify`. The deep-freeze purity check. A second author, on your instruction. SEARCH-PAY past depth 8 after the last pin; SEARCH-LIKE past 7; SEARCH-FRAG past 8; SEARCH-ODD past 4. L5, L6: fixed, no scenario. L7: stated. D60: paper.

## Limits

No limit breach. Highest: round 3's code on red, 1,814 MB, watchdog at its 1,800 limit, under the 2 GB rule (that is H5's runaway); a mutant killed at 1,404 MB (`m4-loops-unbound`, by design). One `payFixed` search was killed by its time limit after 10,462 s wall clock, which I read as this Mac sleeping (its own deadline uses the same clock; peak 204 MB), and rerun in 32 s. One long search batch was moved to the background by the tool's limit; still one process at a time.
