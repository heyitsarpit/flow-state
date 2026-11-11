# Under-specification audit of the v3 tests

Commit 3836abc4. Status: proposed; findings only, nothing fixed. Marks: [ran], [read], [reasoning].
Scope was widened mid-audit to all v3 tests, then cut to about 20 more minutes and 15 mutants. See "Not reached".
Tools and raw outputs: `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/audit-under/tools/` and `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/audit-under/` (`instr.ts`, `mutants-audit.ts`, `asserts.json`, `matrix.json`, `strict.txt`, `mutants.log`). No `review*.md` or `RESULTS.md` was read.

## Verdict

A wrong runtime can pass. The suite is 703/703 green, and most correct behaviour is pinned by a named field, but:

- For 394 of 703 cases (56%), the end-of-case checks run on a harness the case never drove.
- No case would notice an extra request to another operation, an extra disk key or an extra memory field.
- Five of 15 rule-derived mutants survive every gate.
- Stories, `flow graph`, `flow story` and `flow trace` have neither code nor tests.
- The real-browser, bench and entity-model runs have no failing exit: a human reads their numbers.

## Gaps, ranked by harm

### 1. The end-of-case checks read an empty harness in 394 cases [ran]

`main.ts` runs the issue check, `checkEndings`, the Attempt-key check, `replay()` and the cited-cell count on `c`, the context it created. Cases written as `on(c0, fixture)` or `new Ctx(c0.fresh(...))` drive a second harness. `SCENARIOS.md` promises these checks on "every run of every scenario". Only `checkClaims` and `checkMints` follow the second harness, per step.

Running the same checks on the harness actually driven (`instr.ts --strict`) fails 12 non-search cases that pass today:

| Check | Cases |
| --- | --- |
| `replay()` differs (9) | REV6-H5 (2), REV8-KEPT (1), REV9-KEPT (3), REV9-EDGE (3) |
| Issue not named (3) | PAY-11/refused-after-members (InvalidTurn), REV5-H2/a-module-value-of-no-shape-on-disk-does-not-disable-it (UserClosure), REV9-LOOP/a-commit-that-throws-at-once-and-asks-again-yields (Defect) |

SEARCH-ODD-ALL and SEARCH-ODD-SMALL also trip it, but a search keeps its own oracle, so I do not count them.

I did not decide whether the nine replay differences are a runtime bug or a replay limit. Either way S11 is unpinned for kept endings and for a release that changes a key, and those are the newest paths.

Check to add: record every harness a case makes, and run all end-of-case checks on each one that took a step.

### 2. Extra effects are mostly invisible; assertions cherry-pick [ran]

I added one spurious item to what the harness reads back, once it had taken a step, and counted the cases that failed. This is an upper bound on what a case can notice.

| Added to the read | Cases noticing | Of |
| --- | --- | --- |
| A request to another operation | 0 | 703 |
| An extra key in `stored()` | 0 | 703 |
| An extra field in `memory()` | 0 | 703 |
| An extra batch in `outside()` | 1 | 703 |
| A copy of the last frame | 5 | 703 |
| A copy of the last ending | 11 | 703 |
| A copy of the last request (same op, same key) | 117 | 452 with a request |
| A copy of the last issue | 30 | 197 with an issue |
| An issue of a code nobody named | 329 | 703 (374 blind, the same hole as gap 1) |

Real proof: mutant A02 adds a junk key to every storage batch and passes every gate. `namedIssues` is also a set of allowed codes: it pins neither count nor presence, so a named issue that never fires passes.

Check to add: an end-of-case comparison of whole outputs per case, meaning the request list by op, the issue multiset, and disk keys by prefix, against a locked snapshot or a default of "nothing else".

### 3. Mutants that survive every gate [ran]

Fifteen written from the rule table, run with `mutate.ts` (suite, `--swap`, typed compare, date check, CLI pins, 5 s gate); the control passed. Ten killed, five survived. A08 first failed to parse and was killed on its rerun.

