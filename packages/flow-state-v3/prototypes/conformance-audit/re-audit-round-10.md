# Re-audit of the v3 test system after round 10

Commit `fb6f3ae6`, branch `flow-rewrite`. Run from a detached worktree in the scratchpad, 08:49 to 09:20. No subagents, no repo writes besides this file, no commits.

Marks: [ran] reproduced at fb6f3ae6; [read] seen in the code; [reasoning] inferred, not run.

## Verdict: FAIL, narrowly

Green means something now. Two holes are left, both small to fix, and both sit on paths that entities will lean on:

- **H1.** The ending ledger takes the runtime's `evidenceOnly` at its word, so a dropped ending passes every named oracle.
- **H2.** The D91 type pins are run by no gate, and the lock's hash can't see a weakened type test.

Fix those two and this is a pass. Fixing M1 at the same time would be better, since it's a vacuous green in the reality runs.

What green is worth now:

- **Null runtime:** 0/723 [ran].
- **Searches:** all 14 are red (`vacuous`) on null and on a constant hash [ran].
- **Falsifier:** every part prints "every gate fails on what it should" (watch, suite, tamper) [ran].
- **My own mutants:** 22, written from the rules before I read RESULTS.
  - 20 killed (91%): 19 by named oracles, 1 by whole output only.
  - 2 survived.
- **Round 10's 18 mutants, suite stage only:** 17 killed. `d140.branch-shares-buffer` survives the suite and is left to `checks/mailq-check.ts`, which is by design.

## Status of earlier Highs (rerun at fb6f3ae6)

| Finding | Status | Evidence |
|---|---|---|
| bugs H1: oracles ran on an unused harness in 394 cases | **Fixed** | With `--no-output`, every case sees `bogusIssue` and `lyingReplay`, apart from the stated exceptions [ran] |
| bugs H2: a search verdict meant nothing | **Fixed**, with a residue (M4) | 14/14 searches `vacuous`, exit 1, on null and on `constantHash` [ran] |
| bugs H3: `typed/compare.ts` could not fail | **Fixed** | The falsifier's tamper `S.CARD`→`S.IDLE` goes red [ran] |
| bugs H4: a hash pasted into the lock laundered a test | **Fixed** | The falsifier's tamper goes red [ran]. Limit, stated at `main.ts:315`: a log line with a reason of its own still launders, by design |
| bugs H5: a comment could swallow an oracle | **Fixed** for runtime tokens; **not fixed** for types (H2 below) | Tamper red [ran]; type probe [ran] |
| bugs H6: the watchdog watched one process, not the tree | **Fixed** | Falsifier watch part: rss kill, tree kill, orphan reaped [ran] |
| under-spec 1 (same as bugs H1) | **Fixed** | As bugs H1 |
| under-spec 2: extra effects invisible | **Partly fixed** | Only whole output sees them. `junkDiskKey` passes 720/723 named-only, and `constantHash` 718/723 [ran] |
| over-assumptions F1: disk format pinned, 40-44% of cases fail | **Partly fixed** | 112/723 still fail on renamed keys, and 30/723 on an envelope (M2) [ran] |
| over-assumptions F2: `stateHash` merged states | **Fixed** | `d143.user-ranked` killed by a named case [ran] |
| over-assumptions F3: `eq` compared JSON text | **Fixed** in `Ctx.eq` (`output.ts:7-25`). The fake's body compare is still JSON text (L4) | [read], [ran] |
| assumptions #1: bfcache | **Fixed** in the real runs | 3/3 green with the contract, 3/3 red without [ran]. The score is weak (L5) |
| assumptions #2-#5: server idempotency | **Fixed** in the fake: `forgetKeys`, `inFlight`, `applyFail`, body mismatch | `fake-world.ts:526-618` [read] |
| review-part-two H1: work between pumps off the bill | **Fixed** | `d136.bill-per-pump` killed by `R10-RUNTIME/a-listener-that-costs-is-on-the-bill` [ran] |
| review-part-two H2: a slice's notify counted toward the listener bound | **Fixed** | `d136.chain-keeps-counting`, `notify-each-pump` and `owed-lost` all killed by named cases [ran] |

