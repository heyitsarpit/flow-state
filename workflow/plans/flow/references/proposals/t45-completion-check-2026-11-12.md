# Completion check: T45 fixes, 86f184b7 to 3a2db980 (2026-11-12)

Verdict: **PASS. T45 can close.** K1 and S1, S3 to S5, S7, S9 and S10 are fixed in the code, and every acceptance
item is met as amended. Gates ran at a39c2f52, and nothing after it changes code. Of the four parts left as they
were, the turn's `to` fallback and the `twice` deletion are sound. S2 is a real limit that no current run reaches.
The `mint-key-lies` row is not a hole of its own, but its mutant never reaches the path it names. Three small
follow-ups below need an owner; none blocks T45. The crash total of 1523 was a counting artefact, and no runs were
lost.

**Checked:** `git diff d8cf11e3 3a2db980`, @task.V3.T45's amended acceptance and its 2026-11-12 comments, the last
`log.task` notes, @spec.Conformance R19, R20, R22 and I36, and `skill:policy-testing#audit-a-suite`. Paths are under
`packages/flow-state-v3/conformance/` at 3a2db980. Nothing was run except read-only `git` and `workflow` commands.
HEAD is now b6471508 (T51), so every line cited here was read with `git show 3a2db980:`.

## Acceptance (as amended)

| Item                              | Status | Evidence                                                           |
| --------------------------------- | ------ | ------------------------------------------------------------------ |
| 1 generated kills at least hand's | met    | 40 of 41 vs 40 (4602671c, earlier check)                           |
| 2 search finds a conflict or none | met    | round-14 rows I14, I15, I38 (`limits.ts:21-40`)                    |
| 3 falsify 147/147 first           | met    | 56ef0856; now 154/154                                              |
| 4 T10 rows by generated runs      | met    | 4a6bc945; S6 narrowed (`turn/anchor.ts` `routeOf`)                 |
| 5 no observation, lint-enforced   | met    | `dsl/boundary.test.ts`; data-flow test now has a real plant (S7)   |
| 6 limits rows gated               | met    | limits 9/9; one stated row's mutant misses its path (F2)           |
| 7 runner, slow child, old kills   | met    | as amended: Reads and Sessions kills owned by T21 and T25          |
| 8 phase-out 0 to 2                | met    | as amended: Table A kept; no perturbations, no `claimed`; K1 owned |
| 9 four validations                | met    | sweep equals 0d1c5e87 row for row; reds equal the pre-fix 101      |

## Fixes

- **K1, fixed.** `README.md` no longer states a round-14 limit in prose. The StillUnknown tag is a WriteLanes I25
  remainder owned by T51 (`write-lanes/remainders.ts:43-47`). Its check stays loose, but it is listed and owned.
  A lane gone is now one named value, `laneGone` (`dsl/domain.ts:118`), owned by T21 in `not-yet.ts:66-68`. The
  seed is T18's row for WriteLanes I28 (`not-yet.ts:36-40`). `README.md:142-146` describes typing only and loosens
  no check.
- **S1, fixed.** `changeOf` (`turn/predict.ts:67-83`) counts a turn as sure only when it moves the leaf or changes a
  folded field. When the fields are unknown it returns "maybe" and owes nothing, which is the safe direction. A
  fresh actor starts with its fixture's initial fields (`turn/selection.ts` `initialOf` and its caller).
- **S3, fixed.** The limits gate plays `productionOwed` on production (`runner/modes.ts`, `limitsGate`). A pass
  gives `held: false` (`limits.ts:47`), and so do a missing verdict and `NoVerdicts`. The gate then fails. So when
  T51 makes ACT-02 or ACT-03 green, the gate notices.
- **S4, fixed.** `runCoreMutants` first runs the unedited production on the same `options.cases`
  (`runner/mutate.ts:75-93`). Any case without a `Pass`, missing ones included, voids the verdict with exit 1.
  The control is real.
