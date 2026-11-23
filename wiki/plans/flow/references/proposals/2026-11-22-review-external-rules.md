---
review review-external-rules
status open 2026-11-22
description Review of @proposal.external-rules finds the design sound but "no rule set silently skipped" and "nothing lost" fail.
---
# Review of @proposal.external-rules (2026-11-22)

**Verdict: ISSUES.** The move to `rules(subject, build)` is sound, and the 38-feature list is nearly complete, but
two claims do not hold: "no rule set can be silently skipped" and "nothing lost". Five findings (H1 to H5) break
the first or second claim and need a design change before this becomes T106's design; the rest are fixes.

**Why now:** the user wants an independent check before @task.V3.T106 takes the design, on two worries: no earlier
rule feature lost, no rule set silently skipped in any Story or test.

**Read first:** @proposal.external-rules; @plan.Rules; @spec.Host (R8, R11, R12, `RuleSources`, `judge`);
@spec.Types (R9, I12, I13, Q5, Q19); code:packages/flow-state-v3/src/host/cli/discover.ts.

Not reviewed with a compiler: the typing spike (`spike/helper3.ts`, scratchpad) is a toy `Def`, not the real
package, and covers a machine subject only. Everything below is read from the records and code.

## High

**H1. The scan cannot see the entries that most tests use, so a set can be silently unjudged.** The scan checks
"each app the config lists, each app a discovered Story runs, each `Story.machine` and `Story.fragment`"
(proposal section 2). `discover.ts:112-141` reaches only the files in `defineConfig`'s `apps[].stories` and
`stories` globs. Flow's own Stories are written in `*.test.ts` files (`tests/turn/creation.test.ts`,
`tests/generated/sweep.test.ts:22`, `tests/stories/story.test.ts`), which "run tests when imported" (section 4.6),
so no scan loads them.
Trace: `order.rules.ts` exports `OrderRules`; `tests/refunds/order.test.ts` calls
`Story.machine(OrderMachine, { id })` or `app({ machines: { order: OrderMachine } })`; the scan loads the config's
apps and Story globs only, never that entry; `OrderRules` is unlisted and unflagged; the Story judges nothing and
passes. The same trace holds for a test-local `app()`, a `Story.fragment` and a custom-fixture Story written in a
test file. The reporter "runs the scan" (section 2) with the same inputs, so it does not close this.
Fix: check at construction instead of by scan. `rules()` records each set in a process-level registry keyed by
subject id; `app()`, `Story.machine`, `Story.fragment` and `runtimeSetup` refuse (`RulesUnregistered`) when the
registry holds a set for a subject they run or place and the entry omits it. Keep the glob scan only to import
`*.rules.ts` files, so the registry is filled before any entry is built.

**H2. A set is bound to one machine value, so a machine built from the same definition or body gets no rules and
no error.** Rule 9 of the inventory keeps names, but the subject is `Machine<D>` (section 1) and `RulesSubjectAbsent`
refuses a set for any other machine (section 2). Before, rules travelled with the body: `machine(Pay, PayBody)`
twice gave two machines with the rules (@task.V3.T106 Risk names `pay.ts#PayBody`). Now:
(a) a second machine of the same definition has no set, and the scan flags only sets whose subject it runs, so
nothing is reported; (b) a planted-fault variant (@plan.Rules O4's `UnclampedStepperMachine`, @plan.Rules V7's
"each rule kind has a planted fault") needs its own `rules(Variant, build)`, a new set with new tokens, and the
inverted Story's `expectBroken: [UnclampedRules.SetLandsInBounds]` no longer names the rule the original declares.
Fix: make the subject the definition (D is all the build reads), so a set judges every machine of that definition.
`RulesSubjectAbsent` then means "no machine or fragment of this definition is in the entry".

