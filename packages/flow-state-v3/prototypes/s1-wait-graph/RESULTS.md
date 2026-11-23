# S1: does the write lane plus record queue get stuck?

Status: proposed, throwaway. Everything below is what `bun main.ts` printed (kept in `out.txt`). Run time about 130 s, 1.1 GB peak.

## Inputs and conditions

- Question: does rule 21's lane composed with rules 28-31's record queue get stuck, and what else waits?
- Model (`main.ts`): 2 actors, one `latest` lane each; 2 records; a commit predicts record mask 1, 2 or 3; attempts end success, failure or unknown (landed or not); forced repair after unknown; retry (cap 1 per Attempt); cancel (Held, waiting); promotion; release. BFS over all interleavings, state key drops finished Attempts and keeps id ranks.
- Sweep A: 3 commits, masks {1,2,3}. **Complete** (no state cap hit), 33k to 310k states per run.
- Sweep B: 4 commits, masks {1,2} (the review's two-lane example needs only these). Complete for `a` and `d`; **truncated at 500k states** for the others. Absence of a stuck state there is not proven.
- Two readings of the text ambiguity "may a retry happen while the forced repair is pending?": `n` (no) and `y` (yes, its old queue entry stays). Both run everywhere.
- Machine configs: `full` (commit, retry, cancel may fire any time, over-approximated like closures) and `noOwner` (commit only, no retry or cancel: what `UnresolvedHold` is meant to rule out).
- STUCK = some Attempt waits (in `W`, or waiting to be invoked), and no runtime or environment move is enabled (nothing on the wire, no repair pending). Each stuck state gets a wait-for graph kind (cycle, orphan, hold, hold-x = hold reached across actors) and the set of machine actions that free it within 3 steps.
- Not modelled: persistence ack and capture, `basedOn` rebase, store predictions, late landing of a lost request, cancel on the wire (no-op here), queue cap 64, any outside world. A timed-out request cannot land late.

## Variants (same recipe, only the join rule differs)

| id | rule |
| --- | --- |
| a | design now: commit joins queues at commit, retry joins at the tail (rule 28, E7) |
| b1 | review 3.1 literal: sort by mint seq, only on-wire pinned first |
| b2 | b1, but an entry waiting for its forced repair is pinned too (keeps rule 30) |
| c | a W commit joins the queue only when promoted |
| d | an unknown's entry keeps its place until resolved or released; retry reuses it (no rejoin) |
| e | as a, but waiting-to-be-invoked skips W entries ahead of it |
| f | as a, but a retry passes only its own lane's W entries (the "skip your own lane" fix) |

## Results (sweep A, both readings, full machine unless noted)

| | stuck cycles n / y | safety | last intent lost with no unknown anywhere | cross-actor hold waits (hold-x) | retry ahead of other actor's unsent write |
| --- | --- | --- | --- | --- | --- |
| a | 1992 / 1992 | none | none | 874 | no |
| b1 | 0 / **32** | **S3 violated** (see below) | none | 236 | yes |
| b2 | 0 / **32** | none | none | 236 | yes |
| c | 0 / 0 | none | **yes** (3 states) | 0 | no |
| d | 0 / 0 | none | none | **868** (more, and shorter) | no |
| e | 0 / 0 | none | **yes** (3 states) | 0 | no |
| f | 80 / 80 | none | none | 926 | yes |

1. **The like-button deadlock is real in this model.** Shortest trace under `a`, 6 steps: `commit a0 ; invoke ; end unknown ; repair ; commit a0 (goes to W) ; retry`. The retry's Attempt sits behind the W entry in the queue, and the W entry waits for the lane. Nothing is on the wire. The wait-for graph is a cycle. It is freed by a new commit (supersedes W) or `cancel`, never by `retry` and never by an ending. Also found: a second cycle shape with two lanes (shortest 10 steps: `commit a0 ; invoke ; unknown ; repair ; commit a0 ; commit a1 ; invoke ; unknown ; repair ; retry a0`), freed by `retry`, `cancel` or a commit. I did not check it is the review's exact D0/D1/A2 example.
2. **Both readings reach it.** Reading `n` suffices (the trace above). So the claim does not depend on the retry-during-repair reading.
3. **`f` (skip own lane's W) does not fix it.** 80 cycles remain, shortest `commit a0 m1; invoke; unknown; repair; commit a0 m2; commit a1 m3; retry`. This confirms the review's cross-lane remark.
4. **The review's fix (b) is not deadlock-free as written.** Under reading `y`, `b2` has 32 cycles (`b1` 64): `commit a0 m3 ; invoke ; unknown ; repair ; commit a1 m3 ; invoke ; unknown ; retry a0 ; retry a1 ; repair ; commit a0 m1`. Cause: the review's `join` re-sorts the whole non-pinned list at every join, but an Attempt that was pinned (on the wire or awaiting repair) sits ahead of older entries and keeps that place in the records it did not rejoin. When it is later re-sorted in one record and not the other, the two queues order the same pair oppositely. Its proof says "an on-wire Attempt waits on nothing", which leaves out an Attempt that was on the wire, ended unknown and is now a waiting re-send. Reading `n` does not reach it (sweep A complete; sweep B truncated, not proven).
5. **`b1`, the review's literal code, breaks rule 30**: `commit a0; invoke; unknown; repair; commit a1; invoke; unknown; retry a0; invoke`. The older retry sorts ahead of a1's entry that is still waiting for its forced repair, so it is sent while another write to the record is in doubt (S3). `b2` fixes that.
6. **The other safety properties held in every run**: at most one on the wire per record, no double send, lane shape. Mutation check below shows the checker would have reported them.
7. **Behaviour change under b (and f)**: a retry now goes ahead of another actor's never-sent write (trace `commit a0 ; invoke ; unknown ; repair ; commit a1 ; retry a0`, 6 steps). It does not remove the case where an older retry lands after another actor's newer write that was already sent: that last-intent loss ("after an unknown", 6 to 9 states) is present in a, b1, b2, f and is the "contested" case E7 accepts. Final server state therefore does **not** always match the user's last intent in any variant that lets a retry follow another actor's success.
8. **c and e remove every cycle but cost prediction order.** The W commit is not in the queue ahead of others (c) or is passed (e), so the send order can differ from mint order with no unknown at all: `commit a0 ; invoke ; commit a0 ; commit a1 ; end ; invoke#2 ; end ; invoke#1`. The older toggle is applied after the newer one (last intent lost, 3 states). That breaks "the last toggle wins" across two actors, so neither meets the owner's requirement as stated.
9. **d removes every cycle and keeps last-intent** (0 lost states) but is the worst for other actors: an unknown's entry stays at the head until resolved or released, so another actor's write waits on someone else's hold in 868 states with a 5-step shortest trace (`commit a0 ; invoke ; unknown ; repair ; commit a1`), against 6 steps and a needed W commit in `a` and `b`. This is how TanStack Query scopes behave (below).
10. **Holds are not stuck in a harmful sense when an owner exists.** Every `hold` state is freed by cancel (and usually retry). Under `noOwner` (no retry or cancel) the same states are stuck forever in every variant: 792 hold plus 84 hold-x under a, b, f; this is what `UnresolvedHold` (2.7.14) must catch. Note it does not look at the queue-wait cycle in 1: that lane is `InFlight`, not `Held`, so a hold check does not see it.

## Timeouts (rule 25 cancelled by the owner; sweep A, reading n)

| timeout | what it does | cycles freed? | cost |
| --- | --- | --- | --- |
| wire | the wire Attempt ends unknown | **no**: identical counts to no timeout (a: 1992 stuck, same as without) | none |
| hold | a retained unknown is released like cancel | **no**: the cycle has no Held lane (a: 1992 unchanged) | none |
| queue | a waiting-to-be-invoked Attempt is given up like cancel by history | yes, a move exists | also fires on ordinary waits and **drops the user's latest never-sent write** (`commit a0 ; commit a1 ; TIMEOUT queue #1`), in every variant (5976 states under a) |

So only a timeout that acts on waiting-to-be-invoked Attempts can free a cycle, and it loses a toggle; a call or hold timeout does not touch a cycle where nothing is on the wire. Prefer fixing the order. No timeout variant is kept beyond this table.

## Mutation sanity (variant b2, 3 commits)

Each injected fault was reported as a kind the clean run lacks: dropped promotion -> orphan wait; tail join in b -> cycle; invoke ignoring the queue head -> S1; retry from the wire -> S2; repair never settling -> "other" stuck. All CAUGHT. This shows the stuck and safety checks can fail; it does not show the model is faithful.

## Rules broken or read loosely (owner: rules are suggestions in prototypes)

- Rule 25: cancelled by the owner; used only in the timeout table.
- Rules 28 and 29 (a W commit joins and blocks queues): broken on purpose in c and e.
- Rule 31 / E7 (retry joins at the tail): broken in b1, b2, f (and d never rejoins).
- Rule 30 (queue held until repair settles): b1 breaks it; b2 keeps it; the gate in `e` adds it explicitly.
- Ambiguity run both ways: retry during repair (readings n, y). Ambiguity decided one way: a failed re-send is treated as unknown (rule 18), a cancelled Held entry waits for its repair before leaving, a never-sent addressable is replaced by a new commit (OD20 F4).

## Prior art read (read only)

- `codebases/tanstack-query/packages/query-core/src/mutationCache.ts` (`add`, `canRun`, `runNext`, lines about 123-190): a scope is an array in mint order; the first pending mutation runs; a retry happens inside the mutation and never leaves the array, so it keeps its place. That is variant d. Taken: the shape of d and the observation that a retry never rejoins. Not taken: it has no notion of a record queue shared across scopes, so no cross-queue order to get wrong.
- `codebases/xstate/packages/core/src/Mailbox.ts`: one FIFO per actor, no cross-actor waits at all. Taken: nothing; it shows the cycle needs two queues.
- **Not read: `codebases/db` and `codebases/mono` (not cloned when I looked).** The `query` clone at `codebases/query` was empty; I used `codebases/tanstack-query`.

## Other waits (on paper, NOT RUN; owner dropped modelling them)

| wait | waits on | can it join a cycle with the lane or queue? |
| --- | --- | --- |
| stream release (T1 `Releasing`, T9 "waits for a releasing predecessor") | scope closed or the 5 s `ReleaseOverdue` | the 5 s bound is a Flow timeout (now allowed); without it a hung adapter finalizer holds every successor. T1's table has no column for the "waiting for predecessor" state, so release, refetch and bookmark in it are unspecified. A chain predecessor-of-predecessor could connect two sessions at once if "predecessor" means the immediately previous session. Not checked |
| persisted re-send waits for lane-record capture (2.7.13 invoked row) | capture write | capture does not wait on lanes or queues in the text, so no cycle found by reading; a failed capture refuses the re-send |
| first send waits for acknowledgement (Persistence O6) | storage ack | same reading, ack failure is an ending |
| Runtime disposal | on-wire Attempts within Runtime O6's bound; W entries wait for the head's ending or the bound | a cycle member never ends, so W waits for the bound; bounded only by that timer |
| bootstrap, hydration, ensure | storage read, rebind to the Runtime's lane copy | a rebind adopts a Held lane, delivered once; a cycle lane is `InFlight` and stays so after rebind. No cycle found by reading |
| capture of a lane after dispose | last good capture | no wait on the queue |

## Unverified

- The model is mine, not the design's tables; the real lane model (`lane-model/`) has no record queue, so nothing here cross-checks against it.
- Sweep B truncated for b1, b2, c, e, f; mint-order cycle at 4 commits and reading n is open.
- Persistence, stream, store predictions and basedOn rebase are absent; a send order change could interact with the rebase (rule 31's `basedOn` along the queue).
- Counts of states are reachability facts under the model's caps, not rates.

## Rules and sections each finding touches

1 to 3: rules 21, 28, 31, 2.7.13 (promotion, retry rows), 2.8.5, 2.8.6 E7. 4 to 5: review 3.1, rules 30, 31, E7. 7 to 9: rules 28, 29, 31, E7, `latest` (rule 29) and "last toggle wins". 10: rule 45, 2.7.14. Timeouts: rule 25. Other waits: rules 25, 38, 70, 71, Streams T1, T9, 2.7.13 dispose, restore.

## Recommendation (not decided)

No variant passes everything. `b2` fixes the original deadlock but has a cycle under the retry-during-repair reading and still loses the last intent across actors; `d` has no cycle and no lost intent at the price of cross-actor holds waiting on one actor's hold. The next question for the owner: whether the retry-during-repair reading is allowed, and whether a hold may block other actors. Re-run `b2` with a queue key that does not re-sort pinned entries, and `d` with a cross-actor hold bound.
