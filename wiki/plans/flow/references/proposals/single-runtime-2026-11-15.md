# Single runtime: the production core, judged only through the Spec (2026-11-15)

**Status: proposed.** Nothing here is decided. This file changes no code, plan, Spec, Task or the Epic.

**Bottom line:** keep one runtime, the production core. Four layers judge it, and every expected value
in them comes from the Spec, never from the core's own output:

1. **Spec goldens:** hand cases, plus exhaustive finite tables, for outputs that must be exact.
2. **Trace laws:** safety laws and progress laws, run on every run, hand-written or generated.
3. **Relations between runs of the same core:** crash and reload, replay, batching and the liar swap.
4. **The core-mutant score:** measured on hand and generated runs separately, and the bar no change may lower.

The Spec model stops predicting step by step. It is frozen now and converted oracle by oracle, then deleted. The
generator's belief goes: scripts are generated while playing the real core, reading only the suite's world and
the public snapshot. Round-14 retires before T18. What remains of a model is the Spec's own tables, kept as data
and checked one step at a time as a relation, `(before, cue, after) ∈ table`. That relation carries no state from
step to step and can produce no output, so it is not a runtime.

**Is the prediction load-bearing? Measured in a scratch copy:**

- **Hand cases: almost never.** With all 9 model-reading oracles switched off, core-mutant kills drop from 78/114
  to 76/114. 64 of the 76 are killed by hand goldens, and the 2 lost mutants can be restated as trace laws. All 18
  hand-written production mutants stay red. The liar gate stays at 13/13.
- **Generated scripts: very much.** Over the 312 gate and held-out part scripts, all 14 oracles notice 85
  mutants, and the 5 trace oracles alone notice 34. The model carries the other 51. Today's trace oracles are
  safety-only, so they pass vacuously on a core that does nothing.
- **Two progress laws close part of the gap.** In about 40 lines of scratch code, two laws raise the 34 to 41:
  - an ensured actor is live by the end of its step;
  - an event driven at a live actor gets a verdict in its step.

  The other 44 fall into seven families, each with a Spec-derived replacement (section 2).

**Why now:** the user paused the V3 run because "two runtimes" keep emerging. In T54 A2, about 2 hours went by with
0 live `src/` edits while the suite caught up with one small change. Today every core change is restated by hand
in each of these:

- the Spec model, about 4.4k lines in `dsl/lifecycle-*`, `compare`, `expect` and `domain`;
- the turn predictors, 1.5k lines;
- the reference, belief and model-owes code, 1.6k lines;
- round-14;
- the owed lists, 1.9k lines.

Together that is about 9.4k lines that restate a 4.6k-line core (`src/core`). T18, T55, T19 and T20 each change
when requests open and close, which is exactly what these copies model.

**Read first:** `iteration-speed-2026-11-15.md` (facts only), Conformance R5, R6, R15, R19 to R22,
`suite-convergence-2026-11-14.md`, `t54-a3-prep-2026-11-15.md`.

**Risk:** a trace law can be wrong-strict as easily as a model can be wrong. My first "an answer is heard in its
step" law failed 85 correct runs: settlement can be deferred, and late answers go unheard (WriteLanes I32). So every
law is held to the same proof: it passes the unedited core, and it kills a mutant no other judge kills.

## 1. Inventory

**Method.** All 233 `.ts` files under `packages/flow-state-v3/conformance/` were classified. A sidecar did the
classification. I checked the registry split (`suite.ts:72-107`), the model's imports and the line counts myself.
The brief's four classes leave out hand goldens, so they get a fifth class.

- **Trace check, no simulation (9 files):**
  - 5 oracles: `ending-channels`, `attempt-identity`, `graph-names`, `publication`, `refusal`;
  - replay (`runner/run.ts:131`), `baseline` conservation and field-order.
- **Prediction, needs the model (45 files):**
  - `dsl/lifecycle-*`, with its tables at `lifecycle-rules.ts:85,311,438`;
  - `compare.ts:258`, `expect.ts:356`, `turn/anchor.ts:619` and `turn/predict.ts`;
  - `parts/belief.ts`, `parts/reference.ts:233`, and the 9 oracles listed below.
