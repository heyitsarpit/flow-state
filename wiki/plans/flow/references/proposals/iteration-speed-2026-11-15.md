# Iteration speed: make each core Task cheaper (2026-11-15)

**Status: proposed.** Nothing here is decided. This file changes no code, plan, Spec, Task or the Epic.

**Bottom line:** core Tasks get more expensive because the suite keeps four private copies of what the core does.
They are the generator's belief, the owed rows keyed by recorded instances, the triage keyed by line, and the
baseline attributed run by run. Every core change has to be copied into each of them by hand. Five changes make a
core change touch one place:

1. owe a production bug by its root and judge each excuse by that root's fix plant, not by recorded Attempt ids;
2. let the Spec model steer the generator, and delete `parts/belief.ts`;
3. use A3's step shape as the rule: a committed fast loop between commits, and the full gates in parallel at the
   step's end;
4. gate the baseline only on steps that claim no behaviour change;
5. key every kept record stably, and index where rulings live.

Each change keeps the suite's power to catch faults (stated per item). Items 3 and 5 can land before T54 resumes,
items 1 and 2 before T18, and the rest can wait.

**Why now:** T54 took about 6 hours over A0 to A3, and A2 took 2.5 of them, with 0 live `src/` edits in about 2
hours. The remaining core Tasks change exactly what the copies model:

- T18: lane policies, and 8 new parts;
- T55: Life and disposal;
- T19: write-ahead batching and retry;
- T20: restore at the start.

**Read first:** `process-notebook.md` (the T54 A2/A3 study); `t54-build-log-2026-11-14.md` (resume list items 4 to
8); `suite-convergence-2026-11-14.md` (why excuses name exact items); Conformance R15, R19, R22.

## The five changes

### 1. Owe a root, judged by its fix plant

**Root cause.** An owed row records instances of a cause: the script id, then each Attempt id minted in that run
(`att-…-<counter>`), or `subject@step` (`parts/owed-varied.ts:57`, 135 rows over 3 roots). Each of these changes the
instance names even when the cause stays the same: a regeneration, a change in mint order, or a reordered step.
That is how A2's stale rows went 96 → 125 → 160 → 169, `owed.ts` was edited 14 times in 30 minutes, and
`record-all.ts` ran three times. The build log shows the real test the builder used was counterfactual: "29 of 31
new reds clear with the retry-count plant" (resume item 7).

**Before** (today, `parts/owed-varied.ts` and `parts/owed.ts`):

```ts
// existing: one recorded line per script × check × Invariant, keyed by minted ids
"PART-pay-stress-6|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000001773-2",
// existing: root → owner, with the root's prose
const owners = { retry: { why: RETRY_COUNT, owner: "@task.V3.T19" }, … };
```

**After** (proposed):

```ts
// NEW: OwedRoot   // existing: Spec ids, TaskRef   // user-defined: none
export const owedRoots: ReadonlyArray<OwedRoot> = [
  {
    root: "retry",                          // existing name
    owner: "@task.V3.T19",                  // existing owner
    rule: "WriteAhead R13",                 // NEW: the rule the fix restores
    plant: [{ file: "src/core/tx.ts",       // NEW: the owner's intended fix, applied in a scratch copy
              find: "…", replace: "…" }],
  },
];
```

**Judgement (two-sided, per break).** For each part or regression script that is red on production, the gate
replays it on a scratch copy with each root's plant applied:

- a break counts as owed by a root when that root's plant removes it, and only that one root's plant does;
- a break that no plant removes is `BAD unowned`;
- a root whose plant removes no break in any script is `BAD owed root no longer reproduces`, which is how a fix
  shows up;
- a plant that does not apply exactly once fails loudly, as mutants do (`runner/falsify.ts:107`).

**Cost.** About 200 to 300 lines: a `parts --owe` mode that reuses falsify's scratch copy and the existing player.
The 135 rows, `TRIAGED_SIGNATURES` and `thinPinned` go. Reds are played twice, but only the red ones (about 20 today).

**Saves.** All owed-row churn. Every upcoming Task reaches it:

- T18's 8 new parts, plus "the base parts re-judged", produce new reds;
- T19's WriteAhead oracles "re-judge every composite already built";
- T20's Restore oracles do the same.

In each case the cost goes from recording and re-keying rows per instance to writing one plant per root. A2's
owed-row share was about 29 of 65 minutes in one slice.

