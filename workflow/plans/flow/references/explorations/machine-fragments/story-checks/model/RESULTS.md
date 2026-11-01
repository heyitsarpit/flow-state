# Stories executable model, extended for the amended wire (stories-amended.md after round 3: 1.6, 2.10.2, 2.10.4, 2.10.17; fakes-v2.md)

Design check, not production code. Copied from `merged/stories/model/` (not edited there). Everything runs serially, one bun process at a time.
Run: `tsc -p .` (clean); `bun wire-main.ts` (the wire model: 49 s, 1.20M states, peak 1.38 GB); `bun main.ts` (the old downstream model: 27 s, 597k states, peak 1.40 GB, unchanged since the last pass); `python3 mutations.py` (all 85 mutants) or `ONLY="W " python3 mutations.py` (the 64 wire mutants, about 9 min).
Files: `wire.ts` + `wire-main.ts` (the wire), `model.ts` + `main.ts` (old lane, storage, session, host), `mutations.py`, `output.txt`, `wire-output.txt`, `mutations-output.txt` (full pass before round 3: old model 21 mutants, wire 55), `mutations-wire-output.txt` (the 64 wire mutants after round 3).
**Which mutants were re-run:** after this round only the wire mutants (all 64, since release, delivery, rules and the end of the run were rewritten). The 21 old-model mutants were not re-run: `model.ts` and `main.ts` did not change in this round, and their last full result stands (20 killed, 1 survived).
**Memory and caps:** states are kept as key strings; every wire search is capped at 200,000 states. `Frames`, `Closing`, `Handle` and `Pump` stop at the cap in the middle of depth 5 or 6 (`Closing` 6, `Frames` 5, `Handle` 5, `Pump` 5); `Calls[dedupe]` (180k states) reaches depth 6, `Calls[ack]` depth 6, `Open` depth 6, `Nth` depth 8, `Calls[nodedupe]` depth 5, all complete. "PASS" means no counterexample within those depths and alphabets (`wire-main.ts`).

## 1. The old model: unchanged
`latency`, the Effect-form handler, `HostTimeWait` as a step error and rank 1 "fake servers" are gone from it; its deadlock check follows only recovery steps. See earlier results: all its checks pass; its Server-cell and progress-setter reachability fell with latency and is covered by the wire model.

