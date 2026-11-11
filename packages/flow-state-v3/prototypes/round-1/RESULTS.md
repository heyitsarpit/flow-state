# Round 1: Checkout's Pay on a real runtime

Status: proposed, throwaway. Everything marked ran was run on 2026-11-02, Bun 1.4.2, Effect 4.0.5, this Mac, one process at a time. Outputs: `suite-output.txt`, `mutants.txt`, `measure.txt`, `../conformance/red-round-1.txt`. Commits: red `25d48681`, green `1fd45ef2`.

**Verdict.** Pay runs from hand-written compiled data, including reloads, a lost answer, the same-id re-send, timeout and disposal. The shape in convergence-1 holds: one pure step plus a fence replaced every latch, with real Effect only at the edge. Four things in the design need changing (F1-F4 below). Three stuck worlds involving real money are in the converted Pay machine and no runtime invariant sees them (F5-F7).

## What I read

`AGENTS.md`, `prototypes/README.md`, `convergence-1.md`, `SCENARIOS.md` in full. `machine-design.md`: 2.5, 2.7.1, 2.7.12, 2.7.13, 2.7.15, rules 13-19, 23-25, 44, 46 and the storage paragraph near line 4260. `Pay/pay.{machine,contracts,definition}.ts`, `pay.story.ts` lines 1-50, 165-177, 250-300, `Cart/cart.contracts.ts` `unknownWhenLost`. `Persistence.plan` O6 only, because the design is silent on what "never acknowledged" looks like on disk. `s2-completion/main.ts` and its results. `node_modules/effect/src`: `internal/effect.ts` `runForkWith`, `Scheduler.ts`, `Cause.ts`. `codebases/xstate/.../createActor.ts:280-299`, `codebases/alien-signals/src/index.ts:106-112`, the start of `tanstack-query/.../mutationCache.ts`. Not read: `db`, `mono`. Skills: execute-task was not opened; policy-code-correctness and principle-claim-only-what-you-checked, the opening sections; policy-code-composition not opened.

## What runs

- `round-1/`: `step.ts` strata F, N, A0, P1, P5, P6, P7, C, D, O; `lane.ts` the table as data; `reads.ts`; `timers.ts`; `persistence.ts`; `driver.ts` shape B (`runFork` + `addObserver`); `adapter.ts`.
- Fixture: root plus 9 states, 5 operations (`pay`, `place`, `void`, `intent`, `order`), commits through Effect against a fake `ShopApi`. Every ending comes from the fake through a fiber. No core seam: faults reach the runtime through Slots, a module, the Host, the driver's own `input` port, or a source edit.
- Plan: `bun packages/flow-state-v3/prototypes/conformance/main.ts --round 1 --runtime ../round-1/adapter.ts`, and `conformance/mutate.ts`.

## Suite output

```text
red:    0/22 cases pass (null adapter). One case first passed vacuously; fixed before the red commit.
green:  35/35 cases across PAY-01..15. Unlogged expectation changes: none. Catalog disagreements: none.
        Same 35/35 with drain budget 0 (a macrotask after every step): order did not change.
SEARCH-PAY: inconclusive. 13 actions. No oracle failed.
  exact: depth 6 complete, 157,998 scripts, 1,376,001 steps. Depth 7 hit the 200k cap.
  deduped on a fingerprint of Reads: depth 8 complete, 9,171 replays, 1,968 fingerprints. Hidden state is merged, so this is not a proof.
  45 s, peak RSS 171 MB. Replay checked per script in the exact phase.
UNTESTED: owed by this round: lane.retry.Idle, retry.InFlight, idle.InFlight, idle.Held, restore.Idle, runtimeDisposal.Idle (Pay cannot reach them), D7, D13.
OLD-RULE: PAY-06 cites rule:25, also cites D8: ok. No flags.
NO-DECISION (catalog-wide): LIB-03 DRV-04 STREAM-21 CACHE-01 CTX-01 HOSTILE-02 BROWSER-02..04. None in round 1.
```

Fault injection: 22 mutants, source edits in a scratch copy, **22/22 killed** in the final run. First runs: 5 survived (`timeout-no-interrupt`, `timers-not-restored`, `late-treated-as-current`, `rule15-off`, `cancelled-reads-interrupted`), then `dead-timer-fires` once its edit was corrected. Each survivor became a tighter scenario, logged. The catalog's four required mutants are all killed by both scenarios and search, except `drop-fence`, killed only by scenarios: **at depth 5 the search has no script that reaches it**, because its alphabet has no duplicate or late completion. The search's teeth there are unproven.

## Findings, by what they change

### Plan wrong