| Mutant | Rule | Result | What it shows |
| --- | --- | --- | --- |
| A02 junk key in each batch | 46 | **survived** | Gap 2 |
| A05 `EarlyDropped` not noted | D76 | **survived** | Lines uncovered: the bound is never reached, though D76 says the race is "named" past it |
| A07 `InvalidTurn` loses `origin` (`step.ts:329`) | 12 | **survived** | "Origin named" is pinned on the guard path only (PAY-11), not on this one |
| A12 freeze answers `Cancelled`, not `Interrupted` (`turn.ts`, rule 52 mail path) | 52 | **survived** | Line covered, tag unasserted |
| A15 releasing turn does not raise `filled` (`sessions.ts:645`) | 71, T3 | **survived** | T3's "may raise, never lower" is unpinned on release |
| A01 issues doubled | 12 | killed by 59 cases | |
| A03 re-send takes a new position | E7 | killed by 6 | |
| A04 `mayHaveApplied` always false | 19 | killed by 1 (PAY-04) | One case holds it |
| A06, A13 discards not noted | 70 | killed by 1, 4 | |
| A08 bad send silent | D65 | killed by 1 | |
| A09 timeout doubled | 25 | killed by 5 | |
| A10 retry budget off by one | 23 | killed by 2 | |
| A11 hidden page without backoff | D97 | killed by 1 | |
| A14 `retryCount` always rises | N2 | killed by 8 | N2 is cited by no case, yet pinned: citations undercount |

### 4. Public claims with no test

- **Stories** [ran grep, read]: no `Story` in `round-9/*.ts`, `cli/`, `typed/`, `conformance/*.ts` or the scenarios. Section 2.10 and rules 58, 61–66 have no code and no check. Every design `Story.*` word (16) and `Fake.*` word (10) is absent. This is known scope, but nothing reports it: rule ids with no case do not fail a run.
- **`flow graph`, `story`, `trace`** [read]: `cli/flow.ts` has only `check` and `explain`.
- **Sessions after an origin wipe** [read]: the three `wipe: true` steps (round 8) all use a write lane on `bareFixture` or `businessKeyFixture`. No case wipes with a stream, so the bookmark and `filled` after a wipe are unpinned.
- **Other design words absent from all tests and fixtures** [ran, literal text match, so a renamed word reads as absent]: `Flow.annotate`, `Flow.is*`, `Flow.optional`, `Flow.Denial`, `Feed.CannotRepair`, `Feed.ping` and more, 49 of 60 in total including Story and Fake. `idleTime`, `hydration` and `UnresolvedHold` as a runtime word also have zero matches. `optimistic` has one.
- **Entities** [ran matrix]: rules 33, 34, 36 and 37 have no citing case. The H2 traces stay outside the suite on purpose (`known-failing-h2.ts` prints, never fails).

### 5. Results nobody scores [read]

- **`reality/`, `conformance/bench/`, `entity-model/`, `entity-model-2/`:** none of the files holds `process.exit(1)` or `exitCode = 1`. `run.ts` and `run7.ts` throw only on setup. A `twoCharges: 1` in `reality/run.txt` would still exit 0. No expected file or lock covers them; `expected.lock` holds only conformance files plus `cli/`, `typed/` and `adapter.ts`, and `mutate-one.ts` has no reality gate. Check to add: a scorer that fails on `twoCharges > 0`, `toldNotCharged > 0` or a changed verdict.
- **`entity-model-2/`:** its suites test its own `store.ts`, not `entities.ts`. `run-all.sh` writes `results.txt` and compares nothing, and a surviving mutant in `run-mutants.sh` is a printed line. It proves the proposal's model, not the runtime.
- **`typed/`:** `type-tests.ts` runs only if someone runs `tsc`; no gate in `conformance/*.ts` or the root `package.json` names it. `--swap` replaces 2 fixtures of 24 (Pay, Pay-full). `compare.ts` compares closures by position and skips four keys, so it says where a closure sits, not what it does. `date-check.ts` is one case.
- **`cli/main.ts`:** `BareWrite` and `Rule20Adopted` have no pin, so rule 55's adopted endings have no `flow check` proof. Many pins use `.includes`, so an extra finding passes.
- **Mutant lists and plants:** builder-written, 45/47 killed per `mutants-builder.txt`, no independent list. The `plants.txt` results are written, not compared; two plants (debounce, encodeOnTurn) are "inconclusive" for the search and caught only by a suite case.

