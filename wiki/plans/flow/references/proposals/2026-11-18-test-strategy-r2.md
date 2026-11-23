---
proposal test-strategy-r2
status proposed 2026-11-18
description Proposes one cheap exhaustive core plus generation aimed at where bugs come from, dropping same-path replays.
---
# Test strategy, revision 2: most correctness per second

**Bottom line:** keep one cheap, exhaustive core and spend the rest on generation aimed at where bugs come from.
Replays of the same paths go.

**Target strategy:**

- One rule checker over every run: the 19 run rules, plus a crafted breach case for each rule.
- Hand Stories for decided outcomes.
- One merged reload pass over the rest Stories: three modes, every position, the double and triple reload checks
  folded in as a rule.
- A pair sweep that stops at the reachable phases. Measured: 107 s to 5.6 s, same verdicts.
- Generated Stories with reloads in the default tier.
- Three new targeted properties: Schema-derived values, context-order equivalence, phase-aimed drives.

**Cuts:**

- The stress reload sweep (391 s of file time).
- The double-reload shards (70 s).
- CLI runs of every Story (about 35 s).
- The deep files, which move to stress.

**Expected times:** the suite falls from 54 s to about 24 s wall, and to about 17 s once the reload pass forks from a
cut. Stress falls from 65 s to about 30 s. Faults stays about 4 to 5 minutes, without timeouts.

Every item below is proposed. This file supersedes nothing: the first proposal,
@review.test-efficacy, stays as prior art.

**Why now:** the user asked for a deeper cut, focused on testing strategy for the most impact on correctness
(@task.V3.T83).

**Read first:** @review.test-efficacy (the kill matrix and its
method).

**Risk:** the planted-fault sample covers 71 of 255 faults, and the stress tier was not in the matrix. Every cut
below names the bug class it gives up.

## 1. Where the bugs come from

The evidence for this section is the Task records and git: 34 runtime bugs fixed since the package began, each
with its finder.

| Area                                                              | Bugs | Found by                             |
| ----------------------------------------------------------------- | ---- | ------------------------------------ |
| Context (waves, reload replay, provider order)                    | 7    | review 5, generated 1, app mix 1     |
| Codec and value shapes (Date, NaN, Map, `-0`, `__proto__`, depth) | 6    | review 5, unknown 1                  |
| Actor lifetime and disposal                                       | 5    | review 2, hand 1, unknown 2          |
| Turn and schedules                                                | 5    | review 3, run rule on a hand Story 2 |
| Write-ahead                                                       | 4    | generated 2, hand 1, review 1        |
| Lane endings                                                      | 4    | review 3, generated 1                |
| Restore and reload                                                | 2    | review 1, unknown 1                  |
| Compile                                                           | 1    | review 1                             |

Findings:

- **Agent review found 19 of the 34.** It is the largest source of bugs and is not a test. Of those, 8 are
  value-shape bugs (codec rows, plus context replay of Date, NaN, Map and Option slots). A generator over the apps'
  own Schemas would find this class mechanically.
- **Generated Stories and the app mix found 5.** They are the only automated finders of interleavings nobody wrote.
- **The reload sweep, the double and triple reload, and the pair sweep have no fixed bug credited in the records.**
  The pair sweep holds one open red: T20's Acknowledging x storage refusal cell.
- **The kill matrix agrees.** Over 71 planted faults, the sweeps made 0 unique catches, and hand, `src/` and CLI
  tests made 20.
- **The sweeps do catch rare positions.** `landed-write-lost` breaks at 1 of about 7,500 variants and
  `queue-not-saved` at 2, and both are also caught by hand tests. Exhaustive positions are cheap insurance on short
  Stories. On long ones they are a replay of the same path.

## 2. Target strategy

The default suite has six layers, in order of cost:

1. **Static:** types and compile refusals. Free.
2. **Rules:** the 19 run rules, each with a crafted breaching run and a crafted clean run, plus rules once and
   another seed over every fixture Story.
3. **Examples:** hand Story tests, one per decided outcome, each run through `played` (rules, replay, disposal).
4. **Reload pass:** every rest Story, at every position, in three modes. The double and triple reload checks
   become a rule inside the abort mode's run.
5. **Exploration:**
   - generated Stories that include reloads and disposal, with shrinking;
   - the app mix;
   - the pair sweep, stopped at the reachable phases.
6. **Targeted properties:**
   - Schema-derived values: encode, decode, equality, and reload hears nothing new;
   - context-order equivalence;
   - phase-aimed drives.

The stress tier keeps scale: stress Stories once under the rules, with one reload at the end in each mode, plus the
generated stress seeds, the mix stress run and the deep values.

The faults run and the dead core stay as on-demand checks of the test tooling.

This is the Jepsen shape: random faults against the real system, and a checker over the recorded history, here the
run rules. Plus fast-check's model of fixed-count generation with shrinking, and XState's rule of stopping
exploration when the reachable set is exhausted. It needs no second model of the core.

## 3. Per strategy: what only it finds, and the call

Costs are file time from the alone run (default suite 443 s, stress 543 s).

