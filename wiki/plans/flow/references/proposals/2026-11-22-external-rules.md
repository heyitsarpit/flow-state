---
proposal external-rules
status proposed 2026-11-22
description Proposes attaching rules with a chained `.rules(build)` that only Stories judge, with three points decided by the user.
---
# Rules attached with `.rules(build)`, judged only by Stories

**Bottom line (proposed; three points decided by the user, see Decisions):** rules are optional. A machine, trait or
subroutine gets them with a chained `.rules(build)`, which returns the same value with typed tokens
(`OrderMachine.rules.PaidHasReceipt`); a value with no `.rules(...)` has no rules. Only Story tooling judges rules:
Stories and everything built from them (generated runs, sweeps, `propertyTest`). An app's Runtime never reads them,
so rules ship in the bundle but never run outside a Story. One silent case remains: rules were written but the bare
value is the one run. Four checks close it:

- `flow check` warns when an app or Story runs a bare value whose ruled form it also loads (`RulesBypassed`, static);
- a run holding two values of one id with different rules is refused (`RulesDiffer`);
- a lint rule stops a module from exporting the bare value it rules;
- rule coverage lists every value with no rules.

This cuts the Runtime switch, the live judge, `RuleBroken` evidence and 8 of the 40 earlier features (section 4).

**Why now:** the user decided (2026-11-22) that rules are judged only by Story tooling, that they are optional, and
that complexity this makes unneeded is removed. Two reviews (@review.review-external-rules-a,
@review.review-external-rules-b) are folded in.

**Read first:** @review.review-external-rules-a; @review.review-external-rules-b; @plan.Rules; @spec.Host (R8, R12,
the judge, `verdictOf`, `RuleSources`); @spec.Types (Q3, Q5, Q19).

**Supersedes:** @spec.Types Q3 (`turn` a body token) by decision 3; @plan.Rules O2's "proved by `flow check` only" by
decision 2; @spec.Types Q5 (`rules: "judge" | "off"`) and @plan.Rules O6 (outside tests) by the Story-only decision.

## 1. The API

```ts
// existing: machine, definition, S, E, check, in, on, invariants, turns, terminals, event, before, after
// NEW: .rules (on what machine(), trait() and subroutine() return), rules(source, build)
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

export const PayMachine = machine(Pay, PayBody)   // no rules: PayMachine.rules is {}
```

```ts
// src/rules.ts (types). NEW: Build, RuleToken, rules; Machine gains N (names from the rules object)
type Machine<D, N extends string = never> = {
  readonly definition: D
  readonly construction: Construction
  readonly rules: { readonly [K in N]: RuleToken<`${D["id"]}.${K}`> }
  // present only while N is never: a ruled value has no .rules method
  rules<const I extends string = never, const T extends string = never>(build: Build<D, I, T>): Machine<D, I | T>
}
type Build<D, I extends string, T extends string> = (tokens: RuleTokens<D>) => {
  readonly invariants?: { readonly [K in I]: Invariant<D> }
  readonly turns?: { readonly [K in T]: K extends I ? { readonly "~error": "a rule name is used twice" } : Turn<D> }
  readonly terminals?: ReadonlyArray<StateToken<D>>
}
type RuleToken<Id extends string> = { readonly "~rule": Id }              // Id: `${subject id}.${Name}`
declare const rules: <D, const I extends string = never, const T extends string = never>(
  source: D | Machine<D>, build: Build<D, I, T>) => Build<D, I, T>       // returns the build itself: shared, typed
```

Spiked under `strict` and `exactOptionalPropertyTypes` on TypeScript 7.0.2 (scratchpad `spike/dup.ts`, `chain.ts`;
toy definitions, not the real package):

- names inferred from the keys alone, with no capture of the checks or the body;
- `event` typed through `turn`, and a wrong payload field refused;
- a duplicate name across `invariants` and `turns` refused at the key;
- `.rules` on a ruled value refused;
- a shared build typed from the definition, with the tokens kept.

