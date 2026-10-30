# Streams state machines: model results against proposal-v2.md revision 2, section 3

Files: `model.ts` (3.1 to 3.4, `CONFIG` holds the mutable rules), `main.ts` (explorer, systems, checks), `mutations.py`, `output.txt`, `mutations-output.txt`.
Run `tsc -p . && bun main.ts` (28 s), `python3 mutations.py` (about 8 min). All line numbers below are proposal-v2.md.

## What is modelled
- **S**: 3.1 and 3.2 under all 12 inputs, `facts` and `state`, restart/reload with a successor. Exhaustive fixpoint (823 and 3,099 states).
- **CB+S**: 3.3 with `bufferSize` 2 feeding the session, including the pump's interleavings. Fixpoint (643k and 390k states).
- **R+S**: 3.4 (13 inputs, schedule length 2, page schedule 2, buffer 2, server head up to 3) feeding the session, three configs (catchUp with `from` 0, catchUp with no `from`, no catchUp).
  **Bounded to 9 inputs** (the section asks for about 8); the pump drains to rest between reconnect events. `resetAfter` is "stable / not stable" (a `tick`), checked in a clock-only run `R/budget` (fixpoint or 11 inputs).
- Coverage: 3.1 all 43 defined cells reached for both kinds, the 29 cannot-occur cells never fire. 3.4: all 32 defined cells reached (33 cannot). 3.3: all 17 cells reached.

## Invariants (PASS = no counterexample in the bounds above)
| # | Result | # | Result |
| --- | --- | --- | --- |
| I1 | **FAIL as worded** (F4); the relaxed reading I1* passes in S and R+S, **fails in CB+S** (F5) | I12 | PASS if liveSince is cleared at connect; **FAIL on the literal table** (F8) |
| I2 | PASS (cell counts 43/29 and 32/33 match 487; no unreached defined cell) | I13 | **FAIL** (F6) |
| I3 | PASS | I14 | NOT MODELLED (no row, Attempt or setter in 3.1 to 3.4) |
| I4 | PASS | I15 | NOT MODELLED (no covered answer or `listen` read in 3.1 to 3.4) |
| I5 | PASS by construction (`resume` is written only at admission) | I16 | PASS |
| I6 | PASS (conservation and drain) | I17 | PASS |
| I7 | PASS | I18 | PASS, with the `restartAt` exception (F9) |
| I8 | PASS | I19 | PASS |
| I9 | PASS | I20 | **FAIL** (F7) |
| I10 | PASS | I21 | PASS |
| I11 | PASS (discard path only; no stale-mailbox model) | I22 | PASS (Live is reached on every good path; needs no endless empty pages with a next cursor) |

## Counterexamples (shortest, `output.txt` has all)
- **I1** (S facts, 8): `Feed.down` -> value -> admit, turn end, admit, turn end -> `Feed.live()` -> value.
- **I1/I1*, CB-order** (CB+S, 2 to 6): `emit(live proof)` -> `emit(down)` -> pull -> pull: the group becomes `down` then `proof`, so the session is Live while the adapter is down.
- **I13** (R+S, 4): `inner live()` -> `server append` -> `page ok (more)` -> `inner value`: the socket delivers position 1 again after the page already did.
- **I20** (R+S, 5): `append`, `value` (implicit live), `Feed.down`, `append`, `value`: a second implicit live in one connection.
- **I12** (literal reading, 8): `live({proof})`, `fails`, `tick`, `delay`, `fails`, `delay`, `fails`, `delay`: four connections, none live.
- **G1** (R+S, 8): buffered `live({proof})` is flushed after a buffered gap value at `restartAt`. **G2** (9): see F6.
- **X1** (S state, 3): `value 1`, `value 0`, admission. **X2** (3): `down`, `value 0`, `live({proof})`. **X4** (3): `value 0`, `stream fails`, admission.

