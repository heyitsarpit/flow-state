# Conformance harness: bugs in the tests themselves

Commit 3836abc4. Runtime under test: `round-9/adapter.ts`. Worked on a detached worktree in a scratchpad, under `conformance/watch.ts`. No `review*.md` or `RESULTS.md` was read.

Marks: **[ran]** reproduced by running it. **[read]** seen in the code, not run. **[reasoning]** inferred.

The audit was cut short at the owner's request to save usage, so this is top findings only. See "Not reached".

## Verdict

The real suite is deterministic and independent of order, but it is much weaker than it reads. On 394 of 703 cases, the end-of-case oracles check an empty harness instead of the one the case used. Search verdicts prove nothing without a state count: 10 of 13 sampled searches exit 0 with no runtime at all. The typed compare cannot fail, and the expectation lock can be beaten two ways. The watchdog sees only one process, not the tree.

## High

### H1. End-of-case oracles run on an unused harness in 394 of 703 cases [ran]

- **Where:** `conformance/main.ts:118,124-146`. The pattern is `new Ctx(c0.fresh(...))`, for example `scenarios/round7.scenario.ts:11`, `round8.scenario.ts:16`, `round9.scenario.ts:14`.
- **What happens:** the runner builds one harness and runs its checks on `c.r`. These cases build a second harness and do all their work there. The runner's harness stays untouched, so its checks pass trivially.
- **Lost on those cases:**
  - unnamed-issue check
  - final `checkClaims`
  - `checkEndings`, which runs nowhere else in a case
  - final `checkMints`
  - S11 replay
  - "key is an Attempt"
  - lane cell hits, so `cites a cell no run hit` and the `cellsHit` report also undercount
- **Still running:** `checkClaims` and `checkMints` per step, through the inner `Ctx.do`.
- **Reproduction:** wrap the adapter so that any instance that received `ensure` or `send` lies.
  - `replay()` returns `{same:false}`: **394 pass**, 309 fail.
  - Each instance emits an issue `BOGUS_UNNAMED` on its first `ensure`: **384 pass**, 319 fail.
- **Root cause:** oracles are tied to the `Ctx` the runner made, not to every harness that `make` produced. The runner could track each harness made during a case and run the checks on all of them.

### H2. A search verdict says nothing about whether the search ran [ran]

- **Where:** `search/engine.ts:113,120`, `search/run.ts:80-81`.
- **Reproduction with `--runtime ../null-adapter.ts --depth 6 --states 2000`:**

| Search | Verdict | States | Exit |
|---|---|---|---|
| pay | closed | 1 | 0 |
| chain | closed | 1 | 0 |
| frag | closed | 1 | 0 |
| odd | closed | 1 | 0 |
| flush.bare.tight | closed | 2 | 0 |
| flush.serialize.directed | closed | 2 | 0 |
| crash | closed | 4 | 0 |
| like | completed | 7 | 0 |
| cross | completed | 7 | 0 |
| fragstore.row | completed | 7 | 0 |

  Only session, repairing and listen.load fail. Of those, repairing and listen.load fail by crashing, not with a verdict.
- **Constant hash:** a real runtime with `stateText: () => "x"` gives pay closed at 1 state, flush.bare.tight closed at 1, like closed at 4, all exit 0. The same runtime passes 701 of 703 suite cases, so almost nothing pins the hash that "closed" depends on.
- **Root cause:** `closed` only means no new hash appeared. Actions disabled by `on` guards, or a hash that doesn't change, look exactly like an exhausted state space. There is no minimum state count, no check that actions fired, and no check that named states were reached.

### H3. `typed/compare.ts` cannot fail [ran]

- **Where:** `round-9/typed/compare.ts:39-40`, gated by `conformance/mutate-one.ts:47-50`.
- **What happens:** it prints `differences: N` and never sets an exit code. `mutate-one` checks only `t.code !== 0`.
- **Reproduction:** clean code prints `differences: 52`, exit 0. Changing the first `target: S.CARD` to `S.IDLE` in `pay.typed.ts` prints `differences: 55`, exit 0.
- **Consequence:** the typed and hand-written Pay already differ in 52 places, and this mutant gate can never kill anything. Which of the 52 are legitimate was not checked.

