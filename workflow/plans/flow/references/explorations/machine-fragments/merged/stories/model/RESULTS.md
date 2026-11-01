# Story executor: model results against proposal-v2.md revision 3 (HEAD 10ae00f4), section 3, decisions T1-T7

Files: `model.ts` (3.1-3.6, `CFG` holds the key rules), `main.ts`, `mutations.py`, `output.txt`, `mutations-output.txt`.
Run `tsc -p . && bun main.ts` (44 s, 708k states), `python3 mutations.py` (about 5 min, 21 mutants). Line numbers are proposal-v2.md at HEAD.

## What is modelled (revision 3 applied)
- **3.1 steps:** `send` (Pay, Retry, Cancel, guards, Sub, Unsub, Msg), `world`, `together` (with `{ advance }`: woken fibers run to a gate, no turns), `advance`
  (1, 2, next, -1, suspended), lifecycle, `reload` (the reopened tab keeps a disposed actor disposed), `openTab`/`closeTab`, `dehydrate`/`hydrate`.
  A handler that waits on the host (`srv.hostwait`) is `HostTimeWait` at once.
- **3.2:** `Held`, `Server`, `HeldAnswer`; one rule taken at arrival; rule targets (handle or endpoint) and a `release` that ends only its own target's rules; `release({ nth })`; crash.
- **3.3:** None, Opening, Open, Silent, Closed with standing rules and `release({ nth })`. **3.4:** `leave({ end })`, `reset` on Frozen. **3.5:** five ranks.
- **3.6:** writes (Queued/Held/HeldConfirm, FIFO, abort with the tab; a resolved Attempt queues a `clear` capture) and the new reads table (restore as a read).
- **Downstream, at cell level:** a persisted write lane (`reject`, `serialize`), and a stream session via `plain`, `Feed.reconnect` or `Feed.callback`.
  Ten searches (depths 3 to 9, up to 90 steps), two of them with the policy suite's awaiting adapter.

## Results
| # | Check | Result |
| --- | --- | --- |
| 1 | Determinism (each step twice, collections scanned both ways) | PASS |
| 2 | Settling (nothing runnable after any step) | PASS |
| 3 | No injected endings | PASS |
| 4 | Reachability | wire 24/24, writes+reads 21/21, connection 43/43, host 25/25, progress 6/6, callback 18/18, reconnect 32/32, lane 31/34, session 40/55 |
| 5 | No deadlocks (bounded: states within 3 steps, then recovery steps) | PASS |
| 6 | Table conformance | PASS (no counterexample) |

## Counterexamples
None. Revision 1's ghost restore (`sto.hold:ack ; Pay ; Cancel ; sto.release ; reload`) is gone: the cancel queues a `clear` behind the held acknowledgement. The
new `HeldConfirm` restore cell is reached (`sto.hold:ack:response ; Pay ; Cancel ; reload a`): the cancelled Attempt returns as `unknown{Restored}`, as 3.6 now states.
If the Story also holds the `clear` and releases, the ghost returns only through a crash (aborted `clear`), which is the same stated behaviour, so it is not flagged.
Informational: `send a Sub ; world chat.hist:more ; world chat.burst` loops at one instant and rejects with `StoryTurnLimit`, as 3.1 says.

## Unreachable cells
- **`W|runtimeDisposal` x3** (T2: only the policy suite's `disposeRuntime()`).
- **Suite-only session cells (15):** `Releasing` x `proof, live, lost, reset, fresh, pending, settleP, settleL, value, down, fail, complete, defect, release`, and `bound`.
  App Stories cannot reach them (the finalizer does not wait, 2.10); the awaiting-adapter runs do. 2.10 names late signals and values, not `Releasing|release`.

## Ambiguities (no contradiction found; HEAD lines)
- **A1 (847).** `release({ nth: k })` with fewer than k queued or held items: unspecified. Modelled as plain `release()`.
- **A2 (846).** `release()` on `Open` ends standing rules with no `NothingHeld`; on `None`/`Closed` it is `NothingHeld` if none. Modelled as written.
- **A3 (862, 865).** `enter` on `Frozen` after `reset(subject)` stored another subject: which subject wins is unspecified. Modelled: `enter`'s.
- **A4 (3.6 write table).** `duplicate()` on a write or a read has no row; modelled as no-op. A read refused or held gives no stated state for the tab: I hold its actor absent until served (sends are `ActorAbsent`) and open an empty lane when refused (invented).
- **A5 (826).** A suspended tab's answer that arrives while suspended has no state; modelled as an internal `Waking`.
- **A6 (820).** "Ends standing rules whose target is its own": a handle's rule covers all its endpoints, but the model has one endpoint per fake, so a handle/endpoint overlap is tested only on `pay`.
- Every cell count in the text matches the model (52/23, 60/43, 28/25, 36/15, 12/6). Revision 1's contradictions are all resolved.

## Mutations (all 21 caught; `mutations-output.txt` has the counterexamples)
| Reverted rule | Newly failing |
| --- | --- |
| 3.5 ranks / arming as last key | 6 (rank order) / 1 determinism |
| suspended tab silent; settle after each control; `NothingHeld` | 6; 2 settling; 4 (error unreachable) |
| a Held lane can be left | 5 deadlock |
| **`release()` ends standing rules** (strict reading) | **5 deadlock** (`world pay.drop:always:handle`) |
| `release()` ends only its own target's rules | 6 (`release-ended-other-target`) |
| T2: an `inject` step | 3 |
| orphans travel; cancel interrupts; ack gates the send; `release({drop})` loses; `drop(open)` refuses; host freezes | 4 each |
| duplicate answered once; gone client's answer discarded | 6 each |
| an awaiting finalizer makes a close wait (suite) | 4 (`bound` and Releasing cells) |
| **ghost restore:** FIFO writes; a Held write aborts with its tab; the capture removes the record | 6 `late-ack-restored` (twice); 2 settling |

## Behaviour I still invent
Cell-level lane and session (no `cancel`/`allow` table, no 3.2 delivery pump); `flush` and `clear` writes; `hydrate` opens tab b with an Idle lane; adapter signals pass
through a group queue pulled at settle; a suite `defect` may arrive while Releasing; `together` has no mailbox, so its ordering race is not expressible; step cuts,
addresses, the `world` option and microtask scheduling are not modelled.
