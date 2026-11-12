# T47 requirements: fixture infrastructure and pilot parts (2026-11-12)

**Bottom line:** 30 requirements (Q1 to Q30), each a check that is red at 632a8469 against the empty skeletons
committed with them (Q29 and Q30 added at resume item 4, red first in their own step), each naming the wrong build that must keep it red. Every acceptance item, Approach item and gap
comment of @task.V3.T47 maps to one of them (table below). Four sidecars gathered them (Specs blind, code, open
findings, adversary); their items are logged at the end as accepted, changed or rejected. Proposed until the user
accepts: the non-interacting rules (Q13, Q21) and the scope rulings marked "ruling".

**Read first:** @task.V3.T47, @spec.Conformance R15 to R23, code:workflow/plans/flow/references/proposals/fixture-catalogue-2026-11-11.md
(2, 5A, 5B "Pair and triple estimates"), code:workflow/plans/flow/references/proposals/replan-2026-11-11.md (part 2
"53 feature codes", part 3), code:workflow/plans/flow/references/proposals/plan-task-coverage-2026-11-11.md.

## Settled facts the checks pin (verified by the lead)

- **Today's 15 codes** (replan's R row, part 2 "built" plus `wa sr rl` in part): `rj ky cm rt un lr du gd dp ma gr lk
  wa sr rl`. Production declares exactly these; each is cited to `adapters/production.ts` in its declaration.
- **The pair rule** (catalogue 5B, the replan's reading): two codes interact when both touch one channel of 5A's
  table, or one is a lifecycle owner (5A's L row) and the other is not pure-turn (`gd ck rn po`); the four policies
  (`rj lt se ca`) never interact with each other. It gives 671 pairs over the 53 codes and 74 over today's 15,
  reproducing both published figures (lead's script; the catalogue's 777 uses 5A's six rules, which no script
  rebuilds). The closed list is the 53 codes; 5B's nine are proposed and join when accepted.
- **265 Plan features**: the rows of plan-task-coverage's tables (ids `M01` to `K11`); no `.plan` file holds them,
  so the matrix pins its ids to that table.
- **`Compiled` carries the Slots' closures** (`src/core/compiled.ts`, `Slot.run`) and is public through
  `Machine["compiled"]`, so a part's guards, updates, keys and delays are computable from its own source (F3).
- **Production writes under `reject` only** (`src/machine.ts:282-285`), so the pilots use `reject` alone; S10's
  webhook storm (`ad`) is round-14's code and is filtered out on production (Q7's planted case).

## Requirements

Each: rule; source; check (red today); the wrong build or mutant that must turn it red once green.

- **Q1 Layout.** `fixtures/` imports only `src/index.ts`, `effect` and its own modules; `bench/` sits beside it;
  `conformance/` never imports `bench/`. Source: R15 layout, acceptance 13, Approach "Layout". Check:
  `conformance/parts/layout.test.ts` walks every import (named, aliased, default, side-effect), plus a
  `no-restricted-imports` lint. Wrong build: a part importing `src/core/compiled.ts`; `import "../bench/x.ts"` in
  conformance; an aliased import that a comma split misses.
- **Q2 Parts are data modules.** Each pilot (S16 transfers, S21 sign-in flattened, S10 sync) is one module: a
  machine in the public API, a user model per leaf state (weighted actions, think times), a server model per
  operation and `classify` beside it; no faults or profile in a part. Source: R15, I46, acceptance 2, 7, 13.
  Check: `parts/parts.test.ts`. Wrong build: a part reusing Pay's machine (machine id not the part's own); a leaf
  with no user model; an operation with no server answer.