### H4. Hand-editing `expected.lock` launders any weakened test [ran]

- **Where:** `conformance/main.ts:198,207-211`.
- **Reproduction:**
  1. Delete `c.eq("charges", c.r.truth().charges, 0);` at `scenarios/pay.scenario.ts:25`. The run fails with an unlogged change. Correct.
  2. Run with `--hashes`, which prints the exact new hashes, and paste them into the lock.
  3. Run again: **exit 0, 703/703, "unlogged: none"**, with no log line.
- **Root cause:** a log line is required only when the current hash differs from the lock's hash. Nothing ties the lock's contents to the log. `--lock` refuses this (the D113 comment), but the file itself is unguarded.
- **Fix direction:** require every lock hash to have a log line or come from a baseline. Weigh this against the comments at `main.ts:208-211`.

### H5. The whitespace-blind hash lets a removed newline delete an oracle [ran]

- **Where:** `conformance/main.ts:58` (`s.replace(/\s+/g, "")`).
- **Reproduction:** join `scenarios/ctx.ts:10-11`. The trailing comment on line 10 swallows line 11, `if (!q.idle) throw new Mismatch("do() returned with work runnable")`. The file hash doesn't change: **exit 0, 703/703, no unlogged change**.
- **Scope:**
  - Exposed: everything covered only by a file hash, meaning `ctx.ts`, `drive.ts`, `fake-world.ts`, fixtures, scenario helpers outside `run`, `gate-5s-expected.txt`.
  - Not exposed: scenario bodies. The same tamper in `pay.scenario.ts` was caught as `PAY-09`, because the function text no longer holds the deleted statement.
  - Also blind [read]: whitespace inside string literals, such as an expected message.
- **Root cause:** normalising raw text to allow for `vp fmt`. Hashing a token stream or a whitespace-stripped AST would keep that freedom without this hole.

### H6. The watchdog watches one process, not the tree [ran]

- **Where:** `conformance/watch.ts:12-16,38`.
- **Reproduction:**
  - A child that spawns a process holding 1.2 GB under `--rss-mb 300`: `peak 9 MB, killed no`.
  - `sh -c 'sleep 79 & wait'` under `--seconds 1`: killed on time, and `sleep 79` lives on with PPID 1.
- **Consequence:** `mutate-one.ts` runs its swap, typed, CLI and gate stages through `Bun.spawnSync`, so those stages are unmeasured, and they survive a kill. The 1400 MB limit in `mutate.ts`, and the "one process tree under 2 GB" rule, are not enforced by this tool.

## Medium

### M1. `fatal()` turns off every oracle, and oracles trust what the runtime reports [ran]

- **Where:** `scenarios/ctx.ts:10,142,157`.
- **Reproduction with wrappers around the real adapter:**

| Wrapper | Pass of 703 |
|---|---|
| `fatal: () => true` | 638 |
| Evidence dropped | 377 |
| `waits: () => []` | 296 |

- **Root cause:** nothing requires a fatal to have been expected by the case. `checkEndings` and `checkMints` read only evidence supplied by the runtime under test. H1 inflates the last two figures. The first is inflated too, since the wrapper only reports fatal and changes no behaviour, so a real fatal would fail more scenario assertions.

### M2. A crash loses the verdict, and mutate counts it as neither killed nor survived [ran]

- **`main.ts:118`:** `new Ctx(fresh(), ...)` is outside the `try`. A wrapper whose `boot` throws from the 50th boot on gives exit 1, **no SUMMARY and zero PASS or FAIL lines**, because results print only at the end. The same wrapper throwing on only the 50th boot, which fell inside a case, gave 702 pass and 1 fail.
- **`engine.ts:87-88`:** `post.do` is outside the `try`. The `(g)` oracle throws a plain `Error` from `fake-world.ts:152`, so plant `twoOut` on `flush.bare.tight` gives `error: (g) a second write out...`, exit 1, no verdict. Also visible in `round-9/plants.txt`.
- **Consequence [read]:** in `mutate.ts:119-124` a run with no JSON line is `INVALID`, and is left out of the kill count at line 144. A mutant that breaks boot or trips `(g)` shrinks the denominator rather than counting as killed.