### 6. Citations do not resolve to a clause or a case [read]

Cites sit on a scenario, not a variant, so 703 cases share 176 citation lists and a rule's clause is never named. Ids collide: `D4` in the design is "the commit value is the handle", and in `convergence-1.md` it is the dirty set. PAY-01's `D4` could be either. `T1`–`T9` and `F` have the same risk. A citation therefore proves little in either direction: N2 is uncited yet pinned (A14), while rule 12 is cited yet half pinned (A07).

## Traceability matrix (summary)

Script: every id to citing scenarios, to what their assertions read. Full rows: `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/audit-under/matrix.json`. **ok** means more than 2 cases and at least one assertion reads beyond state and memory. It is coarse: the survivors above sit under ok rules.

| Series | Ids | ok | Thin (1–2 cases) | Weak (state, memory only) | No citing case |
| --- | --- | --- | --- | --- | --- |
| Rules 1–72 | 72 | 37 | 4 (19, 25, 35, 38) | 0 | 31 |
| N | 3 | 0 | 0 | 0 | 3 |
| E | 18 | 0 | 0 | 0 | 18 |
| F | 15 slots | 3 | 1 (F1) | 1 (F12) | 10 |
| S | 16 | 2 | 6 (S5, S6, S8, S10, S11, S13) | 0 | 8 |
| P | P19 only cited | 1 | 0 | 0 | the rest |
| C | C2 only cited | 1 | 0 | 0 | 89 (most are API amendments) |
| Convergence D | 128 | 71 cited | | | 57 |

**Rules with no citing case:** 2, 3, 4, 5, 10, 11, 20, 26, 33, 34, 36, 37, 39, 40, 41, 42, 47, 48, 49, 50, 55, 56, 57, 58, 59, 61, 62, 63, 64, 65, 66.

Of those, by text mention or a neighbouring gate:

- Rule 20 has CLI pins; 36 has a mention in `flows.scenario.ts`; 55 and 56 in `frag.scenario.ts`; 39–42 are partly in `typed/`. E-series behaviour is partly tested through rules 26–32, which restate it.
- I searched 13 of these rules by mention. Rules 33, 34, 37, 47, 48, 49, 50, 59 and 61 have none in scenarios, CLI pins or type tests.

**Uncited convergence D:** 7, 9, 10, 12–14, 16–20, 24, 25, 27, 28, 31–34, 36–38, 41, 42, 44, 52–54, 56, 60, 63, 69, 85, 86, 90–95, 101, 103–105, 107, 111–113, 116, 117, 120, 121, 124–128. Several are suite decisions rather than runtime behaviour, and I did not separate them.

## What assertions look at [ran]

Per case, from the `Ctx.eq` and `yes` calls, attributing each to the reads since the previous assertion, so it is approximate. Generic checks excluded.

| Reads | Cases |
| --- | --- |
| State only | 8 |
| State, memory or inner only | 94 (13%) |
| memory | 198 |
| requests | 193 |
| evidence | 175 |
| state | 140 |
| issues | 130 |
| quiet / waits | 115 |
| record | 104 |
| row | 100 |
| inner | 98 |
| stored (disk) | 93 |
| outside | 69 |
| truth | 35 |
| module | 34 |
| frames | 13 |

