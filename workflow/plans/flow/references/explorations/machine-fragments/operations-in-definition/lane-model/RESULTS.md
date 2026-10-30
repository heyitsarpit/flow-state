# Write-lane model: results against proposal.md revision 10 (commit 65f542fe)

Files: `model.ts` (lane), `events.ts` (alphabet), `main.ts` (explorer), `audit.ts` (UnresolvedHold), `identity.ts` (two identities),
`mutations.py`, `output.txt`, `mutations-output.txt`. Run `tsc -p . && bun main.ts` (17 s), `python3 mutations.py` (about 15 s).
Line numbers are `proposal.md` at revision 10.

## What is modelled
- One lane, one key, all five modes; the 16-row table as code. Each use of a row looks up its (row, state) cell and flags the 15
  "cannot occur" cells. Members, guards, several members per turn, endings (success, failure, unknown, interrupt), the one acknowledgement
  per Attempt (accepted or refused), invoke, dispose, rebind, reload (restore), Runtime disposal, SSR hydration, and turns ending
  `ok`, `Denied`, `Unhandled`, `InvalidTurn`. A server applies requests in any order, once per Attempt id, or refuses for good.
- Revision 10 additions: `retryCount` counted at the invoked cell; a refused re-send returns to `Held` and re-delivers `unknown`
  (`StorageRefused`); a Held lane is delivered `unknown { Restored }` once per incarnation on rebind and on reload; the full `cancel`/`allow`
  table; `NotSent { Disposed }`. Every invented behaviour that the text now states was removed.
- Identity (`identity.ts`): two identities on one contract and key are two lanes with one server value; a new incarnation adopts only its
  own identity's lane. Bounds: 1 commit per lane there.
- Search: breadth-first with state merging over the whole finite state space ("complete": every sequence of any length). Bounds: 3
  commits (cancel, allow: 2), invoked re-sends saturate at 2, `serialize` queue cap 2 (proposal 64), one in-flight copy per request.
  Raw enumeration of all sequences to depth 6 (reduced alphabet, no merging) agrees with the merged search.
- New check, inv 9: a Held lane with a live incarnation has always been told of its unknown (every entry into `Held` reaches a
  handler). Inv 11/12 (identity): endings and `Restored` reach only the owning identity; a turn of one identity never changes another's Attempts.

## Invariants (revision 10)
| # | reject / latest / serialize | cancel / allow |
| --- | --- | --- |
| 1 ending never dropped; `NotSent` only if never sent | PASS | PASS |
| 2 nothing newer sent past an unresolved unknown | PASS | n/a |
| 3 server = latest eligible commit | PASS, except the stated limit F1 below | not claimed |
| 4 no double send | PASS | PASS |
| 5 flags match definitions | PASS | PASS |
| 6a every state reaches Idle | PASS | PASS |
| 6b UnresolvedHold vs stuck | only the by-design `reject` terminal pass (below) | |
| 7 cannot-occur cells never reached | PASS | PASS |
| 8 all 33 reachable cells visited | PASS (33/33 per policy) | the `HeldThisTurn` table has no held cells: 29/33 of the holding table |
| 9 no silent hold | PASS | PASS |
| 11, 12 identity | PASS | |

## Counterexample (the only one)
- **F1, inv 3, stated limit** (all holding modes; unchanged, and kept in revision 10 as "a released Attempt landing late"). The write
  the user released can land after a newer one. `commit;commit -> ack(1) -> invoke(1) -> end-unknown(1)/h:cancel -> ack(2) -> invoke(2) ->
  land(2)`, then c1 lands last: server=1, latest commit=2 (7 events `serialize`, 8 `reject` and `latest`). Cancelled-yet-landed: 4 events.

## inv 6b: UnresolvedHold against stuck states
3,500 small machines (2 leaves, one user event per leaf, one `unknown` handler; guards none/idle/retryable; members none/retry/cancel/commit)
in product with the lane. Stuck = a bound lane that cannot reach Idle without a host move.
- `latest`, `serialize`: stuck and flagged 2,130; flagged, never stuck 648; **stuck, not flagged 0**.
- `reject`: stuck and flagged 2,074; flagged, never stuck 640; **stuck, not flagged 56, all the terminal pass** (5.1 `LEFT`: the
  machine leaves the hold on purpose, 3.7). Revision 9's 240 refused-re-send and 18 reload misses are gone: both deliver `unknown` now.
- False positives are `retryable`-guarded edges that cannot pass in `Idle`, so the leaves the rule counts are unreachable.

## Mutations (`mutations.py`; all 11 caught; checks that newly fail against the unmutated model)
| Reverted rule | Newly failing |
| --- | --- |
| interrupted Attempt becomes `Held` | inv 2, 3, 5 (all holding modes, identity) |
| promote only on release | inv 3, 5 (latest, serialize) |
| invocation whatever the turn's outcome | inv 3 (latest, serialize) |
| `cancel` by history | inv 1, 2, 3 (all holding modes), inv 1 (cancel) |
| the `serialize` hold | inv 2, 3, 5 (serialize) |
| `HeldThisTurn` | inv 5, 7 (cancel, allow) |
| ending kept on a non-ok turn (F8) | inv 1 (all) |
| **F2** acknowledgement once per Attempt | inv 1, 2, 3 (all holding modes), inv 1 (cancel, allow) |
| **F3** a reload delivers a Held lane | inv 9 (all holding modes, identity) |
| **F5** a refused re-send re-delivers `unknown` | inv 9 (all holding modes, identity) |
| **K21** lane identity | inv 11, 12 (identity) |

`output.txt` also re-runs the model with F2, F3 and F5 switched off (revision 9 behaviour): inv 1, 2, 3 and 9 fail again.

## New ambiguities and gaps (revision 10)
- **G1 (line 813, restore, `InFlight`).** "An Attempt acknowledged once restores as `unknown { Restored }`" includes one acknowledged but
  never invoked (waiting on the record queue). It was never sent, yet becomes an unknown, so `retry` makes its first send. Modelled as written.
- **G2 (line 814 vs 871-872, Runtime disposal under `cancel`/`allow`).** The row says "as the holding table", whose waiting re-send goes
  to `Held`; the second table says `HeldThisTurn` "cannot occur" and cannot outlast a turn. Modelled: evidence, lane `Idle`.
- **G3 (line 814, 962).** "An ending that settles before the final capture is saved as a pending mapped outcome ... delivered to the
  restored incarnation." Its interaction with `unknown { Restored }` for the same Attempt (one delivery or two) is not said. Not modelled;
  the model takes the "else unknown" branch.
- **G4 (lines 715, 750-751).** Principle 2 says a sent Attempt's ending is always delivered; local actors' lanes are never persisted, so a
  write sent by a local actor before a reload has no lane afterwards and its landing is unseen. Not modelled (single persisted identity);
  principle 2 needs an exception.
- **G5 (line 813 restore, `InFlight`, never acknowledged).** "Ends `NotSent { Restored }`" with no promotion; `W` ends the same way, so the lane
  becomes `Idle`. Consistent, but "an unknown, a retry and a restore never promote" (line ~766) is what makes it work; worth one sentence.
- **G6 (line 814, hydration).** Only the `Idle` cell is observable (a no-op); the two "cannot occur" hydration cells cannot be tested.
- Still stated, not new: two identities' lanes on one key are unordered, so inv 3 does not hold across them.

## Where I invented behaviour
`NotSent` deliveries are counted but run no handler; evidence endings of non-addressable Attempts; the retry saturation; G2's evidence;
inv 3 treats a failed commit as ineligible and classes a released Attempt that lands as the stated limit, not a failure.