## Findings (ambiguities and contradictions; X, G are my extra checks, not I1 to I22)
- **F1 (X4)** 479-480 say a failure is delivered "after what is queued"; 512 admits a value only if `st = Live`. The queued value is discarded as `NotLive` once the stream has ended, so the last value of a state feed that completes is never heard.
- **F2 (X1)** 510 sets the slot only for a value "not equal to `heard`". With a value queued, a newer value equal to `heard` leaves the older slot, which is then delivered: the machine hears 1 while `last` is 0.
- **F3 (X2)** 477 (Dropped: `last = v`, `own`, nothing delivered) plus 473 (a proof re-confirms an `own` `last`) show a value in the row that the machine never heard. The tables do not set the slot at re-confirm.
- **F4 (I1)** 474 skips `missed` in Dropped when `owed`; I1 (569) says "since that start". Reading I1* (an owed `missed` covers the new start) is what the table does. Decide which is meant.
- **F5 (3.3)** 529 and 535: a group emits `down` then `live` whatever the order. `[proof, down]` ends Live (wrong). Also the tie `lost` vs `reset` (same rank, 529) is unspecified; I kept `reset`.
- **F6 (3.4)** 553 drops buffered values already in `pageSet` only at completion, and "until the first that is not": a leading buffered signal stops it, and a socket value in flight at completion is not filtered. Both emit a position twice (I13), and `last` goes backwards (G2).
- **F7 (I20)** 552 does not set `signalled` on an implicit live, so after a `Feed.down` (551) the next value implies a second live in the same connection.
- **F8 (I12)** 551, 556, 558: only `Live` + `down` cancels `liveSince`; failing in `Connecting` or `CatchingUp` + `down` keeps a stale one, so a connection that never went live resets the budget (562-563 says it must not). Baseline = cleared at connect and at every drop.
- **F9 (I18)** 550 (`restartAt` in `CatchingUp`) leaves for `Live` without `next = none`, against 586; it also flushes buffered signals before the `Reset`.
- **F10 (not counterexampled)** 551 (`down` in `CatchingUp`) flushes a buffer that can follow a gap and moves `last` past unfetched positions.
- **F11** 548 emits `Feed.live({ proof })` when the repair starts, before any page succeeds; a state session re-confirms `last` at once (473).
- **F12** Missing cells: facts column with an item in flight has no row for `defect` / interrupt (3.2, 507-514; not enabled); no input for the page-retry delay (554; I added `page retry delay elapsed`);
  exhausted page schedule does not say the socket is closed (554); `release` leaves the phase open and is "—" in Done (559; Done + `rel` flag); `release` in a closed `Feed.callback` queue is "—" (533) but must be possible (reached);
  `pull` with `released` and `closing = open` is unspecified (modelled as end).
- **F13** The listed mutant for FC51 (597) is not killed by I4 in this model, but by G2 (late registration leaves a gap under a standing proof).

## Behaviour I had to invent
Server model (positions, `head`, socket registers at the live signal, a proof replays from `last`, `restartAt` = head, an SDK drop re-registers at head); page results `more`, `empty with next`, `last`; the page-retry delay input;
restart = release + successor (`own = false`, `heard` kept); `at` omitted (no effect); drop reasons collapsed to 2; epoch ghosts for I1 and `resume` for I5; the eager pump drain in R+S; failures on facts only when nothing is in flight.

## Mutations (all 16 listed; 14 killed by a newly failing check, 2 not modellable)
| Mutant | Killed by |
| --- | --- |
| fact before `missed` (I1); value before live read as proven (I1) | I1* (S facts) |
| status evicted on overflow (I1) | I1*, CB-status (CB+S; `REPAIR=1` hides F5 so the baseline passes) |
| budget reset on first value (I12) | I12 |
| state delivery after a drop (I9); value after `down` current (I16); proof re-confirms restored (I17) | I9; I16; I17 and I8 |
| equality on facts (I3); catch-up completing on empty page or stream end (I18); page failure drops socket (I19) | I3; I18 and G1c; I19 |
| restart before scope closed (I10); `last` = highest seen (I4); page values after a drop (I21) | I10; I4; I21 |
| catch-up before live (FC51) | G2 (from none), not I4 (F13) |
| listen staleness (I15); progress by a superseded Attempt (I14) | not modelled (see the table above) |
