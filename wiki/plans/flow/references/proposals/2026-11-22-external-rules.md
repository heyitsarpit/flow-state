---
proposal external-rules
status proposed 2026-11-22
---
# Rules attached with `.rules(build)`, judged only by Stories

**Bottom line (proposed):** rules attach to a machine, trait or subroutine with a chained `.rules(build)`, which
returns the same value with typed tokens (`OrderMachine.rules.PaidHasReceipt`). Only Story tooling judges rules:
Stories and everything built from them (generated runs, sweeps, `propertyTest`). An app's Runtime never reads them,
so rules ship in the bundle but never run outside a Story. A Story refuses to start on a value without `.rules(...)`
(`.rules(none)` declares none). Two values of one definition with different builds are refused, and every value
with `none` is listed in rule coverage. So a rule is either judged or visibly absent. This cuts the Runtime switch,
the live judge and `RuleBroken` evidence, and 8 of the 40 earlier features (section 4).

**Why now:** the user decided (2026-11-22) that rules are judged only by Story tooling and that complexity this
makes unneeded is removed. Two reviews of the `.rules()` design (@review.review-external-rules-a,
@review.review-external-rules-b) are folded in.

**Read first:** @review.review-external-rules-a; @review.review-external-rules-b; @plan.Rules; @spec.Host (R8, R12,
the judge, `verdictOf`, `RuleSources`); @spec.Types (Q3, Q5, Q19).

**Supersedes, with the user's yes needed:** @spec.Types Q3 (`turn` a body token, decided 2026-11-22): `turn` moves to
the rules builder, for the same reason Q3 gives (its memory type comes from the definition, which `.rules` has).
@spec.Types Q5 (`rules: "judge" | "off"`) and @plan.Rules O6 (outside tests) are removed by the user's decision.

## 1. The API

```ts
// existing: machine, definition, S, E, check, in, on, invariants, turns, terminals, event, before, after
// NEW: .rules (on what machine(), trait() and subroutine() return), none, rules(source, build)
// moved: turn (from the body's tokens to the rules builder's)
// user-defined: Order, OrderMachine, PaidHasReceipt, RefundAddsUp, ClosedStaysClosed, receipt, refunded, closed
export const OrderMachine = machine(Order, ({ S }) => ({
  default: S.OPEN,
  on: {/* handlers */},
})).rules(({ S, E, turn }) => ({
  invariants: {
    PaidHasReceipt: { in: S.PAID, check: ({ memory }) => memory.receipt !== null },
  },
  turns: {
    RefundAddsUp: turn({
      on: E.Refund,
      check: ({ event, before, after }) => after.memory.refunded === before.memory.refunded + event.amount,
    }),
    ClosedStaysClosed: ({ before, after }) => !before.memory.closed || after.memory.closed, // bare form, no event
  },
  terminals: [S.REFUNDED],
}))

OrderMachine.rules.PaidHasReceipt   // RuleToken<"Shop/Order.PaidHasReceipt">
OrderMachine.rules.Typo             // type error
```

```ts
// src/rules.ts (types). NEW: Bare, Build, RuleToken, none, rules; Machine gains N (names from the rules object)
type Bare<D> = {
  readonly definition: D
  rules<const I extends string = never, const T extends string = never>(build: Build<D, I, T>): Machine<D, I | T>
}
type Build<D, I extends string, T extends string> = (tokens: RuleTokens<D>) => {
  readonly invariants?: { readonly [K in I]: Invariant<D> }
  readonly turns?: { readonly [K in T]: K extends I ? { readonly "~error": "a rule name is used twice" } : Turn<D> }
  readonly terminals?: ReadonlyArray<StateToken<D>>
}
type RuleToken<Id extends string> = { readonly "~rule": Id }              // Id: `${subject id}.${Name}`
type Machine<D, N extends string = never> = {
  readonly definition: D
  readonly construction: Construction
  readonly rules: { readonly [K in N]: RuleToken<`${D["id"]}.${K}`> }
}
declare const none: () => Record<never, never>                           // one frozen function, compared by identity
declare const rules: <D, const I extends string = never, const T extends string = never>(
  source: D | Bare<D>, build: Build<D, I, T>) => Build<D, I, T>          // returns the build itself: shared, typed
```

