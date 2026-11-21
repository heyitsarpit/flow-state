---
proposal external-rules
status proposed 2026-11-22
---
# Rules attached with `.rules(build)`

**Bottom line (proposed):** rules attach to a machine, trait or subroutine with a chained `.rules(build)`, which
returns the same value with its rules and typed tokens (`OrderMachine.rules.PaidHasReceipt`). A build can live in
another module as a value typed from the definition, so two machines of one definition share it. Anything that runs
the value has its rules, so there is no registry, no scan and no `RulesUnregistered`. The bare value from
`machine()`, `trait()` or `subroutine()` cannot be run or placed until `.rules(...)` is called (`.rules(none)` for
no rules). That one rule removes the two-values risk by type and at construction. All 40 earlier rule features are
kept (section 4).

**Why now:** the user chose (2026-11-22) to attach rules with `.rules(build)` instead of registering a separate
value. Exactness is option C (@spec.Types Q19): there is no captured body type, and deny codes stay inline. This
revision answers @review.review-external-rules (H1 to H5, M1 to M6, L1 to L5) against that design.

**Read first:** @review.review-external-rules; @review.rules-exactness-inventory (nothing of the rules machinery is
built); @plan.Rules; @spec.Host (R8, R11, R12, the judge, `verdictOf`); @spec.Types (Q5, Q19).

## 1. The signature

```ts
// existing: machine, definition, S, E, check, in, on, invariants, turns, terminals, event, before, after
// NEW: .rules (on the value machine(), trait() and subroutine() return), none, rules(source, build) (a shared build)
// moved: turn (from the body's tokens to the rules builder's)
// user-defined: Order, OrderMachine, PaidHasReceipt, RefundAddsUp, ClosedStaysClosed, receipt, refunded, closed
export const OrderMachine = machine(Order, ({ S, E }) => ({
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
OrderMachine.rules(() => ({}))      // type error: a ruled value has a token record, not a .rules method
```

Types (spiked under `strict` and `exactOptionalPropertyTypes` on TypeScript 7.0.2, scratchpad `spike/chain.ts`, 29 k
instantiations):

```ts
// NEW: Bare, Rules, RuleToken; Machine keeps D and gains N, the rule names (from the rules object, never the body)
type Bare<D> = {
  readonly definition: D
  rules<const I extends string = never, const T extends string = never>(build: Build<D, I, T>): Machine<D, I | T>
  rules<N extends string>(shared: Rules<D, N>): Machine<D, N>
}
type Build<D, I extends string, T extends string> = (tokens: RuleTokens<D>) => {
  readonly invariants?: { readonly [K in I]: Invariant<D> }   // only the keys are inferred: no capture of checks
  readonly turns?: { readonly [K in T]: TurnRule<D> }
  readonly terminals?: ReadonlyArray<StateToken<D>>
}
type RuleToken<Id extends string> = { readonly "~rule": Id }   // Id: `${D["id"]}.${Name}`, naming its subject
type Machine<D, N extends string = never> = {
  readonly definition: D
  readonly construction: Construction
  readonly rules: { readonly [K in N]: RuleToken<`${D["id"]}.${K}`> }
}
```

- **The capture.** Only the key sets `I` and `T` are inferred, the shape Types Q19 measured as cheap (item 1). The
  checks are typed by context and never captured, and the body is not captured at all. An unknown key (`chek`, `in`
  on a turns rule) is refused by `.rules()` at construction, as option C has it. One misuse is still a type error:
  an entry that is neither a `turn(...)` nor a function (spiked).
- **What each builder gets.** A machine gets `S`, `E` (internal events included) and `turn`. A subroutine gets its
  own `S`, `E` (including `hostEvents`) and `turn`. A trait has no states, so it gets `E` and `turn` only: its
  builder has no `S`, and `terminals` and `in` are not in its shape. A trait's or subroutine's checks read only what
  it declares.
