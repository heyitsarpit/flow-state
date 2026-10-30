# Streams state machines: model results against proposal-v2.md revision 3 (ac493bd1), section 3

Files: `model.ts` (3.1 to 3.6; `CONFIG` holds the mutable rules), `main.ts` (explorer, systems, checks), `mutations.py`, `output.txt`, `mutations-output.txt`.
Run `tsc -p . && bun main.ts` (18 s), `python3 mutations.py` (about 9 min). Line numbers are proposal-v2.md at ac493bd1. Revision 2's model is superseded.

## What is modelled
- **S**: 3.1 (16 inputs x 6 states) and 3.2 for `facts` and `state`, with restart and successor. Exhaustive fixpoint (5,392 and 25,267 states).
- **S+L**: S with 3.6 attached (reads, `feedDown`/`feedGap`/`feedEnded`, refetch). Bounded: 11 inputs (facts), 7 (state), 400k states.
- **CB+S**: 3.3 (group `(down1, live, down2)`, waiters) feeding a session, `bufferSize` 2. Fixpoint (294k and 237k states).
- **R+S**: 3.4 (14 inputs x 5 phases, `ring`, `emptyRun`, `CannotRepair`) feeding a session. Four configs: catchUp from 0, catchUp with no `from`, no catchUp, no catchUp with no positions.
  **Bounded to 10 inputs**; schedules of length 2, `bufferSize` 2, server head up to 3. `resetAfter` is "stable" / "not stable", checked in a clock-only run (`R/budget`).
- **P**: 3.5 (3 Attempts, setter, ending, promotion, restore). Fixpoint (688 states).
- Coverage: 3.1 all 55 defined cells (41 cannot never fire); 3.4 all 32 (38 cannot); 3.3 all 18 cells; 3.5 all 6; 3.6 all event kinds.

## Invariants (PASS = no counterexample inside the bounds)
| # | Result | # | Result |
| --- | --- | --- | --- |
| I1 | PASS (session-local; see N8) | I13 | **FAIL** (N2) |
| I2 | PASS (counts 55/41 and 32/38 match 557 and 658) | I14 | PASS (3.5) |
| I3 | PASS | I15 | **FAIL** (N1) |
| I4 | PASS | I16 | PASS |
| I5 | PASS by construction | I17 | PASS |
| I6 | PASS | I18 | PASS |
| I7 | PASS (`\|Q\|` ≤ 3, ring, buf, callback) | I19 | PASS |
| I8 | PASS | I20 | PASS for the implicit clause; **FAIL** for "at most one start" (N4) |
| I9 | PASS | I21 | PASS |
| I10 | PASS | I22 | PASS with fairness; **FAIL** with endless empty pages (N5) |
| I11 | PASS (discard path only) | I23 | **FAIL** (N3) |
| I12 | PASS | I24 | PASS (but see N7) |

## Counterexamples (shortest; `output.txt` has all)
- **I15** (S+L, 5): `proof(b)` -> `stream fails` -> read starts -> read lands -> read lands. r is fresh and the session is `Ended`.
- **I13 and I23** (R+S, 5): `append` x3, `inner value`, `page ok (last)`. The page emits 1, 2, 3 (ring = 2, 3); the buffer holds 1; `complete()` emits 1 again.
- **I23** (R+S no catchUp, 7): `down`, `append` x2, `value`, `live()`, `append`, `value`: position 2 is a hole inside one cut. The same with `down` in place of `live()` (catchUp configs).
- **I20, "at most one start"** (R+S, 2): `inner proof(b)` -> `inner reset(r, at)`; also `inner live()` -> `inner reset`.
- **I22b** (liveness): an `empty with next` page repeats at `emptyRun` 3 for ever.