- **Hand Story tests (16 s): keep, prune as in revision 1.**
  - Only they find: decided outcomes, meaning a specific ending, state or count that no rule states.
  - Revision 1 measured 12 unique catches, and the records credit them with 4 bugs.
  - Cost of the pruning: none.
- **Run rules (inside every run): keep; add 9 crafted breach cases.**
  - They carry the sweeps. Every sweep catch in the logs is a rule breach or a thrown run. The rules most often
    breached were WriteLanes I15, I27, I3 and I16, and WriteAhead I17 and I15.
  - The 9 rules with no crafted breach (revision 1, (c)) are unproven.
- **Rules once (2 s) and another world (10 s): keep the seed half, drop the ending-reload half.**
  - Rules once is the fastest broad net: 25 shared catches.
  - The "ended by a reload, every actor attached" half repeats the reload pass's end position in abort mode.
  - Cost: none, once the reload pass runs.
- **Reload sweep, rest (113 s): keep, merged.**
  - Only it finds a breach at a specific position: 11 of 30 catches were interior-only, and each mode had one catch
    of its own. Keep all three modes and every position.
  - Fork from a saved cut (T83 Q2). This saves the prefix only, about half, because the suffix after the reload must
    still run for the rules to see what the restored state does.
  - Cutting the sweep to the Stories with hold windows (30 of 137) lost 5 of 20 sweep catches in the logs, so no
    Story subset.
- **Double reload (70 s) and triple reload (4 s): merge into the reload pass.**
  - They find an onContext event invented by a reload (Actors R9, R19).
  - Proposed: in the abort mode, context Stories get two reloads in a row at each position. A new run rule checks
    that the second open hears no onContext turn the first open did not. That needs one run where the double check
    needs two.
  - Cost: the double check compares two whole runs, and the rule compares two opens in one run. They catch the same
    bug class but are not identical. A fault that changes what a later step does after one reload but not after two
    would be missed. Its 7 catches are all shared.
  - Saves about 60 s.
- **Pair sweep (107 s): keep, stopped at the reachable phases.**
  - Only it finds: every phase crossed with every fault, with the unreachable cells named.
  - Measured in a scratch copy: 15 tests, the same 2 known reds, the same phases found at the same seeds, 5.6 s file
    time against 107 s.
  - Cost: the 1,000 seeds no longer probe the forbidden phases, so a fault that opens a forbidden phase only after
    the last reachable one is found goes unseen. None of the 30 sampled catches did.
- **Generated Stories and shrinking (default about 6 s): keep, and add reloads.**
  - Only they find unscripted interleavings. They found 4 bugs.
  - Today's default `usual` profile draws no reload and no disposal (`src/host/testing/generate.ts:54-60`). Only the
    stress and mix profiles do.
  - Proposed: the default tier runs the mix-like profile on every sample set at 10 seeds; seeds are cheap.
- **App mix (13 s): keep.** Only it finds bugs across apps in one Runtime (Actors R18 provider binding).
- **Saved stress (1 s): keep.** It checks print and replay fidelity of a generated Story.
- **Deep (47 s): move to stress.**
  - Only it finds failures at 100,000-deep values (Codec R1).
  - Default-tier cost: a depth regression shows only in the stress run. The Schema-derived property keeps shallow
    nesting in the default tier.
- **CLI (40 s): simplify.**
  - Only it finds wrong CLI output: 4 unique catches.
  - Run `story run` and `trace` on one Story per fixture, and keep `story list` whole.
  - Cost: a printing bug specific to one Story's content. The CLI is a thin print over the same run.
- **Types and compile: keep.** Free.
- **Bench tests (16 s): keep the declarations; move `limits-hang` and `limits-signals` to the bench's own command.**
  - They test the bench runner, not the runtime, and fail under load.
- **Stress reload sweep (391 s): remove.**
  - It finds position-specific bugs in Stories of 100 to 4,000 steps. No catch or bug is recorded for it.
  - Replace it with: each stress Story once under the rules, plus one reload at its end in each mode, plus random
    reload positions from the stress generator.
  - Cost: exhaustive per-position coverage at scale. A bug that needs both scale and one exact position is found
    only if a seed lands there. Unmeasured: the stress tier was not in the matrix.
- **Generated stress, mix stress, other stress files (about 150 s): keep.** They are the scale and value-edge probes.
- **Faults run: keep, as an on-demand tooling check when the test tooling or rules change.**
  - Size copies times workers to the cores (4 x 3).
  - Fix `mayStayGreen` to use `it.fails`.
  - Only it finds: tooling that has stopped catching what it should.
- **Dead core: keep.** One whole run is the cheapest proof that every runtime test reads the runtime.

## 4. New checks worth adding

Each one targets a bug class from section 1. None needs a second model.