Spiked under `strict` and `exactOptionalPropertyTypes` on TypeScript 7.0.2 (scratchpad `spike/dup.ts`, `chain.ts`;
toy definitions, not the real package):

- names inferred from the keys alone, with no capture of the checks or the body;
- `event` typed through `turn`, and a wrong payload field refused;
- a duplicate name across `invariants` and `turns` refused at the key;
- `.rules` on a ruled value refused (`rules` is a record there);
- a shared build typed from the definition, with the tokens kept;
- `.rules(none)` gives `rules: {}`.

With one overload, an error is reported at the field (reviewer B's L3).

- **Exactness is option C.** An unknown key (`chek`, `terminalz`, `in` on a turns rule) is refused by `.rules()` at
  construction and by `flow check`, never relied on in the types.
- **Construction refuses:** an empty build other than `none` (`RulesEmpty`: write `none`), a duplicate name past a
  cast (`RuleNameTwice`), a reserved name (`InvalidName`), a build typed from another definition (`RulesWrongSubject`,
  by id), and an empty or repeated `terminals` list.
- **What each builder gets.** A machine gets `S`, `E` and `turn`. A trait gets `E` and `turn`: it has no states, so
  its build has no `terminals` and no `in` (reviewer B spiked this on a toy). A subroutine gets its own `S`, `E` with
  `hostEvents`, and `turn`. The trait and subroutine forms are proved on the real types in @task.V3.T109.
- **One token id per rule.** A token carries its subject's id: `Shop/Order.PaidHasReceipt`, `Ui/Upload.CancelSticks`.
  A placement is not part of the id; `Broken` and coverage rows name it beside the rule
  (`Ui/Upload.CancelSticks at Desk/Editor/uploads[a]`). So `off: [Upload.rules.CancelSticks]` switches every
  placement. An app Story's `R` adds the tokens of fragments its definitions place, by a type walk of `D`
  (@task.V3.T109 acceptance: a type test at depth two).

## 2. Where rules are judged, and what refuses

Every Story route (`Story.app`, `Story.machine`, `Story.fragment`, generated runs, the reload and pair sweeps,
`propertyTest`) starts through one function, `storyCompiled` in `src/host/testing/`, and ends in `verdictOf`.
`storyCompiled` walks every value the run can hold (the app's machines, the Story's subject, every placed fragment at
any depth) and:

1. refuses a value with no `.rules(...)`: `RulesMissing`, naming the value and where it is placed;
2. refuses two values of one subject id whose builds are different objects: `RulesDiffer`. A planted fault shares
   the original's build, so its tokens are the original's;
3. records the run's rule sets on the `StoryRun`.

`verdictOf` judges those sets over the run's evidence after the run. The live judge, its `last` map and the Runtime
switch are gone. The Runtime and `app()` accept bare and ruled values alike, because they never read rules. Types
give an early signal only where the subject is direct: `Story.machine` and `Story.fragment` take a ruled value.

```ts
// a bare value reaches a Story
const base = machine(Order, body)
Story.app(runtimeSetup({ app: app({ id: "shop", machines: { order: base } }), services }), { id, fixtures })
//   -> rejects RunRejected(RulesMissing: Shop/Order at machines.order has no .rules(...); write .rules(none))
```

## 3. Every silent case, closed

- **`.rules(none)` by mistake.** `none` is the only empty build `.rules()` accepts, so a hidden none
  (`() => ({})`, `invariants: {}`) is refused. Rule coverage prints a row for every value with `none`
  (`Number/Stepper: no rules`), so the claim is visible in every run that holds it.
- **A conditional `.rules(c ? build : none)`.** No longer has a reason to exist, since nothing runs rules outside
  Stories. The lint rule `flow-state/rules-argument` takes an arrow, an identifier or `none`, never a conditional.
- **A shared build nobody attaches.** `rules(Def, build)` returns the build itself, so an unattached one is an unused
  export, reported by `knip` (`nub run report:unused`), or an unused local under `noUnusedLocals`. The machine it was
  meant for carries `none`, which coverage lists. Flow adds no registry for dead code.
- **Two values, one id, different builds.** `RulesDiffer` within a run (section 2). Across runs, `flow check` warns
  over every value it loads, since coverage rows join by id.
- **#14, every run judges:** the mechanism is `storyCompiled` plus `verdictOf`, the only door of every Story route
  (Host R8 already makes the unjudged runner internal).
- **#25, project run rules:** `runRules` is required on `Story.app`, `Story.machine` and `Story.fragment` alike (Host
  R8's "requires the rules"), passed once in a Story helper.
- **#36, a host cannot remove a fragment's rules:** the placed value is the ruled trait. `storyCompiled` refuses a
  bare placement by walking the compiled placements, so a cast cannot get past it.
- **Terminals for values only tests run.** `storyCompiled` proves `terminals` once per value (memoised), and a
  `TerminalLeft` fails that Story's verdict. `flow check` proves them too. This overturns one line of @plan.Rules O2
  decided 2026-11-22 ("proved by `flow check` only, never judged by runs"), so it is question 2. It sits in the Story
  door, not in the Runtime's `compiledOf`, because the Runtime never reads rules.
- **Plain Runtime tests:** they judge nothing, by decision. A test that wants rules is a Story. Host R8 becomes "a
  Story that breaks a rule fails, however it was run".

## 4. The 40 features, re-walked

Where a feature is unchanged apart from the token's home, it says "kept".

1. `invariants` at every publication: kept.
2. `turns` on accepted turns only: kept.
3. Subjects `in` and `on`: kept.
4. `event` from `on`: kept, through the builder's `turn`.
5. What a check reads, with `context` only in turns rules: kept.
6. A restore: invariants judge it, turns rules skip it: kept.
7. The judge per `Turn`: **simpler**: one pass over the run's evidence in `verdictOf`, with the same table.
8. The per-Runtime `last` map: **cut**; `before` is the previous `Published` in the evidence.
9. One namespace and duplicate refusal: kept, now a type error across kinds as well (spiked).
10. Typed tokens: kept on the value, carrying the subject id.
11. Terminals, an empty or repeated list refused: kept, proved in `flow check` and, if question 2 says so, at Story
    start.
12. `RuleSubjectUnreachable`: kept, in `flow check`.
13. `flow explain` lists rules: kept, per value, `none` included.
14. Every Story route judges: kept, through `storyCompiled` and `verdictOf`.
15. A break shrinks to the shortest Story: kept.
16. Several breaks at once: kept, invariants first, then declaration order.
17. `.rules({ expectBroken, off })` on a Story: kept.
18. `off` by rule or `"all"`: kept. A whole value in `off` is **cut** as unneeded, since `"all"` and tokens cover it.
19. A rule in both lists is refused: kept.
20. `Expect { rule, step?, actor?, where? }`: kept.
21. `neverBroke`, and the run goes on after a break: kept.
22. Derived runs inherit the switch: kept.
23. The reload sweep drops `expectBroken` in forks: kept.
24. `propertyTest` runs every seed: kept.
25. Project run rules: kept, `runRules` required on all three constructors.
26. Flow's run rules' modes in Flow's own helper; `broken` renamed: kept.
27. Tooling rules: kept.
28. `Verdict<R>` over token ids: kept.
29. Rule coverage: kept, with expected rules listed as expected and a row per `none` value.
30. The Runtime switch `"judge" | "off"`: **cut**.
31. `RuleBroken` evidence, private fields redacted, the app carries on: **cut**. A break is a `Broken` in the
    verdict, and the Story trace shows its snapshots as any trace does.
32. A throwing check gives `threw: true`: **simpler**: it is the existing `RuleThrew` tooling rule.
33. The CLI exit follows the verdict: kept.
34. A fragment rule reads only the fragment; `on` matches a host's raise: kept.
35. Per placement and copy; entry, reset and exit skipped; a frozen trait not judged: kept, in `verdictOf`.
36. A fragment's rules cannot be removed: kept (section 3).
37. A fragment token switches every placement: kept, with one id per rule.
38. `Story.fragment` judges alone; a planted fault per kind: kept; faults share builds.
39. The bare function entry: kept.
40. Leaving rules out of a bundle: **cut**. Rules ship and never run outside Stories.

Also cut, with no number of their own: Plan O6 (outside tests) whole; Host R12's "judged live"; the `RuleBroken`
evidence kind and its inspector path; and, from the last revision, `brokenRules`, the Vitest setup file, a required
`rules` on `runtimeSetup`, and the brand and overload of a shared build.

## 5. Story and test cases

**1. App Stories, with custom fixtures.** Fixtures replace services and world words change the world; neither
touches rules, which ride the app's values.

```ts
// existing: Story.app, id, fixtures, .rules, expectBroken, off, step, actor; renamed: rules -> runRules
// user-defined: storeStory, refundTwice, ShopFake, CartFakeDown, mainOrder, runRules
const storeStory = (id: string) => Story.app(storeSetup, { id, fixtures: [ShopFake, CartFakeDown], runRules })
export const refundTwice = storeStory("shop/refund-twice")
  .rules({
    expectBroken: [{ rule: OrderMachine.rules.RefundAddsUp, step: 3, actor: mainOrder }],
    off: [OrderMachine.rules.ClosedStaysClosed, Upload.rules.RefNeverChanges],
  })
  .send(mainOrder, Order.E.Refund({ amount: 5 }))
```

**2. Machine Stories** (planned, @task.V3.T76), whether or not the machine is in an app:

```ts
// tests/number-input/faults.ts: the planted fault shares the original's build, so the tokens are the same rule
export const UnclampedStepperMachine = machine(Stepper, unclampedBody).rules(stepperRules)
export const setUnclamped = Story.machine(UnclampedStepperMachine, { id: "number-input/set-unclamped", runRules })
  .rules({ expectBroken: [UnclampedStepperMachine.rules.SetLandsInBounds] })   // "Number/Stepper.SetLandsInBounds"
  .send(Stepper.E.Configure({ settings: bounded }))
  .send(Stepper.E.Set({ value: 99 }))
```

**3. Fragment Stories** (planned, @task.V3.T109). The trait is judged on Flow's stand-in host; host Stories judge
each placement and copy under the same token id.

```ts
// existing (Plan): trait, Story.fragment, enter, leave; NEW: .rules on a trait (E and turn; no S)
export const Upload = trait(UploadSpec, () => ({
  on: { Cancel: { target: "self", updateMemory: () => ({ cancelled: true }) } },
})).rules(() => ({
  turns: {
    CancelSticks: ({ before, after }) => !before.memory.cancelled || after.memory.cancelled,
    RefNeverChanges: ({ before, after }) => before.memory.ref === after.memory.ref,
  },
}))

export const uploadAlone = Story.fragment(Upload, { id: "upload/alone", runRules })
  .enter({ ref: "file-1" })
  .send(Upload.E.Cancel({}))
  .leave()
```

```text
Rule coverage  13 of 15 exercised; 2 values with no rules
  Ui/Upload.CancelSticks   at Upload (stand-in)              seen 1
  Ui/Upload.CancelSticks   at Desk/Editor/uploads            seen 2 (copies a, b)
  Shop/Pay                 no rules
```

**4. Derived runs** start through `storyCompiled` from the Story's subject and inherit its switch as data:

- **Generated runs:** `samplesOf({ story })`.
- **`propertyTest`:** the same samples; every seed runs.
- **Reload sweep:** each Story, forked, with `expectBroken` dropped in forks.
- **Pair sweep:** the same samples, at each phase and fault.

**5. Plain Runtime tests** judge nothing. To check rules, write the test as a Story.

**6. Values made in a test file** are ruled where they are defined (`.rules(build)` or `.rules(none)`). A Story
refuses a bare one, and nothing scans the file.

**7. Tests that assert on rules** read the verdict. Coverage is the reporter's function over finished runs.

```ts
// existing: StoryFailed { verdict, run }, Broken; NEW: Broken.at (the placement), ruleCoverage (flow-state/testing)
const failed = await Effect.runPromise(Effect.flip(refundTwice.run()))
expect(failed.verdict.broken.map((b) => b.rule)).toEqual(["Shop/Order.RefundAddsUp"])
const coverage = ruleCoverage([run1, run2])
// { exercised: 13, total: 15, none: ["Shop/Pay"], rows: [{ rule: "Shop/Order.PaidHasReceipt", seen: 0,
//   why: "in PAID, never reached" }] }
```

## 6. What it deletes

- **From the body:** the `rules` key, `turn` in `BodyTokens<D>`, `const B`, `Exact`, `ExactBodyOf`, `RuleNames<B>`,
  G3 (Q19 C), and `Compiled.rules`.
- **From the host:** the setup's `rules` option (Types Q5), the driver's judge (`host/judge.ts`), its `last` map,
  the `RuleBroken` evidence kind, and the redaction of rule evidence (Host R12's live half). @plan.Rules O6 goes
  whole.
- **From earlier revisions:** sets bound to subjects, entry `rules`, the scan, the lint for `*.rules.ts`,
  `RulesUnregistered`, `RulesSubjectAbsent`, `brokenRules`, the Vitest setup file, `Rules<D, N>` and its overload.
- **Kept from @spec.Types:** R9 and I12 in a new form (names come from the rules object; `Machine<D, N>` assigns to
  `Machine<D>`), and I13's twin refusals, now raised by `.rules()`.
- **New, small:** `.rules`, `none`, `rules(source, build)`, `RulesMissing`, `RulesDiffer`, `RulesEmpty`,
  `RulesWrongSubject`, the lint rule `flow-state/rules-argument`, `storyCompiled`, `ruleCoverage`, and the
  `.rules(none)` migration (about 67 fixture values that Stories run; a codemod).

## 7. Risks

- **Judging from evidence:** a rule reads private memory and the guard's view, while the public `Published` snapshot
  is the outside view. `verdictOf` must read the run's internal incarnation records, as it reads `RunIndex`; verify
  in @task.V3.T114.
- **App token typing:** the type walk that gives an app Story the placed fragments' tokens is unbuilt (T109).
- **Migration:** every value a Story runs gains `.rules(...)`.

## Questions

1. **Bare values at Story start.** A: a Story refuses a value with no `.rules(...)`, so `.rules(none)` is written on
   every value a Story runs. B: a bare value means no rules, with no refusal: no migration, but a Story that runs
   `base` instead of `OrderMachine` judges nothing and lists it only as a `none` row. **Recommendation: A**, the
   only one with no silent case.
2. **Terminals at Story start.** @plan.Rules O2 says terminals are proved by `flow check` only. A: also prove them in
   `storyCompiled`, so a value only a test runs is proved and a `TerminalLeft` fails its Story. B: keep O2;
   `flow check` only. **Recommendation: A**: one memoised graph pass per value, and a proof cannot be skipped by where
   the value lives.
3. **`turn` moves to the rules builder** (supersedes Types Q3, decided 2026-11-22). A: accept. B: keep `turn` an
   imported function typed by its `on`. **Recommendation: A**, for Q3's own reason.