## Findings: new contradictions and gaps in revision 3 (N), with lines
- **N1 (I15 vs 3.6, 685 and 687, 709)**: `end` and release add `feedEnded`, but a read that started after them lands and removes it, so r is fresh while the session is `Ended` or `Releasing`. I15 demands `st = Live`.
- **N2 (3.4, 620, 634, 647 vs I13 at 707)**: `ring` keeps the newest `bufferSize` page positions, `buf` the oldest socket positions. When a repair overlaps the socket by more than `bufferSize`, a buffered position that is not in the ring clears it and is emitted twice.
- **N3 (3.1, 527 and 563-564 vs I23 at 717)**: an owed `missed Unproven` suppresses the `missed` of the next unproven start (and `Dropped` + `down` keeps `owed`, 547), so values lost on the SDK's own re-registration leave a hole inside one cut. Also `CannotRepair(continueAt)` (648): buffered positions at or below `continueAt` are emitted after the page values (out of order).
- **N4 (I20 at 714 vs 642 and 644)**: a `reset` after a registering `proof`, `live()` or `lost` in one connection is a second start before the first value.
- **N5 (647)**: `emptyRun = 2` fires once; the third and later empty pages with a next cursor are not caught, so I22 needs fairness.
- **N6 (606 vs 612-613)**: the Room cell returns a resolved promise, the note says the emit that fills the last slot waits. Modelled per the note (`wt`).
- **N7 (I24 at 718)**: it does not cover the slot staying stale when a newer value equals `heard`; I added `I24x` (the delivered slot equals the current value). It passes.
- **N8 (I1 at 695)**: I1 reads only session events, so an evicted `down` or an order-blind merge cannot violate it. The listed mutants (721-723) are killed by my adapter-level `I1a` and `CB-status`, not by I1 or I8.
- **N9 (527)**: "then `owed = false`" read as unconditional.
- **N10 (mutants)**: "`fresh` emitted on a reconnect" is equivalent: 3.1 treats `fresh` outside `Opening` as `live()` (542), and `Opening` is left by any signal. "`signalled` not set by the implicit live" is only visible after a repair is abandoned by `down` (645 leaves `signalled` alone).
- Revision 2's F1 to F3, F5, F7, F8, F12 (my numbers) are fixed by 3.1 to 3.4; the old X1, X2, X4, G1 and G2 checks are gone.

## Invented behaviour left
Server nondeterminism (positions, registration at the live signal, a proof replays from `last`, `restartAt` = head, `CannotRepair(continueAt)` = head); time reduced to "stable"; `at`, `dropAt`, `startAt` not modelled;
`lost` versus `reset` rank; one covering session, at most 3 reads in flight, reads landing oldest first, `subscribed` toggling; restart = release + successor with `own = false`; eager pump drain between reconnect events.
Removed (now specified): the page-retry delay input, a `failure` behind an item in flight, `release` in `Done`, the server model.

## Mutations (REPAIR=1 turns off N1, N2, the repeated-`down` part of N3 and `continueAt` so they do not mask)
| Mutant | Killed by |
| --- | --- |
| fact before `missed`; `fresh` on a reconnect | I1, I23; fresh: **survives** (equivalent, N10) |
| value before live read as proven | I1 |
| budget reset on first value; `liveSince` not cleared | I12 |
| status evicted; group emits `down` before `live` [C4] | I1a, CB-status, CB-order |
| state delivery after a drop; value after `down` current; value after `down` own [C3] | I9; I16; I16 |
| equality on facts; completing on empty page or stream end | I3; I18 |
| catch-up before live; C1 proof announced early; `last` = highest | I23; I23; I4 |
| page failure drops socket; restart before scope closed | I19; I10 |
| proof re-confirms restored; buffer emitted on abandon; page after drop | I17; I21; I21 |
| `signalled` unset by implicit live; ring emptied at complete | I20; I13 |
| re-confirm not offered; slot kept when equal | I24; I24x |
| listen: unproven or pending start withdrawn; progress by superseded Attempt | I15 (both); I14 |
| C2 CannotRepair not an exit; C6 overflow ends | I22; C6-overflow |
| C5 time across clocks | not killable (no invariant reads a time) |