1. **Schema-derived values.**
   - For every Schema an app declares (memory, inputs, endings, context), generate values with Effect's Schema
     arbitrary (the installed `effect/testing` FastCheck, the same one Effect's own schema tests use at 200 runs).
   - Check that encode then decode gives an equal value. Check that a run that publishes the value, reloads and
     publishes it again hears no new onContext event and no second Published.
   - Target: the 8 value-shape bugs, all found by review.
2. **Context-order equivalence.**
   - The same providers and consumers, started in every order: diamond, provider late, consumer first, reload
     between. Each consumer's settled view and the number of its publishes must match.
   - Target: the context class, 7 bugs, the largest area.
3. **Phase-aimed drives.**
   - A generator Source that steers toward the missing phase (Held, Recapturing, Withdrawing) instead of a new
     random seed. Auth-session needs seed 955 to reach Held.
   - It makes the pair sweep's reach cheap and gives generation the rare phases.
4. **Crafted breach cases for the 9 untested run rules.** These prove each rule can fire.
5. **Optional, the user's call: a dispose mode for the reload pass.**
   - The Runtime is disposed at every position of the 30 hold-window Stories.
   - Target: actor lifetime, 5 bugs, which today's sweeps never probe. Cost: about 15 s.

## 5. Expected times

These are estimates from per-test file time. Wall time is about one eighth of file time on 12 cores; T83's last
alone run had 54 s wall against 432 s of file time.

| Command | Now                | After the cuts                                                    | After fork from a cut    |
| ------- | ------------------ | ----------------------------------------------------------------- | ------------------------ |
| Suite   | 54 s (443 s files) | about 24 s (about 195 s)                                          | about 17 s (about 140 s) |
| Stress  | 65 s (543 s files) | about 30 s (about 200 s; the palette shards' 22 s bound the wall) | same                     |
| Faults  | 256 s with reds    | about 4 to 5 min, no load timeouts                                | same                     |

Where the suite's file time goes:

- the pair sweep: 107 to 6 s, measured;
- the double and triple reload: 74 to about 10 s, the merged rule;
- the CLI: 40 to about 5 s;
- the deep files: 47 s, moved to stress;
- the bench-limit tests: 13 s, moved out;
- the new properties: about 15 s, added;
- the reload pass: 113 s, and about 57 s after the fork.

## 6. Order of work, as Tasks (proposed)

1. **Pair stop and CLI sample.** The pair stop is already measured. Also move the bench-limit tests out, size the
   faults copies and fix `mayStayGreen`. Small; no correctness cost except the one named in section 3.
2. **The 9 crafted breach cases.** They come before any merge, so the rules the merge relies on are proven.
3. **Merge double and triple into the reload pass,** with the new Actors R9/R19 rule. Proof: the faults those checks
   catch today are still caught.
4. **Default generation with reloads and disposal,** then the phase-aimed drive.
5. **Schema-derived values and context-order equivalence.** These are new test kinds; see section 7.
6. **Stress tier:**
   - First, measure the stress tier's kill matrix once, at 4 x 3.
   - Then remove the stress reload sweep and add the end reloads.
   - Then move the deep files to stress.
7. **Fork the reload pass from a saved cut.** Proof: both forms give the same verdicts over every Story before the
   replay form goes.
8. **Finish the kill matrix over the other 184 faults, at 4 x 3, once.** This validates the new suite.

## 7. What the user must decide

1. Remove the stress reload sweep (391 s), replaced by end reloads and generated positions. Recommended: yes, after
   step 6's stress measurement shows no unique catch.
2. Accept the double-reload merge as one-run rule semantics instead of two compared runs. Recommended: yes.
3. Move the deep files to stress. Recommended: yes.
4. Add Schema-derived values and context-order equivalence as test kinds. They are new test concepts under the
   Epic's "keep it simple". Recommended: yes; they target the two largest bug areas.
5. The optional dispose mode for the reload pass. Recommended: yes, over the hold-window Stories only.
6. Make the faults run an on-demand tooling check rather than a per-Task gate. Recommended: yes.

## Evidence and sidecar log

- **Measured this round,** in a scratch copy at 3 workers: the pair sweep stopped at the reachable phases gives 5.6 s
  file time and 3.8 s wall, against 107 s. The verdicts are the same, including both known reds, and every fixture
  found the same phases at the same seeds.
- **From the logs:**
  - Within the logged reload catches, a greedy cover needs 8 of the 137 rest Stories. That cover is fitted to these
    faults, so it is not used.
  - The hold-window subset keeps 15 of 20.
- **Sidecar on bug origins (accepted, changed).** Its table of 34 runtime and 6 tooling bugs comes from Task records
  and commit subjects.
  - Changed: 5 rows have no finder ("unknown"), and some fixes are not pinned to a commit.
  - Spot-checked: grep of the Task records finds no fixed bug credited to a reload sweep, and one line saying the
    reload sweeps missed one restore case (`wiki/tasks/V3/P3.task:760`).
- **Sidecar on the generator (accepted).** Checked `generate.ts:54-60`: the `usual` profile has no reload or
  disposal.
  - Reload modes appear only in the stress profile (abort, attached or unattached, and land) and in mix (abort).
  - `forget: true`, wire `lose` and storage `refuseLoad` are never generated, which is a gap to close in Task 4.