- **Calling `.rules` twice** is a type error (above), and a cast past it is refused at construction (`RulesTwice`).
- **Identity.** The ruled value keeps the definition's id and is a new frozen value. The bare value is not runnable.
- **A build in another module, shared:**

```ts
// fixtures/number-input/machines/stepper.rules.ts
// NEW: rules(source, build): a build typed from a definition (or a bare trait or subroutine), not bound to a value
// user-defined: stepperRules, SetLandsInBounds, snapped
export const stepperRules = rules(Stepper, ({ E, turn }) => ({
  turns: {
    SetLandsInBounds: turn({
      on: E.Set,
      check: ({ event, before, after }) =>
        after.memory.value === (event.value === null ? null : snapped(before.memory.settings, event.value)),
    }),
  },
}))

// fixtures/number-input/machines/stepper.ts
export const StepperMachine = machine(Stepper, stepperBody).rules(stepperRules)
// tests/number-input/faults.ts: a planted fault, same definition, same rules, same tokens
export const UnclampedStepperMachine = machine(Stepper, unclampedBody).rules(stepperRules)
```

A shared build is typed from the definition, not from a machine, so it needs no import of the machine and makes no
import cycle.

## 2. The two-values risk

`const base = machine(Order, body)` and `OrderMachine = base.rules(...)` both exist, and code could run `base`. Three
ways to stop it:

- **A, the bare value is not runnable (recommended):** `app()`, `runtimeSetup`, `Story.machine`, `Story.fragment`
  and a definition's `traits` or subroutine slot accept only a ruled value. Running a bare one is a type error, and
  at construction `RulesMissing`. It holds for every runner and every file, test files included. The cost is one
  `.rules(none)` on each machine without rules, which is also an upfront claim a reader can see.
- **B, the Runtime refuses two values with one id:** it catches only a run that has both. A run that uses only
  `base` judges nothing, silently.
- **C, a lint rule that a module exports only the ruled value:** it sees one module, not the shared-build split, and
  lint is not part of a test run.

A is the only one with no silent case, which is why it is recommended. `none` is a frozen empty build, so
`OrderMachine.rules` is `{}`.

```ts
// NEW: none
export const PayMachine = machine(Pay, PayBody).rules(none)
app({ id: "shop", machines: { pay: machine(Pay, PayBody) } })   // type error; RulesMissing at construction
```

## 3. The review's findings

- **H1 (Stories in test files): closed.** There is no scan. A Story in a `*.test.ts` file runs a value, and the
  value has its rules.
- **H2 (a second machine of one definition, planted faults): closed.** A shared build (section 1) attaches to both.
  Token ids are `<definition id>.<Name>`, so `UnclampedStepperMachine.rules.SetLandsInBounds` is the same rule id as
  the original, and an inverted Story names the rule the original declares. A second machine built with `.rules(none)`
  says, visibly, that it has none.
- **H3 (plain Runtime tests): closed by two parts.**
  1. `runtimeSetup`'s `rules` is required, with no default: production says `"off"` and nothing judges in production
     by accident. A setup reused by `Story.app` is judged whatever it says (Types Q5).
  2. `flow-state/testing/setup`, a Vitest setup file, fails a test in `afterEach` when a Runtime that test started
     recorded `RuleBroken`. That keeps Host R8 ("however it was run") with no throw inside the app.
- **H4 (the fragment guarantee): closed.** A definition places the ruled trait (`Upload.each(...)`), and a bare one
  is a type error, so every placement and copy carries the trait's rules. This holds at any depth: a subroutine that
  places a trait places a ruled value too. A host has no way to remove a placed fragment's rules.
- **H5 (terminal proofs): closed.** A set always sits on a value with a compiled graph. `flow check` proves
  `terminals` and warns `RuleSubjectUnreachable` for every value it reaches: each app's machines, each discovered
  Story's subject, and their placed fragments. A value only a test file runs is proved by its Story: a Story whose
  subject has a `TerminalLeft` finding fails its verdict (proposed; @spec.Types I14 keeps graph rows out of
  construction).
