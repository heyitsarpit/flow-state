# Convergence 7: the persistence edge, then `Compiled`

Status: **proposed, throwaway**, except D80's interval and hide flush, which the owner accepted (relayed by the coordinator during this round). Written before the code; "Corrections after building" at the end says what the code changed. Input: [round-6/review.md](round-6/review.md), advice. H1, H3, M1 were reproduced by the reviewer. **H2 is out of this round:** its traces stay known-failing, recorded in `round-7/known-failing-h2.ts`, and are not counted as passing.

**Decided during the round, by the coordinator under the owner's delegation:** M9: O5, encoding never fails the turn and D57's refusal goes (D89). M2: queue until boot with O5's bound (D87). H2: per-field versions, option A, redesigned from scratch in round 8; round 7 stays out, and `Carried` gains an optional `evidence: "whole" | "partial"`, additive and unread, so the typed path is not shaped against it. D80's interval and hide flush: accepted by the owner. RESULTS says plainly where evidence argues back.

## Findings by root cause

| Root | Findings | Answer |
| --- | --- | --- |
| **A. The driver has no stated order per key.** Nothing says what a late answer may do | H1, O3, L2, part of M4 (d, e) | D83, and D86 is tried |
| **B. "Coalesce" was applied to a record whose loss is not cheap** | M1, L3, the hide part of D80 | D84, D80 amended |
| **C. Oracles and harness looked past the failure** | H3, M4 (a, b, c), M7's vacuous cases | D85, oracle `charged && no lane`, the sleep goes, cases repaired |
| **D. Boot and restore have outcomes nobody handles** | M2, M8 | D87, D88 |
| **E. Two rules about encoding** | M9, part of M11 | D89 |
| **F. A cost blamed on the wrong round** | M13, M3 | D90, bench in fresh pages |
| **G. `Compiled` is only ever hand-written** | review's "most likely to change" list, L4 | D91, D92 |

## Decisions (all proposed unless marked)

| Id | Decision | Costs | Changes |
| --- | --- | --- | --- |
| **D83** | **Per key, a later write wins, whatever order the answers come in.** The store contract: batches are atomic and commit in issue order, an answer may come any time later. The driver stamps each key with an issue number. An awaited write deletes its keys from `dirty`. A failed batch re-enters only keys it was the newest issue of. `saved` becomes a claim with a stated meaning: *landed, in flight, or dirty*; a refused awaited write clears its entry, the one case where none holds | A map entry per key ever written. Bounded by keys | Driver, `onStored` |
| **D84** | **A batch touching a lane flushes now; only lane-free memory coalesces.** Everything dirty goes with it, so a lane cannot outrun its actor | M1's window closes for lane-carrying batches. Writes per lane change: rare beside chat values | Driver |
| **D80, amended** | **ACCEPTED by the owner: plain memory coalesces at 5 s as the runtime's default, flushed on `visibilitychange` to hidden and on `pagehide`.** A host offers `onHidden`. Measured, not assumed; if the flush is unreliable RESULTS says so, with the number | A kill loses up to 5 s of plain memory and of a lane-free leaf | Bound, `Host` |
| **D85** | **Host contract: a strict marker is committed and awaited before a host reports ready.** Oracle: `charged && no lane`. H3's cause in Chrome is not established and this does not claim one | A strict commit per boot | Host, harness |
| **D86** | **Try: a first send's capture and ack as one transaction** (M4 e, 2.8.11 "one capture"). Decided by trying | If taken, `NotSent { Restored }` for a first send goes, and with it 2.10.15's row: see corrections | Driver, expected results |
| **D87** | **Decided. Queue until boot, with O5's bound.** Past `bootMs`, or on a failed read: `StorageFailure`, run without persistence, flush the queue; a late answer is ignored, so unread data is never overwritten. Queue length bounded by the same rule as the notify chain, with evidence on drop. Against 2.10.17.6's `ActorAbsent`: the design's word stands until the owner rules | Changes 2.10.17.6, `Fake.storage` read rows, `pending()` if accepted | Driver, fake |
| **D88** | **A quarantined lane keeps its id and its hold.** The id is the record's key, so it survives what the body does not. A commit on it declines `Rejected`. The record stays on disk. Cleared by `cancel` on that key; `orphaned` (P19) stays unbuilt | One new table in the world | Restore, commit |
| **D89** | **O5 over D57, for memory.** A turn never refuses because memory cannot encode: the driver skips the whole batch, keeps the last good capture, and names it. **Decided.** A commit whose input or key cannot encode declines `NotSent { StorageRefused }` and its transition runs (first drafted as a refusal; changed when M9 was decided). A lookup's input and key still refuse: not built past this round, see RESULTS. See reasoning below | Live state and disk may part until an encodable state. D50's two strikes do not apply to encoding | `admitted`'s callers go; the driver |
| **D90** | **`actors` is a fixed two-level table of small records**, canonical regardless of insertion order, instead of a spread of one large object | Reads go through three helpers | World, about 35 sites |
| **D91** | **A thin typed path:** a typed definition compiles to `Compiled` with no `any`, Pay and one fragment, feeding the runtime unchanged | Not a front end. Field-list keys and Schemas only as far as Pay needs | New folder `typed/`, `Compiled` |
| **D92** | **`flow check` and static `flow explain` read `Compiled` and run no callbacks.** Outputs in `round-7/cli-outputs.md`, a proposal | Needs what D91 adds | New folder `cli/` |