The spike typed the bare and ruled values as two types. Expressing "a ruled value has no method" in one
`Machine<D, N>` is a build detail of @task.V3.T106.

- **Exactness is option C.** An unknown key (`chek`, `terminalz`, `in` on a turns rule) is refused by `.rules()` at
  construction and by `flow check`, never relied on in the types.
- **Construction refuses** (a cast or plain JavaScript meets the same reasons as the types, I13):
  - `RulesEmpty`: a build with no rule; write no `.rules(...)`.
  - `RuleNameTwice` and `InvalidName` (a reserved name).
  - `RulesWrongSubject`: a build typed from another definition, by id.
  - `.rules` on a ruled value is a type error; two ruled forms of one bare value are refused in a run by
    `RulesDiffer` (no mark on the object, see the Decisions).
  - An empty or repeated `terminals` list.
- **What each builder gets.** A machine gets `S`, `E` and `turn`. A trait gets `E` and `turn`, with no `terminals`
  and no `in`. A subroutine gets its own `S`, `E` (including `hostEvents`) and `turn`. The trait and subroutine
  forms are proved on the real types in @task.V3.T109.
- **One token id per rule:** `Shop/Order.PaidHasReceipt`, `Ui/Upload.CancelSticks`. A placement is not part of the id;
  breaks and coverage rows name it beside the rule (`at Desk/Editor/uploads[a]`), so `off: [Upload.rules.CancelSticks]`
  switches every placement. An app Story's `R` adds the tokens of fragments its definitions place, by a type walk of
  `D`; @task.V3.T109's acceptance adds a type test at depth two.

## 2. Where rules are judged, and what refuses

Every Story route starts through one function, `storyCompiled` in `src/host/testing/`, and ends in `verdictOf`. The
routes are `Story.app`, `Story.machine`, `Story.fragment`, generated runs, the reload and pair sweeps, and
`propertyTest`. `storyCompiled` walks every value the run can hold: the app's machines, the Story's subject, and
every placed fragment at any depth. Then:

1. **`RulesBypassed`: dropped** [decided: agent orchestrator 2026-11-22]. A module-level `WeakSet` mark is hidden
   global state: whether a Story is refused would depend on which modules happened to load, and a second loaded copy
   of Flow would not see the mark (the reason the `Made` brand is not a `WeakMap`). Why: a refusal must be
   deterministic; `RulesDiffer`, lint `no-bare-export`, `flow check` and the coverage rows cover the case. Reverse:
   restore the mark.
2. **`RulesDiffer`.** It refuses two values of one subject id that carry different rules: a bare one and a ruled one,
   or two different builds. A planted fault shares the original's build, so its tokens are the original's.
3. **Terminals** (decision 2). It proves each ruled value's `terminals` once (memoised per value), and a
   `TerminalLeft` fails the Story's verdict.
4. It records the run's rule sets and its values with no rules on the `StoryRun`.

`verdictOf` judges those sets over the run's evidence after the run. The Runtime and `app()` never read rules.

```ts
// order.ts rules base; app.ts imports base by mistake
const base = machine(Order, body)
export const OrderMachine = base.rules(orderRules)
Story.app(runtimeSetup({ app: app({ id: "shop", machines: { order: base } }), services }), { id, fixtures, runRules })
// flow check -> warning RulesBypassed: Shop/Order at machines.order has a ruled form, OrderMachine
```

## 3. The silent case, closed without making rules mandatory

The case is that rules were written but the bare value is the one that runs.

- **Both values in one run.** `RulesDiffer`.
- **The source.** The lint rule `flow-state/no-bare-export`: a module that calls `X.rules(...)` must not export `X`.
  A shared build is typed from the definition (`rules(Order, build)`), so the bare value never needs exporting.
- **Visible absence.** Rule coverage and `flow explain` list every value with no rules, as information:

  ```text
  Rule coverage  13 of 15 exercised; 2 values with no rules
    Ui/Upload.CancelSticks   at Desk/Editor/uploads    seen 2 (copies a, b)
    Shop/Pay                 no rules
  ```
