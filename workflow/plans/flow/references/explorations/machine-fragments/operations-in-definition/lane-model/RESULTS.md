# Write-lane model: results (proposal.md revision 9, section 3.8.1)

Files: `model.ts` (the lane), `main.ts` (explorer and checks), `audit.ts` (UnresolvedHold), `mutations.py`, `output.txt`,
`mutations-output.txt`. Run: `tsc -p . && bun main.ts` (about 36 s); `python3 mutations.py` (7 s). Line numbers are `proposal.md`.

## What is modelled
- One lane, one key. All five modes. The 14-row table as code; each row looks up its (row, state) cell and flags the 13 "cannot occur" cells.
- Members `commit`, `retry`, `cancel`, guards `idle`, `retryable({times:1})`; several members per turn, applied in action order (step 5).
- Endings `success`, `failure`, `unknown`, `interrupt`; storage ack accepted/refused, then invoke; `dispose`, rebind (`start`), reload (restore).
- Turns end `ok`, `Denied`, `Unhandled` or `InvalidTurn`; ending effects and promotion are kept, only the turn's members are dropped.
- A server: a request lands at any time, in any order, applies once per Attempt id (idempotent), or refuses for good; a response is `success`
  only if applied, `failure` only if refused, `unknown` any time.
- Search: breadth-first with state merging over the whole finite state space ("complete": every sequence of any length). Bounds: 3 commits
  (cancel and allow: 2), retries saturate at 1, `serialize` queue cap 2 (proposal 64), one in-flight copy per request. Raw enumeration of all
  sequences to depth 6 (reduced alphabet, no merging) agrees with the merged search on the same alphabet.
- Two readings of the acknowledgement (see F2): literal (each send needs its own ack) and per-Attempt (sticky).

## Invariants
| # | reject / latest / serialize | cancel / allow |
| --- | --- | --- |
| 1 ending never dropped, NotSent only if never sent | FAIL (literal reading, F2); PASS per-Attempt | FAIL (F2) |
| 2 nothing newer sent past an unresolved unknown | FAIL (literal, F2); PASS per-Attempt | n/a |
| 3 server = latest eligible commit | FAIL (literal, F2); per-Attempt: only the stated limit F1 | not claimed |
| 4 no double send | PASS | PASS |
| 5 flags match definitions | PASS | PASS |
| 6a every state reaches Idle | PASS | PASS |
| 6b UnresolvedHold vs stuck states | see 'inv 6b' below | |
| 7 cannot-occur cells never reached | PASS | PASS |
| 8 every reachable cell visited | PASS, all 29 | n/a (other table) |

## Counterexamples (shortest; full list in output.txt)
- **F1, stated limit, inv 3** (all three holding modes). `commit -> ack(1) -> invoke(1) -> end-unknown(1)/h:cancel` leaves the released
  write able to land after the user cancelled (4 events). Stale overwrite: `commit;commit -> ack(1) -> invoke(1) -> end-unknown(1)/h:cancel
  -> ack(2) -> invoke(2) -> land(2)`, then the released c1 lands last: server=1, latest commit=2 (7 events under `serialize`, 8 under `reject` and
  `latest`). 3.8.1 "late-landing race is gone" says this holds only "for any contract that sends attempt.id", yet the released Attempt's
  id is never asked about again. The text states it ("a write the machine releases ... may still land later"). Not a new bug; the invariant as
  worded fails here.
- **F2, inv 1, 2, 3** (all modes, literal reading). `commit -> ack(1) -> invoke(1) -> end-unknown(1)/h:retry -> reload/h:none`: the re-send is
  waiting and not yet acknowledged, so restore (line 759) ends it `NotSent { Restored }` although it was sent once. Then `commit -> ack(2) ->
  invoke(2)` (8 events) sends 2 past an Attempt whose first send may still land (inv 2), and the server can end at c1 (inv 3).

## Ambiguities and contradictions
- **F2 (contradiction, 752 vs 759).** The storage-refused row needs a fresh acknowledgement per re-send ("a re-send: returns to Held").
  The restore row says "acknowledged is per Attempt" (759), which makes that cell unreachable for re-sends. Per-Attempt makes inv 1-3 pass.
  Fix: state which; with per-send ack, a never-acknowledged re-send must restore as `unknown`, not `NotSent`.