| **D93** | **A retired identity flushes at once.** Found by the sweep at 5 s: a dispose lost to a kill woke the actor | One write per dispose | Driver |
| **D94** | **An awaited write waits for the answer of any plain batch of its actor still out; what that batch owes goes in its transaction.** Found by SEARCH-FLUSH (E1): a failed batch, the next ack landed, a kill: a completed `pay` came back held, and Pay reached placed-and-voided. D86's benefit without losing `NotSent { Restored }` | One commit's wait, only behind a batch still out, and a hung plain batch stalls its actor's acks | Driver |

### M9: O5 or D57

**O5** says "encoding failure never fails the turn". **D57** refused the turn, so that a bad value never reaches disk. The review's trace settles it for endings: refusing cannot undo the world. The server did it, the lane is gone, the state stays `A`, and `Go` mints again. The question for the Schema is what the refusal buys once memory is typed. With a memory Schema the type stops almost everything at compile time, and what is left is a value the Schema's encode rejects at run time. Then a refusal punishes the user for something a failed write handles anyway: last good capture, named issue, retry when encodable.

**Consequence for the typed memory Schema:** it is the *encoder used by the driver*, not a turn gate. The turn does not call it. `admitted` goes, and with it the `verified` WeakSet (L10) and a walk of changed values per turn.

**Hold:** the batch skip must not lose a hold. A skipped batch that held a lane's removal leaves the lane on disk, so a restore says `unknown { Restored }`: honest, and it never mints beside it. An awaited write of a lane is encoded by the step and is not skipped for an actor's sake; only an actor record can be the bad one in a plain batch. A commit whose `input` cannot encode declines: no capture means no send.

### M2: why queue, and the bound

`ActorAbsent` makes every author handle a click during a slow disk, and the click is the design's concern. Queueing alone was silence (`load` never answers: 0 actors, 0 issues). `bootMs` (default 10 s, a guess) closes that. **Past the bound, the app runs on empty memory while a record may exist on disk, and an Attempt held there is unknown to this boot.** O5 accepts that for a failed read and it says nothing about a slow one. A hold in the unread record can then get a second Attempt. **That is the cost of the bound; RESULTS states it.** Persistence being off, nothing overwrites the record, so the next boot sees both.

## Plan for part 3

Rule 16 in this brief means the design's warning: *a transition that changes state lists a `reject` commit without its `idle` guard*, plus any event sent from outside that no state handles (rule 20's first sentence). Reported separately.

```decisions-changed
D80          amended   D80,D84  5 s, flush on hide (owner accepted); lanes flush at once (proposed)
D57          replaced  D89      decided: encoding never fails a turn
D26          changed   D83      the write-ahead protocol stands; its store contract is now stated
```