## Round 10's own claims

- **0/723 on null.** True [ran].
- **14 searches red.** True on null and on a constant hash [ran]. The vacuity rule is weaker for searches stopped by a budget (M4).
- **Renamed-key runtime fails 112.** True: 611/723 [ran].
  - **Not justified as stated.** `variant-adapter.ts:1` says the failing cases "pin the format on purpose". No case marks itself as a pin.
  - The failures are cases about timing or meaning that read disk by literal key, e.g. `REV7-D80/many-values-one-write`, `REV7-EDGE/a-hidden-page-does-not-wait`, `REV8-PINS/D83-a-retry-is-capped`.
  - The `envelope` variant, whose keys are unchanged, still fails 30 [ran].
  - That contradicts `harness.ts:260`: "a runtime with another format answers these and passes". See M2.
- **D145's stricter server.** Present and real [read]. Two leftovers: L4 (compares body bytes, not meaning) and an `inFlight` answer script that throws when the runtime does not double-send (`fake-world.ts:598`, Low).
- **D148 bfcache in Chrome, small sample.** I reran it 3× per arm with a throwaway profile [ran]:
  - With the contract: `{cached:true, back:"reload", bOwner:true, backSees:"B"}`.
  - Without it: `{bOwner:false, back:"navigate"}`, i.e. restored from the cache and still holding the lock.
  - The red control is real. The green arm's score is weak (L5).
- **Whole output kills `laundered-as-evidence`.** True, but thinly [ran]: 0 named oracles, 1 case (`MED-01/other-actor-behind-a-hung-ack`), by an evidence count. This is H1.

## High

### H1. The ending ledger trusts the runtime's `evidenceOnly`, so a dropped ending is invisible to every named oracle [ran]

- **Where:**
  - `conformance/drive.ts:75-77`: `case "evidenceOnly": bump(told, k, -1)`.
  - `conformance/scenarios/ctx.ts:119-126`: `evidenceOnly` pays what `checkEndings` is owed, "by declaration".
- **The gap:** the declaration is never checked. Review M5 fixed `delivered`, which now pays only if the same step shows a turn, denial, unhandled or refusal (`drive.ts:63-73`). `evidenceOnly` still pays on the runtime's word.
- **When the runtime may legitimately say it** (`turn.ts:1116-1145`): the lane is releasing, no actor exists and no record survives, or no incarnation has the path. Each of these is visible to the suite:
  - `r.state(actor) === undefined`
  - a `Released` evidence
  - the compiled machine's `local`/`persisted` flags
- **Minimal reproduction:** round 10's own mutant `g125.laundered-as-evidence` (`round-10/mutants-r10.ts`). It turns a failure ending to a live actor into `evidenceOnly` whenever another actor has mail. Suite only:
  - named oracles: 0 failures
  - whole output: 1 (`MED-01/other-actor-behind-a-hung-ack`, `0.evidence` counts)
  - 722/723 pass
- **Why it is a gate:** entities' confirm path is endings delivered to records and actors. Whole output is a change detector. One case's evidence count is all that stands between this class and green, and re-recording that output needs only one log line.
- **Fix:** in `drive.ts` `ledger`, pay `evidenceOnly` only when the suite can see why: the actor is not alive at that step, a `Released` for the attempt, or a machine with no record. Otherwise leave the debt for (j). Add `laundered-as-evidence` to the falsifier as a named-oracle check (`--no-output`).

### H2. D91's compile-time pins are run by no gate, and the lock's hash can't see a type-level weakening [ran]

- **Where:**
  - `round-10/typed/type-tests.ts:1`: "Each `@ts-expect-error` must be an error, or `tsc` fails: a compile-time pin of D91, not a claim."
  - `round-10/typed/tsconfig.json` is referenced by nothing:
    - `mutate-one.ts:46-53` runs `compare.ts` and `date-check.ts`, not `tsc`;
    - `falsify.ts` doesn't run `tsc`;
    - root `package.json:13` checks `packages/flow-state-rewrite` only.
  - `conformance/main.ts:65-75`: the token hash goes through `Bun.Transpiler`, which strips types and comments.
