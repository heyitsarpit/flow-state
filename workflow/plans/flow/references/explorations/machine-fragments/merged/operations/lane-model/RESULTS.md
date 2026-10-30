# Write-lane model: results against proposal.md revision 13 (3729662e, OD25)

Files: `model.ts` (lane), `events.ts` (alphabet), `main.ts` (explorer), `audit.ts` (UnresolvedHold), `identity.ts` (two identities),
`system.ts` (actor record, leaves, delivery), `mutations.py`, `output.txt`, `mutations-output.txt`.
Run `tsc -p . && bun main.ts` (25 s), `python3 mutations.py` (about 7 min, 21 mutants, trimmed system matrix).

## What changed in the model (revision 13; revisions 10 to 12 as in git history)
- **C5:** under `cancel`, a persisted identity's `unknown` that lands (or is re-delivered by a refused re-send) with no live actor keeps its lane
  `Held (parked)` between turns; ensure delivers it (current, from the active leaf) and `HeldThisTurn` starts there, so the handler's `retry` re-sends.
- **C6:** `UnresolvedHold` counts an `idle`-guarded commit as reachable for `reject`'s terminal pass (and it never owns a hold).
- **C7:** `retry`/`cancel` stop the arrival search only where the hold already exists (behind `retryable`, or in a handler of U).
- **C8:** an acknowledged re-send waiting for its capture is unchanged by `dispose`; the Runtime captures it and then invokes it (already how
  the events work: `capture` and `invoke` are enabled with no actor).
- New output: `RESULT mode=audit-<policy> inv15` (every stuck machine is flagged, except the by-design terminal pass).

## Results
| # | reject / latest / serialize | cancel / allow |
| --- | --- | --- |
| 1, 2, 4, 5, 6a, 7, 9, 11, 12 | PASS | PASS |
| 3 | PASS except the stated limit F1 (a released Attempt landing late) | not claimed |
| 8 | 33/33 cells | HeldThisTurn table (29/33 of the holding cells) |
| 13, 14, 16, 17 | PASS (persisted; root, and PAYING with explicit ignores) | PASS |
| **18** | PASS | **PASS** (was FAIL in revision 12: C5 fixed) |
| **15** | PASS: every stuck machine is flagged, except the 56 `reject` terminal-pass machines (no commit reachable) | |
| local actors (`inv2-local`) | stated limit (L1) | |

- **15 in detail.** 3,500 machines per policy. `latest`/`serialize`: stuck and flagged 2,130, stuck-not-flagged **0**. `reject`: stuck and flagged
  2,074, stuck-not-flagged **56, all with no commit reachable** (5.1 `LEFT`, by design). Flagged-but-never-stuck 640 to 648, all behind a
  `retryable` guard (rule 3, stated). Revision 12's 960 idle-guarded-commit and 14 retry-stop misses are gone.
- **18 in detail.** `Pay -> ack(1) -> invoke(1) -> retain-expiry -> end-unknown(1) [no actor] -> ensure` now delivers the parked unknown to a
  lane that is `Held (parked)`; the handler's `retry` re-sends the same id. Also covered: a refused re-send with no actor, parked the same way.
- Stated, not new: F1 (7 to 8 events: `commit;commit -> ack(1) -> invoke(1) -> end-unknown(1)/h:cancel -> ack(2) -> invoke(2) -> land(2)`);
  L1 (`Pay -> ack(1) -> invoke(1) -> reload -> Pay -> ack(2) -> invoke(2)`, local actors).

## Counterexamples
None beyond the two stated limits above.

## Mutations (all 21 caught; checks that newly fail against the unmutated model)
| Reverted rule | Newly failing |
| --- | --- |
| revision 10 to 12 rules (interrupt, promote, invocation, cancel by history, serialize hold, HeldThisTurn, F8, F2, F3, F5, K21, K25, K26, G3, H1, M3, M4, H2) | as before; see `mutations-output.txt` |
| **C5** a parked unknown is evidence at once under `cancel` | inv 18 (persisted, `cancel`) |
| **C6** an idle-guarded commit is exempt from the terminal pass | inv 15 (`reject`) |
| **C7** `retry`/`cancel` stop the arrival search everywhere | inv 15 (all three policies) |

## Contradictions and gaps (revision 13)
No new contradiction. Remaining notes:
- **N1.** A `cancel`/`allow` lane restored while no incarnation lives is modelled as `Held (parked)` (OD25's sub-table), including after a reload;
  the sub-table's `restore` row says so. The model keeps the holding-table `pending`/`uncertain` flags false for it under `cancel`
  (`pending` is `InFlight` only), which the text leaves open.
- **N2.** Rule 3's `retryable` over-approximation still flags 640 to 648 machines that never get stuck (stated limit).
- **N3.** The hydration cells stay untestable by construction (G6, stated).

## Where I invented behaviour
`Superseded` is never delivered; delivered `NotSent` kinds are Rejected, Cancelled, Overloaded, StorageRefused, Restored, Disposed; a head that
settles before the final capture is modelled as success or failure (two variants); the final capture always succeeds; capture is continuous;
`allow` is exercised in the lane model only (the machine layer uses `reject`, `latest`, `serialize` and `cancel`); the machine is three leaves
with memory-free handlers.
