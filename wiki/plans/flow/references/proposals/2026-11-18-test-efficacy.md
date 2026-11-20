---
review test-efficacy
status open 2026-11-18
---
# Test efficacy audit (2026-11-18, proposed)

**Bottom line:** in the kill matrix, every planted fault that a sweep caught was also caught by a hand test, a
`src/` unit test or the CLI tests. The three costliest default strategies (reload sweep, double-reload check, pair
sweep: 290 s of the suite's 443 s file time) made 0 unique catches. Hand tests made 12 unique catches in 16 s, unit
tests 4 in 2 s and the CLI tests 4 in 40 s. The planted faults are biased toward hand tests, so the sweeps stay. All
three can be made cheaper without losing a catch: stop the pair sweep at the reachable phases (Q1, about 70 s), cut
the double-reload check to hold windows (about 55 s), and fork the reload sweep from a cut (Q2, about 60 s). The
faults run's slowness is oversubscription: 8 copies of about 11 workers each on 12 cores (Q3). Everything below is
proposed. Nothing in the package was changed.

**Why now:** the suite takes 54 s, stress 65 s and faults 256 s (@task.V3.T83). The user asked which strategies should
exist or be simplified before answering T83's three questions.

**Read first:** @task.V3.T83 (last comments), @proposal.test-system,
`performance-architecture`.

**Risk:** this sample covers 71 of 255 faults, those in `tests/faults.ts`: WriteLanes, Actors, Stories, WriteAhead,
Turn and CommandLine. The codec, compile, context, restore and consolidation fault files and the whole stress tier
were not measured (see "What was not measured"). Faults are written next to the hand test that names them, which
biases unique catches toward hand tests. A sweep's value is in the bugs nobody planted: T20's two pair reds are real
findings from the pair sweep. So "no unique catch" here makes a strategy a candidate to simplify, never to remove.

## Method

- **Kill matrix.** A copy of `tools/faults/run.ts` lived in a scratch directory outside the repo. It planted each fault
  in a scratch copy of the package and ran every non-stress test file with no bail and vitest's JSON reporter. It used
  6 copies with 2 workers each. A log was added to the copies only: the failing reload positions and modes, the seed
  at which the pair sweep found each phase, and each pair cell's verdict. Jobs completed: control, dead core and 71
  faults, at a median of 317 s each. The coordinator stopped the run at load about 60 before the other 184 faults
  ran. Tests that failed in the control are excluded from catches: T20's two pair reds, and two bench-limit tests
  that fail under load (`limits-hang`, `limits-signals`).
- **Timings:** one run of the whole suite with stress, alone: 103 s wall, 986 s file sum (stress files 543 s).
- **Seven Haiku sidecars**, all read-only: rule map, a blind review of tests and fixtures only, scenario overlap,
  dead-core greens, prior art, run rules, strategy inventory. Each finding was checked as listed under
  "Sidecar findings".
- **Method from prune-tests** (caldoai/skills): keep a test that is anchored to behaviour. Drop one that is redundant
  with another test, depends on nothing, or derives its expectation from the code under test. This audit adds one
  more rule: a test that is the only check on a rule with no planted fault stays.

## (a) What is tested, and how

| Strategy          | What it does                                                             | Code                                |
| ----------------- | ------------------------------------------------------------------------ | ----------------------------------- |
| Hand Story tests  | 67 files: outcomes by example; most call `checked` or `played`           | `tests/<app>/`                      |
| `src/` unit tests | 24 files: lane table, ledger, cells, codec, persist, directly            | `src/**/*.test.ts`                  |
| Run rules         | 19 rules, applied where a test calls `checked`, `played` or a sweep      | `tests/rules/*.ts`                  |
| Rules once        | every non-stress Story once under the rules                              | `tests/rules/sweep.test.ts`         |
| Another world     | every Story under seed 2, and ended by a reload                          | `tests/rules/seeds*.test.ts`        |
| Reload sweep      | every Story x every position x 3 modes; 8 rest and 12 stress shards      | `tests/rules/sweep*.ts`             |
| Double reload     | context Stories, at every position, one reload against two               | `tests/rules/reloads.ts#onceShard`  |
| Triple reload     | context Stories reloaded 0, 1 and 3 times at the end                     | `tests/rules/reloads.test.ts`       |
| Pair sweep        | per sample set, 8 phases x 7 faults; drive seeds 1..1,000 to find phases | `tests/generated/pairs.ts`          |
| Generated         | 10 seeds (stress 20) per sample set, with shrinking                      | `tests/generated/generated*.ts`     |
| App mix           | apps run side by side, 5 seeds (stress 20)                               | `tests/generated/mix*.ts`           |
| CLI               | `story list/run`, `trace` on every Story, direct and through the CLI     | `tests/cli/cli.test.ts`             |
| Types, compile    | type-level refusals, construction refusals                               | `tests/types/`, `tests/compile/`    |
| Stress tier       | `*.stress.test.ts` under `FLOW_STRESS`                                   | 25 files                            |
| Planted faults    | 255 faults + dead core, targets first, whole suite on a miss             | `tools/faults/`, `tests/*faults.ts` |

## (b) Measured kill matrix and yield

The matrix covers 71 faults plus the dead core and the non-stress files. "Unique" counts faults that only this
strategy catches; "shared" counts faults it catches along with another. Time is per-test file time from the
alone run.

| Strategy                    | Unique  | Shared  | Time (s) | Faults lost if removed |
| --------------------------- | ------- | ------- | -------- | ---------------------- |
| Hand Story tests            | 12      | 47      | 16       | 12                     |
| `src/` unit tests           | 4       | 27      | 2        | 4                      |
| CLI                         | 4       | 29      | 40       | 4                      |
| Bench tests                 | 1       | 10      | 16       | 1                      |
| Reload sweep, rest          | 0       | 29      | 113      | 0                      |
| Double reload (`onceShard`) | 0       | 23      | 70       | 0                      |
| Pair sweep                  | 0       | 29      | 107      | 0                      |
| Rules once                  | 0       | 25      | 2        | 0                      |
| Another world               | 0       | 25      | 10       | 0                      |
| Triple reload               | 0       | 18      | 4        | 0                      |
| App mix                     | 0       | 18      | 13       | 0                      |
| Generated (default)         | 0       | 6       | about 6  | 0                      |
| Deep (`session/deep*`)      | 0       | 3       | 47       | 0                      |
| Stress tier                 | not run | not run | 543      | not measured           |

- Removing every sweep and generator together (reload, double, triple, pairs, generated, mix, deep, another world,
  rules once) loses 0 of the 70 caught faults. Removing hand, `src/`, CLI and bench tests together loses 32.
- 70 of 71 faults were caught, and the named target file caught every one of them. The median fault is caught by
  5 files.
- `control-ignored` (Stories R8, target `tests/stories/fake.test.ts`) was missed by every non-stress test. T83's
  faults run reports it caught, so either a stress file caught it or that catch was a timeout under load.
  Unverified.
- 7 single tests hold a unique catch: `actors/edges` (WriteLanes R2), `actors/lane-keeping` (Turn I26),
  `lanes/lanes` (serialize at 1,000), `write-lanes/policy-cells` (cancel routing), `turn/schedules` (TURN-03/unused),
  and two in `actors/runtime-disposal` (Actors I43, R23). The other 5 hand-only catches are spread over several
  hand tests.
- **Dead core:** 952 of 1,410 non-stress tests fail and 458 stay green. 425 of the greens are explained: 33 by the
  rule-title pattern in `tools/faults/run.ts#mayStayGreen`, the rest by the other patterns. The other 80 (47
  unexplained and the 33) were classified by a sidecar and spot-checked here:
  - 66 are legitimate static checks: construction and compile refusals, manifest and bench tooling, and run rules
    over crafted runs.
  - 10 are `it.fails` gap markers, green for the wrong reason.
  - 4 are negative-only: `restore.test.ts:85`, `bank-app.test.ts:82`, `deep-inputs.test.ts:168` and
    `deep-constants.test.ts:45`.
  - None checks nothing outright.
  - The rule-title pattern (`/ > [A-Z][A-Za-z]+ [RIT]\d+: /`) is meant for inverted tests but matches any
    rule-titled test, so it hides real greens. The other 2 of T83's 49 greens are in stress files, which this run
    did not cover.
- **Pair sweep, per seed:** the control found every reachable phase by these seeds:
  - lanes, sync, sign-in and git-repos: 1;
  - pay-first-only: 2;
  - palette: 4;
  - transfers: 5;
  - shop: 8;
  - session: 13;
  - cells: 82;
  - pay-peeking: 150;
  - shop-store: 362;
  - auth-session: 955;
  - number-input: none (it has no writes).

  Across the 14 sample sets, that is 1,585 of the 14,000 drive seeds. Of the 30 pair catches, none needed a phase
  found after its fixture's last reachable seed.
- **Reload sweep, per mode and position:**
  - Of 30 catches (the dead core included), abort caught 28, land 29 and unattached 28. One fault was caught only
    by land and one only by unattached.
  - In a failing Story, a median of 100 % of positions break.
  - Reloads only at 0, the middle and the end would catch 19 of the 30, so 11 need an interior position.
  - The double-reload check failed for 7 faults, each also caught elsewhere.

## (c) Removal candidates

Who else covers each one comes from the matrix. Confidence is high where the test had 0 catches and its rule is
covered elsewhere. It is medium where the evidence is the file-level matrix or code reading.

- **`actors/identity.test.ts:183`, the grace test (Actors R6; high).** 0 catches. It sleeps a real 150 ms and
  never advances the grace, so its title is untested. Other Actors R6 tests stay (`identity.test.ts:207`). Rewrite
  it on `TestClock` or drop it.
- **`restore/deep-inputs.test.ts:168` (Codec R4; high).** 0 catches. It asserts only `not.toThrow(RangeError)`, not
  the FlowError its title names. `durability.test.ts` also covers Codec R4. Rewrite it to assert the FlowError.
- **The step-count asserts in the 5 "about a hundred steps" tests (WriteLanes I6; high).** These are in `sync`,
  `shop/pay`, `cells`, `sign-in` and `transfers`. They check the fixture's length, not behaviour. Their
  `checked(long.run())` repeats rules-once and the reload sweep, which run every `long` Story. Drop the step
  counts; keep each test's behaviour counts.
- **Merge `transfers/transfers.test.ts:33-57` into `transfers/trace.test.ts` (Restore R3, I6; Stories R16;
  medium).** Both drive the same `lostThenReload` steps through the same states, and the Story runs 8 times across
  the two. The trace tests catch 3 to 8 faults each.
- **The second `largeReceipts` run at `durability.test.ts:80` (Codec R5; medium).** It reruns line 65's Story and
  asserts only that no turn was refused. Line 65 catches 6 faults.
- **The `runtime-disposal.test.ts:208-250` pair (Actors R22; low, merge only).** They run the same Story twice and
  differ in a count. Each catches 8 to 11 faults, all shared.

Not candidates, though they look like ones:

- `stories/story.test.ts:332`: replay determinism, 23 catches in 0.3 s.
- `bench/run.test.ts`: 3 catches; it is the default-tier twin of the stress proofs.
- `rules/rules.test.ts`: crafted-run tests that run no core. They are the only proof each rule can fire. Nine rules
  have none: oneStart, ownedRowsSaved, publishedPlainData, nothingInvokedDisposing, owingRestoredLive,
  everyCommitEndsOnce, acknowledgedHeardAgain, recordKinds and onlyActorsWithheld. Add their breach cases; keep the
  file.

Removal hazards to respect:

- The nine refused-shape builders (`cartFirst`, `customerFirst` and others) reach the per-position reload check only
  through `reloads.ts`. They are in no manifest.
- Four fixture Stories are reached only by one hand file: `displacedOnWire`, `stressDisplacedPastItems`,
  `stressManyReceipts` and `stressHugeList`.
- Bench ids derive from manifest `long`, `savedStress` and series names, so renaming one renames a bench.

## (d) Per strategy: keep, simplify or remove

| Strategy                    | Call              | How, and the trade-off                                                              |
| --------------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| Hand Story tests            | keep, prune       | 12 unique catches for 16 s; prune (c) for clarity, not time                         |
| `src/` unit tests           | keep              | 4 unique catches for 2 s                                                            |
| Run rules                   | keep, add         | Add the 9 missing crafted breach cases; a rule never seen firing is unproven        |
| Rules once, another world   | keep              | 25 shared catches for 12 s: the cheapest broad net                                  |
| Reload sweep, rest          | simplify          | Keep 3 modes and every position; fork from a cut (Q2)                               |
| Double reload               | simplify          | 0 unique for 70 s: run it in hold windows and at the end                            |
| Triple reload               | keep              | 18 shared catches for 4 s                                                           |
| Pair sweep                  | simplify          | Stop at the reachable phases, with a cap (Q1)                                       |
| Generated, mix              | keep              | Cheap in the default tier; the generator is the only source of unscripted sequences |
| CLI                         | simplify          | 4 unique; run and trace one Story per fixture, keep `story list` whole              |
| Deep                        | keep              | 3 shared catches; the only depth checks (Codec R1)                                  |
| Types, compile              | keep              | Static and free; `nub run check` enforces the `@ts-expect-error` lines              |
| `it.fails` gap markers (29) | keep, count apart | A gap register; they catch nothing by design                                        |
| Stress tier                 | measure first     | Not in this matrix; 543 s of file time. Measure its unique catches before cutting   |
| Planted faults              | keep, fix         | Size the copies (Q3); fix `mayStayGreen` (below)                                    |

- **Reload sweep:** 2 catches came from a single mode and 11 only from interior positions.
- **Double reload:** most of its 7 catches break at every position. About 55 s saved; medium confidence.
- **CLI:** it runs every Story 4 times. About 30 s saved; medium confidence.
- **`it.fails` markers:** report them apart from the dead-core greens.
- **`mayStayGreen`:** replace the rule-title pattern with `it.fails`, which vitest already reports.

## (e) T83's questions, from the data

- **Q1, stop the pair sweep at the reachable phases: yes (proposed).** No catch in 30 needed a seed past the last
  reachable phase, and the extra seeds only probe for forbidden phases. Every fixture's phases are found within its
  first 955 seeds, 1,585 of 14,000 in all. Keep the 1,000-seed cap as a bound, and fail when a reachable phase is
  unfound by then. Auth-session needs 955 seeds to find Held, which shows the drive finds phases poorly. A drive
  that aims for the missing phase would cut more. Trade-off: a fault that opens a forbidden phase only after the
  stop goes unseen; none in the sample did.
- **Q2, fork the reload sweeps from a saved cut: yes, as a speed change only (proposed).** Every position counts:
  11 of 30 catches break only at interior positions, and each mode has a catch of its own. So time must come from
  the replay, not from fewer positions. Forking turns Σ(S+1)·S replayed steps into a linear count. Behaviour stays
  the same only if the cut holds the whole world: fake servers, store, clock and open calls. Prove that once by
  running both forms over every Story and comparing verdicts before the replay form goes. Replay determinism is
  already checked by `played()` and `story.test.ts:332`.
- **Q3, size the faults run's copies instead of raising its timeout: yes (proposed).** At 6 copies x 2 workers on
  12 cores, the load was 45 to 60, and a whole non-stress suite took a median of 317 s per fault. The current run
  is 8 copies x vitest's default (about 11 workers each), so its 240 s reds are contention, not the tests. Set
  copies x `--maxWorkers` to about the core count, for example 4 x 3, and keep 240 s. Two cheap probes would help
  more than a longer timeout:
  - the named target file caught 70 of 70 sampled faults, so the whole-suite fallback is rare;
  - the dead core needs one whole run.

## (f) Expected time saved

These are default-suite file-time estimates against 443 s. Wall time falls by roughly a sixth to a seventh of each
figure, since the suite is CPU-bound on 12 cores.

| Change                                            | Saves (s)                                    | Confidence                     |
| ------------------------------------------------- | -------------------------------------------- | ------------------------------ |
| Pair sweep stops at the reachable phases          | about 70 of 107                              | medium (drives dominate reach) |
| Double reload only in hold windows and at the end | about 55 of 70                               | medium                         |
| Reload sweep forked from a cut                    | about 60 of 113                              | low until built                |
| CLI on one Story per fixture                      | about 30 of 40                               | medium                         |
| Hand-test pruning in (c)                          | under 1                                      | high                           |
| Total                                             | about 215 (about half the suite's file time) | medium                         |

Faults: right-sizing the copies should end the 240 s timeouts. The suite cuts above shrink each whole-suite fallback
by the same share.

## What was not measured

- 184 of 255 faults: the codec, structure, context, consolidation, restore, life, lane-policy, mix, tooling and
  write-ahead fault files. The coordinator stopped the run for load.
- The stress tier, including the dead core's 2 stress greens, the 12 stress reload shards and the generated stress
  files.
- Fork-from-cut and the pair-stop timings: these are estimates, not measured runs.

## Sidecar findings, as logged

- **Rule map (accepted, changed):**
  - 625 Spec rules; 265 are cited by tests and 129 have a planted fault.
  - 97 rules are cited by one file only; keep those files.
  - Changed: counts come from grep, so lists like "R2-R5" are missed.
  - Process: the sidecar wrote two files to the system temp directory against its brief. The lead deleted them.
- **Blind review (changed):**
  - Accepted: the `deep-inputs`, `restore` I8, PAY-16 and step-count findings.
  - Rejected:
    - TURN-02 as negative-only: `refusal.test.ts:47` asserts `CARD` after `START`.
    - The `toBeUndefined()` type claims: `nub run check` typechecks the `@ts-expect-error` lines.
- **Overlap (accepted):** checked `story.test.ts:332`, `played.ts:20` and `sync.test.ts:30`. The bench-only builders
  and `history/*.csv` ids the bench no longer produces are noted, not acted on.
- **Dead-core greens (accepted):**
  - Classified as 66 static, 10 `it.fails` and 4 negative-only.
  - Not settled: `session/workspace.test.ts:176` is green and `:179` is red. Left open.
- **Run rules (accepted):** checked by grep that 9 of the 19 rules are absent from `rules.test.ts`.
- **Strategy inventory (changed):** it said the pair sweep "stops once all 8 phases are found". It never stops,
  because the forbidden phases are never found; the control log shows all 1,000 seeds run.
- **Prior art (accepted):**
  - fast-check runs a fixed 100 runs by default, and Effect's schema tests use 200.
  - XState enumerates reachable states by graph traversal and stops when the reachable set is exhausted, the model
    for Q1.
  - None of the three uses mutation testing or a reload-at-every-step sweep.