Negative assertions (expected 0, empty, false, undefined): 350 cases. Of those, on requests 46, issues 48, disk 24, outside 28. Against 452 cases that make requests, 46 pin an absence. The suite cherry-picks: it never compares a whole output (gap 2). SEARCH-ODD-ALL has no helper assertion but has its own oracle; REV5-H1/each-closure-kind-of-no-shape-refuses-its-turn throws its own `Mismatch`.

## Coverage of `round-9/*.ts` [ran]

Lines: 5696 of 5789 covered (98.4%), 93 uncovered. **Branch coverage not measured:** bun's lcov has no branch records.

| Lines | Reading | Status |
| --- | --- | --- |
| `entities.ts:410-414` | D76 past the bound | Unpinned behaviour (A05) |
| `turn.ts:423-434` | A fired schedule behind a freeze, rule 8 | Unpinned |
| `turn.ts:308-309` | `droppedRaise`, N3 | Unpinned |
| `turn.ts:351-352` | Unfilled exit is refused, rule 5–6 | Unpinned |
| `turn.ts:1270-1271` | Fenced module turn | Unpinned |
| `sessions.ts:181-191` | A mapper's throw, D46, T1 | Unpinned |
| `sessions.ts:694-695, 729-730` | Discard and fence for a stale connection, rule 70 | Unpinned |
| `step.ts:202-203` | Superseded interrupt | Unpinned |
| `step.ts:323-328` | Rollback of a refused `ensure`, L9 | Unpinned |
| `lane.ts:448-449, 515-525` | Evidence-only, `markResend`, `markWire` | Unpinned; release on leave, rule 60 |
| `driver.ts:89-91, 271` | `SinkFailed`, `CommandFailed` | Unpinned |
| `world.ts:422-428` | Defensive rota | Looks dead |
| `adapter.ts:120-125` | `deepFreeze` | Looks test-only |
| `publish.ts:92-93` | `settled` to mail | Undecided |
| `durable.ts:389-398`, `feed.ts:17-29`, `inc.ts:27-28,66`, `entities.ts:103,186-187`, `sessions.ts:811-813,913,932-933`, `turn.ts:71-72,213-217,441`, `driver.ts:68`, `adapter.ts:155-156`, `lane.ts` rest | | Not classified |

## Promises in words with no check [reasoning]

| Guarantee | Check it would take |
| --- | --- |
| `stateHash`: "equal means the same future under the same steps" (`harness.ts`); searches lean on it | Differential: run the same steps from two equal-hash states and compare all reads |
| Rule 8, deliveries never lost, beyond endings | Extend oracle (j)'s ledger to fired schedules and stream deliveries; `turn.ts:423-434` is uncovered |
| Rule 71, "no guard reads" the bookmark and memory changes only by turn | Change the bookmark alone and require every guard and memory read unchanged |
| Rule 61, every step settles | A settled check per Story step; no Stories exist |
| Rules 3, 4, 50: a host cannot reach inside, a fragment reads no context | `@ts-expect-error` pins, with `tsc` as a gate; not gated today |
| Rule 12, origin named | An origin assertion per issue-raising path, or a generic "every issue has an origin" check |
| "A citation counts as tested only when a mutant of that id fails a test citing it" (D33) | `report.ts` does this only with `--mutants`; make it a gate, and cite per variant |

## Not reached

- Reading a sample of cases per rule. I read about ten bodies; the matrix grades are from the script.
- 40 mutants: 15 by instruction. Branch coverage: not available. Covered-but-unasserted branches: only these 15.
- Running `reality/`, `conformance/bench/`, `entity-model-2/`, `run-plants.sh` or `tsc` on `type-tests.ts`. All marked [read], from grep and the first lines.
- Mutant lists in full (`mutants*.ts`): counts only. `mutants-r9b.json` was opened, but I did not parse its results.
- `conformance/search/`: not audited for under-specification.
- Rules 2–5, 10, 11, 26, 39–42, 57, 58, 62–66 by text mention; design words in `entity-proposal*.md`.