**H3. Plain Runtime tests contradict Host R8, and the proposal's default makes the skip invisible.** Host R8:
"A test that breaks a rule fails, whoever wrote it and however it was run." Section 4.5 and Q3 A say such a test
"is not a Story, so nothing fails it unless it reads the evidence". That is the silent skip the user named, and R8
says it must not exist. "Nothing fails such a test today either" is true only because no rule exists yet.
Fix (either): a Vitest setup file whose `afterEach` fails the test if any Runtime that test started recorded an
unexpected `RuleBroken` (no throw inside the app, so Q3 A's reason stands); or amend R8 to say "Story" and record
the user's decision. Also make `rules` a required `runtimeSetup` option: with a default of `"judge"` a forgotten
option judges in production too, against @plan.Rules Goal ("outside tests a rule runs only where the Runtime
setup says `rules: "judge"`"), and a production setup that says `"off"` and is reused by `Story.app` must be
stated to be overridden (Types Q5: "Stories and the CLI always judge"). The proposal never says so.

**H4. Feature #36 ("a host can never remove a fragment's rule") is not kept; it is replaced by tooling that has
H1's blind spots.** The inventory marks it "at risk"; it is lost as a guarantee. Trace: `Editor` places `Upload`;
a test-file `app()` lists `{ machine: EditorMachine, rules: [EditorRules] }`; `UploadRules` is dropped; nothing
runs the scan on that entry (H1). Also unspecified: placement inside another fragment (a subroutine placing a
trait): section 2 says `RulesSubjectAbsent` covers "a fragment it places"; say whether that is transitive, and
that the check walks the compiled placements, not the entry's key.
Fix: with H1's construction check, the entry is refused when any placed fragment has a registered set it omits.

**H5. Static proofs hang on entries, so an unlisted set is never proved.** Inventory #11 and #12 (`TerminalLeft`,
`RuleSubjectUnreachable`) are "per entry". A set that no entry lists (the exact failure the scan exists to
find) gets no proof, even though both depend only on the subject's compiled graph and the set.
Fix: prove them per set in `flow check`, from `rules()`'s subject, and list entries only for coverage and the judge.
Also: a trait has no states, so `terminals` and an `in` token in a trait's set must be refused by type and at
construction (the proposal says only that the builder gets `S` for a subroutine).

## Medium

**M1. The reporter is the wrong runner for the scan.** A Vitest reporter observes a run: it cannot fail a single
test, `--reporter=dot` on the command line replaces it, and a one-file run still loads the project's reporter
but not necessarily the scan's cost model. Section 2 says "`nub run test` fails on an unregistered set too".
Fix: run it in a Vitest `globalSetup` (throws before any test, whatever the reporter), and have `flow check`
call the same function.

**M2. The lint and the globs can disagree, and lint is not part of a test run.** `flow-state/rules-file` says a
`rules()` call is a top-level export of a `*.rules.ts` file; the config's `rules` globs are a separate list
(`["fixtures/**/*.rules.ts", "tests/**/*.rules.ts"]` in the example). `src/features/x.rules.ts` passes lint and
is outside the globs. A disabled lint line, a non-exported set or an `export default` set in a file no glob matches
is unseen (section 7 admits the first). A barrel re-export gives one set twice: dedupe by set identity.
Fix: with H1's registry, add a test-end check "a set constructed in this process was listed by no entry"
(`RulesUnused`), which sees unexported and non-glob sets that were imported; default the glob to the whole project
and make lint compare file names to the globs.

**M3. Rule tokens are names only, so a switch can name a rule that is not in the run.** `RuleToken<K>` is
`{ "~rule": K }` (`spike/helper3.ts`, Types BodyCapture). `Verdict<R>`'s `R` is "run rule ids and the entry's set
tokens" (#28), a union of strings. Trace: `OrderRules` and `CartRules` both declare `NotEmpty`; a Story over an app
that lists only `OrderRules` writes `off: [CartRules.NotEmpty]`; it compiles (same name) and judges nothing; the
rule the author meant to silence, or expect broken, is a no-op. Likewise `off: [EditorRules]` for a set the entry
omits.
Fix: a token carries its set (`{ "~set": SetId; "~rule": K }`), and a switch entry whose set is not on the run's
entries is a `StoryScriptFault` at run start (Host R8's "script fault rejects").

**M4. Typing claims are only partly supported.**
- The spike is a toy and machine-only; `Machine<D> | Trait<D> | Subroutine<D>` inference (one `D` from a union of
  three members, two of them not yet built, @task.V3.T109) is not spiked. A spike with the real `Machine<D, R>`
  parameter is needed before "typed from its subject" is claimed for fragments.
- `rules<D, const R>` with `ExactRules<NoInfer<D>, R>` captures the whole returned object, `check` functions
  included, and applies `Exact` to it: the mechanism Types Q19 measured at +31% and dropped (option C). The
  proposal's section 6 says `B` is deleted, but the capture returns inside `rules()`. Q19's own cheaper shape
  (infer `I` and `T` from the keys of two mapped records, no body capture) fits here too and keeps one rule:
  exactness at construction only.
- The spike's `RuleSet` is `{ machine } & tokens`: a rule named `machine`, `subject` or `build` collides with the
  set's own fields. Reserve those names or keep fields under `~`.

**M5. Specs and the Plan need edits, and the Plan edit needs the user's approval.** AGENTS: no Plan edit before the
user accepts the list. Needed:
- @plan.Rules Goal ("everywhere it already runs the machine"), O1 (`rules` block in `machine()`), O3 (typed
  `machine.rules.<Name>`, `machine()` refuses a duplicate), O6 ("Rules stay inline ... nothing needs registering",
  the 2026-11-20 [decided: user]), O7 ("a host can never remove"), V1, V7, V8.
- @spec.Types: R9, I12, I13, Q2, Q3, Q17, `BodyTokens` (`turn`), `Machine`'s second parameter, `ExactBodyOf`,
  `Compiled.rules` ("the rules, branded names"), `RuleNames`.
- @spec.Host: `RuleSources` ("machine rules (the body, `Compiled.rules`)"), `judge`'s signature (it needs the
  entry's sets, not `Compiled.rules`), `storyApp`, `PublicFaces` ("machine rules use `Machine<D, R>["rules"]`"), R8
  (H3), the `Verdict<R>` row. @spec.Changes: the per-copy judge reads sets by fragment subject.
- @task.V3.T106 (title and Approach: "in `machine()`"), @task.V3.T113 (the `Machine<D, R>` parameter), @task.V3.T114
  (the judge's input), @task.V3.T109 (`Story.fragment`'s first argument).

**M6. Two earlier features are lost and not in the 38.** (1) Plan O1's bare-function entry form
(`CommitMovesByOne: ({ before, after }) => ...`): the proposal's turns always use `turn({ ... })`; say whether the
bare form stays (without `event`, it types fine). (2) Plan O6's build-time constant for dropping rules from a
bundle: section 3 says it does not carry over, but names no replacement and no measure of the closures that ship
under `"off"`. Add both to the list as "changed", with the reason.

## Low

- **L1.** `rules` now means three things: the entry's `rules: [sets]`, `Story.app`'s `rules: runRules` (run rules),
  and `.rules({ expectBroken, off })`. Rename the Story option or the entry key.
- **L2.** Host I17 (a printed failing Story replays from its text) needs the printed text to name the entry's sets
  and set tokens; a token has no binding name at run time. Not in the inventory.
- **L3.** `Story.machine({ machine, rules }, { id, context })` repeats `context` (the existing entry form
  `{ machine, context }` and Story's own option). State which wins.
- **L4.** The scan and registry must compare subjects by id (`definition.id`), not object identity: the reporter
  and the workers load modules in different graphs.
- **L5.** Inventory #16 ("entry list order") makes rule ids order-dependent on a list the author may reorder; confirm
  only report order, not identity, depends on it.

## Walk of the inventory

Present with a working mechanism (not repeated): #1 to #10, #13 to #35, #37 and #38. Claimed only: #36 (H4).
Weak: #11 and #12 (H5), #28 (M3), #30 (H3: default). Missing from the list: M6 (1) and (2).

## The proposal's three questions

1. **Where sets connect: A holds only with H1 and H2 fixed.** Locality is right and spreads carry sets, but as
   specified the entry is checked by a scan that cannot see test-file entries. Take A with a construction-time check
   and a definition subject.
2. **Scan runner and severity: A (error) holds;** run it from a Vitest `globalSetup`, not the reporter (M1).
3. **Plain Runtime tests: A does not hold as written,** because Host R8 forbids it. Keep A's single switch and add
   the setup-file check (or amend R8 with the user's yes) (H3). Make `rules` required.
4. **Types Q19:** consistent with Q19 (C, `B` deleted) and Q5 (no `enabled`, `judge`/`off`), apart from the capture
   inside `rules()` (M4).
