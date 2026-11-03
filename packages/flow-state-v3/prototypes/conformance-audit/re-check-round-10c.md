# Re-check of the v3 test system after round 10, stage C

Commit `97c5ae67`, branch `flow-rewrite`. Run from a detached worktree in the scratchpad, 09:43 to 09:58. Scripts: `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/recheck10c/scripts/`. No subagents, no repo writes besides this file, no commits.

Marks: [ran] reproduced at 97c5ae67; [read] seen in the code; [reasoning] inferred, not run.

## Verdict: FAIL

One High blocks a pass. It is the previous H1 again, one line further on:

- **H1'.** The ledger now checks `evidenceOnly`, but it takes `Released` and any `lane.release.*` cell at the runtime's word. Add one `note(tx, "Released", …)` to a dropped ending and oracle (j) no longer sees it. I built a runtime that drops an ending to a live actor. It passes **727/727 named oracles**. Without the extra note, (j) kills it in 2 cases.

Everything else from the previous gate is fixed or reduced to a stated limit:

- H2, M3: fixed.
- M1, M4: partly fixed. What is left is Medium or Low.

Fix H1' and this is a pass.

| Previous finding | Status | Evidence |
|---|---|---|
| H1: `evidenceOnly` taken at its word | **Fixed** for `evidenceOnly`; **reopened** one hop away (H1') | `g125.laundered-as-evidence`: 725/727 named (MED-01 and R10-AUDIT-ENDINGS, both by (j)) [ran] |
| H2: D91 pins run by no gate; hash blind to types | **Fixed** in substance | `checks/types-check.ts` runs `tsc` and is run by `mutate-one.ts:60-64` with every `checks/` file [read]. `typed/` hashes by whitespace-collapsed text (`main.ts:199-200`). The lock has `round:typed/type-tests.ts` [read]. The pin count can be fooled (M1' below) [ran] |
| M1: scorer passes a run that ran nothing | **Partly fixed** | `reality/run.ts --only nothing-here` gives `SCORE FAIL nothing-here: no such mode` [ran]. Four modes still declare no counters (M2' below) [ran] |
| M3: timer fence and dispose-aborts-reads unreached | **Fixed** | `step.timer-fence-off`: 726/727, R10-AUDIT. `step.dispose-reads-not-aborted`: 726/727, R10-AUDIT-READS. My two variants are killed by the same cases [ran] |
| M4: half the actions may be dead under a budget | **Partly fixed** | A dead action that runs is now `vacuous` [ran]. A dead action behind a guard that is never true is still green (L1 below) [ran] |

## High

### H1'. A dropped ending with a `Released` (or `lane.release.*`) note beside it passes every named oracle [ran]

- **Where:** `conformance/drive.ts:72-89` (`mayBeEvidence`) and `:112-113` (`lettingGo`).
  - An `evidenceOnly` pays if the same step holds a `Released`, or a `lane` cell starting `lane.release.`, for the same op.
  - It also pays if the attempt is in `lettingGo`, which is filled from the same two kinds.
  - Neither kind is checked. Both are the runtime's word, the same class as H1.
- **Worse:** `same(y)` counts a cell with no `attempt` as belonging to every actor (`drive.ts:87`). So a `lane.release.*` cell with no head, from any actor's lane of that op, launders the ending.
  - `lie.lane-cell-noatt` shows the ledger accepts a no-attempt cell [ran].
- **Reproduction:** `scratchpad/recheck10c/scripts/run-mut.ts`, on a copy of `round-10`. Each mutant is applied at `turn.ts:1126`, where a mail ending is admitted. It returns `evidenceOnly` for a live actor's failure ending, with or without one extra `Released` note.

| Lying runtime | Named oracles, plain lie | Of them by (j) | Named, `+ Released` | Of them by (j) | Whole output, `+ Released` |
|---|---|---|---|---|---|
| `like2nc`: `like` op, 2nd attempt, not `Cancelled` | 2 fail | 2 | **0 fail (727/727)** | 0 | 2 fail |
| `like2`: the same, with `Cancelled` | 4 | 4 | 1 (STORE-04 toast) | 0 | 4 |
| `second`: any op, 2nd attempt | 23 | (not counted) | 10 | 0 | 22 |
| `unknown`: every unsure ending | 169 | (not counted) | 94 | 0 | 171 |
| `save`: every failure of `save` (keyed rows) | 31 | 19 | 25 | **0** | 31 |
| g125's trigger (another actor has mail) | 2 | 2 | 1 (R10-AUDIT-ENDINGS's direct check) | 0 | 2 |
| g125's trigger, `lane.release.busy` cell instead | | | 1 | 0 | 2 |

- **What this shows:**
  - In every lie, `+ Released` takes oracle (j) from all of its kills to **zero**.
  - What still fails is the cases that assert the outcome by hand: a toast, a state, a `turn` evidence.
  - The narrowest lie gets past all of them. Only whole output sees it: STORE-05's actors and MED-01's evidence counts. That is a change detector, and one log line re-records it.
- **Why it is a High:**
  - Entities' confirm path is endings delivered to actors and records. (j) is the general guard for it.
  - The builder states the limit in D149 ("a runtime lying in both `lane` and `evidenceOnly` passes"). This shows a single `Released` line is enough, with no lie in `lane`.
  - It is also plausible as a real bug rather than a lie: a runtime that releases a lane wrongly reports it honestly, by its own lights.
- **Fix:** make a release earn its pay the way D149 made `evidenceOnly` earn it, from what the suite sees.
  - A `Released`/`lane.release.*` pays only if the same step shows a suite-visible cause for that actor's lane:
    - a `dispose` step, or the life over;
    - the owner's own `turn` leaving the state that binds the op. Use the compiled machine's op bindings, which the suite holds.
  - Drop the no-attempt wildcard in `same`.
  - Add `lie.like2nc-released` and `lie.save-released` (see the script) to `falsify.ts --part mutants`. Each must be killed by a named oracle with `--no-output`.

## Medium

### M1'. `types-check.ts` counts the text `@ts-expect-error`, not directives; the count can be kept while a pin is removed [ran]

- **Where:** `round-10/checks/types-check.ts:19-21`, `PINS = 9`.
- **The header comment counts as a pin:** `type-tests.ts:1` itself contains the words. So the file holds 8 directives, and "nine pins" includes a comment.
- **Reproduction:** on a copy of `typed/` and the check:
  - replace the directive at `type-tests.ts:17` with `// see the @ts-expect-error notes below`;
  - widen `key: ["b"]` to `key: ["b"] as any`.
  - Result: `TYPES PASS  tsc clean, 9 pins`. D91's "a key names a field of the input" is no longer pinned.
- **What still catches it:** the lock, since `typedText` sees the text change [read]. But a log line with its own reason launders it, by the stated design (`main.ts:315`).
- **Also:** a directive kept over a line that now errors for another reason (a typo) passes both `tsc` and the count [reasoning]. `@ts-expect-error` does not name an error code.
- **Fix:** count only lines matching `^\s*//\s*@ts-expect-error\b`, and pin each directive's own text in the check, by its words, not a number. That makes "which refusal" part of the gate, not only "how many".

### M2'. The reality scorer still passes empty rows for four modes [ran]

- **Where:** `reality/score.ts` `MODES`.
  - `s3`, `desk` and `crash.crash` declare `rows: []`.
  - `tabs` declares `counters: []`.
- **Reproductions** (`scratchpad/recheck10c/scripts/score-attack.ts`): each of these gives 0.
  - `scoreAsked({tabs:{}}, ["tabs"])`
  - `{tabs:[]}`
  - `{s3store:[{}], s3runtime:[{}]}`
  - `{desk:[{}]}`
  - `{crash:[{}], crashSummary:{cycles:0, …zeros}}`: a crash run with **zero cycles**.
  - a misspelt per-row counter beside the real one in `atom`
  - `doubleCharge: -1`
- **Stated, not fixed:** `run7.ts`, `h3.ts` and `spin.ts` still score the old way (D153).
- **Fix:**
  - Give each mode its row counters.
  - Require `cycles > 0` where a mode has cycles.
  - Reject negatives.
  - Reject unknown counter-like keys, i.e. any key not declared, in a row of a declared mode.

### M3'. A wrong supersede is caught only by hand-written cases, never by an oracle [ran]

- **The gap:** `checkMints` accepts `Superseded`/`Released` as accounted (`ctx.ts:164-171`). The ledger never asks whether a supersede was allowed.
- **Two reproductions:**
  - `lie.settled-superseded` (a settled head vanishes, said `Superseded`) is killed by (j) in 282 cases, since its ending was owed. (j) backs up `checkMints` whenever an `ending` evidence came first [ran].
  - `lie.serialize-as-latest` (a `serialize` op drops its queue as if `latest`, telling each "superseded") is killed by 3 named cases, all direct asserts:
    - `REFUND-01/three-refunds`
    - `REFUND-01/sixty-five`
    - `REV8-PINS/D29-a-full-queue-declines`
    - No oracle [ran].
- **What it means:** an op with `serialize` and no such hand case loses user writes with a green run [reasoning].
- **Why not High:** in this repro the actor is told, so it is not a silent loss. And three cases kill it today.
- **Fix:** an oracle that a `Superseded` attempt has a newer attempt of the same lane, under a policy that supersedes (`latest`/`replace`, from the compiled op).

### M4'. M2's 73 literal-key cases: a stated limit, not a blocker for entities [read]

**My judgement.** They fail a correct runtime that uses another format (loud false reds). They do not pass a wrong runtime on the current format, so by this gate's bar they are not High.

They do block the production port's freedom of format, and they hide three silent modes that go green under another format:

- **A corrupt fault that matches nothing does nothing:** `corruptStored` with a `match` that hits no key edits nothing.
  - It still sets `ledgerOff = true` (`drive.ts:574-584`), so the rest of that case also loses (j).
  - It does that even on the current format when nothing matched.
- **Absence asserts through a literal key pass under another format:** `round9.scenario.ts:233` and `:265` (`"nothing on disk", lane(c), undefined`), through `lane()` at `:32`, which reads `lane/…` by literal key.
- **`Ctx.record` spells the scope by hand:** `ctx.ts:205`, `` `${actor}/${id with %-escapes}` ``. The scope it compares with `diskScope` is the round-10 spelling, not the codec's.
  - `variant-adapter.ts` keeps the base scope (`:23`), so the 73/26 counts cannot see this.

**Before production:** mark the remaining cases as format pins or move them behind the codec. Make `corruptStored` throw when nothing matches.

## Low

- **L1** [ran], M4's residue: a budget-stopped search with an action behind a guard that is never true is `completed` (green), with the action in `deadActions`.
  - Two such actions of five also pass.
  - `scratchpad/recheck10c/scripts/vac-attack.ts`.
  - The builder's own fix narrowed `resend`'s guard (`frag.search.ts:28`). A wrong guard of that kind is now invisible.
  - Searches are not regression gates (`mutate-one.ts:3-4`), so Low.
  - Fix: an action never tried at a depth the search completed is `vacuous` too.
- **L2** [reasoning]: `mayLetGo` pays a `KeptLetGo`/`ParkedLetGo` on any `turn` of the attempt's actor in the step (`drive.ts:90-94`), not one that caused the let-go.
  - My let-go lie (`lie.letgo-all-parked-on-cancel`, `-b`) was killed by a named case (`R10-PINS/a-hosts-cancel-…`), so this is not shown to pass.
- **L3** [read]: an attempt never attributed (no turn in its step) makes `mayBeEvidence` return false, which is safe. A future step shape with no turn would turn this into red noise, not a pass. Stated in D149.
- **L4** [ran]: `fence.gen-ge` (`t.gen !== i.gen` → `t.gen > i.gen`) survives, 727/727. It is an equivalent mutant, since a firing's gen is never newer than the stored one. Not a finding.

## My mutants and tampers on the new code

Mutants run named-only (`--no-output`) and with output, by `scratchpad/recheck10c/scripts/run-mut.ts`. Tampers were run on copies.

| # | Target | Mutant or tamper | Result |
|---|---|---|---|
| 1 | ledger | `lie.released` (g125 + `Released`) | named 1 (direct check only), (j) 0 |
| 2 | ledger | `lie.lane-cell` (g125 + `lane.release.*` with attempt) | named 1, (j) 0 |
| 3 | ledger | `lie.lane-cell-noatt` (no attempt) | named 1, (j) 0 |
| 4 | ledger | `lie.like2nc-released` | **survives named, 727/727**; output 2 |
| 5 | ledger | `lie.save-released` | named 25, (j) 0 of the 19 it had |
| 6 | `checkMints` | `lie.settled-superseded` | killed, (j) 282 |
| 7 | `checkMints` | `lie.serialize-as-latest` | killed by 3 direct cases, no oracle |
| 8 | let-go | `lie.letgo-all-parked-on-cancel`, `-b` | killed, 1 named |
| 9 | `lateCancel` | `fence.reuse-gen` (every timer gen 1) | killed, R10-AUDIT |
| 10 | dispose | `dispose.first-read-kept` (only reads after the first aborted) | killed, R10-AUDIT-READS |
| 11 | dispose | `lie.release-silent` (`Released`, no `tellEnded`) | killed, 8 named (L3 oracle) |
| 12 | types-check | directive text moved into a comment, `as any` | **check passes**; lock sees it (M1') |
| 13 | scorer | empty rows, zero cycles, negative count | **pass** (M2') |
| 14 | search vacuity | a never-true guard on a dead action | **green** (L1) |
| 15 | `Ctx.record` | a scope spelled differently by the codec | [reasoning] fails every `record()` case: format pin (M4') |

## Not reached

- `falsify.ts` was not rerun as a whole. Its stage C parts are [read]. I reran the same mutants myself.
- I did not run `mutate.ts`'s later gates (swap, CLI, gate5s) on my survivors. For #4 that is a lower bound, though none of them reads endings.
- I did not rerun the variant adapter's 73/26 counts.
- Real Chrome runs were not run.
