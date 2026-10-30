# Streams state machines: model results against proposal-v2.md revision 4 (bf249a24), section 3

Files: `model.ts` (3.1 to 3.6; `CONFIG` holds the mutable rules), `main.ts` (explorer, systems, checks), `mutations.py`, `output.txt`, `mutations-output.txt`.
Run `tsc -p . && bun main.ts` (29 s), `python3 mutations.py` (about 12 min, depth 9). No isolation switch: the baseline runs as the text states it. Line numbers are proposal-v2.md at bf249a24.

## What is modelled
- **S**: 3.1 (16 inputs x 6 states) and 3.2, `facts` and `state`, with a clock (saturating at 2), restored `last` with a transferred age, restart and successor. Exhaustive (4,796 and 379,316 states).
- **S+L**: S with 3.6 attached: the function `fresh(r)` against the table's implementation, reads (one trailing), refetch. Bounded at 12 inputs.
- **CB+S**: 3.3 (group `(down1, live, down2)`, waiters) feeding a session, `bufferSize` 2, with I25's end-to-end comparison. Exhaustive (1.03M and 590k states).
- **R+S**: 3.4 (14 inputs x 5 phases, `buf`, `seen`, `tail`, meet, `emptyRun >= 2`, `CannotRepair`) feeding a session, four configs (catchUp from 0, catchUp with no `from`, no catchUp, no positions).
  **Bounded to 10 inputs**; server per 3.7: head up to 3, retention drops a prefix (never past the registration point), the socket lags at most `bufferSize` (P1 to P3). P4 is the fairness filter of I22b.
  `resetAfter` is one tick of a clock in a clock-only run (`R/budget`).
- **P**: 3.5, exhaustive. Coverage: 3.1 all 55 defined cells (41 cannot never fire); 3.4 all 32 (38); 3.3 all 18; 3.5 all 6; 3.6 reads and refetch.

## Invariants (PASS = no counterexample inside the bounds)
| # | Result | # | Result |
| --- | --- | --- | --- |
| I1 to I12 | PASS | I19 | PASS |
| I13 | **FAIL** (N1) | I20 | PASS (restated) |
| I14 | PASS | I21 | PASS |
| I15 | PASS (impl equals the function) | I22a | PASS (bound 6) |
| I16 | PASS | I22b | PASS under P4 (empty pages excluded) |
| I17 | PASS | I23 | **FAIL** (N1) |
| I18 | PASS | I24 | PASS (value check included) |
| I25 | PASS (adapter to session) | I26 | PASS (with N2) |

Revision 3's failures are fixed: owed `missed` (I23), `reset` after a start (I20), ring size (the meet), `emptyRun` (I22), freshness after an end (I15), the Room cell promise, I24's stale slot, group order.

## Counterexample (shortest; `output.txt` has all)
- **I13 and I23** (R+S, 6): `inner live()` -> `append` -> `append` -> `page ok (more)` -> `inner value` -> `page ok (more)`.
  Page 1 emits position 1; the socket then delivers 1 into `buf`; page 2 emits 2 and finds no meet (`buf` = [1]); `next = none`, `complete()` emits 1 again, after 2.

## Findings: contradictions and gaps in revision 4
- **N1 (3.4: 648-650 and 669 vs I13 at 753, I23 at 763)**: the meet compares a page value with `buf` only when the page value arrives. A socket value that arrives after a page already returned its position goes into `buf` unchecked (669) and `complete()` emits it again (656-657). P3 allows this (the lag may be up to `bufferSize`). The `seen` window is not consulted for it. The fix is to drop a socket value whose position is in `seen`, or to count it as the meet.
- **N2 (3.1: 551 and 565 vs I26 at 766)**: `end(f)` and `down` in `Live` set `last.at = now` even for a restored `last` that was never confirmed. After that `now - last.at` no longer equals the transferred age. I26's restore clause holds only until the first drop or end, so I check it only while `last` is untouched.
- **N3 (I26)**: a value received in `Dropped` is checked against `dropAt` and a restored value against its age only for `state`; for `facts` the time variables carry no meaning, so I do not model them there.
- **N4 (3.4: 671 and P1 at 733)**: `continueAt` is only specified through "pages meet `buf` or precede it". The model gives the server the rule that retention never passes the registration point; without it the pages can start after `buf` and never meet it.
- **N5 (I25 at 765)**: "merges of signals with no value between them" does not say what a merge may keep. The model reads it as: a down never disappears, the last pulled signal matches the last emitted (down or live), and a pulled live is not stronger than the weakest live emitted since the previous pulled live.
- **N6 (3.6: 713-723)**: with one covering session and "one in flight and one trailing" the model keeps the current read and at most one older read. A read that lands while a newer one has started does not make r landed.
- **N7 (3.7 mutant list at 782)**: "`fresh` on a reconnect" is dropped as equivalent, as stated. "`catchUp` before live (FC51; I23)" is killed by I20 here (the proof is announced before any live signal), not by I23.

## Behaviour I had to invent
Server nondeterminism (positions, registration at the live signal, a proof replays from `last`, `restartAt` = head, `CannotRepair` offered only when `cursor + 1 < ret`, `continueAt = ret - 1`); the clock (saturating at 2 for S, 3 for R, `resetAfter` = 1 tick);
`lost` versus `reset` rank; one covering session; restart = release + successor with `own = false`; I25's merge rule (N5); eager pump drain between reconnect events; times only for `state`.
Removed (now specified): the page-retry delay input, a `failure` behind an item in flight, `release` in `Done`, the server model, the `listen` event bookkeeping, the epoch ghosts (replaced by I25).

## Mutations (35, no isolation switch; each fails a check that passes, or fails differently, on the baseline)
| Mutant | Killed by |
| --- | --- |
| fact before `missed`; value before live read as proven | I1 |
| budget reset on first value; `liveSince` not cleared | I12 |
| status evicted; group emits `down` first; merge upgrades an answer (**kills I25**) | I25 (and CB-order, CB-upgrade) |
| state delivery after a drop; value after `down` current; value after `down` own | I9; I16; I16 |
| equality on facts; completing on empty page or stream end | I3; I18 |
| `emptyRun` exactly 2; `pageSched` refreshed by empty pages | I22a |
| page failure drops socket; restart before scope closed; `last` = highest seen | I19; I10; I4 |
| proof re-confirms restored; buffer emitted on abandon; page values after a drop | I17 (also I8, I26); I21; I21 |
| owed `missed` suppresses a start's own; second `down` keeps `owed` | I23 |
| `signalled` unset by implicit live; catch-up before live | I20 |
| re-confirm not offered; stale slot kept | I24; I24 |
| freshness after an end; kept through pending; progress by a superseded Attempt | I15; I15; I14 |
| value aged from arrival; age not rebased on restore (**kills I26**) | I26; I26 |
| C1 proof announced early; dedupe by newest page positions instead of the meet | only a different I13/I23 counterexample: the baseline already fails both (N1) |
| C2 CannotRepair not an exit; C6 overflow ends | I22b; C6-overflow |