### M3. The state hash merges states with different futures [ran]

- **Date in memory:** `canon` at `round-9/adapter.ts:33-44` turns any non-plain object into `{}`. Two harnesses with `at` of `new Date(0)` and `new Date(86400000)` have **equal `stateHash`** at both `captureMs: 0` and a very long interval. This contradicts `search/engine.ts:2` ("two scripts with one hash have one future"). Map and Set collapse the same way [reasoning].
- **Replay:** S11 compares through the same `canon` (`adapter.ts:235`), so it can't see these differences either [read].
- **Wall clock:** `fake-world.ts:716` omits `clockOffset`. A harness after `clockBack` hashes equal to one without it, while `flush.search.ts:88` has `clockBack` as an action, so "clock set back, then act" is pruned wherever the hash doesn't otherwise change. I proved the merge, not that a specific bug is hidden.
- **Also omitted [read]:** `storeWide`, `loadMode`, `pendingLoad`, `uninterruptible`, `syncAnswers`, `microAnswers`, the fake's own close timers, scheduler shuffle, and drive's armed faults and ledgers.

### M4. The "lost with the process" exemption hides an Attempt that did reach disk [ran]

- **Where:** `conformance/drive.ts:233-239`. The comment says "no write of which reached the disk". The code checks only what is on disk now.
- **Reproduction with a stub port:** mint `att-1-1`, write and ack it, delete it. `checkMints` correctly reports "a minted Attempt vanished". After `reload`, it **passes**, with evidence `["mint","lostWithProcess"]`.
- **Exposure:**
  - In a scenario, the per-step check usually catches it first.
  - It is live when the delete and the kill fall within one step.
  - Only 3 search files reference `checkMints`.
  - The fake's `batches` already records what was written, and could answer this.
- **Substring match [read]:** `disk.includes("att-1-1")` also matches `att-1-12`. `drive.ts:464` has the same match in the exempting direction, so an unrelated Attempt can be excused.

### M5. `landLate` tells oracles the request is decided, though nobody heard [ran]

- **Where:** `conformance/fake-world.ts:630-635,666-677`.
- **Reproduction:** on key `k`, `mayHave()` gives `["k"]` while open and `["k"]` after `{lost:true}`, then **`[]` after `landLate`**. `{applyLost:true}`, the same real-world fact, stays `["k"]`.
- **Consequence [reasoning]:** the write-ahead oracle `(h)` and the other readers of `mayHave` stop watching a key that is at the server and whose result the client never learned.
- **Related:** `apply`, `applyLost` and `landLate` never touch the ledger, while `ok` and `lostButLanded` do. `truth().charges` stays 0 in the `landLate` and `applyLost` reproductions. A money audit reading the ledger can't see those paths.

### M6. 14 cases pass with no runtime [ran]

`null-adapter.ts:1` claims "a scenario fails on its first expectation". These pass on it:

- `FRAG-20/a-freeze-is-an-ending-not-a-release`
- `REAL-03/removed-copy-releases-not-delivers`
- `REV5-H1/prototype-names-at-the-doors`
- `SEARCH-ODD-ALL`
- `REV5-H2/a-module-value-of-no-shape-on-disk-does-not-disable-it`
- `REV6-H4/a-throwing-key-places-no-session`
- `REV6-H4/a-throwing-getter-refuses-at-the-gate-M11`
- `REV7-D80/D93-a-dispose-is-not-lost-to-a-kill`
- `REV7-EDGE/m-a-store-wide-hang-holds-and-is-safe`
- `REV8-M3/frame-numbers-do-not-repeat-across-a-lost-meta`
- `REV9-LOOP/a-kill-during-a-spin-boots-clean`
- `REV9-LOOP/a-dispose-during-a-spin-ends-it`
- `REV9-EDGE/cancel-of-its-own-key-lets-a-decline-go`
- `REV9-EDGE/a-cancel-by-a-bigint-key-reaches-its-lane`