**Correctness.** The convergence rule "an excuse names the exact item it excuses" still holds. Each excuse is still
decided per break, and the item is now "the break this fix removes", which is the causal meaning of the root, where
a list of ids only names its symptoms. It is still two-sided: unowned breaks and fixed roots both fail. What it
loses is detection of a new break with the same root on a new Attempt, and that loss is correct: the same root
means the same fix.

The new risk is an over-broad plant that hides an unrelated bug. Guards against it:

- a plant is one rule's change, reviewed like a mutant (amendment 8: a reviewer sidecar checks every harness change);
- the class gate keeps proving that the excuse machinery hides no planted break.

### 2. The Spec model steers the generator; `belief.ts` goes

**Root cause.** The suite has two models of the core:

- the Spec model (`dsl/lifecycle-*`), which the slice template already updates per Task and model mutation already
  proves (Conformance R19, I61);
- the generator's belief (`parts/belief.ts`, 369 lines), which nothing proves. It holds a hand model of lane
  busy/unsure state (`passes` :70-93), write batching (`unacked`, `landed`, `refused`), restart delivery (`started`
  :308-322, which mirrors `src/core/incarnations.ts`) and boot (`reloaded`, `afterBoot`).

When the belief goes stale, scripts go thin, and the only signal is the thin check, which runs only for scripts
with no owed rows (`parts/play.ts:277`). That is how A2 got 18 thin scripts, a belief commit, a reverted second
belief, and every script regenerated.

**After.** `generated()` folds each drawn move into the Spec model, as the compare does (`dsl/lifecycle-step.ts`
`step`). It reads the requests the model owes or allows as the open set, and the leaf from the model. A script is
still the JSON step list, and it still replays with no generator (I47 unchanged). Where the model allows a choice,
the generator draws one, and the player still skips an answer that finds no request (`dsl/script.ts:35`).

**Cost.** One to two days, behind a spike: can the model run forward on the generator's own moves, treating its
predicted requests as `Requested` facts? That is open question Q5. `belief.ts` and its imports in `generate.ts` go.

**Saves.** Every upcoming Task would otherwise edit both models:

- T18 adds latest, serialize (64, Overloaded) and cancel queues, plus Idle guards;
- T19 changes batching, which today is pinned thin as `COARSE_BATCHING`;
- T20 changes start and restore;
- T55 changes attach and disposal.

With one model, each Task makes those edits once. Thinness also becomes a real signal: with a correct model and a
correct runtime it is near zero, so a thin script means the runtime and the model disagree.

**Correctness.** The generator still only steers. A wrong model still makes a less useful script, never a wrong
verdict, and that model is now mutation-proved. Scripts stay identical across runtimes (R14), so the bench and
the round-14 comparison keep working. A rejected alternative is generating online against the fake server's log:
the script would then depend on the runtime under test, which breaks R15's four readers.

### 3. Step shape and a committed fast loop

**Root cause.** A2 re-ran the parts and held-out gates six times while iterating. Gate runs and waits took about 22
of 50 minutes in one slice. The full gates run one at a time (`runner/gates.ts`, `concurrency: 1`, each child
bounded at 280 s) even though the Epic allows 8 deterministic processes. A3's "13 to 20 s production subset" is
defined nowhere, so each builder rebuilds it. Builders also rebuild tooling privately: `play-one`, `shrink-one`,
`classify`, `rekey`, `record-all`, `owed-plan`, `reach` and `sig` exist only in scratch.