| # | Finding | Evidence | Proposed change |
| --- | --- | --- | --- |
| F1 | One write-ahead record cannot work. Walkthrough step 2 stores a record saying "waiting for ack"; after the ack, the record on disk still says that, so restore would answer `NotSent` for a charge on the wire. An Attempt needs **two writes**: a capture with `acked: false`, then the acknowledgement. | Built that way; mutant `restore-notsent-when-acked` killed by search and PAY-08 | Amend section 1 and Persistence O6. S3 must measure two writes per Attempt. A second confirmation-lost case (design's `hold({ at: "response" })`) runs as PAY-09 |
| F2 | D10's "the value stays" is unsound. Three cases: a turn's step aborting leaves its mail runnable, so `pump` spins forever (I drop the item, and a dropped ending would leave a settled lane with no mail, flagged `stuck:` by reading the code, not run). A `sent` step aborting **loses the only completion**: the charge landed, row `pending` [ran, `measure.txt`]; it recovers only because `pay` has a timeout, and an op with none stays pending for good, which breaks L5. | `measure.txt` last two lines | D10 needs a recovery rule per input kind. My pick to try: split the core's own applied-now work from module hooks, so a hook throw never eats a completion |

### Plan silent

| # | Finding | Decision |
| --- | --- | --- |
| F3 | Ordinary timers must persist. Rule 23 persists keyed timers only. Reload in UNSURE: `PayUnsure` is `self`, nothing re-enters, and without its saved timer the reconcile stops forever. | Built: the actor record carries `{ dueAt, gen }` and restore re-arms. PAY-08/reload-while-reconciling |
| F4 | The seam in section 7 is too small. `Result<S>` cannot flip `Attempt.waits`, apply the storage-refused cell or arm a bound. And section 3 puts unacked in `ext.persistence` while `Attempt.waits` puts it in the core. | Took `Attempt.waits`. Gave hooks the transaction, breaking D9's "never touches world": it caused one real bug (a spread evaluated before the hook ran). Propose a small effect list on `Result` |
| F8 | A store with FIFO per key holds the final capture behind a held ack, so disposal's parked `Disposed` needs the ack to land first. Also after a hung ack's bound, later writes for that key wait too, so a reload can deliver `NotSent { Restored }` for an Attempt already ended. | Stated limit. The table's "last good capture" sentence covers the safety; PAY-13 has both variants. Second delivery is allowed by rule 17's crash clause |

### Code wrong, plan right

| # | Finding |
| --- | --- |
| F5 | **Press Pay in UNSURE.** `onPay`'s root alternative has no guard and `Pay.tsx` enables the button from `check()`. The checkout moves to PAYING, the commit is `Rejected`, and PAYING has no call and no reconcile: an hour later, row `uncertain`, zero new requests [ran]. Rule 16 already says `flow check` warns. `O.pay.idle` on that alternative is the fix. Search counted 8,725 such endings. |
| F6 | **Late `Confirmed` in a new PAYING** (Leave, Start, Pay, then the first confirm lands). Rule 14 routes it to the root's `{ target: "self" }`. Charged, `authorized: false`, no lane, `waits: []`, forever [ran]. Leave would not void it. Same pattern as `lateStaysPaying` in `pay.story.ts`. |
| F7 | **A throw on an ending's turn loses the money fact** (PAY-11). The cell is kept and the turn dropped, as F3.1 says, and an issue is raised. Then `authorized` is false with a live charge and Leave does not void [ran]. Accepted by the design; worth knowing. |
| F9 | Mine: generations restarted at each boot, so a re-send after a reload could repeat a send number. Section 3 said `boot` prefixes ids. Search found it at depth 6. |

### What this says about the invariants

**L3 is too weak, and that changes the design.** F5 passes because a hold "names its owner"; F6 passes because no Attempt exists. Neither is detectable from a lane. A liveness rule about Attempts cannot see a machine parked waiting on nothing. Proposed: keep L3 for the runtime, and give `flow check` the real one: from each leaf with a possible hold or dead ending, some path to resolve it exists. Round 1 can only report it as a probe; the search's `heldWithNoOwnerInLeaf` is that probe, not an oracle.

### Costs too much, or estimated wrong

| Item | Budget | Actual |
| --- | --- | --- |
| Step, loop, strata (`step.ts` 580 + `world.ts` 218) | 500 | 798 |
| Lane table (`lane.ts`) | 250 | 288 |
| Reads, timers (`reads.ts`, `timers.ts`) | 200 | 114 |
| Persistence | 150 | 184 |
| Publication | 100 | 52 |
| Driver | 300 | 196 |
| **Core + driver** | **1,500** | **1,632**, formatted by `vp fmt` at 100 columns, comments included. Stop line not hit: core without driver is 1,436 against 1,600 |
| Adapter | 100 | 215 |
| Suite | 700 (section 13), about 1,000 (section 12) | 2,590, of which fixture 511, scenarios 678, fake world 316, search 305, mutate 226 |

- **Driver share:** 12%, against the 35% trigger.
- **Search estimate wrong.** Section 12 says depth 8 over 9 actions is under 200k replays; 9^8 is 43M. Enabled-action pruning gets exact depth 6 over 13 actions. Reaching 8 took deduplication on Reads, which proves less.
- **Cost per turn, Bun only, this Mac:** 0.44 us without modules, 1.05 us with persistence captures (median of 5 x 50,000, a small world, no frames retained, no view built). Whole paid path through the harness with real fibers: 84 us. A microbenchmark: says nothing about a phone, S4.
- **Round cost:** roughly 21 tool calls and one background kill. No sub-agents.

## Questions section 11 asked

- **Is the `Harness` enough?** Nearly. It needed 7 amendments, all marked in `harness.ts`: `lateAnswer`, `uninterruptibleHang`, `syncAnswer`, `throwInModule`, `landNoAck`, tick injection, and `Frame.view`, since `do` settles past the cut PAY-08 reads. `landLate` went unused, covered by `lateAnswer`. **D2 cannot be observed through it**, for the same reason. Also `Fixture` must close over the fake's API.
- **Does the fence replace all latches?** Yes on what ran: no latch in the driver; duplicates, timeout races and superseded reads all fence. The acks fence by attempt absence, not generation; attempt ids are unique, so that holds.
- **Does a pure step stay tidy with real Effect at its edge?** Yes. Effect appears in `driver.ts` only. `step.ts` is the largest file, mostly routing. Its internal `Refused` exception is what makes "a throw refuses the turn" short.
- **A compiled field nothing can produce?** The reverse: fields nothing **needs** in round 1 were dropped: `Node.ancestors`, `default`, `owns`, `codec`, `raises`, `domain`. `Compiled.modules` stayed empty, with persistence handed in by the driver: section 7's "contracts import them" is unbuilt. `at.path` indices count the real machine's alternatives, which `compile` must produce.
- **How far does `SEARCH-PAY` reach under 2 GB?** Above; 171 MB.
- **What does `step` cost?** Above.

Scenario text errors, all logged in `conformance/expected-changes.log`: PAY-11's path could not run from PAYING; SEARCH-PAY's "keys never grow while pending" forbids every first send; PAY-08's charge had no step landing it; the place answer's shape. `SCENARIOS.md` gained row PAY-15.

## Rules broken

- **D9**: hooks mutate the transaction, F4.
- **Rule 25**: cancelled, D8 used.
- **Section 11 "no ... `cancel`"**: read as the concurrency policy, not the member. The fixture adds event `AbortPay`, not in Pay, so `lane.cancel.InFlight` is reachable.
- **Rule 46 "an actor's saved record holds no lanes"** kept, but it now holds timers, F3.
- **Rule 19's "random"**: ids come from the Host as a counter, so replay is exact.

## Solid, and shortcuts

**Solid on what ran:** the lane table as data, the fence, rule 18, owner routing with rule 15 on a flat machine, restore's three cases, disposal with a hung fiber, replay of every script including across a reload.

**Shortcuts:** flat machines only, so the late route is "parent", and no adoption or rebind (`dispose` throws). JSON instead of Schema codecs; key equality by `JSON.stringify`. Actor and lane records land in one fake write, so a crash between them is untested (PERSIST-01). The input log and frames grow without bound. D13 is the drain budget only; `TurnStorm` is a hard stop in the adapter, and it stops a legitimate hour of polling. `waits` is computed by the runtime, so L3 trusts it. Duplicate delivery arrives after the drain, not before admission. No read timeout. `check()` not built. Subscribers never exercised. PAY-12/shuffle covers 8 seeds, 7 ticks, 2 events.

## Limits and unverified

- **A limit was broken.** During fault injection, mutant `reinvoke-settled` drove RSS to 3.4 GB, then 11.9 GB, then 2.8 GB before I killed it; that was my 5 s, then 1 s, watch. After a 2,000-evidence stop in the adapter, peak was 249 MB or less. The search itself stayed under 200 MB.
- No browser, no real `fetch`, no IndexedDB, no Node run. The fake answers what scripts say; a wrong rule passes.
- Section 11's step 4, the Opus review of each test against its citation, was not run. Expected results and code have one author.
- D2, D7 have no check. Bundle size not measured.
- `vp fmt`: clean. `vp lint` on these folders: 140 errors, 989 warnings, mostly the repo's `anti-slop` rules (`no-explicit-any`, spacing, `no-readonly`). Not fixed: throwaway and outside the gate. `tsc` strict from a scratch config: clean except Bun's globals, which have no installed types, and one error inside `effect/src/Runtime.ts`.
