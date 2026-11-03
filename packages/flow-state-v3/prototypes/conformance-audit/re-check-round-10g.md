# Re-check of the v3 test system after round 10, stage G

Commit `b9225f09`, branch `flow-rewrite`. Run from a detached worktree in the scratchpad, 14:29 to 14:59. The worktree was removed after the run. Scripts: `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/recheck10g/scripts/run-mut.ts` (the 10f runner, cut down, plus the lies below) and `lies.sh` beside it. Outputs are in `recheck10g/out/`. Command logs, and one reference copy of the 10f runner, were written by shell redirect, not by the Write tool. No subagents. No repo writes besides this file. No commits.

Marks: [ran] reproduced at b9225f09; [read] seen in the code; [reasoning] inferred, not run.

## Verdict: FAIL

One thing blocks a pass.

- **H1⁵** (High). An ending that runs in its owner **and also** in another actor or copy passes (j) in every case (0 by (j)).
  - The lie: after the right delivery, the same ending also runs in another live actor of the machine (`q3.dup-other`), or in another copy of the same actor (`q3.dup-copy`). The runtime says `delivered` once.
  - (j) pairs each `delivered` with **one** observation and never asks about the observations left over (`drive.ts:334`, `:470`) [read]. An extra recipient is never looked at.
  - This is the entity fan-out bug in its most likely form: a broadcast to every row of the machine, or to every copy.

The equal-view limit (item 1) is a second gap of the same root. It does not block alone, but it closes with the same fix, so I list it with H1⁵. H1'''' and G1 are fixed. Details are below.

## 1. Equal views: the obvious attack [ran, read, reasoning]

### The lies

| Lie | Fires in (probe) | Named fails | By (j) | With whole output |
|---|---|---|---|---|
| `q1.wa-eq-any`: any ending of an attempt runs in another live actor of the machine whose **root memory equals** the owner's | 26 (`probe.wa-eq-any`) | 4 (STORE-04/Cancelled and FRAG-22 ×2 by hand asserts; FRAG-22's first variant by (j)). REV7-EDGE's fail is my lie crashing on a BigInt, not a catch | **1** | 9 (5 more, by the output compare only) |
| `q1.wa-eq-diffleaf`: the same, only where the other actor is in a **different state** | **0** (`probe.wa-eq-diffleaf`) | 0 | 0 | |
| `q2.copy-eq-sameleaf` / `-diffleaf`: another copy of the same fragment whose view equals the target's | **0** (`probe.copy-eq-sameleaf`; diffleaf run killed by time under load) | 0 | 0 | |

- So in about 22 of the 26 cases where the lie fires, an ending in the wrong actor passes every named oracle. These are LIKE-02..06, STORE-03/05/07/11, LIB-02, MED-01/02, FRAG-12/13/20 and others: the 10f `e8.wa-unknown` set.
- No case has two equal-view copies in one state at an ending. So the 1,364 equal views are most likely between actors, at the root [reasoning].

### Why (j) cannot tell them apart [read]

- `placeView` (`drive.ts:86`) matches the guard's view to actors by **memory only**. The view of a root carries no actor key, so two actors with equal memory both match. `hit` keeps the owner, and the case counts as `indistinct`, green.
- It ignores the state too. The ear knows which alternative it sits on (`alt.at`), so it knows the recipient's state, but `placeView` never uses it. Equal memory in a different state would pass as well. No case reaches that today (`probe.wa-eq-diffleaf` 0).

### Is it a real bug, or truly unobservable? [ran, reasoning]

**It is a real bug, and what happens next shows it.**

- The handler runs in actor B. B's state or memory moves, and the owner A's does not. A stays in `saving` with its lane ended. B shows an error it never asked for.
- Equal views before the delivery do not mean equal views after it. The difference appears in the next published read.
- `q3.dup-other` below shows this: the whole-output compare sees the extra recipient in 29 more cases. The output compare is not a named oracle, though.
- It is unobservable only when the handler changes nothing in either recipient: no move, no memory change, no ops. Then no oracle needs to see it.
- For `q1.wa-eq-any` itself, the whole-output compare sees 5 more cases (9 of 26), and about 17 stay green even there. I did not check case by case whether those handlers have no visible effect (for example LIKE-02's two store actors, `a0` and `a1`), or whether the output compare misses them [not verified]. Either way it is the effect check below that decides. Equal views alone do not.

**Which oracle should see it: (j), by the effect, the same check that closes H1⁵.** After a batch, every actor and copy whose published state, memory or `inner` changed must be the recipient of a delivery or a turn the suite paired, or another cause the suite saw. Every observation must be used once. Where views are equal, the suite then decides by the effect, not by the view.

- The cheap part: place by state as well as memory (the ear's `alt.at` names the node).

### Does it block entities? [reasoning]

- Entity rows of one machine at one state have equal views whenever the row's identity is only in the actor key, not in its memory, for example `{ status: "idle" }` per row. The fan-out then lands where (j) cannot tell rows apart.
- If entity memory holds the row's id or data, views differ and (j) sees it. FRAG-22 was built this way on purpose.
- Taken alone, the equal-view limit can be stated: the fix is known and the bug shows up in the next read. **Together with H1⁵ it blocks.** The extra recipient is unseen even when the views differ, so entities would rest on hand asserts.

## 2. Last gate's findings, rerun [ran]

| Finding | Result | Status |
|---|---|---|
| H1'''' | `falsify --part lies --lie e8.wa-unknown,e8.wa-failure`: both `ok`. `e8.wa-unknown` red by `(j) delivered to the wrong recipient` 3 of 4 (PAY-12/shuffle, DRV-01, FRAG-22); `e8.wa-failure` 5 of 7. `FALSIFY every gate fails on what it should` | **Fixed** in the gate's sense. As the builder says, it fired in 20 cases at 10f (probe not rerun here) and is red in 4. The rest are the equal views of item 1 |
| G1 | `search/run.ts --which odd --runtime <round-10/adapter.ts> --depth 4 --states 4000 --seconds 60`: verdict `inconclusive` (budget), not `failed`, 9.2 s. It was `failed` at 10f with the same budget | **Fixed**. I did not rerun all of `--part search` |

