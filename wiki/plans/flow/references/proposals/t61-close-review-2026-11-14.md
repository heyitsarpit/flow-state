# T61 close review, 153f8fc0..cc8b39d3 (2026-11-14)

**Verdict: PASS. T61 closes.** Each of the six acceptance items went red on a plant I ran and is green at
cc8b39d3. The 62 deleted held traces lost no ruling, Invariant, table kill or fold kill. I regenerated the fold
kills from scratch and they match `held-traces.tsv` byte for byte, with 38 survivors before and after. The 16
refusal cells are owned by T18 to T21, all open. The 73-to-71 bisect holds. Nothing blocks. Five
suite-machinery findings are proposed as owed rows below (T53 or revisit.md), and one record-edit finding goes
to the builder.

Review by an Opus reviewing lead, @task.V3.T61, at cc8b39d3 (HEAD is 96d9ab3b; the two later commits touch notes
only). Plants ran on scratch copies (`git archive` of cc8b39d3, and 8e8d93bd^ for the pre-deletion fold run).
The copies are deleted; no project file was changed.

## Gates at cc8b39d3

- `nub run check`: format, lint, types and plan coverage all clean, with zero warnings.
- `nub run conformance:checkpoint`: pass 5/5. Coverage 74 checked, 42 in part, 0 gaps; parts 129/129; held-out
  216/216; bench 10/10; class 437/437. These match the build log's `gates.json` diff.
- The ten test files behind the acceptance items: 62/62 (lifecycle, checkpoint, crash-owed, trace, signature,
  varied, soak, shrink, model-mutation, schedules). The full package suite: 55 files, 357/357.
- Not run: `nub run verify` end to end (docs:build). Its conformance part is the checkpoint above, chained with
  `&&` (`package.json` line 32).

## Acceptance, item by item (check-task)

| Item | Verdict | Plant I ran and its result |
| --- | --- | --- |
| `verify` runs the cheap gates and fails on a red one | PASS | I dropped one owed row (`PART-transfers-varied-4` lane-queue I12) on a copy. Checkpoint exit 1, `parts` fail 123/129 naming the script, class 436/437. |
| a kept regression saved as a pass is re-saved or deleted | PASS | I added a `by: "pass"` GEN regression on a copy. `regressions` exit 1: "saved as a pass, so it can never fail". |
| every crash red is named in the gate output with an owner | PASS | I dropped DISP-06@5's I15 row. Crash exit 1: "no row owes this red point". Unplanted, it passes with both points named as owed to T54. |
| a trace file shows input, expected, observed and any mismatch | PASS | `trace --case DISP-06 --crash 5`: 6 steps, each with input, expected and observed, plus 5 MISMATCH lines (I15 ×4, I29), with production on the wrong side. |
| the generator draws out-of-order answers and timing offsets, and reaches a new cell | PASS | Real tree: 51 out-of-order answers, and Pay advances of 7999, 8000 and 8001 ms. Varied and new-mix runs reach `A EndDefinite·Gone·other`, which no earlier run reaches. With offsets set to `[0]` and no later answers: 0 out-of-order answers, 8000 only, no new cell. |
| a soak shrinks each new failure and keeps one case per signature | PASS | I removed the `refused` triage. Soak at seeds 5000 to 5007 fails with "1 new signature" and writes one shrunk case (8 steps). The other 5 signatures stay KNOWN. |

## Checks 2 to 6

2. **The 62 deleted traces.**
   - I ran `fold-mutants` on both trees with `--parallel 2`, each under 290 s.
   - cc8b39d3: 161 of 198 mutants judged, 38 survived. Its tsv equals the committed one.
   - 8e8d93bd^ with the current writer: 160 judged, 38 survived, the same survivor list.
   - The one difference is m130. At 8e8d93bd^ a deleted trace makes the child throw, so m130 is unjudged. At
     cc8b39d3 58 kept traces kill it.
   - Of the 62 deleted traces: none is ruled, none alone refuses an Invariant, and none alone kills a fold key.
     The table survivors tests are green, so no table kill was lost.
   - Split: 48 are the old list's 50 zero-unique held traces. Two of those stay ("an id minted twice", "a commit
     that cannot encode declines"). The other 14 deleted came from outside that list.
   - Gate plant: I re-added the deleted "a mint outside a turn" with its real (empty) fold kills, and the gate
     fails "redundant". Given a unique key `m999`, the gate keeps it.
   - The gate does not notice a lost kill when a trace is deleted (owed row O1).
3. **The 16 re-owned cells (60ec3e97).**
   - 8 Send cells go to T18; 6 step-end cells to T19; `tableC.Reload.Delivering.always` to T20;
     `tableB.Idle.Cancel.none` to T21.
   - The owners are set by row in `suiteOwner`, with the reason in its doc comment and in the commit.
     `model-mutation.test.ts` asserts that nothing is owed to T61, and no owed row names T61.
   - T18 to T21 are open (draft).
4. **The 73-to-71 bisect is true.** I counted the unnoticed lists:
   - 254 unnoticed at 7aaca19f^ and at 7aaca19f (the swap is net zero);
   - 258 at 39d125bb, with the four `Maybe.always` cells added (69);
   - 256 at 0358b16a, with `tableA.StepEnds.Interrupted.stoppable` and `tableC.StepEnds.Owed.live` noticed (71).
   - 73 at the base comes from the log, not a re-run. At 0d8e69f7 (= 1fa04e5c^) the list lived in
     `model-mutation.ts`, not `model-owes.ts`.