## 2. What the wire model does (`wire.ts`), after round 3
As before (two lists, frames rules that all apply, holds per connection, the one outcome order, `release({ match })`, per-queue `nth`, open order), and now:
- **Rule 4, a `release` must do something:** `NothingHeld` when it ends no rule and delivers no item; `release({ match })` is `NothingHeld` when no held item on its target matches, whether or not a rule stands or other items are held.
- **Rule 5, a rule ends when it has nothing left to do:** a used-up rule is removed at once unless it still holds an item, silences a connection, or has a count or a duplicate armed; then `release` ends it. (Replaces the previous model's "used-up rules stay".)
- **Rule 3 in full:** `release` ends its target's rules first, then delivers; the frames rules of its own target do not apply to what it delivers, even under `{ match }` (where the rules stay); another target's do. Under `{ match }` a matching `Silent` connection with another target's hold is not delivered; a matching `Closing` one gets its frames but its close waits until no hold is left. A handle's release reaches connection queues, then answers, then requests.
- **Counts and duplicates per rule:** a count counts delivered frames and pauses while the connection is silent (set on a `Silent` or `Closing` connection, it starts when frames flow again); each `duplicate` rule doubles one frame, one frame takes only the earliest armed one, so no frame arrives three times.
- **`nth`:** the k-th goes first within its kind; released answers still join before released requests run.
- **The finish phase:** at the end of the run, if any fiber is parked, a copy of the world is finished: release every held item, close every open connection as the network would, fire deadlines (this fake has none), settling after each; a fiber still parked is `HostTimeWait`. Nothing from the copy reaches the evidence. Fibers are of three kinds, kind chosen by the control `ctl.chain:n`: a promise chain of n hops (cut at K, never woken), one that waits for its client's connection to close (code 100), one that waits for its client's own calls to finish (code 101). The owner and held-item tests are gone.
**Counts:** 17.2 has 14 rows, 26 defined (23 modelled); 17.3 has 17 rows, 80 defined. All 23 and all 80 are reached.

## 3. Invariants (`wire-output.txt`; each checked on every transition; none fails)
68 invariants pass, 0 failing. New or changed this round, with evaluations: W11 NothingHeld, now including `{ match }` (853,690); W7 used-up rule removed (287,370) and a holding rule kept (1,790,175); W25 match: rule stays, rest stays held, matching delivered (28,111 each), frames delivered and the close waits (12,504; 1,721); W8 one frame never arrives three times (91,728), a count pauses while silent (162,781), a count is per connection and ignores the releasing target's own (276,799); W17 handle release order (queue, answers, requests); W24 end-of-run classification over every reached state (1,198,099; 11,112 with a parked fiber) and the finish phase leaves the state untouched (1,198,099). Kept: W1 determinism (3.68M), W2 settling, W3 FIFO and released answers before released handlers (284,566), W4-W6, W7 combination (950,983) and frames rules all apply (102,719), W9 Closing, W10 release scope and other-hold, W12 crash and outcome order (482,623), W13-W16, W18-W20, W22, W23 no deadlock (6,731). Reachability PASS.
**End of run:** `connect A ; w ctl.chain:4 ; post B` is `HostTimeWait` (a chain cut at K); with `ctl.chain:100` instead, the finish closes the connection and the fiber is woken.

## 4. Mutants: 82 killed, 3 survived (of 85)
**Wire model, 64 mutants; 62 killed** (`mutations-wire-output.txt`):
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
| W ownRulesNotApplied: a release's own target's frames rules do not apply to what it delivers (RV3 M6) | W25-match-delivers |
| W countPausedWhileSilent: a count pauses while the connection is silent (N4) | W8-after-counts-n, W8-count-is-per-connection, W8-count-pauses-while-silent |
| W dupEarliestOnly: one frame takes only the earliest armed duplicate (N5) | W8-dup-never-thrice |
| W nthWithinKind: nth orders within a kind; answers still join first (N2) | W3-released-answers-before-released-handlers |
| W handleReleaseOrder: a handle's release reaches queues, then answers, then requests (RV3 L2) | NONE (survived) |
| W finishReleases: the finish phase releases every held item | W24-end-of-run-classification |
| W finishCloses: the finish phase closes every open connection as the network would | W24-end-of-run-classification |
| W finishSettles: the finish phase settles after each step | W24-end-of-run-classification |
| W finishOnClone: nothing from the finish phase reaches the evidence | W24-finish-leaves-no-evidence |
| W pumpK: a chain of K hops completes (K smaller) | W19-drain-cuts-long-chains, W24-end-of-run-classification |
| W pumpK: a chain longer than K is cut (K larger) | W19-drain-cuts-long-chains, W24-end-of-run-classification |
| W idleResets: the idle count resets on any arrival | NONE (survived) |
| W eorOnce: HostTimeWait is classified once, at the end of the run | W19-no-per-settle-host-wait |
**Old model, 21 mutants; 20 killed** (not re-run this round):
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
**Survivors.** (1) *Old model, `release({ drop })` of a Held request:* the old lane resolves the same either way; the wire model kills the same rule (`dropHeldLost`). (2) *`idleResets`:* all work runs before any idle hop and chains advance only on idle hops, so activity never lies between a chain's hops; a limit of the model, not a spec gap. (3) *`handleReleaseOrder` (a handle's release: queues, then answers, then requests):* with a handle, no held answer can exist (`at` on a handle is a type error), so the order of answers against queues cannot be observed in this fake; the rule is stated and untestable here. **Weak kills (reachability only):** the old model's seven listed earlier.

## 5. Undefined cells and notes (reached by the search; not resolved in the model)
N1-N6 are answered by the spec and the model agrees (no invariant fails). What the search reaches that the spec does not answer:
- **U3 (REACHED) 2.10.2 part 2, a fiber started by the finish phase.** Releasing held items can deliver a frame that starts a new fiber whose chain is longer than K; it parks, and nothing says whether it counts as "still parked at the end of the run", though "nothing from this phase reaches the evidence". Model: it counts. Trace: `connect A ; w ctl.chain:4 ; post B ; w handle.hold ; post B` (the second `post B` is held, the finish delivers its frame).
- **U2 (REACHED) 17.2, `release()` x `Server` and "handler answers" x marked to hold.** `release()` on a target ends its standing rules; a request at `Server` already marked to hold by that rule becomes `HeldAnswer` after the rule is gone, held by nothing that exists; a second `release()` still delivers it (an item exists). The tables are consistent but the mark outlives its rule, and rule 5's "removed unless it still holds an item" is silent on a rule `release` itself ended. Trace: `w post.hold:resp ; together post A+w post.release`.
- **U1 (not reached) a count reaching its n during a release's own delivery:** the model re-queues the rest after a plain release but not under `{ match }`; no cell says which. Reached only if the search finds a count of another target on a connection being released; it did not within the bounds.
- **Notes, defined but surprising:** a `release({ match })` that completes an `Opening` attempt leaves the connection `Open` under its own standing `hold()` (rule 3: own rules do not apply to what it delivers); G1 is reached and behaves as stated.

## 6. Simulated by a hand-set flag, not derived
- **A handler's throw** is a truth flag (`ctl.boom`, `ctl.boomOpen`).
- **The client fibers** are set by `ctl.chain:n`: a hop count (n up to 5, K is 3, not 4096; hops advance only on idle hops of the drain), a fiber that waits on its connection (100), one that waits on its own calls (101). Real client halves do not wait on these by a flag; the finish phase is checked against these stand-ins.
- No Clock, no deadlines (the finish phase's third step is empty), no `together({ advance })`, no tab suspension; `Server` is observed only through `together`; a `release({ match })` matches on the client (`A`/`B`).
- Frames are integers; two clients, one connection each, one room; at most 3 messages.
