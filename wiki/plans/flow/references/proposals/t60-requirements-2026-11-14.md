# T60 requirements (2026-11-14)

The checks @task.V3.T60 is built against, one per acceptance and Approach item of the reduced scope (the user,
2026-11-14). Design of record: code:wiki/plans/flow/references/proposals/suite-convergence-2026-11-14.md (M1, M3
for the parts gates, M4). Each: rule; source; check; the wrong build it catches. Step 0 (3cfbfc08) built Q1 to Q3.

## Requirements

- **Q1 Exact excuses (Approach 1).** An owed row excuses only its exact items: an Attempt, or for a break with no
  Attempt the refusal's subject at its step. Source: M5's item rule, the 2e findings. Check: `parts/owed.test.ts`
  class gate, the listed-subject plant. Wrong build: an item matched by subject alone (red at 3cfbfc08 with the step
  ignored, planted and restored).
- **Q2 Planted faults fail (acceptance 1, Approach 3).** A planted break on a fresh Attempt, a fresh lane, a listed
  subject at another step, or a listed Attempt under another Invariant fails a gate, in every script the suite plays
  (every build and held-out seed, and the kept regressions). Source: M1. Check: `parts/owed.test.ts` "a planted
  break". Wrong build: a row that excuses more than it names.
- **Q3 Excuses still fail (acceptance 2, Approach 2).** An item that no longer breaks, and a row whose owner Task is
  not open, are gate faults. Source: N8, M5. Check: `parts/owed.test.ts` "an owed item that stops breaking".
  Wrong build: a row held by any one of its items.
- **Q4 The parts gate plays every owed script (Approach 4).** `partsGateScripts()` holds every script an owed part
  row names, at its own seed. Source: M3 for the parts gates; re-check 2 (seeds 7 to 12). Check:
  `parts/gates.test.ts`. Wrong build: owed scripts past the gate's seeds judged only by a vitest check.
- **Q5 The sweep runs at every checkpoint (Approach 3).** The planted-fault sweep is a machine gate (`class-gate`)
  in the checkpoint gate list, and runs in under four minutes. Source: M1. Check: `runner/caught.test.ts` reads the
  gate list. Wrong build: a sweep only under vitest.
- **Q6 Structured verdicts (Approach 5).** A failed run's verdict carries each violation as fields (check,
  Invariant, subject, step) beside its cites; `why` is display only. Source: M4, Spec I43. Check:
  `runner/caught.test.ts`: a run failed by a planted oracle carries that violation. Wrong build: fields parsed from
  `why`.
- **Q7 One caught rule (acceptance 3, Approach 5).** `caught(key, verdict)` decides "caught" from the fields
  alone: an exact check and Invariant (`WriteLanes I1` never matches `WriteLanes I15`), a case's declared cite, never
  a Timeout or a defect; falsify, liar, probes, mutate and kills call it, and no module under `runner/` or `parts/`
  reads `why` to decide a catch. Source: G5, M4. Check: `runner/caught.test.ts` (the predicate's cases, and a source
  walk). Wrong build: a substring match; the liar counting any Fail.
- **Q8 Counts kept (acceptance 4).** Falsify on production and round-14, liar and the catch matrices keep their
  counts, or each change is explained in the step comment. Source: acceptance 4. Check: the gates at each step;
  evidence only.

## Acceptance proofs (for the close review)

| Acceptance                                   | Check                                                     | Planted violation                       |
| -------------------------------------------- | --------------------------------------------------------- | --------------------------------------- |
| 1 a planted lost ending fails a gate         | `class-gate` (268/268) and `parts/owed.test.ts` sweep     | step-blind item rule lets a plant pass  |
| 2 stopped or done-owner excuse fails a gate  | `parts/owed.test.ts` "an owed item that stops breaking"   | an item at step 999; an empty open set  |
| 3 one caught function; liar and probes use it | `runner/caught.test.ts` (predicate, source walk, sites)   | `I1` against `I15`; crossed pair; defect |
| 4 counts kept or explained                   | falsify 154/154 and 18/18, liar 125/126 and 13/13, matrix | see below                               |

Changes under acceptance 4: liar round-14 drops `turn.root-first`, whose only red was a defect (`PAY-04`:
`NoHeldRequest`), which the one rule never counts (G5); pending probes count any failed case, never a Timeout,
since a pending probe watches a behaviour (an uncited `PAY-08` expectation), not a catch; the parts gate plays 77
scripts (the owed ones past seed 6 added). Catch matrices unchanged.

## Cut or routed

- N9 (owed scripts skip the skipped-answers rule): 26 owed scripts are thin because production's owed bugs leave
  answers unopened; not in the reduced acceptance, so a pending check routed to revisit.md's suite items.
- The adversary (T52 item 2) keeps its draft; its forgeries already match structured violations at the forged step.

## Mapping

| Task item                                        | Requirement |
| ------------------------------------------------ | ----------- |
| Acceptance 1 (planted lost ending fails a gate)  | Q2          |
| Acceptance 2 (stops failing, owner done)         | Q3          |
| Acceptance 3 (one caught function; liar, probes) | Q7          |
| Acceptance 4 (counts kept or explained)          | Q8          |
| Approach 1 (exact subject)                       | Q1          |
| Approach 2 (every item still fails)              | Q3          |
| Approach 3 (sweep at every checkpoint)           | Q2, Q5      |
| Approach 4 (parts gate plays every owed script)  | Q4          |
| Approach 5 (structured verdicts, one caught)     | Q6, Q7      |