## 3. The 34 lies the builder did not rerun [ran]

- `--slice i/12`: the builder's 13 reruns are the fourth entry of each slice. The first three of each slice are the 34.
- Every slice was cut by my `watch.ts --seconds 295` after its third lie. The machine was loaded (two slices at once, plus my lies), so a lie took about 95 s. Every `ok` line printed before the cut is a full result.

**Reached: 19 of the 34. Every one is `ok`.**

| Slice | Lie | Result |
|---|---|---|
| 1 | `h1.like2nc-plain`, `a2.deliv-like2nc` | red by (j), 2 of 2 each (STORE-05, MED-01) |
| 2 | `lie.released`, `h1.save-released`, `a2.deliv-save` | red by (j): 2 of 2; 22 of 36; 22 of 36 |
| 3 | `lie.lane-cell` | red by (j), 2 of 2 |
| 4 | `lie.lane-cell-noatt` | red by (j), 2 of 2 |
| 5 | `lie.like2nc-released`, `h1.lanecell-noatt-like2nc`, `a3.park-save` | red by (j): 2 of 2; 2 of 2; 22 of 36 |
| 6 | `lie.save-released`, `d154.moved-fail-released`, `a4.refused-fence` | red by (j): 22 of 36; 10 of 11; 45 of 45 |
| 7 | `lie.settled-superseded`, `d154.moved-like-released`, `a4.refused-denied` | red by (j): 281 of 286; 1 of 1 (SURV-03 only); 45 of 45 |
| 8 | `lie.serialize-as-latest`, `d154.moved-save-released`, `a5.unmapped-like2nc` | red by `(j) superseded` 3 of 3; vacuous, as before (its probe fires nowhere); red by a named oracle 2 of 2 |