- **Q3 `referenceOf(compiled)`.** Derives events, states, handlers (place, target, `when`, `idle`, updates),
  schedules, rows, and each operation's concurrency, key fields and ending map, never written by hand. Source:
  phase-out step 3, R15, I46, T30, acceptance 13, 14 (V3). Check: `parts/reference.test.ts` compares
  `referenceOf(PayMachine.compiled)` with the hand Pay fixture field by field over the union of both sides' keys
  (not rows alone, not filtered by the hand side's names); a `Part` with a `rows` or `handlers` field fails to
  compile. Wrong build: concurrency read as `serialize`; an operation dropped from both sides; a test comparing a
  value with itself.
- **Q4 `classify` per fixture.** Each part declares `classify` for every operation of its `Compiled`, beside its
  server model, and the derived fixture carries it. Source: Gap 2, R15, acceptance 13. Check: a mapped type over
  the part's operations (a missing one fails to compile) and `reference.test.ts`. Wrong build: a default classify
  filled in by the suite.
- **Q5 No opaque alternative in a part.** Every guard of a part is computed by the suite from the part's own source
  over suite-made values. Source: F3, R20. Check: `reference.test.ts` (no alternative of a derived part is opaque);
  the hand fixtures' unfolded `guarded(` sites are counted and listed for @task.V3.T52 (ruling: F3's hand half is
  T52's, per the completion check). Wrong build: a derivation that marks every `Check` guard opaque.
- **Q6 Declarations.** A closed list of the 53 codes; production declares today's 15, round-14 and the Spec model
  declare theirs; every declared code and every part command's code is in the list. Source: R16, I51, T34,
  acceptance 3 and "Declared". Check: `parts/codes.test.ts`. Wrong build: a planted code `zz`; production
  declaring `lt`; a part command with no codes.
- **Q7 The generator draws only declared codes.** Filtered before the draw, in seeded and exhaustive generation,
  and regression scripts are checked on load. Source: R16, I52, T34, acceptance 4 and "Enabled". Check:
  `parts/generate.test.ts`: S10 on production emits no `ad` command; S16 for a runtime without `cm` emits no
  `Abandon`; every script has moves past its prefix. Wrong build: filter after the draw (orphan answers); the
  exhaustive path unfiltered; an emptied alphabet.
- **Q8 Scripts as JSON.** `scriptOf(part or mix, profile, seed)` encodes to JSON and decodes with T45's one Script
  Schema unchanged, is byte-identical for the same inputs, and replays with no generator. Source: R15, I47, T30,
  acceptance 2. Check: `generate.test.ts`. Wrong build: a script holding closures or labels; a seed ignored.
- **Q9 Part scripts run on production under the oracles, the model computing the expected reports.** Source:
  acceptance 2, 7, R19, I60, R7. Check: `parts/play.test.ts` replays each pilot's usual scripts on production
  (all pass, the null runtime fails each, and at most a stated share of `answer` steps skip); a production mutant
  that resends a transfer on its own turns an S16 script red. Wrong build: scripts whose answers never fire; a part
  booted under Pay's name.
- **Q10 Composites stay off round-14.** Source: R22, I48, T31. Check: `play.test.ts`: a part on round-14 gets a
  refusal. Wrong build: the runner running it.
- **Q11 Reach from executed facts.** Codes reached come from a run's suite facts and the model's prediction, never
  from a part's declared list or the emitted steps. Source: R17, catalogue 5A "technique", acceptance (matrix,
  pairs). Check: `parts/reach.test.ts`: a skipped `answer` reaches no `un`; steps after a case stops reach
  nothing; a run with no `Abandon` reaches no `cm`. Wrong build: reach copied from declarations; counted at the
  player's dispatch.
- **Q12 Feature matrix gate.** One row per Plan feature (265, ids pinned to plan-task-coverage), with its fixture
  kind (part, hand case, static case, example-app check, package check) and either the fixtures that reach it or
  "owed by slice N" naming an open Task of that slice. Source: R17, I53 to I55, T35, acceptance 5. Check:
  `parts/matrix.test.ts`: the gate over all rows, and seen failing on a deleted row, a row owed to a done Task, a
  declared code no fixture reaches, a part claiming a code no runtime under test declares, and a built feature
  marked owed. Wrong build: a matrix counting its own rows; reach taken from declarations.