- **Minimal reproduction** [ran] (`scratchpad/scripts/tok.ts`):
  - Delete the line `// @ts-expect-error a key names a field that is not the input's` (`type-tests.ts:17`).
  - Change `key: ["b"],` on the next line to `key: ["b"] as any,`.
  - `tokens(weak) === tokens(src)` is **true**: same `round:typed/type-tests.ts` hash, so no log line is needed.
  - `tsc -p typed/tsconfig.json` still exits 0, but nothing runs it anyway.
- **What this means:**
  - The refusal is now gone with no trace.
  - The same holds for any type annotation in `typed/flow.ts` or `pay.typed.ts`, e.g. a parameter widened to `any`.
  - A front-end change that breaks D91 is caught by nothing.
- **Fix:**
  - Run `tsc -p round-10/typed/tsconfig.json` in `mutate-one.ts` and `falsify.ts`, with a tamper that deletes one `@ts-expect-error` and must go red.
  - Hash `typed/*.ts` by a type-preserving token stream, or by bytes after `vp fmt`.

## Medium

### M1. The reality scorer passes a run that ran nothing [ran]

- **Where:** `round-10/reality/score.ts:8-20`; `reality/run.ts:13` (`--only` is a list of names).
- **Reproductions:**
  - `bun reality/run.ts --only nothing-here` prints `SCORE PASS`.
  - `score({})`, `score({bfcache:{}})`, `score({crash:{twoCharges:"1"}})`, `score({crash:{twoCharges:NaN}})` and `score({crash:{twoCharge:3}})` all give 0.
- **Why it matters:** a renamed or missing counter, or a section that didn't run, is green. `checks/score-check.ts` tests only bad values in known places.
- **Fix:** each section `run.ts` was asked for must report, with every counter its kind declares. A non-number counter fails.

### M2. A correct runtime with another disk format still fails 112 cases (renamed keys) or 30 (an envelope) [ran]

- **Where:** literal `actor/` and `lane/` keys in scenario helpers, e.g. `scenarios/round7.scenario.ts:16`, `:96`, `:543`, `:613`. Counts by file: round4 18, round5 11, round7 7, round6 6, round8 5, review 4, and others.
- **What it pins:** the runtime's spelling, against `harness.ts:260`. The cases are not marked as pins.
- **Why it matters:** this matters for the production port ("conformance ports to prod"), and for entities, which will add stored kinds.
- **Fix:** read stored meaning through `DiskCodec` (`scope`, `kind`, `decode`) in one helper. Keep literal keys only in a named format-pin case.

### M3. Two runtime rules no case reaches [ran]

- **`step.timer-fence-off`**
  - Mutant: `step.ts:144` `if (!t || t.gen !== i.gen)` → `if (!t)`.
  - Result: 723/723, named 0, output 0.
  - No case fires a stale-generation timer while a newer one sits under the same key. There are 38 recorded fences, none of this kind.
- **`step.dispose-reads-not-aborted`**
  - Mutant: drop `tx.commands.push({ k: "interrupt", ... })` for reads at `step.ts:205-207`.
  - Result: 723/723.
  - No case disposes the runtime with a read in flight and then checks the outside. In reality the fetch's AbortController is never aborted.

### M4. The search vacuity rule lets half the actions be dead when a budget ends the search [read]

- **Where:** `search/engine.ts:62-64`.
- **The rule:** for `completed`/`inconclusive`, `vacuous` only if dead actions are more than half the actions.
- **Effect:** a search where `Leave` never moves the state is green whenever its budget runs out first.
- **Fix:** list the actions that must move, or require every non-`idle` action to move once the depth covers it.

## Low