- Builder reruns confirmed on the way: `lie.evidence-only` (slice 1) red by (j) 2 of 2; `ref.binding-first-copy` (slice 6) red by `(ref) binding with subject` 13 of 13.
- **Not reached (15):** `h1.second-released`, `a2.deliv-fail-samemail` (slice 3); `h1.unknown-released`, `a3.park-like2nc` (4); `lie.dispose-start`, `d154.event-fail-released`, `a5.unmapped-save` (9); `lie.settled-released`, `d154.event-like-released`, `a6.abandoned-like2` (10); `lie.letgo-all-parked-on-cancel`, `a1.ghost-like2`, `a6.abandoned-save` (11); `h1.like2nc-released`, `a1.ghost-save` (12).
- A first attempt ran all 12 slices at once by mistake. Under that load the inner suite hit falsify's 200 s limit and printed `BAD` with no `SUMMARY`. Those lines are void and are not evidence either way.

## 4. New classes, unanchored

### H1⁵. A second recipient is never looked at [ran, read]

| Lie | Fires in | Named fails | By (j) | With whole output |
|---|---|---|---|---|
| `q3.dup-other`: after the owner's delivery, `deliver` again into another live actor of the machine (`redelivered`, so no second `delivered` note) | 33 (`probe.wa-any`: any attempt's ending with another live actor) | 3 (DRV-04, FRAG-22 ×2), all hand asserts | **0** | 32 (29 by output only) |
| `q3.dup-copy`: after `runTurn` in the copy, `runTurn` again in another unfrozen copy of the same fragment | the multi-copy cases (not probed) | 6 (FRAG-15's own check, FRAG-21 ×2, FRAG-22 ×2, REV8-M3), all hand asserts | **0** | |

- **Why (j) cannot see it** [read]: `ears` records every guard run on a mapped event. `ledger` pairs each `delivered` with the first unused one (`heardNow.find`). Nothing checks the ones left unused.
- FRAG-22's actors and copies all have distinct memory, so this is not the equal-view limit. The extra observation is placed correctly and then dropped.
- **Why it is a High:** entities fan endings out to many actors and copies. "Delivered to the right row **and** to others" is the plausible bug: a lookup that returns every row of a machine, or every copy, instead of one. Today only hand asserts in 3 to 6 cases and the whole-output compare see it.
- **A related hole, same root** [read, reasoning]: the pairing takes the first unused observation of any event the op maps to, including one from the suite's own `send` of that event. If a batch sends the mapped event to the owner, a delivery into the wrong actor can pair with the send's observation and pass. Its own observation is left over and dropped. I built no lie for it.

### Handler never run [ran]

- `q4.no-run-fail` (`delivered` said, the failure handler never run): red, 192 of 209 by (j). The A2 fallback does not hide it.
- `q4.no-run-other-turn` fired nowhere (732/732, counts unchanged). My trigger was wrong, so it shows nothing.

## To pass

1. **H1⁵**, which also closes item 1 where it matters:
   - (j) requires every observation in a batch to be paired once, with a `delivered`, a `turn` the suite drove, or a seen cause. A leftover observation of a mapped event is red.
   - Or check by effect: every actor or copy whose published state, memory or `inner` changed in the batch has a paired cause.
2. Put `q3.dup-other` and `q3.dup-copy` in `falsify --part lies`, each red by (j).
3. In `placeView`, place by the ear's state (`alt.at`) as well as by memory.
4. Add a named case: two or more actors of one machine with **equal** memory (the entity shape with identity in the key only), an ending to one of them, and (j) asked to name it.

## Stated limits, if those close (each with what closes it later)

| Limit | Severity | Closes with |
|---|---|---|
| Equal views at the root (1,364): the recipient is undecided where views are equal **and** the handler changes nothing | Low once the effect or leftover check exists | Nothing more is needed. Such a delivery has no effect to see |
| A view at a boot is placed by pre-kill memory only (205) | Low | Read the new instance after `port.boot` and replay the observations |
| Allowance A2: 143 unobserved | Low | As 10f |
| `send`-paired observation (above) | Medium [reasoning] | Pair an observation with a delivery by its cause (the mail item), not by event name. Or the leftover check, which makes the stolen pair leave the ending's own observation unused and red |
| Lies not reached in this re-check (section 3) | Gate | `--slice i/12` on an idle machine, one at a time |
| `--part search` rerun in full, `--part tamper`, `mutants`, `watch`, `checks/` | Gate, builder-reported ok | Not rerun here |