- **F3 (contradiction, 696/1014 vs 759).** "restore is a rebind across a reload" (697) and rebind delivers `unknown { Restored }` (758);
  restore of `Held` is "not delivered again" (759, R5 L6). A reloaded actor is a new actor, so which row applies is unspecified. Also, the
  `acked` word on a never-sent but acknowledged Attempt (restores as `unknown`, 759) makes `retry` its first send.
- **F4 (gap, 746).** `latest` commit "replaces" a never-sent, uninvoked head. Not said whether the new commit becomes the head (modelled so)
  or `W` with an empty head, which the state definitions forbid.
- **F5 (gap, 752).** A refused re-send "returns to Held" and delivers nothing, so no handler runs for that Held. Under `cancel` and `allow`
  the second table (797-808) has no invoked or storage-refused row, and `HeldThisTurn` exists only inside an ending's turn. INVENTED: Idle
  (cancel) and evidence (allow).
- **F6 (gap, 801).** `cancel` concurrency, commit while the head is waiting to be invoked: the cell says "interrupt the one on the wire".
  INVENTED: never sent -> `Superseded` evidence; a waiting re-send -> evidence.
- **F7 (UnresolvedHold, 895-926).** Item 2's parenthetical "(no X.retry, no X.cancel, or ...)" has lost its head noun; modelled as
  "branch that keeps the hold". Rule 4 says restoring actors receive `unknown { Restored }` (902), contradicting the restore row (F3).
- **F8 (gap).** Whether an ending admitted in a `Denied`/`Unhandled` turn counts as "delivered" (its handler never ran). Modelled as
  delivered (lane effect kept). Also: `unknown` and `interrupt` rows are identical in effect; `StillUnknown` is not defined here.
- **F9 (gap).** `allow` has no dispose, rebind or restore cells. INVENTED: attempts stay on dispose; restore turns them into evidence.

## inv 6b: UnresolvedHold as written against actual stuck states
3,500 tiny machines (2 leaves, one user event per leaf, one `unknown` handler; guards none/idle/retryable; members none/retry/cancel/commit) run
in product with the lane. "Stuck" = a bound lane that cannot reach Idle without a host move (dispose/start/reload). Per mode (reject; latest and
serialize are alike): stuck and flagged 2,104 (2,166); flagged, never stuck 610 (612); **stuck, not flagged 325 (263)**; neither 461 (459).
The rule sees arrivals by `unknown`/`interrupt` and rebind. Entries into `Held` it cannot see:
1. **Refused re-send** (752): `S0:{commit}`, `unknown:{retry->S0}`; `commit, unknown->retry, ack-refused`: Held, no event, nobody owns it
   (240 reject machines, 239 each for latest/serialize).
2. **Reload of a Held lane** (759): not delivered, so S0's handler never runs (18/12). A `reject` machine that leaves via the terminal
   pass (5.1 LEFT) keeps a Held lane by design (55; reject only).
False positives: mostly `retryable`-guarded edges that cannot pass in Idle, so leaves the rule counts are unreachable.

## Mutations (`mutations.py`; all caught; checks that newly fail vs the unmutated model)
| Reverted rule | Newly failing |
| --- | --- |
| interrupted Attempt becomes `Held` | inv 2, 3, 5 (reject, latest, serialize) |
| promote only on release | inv 3, 5 (latest, serialize) |
| invocation whatever the turn's outcome | inv 3 (latest, serialize) |
| `cancel` by history | inv 1, 2, 3 (all holding modes) |
| the `serialize` hold | inv 2, 3, 5 (serialize) |
| `HeldThisTurn` | inv 5, 7 (cancel, allow) |
| ending kept on a non-ok turn (extra) | inv 1 (all) |

## Where I invented behaviour
`NotSent` deliveries are counted but run no handler; endings of non-addressable Attempts are evidence; retry saturation; the ambiguities F4,
F5, F6, F9 above; invariant 3's "eligible" excludes failed commits; a released Attempt that lands is classed as the stated limit, not a failure.
