# Write-lane model: results against proposal.md revision 12 (HEAD 9772678a, OD22, review 10)

Files: `model.ts` (lane), `events.ts` (alphabet), `main.ts` (explorer), `audit.ts` (UnresolvedHold), `identity.ts` (two identities),
`system.ts` (actor record, leaves, delivery), `mutations.py`, `output.txt`, `mutations-output.txt`.
Run `tsc -p . && bun main.ts` (26 s), `python3 mutations.py` (about 6 min, 18 mutants, trimmed system matrix). Lines are `proposal.md` rev 12.

## What changed in the model (revision 12)
- **Parked endings are raw, on the lane record** (M3): they survive a release of the actor record, are mapped at delivery, and a fresh
  incarnation adopts them in its initial leaf. New event `release` (the actor record no longer decodes).
- **One owner test** (M2): an Attempt of this incarnation, or one whose owner activation was restored with the record, is current while
  that activation is alive and late once it ended; any other adopted Attempt, `unknown { Restored }` and `NotSent { Restored }` are current
  from the active leaf. **C3:** `NotSent { Restored }` is delivery step 2 only. **C4:** the machine's handlers use no memory set after the commit.
- **Runtime disposal** (M4, H2): `W` ends after the head's ending, so parked endings keep lane order; under `cancel`/`allow` a persisted
  identity keeps its sent work as an acknowledged `InFlight` record, restored at reload as `unknown { Restored }`; a `cancel`/`allow` lane
  restored with no incarnation waits (`await`) for the first one. **C2:** a persisted lane's re-send waits for its capture (`capture` event; a
  failure is `capture-refused`). **L1:** the local limit also covers the lost hold.
- **MD rule 20** as a static check over the arrival set (CARD, PAYING, DONE): machines with handlers at the root, or at PAYING with explicit
  ignores elsewhere, pass; handlers at PAYING only are rejected. New invariants: **16** an adopted success or failure is never silently
  ignored in a leaf; **17** parked endings keep lane order; **18** the UI never waits (PAYING) for an ending that can no longer arrive.
- `UnresolvedHold` arrivals now **stop at** `X.idle`-guarded transitions, handlers of U and `retry`/`cancel`; an idle-guarded commit no
  longer counts for `reject`'s terminal pass (M1).

## Results
| # | reject / latest / serialize | cancel / allow |
| --- | --- | --- |
| 1, 2, 4, 5, 6a, 7, 9, 11, 12 | PASS | PASS |
| 3 | PASS except the stated limit F1 (a released Attempt landing late) | not claimed |
| 8 | 33/33 cells | HeldThisTurn table (29/33 of the holding cells) |
| 13, 14 persisted (root, and PAYING with ignores; 4 modes) | PASS | PASS |
| **16**, accepted machines | **PASS**; rule 20 rejects exactly the machines that lose an adopted success (exact) | |
| 17 | PASS | PASS |
| **18** | PASS | **FAIL (cancel, persisted)** |
| 15 (UnresolvedHold vs stuck) | **FAIL**, see below | |
| local actors (`inv2-local`) | stated limit (L1) | |

## Counterexamples
- **F1** (inv 3, stated): `commit;commit -> ack(1) -> invoke(1) -> end-unknown(1)/h:cancel -> ack(2) -> invoke(2) -> land(2)`, 7 to 8 events.
- **L1** (stated, now in 748-751): `Pay -> ack(1) -> invoke(1) -> reload -> Pay -> ack(2) -> invoke(2)`: a local reload loses the hold.
- **G7, inv 18, `cancel`, persisted** (6 events): `Pay -> ack(1) -> invoke(1) -> retain-expiry -> end-unknown(1) [no actor] -> ensure`.
  The unknown lands with no actor; under `cancel` it is evidence at once (turn end, lines 945-946), but K25 parks it for the record. At ensure
  it is delivered, its handler's `retry` finds the lane `Idle` (NothingToResend), and the UI waits in PAYING for good. R9 H1's shape,
  for `unknown` under `cancel`/`allow`. The holding table keeps the hold, so it does not happen there.
- **15a** (`reject`, 960 of 1,030 unflagged stuck machines): `S0:{idle?commit->S0}`, no handler. `commit` then an unknown leaves the lane
  `Held`; the only transition is `commit` guarded by `idle`, which a held lane denies, so the user can never act again. Revision 11 flagged
  it; revision 12's rule 2 ("an X.idle-guarded commit does not count for reject's terminal pass", line 1081) passes it.
- **15b** (`latest`/`serialize`, 14 stuck machines, same in `reject`): `S0:{retry->S1} S1:{idle?commit->S0}`. The stop at `retry`/`cancel`
  (line 1079) assumes the transition resolves the hold, but it also fires while the lane is `InFlight` or `Idle` (a declined retry is
  evidence), moving the machine to S1, where the hold later arrives with no owner. 56 more `reject` machines are the intended terminal pass.
  The 644 flagged-never-stuck machines all carry a `retryable` guard (rule 3, stated).

## Mutations (all 18 caught; checks that newly fail against the unmutated model)
| Reverted rule | Newly failing |
| --- | --- |
| revision 10 and 11 rules (interrupt, promote, invocation, cancel by history, serialize hold, HeldThisTurn, F8, F2, F3, F5, K21, K25, K26, G3) | as before (see `mutations-output.txt`) |
| **H1** drop the MD rule 20 row | inv 16 (a machine rule 20 accepts loses an adopted success) and the exactness check |
| **M3** park mapped on the actor record, not raw on the lane | inv 14 (a release loses the parked ending) |
| **M4** `W` before the head's ending at disposal | inv 17 |
| **H2** `cancel`/`allow` disposal makes sent work evidence | inv 14 (persisted, `cancel`) |

## Contradictions and gaps (revision 12)
- **C5 (lines 944-946, 788).** G7 above: a parked `unknown` under `cancel`/`allow` is delivered after its Attempt became evidence, so no
  `retry` can re-send it. Either do not park it (the lane `Idle`, nothing to wait for: the machine must learn it by `NotSent`), or keep the
  Attempt as an awaiting record like H2's captured work.
- **C6 (line 1081).** Rule 2's idle-guarded commit exemption passes a `reject` deadlock (15a). Keep the exemption only when no
  non-`idle` path of that commit exists, or count it when its guard is the only way out of the leaf.
- **C7 (line 1079).** The stop at `retry`/`cancel` is unsound because those fire without a held lane (15b). Stop only at one guarded by
  `X.retryable` or run in a handler of U.
- **C8 (C2, line ~777).** The capture wait is modelled as one event; the text does not say what happens to an acknowledged re-send waiting for
  its capture when the incarnation is disposed (modelled as unchanged: captured later by the Runtime).
- Still stated: two local actors with equal input have two lanes; hydration cells untestable.

## Where I invented behaviour
`Superseded` is never delivered; delivered `NotSent` kinds are Rejected, Cancelled, Overloaded, StorageRefused, Restored, Disposed; a head that
settles before the final capture is modelled as success or failure (two variants); the final capture always succeeds; capture is continuous;
a `cancel`/`allow` lane restored with no incarnation waits as `Held`/`await` (the text has no between-turns state for it, `HeldThisTurn` cannot
outlast a turn); the machine is three leaves with memory-free handlers.