- **Q13 Pairs from the channel table.** The interacting pairs are generated from the table by the rule above (671
  over 53, 74 over today's 15); the non-interacting list is the rest, each pair with the rule that excludes it.
  Source: R18, I56, T36, acceptance 11. Check: `parts/pairs.test.ts`: regenerated list equals the gate's by content;
  a waiver on a channel-sharing pair is refused. Wrong build: a hand list; a count check that a swap passes.
- **Q14 Combination gate.** Over the codes the runtime under test declares, every interacting pair is reached
  together in one generated run (or across composites in the app mix when one code is shared-resource), or has an
  owner: a later slice's open Task and the part, operation or pair sweep that will reach it, with a date. Triples
  and cell pairs are reported, never gating. Source: R18, I57, I58, T36, acceptance 1, 6, "Covered". Check:
  `pairs.test.ts`: fails on an unreached pair with no owner, an owner naming a done or unknown Task, a waiver on a
  pair of two implemented codes naming no part, a pair reached only in two different runs; an unreached triple
  changes no verdict. Wrong build: denominator over all 53; pairs from declarations.
- **Q15 Pilot profiles.** Each pilot has usual and stress scripts that pass on production alone and in the app mix.
  Source: acceptance 7. Check: `play.test.ts`. Wrong build: stress equal to usual (no fault draws).
- **Q16 Model mutation.** Each model table cell (`dsl/lifecycle-rules.ts` tables A to C) mutated in turn against
  the pilots' recorded production runs; a cell no pilot trace notices is listed; a kill counts only as a refusal
  naming the cell's Invariant, never a throw. Source: R19, I61, T39, acceptance 7. Check: `parts/model-mutation.test.ts`
  over a small planted table. Wrong build: crashes counted as kills; zero kills passing.
- **Q17 App mix.** One boot and one world (storage, network, clock, reload, disposal) for several parts' actors in
  one script. Source: catalogue 5A "app-mix profile", acceptance 7. Check: `play.test.ts`: one mix script reloads
  every part's actor at once. Wrong build: one runtime per part, played in turn.
- **Q18 Bench.** `bench/` replays a script on production with no oracles and no Observation decoding, and its work
  fingerprint (turns, publications, commits by operation, requests by operation, batches landed, bytes written)
  equals the conformance replay's for each pilot's usual script; turn cost (median, p99) per part is written as a
  measurement, not gated. Source: R23, I67, T44, acceptance 8. Check: `bench/bench.test.ts`, seen failing on a
  planted bench that skips the persistence edge. Wrong build: a fingerprint counted from the script.
- **Q19 Regressions.** A failure a part's generated run finds on production shrinks to a kept script in
  `conformance/regressions/` that a gate replays on production, or becomes a limits row. Source: I49, acceptance 9.
  Check: `play.test.ts` with a planted production mutant. Wrong build: shrink defaulting to round-14; regressions
  replayed by no gate.
- **Q20 Guards.** Production's first-contact reds on the pilots recorded and classified (which side is wrong);
  held-out seeds disjoint from the build seeds and green; a Fable agent reads a sample of model expectations.
  Source: acceptance "Guards", replan risk co-adaptation. Check: `generate.test.ts` (seed ranges disjoint) plus
  T47 comments. Wrong build: held-out equal to tuning seeds.
- **Q21 Non-interacting list for the user.** Generated from the channel table and written as one list for one
  approval, marked proposed. Source: acceptance 11, replan question 12, Stops. Check: the generated file equals the
  generator's output (`pairs.test.ts`). Reality cannot show: the approval itself.
- **Q22 Production static surface.** `construct` and the data view over the public API (moved from @task.V3.T17),
  bound for production in `runner/args.ts`; the Compile static cases run on each part's and Pay's `Compiled`.
  Source: phase-out step 3, Q17 gap, acceptance 12, 13, 14 (V4). Check: `parts/static.test.ts`. Wrong build: the
  null surface still bound; a construct returning an empty view.
- **Q23 Phase-out checks.** No lost catch against the committed sweep at HEAD (not the working copy); coverage and
  matrix rows the same or added to; derived equals hand (Q3); static cases green (Q22). Source: acceptance 14.
  Check: the sweep and coverage gates at each step's checkpoint. Wrong build: a baseline regenerated with the run.
- **Q24 Frozen hand cases.** Every hand case added after 2026-11-11 cites a ruling. Source: R15, I50, T33. Check:
  `parts/frozen.test.ts` against the case ids at 632a8469. Wrong build: a planted uncited new case.
- **Q25 F1.** A multi-actor part run ends two dirty actors in one step, and a mutant dropping one actor's record
  write is caught, retiring S2; else S2 stays a stated limit naming its retiring behaviour (a write that names its
  record) and its owner. A test of `reportedKeys`' two-keys rule (`turn/credits.ts:228`) with a mutant taking the
  first key. Source: T47 comment F1. Check: `parts/f1.test.ts`.
- **Q26 F2.** `limit.mint-key-lies` lies about the turn's member keys on a case whose fields are unknown, or its
  row says it shows only the mint check. Source: F2. Check: the limits gate's row verdict.
- **Q27 Gates.** The parts suite, matrix, pairs, bench fingerprint and regressions on production join `gates.ts`;
  falsify, liar and core mutants no worse than at 632a8469. Source: Gates line, acceptance (gates). Check:
  `gates --gate`.
- **Q28 `nub run check` at zero.** Source: Gates, AGENTS.md. Check: `nub run check`.
- **Q29 False pass: parts alike.** Each pilot part reaches a table cell, a cell pair or a noticed model mutant that
  no other part does. Source: the brief's False-pass line ("parts that differ in name but reach the same cells").
  Check: `parts/model-mutation.test.ts` with `undistinguished` (code:packages/flow-state-v3/conformance/parts/cells.ts),
  and a renamed copy of a part flagged. Wrong build: cells alone (sync and sign-in reach no cell transfers does not).
- **Q30 Conformance.spec revision.** R18 cites catalogue 5A's cell-pair reach and 5B; I57 names the dated owner R18
  allows during the slices; R18 and I58 report cell pairs, never gating; each change has a spec-log note. Source:
  the replan's T47 line ("Revises Conformance.spec"), resume item 4. Check: `workflow check`; cell pairs in
  `parts/cells.test.ts` (denominator from the tables, per composite in `combinationGate`, verdict unchanged).

## Mapping, one to one

| Item                                                                                 | Requirement   |
| ------------------------------------------------------------------------------------ | ------------- |
| Acceptance 1 (combination gate, dated owner)                                         | Q14           |
| Acceptance 2 (shape, JSON scripts, player, production, model)                        | Q2, Q8, Q9    |
| Acceptance 3 (parts and runtimes declare codes)                                      | Q6            |
| Acceptance 4 (generator enables declared only)                                       | Q7            |
| Acceptance 5 (matrix gate)                                                           | Q12           |
| Acceptance 6 (pairs among implemented, channel table, waiver, triples, cell pairs)   | Q13, Q14      |
| Acceptance 7 (pilots: profiles, model-cell kills, production alone and in the mix)   | Q15, Q16, Q17 |
| Acceptance 8 (bench, fingerprint gate, turn cost measured)                           | Q18           |
| Acceptance 9 (failure shrinks or is a limit)                                         | Q19           |
| Declared / Enabled / Covered                                                         | Q6 / Q7 / Q14 |
| Guards                                                                               | Q20           |
| Acceptance 11 (non-interacting list, one approval)                                   | Q21           |
| Acceptance 12 (Compile static cases on every Compiled)                               | Q22           |
| Acceptance 13 (referenceOf, static surface, classify, layout, lint)                  | Q1 to Q4, Q22 |
| Acceptance 14 (four validations)                                                     | Q23           |
| Approach: progressive fixtures (needs, implements, owed by slice, implemented pairs) | Q6, Q7, Q12   |
| Approach: build (shape per part, reference from Compiled, models, profiles, mix)     | Q2, Q3, Q15   |
| Approach: matrix with fixture kind per row; pilots S16, S21 flat, S10                | Q12, Q2       |
| Approach: J, K and S27 placed by slice                                               | Q12 (owners)  |
| Catalogue correction (matrix and slice tables supersede tiers)                       | Q6, Q12       |
| Declares today's codes, recorded in comments                                         | Q6            |
| Bench (turn cost measured, fingerprint gated)                                        | Q18           |
| Phase-out step 3 (referenceOf, static surface, baseline)                             | Q3, Q22, Q23  |
| Layout (fixtures, bench, lint; expected only from model or ruling; bugs to scripts)  | Q1, Q9, Q19   |
| Layout (model search replaces hand traces but rulings)                               | Q24           |
| Gap: no production static surface                                                    | Q22           |
| Gap: `classify` not in `Compiled`                                                    | Q4            |
| Comment F1, F2, F3                                                                   | Q25, Q26, Q5  |
| Gates line; `nub run check`                                                          | Q27, Q28      |
| False pass (parts that differ in name but reach the same cells)                      | Q29           |
| Replan: revises Conformance.spec (R18 cites 5B; I57 and cell-pair notes)             | Q30, Q14      |
| Stops (the user's approval of the pair list)                                         | Q21           |

## Reality cannot show

- The user's approval of the non-interacting rules (Q21); the gate runs on the proposed rules meanwhile.
- Q25 may need a Port change (a write naming its record); if so S2 stays a limit with its owner, not retired here.
- Turn cost is machine-dependent: recorded, never compared.

## Sidecar log (lead's verification)

Sidecars a (Specs and Plans, blind), b (code), c (open findings), d (adversary); Haiku at effort high, read-only.

- a1, a2, a16, a27, a35, a50 (clear rules): accepted into Q2, Q8, Q6, Q13, Q9, Q22.
- a3 (regression format JSON vs `.scenarios.ts`): changed: JSON, as T45 built and R15 says; the catalogue is
  superseded.
- a5 (`shape()` field sets differ): accepted: R15's set plus `classify` (Q2, Q4); the catalogue's `property` is
  not built (a7 rejected: R6 needs an Invariant per check).
- a6 (`classify` has no core contract): accepted as Q4's note; its signature is the hand fixtures'
  (`reference.ts`).
- a8 (the model's compare as a third judge): noted; T45 owns the judges.
- a9 (null and prototype runs for composites): changed: null runs on parts (Q9); prototype excluded by R22.
- a10 (no Spec for streams, entities, lazy): rejected for T47: the pilots use none.
- a11 (Pay a part or not): noted; Pay's conversion is @task.V3.T52; Q3 compares derived and hand Pay only.
- a12, a13 (handler content and concurrency not in `Compiled`): rejected after reading `compiled.ts`: Slots carry
  `run`, `Write` carries `concurrency`, `success`, `failure`, `unknown`.
- a14 (no test for the layout lints): accepted, Q1.
- a17 (closed list 35, 53 or 62): changed: 53 (Settled facts).
- a18 (a declared code not checked as built): accepted into Q12 (declared and unreached fails) and Q20
  (first-contact reds before declaring).
- a19 (R17 "not from a part's list"): accepted, Q11.
- a20, a21 (265 rows only in the proposal; 123 unowned): accepted, Q12; owners from the replan's part 2 slices.
- a22, a23 (codes in no slice; `in` twice): accepted: the built codes need no slice; `in` splits (replan part 2).
- a24 (runtime under test undefined for parts): changed: production for part reach, every declaring runtime for
  I55.
- a25, a26 (fixture kinds; cell pairs not in the Spec): accepted, Q12, Q14; Spec note owed.
- a28 (pair counts): changed: the lead's script reproduces 671 and 74 with 5B's rule.
- a29, a32 (rules pending approval; gate vs report): accepted, Q21; the gate runs on the proposed rules.
- a30 (R18 owner vs I57 waiver): accepted: R18 rules; I57 to be aligned (Spec revision, logged).
- a31 (shared-resource set): accepted: 5A's list `wa sr rl up dp fg of ad ma mt`.
- a33 (app mix only in the catalogue): accepted, Q17.
- a34 (field deleted vs gate fails): changed: T39 lists unnoticed cells; deletion follows the Spec (R19).
- a36 to a41 (liar, limits): rejected for T47: T45's.
- a42 to a45 (inconclusive verdict, bounds, seeds, refusal kind): changed: a part on round-14 is a defect with its
  reason (Q10); bounds as T45 built.
- a46, a47, a49 (bench no observer vs facts; fingerprint fields; which replay): accepted, Q18; resolved at build
  and logged.
- a48 (bench measures beyond turn cost): rejected for T47: P8 (@task.V3.T35).
- a51 (`construct` in no core Spec): noted; the surface implements `conformance/surface.ts` as round-14's does.
- a52, a53, a54, a55, a56, a57: noted; no T47 check changes.
- b1 to b8: accepted as facts behind Q1, Q3, Q7, Q9, Q22 (script single-actor, shrinker `PREFIX = 2` and fixture
  lists hard-wired, production boots only `pay` and `cells`, null surface bound at `args.ts:57-60`, `Compiled`
  public through `Machine`, lint scopes miss `fixtures/` and `bench/`).
- b (README decision 6 stale): noted for the README pass.
- c1, c2 (F1): accepted, Q25. c3 (F2): accepted, Q26. c4 (F3): changed: parts in Q5, hand sites counted for T52.
- c5 (nine liar greens owned by "T47's fixtures on production"): ruling needed: not in T47's acceptance; the pilots
  run on production while the nine are round-14 mutants. Proposed: each named with the part handler that shows it
  on production, kills carried to @task.V3.T52.
- c6 (blind pass): satisfied by sidecar a.
- c7 to c12: accepted, Q3, Q22, Q1, Q6, Q13, Q14, and the T-tests named in each.
- c13, c14 (per-field fold mutation; K3 remainder): rejected for T47: not routed here; parts' folds are derived.
- c15, c16: noted. c17: accepted (nothing from T51 routed here).
- d (A1 free-text, draft, done owners; waiver on two built codes): accepted into Q14; dates are recorded, never
  compared with a clock (R8).
- d (A2 skipped answers, empty alphabet, echo model): accepted, Q9, Q7, Q16.
- d (A3 over- and under-declaring): accepted, Q12, Q11.
- d (A4 filter after draw, exhaustive, regressions): accepted, Q7.
- d (A5 short list, declared as reached, owed text on built): accepted, Q12.
- d (A6 denominator, different runs, triples, same-slice waiver): accepted, Q14.
- d (A7 crash as kill, zero kills, Pay alias, sequential mix): accepted, Q16, Q2, Q17.
- d (A8 fingerprint from script, bytes, publications): accepted, Q18.
- d (A9 production findings, no gate, timeout signature, dedupe): accepted, Q19; dedupe noted.
- d (A10 owner string, held-out seeds): accepted, Q20.
- d (A11 rules contradict the table; count vs content; `owners` as a code): changed: the 5B rule has no such
  waivers; Q13 compares content; `owners` is not a code.
- d (A12, A13, A14): accepted, Q22, Q3, Q1, Q23.
- d (A15 dispatch, Port call, emitted steps): accepted, Q11.
