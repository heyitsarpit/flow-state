# Streams state machines: model results against proposal-v2.md revision 4.1 (9f890f61), section 3

Files: `model.ts` (3.1 to 3.6; `CONFIG` holds the mutable rules), `main.ts` (explorer, systems, checks), `mutations.py`, `output.txt`, `mutations-output.txt`.
Run `tsc -p . && bun main.ts` (29 s), `python3 mutations.py` (about 14 min, depth 9). No isolation switch: the baseline runs as the text states it. Line numbers are proposal-v2.md at 9f890f61.

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
| I13 | PASS (N1 fixed by rev 4.1) | I20 | PASS (restated) |
| I14 | PASS | I21 | PASS |
| I15 | PASS (impl equals the function) | I22a | PASS (bound 6) |
| I16 | PASS | I22b | PASS under P4 (empty pages excluded) |
| I17 | PASS | I23 | PASS |
| I18 | PASS | I24 | PASS (value check included) |
| I25 | PASS (adapter to session) | I26 | PASS (restore clause holds after a drop and an end) |

Revision 3's failures are fixed: owed `missed` (I23), `reset` after a start (I20), ring size (the meet), `emptyRun` (I22), freshness after an end (I15), the Room cell promise, I24's stale slot, group order.

## Counterexamples
None: all invariants pass inside the bounds. Revision 4.1 fixes both findings of the previous run: a late socket value already in `seen` is dropped (N1), and `down`/`end` move `last.at` only for a confirmed `last` (N2).
My own first run of the restored-age check failed on `down, value, proof, tick, down`: a value received in an earlier drop keeps that drop's time, so "at = dropAt" applies only to the current interruption; `lastDrop` is cleared at a start.

## Findings: contradictions and gaps in revision 4.1
- **(none new)** The remaining notes are unchanged readings, below.
- **R1 (I26)**: a value received in `Dropped` is checked against `dropAt` and a restored value against its age only for `state`; for `facts` the time variables carry no meaning, so I do not model them there.
- **R2 (3.4: 671 and P1 at 733)**: `continueAt` is only specified through "pages meet `buf` or precede it". The model gives the server the rule that retention never passes the registration point; without it the pages can start after `buf` and never meet it.
- **R3 (I25 at 765)**: "merges of signals with no value between them" does not say what a merge may keep. The model reads it as: a down never disappears, the last pulled signal matches the last emitted (down or live), and a pulled live is not stronger than the weakest live emitted since the previous pulled live.
- **R4 (3.6: 713-723)**: with one covering session and "one in flight and one trailing" the model keeps the current read and at most one older read. A read that lands while a newer one has started does not make r landed.
- **R5 (3.7 mutant list at 782)**: "`fresh` on a reconnect" is dropped as equivalent, as stated. "`catchUp` before live (FC51; I23)" is killed by I20 here (the proof is announced before any live signal), not by I23.

## Behaviour I had to invent
Server nondeterminism (positions, registration at the live signal, a proof replays from `last`, `restartAt` = head, `CannotRepair` offered only when `cursor + 1 < ret`, `continueAt = ret - 1`); the clock (saturating at 2 for S, 3 for R, `resetAfter` = 1 tick);
`lost` versus `reset` rank; one covering session; restart = release + successor with `own = false`; I25's merge rule (N5); eager pump drain between reconnect events; times only for `state`.
Removed (now specified): the page-retry delay input, a `failure` behind an item in flight, `release` in `Done`, the server model, the `listen` event bookkeeping, the epoch ghosts (replaced by I25).

## Mutations (35, no isolation switch; each fails a check that passes on the baseline; all 35 killed)
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
| C1 proof announced early; dedupe by newest page positions instead of the meet | I23; I13, I23 |
| C2 CannotRepair not an exit; C6 overflow ends | I22b; C6-overflow |