- **Hand golden, from the Spec with no simulation (29 files):**
  - 19 scenario files;
  - 7 `dsl/*.traces.ts`, which run on the model;
  - `pay-golden.ts`, and the construction and CLI cases.
- **Second runtime (6 files):**
  - `adapters/prototype*.ts` (1,353 lines), `limits.ts` and `limits.test.ts`;
  - 5 round-14 gates.
- **Tooling (144 files):** world, script, player, shrink, runner, mutation drivers, owed and excuse lists.

**The 9 prediction oracles:**

- `delivered-once`, `lane-queue`, `selection` and `schedules` are fully predictive;
- `disposal`, `evidence-kinds` and `late-results` are split: part of each is a trace check;
- `retry-count` is borderline: only its head Attempt comes from the model;
- `idle-guard` reads lane idleness from the model.

**Gates.** Of the 19 gates in `gates.json`:

- 5 exist only for round-14: suite, falsify, liar, limits and regressions;
- 1 exists only for the model: model mutation, 328 fields;
- the parts, held-out and class gates judge with the model oracles.

**Encoded expectations.** The places that encode expected core behaviour, rather than a property of the output, are:

- the model tables and step;
- handler tables (`fixtures/handlers.ts:335`) and the derived reference;
- the anchor and selection predictors;
- the belief;
- owed and excuse lists that state what the core should do (`parts/owed*.ts`, `owes.ts`, `crash-owed.ts`,
  `model-owes.ts`, `limits.ts`, `core-mutants-triage.ts`);
- the baseline digest, a change detector over 1,149 runs.

## 2. Load-bearing predictions: measured

