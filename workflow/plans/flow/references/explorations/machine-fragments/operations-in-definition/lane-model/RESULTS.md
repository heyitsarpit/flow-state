# Write-lane model: results against proposal.md revision 11 (commit ddf46d4a)

Files: `model.ts` (lane), `events.ts` (alphabet), `main.ts` (explorer), `audit.ts` (UnresolvedHold), `identity.ts` (two identities),
`system.ts` (new: actor record, leaves, delivery), `mutations.py`, `output.txt`, `mutations-output.txt`.
Run `tsc -p . && bun main.ts` (30 s), `python3 mutations.py` (about 4 min, 14 mutants). Line numbers are `proposal.md` at revision 11.

## What is modelled
- Revisions 10 and earlier: unchanged (one lane, five modes, the 16 x 3 table, identity). See the previous run's text in git history.
- **Revision 11, `system.ts`** (holding modes; one identity, persisted or local; 2 commits): a small machine with leaves CARD (initial),
  PAYING, DONE (`Pay` commits and enters PAYING; `Back`; `Giveup` cancels; `Reset`). The mapped events S, F, U, N (success, failure,
  unknown, delivered `NotSent`) are handled at the root or at the leaf PAYING (two configurations).
  - A saved actor record (leaf, memory, pending mapped outcomes) that survives while no actor lives: `retain-expiry`, `disposeActor`
    (record gone), `ensure`, `reload`, Runtime disposal with a final capture (a head that settles first is saved; `NotSent { Disposed }`
    is saved). An ending with no live actor is saved as a pending outcome when a record exists, else evidence (K25).
  - Routing (K26): an adopted lane's endings and every `unknown { Restored }` are current from the active leaf; a restored record's
    saved outcomes and a live actor's own endings keep rule 14 (current while PAYING is active, else late from the root).
  - Delivery order for a new incarnation: saved outcomes first, then the `Held` head's `Restored` (not if its unknown was saved), then on a
    reload `W`'s `NotSent { Restored }` (by construction in `deliverAfterStart`).
  - A local (non-persisted) actor: no actor record, no lane record; a reload drops the lane (G4); an unmount keeps the lane for
    the next incarnation with equal input.
- Invariants added: **13** the UI never contradicts what the lane learned (never Paying after a recorded success, failure, release or
  delivered `NotSent`; never Done unless the Attempt succeeded); **14** every ending is delivered once, saved, or evidence when no record
  survives (a saved unknown and `Restored` for one hold are one delivery; nothing saved outlives its incarnation); **15** `UnresolvedHold`
  with OD21's arrivals against stuck states (audit).

## Results (revision 11)
| # | reject / latest / serialize | cancel / allow |
| --- | --- | --- |
| 1, 2, 4, 5, 6a, 7, 9 | PASS (3 commits) | PASS (2 commits) |
| 3 | PASS except the stated limit F1 (a released Attempt landing late; unchanged) | not claimed |
| 8 | 33 of 33 reachable cells | HeldThisTurn table: 29 of 33 holding cells (unchanged) |
| 11, 12 identity | PASS | |
| **13** persisted, handlers at root or leaf | **PASS** | |
| **14** persisted | **PASS** | |
| 13, 14 local | PASS | |
| 2 local (`inv2-local`) | FAIL, stated by G4 (below) | |
| **15** | no unflagged stuck machine except the `reject` terminal pass | |

- **15.** 3,500 machines. `latest`, `serialize`: stuck and flagged 2,130, stuck-not-flagged **0**. `reject`: stuck and flagged 2,074,
  stuck-not-flagged **56, all the terminal pass** (by design). Flagged-but-never-stuck: 640 to 648, all with a `retryable` guard (rule 3's
  stated over-approximation: a budget the machine never spends). So the rule is exact on stuck machines but not minimal. The two-leaf
  family cannot tell revision 10's arrivals from OD21's (0 machines differ); the refinement needs a machine with three leaves.
- Contrast, same machine with K25 and K26 off (revision 10): persisted, root handlers: inv 14 fails in 2 events (`Pay -> runtime-dispose`:
  the disposed `NotSent` is dropped). Leaf handlers: inv 13 fails in 2 events (`Pay -> reload`: `NotSent { Restored }` routes late and the
  PAYING handler never sees it).

## Counterexamples
- **F1** (inv 3, stated): unchanged, 7 to 8 events (`commit;commit -> ack(1) -> invoke(1) -> end-unknown(1)/h:cancel -> ack(2) ->
  invoke(2) -> land(2)`).
- **L1** (`inv2-local`, all three modes, local identity): `Pay -> ack(1) -> invoke(1) -> reload -> Pay -> ack(2) -> invoke(2)` (7 events).
  The reload forgets the lane, so a newer write is sent while the older one is unresolved. Line 748-751 states the exception for the
  *ending* only; it also removes the hold and its order. Same cause as G4, not a new rule, but the stated text is narrower than the effect.

## Mutations (all caught; checks that newly fail against the unmutated model)
| Reverted rule | Newly failing |
| --- | --- |
| interrupted becomes Held; promote only on release; invocation whatever the outcome; cancel by history; serialize hold; HeldThisTurn; ending kept on a non-ok turn; F2; F3; F5; K21 identity | as in revision 10 (see `mutations-output.txt`) |
| **K25** drop the pending-outcome save | inv 13 and 14 (persisted, root and leaf handlers, all holding modes) |
| **K26** adopted endings and `Restored` are late, from the root | inv 13 (persisted, leaf handlers, all holding modes) |
| **G3** a saved unknown and `Restored` both delivered | inv 14 (persisted, leaf handlers) |

K26 shows only with a handler at the leaf: a root handler hears a late event too, which is why S7c says "handle at the root".

## Contradictions and gaps (revision 11)
- **C1 (lines 748-751 vs 849-880, the hold under a local reload).** Principle 2's exception covers the ending, but the table's
  hold guarantee ("nothing newer is sent while an older unknown is unresolved") also fails after a local reload (L1). One sentence.
- **C2 (line 807, re-send waits for the lane record's capture, R9 M3).** The table has no cell or event for that wait; the model gates
  nothing on it (its failure, `capture-refused`, is modelled). `retryCount` and the invoked cell say nothing about it.
- **C3 (lines 849-880, W's `NotSent { Restored }` with no live actor).** The delivery list puts it at step 2 of the incarnation, but
  K25 describes *every* ending with no actor as a pending outcome saved in order. Modelled as a step-2 item of the lane, not a pending
  outcome. If it were a pending outcome it would be delivered at step 1, before `Restored`.
- **C4 (S7c, line ~1260).** "The same holds for the adopted Attempt's success and failure": a handler of S/F/N that compares the event's
  Attempt with memory (`cur`) ignores an adopted one in a fresh incarnation (cur = 0). The machine here uses the event's Attempt for S and
  keeps the comparison for F/N/U; a fresh incarnation then shows the card form after a recorded success. No contradiction with inv 13
  (the UI does not say Paying), but the user can pay twice. Stated limit worth a sentence.
- Still stated, not new: two live local actors with equal input have two lanes; `Superseded` is evidence; hydration cells untestable (G6).

## Where I invented behaviour
`Superseded` is never delivered; delivered `NotSent` kinds are Rejected, Cancelled, Overloaded, StorageRefused, Restored, Disposed; a
head that settles before the final capture is modelled as two variants (success or failure); the final capture is assumed to succeed;
capture is continuous (the record equals the live actor at any crash); pending outcomes are not size-bounded.