- **Across modules no Story loaded.** `flow check` warns `RulesBypassed` over everything it loads: an app or a Story
  subject running a bare value of an id some loaded value has ruled.

What is left: a bare value that is never ruled in any loaded module has no rules, which is now the meaning of no
rules. The other cases close as follows:

- **A conditional `.rules(c ? build : …)`:** lint `flow-state/rules-argument` accepts an arrow or an identifier,
  never a conditional; nothing runs rules outside Stories, so a condition has no use.
- **A shared build nobody attaches:** an unused export (`knip`, `nub run report:unused`) or an unused local under
  `noUnusedLocals`, and its machine shows "no rules".
- **#14:** every Story route passes through `storyCompiled` and `verdictOf`, and Host R8 keeps the unjudged runner
  internal.
- **#25:** `runRules` is required on all three Story constructors, passed once in a Story helper.
- **#36:** a placed fragment is the value the definition names, so its rules ride every placement; `RulesDiffer`
  and `flow check` walk placements too.
- **Plain Runtime tests** judge nothing, by decision; Host R8 becomes "a Story that breaks a rule fails, however it
  was run".

## 4. The 40 features, re-walked

Where a feature is unchanged apart from the token's home, it says "kept".

1. `invariants`: kept.
2. `turns`, accepted only: kept.
3. Subjects `in` and `on`: kept.
4. `event` from `on`: kept, through the builder's `turn`.
5. What a check reads, with `context` only in turns rules: kept.
6. A restore: kept.
7. The judge per `Turn`: **simpler**: one pass over the evidence in `verdictOf`, with the same table.
8. The per-Runtime `last` map: **cut**.
9. One namespace: kept, now a type error across kinds as well.
10. Typed tokens: kept, carrying the subject id.
11. Terminals: kept, proved in `flow check` and at Story start.
12. `RuleSubjectUnreachable`: kept.
13. `flow explain`: kept, listing values with no rules.
14. Every Story route judges: kept.
15. Shrinking: kept.
16. Several breaks at once: kept.
17. The Story switch: kept.
18. `off` by rule or `"all"`: kept; a whole value in `off` is **cut** as unneeded.
19. Both lists refused: kept.
20. `Expect` narrowing: kept.
21. `neverBroke`: kept.
22. Derived runs inherit the switch: kept.
23. The sweep drops `expectBroken` in forks: kept.
24. `propertyTest` runs every seed: kept.
25. Project run rules: kept, on all three constructors.
26. Flow's own run rules' modes: kept.
27. Tooling rules: kept.
28. `Verdict<R>` over token ids: kept.
29. Coverage: kept, with expected rules listed and values with no rules listed.
30. The Runtime switch: **cut**.
31. `RuleBroken` evidence and redaction: **cut**; a break is a `Broken` in the verdict.
32. A throwing check: **simpler**: it is `RuleThrew`.
33. The CLI exit: kept.
34. A fragment rule's reads, and `on` matching a host's raise: kept.
35. Per placement and copy: kept.
36. A fragment's rules cannot be removed: kept.
37. A fragment token switches every placement: kept.
38. `Story.fragment` alone, and planted faults: kept.
39. The bare function entry: kept.
40. Leaving rules out of a bundle: **cut**.

Also cut: Plan O6 whole, Host R12's live half, `none`, `RulesMissing`, `brokenRules`, the Vitest setup file, a
required `rules` setting, and a shared build's brand and overload.

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

**4. Derived runs** start through `storyCompiled` from the Story's subject and inherit its switch as data:

- **Generated runs:** `samplesOf({ story })`.
- **`propertyTest`:** the same samples; every seed runs.
- **Reload sweep:** forks, with `expectBroken` dropped in forks.
- **Pair sweep:** at each phase and fault.

**5. Plain Runtime tests** judge nothing; a test that wants rules is a Story.

**6. Values made in a test file** carry rules if `.rules(...)` is called where they are defined; `RulesDiffer` applies
in their Stories as anywhere.

**7. Tests that assert on rules** read the verdict; coverage is the reporter's function over finished runs.