- **S5, fixed.** `runner/gates.ts` keeps each kept gate's own `revision` and stamps HEAD only on gates that ran.
- **S6, narrowed.** The `either` route now needs `adopting && (removed || mayHaveEnded) && !call.current` and a call
  that is not open (`turn/anchor.ts` `routeOf`). There is one residual: `mayHaveEnded` stays set after the actor is
  used again (`used` resets only `freeFor`), so its later calls still get `either`. That is wider than needed, but
  only for calls that are settled and not current.
- **S7, fixed.** The planted test copies `dsl/` and edits `lifecycle-step.ts` so that a reported ending's channel
  moves the model's clock. The control shows the unplanted code ignoring the same lie, and the plant is seen
  through the same `leakAt` and `expectStates` the main test uses (`dsl/dataflow.test.ts` last `it`).
  `anchorView` now drops only machines, reference and rows. The whole Model is compared.
- **S8, fixed in part.** `Caught` now needs the mutant's Invariant through falsify's `${oracle}: ${expects}:` match.
  `verdictOfLimit` matches `check: invariant:` exactly (`limits.ts:49`), and `limits.test.ts` covers I1 against
  I14. The keys row's `admits` text now names keyed retries. For `mint-key-lies`, see F2.
- **S9, fixed.** Computed and fixed delays both count from `state.clock`, the start of the step
  (`turn/schedules.ts:152-155`). The leniency inside an `Advanced` step is stated in the oracle's Gotchas.
- **S10, fixed.** `fixtureGaps` is a separate set (`suite.ts:165`). The liar gate counts the target runtime's
  mutants in it and requires `gaps.length <= FIXTURE_GAP_CAP` to pass (`runner/modes.ts`, `liar`, `capped`). A
  tenth gap therefore fails the gate unless someone also raises the constant, which a diff would show.

## The four parts left as they were

- **The turn's `to` fallback: justified, but for a different reason than the lead gave.** It lives in
  `turn/judge.ts` (`fallback`). Both branches that use it also push a Turn I2 violation, so any run that reaches it
  is already red. The fallback only picks the leaf the model follows after that refusal. The lead's reason, "the
  design's runtime-choice rule", does not appear in any Spec. A separate gap, which T45 did not cause, is noted
  under F3.
- **`twice` deleted: justified for owed members, with one gap.** Owed members read no report
  (`dsl/lifecycle-owed.ts`). But `keysOf`'s fallback (`turn/credits.ts:213-230`) turns reported keys into an owed
  commit lane. Its rule that two different keys name no lane (`:228`) now has no test and no mutant. See F1.
- **`mint-key-lies` stays Caught: not a hole of its own, but the row proves nothing about its limit.** The mutant
  edits the `Minted` evidence in round-14's `world.ts`. Compare's `mintedLane` reads that evidence, and lane-queue
  catches it. The limit's path, `keysOf` falling back to `reportedKeys`, reads the turn's member targets, which the
  mutant does not touch. So the limit itself is still unexercised. A runtime that, after a kill that lost every
  write, reports a wrong member key and uses it consistently passes. That is exactly what the row admits, so this
  is a stated limit whose evidence is missing, not a new hole. See F2.
- **S2 as a stated limit: real, and no current run reaches it.** Any `Wrote` clears every actor's mark, and any
  write discharges every dirty end (`dsl/expect.ts:301-307, 431`). Every generated alphabet drives one actor
  (`generated.ts:19, 234`). The two-actor hand cases end no actor (PAY-21) or never advance
  (`ending-delivery.scenarios.ts`). So no run today can show it, and no mutant could either. It becomes a hole the
  first time a run ends two dirty actors in one step. I36 asks each stated limit to name the behaviour that
  retires it. This one names its cause (`Wrote` carries no keys) but has no owner. See F1.

## Crash total, 1523 against 723: a counting artefact

