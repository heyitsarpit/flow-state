# Round 7: mid-round status

Checkpoint for review. Proposed, throwaway. RESULTS.md is not written. Marks: [ran], [read], [reasoning]. Decided: D80's 5 s and hide flush (owner); M9/D89, M2/D87, H2 option A (relayed delegation). Everything else proposed.

**Done:** H1 (D83), M1 (D84), D80, M2, M8, M9, M11, M13 (D90), L1-L4, typed Pay and ThreeDS/Countdown, `flow check`, static `flow explain`, cli-outputs.md. New in-round: D93 (retired record flushes now), D94 (an awaited write waits for its actor's unanswered plain batch and carries what it owes), SEARCH-FLUSH.
**Not done:** RESULTS.md, budgets draft, harness-dependency list, Pay six-bug score write-up, E2 below, M5, M6, M10, M12 (H2's), full old mutant list (only 24 of the old list ran before I stopped it). H3 is **not fixed**.

## Ran [ran]
- Suite 545/545, deep-freeze 545/545, `--round 7` cites agree. Red first: round 6 on the first repaired suite, 520/539 (`conformance/red-round-7.txt`).
- H1, real `tx.abort()`, real server: round 6: 12/12 two charges, 12/12 told "not charged". Round 7: 0/12 (before and after D94), UNSURE then PAID. Order case: round 6 `old` 10/10, round 7 `new` 10/10.
- M1, no-reconcile machine, 48 kills after success: round 6 `U` held 40/48; round 7 `B` 48/48. Pay kills, 40 cycles, no sleep, last run: 0 double, **1 charged with no lane**, `PLACING` restored 0, NotSent 3, unknown 18.
- D80 real: tab hidden, then SIGKILL at the beacon: newest 12/12. Tab close 12/12. Pagehide with auto-commit: 0/12 on `navigate`. **With explicit `tx.commit()`:** navigate 12/12; reload 6/6 at 100 messages, **0/6 at 10,000**; kill at pagehide's beacon 6/6, **0/6 at 10,000**. Kill or crash before any hide event: 0/84 newest, as D80 states. `tx.commit()` is a host requirement; a pagehide write of a large record is unreliable.
- Cost, busy %, 0/100/500/5,000 ms: 10,000 at 6x (stress) 69/26/6/1; 1,000 at 1x 9/2/1/0. Turn p99 0.2 ms at 5 s.
- M13: turn at 1,000 actors 23 to 3 us, 10,000: 245 to 3.3. S4 polluted 6x, 1,000: 363 to 17.6 us; 3,000: 1,330 to 17.8. Seal Pay 11 to 16 us.
- Quota: **null result.** CDP's override changes `estimate()`, and Chrome committed 1.9 MB against a 1,000-byte quota. No real quota failure occurred; only `tx.abort()` stands in.
- Builder mutants before D94: 21/35; rerun running. So far `d94-does-not-wait`, `d94-owed-not-carried`, `d93-retired-coalesces`, `d83-awaited-no-stamp` survive, so **D94's and part of D93's/D83's cases do not pin them**. All builder-written.

## `search-flush-plant-a`
It plants old H1 in the driver: a failed batch re-enters all its keys, ignoring the issue number. **Before D94 the oracle caught it:** verdict failed at depth 8, `(a) a second Attempt att-1-2 beside undecided att-1-1 on failHeld Go sayFailed FLUSH ack KILL Go ack` [ran, that output was overwritten]. **The file in this commit is the rerun after D94: inconclusive, depth 12, no failure.** D94 now holds the ack until the failure is answered, so this plant can no longer act there [reasoning, not proved]. So on current code the plant is not shown caught, and I owe a plant that bites with D94 in place. No classes because `classes` fills only from Pay's money audit; bare has none. Other plants caught: mix of two turns, bare depth 4 (b); in a fragment depth 5 (b); hold never released, bare and frag depth 6 (c). (d) has no plant of its own that reached a guard before (b) fired: **(d) is not shown catching anything.**

## Pay's classes
All are reached with Pay pressed twice or the pinned P1-P6 scripts, and every one matched a pin except P7. **Known by family, new by name:** `two-keys-one-intent:STUCK` and `told-not-charged:STUCK` appear only in `flush.pay.tight` at depth 14 (round 6's search has no STUCK). Witness: `Pay ack pay.ok Pay ack pay.ok KILL ack KILL ack KILL ack KILL`: P6's second press, then restarts spending `place`'s retry budget. Matched by the regex pin, not by a checked cause [reasoning].
**New: P7** (Pay's bug, same at capture 0): `void`'s `NotSent` maps to `Voided`, so a refused ack says "released" with the hold there. Exempted in the search by a script test. SEARCH-PAY's dedupe hid it behind a pinned path: **pins by script plus state dedupe can mask a class.**
**E1, fixed by D94:** failed plain batch, next ack lands, kill: completed `pay` returned held; Pay reached held-no-owner:PAID and placed-and-voided. Same flush.pay now: unpinned none, depth 7, 58,013 states; tight depth 14.

## Restore exceptions
Oracle (b) requires the actor's cut to be one it published, and that held everywhere. The exception counts boots whose (cut, lane rows) pair never coexisted, not failures: bare 299, Pay 247, frag 0. Allowed because actor and lane are separate records. Two directions: lane ahead of memory (now only a re-send's capture and a lane after a read of older disk) and **E2, memory ahead of lane, which is open and I do not think should be allowed:** `failHeld Go Note FLUSH KILL`: Go's batch fails unanswered, a later flush lands the actor, kill: restored `W`/`PAYING` with no lane and no ending; nothing charged, but the state waits for nothing. Needs a failed write and a kill before its answer. Candidate: one plain batch out at a time. Not built.

## The 59 at 5 s
All 59 classified: **35** read or corrupted disk before the first flush (pass when a flush precedes reads or corruption) [ran, by differential]; **12** expected plain loss at a kill, including the actor's first record [ran, kill trace in `suite-at-5s-traced.txt`]; **1** real bug, fixed: `REV5-H5H6/a-disposed-identity-sleeps-through-a-reload`, a retired record coalesced, so a kill woke the actor (D93; now 58 fail); **11** by reading only, not traced: 6 where the sweep overrides the case's own bound (REV6-CAPTURE x2, REV7-H1 x2, REV7-M9, REV7-SEARCH-FAKE), HIGH-02, SPIKE-05, REV6-M7 x2 (disk read early; fault consumed by my forced flush), L2-down (the capture timer is counted). Those 11 fail the owner's "no timing without a trace" until traced.
`FRAG-10/reload-inside-the-subroutine`: held back the actor; `BankShown` lost, so its armed deadline went with it: an earlier true state, classed expected. **Open for the owner:** a leaf change and an armed timer coalesce too; "plain memory" reads narrower than what D80 loses.

## Typed coverage
`--swap` replaces by identity: pinned Pay with typed Pay, `pay-full`'s ThreeDS and Countdown with typed ones; its host machine and OrderSummary stay hand-written. Counted cases below; the other cases run hand-written `Compiled`. Data diff: 49 differences, 46 the hand fixture's `on.on.` path typo, 3 stated. Five `@ts-expect-error` groups hold; an unknown event or state key is **not** refused by types.

## Known-failing
H2: `round-7/known-failing-h2.ts` (A1, A2 shape; A4 now shows empty; A3 not run), not in the suite. Real desk with the whole-record oracle: `an-actor-disposed...` revision 1 against 2, unmarked. The `flow check` desk result: 5 `UnresolvedHold` true of the hand fixture; real dispatch-desk not checked.

## Unexplained
- **H3:** D85's marker does not help. Charged, nothing on disk, marker gone too: marker 3/240, no marker 2/240, reopen 2/180, Pay table 1/40. Cause not established. Aged-database test: timed out twice, no result. "0 acknowledged writes lost" is not supportable.
- 10,000 messages lost at reload but not navigate. Why not established.
- Long tasks: 0 observed at n=60 and n=240 with `takeRecords`, 26% busy; the review saw 36 and 42%. Not resolved.
- `three-silent-reads` and the T1 deadline case are still weak: extending it showed `PageSilent` at 30 s, so it cannot reach the idle deadline without answering the read.
