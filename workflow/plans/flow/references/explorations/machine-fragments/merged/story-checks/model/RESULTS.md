# Stories executable model, extended for the amended wire (final spec: stories-amended.md 1.6, 2.10.2, 2.10.4, 2.10.17; fakes-v2.md)

Design check, not production code. Copied from `merged/stories/model/` (not edited there). One bun process at a time throughout.
Run: `tsc -p .` (clean); `bun wire-main.ts` (the wire model: 57 s, 1.31M states, peak 1.37 GB); `bun main.ts` (the old downstream model: 27 s, 597k states, peak 1.40 GB, unchanged); `python3 mutations.py` (all 95 mutants) or `ONLY="W " python3 mutations.py` (the 74 wire mutants, about 14 min).
Files: `wire.ts` + `wire-main.ts`, `model.ts` + `main.ts`, `mutations.py`, `output.txt`, `wire-output.txt`, `mutations-output.txt` (the earlier full pass: old model 21 mutants), `mutations-wire-output.txt` (the 74 wire mutants), `mutations-frames-output.txt` (the 16 Frames-based mutants re-run after the last alphabet and delivery change; the `countRequeues` row comes from it).
**Re-run this round:** all 74 wire mutants once, then the Frames-based ones again after a final change. The 21 old-model mutants were not re-run (`model.ts`, `main.ts` unchanged; last result: 20 killed, 1 survived).
**Caps:** every wire search is capped at 200,000 states. `Frames`, `Closing`, `Handle`, `Pump` stop at the cap in the middle of depth 5 or 6 (`Frames` 5, `Closing` 6, `Handle` 5, `Pump` 5); `Calls[dedupe]` (174k) and `Calls[ack]` reach depth 6; `Ping` (120k) depth 6; `Open` 6, `Nth` 8, `Calls[nodedupe]` 5, all complete. "PASS" means no counterexample within those depths and alphabets.

## 1. The old model: unchanged
Latency, the Effect-form handler, `HostTimeWait` as a step error and rank 1 "fake servers" are gone; its deadline check follows only recovery steps; all its checks pass.

## 2. What the wire model does (`wire.ts`), final
Everything in the previous results (two lists; frames rules that all apply; holds per connection; one outcome order; `release({ match })`; rules 3 to 5; counts and duplicates per rule; per-queue `nth`; the finish phase) and, from the final spec:
- **`ping` (v3):** time exists only for it: `advance 1` moves a tick (cap 4); a connection opened under `ping: { every: 2 }` gets a ping when due. A ping ranks first at an equal instant, ahead of a client's idle deadline (idle time 2: a client drops a connection with nothing received for 2 ticks). It is not counted by `hold({ after })`, not doubled by a `duplicate`, is not sent or queued while `Silent` or `Closing`, and after a hold the next is `every` from then. It starts no reaction fiber and is not an evidence frame.
- **U1:** a count reaching `n` during a release's own delivery queues the rest again, under any form of release (match flushes included, and a duplicated frame's second copy).
- **U2:** a request marked to hold and still at the server counts as a held item for every form of release; the rule ends for later arrivals and the answer is delivered once ready (dropped under `drop`).
- **U3:** the finish phase reports only fibers already parked at the last cut; a fiber it starts is not reported.
**Counts:** 17.2 has 14 rows, 26 defined (23 modelled); 17.3 has 18 rows, 108 cells, 83 defined. All 23 and all 83 are reached.

## 3. Invariants (`wire-output.txt`; each checked on every transition; none fails)
77 invariants pass, 0 failing. New or changed this round (evaluations): W26 ping: delivered when due (676), not counted (676), not doubled (676), stopped by a hold (9,645), queues nothing (9,645), ranks first (1,699), resumes `every` from then (7,395); W8 a count reached during a release queues the rest (1,438); W11 no marked request survives a release (465,693) and NothingHeld counting pending marks (919,418); W24 the finish phase counts only fibers parked at the last cut (1,313,418; 11,635 with a parked fiber) and leaves the state untouched (1,313,418). Kept: W1 determinism (3.94M), W7 combination, frames rules, used-up rule removed (311,696), holding rule kept (2.13M), W8-W10, W12-W20, W22, W23, W25.

