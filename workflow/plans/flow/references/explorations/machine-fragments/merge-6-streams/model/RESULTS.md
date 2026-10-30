# Streams state machines: model results against proposal-v2.md revision 7.1 (f055417c), section 3

Files: `model.ts` (3.1 to 3.6; `CONFIG` holds the mutable rules), `main.ts` (explorer, systems, checks, replayed cases), `mutations.py`, `output.txt`, `mutations-output.txt`.
Run `tsc -p . && bun main.ts` (43 s), `python3 mutations.py` (about 20 min, depth 8). No isolation switch. Line numbers are proposal-v2.md at f055417c.

## What is modelled
- **S**: 3.1 (16 inputs x 6 states) and 3.2, `facts` exhaustive; `state` bounded (600k states, 7 inputs; the 3.1 state cells are also reached in the other systems). `registered` is a slice variable (outside the session), carried to successors.
- **S+L**: 3.6 as the freshness function against the table's implementation; bounded.
- **CB+S**: 3.3 with I25's end-to-end comparison. Exhaustive.
- **R+S**: 3.4 feeding a session, five configs (catchUp from 0, catchUp with empty `from`, no catchUp from 0, no catchUp with empty `from` and no positions, no catchUp with no `from`). **Bounded to 9 inputs.** Each also has a **second-session move** (release, re-entry, thaw, reload): the memory's `registered`, `resume` and covered position persist, `from` is refilled from memory when declared.
- **PL**: placements. Two paths with an equal key, freeze, thaw, `resetOn` (a new path, a fresh slice, `registered` clear). Identity per path, the wait per (actor, operation, key) at any path. **P**: 3.5.
- Coverage: 3.1 all 55 defined cells; 3.4 all 32; 3.3 all 18; 3.5 all 6; 3.6 reads.

## Invariants
| # | Result | # | Result |
| --- | --- | --- | --- |
| I1 to I22b | PASS | I25, I26 | PASS |
| I10 (identity and wait, per path) | PASS | I27 | PASS (new) |
| I23 | PASS (N1 fixed by rev 7.1) | I24 | PASS |

## Review cases (replayed in `output.txt`)
- RV4 H1, a quiet first connection, a drop, a reconnect: the first start is `fresh`, the second is answered `unproven` (so `missed`).
- Two-session walks, a quiet positioned feed and a quiet Socket.IO room: the second session's first start is `unproven` (`registered` survives). With `registered` scoped to the session it is `fresh` (I27, I23).
- RV4 M1, a successor at another path while the predecessor is `Releasing`: it waits; it starts after `scope closed`.

## Counterexample
None: all invariants pass. Revision 7's counterexample (`inner down`, `append`, `append`, `inner value`, `inner live()`, `append`, `inner value`) now gives `unproven` on the `live()`, so `missed` reports the lost position (replayed as CASE N1 in `output.txt`).

## Findings: contradictions and gaps in revision 7.1
- **R1 (I27)**: for `settle(lost)` the model compares the delivered `initial` with the `registered` of the slice before the pending start, as written. It holds.
- Unchanged readings: `continueAt` (2.3), I25's merge rule, 3.6 under one covering session.

## Behaviour I had to invent
Server nondeterminism (positions, registration at the live signal, retention never passing the registration point, `CannotRepair` only when the log no longer reaches the cursor); the machine's `missed` handler (it ignores an initial `Unproven` on an empty memory, per S10) and the hole check I23 reads from it (a covered position, kept across sessions); the second-session move; the clock; one covering session for 3.6; placements limited to paths A, B, A2.

## Mutations (44: 43 killed, each by a check that passes on the baseline; 1 equivalent survivor, H1 of RV3)
| Mutant | Killed by |
| --- | --- |
| the 35 of revision 4.1 (I1, I3, I4, I9, I10, I12 to I26, C1, C2, C6, ...) | as in `mutations-output.txt` |
| H1 (RV3): `fresh` without a declared `from` | **survives**: equivalent since rev 7, because `registered` (set by every start and value, persisted) already turns a second session's `fresh` into `live()` |
| H2: identity without the placement path | I10s (the second placement stalls) |
| H3: pages not oldest first | I13, I23 |
| RV4 H1: a handler ignoring any non-initial `Unproven` on an empty memory | I23 |
| RV4 M1: a successor at another path not waiting | I10 |
| RV5 H1: `registered` scoped to the session | I27 |
| RV5 M2: `initial` lost on `settle(lost)` | I27 |
| RV5 M2: an ignore guard that also ignores `Lost` | I23 |
| rev 7.1: a delivered value does not set `registered` | I27 (and I23) |