**After** (A3's pattern, written as the step rule):

- one rule per commit, red first on the parent code;
- between commits, `nub run conformance:fast` (NEW): the production suite plus the touched area's parts, at
  `--parallel 4`, under about 20 s;
- at the step's end, the full gates with `concurrency: 4` (NEW in `runner/gates.ts`);
- `gates.json` refuses to record a verdict while the package has uncommitted changes. That makes the "green, but
  one file was edited after the run" slip impossible.

The recurring scratch tools land as runner modes:

- `parts --only <script> --seed n`;
- `parts --owe` (item 1), which replaces `classify`, `record-all` and `owed-plan`;
- `shrink` already exists;
- item 5 makes `rekey` unnecessary.

**Cost.** About half a day: one script entry, one concurrency number, one dirty check, and two modes.

**Saves.** Full gates drop from about 7 minutes to an estimated 2 to 3 (unmeasured; the longest child bounds it).
Mid-step re-runs move to the 20 s loop. The parallel run is bounded by vm_stat (about 16 GB).

**Correctness.** Unchanged. The same gates run before every checkpoint commit, and the dirty check makes a recorded
verdict trustworthy.

### 4. Gate the baseline only on behaviour-preserving steps

**Root cause.** `baseline.tsv` (1,149 run digests) is a change detector. The Epic says recorded output is "a change
detector only". Even so, A2 attributed all 598 differing runs by hand, by layering the change in scratch copies, and
filed 135 allowed entries (`baseline-allowed.tsv`) under rule ids. T18, T19 and T20 each change most runs.

**After.** A step declares one of two kinds:

- `refactor`: the baseline must be byte-equal, or equal with each difference named, as today;
- `behaviour`: the oracles and the Spec model judge the step, and the baseline is re-recorded at the step's end
  with no attribution.

Examples of each from the Task text:

- T54 A4 ("the report stream byte-equal to A3's") is a refactor step;
- T55 B1 ("Reports stay equal") is a refactor step;
- T55 B2, T18, T19 and T20 are behaviour steps.

**Cost.** One rule line and one `--record` call. `baseline-allowed.tsv` goes after T54.

**Saves.** The per-run attribution pass on every behaviour step, which was one of A2's largest blocks.

**Correctness.** No expected result comes from the baseline, so no judgement is lost. The strict check stays where
it is strongest, on refactors. This relaxes a gate, so it is the user's call (Q4).

### 5. Stable keys, and one index of where rulings live

**Root cause.** Records are keyed by positions that move:

- core triage by `file:line` plus the mutated text (`core-mutants-triage.ts`). A2's edits shifted 18 keys, which cost
  3 mutate runs and a hand re-key;
- held traces by list position (`runner/fold-mutants.ts:73`, `m${i}`).

Separately, most builder stops asked for rulings the repo already held, in at least eight owed lists that use
different keys: `owes.ts`, `parts/owed*.ts`, `limits.ts`, `limited-mutants.ts`, `thinPinned`, `pair-owners.ts`,
`runner/crash-owed.ts` and `core-mutants-triage.ts`. The README's layout table omits `parts/` entirely
(`README.md:73-88`). Some rules exist only in code. The thin check, for example, is skipped when a script has owed
rows (`play.ts:277`).

**After:**

- key triage by file plus the mutated line text. `mutate.ts` already admits only lines that are unique in their
  file, so the text alone is a stable key;
- key held traces by trace name;
- add a README section, "Owed lists and where rulings live": one row per list, giving its key, its rule, its owner
  rule, and the question it answers;
- the builder brief gets one line: check that table and `wk show` before asking for a ruling.

**Cost.** About 2 hours.

**Saves.** All line-shift re-keying, which will grow: T55 rewrites `Disposal` and T18 rewrites lanes. It also saves
ruling round trips; the studies measured 8.2 idle minutes per ruling and a 15-minute idle block on a verdict.

**Correctness.** None is lost. A changed mutated text still invalidates its triage row, because that is a different
mutant.

## Full ranked list

Ranked by expected saving per cost to build. The savings are estimates from the T54 study, not measurements.

Each entry: change (section), cost, saving per core Task, when.

1. Stable triage and trace keys (5). 2 h. Saves 3 mutate runs and a re-key per step. Before T54 resumes.
2. Parallel full gates, the dirty check, `conformance:fast` (3). Half a day. Saves about 4 min per full run, plus
   mid-step re-runs. Before T54 resumes.
3. The rulings index, README `parts/` rows, the contradictions sidecar 4 found fixed (5). 2 h. Saves stops for
   rulings. Before T54 resumes.
4. Baseline gates refactor steps only (4). 1 h. Saves the per-run attribution pass. Before T18; the user's (Q4).
5. Owe by root plant, `parts --owe` (1). 1 day. Saves all owed-row churn. Before T18; the user's (Q1).
6. The Spec model steers the generator (2). A spike, then 1 to 2 days. Saves belief edits in T18, T19, T20, T55.
   Spike before T18; build in T18's suite half.
7. Reviews: the next step starts while the review runs. One rule line. Saves the idle wait per step. Before T54
   resumes; the user's (Q2).
8. Round-14 limits by rule predicate, not case lists. Half a day. Saves per-case limit rows on each divergence.
   Before T19 (Q3).
9. `parts --only` committed, scratch tools retired. 2 h. Saves private tooling rebuilt per builder. With 2.
10. The thin check for every script, owed or not, from one constant. 15 min. Ends hidden thinness. With 6.

Notes on 7 and 8:

- **7. Reviews.** The Epic's Reviews section has the step review "confirm it before the next step starts". The A1
  and A2 plans were already prepared while a review ran, with no `src/` edits allowed. The proposal: the next step
  starts at once, and a blocking finding (under the Stopping rule) lands as the first red check of the step then
  running. A step that changes the Port, an oracle or a Spec guarantee still waits. The risk is reverting one step
  when a review overturns a design. The measure is idle minutes per step against reverts.
- **8. Round-14.** 40 of round-14's 84 hand cases are already limited by one fact (`limits.ts` `BOOT_PARKS`), with
  31 limited mutants owed. T19 and T20 will widen the gap. Keep round-14 through T18, since it implements latest,
  serialize and cancel and is the only host where the new policy oracles can be mutant-proven before production has
  them. After that, state each divergence once as a predicate over the run ("the run reloads with a Held head"),
  and hand the affected mutants as a batch to the Task that builds the rule. Retire round-14 (T53) after T18's
  production half.

## Tested against the next Tasks

- **T18** (latest, serialize, cancel; Q5; 8 parts). Today it touches the belief (queues, Idle guards), owed rows
  for each new red, triage keys in the lane code, and the baseline for most runs. After: the model only, one plant
  per root, no re-key, the baseline re-recorded.
- **T55** (`Life` replaces `Disposal`; the final write moves into the core). Today: the belief (attach, reset) and a
  triage re-key, since every line of `Disposal` moves. After: B1 is a refactor step with a strict baseline, B2 a
  behaviour step; no re-key.
- **T19** (write-ahead batching; the retry count). Today: the belief's `unacked` and `landed` (`COARSE_BATCHING`)
  and about 100 `retry` rows to clear. After: the `retry` root's entry is deleted with its fix.
- **T20** (restore at the start; quarantine; `forget`). Today: the belief's `started` and `reloaded`, more round-14
  limits, and owed rows from re-judged composites. After: the model only, limits by predicate, a plant per root.

T17 and T57 change the compiler and fragments. Items 3 and 5 help them too; items 1, 2 and 4 matter less there.

## What I would cut

- `owed-varied.ts` rows and `TRIAGED_SIGNATURES`: they catch exact instances of 3 roots; item 1 replaces them and
  is stricter on causes.
- `thinPinned`: 2 generator gaps; with item 2, thinness is a runtime and model disagreement, judged directly.
- `baseline-allowed.tsv` after T54: it catches nothing an oracle misses, since it holds no expected results
  (item 4).
- `BOOT_PARKS`-style case lists: one fact repeated 40 times (item 8).
- The committed `catch-sweep.prototype.tsv` (19,096 rows): a record read only by `kills`, which no gate runs
  (sidecar 2; verify before cutting). Regenerate it on demand.

Kept, because each catches something no other check does:

- falsify on both runtimes;
- model mutation (328 fields);
- the class gate: it proves the excuse machinery, and item 1 needs that proof;
- liar (Conformance R21): its empty output files mean no mutant was caught only by its confession, which is the
  property it proves;
- crash (3 real bugs);
- pairs (1 lost cell pair).

## Questions for the user

**Q1. How the suite owes a known production bug.**

- A: by root, judged by the root's fix plant (item 1). Recommended.
- B: keep exact instances, but key Attempts by mint ordinal within their script, so a mint-order change stops
  renaming them. Half the saving, since a regeneration still makes rows stale.
- C: keep today's rows.

**Q2. Whether step reviews block the next step.**

- A: no; a blocking finding lands as a red check in the running step, except on Port, oracle or guarantee steps.
  Recommended.
- B: keep blocking.
- C: drop per-step reviews and keep the 90-minute cadence and the Task close.

**Q3. Round-14.**

- A: keep it through T18, state limits by predicate, and retire it after T18's production half. Recommended.
- B: retire it now (T53 before T18); this loses mutant proof of the policy oracles until T18's production half.
- C: no change.

**Q4. The baseline.**

- A: strict on refactor steps; re-recorded on behaviour steps. Recommended.
- B: keep per-run attribution.
- C: delete the baseline.

**Q5. The generator's model.**

- A: a half-day spike on running the Spec model forward on drawn moves; if it holds, replace `belief.ts` in T18's
  suite half. Recommended.
- B: generate online against the fake server's log. This breaks R15's identical scripts across runtimes.
- C: keep the belief, and add model mutation to it as well.

## Sidecar log

Five read-only Haiku Explore sidecars at effort high, launched in one message, one per angle:

1. knowledge the suite duplicates from the core;
2. yield against cost;
3. prior art;
4. rulings answerable from records;
5. blind, given only the goal and the README.

I read the lines each one cited before using a finding.

Each entry: finding, then verdict and why.

- **Sidecar 1:**
  - `belief.ts` hand-models lanes, batching, restart and boot (`:70-93`, `:289-369`). Accepted: read in full;
    the basis of item 2.
  - Owed rows key minted Attempt ids and `subject@step` (`owed-varied.ts:57`). Accepted: read; the basis of item 1.
  - 145 owed rows. Changed: I count 135 (`grep -c`).
  - Triage is keyed by `file:line` plus text. Accepted: `mutate.ts` admits only lines unique in their file, so text
    alone is stable (item 5).
  - The 50% thin rule is copied three times (`play.ts:297`, `pending.test.ts:35`, `play.test.ts:36`). Accepted:
    grep confirms; folded into ranked item 10.
  - 40 of 42 limit rows are one fact (`BOOT_PARKS`). Accepted: read `limits.ts`; item 8.
  - 243 `find:` strings copy core text. Accepted, not acted on: they fail loudly when stale, one place each.
- **Sidecar 2:**
  - Full gates run serially (`runner/gates.ts`, `concurrency: 1`, 280 s per child). Accepted: read; item 3.
  - The checkpoint set takes 55 s, the class gate 49 s of it. Accepted: `t61-build-log-2026-11-14.md` line 10.
  - The "13 to 20 s subset" is defined nowhere. Accepted: not in the Epic, the README or the runner; item 3.
  - Liar has zero unique kills, so cut it. Rejected: an empty liar output means the gate passed; it proves a
    property (R21), not kills.
  - `gates.json` disagrees with the triage file. Context only: the working tree holds uncommitted gate edits.
- **Sidecar 3:**
  - fast-check gates each command on the model at run time (`fast-check.js:9574`). Accepted: read; supports a
    model-steered generator.
  - fast-check's `replayPath` is positional and breaks when commands change. Accepted: the same failure class as
    instance-keyed rows; supports item 1.
  - XState's TestModel derives paths from the model on every run (`shortestPaths.ts:14`). Accepted: nothing stored.
  - QuickCheck, Hypothesis and Elle, from memory. Framing only: not verified, and no claim rests on it.
- **Sidecar 4:**
  - The brief's `owed.ts:433` does not exist (128 lines); the root is at `owed.ts:53-80`. Accepted: `wc -l`.
  - The thin check runs only when a script has no owed rows (`play.ts:279`). Accepted: read.
  - `parts/` is missing from the README layout (`README.md:73-88`). Accepted: read; item 5.
  - The Epic blocks the next step on its step review. Accepted: read the Reviews section; Q2.
  - AGENTS.md says 4 sidecars per review, the Epic up to 8. Accepted: both read; fix with ranked item 3.
  - The notebook calls `it.todo` the repo's way; the Epic bans it. Accepted: both read; fix with ranked item 3.
- **Sidecar 5 (blind):**
  - Delete all committed run outputs. Changed: the baseline stays for refactor steps (item 4); only the prototype
    sweep is cut.
  - Replace source mutants with Port-level faults. Rejected: Port faults cannot reach core logic; core mutants and
    falsify need source edits.
  - Take coverage owners from `wk` status. Rejected for now: owners are rulings, and the coverage gate already
    checks each is open.
  - Spec ids are retyped as strings in `expects:` sites. Rejected: they are the Spec's own keys, and coverage
    rejects unknown ids.
  - Independently found the same roots as items 1, 4 and 5 (committed outputs, hand-kept ledgers, text keys).
    Accepted as a cross-check.

Not verified: the gate-time saving from parallel runs, and whether the Spec model can run forward without runtime
facts. Q5's spike settles the second.
