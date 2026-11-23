---
review review-external-rules-a
status open 2026-11-22
description Review finds chaining closes the registry design's holes, but "no rule set silently skipped" fails in three places.
---
# Review A of @proposal.external-rules, the `.rules(build)` design: correctness and discovery (2026-11-22)

**Verdict: ISSUES.** Chaining closes the registry design's real holes (H1, H4 and, with one caveat, H2), and no
earlier feature is lost apart from #40. But "no rule set can be silently skipped" still fails in three places: plain
Runtime tests (H1 below), `.rules(none)` and its conditional spelling (H2), and two values with one definition id
but different builds (H3). None needs a new registry; each is a small construction-time or setup-file rule.

**Why now:** @proposal.external-rules replaces the registry with a chained `.rules(build)`. The user has two
worries: no rule feature lost, no rule set silently skipped. This is one of two reviews; the other checks types.

**Read first:** @proposal.external-rules sections 2, 3 and 5; @review.review-external-rules (H1 to H5);
@spec.Host (R8, R11, R12, `RuleSources`); @spec.Types (I14, Q5); `src/host/setup.ts`, `src/host/testing/story.ts`,
`src/host/cli/discover.ts:112-141`, `fixtures/*/app.ts`. Read from records and code; nothing built or compiled,
and the typing spike was not re-run.

## High

**H1. A plain Runtime test can still judge nothing, silently (proposal case 5, Q3 A).** Four traces.
- *Shared setup says `"off"`.* There are 12 `runtimeSetup(` in `fixtures/*/app.ts` and 84 in `tests/`. The proposal
  makes `rules` required and says production writes `"off"`. The bench times those same fixture setups, so a fixture
  setup must say `"off"` (judging skews timings) and any plain test that imports it, as most do, runs unjudged.
  Only `Story.app` overrides (Q5). Nothing in the test or the setup file notices; the "visible opt-out" is in a
  fixture file the test author never opened.
- *`brokenRules(runtime)` acknowledges every break.* The setup file cannot tell a read that checks the right rule
  from one that ignores it. Trace: a test expects `RefundAddsUp`, asserts `.map(b => b.rule)` contains it; a second
  rule `ClosedStaysClosed` also broke; the test is green.
- *Which Runtimes count.* The `afterEach` must know the Runtimes "a test started": a per-process list (state the
  inventory lacks). A Runtime made in `beforeAll` or at module scope, or one that breaks after the test ends,
  belongs to no test. Runtimes inside `Story.run`, sweeps and `propertyTest` record `RuleBroken` for their own
  verdict, so they must be exempt or every inverted Story fails `afterEach`.
- *Setup file not applied.* `vite.config.ts` has several test sets (node, browser, stress); a project that lists it
  in one loses it in another, and `flow check` cannot see Vitest's config (the proposal's risk list admits it).
Fix: in a process where the setup file is loaded, every Runtime judges whatever its setup says (the Q5 rule for
Stories, extended); an opt-out is `unjudged(setup)`; the bench passes `"off"` itself. Acknowledge per rule:
`expectBroken(runtime, [tokens])` consumes matches and `afterEach` fails on the residue. Story-owned Runtimes are
exempt by being judged by their verdict; list the per-process Runtime list in the state inventory.

**H2. `.rules(none)` is itself the silent skip, and nothing flags a wrong one.** The proposal says `none` is
"an upfront claim a reader can see" and calls A the only option "with no silent case". It is the only one that
forces a claim; the claim can be wrong. Traces:
- `stepperRules` is written in `stepper.rules.ts` and nothing imports it; `StepperMachine = machine(...).rules(none)`
  is what the author wrote to get the machine to run. Every Story passes; the build is dead (see M1).
- A planted-fault variant `machine(Stepper, unclampedBody).rules(none)` copied from a neighbour: no verdict
  mentions it, and its Story (without `expectBroken`) passes.