Each is suspect: it either asserts only absence, or asserts nothing it reaches. I did not triage them one by one. The other 689 fail, some only by `TypeError`, since the null adapter lacks `module` and `peakDeliveriesInMail` despite the `Instance` contract.

### M7. Real-browser runs and bench have no scoring [read, not run]

- `round-9/reality/run.ts:440`, `run7.ts:660` and `h3.ts:155` call `process.exit(0)` in `finally`. A thrown error becomes `say("error", ...)` and still exits 0.
- `reality/spin.ts` and `conformance/bench/main.ts` write JSON with no pass or fail. A result counts only if someone reads the JSON.
- `reality/` and `bench/` are also outside the lock's `SHARED` list (`main.ts:70-84`), and so are `round-9/mutants*.ts`, `run-plants.sh` and `edge-plants.py`.

## Low

- **Typo passes [ran]:** `--only NOPE-99` gives `0/0 pass`, exit 0. `main.ts:257-261`.
- **Stale report ids [ran grep, read]:** `report.ts:121` hardcodes D1 to D73, while scenarios cite up to D123, so `UNTESTED` can't report D74 and later. No report in `printReports` affects the exit code.
- **One-way catalog check [ran]:** `main.ts:232-238` checks catalog to scenario only. `FRAG-20` is in the suite and not in `SCENARIOS.md`, and "catalog disagreements: none" is printed.
- **Names cut at a space [read, names ran]:** `gate5s.ts:19` and `mutate-one.ts:22` stop at the first space. Six `REV4-H5/key ...` variants all become `REV4-H5/key`, so an allow-list entry of that name would excuse all six. None exists today.
- **Unknown mutant flag accepted [ran]:** `entity-model-2/run.ts` with `nosuchflag` gives `fails 0/13`, exit 0. A typo in `run-mutants.sh` reads as a surviving mutant, not an invalid one.
- **Plant failures ignored [read]:** `run-plants.sh` doesn't check the exit of `edge-plants.py`, so a plant that didn't apply runs the unplanted copy and reads `suite: none`. The same `suite: none` appears if `main.ts` crashes.
- **Dead variable [read]:** `mutate.ts:60,143`. `notApplied` is never filled, so "not applied (0)" is always printed. A failed edit throws instead, with no results written and the scratch folder left behind.
- **Attempt-less wire wait forgives all [read]:** `ctx.ts:146`. One `wire` wait with no `attempt` excuses every open send.

## Checked and clean [ran]

- Two full runs diff identical, apart from timings and the watchdog's peak.
- 703 cases are clean in reversed order and in 3 shuffles, including reversed variants, in one process.
- Each of the 176 ids run alone in its own process is clean.
- No duplicate ids, no scenario with both `run` and `variants`, no scenario with no cases.
- `gate5s.ts` is clean on the real runtime: 29 failed, 29 expected.
- A 1 MB child under `watched({capture:true})` doesn't deadlock.
- `entity-model-2/run.ts` at 2000 walks repeats identically.
- A 64-bit `Bun.hash` collision was not attempted. At these state counts it is not a practical concern [reasoning].

## Not reached

- `mutate.ts` was never run end to end, and mutant lists were not read for no-op or dead-file edits. Mutate findings come from reading plus the crash proof in M2.
- Search files were skimmed, not audited one by one. Their individual oracles and `on` guards are unchecked.
- `--swap` was not run. `date-check.ts` and `cli/main.ts` were read and not run, with no defect seen. `tsc` on `typed/type-tests.ts` was not run.
- `reality/` and `conformance/bench/` were read only for exit and scoring. No Chrome run, and result-scoring logic inside them is unaudited.
- `entity-model-2` was only repeated at `base`. `store.ts`, its mutants and trust list, and `types-spike.ts` were not read. `entity-model/` was not touched.
- `FLOW_DRAIN_MS`, `FLOW_DEEP_FREEZE` and `FLOW_CAPTURE_MS` paths were not run. Fake-world contract was checked only for the items above.
- Nothing here has been checked against the review or `RESULTS.md` files, so some items may already be known.

Wrappers and outputs are in `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/audit-bugs/wrap` and `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/audit-bugs/out`.
