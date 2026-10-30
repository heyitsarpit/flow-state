# Story executor: model results against proposal-v2.md section 3 (merge 3, decisions T1-T5)

Files: `model.ts` (tables 3.1-3.5, `CFG` holds the key rules), `main.ts` (explorer, checks), `mutations.py`, `output.txt`, `mutations-output.txt`.
Run `tsc -p . && bun main.ts` (22 s, 281k states), `python3 mutations.py` (65 s, 17 mutants). Line numbers are proposal-v2.md as it stands.

## What is modelled
- **Steps (3.1):** `send` (Pay, Retry, Cancel, idle/retryable guards, Sub, Unsub), `advance` (1, 2, next, -1, suspended), `world` (wire words on `pay`, `sto`,
  `hist`; stream words on `chat`; server controls), `together` (2 parts), lifecycle (`openTab`/`closeTab` for tabs a and b, `dispose`, `ensure`,
  `dehydrate`, `hydrate`). Settling is a loop with a turn limit; `runnable()` re-derives what is left, independently of the loop.
- **3.2:** every request record with the nine states, rules (`hold`, `drop`, `duplicate`, `at`, `times`, `match`), `release`, `release({drop})`, orphans.
- **3.3:** a connection (Connecting, Open, Silent, Closed) with open/close rules, drops, close codes, queued frames; **3.4:** the host (24 cells, resumable and not).
- **3.5:** deadlines with owner ranks, compared by the documented keys; the oracle (rank order) is checked at every firing, apart from the comparator.
- **Downstream, reduced to cells:** one persisted write lane (policies `reject`, `serialize`), `Fake.storage` as a call endpoint, a stream read by a session
  through `plain`, `Feed.reconnect` (with history pages) or `Feed.callback`. Targets: lane 33 cells, wire 18, connection 18, host 23, progress 6,
  callback queue 18, reconnect 32, session 55.
- **Search:** 8 state-merged breadth-first runs (depths 3 to 9, alphabets of 12 to 90 steps), 281k states. Deadlock closure: from every state within 3 steps
  (5,000 roots per run), the recovery steps (release, retry, cancel, unsubscribe, next deadline, ensure) must reach a quiet state.

## Results
| # | Check | Result |
| --- | --- | --- |
| 1 | Determinism (each step run twice, every collection scanned both ways) | PASS |
| 2 | Settling (nothing runnable after any step) | PASS |
| 3 | No injected endings (answer or lifecycle only; `NotSent{Disposed}` has no step) | PASS |
| 4 | Reachability | lane 30/33, wire 16/18, the other six groups complete (below) |
| 5 | No deadlocks | PASS (bounded: roots within 3 steps) |
| 6 | Table conformance (Lost never served, rank order, suspended tab silent, no stale answer) | one counterexample (F1) |

## Counterexample
- **F1 (ghost restore).** `world sto.hold:ack ; send a Pay ; send a Cancel ; world sto.release ; life closeTab a ; life openTab a` (6 steps).
  The cancel ends the Attempt `NotSent{Cancelled}`. 2.5 (line 282) keeps a held request of a gone client in transit, so the later `release` lets the fake
  apply the acknowledgement write. The record is then in storage, and the reload restores an ended Attempt as `unknown{Restored}`, so a `retry` charges
  something the Story cancelled. Either the Runtime's cancel also interrupts the write (the fake must model that) or the Story shows a real bug.

## Unreachable cells
- **`W|runtimeDisposal|Idle, InFlight, Held`** (3): by T2, only the policy suite's `disposeRuntime()` reaches them. Expected.
- **`Wire|interrupt|Transit` and `Wire|interrupt|Answered`** (2): see W2. Under R-Settle a request leaves `Transit` and `Answered` within the step that
  entered them, so no step can interrupt it there. Either drop the two cells or give the return path a latency (a `latency` option separate from the handler).