- `.rules(DEV ? build : none)` (inventory #40). Vitest sets `import.meta.env.DEV`, so Stories judge. Under
  `flow story run` Node has no `import.meta.env` (Types Q5's own argument): `import.meta.env.DEV` throws at import
  (refused, not silent), but the spelling `process.env.NODE_ENV !== "production"` returns `none` under a CLI run
  with `NODE_ENV=production` set by CI and the Story exits 0 having judged nothing, against Host R13 and R8.
- `.rules(() => ({}))` and `invariants: {}` are none in disguise: not greppable as `none`.
Fix: (a) refuse an empty build at `.rules()` (`RulesEmpty`, "use none"); (b) coverage, `flow explain` and the
verdict print one row per run value whose build is `none` ("Number/Stepper: no rules"), so a skip is listed, never
silent; (c) drop #40's replacement from the proposal and record the feature as lost with a `[deferred]` tag; a
condition cannot be told from a choice, so no condition may reach a Story.

**H3. Two ruled values with one definition id but different builds share rule ids.** H2's closure (ids are
`<definition id>.<Name>`, so a planted fault names "the rule the original declares") holds only when the builds are
the same build. Traces:
- `app({ machines: { order: OrderMachine, legacy: machine(Order, b).rules(otherBuild) } })`: `off:
  [OrderMachine.rules.RefundAddsUp]` switches both; an `expectBroken` matches a break of either; coverage merges
  two different checks into one row. With `.rules(none)` on the second, `neverBroke` and `seen` counts are wrong.
- Fragments: `trait(UploadSpec, a).rules(x)` placed in `Editor`, `trait(UploadSpec, b).rules(y)` in `Composer`;
  `Upload.rules.CancelSticks` "switches every placement" and means two rules.
- Two `definition()` calls with one id in different test files: the same collision, reached by `R` being string ids.
Fix: refuse at `compiledOf` (the one door, see L1) when a run's values of one definition id carry different build
objects (`RulesDiffer`), and let `flow check` warn the same across everything it loads. A shared build is one
object, so H2's planted faults pass.

## Medium

**M1. A build nobody attaches is dead and unseen.** The scan found `*.rules.ts` files; nothing now looks for them.
Trace in H2. Fix: `rules(source, build)` notes its build in a per-process set; at the end of a Vitest run (the
setup file) and in `flow check`, a build never passed to `.rules()` is `RulesUnattached`. It sees only imported
modules, so also add a lint rule that a `*.rules.ts` file's exports are imported by a `.rules(` call site.

**M2. Terminals are unproved for a value only plain Runtime tests run.** Q4 A covers a Story's subject. `flow check`
reaches config apps and discovered Stories (`discover.ts:112`); a test-local app run by `runtimeSetup` in a test file
is reached by neither. Q4 A also overturns @plan.Rules.O2 (the user decided on 2026-11-22 that `flow check` alone
proves terminals, no run applies) and Types I14 (graph rows never refuse). Fix: prove terminals in `compiledOf`,
memoised per value (it already runs at every Runtime start and `Story.app`), as a startup finding that a Story's
verdict and a plain test both read; this needs the user's yes on O2, so ask it as a round.

**M3. Project run rules (`runRules`) have no route to `Story.machine` and `Story.fragment`.** Host R8: "`Story.app`
requires the rules". The proposal's section 5 examples pass `runRules` to `Story.app` only; the machine and
fragment examples have no such option, so the project's run rules and the tooling rules judge those Stories
only if the option is added. Fix: state that `runRules` is required on all three constructors, or lives once on
`defineConfig` and every Story takes it.

**M4. Tokens of placed fragments in an app Story's `R` are unproven.** M3 of the old review is "closed" by `R` =
"the run's token ids", but a trait's tokens reach an app Story through `definition({ traits })` at any depth. The
spike covers a machine only; `Definition` must carry each placed trait's and subroutine's `N` through `.each`,
nesting and a subroutine's own placements, or `off: [Upload.rules.X]` is a type error or `R` is loosened to
`string` (reopening M3). Fix: make that plumbing a named acceptance line of @task.V3.T109, with a type test at depth
two.

**M5. Enforcement points must be one function.** The proposal names four doors (`app()`, `runtimeSetup`,
`Story.machine`, `Story.fragment`) plus the traits slot. Host says `compiledOf` is called by `Story.app` and Runtime
start only. A fifth door (bench, a CLI helper, the sweep's internal runner) added later is unguarded. Fix: raise
`RulesMissing` in `compiledOf` and in `definition()` for the traits slot; keep the type error as the early signal.

**M6. The cost claim (about 50 lines) is low, but the real burden is small too.** Counts (`machine(` call sites):
fixtures 67 (51 exported, 16 inline in stories), `tests/` 244 in 59 files (25 of them `*.test-d.ts` and
construction tests that never run), `src/` 47 in 21 files. Traits and subroutines have no fixtures yet. Only
values that reach a run need `.rules(none)`: about 51 + 16 in fixtures plus the run-time tests, a codemod. Is there
a cheaper rule with no silent case? Every alternative that lets a bare value run needs a place to know that
another value of its definition has rules, which is the registry again. So A stands. Keep the cost down by
refusing a bare value only at the run doors (`compiledOf` when a Runtime or Story starts); `compiledOf` for
type tests, `flow check` and construction tests keeps taking one.

## Low

- **L1.** `.rules(sharedFromOtherDefinition)` by cast or in JavaScript: only a double call is said to be refused
  (`RulesTwice`). Add `RulesWrongSubject` at `.rules()`, by definition id.
- **L2.** Calling `.rules` twice on a *bare* value (`base.rules(a)`, `base.rules(b)`) is allowed and gives two
  values; H3's refusal covers a run holding both, no more is needed.
- **L3.** Inventory #29 omits "expected rules are listed as expected" (Plan O5, O4); add it. #11 omits "an empty
  `terminals` list, or a state listed twice, is refused" (Plan O2).
- **L4.** The `none` row of H2(b) names values by definition id, so it needs the placement name for fragments
  (`Desk/Editor/uploads`).

## Case check (section 5), by trace

| Case                                     | Silent skip found                                                   |
| ---------------------------------------- | ------------------------------------------------------------------- |
| App Stories, custom fixtures             | No: fixtures are Layers, never rules. Only H2, H3.                  |
| Machine and fragment Stories             | `runRules` route (M3); otherwise no.                                |
| Derived runs (samples, property, sweeps) | No: built from the Story's subject; forks drop `expectBroken` only. |
| Plain Runtime tests                      | Yes: H1.                                                            |
| Test-local values                        | No if run through a door; bare ones refuse (M5).                    |
| Trait at depth                           | Rules ride the placement (H4 closed); token typing M4.              |
| Shared build                             | Safe; dead builds M1; mixed builds H3.                              |
| Planted-fault variant                    | `none` copy H2; ids rely on one build H3.                           |
| Two values, one id                       | H3.                                                                 |
| A bare value kept around                 | Refused at run doors; one function M5.                              |
| `.rules(none)` to escape                 | H2.                                                                 |

## The earlier review's H1 to H5

- **H1 (scan misses test-file entries): closed.** A Story in a test file runs a value that carries its rules; no
  glob is involved (proposal section 3; `discover.ts:112-141` no longer matters to judging).
- **H2 (second machine, planted faults): closed, with H3's condition.** Shared builds give equal ids only when the
  build is one object; add `RulesDiffer`.
- **H3 (plain Runtime tests): not closed.** Required `rules` plus the setup file leaves H1 above open.
- **H4 (fragment guarantee): closed**, by the traits slot taking only ruled values; it needs the runtime check in
  `definition()` for casts (M5).
- **H5 (terminal proofs): half closed.** Per value in `flow check` and in a Story's verdict, but not for a value only
  a plain test runs (M2), and Q4 A edits a decided line.

## Inventory walk (40 features, against @plan.Rules O1 to O7 and @spec.Host R8 to R14)

Working mechanism: #1 to #10, #13 to #24, #26 to #28 (see M4), #30 to #35, #37, #38 (planned), #39.
Claimed without one: #14 ("every run judges by construction": not for plain tests, H1), #25 (`runRules` for machine
and fragment Stories, M3), #36 (needs the `definition()` runtime check, M5). Lost: #40, whose replacement is
unsafe (H2). Gaps in the wording of #11 and #29 are in L3. Nothing else in O1 to O7 or R8 to R14 is missing.

## The proposal's four questions

1. **Two-values risk: A holds,** with H2's visible `none` rows and H3's `RulesDiffer`; without them "no silent case"
   is overstated.
2. **Shared build source: A holds,** provided one definition id carries one build (H3).
3. **Plain Runtime tests: A does not hold as written.** Keep required `rules` and the setup file, but make the setup
   file force judging and acknowledge per rule (H1); Host R8 then stands unamended.
4. **Terminal proofs: A is the right outcome, wrong home.** Prove in `compiledOf` (M2), which covers Stories,
   plain tests and apps once; it still needs the user's yes on Plan O2.