The figure 698/1523 is in ae49c9a4's `gates.json` (labelled revision 0d1c5e87), not in 0d1c5e87 itself. In
`crashCase` (`runner/run.ts`), the loop breaks only when `playCrash` returns `false`, which happens when the crash
point falls after the case's last step. A case that is red on a clean run throws at `opened.end()`
(`dsl/play.ts:22`) at every point, so it never breaks and counts all 400 points. ACT-03 (4602671c) and ACT-02
(e8830819) were red on production then (suite production 76/78) and still counted among the production cases.
`productionOwed` (4cf200b6) later removed them. 1523 - 723 = 800 = 2 × 400, and the 8 extra green points are the
points before those cases' end. No runs were lost. The weakness: a red case swells the denominator, and nothing
caps it except `productionOwed`.

## Follow-ups (not blocking; each needs an owner, which the orchestrator may assign)

- **F1.** Record S2's retirement: key `Wrote` by record once the Port reports keys. Give that and a test of
  `reportedKeys`' disagreement rule (`turn/credits.ts:228`) an owner. T47 is the natural one, since it adds
  multi-actor parts.
- **F2.** Retarget `limit.mint-key-lies` so it lies about the turn's member keys on a case where the fields are
  unknown (round-14 `turn.ts`). The alternative is to state in the row that it shows only the mint check.
- **F3.** This predates T45 and is outside it. Where `decideFor` cannot compute an opaque guard (unknown fields, or
  a guard with no fold), `possible` allows every opaque alternative, and the runtime's `at` is accepted
  (`turn/judge.ts`, `match`; `fixtures/handlers.ts` `walk`). Conformance R20 calls such a fixture a bug. I did not
  count how many of the 22 `guarded(` sites lack a fold. That count belongs with T52's oracles.
- **Minor.** `runCoreMutants` counts a `time` row as a kill (`runner/mutate.ts:113`). The S6 residual above. The
  crash loop could break on a clean-run failure.

## Sidecars

Two Haiku sidecars (effort high): (1) K1 and S1 to S10; (2) the four parts left as they were and the crash total.
I re-read each cited line at 3a2db980.

| Sidecar finding                                  | Outcome                                                   |
| ------------------------------------------------ | --------------------------------------------------------- |
| 1 K1: README:142-146 borderline                  | rejected: describes typing, loosens no check              |
| 1 K1: StillUnknown in remainders, not not-yet    | changed: a remainder is the in-part owner; owned          |
| 1 S1: unknown fields give none, an under-count   | rejected as a hole: safe side; a fresh actor has fields   |
| 1 S2: prose only, no row, no mutant              | accepted; unreachable today (one actor per alphabet), F1  |
| 1 S3: path real; `oracles.includes` dropped      | accepted; why carries the check prefix, no effect         |
| 1 S4: control real; timeouts count as kills      | accepted (minor)                                          |
| 1 S5: per-gate revision; HEAD ignores dirty tree | accepted; the dirty-tree point is minor                   |
| 1 S6: stricter criterion may false-red           | changed: latent, both suites green; a residual            |
| 1 S6: `mayHaveEnded` not reset by `used`         | accepted, residual (minor)                                |
| 1 S7: plant real, copied, not in place; PAY-01   | accepted as a fix; the copy is equivalent, with a control |
| 1 S8: Caught checks Invariant; `to` fallback     | accepted; fallback justified (sidecar 2b)                 |
| 1 S9: delays from step start; lenient in-step    | accepted; stated in Gotchas                               |
| 1 S10: cap real; declared count, movable const   | accepted; a constant change shows in a diff               |
| 2a S2 unreached, no mutant, unchecked claim      | accepted (`generated.ts:19, 234`), F1                     |
| 2b fallback always pushes Turn I2                | accepted (`turn/judge.ts`)                                |
| 2b opaque-guard choice conflicts with R20        | accepted as outside T45, F3                               |
| 2b "runtime-choice rule" in no Spec              | accepted                                                  |
| 2c `mint-key-lies` never reaches `reportedKeys`  | accepted, F2                                              |
| 2d reported keys anchor owed lanes; untested     | accepted, F1                                              |
| 2e crash: 2 × 400 points from red clean runs     | accepted after reading `crashCase` and `playCrash`        |