- **M1, M2 (the scan's runner and globs): gone** with the scan.
- **M3 (token identity): closed.** A token's type carries its subject id, so `off: [CartMachine.rules.NotEmpty]` on
  a Story without Cart is a type error (the switch's `R` is the union of the run's token ids). A cast is a
  `StoryScriptFault` at run start.
- **M4 (typing claims): spiked** on the chained form with a machine (section 1). The trait and subroutine forms wait
  for their types (@task.V3.T109). The token record is `rules` alone, so a rule name cannot clash with a field.
- **M5 (record edits):** listed in @review.rules-exactness-inventory. Its open choices resolve here: `[H1]` the
  definition, `[H2]` on the value, `[H3]` required, `[H4]` kept, `[H5]` yes, `[H6]` keys only. Plan edits wait for
  the user's yes.
- **M6 (two lost features): restored or stated.** The bare function entry stays (inventory #39). The build-time
  constant (#40) becomes `.rules(DEV ? orderRules : none)` in user code. It has the same plain-CLI limit as Types Q5,
  so it is stated, not recommended.
- **L1:** `rules` keeps two meanings: `.rules(build)` on a value, and `.rules({ expectBroken, off })` on a Story.
  Host's run-rules option on `Story.app` is renamed `runRules` (proposed).
- **L2:** a printed Story names tokens by expression (`OrderMachine.rules.X`); its replay needs the id only.
- **L3, L4, L5:** no entry form and no registry, so no `context` clash and no comparison by object identity. Report
  order is invariants, then declaration order; ids do not depend on order.

## 4. Inventory, updated

Each line gives the feature and then where it lives after this change; "same" means unchanged apart from the token's
home. Sources are as in the last revision: @plan.Rules O1 to O8, @spec.Host, @spec.Types, @spec.Changes, T22, T106,
T114 and `tests/rules/rules.ts`.

1. `invariants` at every publication: in `.rules`.
2. `turns` on accepted turns only: in `.rules`.
3. Subjects `in` (a compound means its subtree) and `on` (any sender): same.
4. `event` typed from `on`: `turn` in the builder.
5. What a check reads, with `context` only in turns rules: same.
6. A restore is judged by invariants, skipped by turns rules: same.
7. The judge per `Turn` (Begin, Turn+Published, Other, no Published, Finished): reads the value's rules.
8. The per-Runtime `last` map; a reload starts empty: same.
9. One namespace per value; a duplicate name is a type error and refused: by `.rules()`.
10. Typed tokens, `machine.rules.X`: back on the value, carrying the subject id.
11. Terminals and `TerminalLeft`: in `flow check` per value, and in the verdict of a Story's subject.
12. `RuleSubjectUnreachable`: per value.
13. `flow explain` lists rules: per value.
14. Every run judges, with no extra call: by construction.
15. A break shrinks to the shortest Story: same.
16. Several breaks at once: invariants first, then declaration order.
17. `.rules({ expectBroken, off })` per Story, addable from helpers: same.
18. `off` by rule or `"all"`: same.
19. A rule in both lists is refused: same.
20. `Expect { rule, step?, actor?, where? }` matching (Host R11): same.
21. `neverBroke`, and the run goes on after a break: same.
22. Derived runs inherit the switch: same.
23. The reload sweep drops `expectBroken` in forks: same.
24. `propertyTest` runs every seed: same.
25. The project's run rules module `tests/rules/list.ts`: same, passed as `runRules`.
26. Flow's run rules' modes only in Flow's own helper; `breaches` renamed `broken`: same.
27. Tooling rules (`UnusedWord`, `CleanupLeft`, `PublicationDrift`, `RuleThrew`): same.
28. `Verdict<R>`; a switch outside `R` does not compile: `R` is the run's token ids and run rule ids.
29. Rule coverage: unseen with why, `off` out of the total: enumerates the run's values.
30. The Runtime switch replacing `enabled`: required, `"judge"` or `"off"`.
31. `RuleBroken`, with private fields redacted, and the app carries on: same.
32. A throwing check gives `threw: true`: same.
33. The CLI exit follows the verdict: same.
34. A fragment rule reads only the fragment; `on` matches a host's raise: same.
35. Per placement and `.each` copy; entry, reset and exit skipped; a frozen trait not judged: same.
36. A host can never remove a fragment's rule: by construction (H4).
37. A fragment token switches every placement; ids name the placement and the copy: `Upload.rules.X`.
38. `Story.fragment` judges alone; a planted fault per kind: case 3; faults share builds (H2).
39. The bare function entry form (review M6): kept.
40. Leaving rules out of a bundle (review M6): `.rules(DEV ? build : none)`, with Q5's limit.

## 5. Every Story and test case

**1. App Stories, with custom fixtures.** The app lists ruled values, so the Story has their rules. Fixtures replace
services and world words change the world; neither touches rules.

```ts
// existing: Story.app, id, fixtures, .rules, expectBroken, off, step, actor; renamed: rules -> runRules (Story.app)
// user-defined: refundTwice, ShopFake, CartFakeDown, mainOrder, runRules
export const refundTwice = Story.app(storeSetup, { id: "shop/refund-twice", fixtures: [ShopFake, CartFakeDown],
  runRules })
  .rules({
    expectBroken: [{ rule: OrderMachine.rules.RefundAddsUp, step: 3, actor: mainOrder }],
    off: [EditorMachine.rules.TitleSet, OrderMachine.rules.ClosedStaysClosed],
  })
  .send(mainOrder, Order.E.Refund({ amount: 5 }))
```

**2. Machine Stories** (planned, @task.V3.T76). A machine Story takes the ruled value, whether or not the machine is
in any app. Its switch's `R` is that machine's token ids.

```ts
export const setUnclamped = Story.machine(UnclampedStepperMachine, { id: "number-input/set-unclamped" })
  .rules({ expectBroken: [UnclampedStepperMachine.rules.SetLandsInBounds] })   // "Number/Stepper.SetLandsInBounds"
  .send(Stepper.E.Configure({ settings: bounded }))
  .send(Stepper.E.Set({ value: 99 }))
```

**3. Fragment Stories** (planned, @task.V3.T109). `Story.fragment` takes the ruled trait and judges it on Flow's
stand-in host, as one placement named after the trait. Host Stories judge each real placement and copy.

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

export const uploadAlone = Story.fragment(Upload, { id: "upload/alone" })
  .rules({ off: [Upload.rules.RefNeverChanges] })
  .enter({ ref: "file-1" })
  .send(Upload.E.Cancel({}))
  .leave()
```

```text
Story.fragment   Upload.CancelSticks                 seen 1
host Story       Desk/Editor/uploads.CancelSticks    seen 2 (copies a, b)    a break names uploads[a]
```

**4. Derived runs** are built from a Story's subject, so they run the same ruled values and inherit the switch as
data:

- **Generated runs:** `samplesOf({ story })`; an expected rule is off after its break.
- **`propertyTest`:** the same samples; every seed runs.
- **Reload sweep:** each Story, forked at each position, with `expectBroken` dropped in forks.
- **Pair sweep:** samples, at each phase and fault.

**5. Plain Runtime tests.** `rules` is required on `runtimeSetup`. The Vitest setup file fails a test whose Runtimes
recorded `RuleBroken`, and `brokenRules` lets a test assert it.

```ts
// vite.config.ts                 NEW: flow-state/testing/setup
test: { setupFiles: ["flow-state/testing/setup"] }

// existing: runtimeSetup; NEW: rules required; brokenRules (flow-state/testing)
const setup = runtimeSetup({ app: store, services: TestServices, rules: "judge" })
it("refund adds up", async () => {
  const runtime = await start(setup)
  runtime.actor(mainOrder).send(Order.E.Refund({ amount: 5 }))
})                                                  // fails in afterEach if a rule broke
it("a break this test expects", async () => {
  const runtime = await start(setup)
  runtime.actor(mainOrder).send(Order.E.Refund({ amount: -1 }))
  expect(brokenRules(runtime).map((b) => b.rule)).toEqual(["Shop/Order.RefundAddsUp"]) // read, so not a failure
})
const quiet = runtimeSetup({ app: store, services: TestServices, rules: "off" })        // opting out, visibly
```

**6. Values made in a test file.** A machine, trait or subroutine defined in `*.test.ts` is ruled where it is
defined (`machine(D, body).rules(build)` or `.rules(none)`). It is runnable only once ruled, and nothing needs to
import or scan the file.

**7. Tests that assert on rules.** A failing Story rejects with its verdict. Coverage is a function over runs.

```ts
// existing: StoryFailed { verdict, run }; NEW: ruleCoverage (flow-state/testing; the reporter's function)
const failed = await Effect.runPromise(Effect.flip(refundTwice.run()))
expect(failed.verdict.broken.map((b) => b.rule)).toEqual(["Shop/Order.RefundAddsUp"])
const coverage = ruleCoverage([run1, run2])
// { exercised: 12, total: 14, rows: [{ rule: "Shop/Order.PaidHasReceipt", seen: 0, why: "in PAID, never reached" }] }
```

**No silent skip, case by case:**

1. App Stories run ruled values only.
2. Machine Stories: the same.
3. Fragment Stories: the same, and every host placement carries the trait's rules.
4. Derived runs reuse the Story's values.
5. Plain Runtime tests: the setup file fails them, and `rules` is required.
6. Test-local values: bare ones are not runnable.
7. Assertions read the verdict and coverage, which enumerate the run's values.

## 6. What it deletes

- the body's `rules` key and `turn` in `BodyTokens<D>`: `.rules(build)` and its `turn`.
- `const B`, `Exact`, `ExactBodyOf`, `RuleNames<B>`, G3 (Q19 C): the rules object's key sets only.
- `Compiled.rules` from the body compile: the rules compiled by `.rules()` on the value.
- last revision: `rules(subject)` sets, entries, scan, lint, `RulesUnregistered`, `RulesSubjectAbsent`: gone.
- Types Q2's default question and Q17 (tokens on an unbuilt machine): a token exists only on a ruled, built value.

Kept from @spec.Types: R9 and I12 in a new form (the names come from the rules object, and `Machine<D, N>` assigns
to `Machine<D>`), and I13's twin refusals, now raised by `.rules()`.

## 7. Risks

- **Migration noise:** every machine, trait and subroutine without rules gains `.rules(none)`. That is about 50
  values in `fixtures/`, mechanical.
- **Overload messages:** a wrong payload in `turn` is reported at the `.rules(` call ("no overload matches"), not at
  the field (spiked).
- **The setup file:** a project that leaves `flow-state/testing/setup` out of Vitest loses case 5's failure, though
  not the judging. Flow's docs and `flow check` can name it.
- **Bundles:** rules ship as closures under `"off"`.

## Questions

1. **The two-values risk.** A: the bare value is not runnable, with `.rules(none)` for no rules. B: the Runtime
   refuses two values with one id. C: lint. **Recommendation: A**, the only one with no silent case.
2. **A shared build's source.** A: the definition (or a bare trait or subroutine), so two machines of one definition
   share rules and tokens. B: a ruled value only. **Recommendation: A**, since it closes H2 and needs no import cycle.
3. **Plain Runtime tests.** A: `rules` required, plus the Vitest setup file that fails a test on `RuleBroken`.
   B: `rules` required and Host R8 amended to cover Stories only. **Recommendation: A**, which keeps R8 as decided.
4. **Terminal proofs for a value only a test runs.** A: its Story's verdict fails on a `TerminalLeft` finding of its
   subject. B: `flow check` only. **Recommendation: A**, so a proof cannot be skipped by where the value lives.