- **L1** [read]: the falsifier's "bulk reason" tamper (`falsify.ts:131-136`) writes hash `000000000000`, so it goes red on the hash, not on `BULK`. The bulk rule (`main.ts:332`) is not falsified.
- **L2** [read]: `broken-adapter.ts:6` lists `extraRequest` but doesn't implement it, and `falsify.ts:47` omits it.
- **L3** [read]: `checkMints` sets `disposed` and never resets it at a `boot` (`ctx.ts:168-174`), unlike `checkEndings`. A case that disposes and then reloads loses mint accounting for every later life.
- **L4** [ran]: the fake compares a resend's body as JSON text (`fake-world.ts:533`). Variation `var.resend-key-order` reverses the key order on re-sends only, with the same meaning, and fails `HIGH-04`, `HIGH-04b` and `FRAG-11/unconfirmed-head-holds-then-resend`. This is defensible, since some servers fingerprint raw bytes, but it is an unwritten contract: "a resend is byte-identical". Write it down.
- **L5** [ran]: the bfcache score (`reality/run.ts:299`) checks `bOwner` and `backSees` only. If Chrome stopped caching the page (another version, or a feature that blocks bfcache), the green arm would still pass. Require `cached:true` and `back:"reload"`.
- **L6** [ran]: a run on `conformance/variant-adapter.ts` always exits 1. `roundDir` becomes `conformance/`, so every `round:` lock line reads as removed. The exit code means nothing for variants.
- **L7** [read]: the CLI pins (`round-10/cli/main.ts`) mostly use `rules.includes(X)`, so an extra wrong finding on those inputs passes.

## My mutants (written from rules, before reading RESULTS)

Run by `scratchpad/scripts/run-mine.ts`: the suite only, on a copy of `round-10` as a sibling `mut/`. Named oracles and output are counted apart.

| Mutant | Killed by | Where |
|---|---|---|
| edge.putback-overwrites-newer | named, 4 | REV7-H1 |
| edge.backoff-flat | named, 2 | REV7-H1 |
| edge.backoff-uncapped | named, 1 | REV8-PINS/D83 |
| edge.hide-skips-plain | named, 10 | REV7-H1 |
| edge.debounce | named, 1 | REV7-EDGE |
| edge.hidden-spins | named, 1 | REV8-M2 |
| edge.failure-silent | named, 4 | REV6-M7 |
| edge.success-keeps-failures | named, 1 | REV7-H1/L2 |
| lane.retry-count-always | named, 8 | PAY-04 |
| lane.sentAt-reset | named, 6 | LIKE-01 |
| lane.no-timeout | named, 6 | PAY-06 |
| lane.mayHaveApplied-false | named, 1 | PAY-04 |
| lane.latest-over-ack | named, 1 | MED-01 |
| lane.busyKept-silent | named, 4 | SEARCH-ODD-ALL (j) |
| lane.reject-queues | named, 7 | PAY-02 |
| lane.resend-owner-stale | named, 2 | PAY-04 |
| lane.cancel-during-ack | named, 4 | MED-01 |
| step.timer-fence-off | **survived** | M3 |
| step.timeout-no-abort | named, 1 | PAY-06 |
| step.yield-without-waiter | named, 1 | FRAG-20 |
| step.stall-invisible | **output only**, 5 | STORE-07 frames |
| step.dispose-reads-not-aborted | **survived** | M3 |

Kill rate: 20/22 (91%), 19/22 (86%) by named oracles.

Broken runtimes, named oracles only (`--no-output`) [ran]:

| Broken runtime | Pass |
|---|---|
| noWaits | 309/723 |
| noEvidence | 290/723 |
| constantHash | 718/723 |
| junkDiskKey | 720/723 |

Whole output turns all four red.

## Not reached

- `gate5s.ts` and `bench/`: not attacked.
- `round-10/typed/swaps.ts` (`--swap`) and `date-check.ts`: not run.
- My mutants were run through the suite only, not `mutate.ts`'s later gates. For the two survivors that is a lower bound, since a later gate (swap, CLI, gate5s) might still kill them.
- `reality/` sections other than `bfcache`, and `run7.ts`, `h3.ts`, `spin.ts`: not run.
- `checks/mailq-check.ts`: not attacked beyond seeing `d140.branch-shares-buffer` survive the suite.
- Searches at depth: only depth 4 on null and on a constant hash. No search on my mutants.
- Prior audits' Medium and Low findings: not rechecked one by one, apart from those listed in the table.
- `blind-derivation.md`: not rechecked.
