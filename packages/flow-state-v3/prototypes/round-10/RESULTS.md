# Round 10: a test system whose green means something

Status: **everything here is proposed.** Decisions D129-D148 are in `../convergence-10.md`, with the findings by root cause, the design edits owed at merge, and what is left for Arpit. Builder-run: the re-audit that follows is the independent measure. No entities.

Commits: stage A `fba520e2`, stage B checkpoint `ac54cec2`, stage B `3c87ea45`, the last pin `c6ef01c1`, and this file's commit.

## The question, and the answer

Five audits and a review found the suite much weaker than it read: 394 of 703 cases checked an empty harness, 10 of 13 searches exited 0 on no runtime, the typed compare could not fail, the lock could be laundered, the watchdog saw one process, 0 of 703 cases noticed an extra request, and 40-44% of cases failed a correct runtime with another disk format.

**Now every gate is run on runtimes and copies known to be broken, and each must go red** (`conformance/falsify.ts`, standing, in the lock). Where it cannot, the limit is stated below.

## What a green now means

| Gate | Red on | Green on |
| --- | --- | --- |
| Suite | null runtime: 0 cases pass; constant hash, lying `fatal`, no evidence, no waits, an injected issue, a lying replay, a junk disk key: red, each. Named oracles alone see the injected issue and the lying replay in every case but the stated ones | round 10: 723/723 |
| Whole output (D134) | anything that changes: requests, issues, disk by kind, actors' state and memory, evidence kinds, frames, waits, truth, distinct hashes | the locked `expected-output.txt` |
| Searches (D131) | null and constant hash: all 14 searched red (`vacuous`) | real runtime: green, `listen.load` failing as known (H2's class) |
| Lock and log (D135) | a pasted hash, a comment swallowing an oracle, a stale hash: red | the baseline, or each id's last log line |
| Typed compare | a changed target: red | its 52 differences, stated as three kinds |
| Watchdog (D129) | a grandchild's memory, an orphan, a tree on a kill: all seen and ended | |
| Real runs (D144, D148) | `bfcache` without the contract: red | with it: green, in Chrome |
| Mutants | 18 builder mutants, run from a git worktree of the commit: **18 killed**. One by the watchdog (`queue-loses-order`), one by output alone (`laundered-as-evidence`: no named oracle sees it), one only after this round's last pin (`second-try-lost-if-mail`) | control green |

## Stage A

- **D129** `watch.ts` follows the tree, and kills it.
- **D130** End-of-case checks run on every harness a case made. The **12 failures** that followed are **not runtime bugs**: 9 replay limits (a case changing the program between lives, now said as a `release` step that S11 replays), 3 unnamed issues.
- **D131-D133** A verdict needs evidence; every gate must fail on a broken runtime; a fatal must be named.
- **D134** Whole output, the default assertion, captured before the runtime fixes so their effects were logged one by one.
- **D135** Token hash, frozen baseline, a reason per id. The first token hash hashed every scenario body as nothing (the transpiler drops an unused expression); seen and fixed, and `falsify.ts` now tampers a body.
- **D136-D141** Runtime: review H1, H2, M3 (the slice's bill, a chain per task, one notify per task); one machine per actor key; `self` and `__proto__` refused; `Symbol` and `NaN` refused by name; a linear mailbox; a hash of values. **The burst's quadratic cost was mostly `durable.ts` walking all mail each step**, not the array copy the audit named: 100,000 sends 85 s, now 0.24 s (`bench/burst.ts`, scored).

## Stage B

- **Rechecks of stage A found two holes:** a MailQ unit case passed on no runtime (moved to `checks/`, which `mutate-one.ts` gates), and `mutate.ts` copied live sources per mutant, so an edit during a run reached later mutants (it now snapshots once; final runs are from a git worktree).
- **D142** The runtime's codec answers what the disk means. A correct runtime with renamed keys: **312 failing before, 112 now**; with wrapped values: **279 before, 30 now**. What remains are cases that name a stored key on purpose.
- **D143** User data is opaque to the hash's ranks; `{pos:1}` and `{pos:2}` are two states. `Ctx.eq` compares values.
- **D144** Real runs are scored and exit by it.
- **D145** A server as strict as Stripe's: pruned keys, 409 in flight, a replayed 500, another body refused, every landing in the ledger. **A key applied twice fails any case** that does not name it. Pay passes both new cases because it reads the intent before a resend; that is now an author contract.
- **D146** A frozen page runs nothing; a press on one fails the case. The round 7 case that pressed a frozen page pinned a world that does not exist, and was replaced.
- **D147** HIGH-03: a read whose mapper throws ends in `Defect`, not `Listed`.
- **D148** bfcache: the lock is held while live, released into the cache, and a return reloads. **Verified in Chrome**, with a red control.
- Pins: `letgo-takes-all`; FRAG-08's vacuous check (now counts the re-send); M4 (chain sends to both actors with no settle); M5 (`delivered` pays only with a turn or a named issue); (p) as a probe (the plant `noMerge` now dies at depth 2); A07 (rule 12: every issue has an origin, except three stated codes); A02 (whole output).

## Stage C: the re-audit's findings (`../conformance-audit/re-audit-round-10.md`)

Commit `32c4b7af` and this file's commit. One root cause under H1, H2, M1, M4: a gate took a self-report at its word. Decisions D149-D153, proposed.

| Finding | Fix | Shown by |
| --- | --- | --- |
| H1: the ledger trusts `evidenceOnly` | D149: the suite attributes Attempts to an actor's life and decides itself; `KeptLetGo`/`ParkedLetGo` too | `g125.laundered-as-evidence`: 0 named cases before, 2 now (`falsify.ts --part mutants`, `--no-output`) |
| H2: type pins run by nothing | D149b: `checks/types-check.ts` (`tsc` + pin count), run by `mutate-one.ts`; `typed/` hashed with types | Three tampers in `falsify.ts`: widened refusal red on count and lock; bare refusal red on `tsc`; control green |
| M1: a run that ran nothing passes | D153: modes declare sections and counters | `--only nothing-here` now `SCORE FAIL`; 11 new cases in `checks/score-check.ts`; bfcache green arm still `SCORE PASS` in Chrome |
| M4: half the actions dead under a budget | D150: any action run and never moving is vacuous | `checks/search-vacuity-check.ts`; `frag`'s `resend` guarded, moves at depth 6; 14 searches still red on null and constant hash, green on round 10 |
| M3: timer fence, disposal's read abort | D151: fault `lateCancel`; `R10-AUDIT`, `R10-AUDIT-READS` | Both mutants killed by named cases (`falsify.ts --part mutants`) |
| M2: disk read by literal key | D152: `Ctx.record`, `Ctx.laneKeys` by codec in ten files | Renamed keys 112 → 73 failing; envelope 30 → 26 (`--no-output`) |
| L5 | With D153 | bfcache requires `cached:true`, `back:"reload"` |

Not closed: M2's remaining 73/26 (lane helpers that read one lane by full key, `corruptStored` edits, `storage` matches; not marked as pins); L1-L4, L6, L7; `checkMints` still counts `Released`/`Superseded` on the runtime's word; the ledger reads `lane.release.*` cell names as a release's sign.

## Stage D: the class, not the next hop (`../conformance-audit/re-check-round-10c.md`)

Commits `795ebaf9`, `d2758d47`, `9b87842e`, and this file's commit. Decisions D154-D158, proposed.

The gate failed twice on one class: an oracle excused a missing obligation because the runtime said why. So every input every oracle reads is now listed and classified (`../convergence-10.md`, "Stage D"): **34 inputs: 11 observed, 3 debt-only, 6 names-only, 12 checked, 2 excuses at the runtime's word; 7 allowances in all (A1-A7)**. Six were excuses at the runtime's word before this stage, and are now names or checked.

The rule (D154): **an oracle excuses only for a cause the suite observed.** A self-report may say which attempt, never why.

| Finding | Fix | Shown by |
| --- | --- | --- |
| H1': `Released`, `lane.release.*`, the no-attempt wildcard | D154: a release names; the cause must be seen: a dispose, the owner gone, the owner's published state moving with a releasable op, or a cancel the suite drove (sent, or mapped from its timer, a reload, or an answer of another op; an answer's own event never excuses its own op's ending) | `falsify.ts --part lies`: `lie.released`, `lie.lane-cell`, `lie.lane-cell-noatt` red by (j) in 1 case each (R10-AUDIT-ENDINGS; MED-01 sees them only by output); **`lie.like2nc-released` red by (j) in 1, STORE-05 (it passed 727/727)**; `lie.save-released` by (j) in 19 (was 0) |
| M3': a wrong supersede | D154: an oracle. A write needs `latest` and a newer attempt by the owner; a lookup a newer send, a newer ask, or the owner moving | `lie.serialize-as-latest` red by `(j) superseded` in 3 cases (was direct asserts only) |
| More of the class | D158: `DisposeStart` turns (j) off only after a driven `disposeRuntime`; `Released` excuses (h) and `checkMints` only with a seen cause | `lie.dispose-start`, `lie.settled-released` |
| M1': the text count | D156: directives by comment token, pinned by their words (8, not 9) | The re-check's tamper is red by its words |
| M2': empty rows | D157: row counters per mode, cycles above zero, no negatives, no undeclared key | 12 new attacks in `checks/score-check.ts`, red, beside a green per mode |
| M4': `corruptStored` on nothing, literal absences, a spelled scope | D158: a corruption that matches nothing throws; REV9-KEPT's absences through `Ctx.lanesOf`; `Ctx.record` by `Reads.actorKey` | Suite 727/727 |

Not closed: the allowances A1-A7 (attribution by the step's turn; `delivered` checked by a `turn`; `parked`/`kept` waits; refusal pay by `turn`/`fence`; issues paying deliveries; `AbandonedFiber`; `disabled` by `ModuleDefect`) have no lie runtimes yet. D154's limits: the cancel cause is by event, not by the alternative taken; an owner's memory move beside a lie on a releasable op still excuses. M2's 73/26 literal-key presence checks; L1-L4.

## What the new oracles exposed

No new runtime bug in the named paths. Exposed instead: replay limits that hid S11 on kept endings and releases; a case pinning an impossible frozen page; a vacuous FRAG-08; HIGH-03 delivering `Listed`; the real bfcache gap (a link click made the next page a second tab); and four holes in this round's own tools (the token hash, a case passing on null, mutate copying live sources, the `truth` section holding disk bytes).

## Not done, and stated

- **The world:** hidden-tab throttling in the fake; plain writes queued behind a strict one (`storeWide` default); connection loss and reopening; power loss; duplicate arrivals; the 409 answer exists but no case drives a reload into it.
- **Pins:** under-specification A05, A12, A15; review M6 (`reality/spin.ts` with a costly listener as a gate, and `task-is-microtask`); rules 47, 50, 56, 59 (see `convergence-10.md`).
- `--swap` still boots typed output for Pay only; `typed/type-tests.ts` is not a gate (`tsc` not run this round); `bench/main.ts` measures and does not score.
- Older mutant lists (`mutants-r9b.ts` and before) quote code round 10 changed, and were not rewritten.
- Stories, `flow graph`, `flow story`, `flow trace`: no code. Stated, not built.
- Whole output is a change detector: it says something changed, not that it is right. A search stopped by depth or budget needs only half its actions to have moved. A log reason can still be poor.

## Gates on the final commit

Stage D, on the commit after `4bb9e52f` (the gates on its code, before the last `drive.ts` fix, then the suite and the lies part again after it):

| Gate | Result |
| --- | --- |
| Suite, `--round 10` with catalog | 727/727; catalog disagreements none; 749 MB, 20 s |
| `mutate-one.ts` on round 10 (suite, `--swap`, typed compare, date check, CLI, every `checks/` file, 5 s gate) | not killed: all green, 62 s |
| `falsify.ts --part suite` | null 0/727; constant hash 61; lying fatal 0; no evidence 36; no waits 179; injected issue 5; lying replay 2; junk key 255; D130 checks ok |
| `--part search` | 42 checks ok |
| `--part tamper` | 10 checks ok, the directive-made-mention tamper among them |
| `--part mutants` | 3 killed by named oracles |
| `--part lies` (after the last fix) | **11 of 11 lies red by the named oracle** |
| `--part watch` | ok |

Not run in stage D: the variant adapter's 73/26 counts, real-browser modes, the 18 builder mutants through `mutate.ts`, `nub run verify`, `vp fmt`.

Run on `c6ef01c1` and the log line after it, each under `watch.ts` or a time limit. Bun 1.4.2, Chrome headless, this Mac. One process tree at a time.

| Gate | Result |
| --- | --- |
| Suite, with catalog | 723/723; unlogged none; removed none; stale lock 0; catalog disagreements none; 804 MB, 19 s |
| `--swap` | 723/723 |
| 5 s gate | 29 failed, 29 expected; none unexpected or different |
| CLI pins | all pass |
| Typed compare | 52 differences, 52 stated, exit 0 |
| Date check, `checks/mailq-check.ts`, `checks/score-check.ts` | pass |
| `bench/burst.ts` | 10,000 in 42 ms, 100,000 in 246 ms, ratio 5.8, pass |
| `falsify.ts`, all four parts | every gate fails on what it should. Null 0/723; constant hash 61; lying fatal 0; no evidence 36; no waits 176; injected issue 5 (stated); lying replay 2 (stated); junk key 253; 14 searches red on null and on a constant hash, green on round 10, `listen.load` failing as known |
| `reality/run.ts --only bfcache` | pass with the contract; **fail without it** (next page not the owner) |
| Mutants | 18/18 killed, above |

Stage C, on `32c4b7af` (code unchanged after it; docs only):

| Gate | Result |
| --- | --- |
| Suite, with catalog | 727/727; unlogged none; removed none; stale lock 0; catalog disagreements none; 775 MB, 19 s |
| `--swap` | 727/727 |
| 5 s gate | 29 failed, 29 expected; none unexpected or different |
| CLI pins, typed compare, date check, `checks/` (mailq, score, types, search-vacuity) | all exit 0 |
| `bench/burst.ts` | 10,000 in 42 ms, 100,000 in 236 ms, ratio 5.6, pass |
| `falsify.ts`, all five parts | every gate fails on what it should. Null 0/727; constant hash 61; lying fatal 0; no evidence 36; no waits 179; injected issue 5; lying replay 2; junk key 255; 42 search checks ok; 9 tamper checks ok; 3 mutants killed by named oracles |
| `reality/run.ts --only bfcache` | `SCORE PASS`, `cached:true`, `back:"reload"`; `--only nothing-here` `SCORE FAIL` |
| Variants, `--no-output` | `diskKeys` 654/727, `envelope` 701/727 |

Not rerun in stage C: the 18 builder mutants through `mutate.ts` (about 20 minutes; the three that matter here are in `falsify.ts`), the other real-browser modes, `nub run verify`, `vp fmt`.

Not run on the final commit: the other real-browser modes (`s3`, `atom`, `crash`, `tabs`, `desk`, `run7`, `h3`, `spin`), which are now scored but cost minutes of Chrome each; `tsc` on `typed/type-tests.ts`; the older mutant lists; `nub run verify`.