All runs used a scratch copy of the working tree (A3's six uncommitted gate files included). One environment
switch removed oracles from the `oracles` list in `suite.ts`, so mutants stayed registered. The harness scripts are
listed in the experiments appendix.

| Measure | All 14 oracles | 5 trace oracles | Trace + 2 progress laws |
| --- | --- | --- | --- |
| Core mutants killed on the 78 hand cases (`mutate --limit 120`) | 78/114 | 76/114 | not run |
| Hand production mutants red on some case (`falsify --sweep`, any-check rule) | 18/18 | 18/18 | not run |
| Liar gate, production | 13/13 | 13/13 | not run |
| Core mutants noticed on 312 generated scripts (signature differs from control) | 85/114 | 34/114 | 41/114 |

**Hand cases.** Goldens dominate. With the model off, 64 of the 76 kills are failed `eq` expectations
(`dsl/case.ts:366`). The record named a model oracle as first killer for 46 mutants, but that list kept only the
first killing case. The two mutants that are really lost:

- **`incarnations.ts:229`:** disposing a live actor skips stopping its schedules and its `Finished` report. A law
  catches it: after `Disposed` of a live actor, a `Finished` report appears in the same step, and no later report
  names that incarnation (Actors I29, I36).
- **`persist.ts:104`:** a `Now` record write is deferred. A law catches it: a step that ends an incarnation or
  removes a record writes that key in the same step's batch, judged from the store's `Wrote` facts (WriteAhead I20).

**Generated scripts.** Generated runs have no goldens, so the oracles judge alone. The 44 mutants that only the
model notices fall into seven families. Each has a replacement that predicts nothing (mutant sites are under
`src/core/`):

- **Endings never delivered or closed:** `ledger.ts:126,141,180,233,241`, `serve.ts:133,177,255`,
  `persist.ts:172`.
  - Conservation law: every `Ended` for an actor that is live at quiescence is `Delivered`, `Parked` or
    `Recorded` exactly once (WriteLanes I15, I16, I27).
  - Quiescence means the world is settled and no timer is due.
- **Schedule firing:** `serve.ts:240-243`, `turn.ts:268` ×2, `incarnations.ts:58` ×2.
  - A relation over observed `Turn` reports and `Compiled`: entering S at t arms S's schedules, and a firing
    comes at t+d unless an exit is reported first (Turn I12, I20, I21).
- **Exact head or ticket choice:** `lane-moves.ts:314,321,323,324`, `evidence-of.ts:98` ×2, `answers.ts:37` ×2,
  `answers.ts:49`, `ledger.ts:162`.
  - The step relation: the lane cell `(phase before, cue, phase after)` must be a Spec table row, read through
    a test-only projection of `World`.
- **Lane keys and ownership:** `lanes.ts:30` ×2, `lanes.ts:40`, `serve.ts:70`, `tx.ts:157`.
  - Trace law: a keyed operation's `Minted` key equals the key fields of the driven payload.
  - A goal for `attempt-identity`: lanes of different actors never share a head.
- **Records and persistence:** `lanes.ts:123`, `record.ts:131`, `tx.ts:127`.
  - Store law plus the reload relation: after quiescence, a reload yields the same snapshot (WriteAhead I21).
- **Disposal and grace:** `incarnations.ts:199,229,261,262`, `step.ts:53`.
  - Clock law: a released, idle actor `Finished` at grace ms.
  - A disposing runtime ends in at most 5,000 ms (Actors I35).
- **Budgets, verdicts and routing:** `turn.ts:168,182`, `serve.ts:126` ×2.
  - Retry law: server sends per Attempt are at most 1 + times.
  - Guards: a fixture guard is a function of what the suite knows (R20), so the suite evaluates it and checks
    the chosen alternative.
  - Owner routing at `serve.ts:126` (Turn I26): a relation over the static state tree.

**What only exact prediction catches.** The class the brief worried about: a self-consistent but wrong choice,
such as the wrong attempt's ending or the wrong ticket. It is exactly the "exact head or ticket choice" row. These
mutants need a judge that knows which output is right, but the judge does not have to carry predicted state. With
the core's before-state as its input, the Spec table decides the after-state for each step. That is refinement
checking against an abstraction function (Abadi and Lamport, 1991), and it is the same shape a linearizability
checker gives a sequential spec: a step relation, not a second executor.

**The sidecars agree on the remainder:**

- of the 157 invariant pairs that T18 to T57 touch, 123 are plain trace predicates and 24 need hidden state;
- 9 need a table or a precedence: WriteLanes I10, I17, I24; Restore I19, I20; Turn I2, I26; Actors I42;
- the blind sidecar found one rule that needs a true predicting reducer: Reads I15, optimistic `Visible`. It is
  unbuilt.

## 3. The design

### Layers

- **G, Spec goldens.**
  - Judges exact outputs: the hand cases, and exhaustive finite tables (lane cell × cue, `admit`, Diagnostics
    classes, codec bounds).
  - Source: Spec text, written without running code (R5).
  - Runs on the 78 hand cases, and each slice adds more.
- **T, trace laws.**
  - Judges safety (conservation, order, identity, no effect after a stop) and progress (a verdict per event, live
    after ensure, delivered by quiescence).
  - Source: one cited Spec sentence per law.
  - Runs on every run: hand, generated, crash and regressions.
- **S, the step relation.**
  - Judges which table cell each step took, for the lane, delivery and life tables.
  - Source: the Spec tables as data, each row citing its cell.
  - Runs on every run, through a test-only `World` projection.
- **M, relations between runs.**
  - Judges agreement where the Spec requires it: crash at k plus reload against no crash; same seed, same output;
    batching and capture interval; key-field order; the liar swap.
  - Source: the Spec's equivalence clauses.
  - Runs on the generated corpus and the hand cases.
- **The bar.**
  - The core-mutant score on each corpus, with every survivor triaged by root to a Task.
  - Source: the operator mutator (`runner/mutate.ts`) and the hand mutants.
  - Checked at each step's end.

**No judge may become a runtime.** A judge may fold observed facts (counts, seen ids, the last reported state). It
may never compute a value the core computes, carry a predicted phase or owed set across steps, or import `src/`
or the frozen model. A lint enforces the imports. A judge stays only while it kills a mutant that no other judge
kills, so the bar prunes as well as gates.

**The projection seam.** The step relation and the R-class invariants need state the reports do not carry: kept
rows, owed rows, head phase and activation liveness. WriteLanes I34 and I37 keep that state out of the reports.
The seam is one read-only, test-only function from `World` to Spec vocabulary, beside `src/host/testing.ts`. It is
small and Spec-named, and the CLI inspection work can reuse it. This is a deliberate exception to Conformance R1,
which allows the Port only (decision Q2).

### What happens to each piece

- **Kept as is:**
  - the 5 trace oracles, replay, crash mode, field-order, the bench fingerprint, and the liar gate on production;
  - the world, script Schema, player, shrinker, regressions and soak (the shrinker never used the belief:
    `parts/shrink.ts:69-80`).
- **Kept and unfrozen:** the 78 hand cases and their goldens, now the primary layer for exact outputs.
- **Kept as a labelled change detector:** the `baseline.tsv` digests, gating only steps that claim no behaviour
  change.
- **Converted:**
  - the 9 prediction oracles become T and S laws, one at a time, each at mutation parity on both corpora;
  - the owed lists shrink to one list keyed by (Invariant or core mutant, Task), since fewer judges need fewer
    excuses.
- **Frozen:**
  - the `dsl/lifecycle-rules.ts` tables, as `spec-tables` data: the S relation's input and the cell-reach
    denominator;
  - the rest of the Spec model (step, fold, lanes, lives, owed, capture, compare, expect): never edited again,
    deleted at parity.
- **Deleted:**
  - `turn/anchor.ts`, `predict.ts`, `credits.ts`, `judge.ts`, `late.ts` and `phases.ts`, with the selection and
    schedules oracles; routing becomes a relation over `Compiled`;
  - the `dsl/*.traces.ts` files, which run on the model, plus `held-traces.tsv` and the redundancy gate; the
    traces that record a ruling become goldens on the core first;
  - `parts/belief.ts` and the thin check, replaced by generate-while-playing and the reach floor (section 4);
  - the `fixtures/handlers.ts` handler tables; guards are evaluated from the fixture's own guard code (R20);
  - the model mutation gate (328 fields) and `model-owes.ts`, with the model;
  - round-14: `adapters/prototype*`, `limits*`, `limited-mutants*`, the prototype catch matrix and sweep, and
    liar-prototype.

### Proposed Spec edits (Conformance; all proposed)

- **R15:** drop "run on production and the Spec model", the "four readers" (the reader that computes expected
  results goes), and "Hand cases freeze". Add: scripts are generated by playing the core and saved as JSON; replay
  needs no generator; expected results come from goldens, trace laws and the Spec tables.
- **R19:** replace "the Spec model computes expected results" with "the Spec tables judge steps". The tables are
  data, each row citing a Spec cell, and are checked as `(before, cue, after)` over the projection. No state is
  carried between steps, and a row no mutant needs is deleted.
- **R20:** keep "obligations read suite facts only" for trace laws. Drop the expect and compare split.
- **New rule, judges are relations:** the import fence, no carried predicted state, and a judge that kills no
  unique mutant is deleted.
- **R6, R10:** "for each implementation under test" becomes "for the production core". The core-mutant score on
  both corpora is the bar, and a drop fails.
- **R2, R7, R11, R14, R16, R21, R22:** these state two implementations or two suites. R2, R11 and R22 go. R7 keeps
  the null runtime as a control (a null must fail every case). R14 drops the prototype row. R16 drops per-runtime
  adapters. R21 keeps the liar swap on production.
- **Invariants:**
  - drop I4, I29, I30, I36 (the prototype part), I39, I47 (the model reader), I48, I59, I60, I61, I64, I66;
  - reword I12;
  - fix I52's mis-citation: the held-out gate cites it (`runner/parts-gates.ts:118`), but I52 is about declared
    codes.
- **Epic slice template:** "suite half green on the model, mutant-proven by model mutation, before the production
  half" becomes "goldens and laws written from the Spec, red on the parent, then the production half".

## 4. Generation without a belief

**Today.** `parts/generate.ts:335-410` draws each move from the belief's guess at open requests, armed timers and
the leaf (`parts/belief.ts`, 369 lines, imported only there). A wrong guess skips answers, and the thin check
(`parts/play.ts:288-309`) flags scripts where more than half the answers missed.

**Proposed: generate while playing.** One loop holds the RNG, `hashOf(id/seed)` as today, and the live case:

1. **Answers** are drawn from the world's own open requests (`world/network.ts`), a uniform pick rather than the
   oldest. The world is suite code recording what the core sent, so no core rule is copied.
2. **User actions** come from the part's user model for the leaf in the public snapshot (`Snapshot.Live.state`).
3. **World moves** stay as today: reload, advance by think time, drop or land batches, dispose.
4. **Each drawn move is applied, then appended** to the script. The output is the same `Script` JSON
   (`dsl/script.ts:80-88`), so the player, shrinker and regressions need no change.

**The properties the brief asks for:**

- **Reproducible:** a seed plus the core's revision reproduces a script. Kept regressions are JSON, so they survive
  core changes; they never depend on regenerating.
- **Held out:** seeds 101 to 112 stay untuned. A core that stops sending a request no longer gets answer steps for
  it, but the progress and conservation laws catch that at quiescence. That was the gap the sidecar raised: the
  thin check is blind to under-generation (`answers = 0`).
- **Shrinkable:** unchanged, since shrinking replays saved steps.
- **Mutation runs:** two passes. Replay the corpus generated on the parent, where steps that no longer apply skip
  as today (`dsl/script.ts:145-149`). Then regenerate on the mutant to find more.
- **Diverse:** uniform answer choice, timer jitter of -1, 0 and +1 ms, payload pools, and guidance by reach. The S
  relation names the Spec cell of every step, so the generator can favour moves toward cells and cell pairs not
  yet reached.

**What replaces the thin check:** a reach floor. Per profile, the corpus must reach a committed set of Spec cells
and cell pairs (`cell-pairs.production.txt` already records the pairs). A drop fails, and a newly reached cell is
added by a recording run. That measures what thinness stood in for, without guessing at open requests.

**Conformance R15's identical scripts across runtimes** no longer applies: there is one runtime. Null-runtime
controls run on hand cases only.

## 5. What stays honest

- **Laws are written from the Spec sentence they cite,** before the author reads the core code for that rule. A law
  is accepted only when it passes the unedited core and kills at least one mutant no other judge kills.
- **Hand goldens are derived from the Spec without running anything (R5).** The step relation's tables are Spec
  data with a cell citation per row, and a disagreement with the core is a Spec question, settled before either
  changes.
- **The bar is the core-mutant score on two corpora:** hand cases, today 78/114 killed, and generated scripts,
  today 85/114 noticed. Survivors are triaged by root and owner. The operator mutator is generic, so the bar does
  not depend on hand-written mutants that know the judges.
- **Relations compare the core with itself only where the Spec says two runs must agree.** Determinism and
  round-trips are not counted as correctness evidence: they catch no deterministic wrong choice.
- **The liar gate** feeds the parent build's reports to the mutant, which keeps judges honest about world facts
  rather than confessions.

## 6. Migration

1. **Now, before T54 resumes (2 to 3 builder hours).**
   - Freeze the model and the belief: no more edits to either.
   - Add the generated-corpus core-mutant mode. It is the scratch probe made real: one signature per script,
     compared with the control.
   - Record the bar: hand 78, generated 85.
   - Land the two progress laws and the two laws for the lost mutants (`incarnations.ts:229`, `persist.ts:104`).
2. **T54 A3, in flight (1 to 2 hours over plan).**
   - Commit the six gate files, as the resume note says.
   - Finish X-8, A-14 and A-15. A-14 and A-15 are already relations, and X-8 is a store law.
   - When a frozen model oracle disagrees with a Spec-correct change, **convert that oracle** to laws at parity
     instead of editing the model.
   - The adopted-routing anchor commit is that case: write the routing ruling as goldens and convert `selection`,
     rather than editing `turn/anchor.ts`.
3. **Before T18 (10 to 14 hours).**
   - Convert `delivered-once` and `lane-queue` to the conservation law and the lane-cell S relation. The
     projection seam lands here.
   - Convert `schedules`, `disposal`, `retry-count` and `idle-guard` to clock and relation laws.
   - Hold parity on both corpora throughout.
   - Generate while playing, and delete the belief and the thin check.
   - Retire round-14, with its 5 gates and limits.
   - Make the Spec edits.
4. **T18, T55, T19 and T20 (a saving).**
   - Each slice writes goldens, laws and table rows from its Spec change, red on the parent, then the production
     half.
   - There is no model section, no belief and no second runtime to update. That saves the A2-type catch-up,
     about 2 hours per core step at T54's rate.
5. **After T20 (2 to 3 hours).**
   - Delete the frozen model, the predictors, the handler tables, model mutation and the model's traces.
   - Shrink the owed lists to one keyed list.

**Work never stops for long.** Every conversion lands behind parity on both corpora, so the suite never loses
strength mid-way. The largest block (before T18) splits by oracle into commits of 1 to 2 hours each.

## 7. Decisions for the user

**Q1. Retire the predicting Spec model?**

- **A (recommended):** freeze now, convert on touch, delete at parity. Before: each core change edits the model.
  After: each disagreement retires model code.
- **B:** keep the frozen model as a permanent shadow judge.
- **C:** keep the model as is.

**Q2. The projection seam for the step relation and hidden-state laws?**

- **A (recommended):** one read-only, test-only `World` projection to Spec vocabulary. Before: R1, Port only, with
  the model inferring hidden state. After: R1 plus one named seam.
- **B:** new report kinds, against WriteLanes I34 and I37.
- **C:** no seam, which leaves about 10 exact-choice mutants and 24 invariant pairs to goldens only.

**Q3. Generation?**

- **A (recommended):** generate while playing, from the world and the public snapshot; the reach floor replaces
  the thin check.
- **B:** the Spec model steers the generator (the prior proposal's item 2), which keeps the model alive.
- **C:** keep the belief.

**Q4. Round-14?**

- **A (recommended):** retire before T18, with the core-mutant bar in place of the prototype mutants.
- **B:** retire at T53 as planned, which keeps 5 gates and limits upkeep through four slices.

**Q5. Hand cases?**

- **A (recommended):** unfreeze. Goldens become the exact-output layer, each derived from the Spec, plus
  exhaustive finite tables.
- **B:** keep R15's freeze, and lean on the S relation for exact outputs.

**Q6. The bar?**

- **A (recommended):** no drop in the core-mutant score on either corpus, and every survivor triaged to a Task.
- **B:** a fixed percentage threshold.

## Appendix A: experiments (scratch, reproducible)

- **Copy.** A scratch copy of the package and working tree, with `wiki/` linked read-only. In `suite.ts`,
  `EXP_KEEP` filters the `oracles` list only, so mutants stay registered.
- **Hand cases.** `mutate --limit 120 --parallel 6` gave 76/114 with 5 oracles, against 78/114 recorded with 14.
  The only diffs are `incarnations.ts:229` and `persist.ts:104`.
- **Hand mutants.** `falsify --runtime production --sweep` left 18/18 red on some case with the 5 oracles.
- **Liar.** `liar --runtime production` gave 13/13 with the 5 oracles.
- **Generated scripts.** A probe plays the 312 gate and held-out scripts with no owed rows and prints `signatureOf`
  for each. A mutant counts as noticed when any signature differs from the unedited control under the same oracle
  set. Controls: all pass with 5 oracles; 29 owed reds with 14 (26 `lane-queue` WriteLanes I12, owed to T19).
- **Progress laws.** About 40 lines; a third law, "an answer is heard in its step", was dropped as wrong-strict.
  Control green on 312 scripts and the 79 hand cases. Result 41/114.
- **Not measured:** crash mode and the class gate under trace-only oracles, and the seven family replacements in
  section 2, none of which has a scratch implementation. Each conversion must measure its own parity.
- **Where the files are:** the scratch harness is `gen-mutants.ts`, `gen-prog.ts`, `exp-probe.ts` and
  `exp-progress.ts`. The results are `gen-result-full-vs-trace.tsv`, `gen-result-prog.tsv` and `trace-only.tsv`,
  in the session scratchpad. The scratchpad is not durable, so the numbers above are the record.

## Appendix B: sidecar log

Six Haiku sidecars ran at effort high. I re-read every cited line I used and re-ran the counts.

**1. Inventory**

- 233 files: 9 trace, 45 prediction, 29 goldens, 6 second runtime, 144 tooling; 14 oracles, 5 trace and 9 model.
  - **Accepted:** I checked the registry split at `suite.ts:72-107` and recomputed the line counts.
  - **Changed:** goldens are a fifth class.
- `openCase` defaults to the model (`dsl/case.ts:209`), so removing the model touches the engine, not only the
  oracles.
  - **Accepted:** the migration converts the oracles first and deletes the engine path last.

**2. Mutants**

- 78 killed, 28 survived, 8 NO-ORACLE; only the first killer is recorded (`mutate.ts:81-87`).
  - **Accepted:** recounted from `core-mutants.tsv`.
- "70 of 78 killed only by prediction."
  - **Changed:** 24 of the 70 are `eq` goldens (`case.ts:366`), not model kills. Measured directly, 2 are lost.
- The catch sweep and catch matrix cover hand mutants, not core ones.
  - **Accepted.**

**3. Prior art**

- Refinement-style partial models: `codebases/db/.../leadership-replay-oracle.property.test.ts:35-38` calls itself
  "a partial relational oracle, not a second executor". Also: calibrate laws with named wrong outputs, and make
  non-checks fail.
  - **Accepted:** I re-read the cited line. The published citations are from memory and unverified, so only
    Abadi and Lamport and the linearizability framing are used.

**4. Generator**

- The belief is imported only by `parts/generate.ts`; the shrinker is independent; the thin check is at
  `play.ts:288-309`; held-out is seeds 101 to 112, not `held-traces.tsv`.
  - **Accepted:** all re-read.
- Asking the core which requests are open is circular, and blinds held-out and the thin check.
  - **Changed:** the design reads the world and the public snapshot, never core state. The circularity it
    named is answered by progress laws at quiescence.
- The held-out gate mis-cites I52.
  - **Accepted:** `parts-gates.ts:118` checked against `Conformance.spec:831-832`; listed as a Spec edit.

**5. Spec and Tasks**

- 23 rules and 67 invariants classified. Of the 157 invariant pairs for T18 to T57: 123 trace, 24 replay,
  9 model, 1 both.
  - **Accepted as advisory:** the Spec edits list was built from it after I re-read R5, R6, R15 and R19 to R22.
- WriteAhead I20 to I24 ownership overlaps between T54 and T19 (`owes.ts:67,124`); T54's header still shows the
  done T61 as a blocker.
  - **Accepted as noted:** out of scope here.

**6. Blind**

- It independently designed T, M and G layers, plus a mutation gate and an import fence. It found 1 rule that
  needs a reducer: Reads I15.
  - **Accepted:** it converges with this design. Reads I15 is the first candidate for a small frozen reducer
    when optimism is built.
- 9 divergences between the core and the Spec, among them late routing from root (`turn.ts:362-367`), the mail
  cap (`serve.ts:260`) and the guard `false` path (`turn.ts:182`).
  - **Changed:** the lines exist, but Turn I26 and I27 are owed rows (`owes.ts:172,222`), so these are mostly
    known gaps, not hidden bugs. The rest were not judged here.
- `step` returns `{ world, commands, evidence }`.
  - **Accepted:** `src/core/world.ts:299-307`.