## 4. Mutants: 92 killed, 3 survived (of 95)
**Wire model, 74 mutants; 72 killed:**
| Reverted rule | Killed by |
| --- | --- |
| W fifoAnswers: one FIFO answer list, drained when nothing else is runnable | W6-no-nested-answer |
| W answerFifoOrder: the oldest answer is delivered first | W3-fifo-answers |
| W framesBeforeAnswer: a handler's sends are delivered before the next answer | W15-frames-not-discarded, W5-frames-before-answer, W6-no-nested-answer |
| W arrivalOrder: handlers run in arrival order | W4-arrival-order |
| W connOrder: rows reach connections in their open order (G7) | W1-determinism |
| W earliestWins: the earliest-set arrival rule wins | W7-combination |
| W oneRule: arrivals consume only the winning rule | W7-combination |
| W attemptSkipsDup: a duplicate means nothing to an attempt (G5) | W7-combination |
| W handleCoversAttempts: a hold or drop on a handle covers the next attempt (G4) | W7-combination |
| W framesAllApply: frames rules do not compete (G9, G8) | W7-frames-rules-effect-at-open, W8-after-counts-from-first-frame |
| W holdsJoin: a connection is silent while any hold covering it stands (G2) | W8-hold-joins-holds |
| W handleBoth: a word on a handle is two rules | W8-hold-silences-open-at-once |
| W offline: drop() with times above 1 or always also stands | W14-offline-means-offline, W14-stands-iff |
| W dropStandsIfNone: default drop() stands only when no connection matched | W14-stands-iff |
| W noConnErr: a stream drop() with nothing matched is NoConnection | W14-no-connection |
| W dropCloses: drop() closes matching connections at once | W14-no-connection |
| W releaseScoped: release() delivers only its own rules' items | W10-release-scoped |
| W releaseEnds: release() ends its target's rules | W10-release-ends-own-rules, W11-release-did-something, W17-release-order, W23-no-deadlock, W9-release-closing |
| W releaseEndsFirst: release ends its rules, then delivers (G16) | W17-release-order, W22-states |
| W releaseMatch: release({ match }) is its own word | W25-match-leaves-rest-held, W25-match-rule-stays |
| W matchOnly: release({ match }) leaves the rest held | W25-match-leaves-rest-held |
| W releaseAnswersFirst: released answers join before released handlers run (G3) | W3-released-answers-before-released-handlers |
| W nothingHeld: release with nothing held and nothing standing is NothingHeld | W11-nothing-held, W11-release-did-something |
| W nthCallError: nth with fewer than k held is NothingHeld | W11-nothing-held, W11-release-did-something |
| W releaseArrivalOrder: held items go in arrival order | W17-call-release-order |
| W orderCopy: one outcome order, a copy first (G1) | W12-outcome-order |
| W orderHold: marked to hold before gone (G1) | W12-outcome-order |
| W orderDrop: marked to drop | W12-outcome-order |
| W orderGone: gone is orphan | W12-outcome-order |
| W crashAtomic: a crashed handler commits no truth and sends no frames | W12-crash-atomic, W12-crash-no-frames |
| W copyDiscarded: the copy's answer is discarded | W12-outcome-order, W15-copy-answer-discarded |
| W copyFrames: the copy's frames are not discarded | W15-frames-not-discarded |
| W goneFrames: an orphan's frames still go | W15-frames-not-discarded |
| W closeLast: a server close under hold is queued last | W9-close-queued-last |
| W closeDropped: release({ drop }) of Closing is close 1006 | W9-release-closing |
| W closeUncounted: release({ nth }) does not count the close | W9-release-closing |
| W closingNoSend: a send to a Closing connection reaches nothing | W9-closed-receives-nothing |
| W afterPerConn: hold({ after }) counts per connection | W25-match-leaves-rest-held, W8-count-is-per-connection, W8-count-pauses-while-silent |
| W afterFromFirst: a count set before open starts at the first frame | W7-frames-rules-effect-at-open, W8-after-counts-from-first-frame |
| W afterDupTwice: a duplicated frame counts as two | W7-frames-rules-effect-at-open, W8-after-counts-n |
| W timesPerConn: times counts connections | W8-times-counts-connections |
| W nthPerConn: release({ nth }) is per queue | W17-release-order |
| W endOnOpen: end: true on open is frames, then close 1000 | W18-end-on-open |
| W refuseCode: refuse is Closed { code } | W18-refuse |
| W holdSilencesNow: hold() takes effect on an Open connection at once | W8-hold-joins-holds, W8-hold-silences-open-at-once |
| W afterNegErr: a negative hold({ after }) is StoryInvalidCommand | W8-negative-after-is-invalid |
| W openCrashCode: a crashed open is Closed { 1011 } | W12-open-crash-1011 |
| W dropHeldLost: release({ drop }) of a Held request is lost before the server | W13-release-drop-held-is-lost |
| W pruneSpent: a used-up rule that holds nothing is removed (N3) | W7-used-up-rule-removed |
| W pruneKeepsHolding: a used-up rule that still silences a connection is kept | W7-holding-rule-kept |
| W matchNothingHeld: release({ match }) with no matching held item is NothingHeld (N1) | W11-nothing-held |
| W ownRulesNotApplied: a release's own target's frames rules do not apply to what it delivers (RV3 M6) | W25-match-delivers, W8-count-reached-requeues |
| W countPausedWhileSilent: a count pauses while the connection is silent (N4) | W8-after-counts-n, W8-count-is-per-connection, W8-count-pauses-while-silent, W8-count-reached-requeues |
| W dupEarliestOnly: one frame takes only the earliest armed duplicate (N5) | W17-release-order, W25-match-delivers, W8-dup-never-thrice, W9-release-closing |
| W nthWithinKind: nth orders within a kind; answers still join first (N2) | W3-released-answers-before-released-handlers |
| W handleReleaseOrder: a handle's release reaches queues, then answers, then requests (RV3 L2) | NONE (survived) |
| W finishReleases: the finish phase releases every held item | W24-end-of-run-classification |
| W finishCloses: the finish phase closes every open connection as the network would | W24-end-of-run-classification |
| W finishSettles: the finish phase settles after each step | W24-end-of-run-classification |
| W finishOnClone: nothing from the finish phase reaches the evidence | W24-end-of-run-classification, W24-finish-leaves-no-evidence |
| W finishIgnoresNew: the finish phase reports only fibers parked at the last cut (U3) | W24-end-of-run-classification |
| W pendingCountsAsHeld: a request marked to hold, still at the server, is a held item for every release (U2) | W11-no-pending-mark-survives-release, W11-nothing-held |
| W countRequeues: a count reaching n during a release's own delivery queues the rest again (U1) | W8-count-reached-requeues |
| W pingDelivers: a ping is delivered when due | W26-ping-delivered-when-due, W26-ping-ranks-first |
| W pingNotCounted: a ping takes no count of hold({ after }) | W26-ping-not-counted, W8-after-counts-n, W8-count-is-per-connection |
| W pingNotDoubled: a ping takes no duplicate | W26-ping-not-doubled |
| W pingStopsOnHold: a hold stops pings | W26-ping-stops-on-hold |
| W pingNoQueue: a ping never queues | W26-ping-queues-nothing |
| W pingRankFirst: a ping ranks before a client's idle deadline | W26-ping-delivered-when-due, W26-ping-ranks-first |
| W pingResumes: after a hold the next ping is every from then | W26-ping-resumes-every-from-then |
| W pumpK: a chain of K hops completes (K smaller) | W19-drain-cuts-long-chains |
| W pumpK: a chain longer than K is cut (K larger) | W19-drain-cuts-long-chains |
| W idleResets: the idle count resets on any arrival | NONE (survived) |
| W eorOnce: HostTimeWait is classified once, at the end of the run | W19-no-per-settle-host-wait |
**Old model, 21 mutants; 20 killed (not re-run):**
| Reverted rule | Killed by |
| --- | --- |
| 3.5 ranks: world, adapters, setup fibers, Runtime waits, actor schedules | 6-conformance:T:rank-order |
| 3.5 'then by arming' is the last key | 1-determinism |
| 3.1 suspended: the tab runs nothing | 6-conformance:T:suspended-tab-fired |
| 3.1 world/together/advance settle after each control | 2-settling |
| 3.2 NothingHeld | 4-reachability |
| 2.6 a Held lane is left by retry or cancel | 5-deadlock |
| 3.2 release() also removes standing rules (the old release()/NothingHeld deadlock) | 5-deadlock |
| 3.2 release() ends only its own target's standing rules | 6-conformance:W:release-ended-other-target |
| T2/C3 no step names an ending | 3-injected, 6-conformance:L:stale-commit-answer |
| 3.2 a request of a gone client stays in transit | (changed) 4-reachability |
| 3.2 cancel with the request on the wire interrupts the client | 4-reachability, 5-deadlock |
| 2.5 the acknowledgement write gates the send | 4-reachability, 4-reachability |
| 2.10 only an awaiting finalizer makes a close wait (suite) | (changed) 4-reachability |
| 3.2 release({ drop }) of a Held request makes it Lost | NONE (survived) |
| 3.3 drop({ at: open }) refuses the attempt | 4-reachability |
| 3.2 duplicate(): the client sees the first answer only | 6-conformance:L:stale-commit-answer |
| 3.2 the answer of a gone client goes nowhere | 6-conformance:L:stale-commit-answer |
| 3.4 leave() of a resumable fragment freezes it | 4-reachability |
| 3.6 ghost restore | 6-conformance:R:late-ack-restored#1, 6-conformance:R:late-ack-restored#2, 6-conformance:R:late-ack-restored#3 |
| 3.6 ghost restore | 2-settling |
| 3.6 ghost restore | 6-conformance:R:late-ack-restored#1, 6-conformance:R:late-ack-restored#2, 6-conformance:R:late-ack-restored#3 |
**Survivors.** (1) *Old model, `release({ drop })` of a Held request:* the old lane resolves the same either way; the wire model kills the same rule. (2) *`idleResets`:* in this model all work runs before any idle hop and chains advance only on idle hops, so activity never lies between a chain's hops. (3) *`handleReleaseOrder`:* with a handle, no held answer can exist (`at` on a handle is a type error), so queues against answers cannot be observed in this fake. **Weak kills (reachability only):** the old model's seven listed earlier.

## 5. Undefined cells
**None reached.** U1, U2 and U3 are answered by the spec and the model now agrees; the search found no new cell without an answer (the ping rows have all their cells). G1 is reached and behaves as stated. Not modelled, so not checked: a ping's coalescing while a tab is suspended (one at wake), the 100,000-deadline limit on `advance` (a ping counts toward it), a ping's `delivery` record, `ping` on `Fake.fetch` bodies, and a ping's frame encoding.

## 6. Simulated by a hand-set flag, not derived
- **A handler's throw** is a truth flag (`ctl.boom`, `ctl.boomOpen`).
- **The client fibers** are chosen by `ctl.chain:n`: a hop count (n up to 5, K is 3, not 4096), a fiber that waits on its connection (100), one that waits on its own calls (101).
- **The client's idle deadline** is a fixed rule (drop after 2 ticks with nothing received), not a client half's `idleTime`; time has one tick unit and a cap of 4 ticks, and only `Ping` uses it. There are no other deadlines (the finish phase's third step is empty), no `together({ advance })`, no tab suspension.
- `Server` is observed only through `together`; `release({ match })` matches on the client (`A`/`B`); frames are integers; two clients, one connection each, one room; at most 3 messages.