## Ambiguities and contradictions (no guess hidden; each one is a choice recorded in `model.ts`)
- **W1 (274 vs 177, 668).** `release()` "ends standing rules" (2.5) but `NothingHeld` rejects a release with nothing held. A `drop({ times: "always" })` has
  nothing held, so under the strict reading it can never end (mutant 7: deadlock, `world pay.drop:always`). Modelled leniently.
- **W2 (683-693).** `Transit` is never observable between steps (the gate decides at send); `Answered` likewise. See above.
- **W3 (687).** `duplicate`: "the client sees the first answer" does not say what happens to the second. Modelled as discarded, with no row.
- **W4 (680, 692).** `Orphan` is a listed state with no column. **W5 (274).** `release({ nth })` has no row. **W6 (685-691).** Rows say "matching `hold()` rule" at
  Transit; the `at: "response"` form is only in the handler-done row. **W7.** A request matching `hold` and `duplicate` is undefined (first rule used).
- **S1 (707-709).** `hold()`, `drop()` with no open connection: no column. Modelled as a no-op. Also `duplicate()` has no 3.3 row at all (276 vs 698-712).
- **S2 (704 vs 708).** A held open "waits until release", but the `release()` row has only a `Silent` column. Modelled as: release completes the open.
- **S3 (711).** `hold({ at: "close" })` applies from `Open` only; `Silent` and `Connecting` close at once. There is no `Closing` state.
- **S4 (709-711).** A drop or close code while the close waits: unspecified. Modelled as: the close completes.
- **S5 (712).** One cell for "closed or suspended" gives two outcomes (`Closed / paused`); suspension of `Connecting` is not defined further.
- **H1 (718-719).** In the host, nothing leaves `Frozen` or `Ended` except `enter`: no step discards a frozen incarnation, and `whenAbandoned` cannot be tested there.
- **E1 (729).** Rank 1 is "fixture order", but `Fake.storage` is not a listed fixture. Placed last.
- **L1 (664-676).** A history endpoint that always answers with a next cursor loops at one instant: `StoryTurnLimit` (`send a Sub ; world chat.hist:more ; world chat.burst`).
  Correct by the table, but the Story author must bound the fake.
- **T1 (667, 2.3 `together`).** The model has no mailbox, so the ordering race `together(release, Cancel)` is about (ending queued behind Cancel) cannot be expressed here.
  `HostTimeWait` has no fiber that waits on host time, so it is not reached.

## Mutations (all 17 caught; `mutations-output.txt` has the counterexamples)
| Reverted rule | Newly failing |
| --- | --- |
| 3.5 ranks | 6 (rank order) |
| 3.5 arming as the last key | 1 determinism |
| 3.1 suspended tab runs nothing | 6 (suspended tab fired) |
| 3.1 settle after each control | 2 settling |
| 3.1 `NothingHeld` | 4 (error unreachable) |
| a Held lane can be left | 5 deadlock |
| release ends standing rules (strict reading) | 5 deadlock |
| T2: an `inject` step exists | 3 |
| 3.2 orphans keep travelling; gone client's answer goes nowhere; duplicate answered once | 4 (`release|Held:orphan`), 6, 6 |
| cancel interrupts; ack write gates the send; close waits; `release({drop})` loses; `drop(open)` refuses; host freezes | 4 (one cell group each) |

## Behaviour I invented
Lane and session are reduced to cell level (no `cancel`/`allow` table; no 3.2 delivery pump, no positions or `ring`); `flush`/`capture` writes are gated
storage calls; `restore` reads `held` from a flush that may not have landed (so `restore|InFlight` exists); `hydrate` opens tab b with an Idle lane;
`Feed.reconnect`'s signals pass through a group queue pulled at settle; `chat.hist` serves one page per answer; a suspended tab's transport input waits;
`retain` is 2 time units and the reconnect backoff is `n`; at most 3 Attempts and time 6.