```ts
// existing: StoryFailed { verdict, run }, Broken; NEW: Broken.at (the placement), ruleCoverage (flow-state/testing)
const failed = await Effect.runPromise(Effect.flip(refundTwice.run()))
expect(failed.verdict.broken.map((b) => b.rule)).toEqual(["Shop/Order.RefundAddsUp"])
const coverage = ruleCoverage([run1, run2])
// { exercised: 13, total: 15, noRules: ["Shop/Pay", "Shop/Shopper"], rows: [{ rule: "Shop/Order.PaidHasReceipt",
//   seen: 0, why: "in PAID, never reached" }] }
```

## 6. What it deletes

- **From the body:** the `rules` key, `turn` in `BodyTokens<D>`, `const B`, `Exact`, `ExactBodyOf`, `RuleNames<B>`,
  G3 (Q19 C), and `Compiled.rules`.
- **From the host:** the setup's `rules` option (Types Q5), the driver's judge and its `last` map, the `RuleBroken`
  evidence kind and its redaction. @plan.Rules O6 goes whole.
- **From earlier revisions:** sets bound to subjects, entry `rules`, the scan, `RulesUnregistered`,
  `RulesSubjectAbsent`, `brokenRules`, the Vitest setup file, `Rules<D, N>` and its overload, `none`,
  `RulesMissing`, and the fixture migration.
- **Kept from @spec.Types:** R9 and I12 in a new form (names come from the rules object; `Machine<D, N>` assigns to
  `Machine<D>`), and I13's twin refusals, raised by `.rules()`.
- **New, small:**
  - the API: `.rules`, `rules(source, build)`, `ruleCoverage`;
  - refusals: `RulesDiffer`, `RulesEmpty`, `RulesWrongSubject`; the `flow check` warning `RulesBypassed`;
  - two lint rules: `no-bare-export` and `rules-argument`;
  - `storyCompiled`.

## 7. Risks

- **Judging from evidence:** rules read private memory, which the public `Published` snapshot hides, so `verdictOf`
  must read the run's internal incarnation records; verify in @task.V3.T114.
- **`RulesBypassed` reach:** `flow check` sees only the modules it loads; lint `no-bare-export` covers the source.
- **App token typing:** the type walk for placed fragments' tokens is unbuilt (T109).

## Decisions

1. **Rules are optional** [decided: user 2026-11-22]: a value with no `.rules(...)` has no rules; there is no `none`
   and no refusal of a value without rules. The case "rules written, bare value run" is closed by
   `RulesDiffer`, lint `no-bare-export`, the "no rules" coverage rows and `flow check`'s warning. Why: most values
   have no rules, and a mandatory `.rules(none)` would add an edit to every one of them for a claim the checks
   already make visible. Reverse: require `.rules(...)` on every value a Story runs, with `none`.
2. **Terminals are also proved when a Story starts** [decided: user 2026-11-22], in `storyCompiled`, memoised per
   value; a `TerminalLeft` fails the Story. Overturns @plan.Rules O2's "proved by `flow check` only". Why: a value
   only a test runs is otherwise never proved. Reverse: `flow check` only.
3. **`turn` moves from the machine body to the rules builder** [decided: user 2026-11-22], superseding @spec.Types
   Q3. Why: its memory type comes from the definition, which `.rules` has, and the body no longer holds rules.
   Reverse: `turn` back as a body token.

Settled by the agent, in the direction the user asked for (more correct for the user):

- **One ruled form per bare value** [decided: agent orchestrator 2026-11-22]: `.rules` on a ruled value is a type
  error; a second `.rules` on the same bare value is not refused at run time, since that needs a mark on the object;
  `RulesDiffer` refuses two builds of one id in a run. Why: no hidden state. Reverse: a mark on the bare value.
- **`RulesBypassed` is a `flow check` warning only** [decided: agent orchestrator 2026-11-22]: the runtime mark is
  dropped (section 2, item 1). Why: `flow check` loads every module it checks, so its warning is deterministic.
  Reverse: the mark.