5. **The fold-mutants runner (5c131336) against R15.**
   - It mutates copies only, removes them (`acquireRelease`), and bounds each child to 120 s. It builds nothing
     parallel to Effect.
   - Its gaps are owed row O3: crashes are dropped silently, `lifecycle-fold.ts` yields no flips, and the
     commit's "killed by every trace" is wrong.
6. **Standing angles.**
   - No `throw` was added; `src/` is untouched in the range.
   - No new outside reads. The runner scratch defaults to `tmpdir()`, as before.
   - The one Effect parallel: `trace.ts` sets its case deadline with `Date.now`, where `run.ts` reads `Clock` (O4).
   - The hook is wired (`.claude/settings.json`, PreToolUse on Bash). The build log's one `sed -i` predates it and
     hit a scratch file.
   - Record edits: 4444e57d changed Task text in P11 to P14 (`not-yet.ts` to `owes.ts`) with its `Edit (agent:
     …)` line only in the commit message. The Records rule wants a comment on each edited Task; the builder adds
     them.
   - Spec edits are labelled in spec-log. The Epic's new instruction lines carry the Epic's own source and
     reverse notes and are the orchestrator's.

## Proposed owed rows (not landed; the orchestrator lands them)

- **O1 (T53):** the redundancy gate ignores tsv rows that match no trace. Deleting the sole killer of m100 ("an
  unretained unknown whose ending closes unheard owes its release at once") leaves `lifecycle.test.ts` at 12/12.
  Fail on an orphan row, or on an orphan's keys that no kept trace kills.
- **O2 (T53):** fold kills have no freshness check. Keys are list positions, and nothing fingerprints the fold
  files or the mutant list, so a fold edit leaves the gate green on stale kills. Store a hash in the tsv and fail
  on a mismatch.
- **O3 (T53):** in `fold-mutants`:
  - a crashing or timed-out mutant is dropped unjudged (37 of 198 at cc8b39d3);
  - `--limit` still rewrites the whole tsv;
  - the mode never exits non-zero;
  - `lifecycle-fold.ts` gets no flips;
  - the tsv is decoded by hand, so a doubled name collapses.

  Count a crash as a kill by the trace that throws, refuse a partial write, and decode the tsv with Schema.
- **O4 (revisit.md):** `trace.ts#tracedScenario` should read `Clock` as `run.ts` does, not `Date.now`.
- **O5 (revisit.md):** `suiteOwner`'s last branch sends any other unforgeable cell to T18 instead of failing.
  Today all 16 cells match an area.

## Process note

My plants used shell redirects for logs and two scratch data files, with no project file touched. The Write-only
rule was not kept there.

## Sidecar log

| Sidecar | Item | Result |
| --- | --- | --- |
| blind (R15 and leverage items 1-4) | greedy cover never drops a unique kill | accepted; plant B keeps a unique-key trace |
| blind | a missing tsv row is reported stale | accepted; runs in `nub run test`, not the checkpoint |
| blind | orphan tsv rows ignored | accepted; plant C confirms, O1 |
| blind | stale kills after a fold edit go unseen | accepted, O2 |
| blind | crashing mutants dropped silently; partial runs overwrite the tsv | accepted; 37/198 unjudged and m130 replayed, O3 |
| blind | duplicate names collapse in the Map | accepted (none today), folded into O3 |
| blind | checkpoint fails on red, no verdict, timeout | accepted; red plant confirms |
| blind | a defect escapes `catchTag` | rejected: verify still fails non-zero |
| blind | the 280 s bound contradicts "about a minute" | rejected: a ceiling, not the measured time |
| blind | signatures coarse; shrinker; mkdtemp; tsv facts; nothing faked | accepted (signatures: known M1, fixed 319e4d99) |
| fold-mutants | `lifecycle-fold.ts` yields 0 flips | accepted; re-counted 107/51/40/0, O3 |
| fold-mutants | six operators only; no type check; equivalents unfiltered | accepted, low; no pin from them |
| fold-mutants | the commit's "38 crash: killed by every trace" contradicts the code | accepted, O3 |
| fold-mutants | the `length === 1` pin rule is unsafe for joint deletion | rejected: 8e8d93bd decides by greedy cover; `unique` only prints |
| fold-mutants | tsv count format; nothing reads it; 57 vs 64 | rejected: superseded at 8e8d93bd |
| fold-mutants | the whole mode is unbounded (hours) | rejected: measured under 290 s at parallel 2 |
| fold-mutants | copies only, cleanup, child bound, no Effect parallel | accepted; scratch dirs empty after runs |
| fold-mutants | malformed child output is a defect, not dropped | accepted, low |
| cells and bisect | 16 = 8 T18 + 6 T19 + 1 T20 + 1 T21; none T61's; owners open | accepted |
| cells and bisect | reasons only in the doc comment and commit | accepted; enough |
| cells and bisect | the fallback owner for other cells | changed: the catch-all T18 branch, O5 |
| cells and bisect | counts 73, 73, 69, 71 | accepted |
| cells and bisect | `model-owes.ts` absent at the base | changed: the list lived in `model-mutation.ts`; the number holds |
| standing angles | P11-P14 Task edits without a Task-comment label | accepted; builder to add |
| standing angles | Epic instruction lines unlabelled | changed: orchestrator lines with the Epic's own attribution |
| standing angles | proposals, revisit and log entries unlabelled | rejected: the rule covers Specs, Plans and Tasks |
| standing angles | `trace.ts` deadline via `Date.now` | accepted, O4 |
| standing angles | hand-built tsv codec | accepted, folded into O3 |
| standing angles | `RETURN_TYPE:` comment; Task ids in suite comments | rejected: the suite's lint-required and existing conventions |
| standing angles | no throws, no outside reads, hook wired, one pre-hook scratch `sed -i` | accepted |
