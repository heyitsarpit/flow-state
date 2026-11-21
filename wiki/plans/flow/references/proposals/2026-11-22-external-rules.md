---
proposal external-rules
status proposed 2026-11-22
---
# Rules declared outside the machine

**Bottom line (proposed):** a rule set is its own branded value, `rules(subject, build)`, typed from its machine or
fragment. Every run gets its sets from one place, the entry that runs the subject: an app entry
`{ machine, rules: [...] }`, or the same entry shape given to `Story.machine` and `Story.fragment`. A scan of the
project's `*.rules.ts` files for the brand, run by `flow check` and by the test reporter, makes a set that some entry
should list but does not the error `RulesUnregistered`, never a silent skip. All 38 earlier rule features are kept
(section 3). The body loses `rules`, `turn` and every type that carried rule names.

**Why now:** the user accepted (2026-11-22) moving rules out of the machine body. Two worries: no earlier rule
feature may be lost, and no rule set may be silently skipped, in any kind of Story or test.

**Read first:** @plan.Rules; @spec.Types (R9, I12, I13, Q3, Q5, Q19); @spec.Host (R8, R11, R12, `RuleSources`, the
judge, `verdictOf`); @spec.Changes (`Turn`, instances); @task.V3.T106; code:packages/flow-state-v3/tests/rules/rules.ts;
code:packages/flow-state-v3/src/host/cli/discover.ts; @proposal.rules ("Inline, opted into outside tests": rules were
kept inline so they need no registration).

## 1. The API

```ts
// fixtures/shop/machines/order.rules.ts       (NEW file convention: *.rules.ts)
// existing: S, E, check, in, on, invariants, turns, terminals, event, before, after
// NEW: rules, the RuleSet brand; moved: turn (from the body's tokens to the rules builder's)
// user-defined: OrderMachine, OrderRules, PaidHasReceipt, RefundAddsUp, ClosedStaysClosed, refunded, closed
export const OrderRules = rules(OrderMachine, ({ S, E, turn }) => ({
  invariants: {
    PaidHasReceipt: { in: S.PAID, check: ({ memory }) => memory.receipt !== null },
  },
  turns: {
    RefundAddsUp: turn({
      on: E.Refund,
      check: ({ event, before, after }) => after.memory.refunded === before.memory.refunded + event.amount,
    }),
    ClosedStaysClosed: turn({ check: ({ before, after }) => !before.memory.closed || after.memory.closed }),
  },
  terminals: [S.REFUNDED],
}))

OrderRules.PaidHasReceipt   // RuleToken<"PaidHasReceipt">; was OrderMachine.rules.PaidHasReceipt
OrderRules.Typo             // type error
```

- **Typing.** `rules<D, const R>(subject: Machine<D> | Fragment<D>, build: ExactRules<NoInfer<D>, R>):
  RuleSet<D, NamesOf<R>>`. `R` captures only the returned rules object. A spike under `strict` and
  `exactOptionalPropertyTypes` on TypeScript 7.0.2 (scratchpad `spike/helper3.ts`) showed names inferred,
  `OrderRules.Typo` refused, inputs inferred with no annotation, `event.amount` on `E.Pay` refused, and an excess key
  in an invariant refused.
- **`turn` stays.** A plain `{ on, check }` entry leaves `event` untyped (spiked): TypeScript discriminates only on a
  literal-typed property, and an event token is a callable object. So `turn` moves to the rules builder. Its
  excess keys are refused at construction only.
- **Construction.** `rules()` returns `Built | Refused`, like `machine()`. It refuses a duplicate name, an unknown
  key, a foreign token, and an empty or repeated `terminals` list, each with the reason the types give (I13's twin).
- **Fragments.** `rules(Upload, ...)` takes a `trait` or a `subroutine`. Its builder gets the fragment's own `S`
  (subroutine only), `E` (including `hostEvents`) and `turn`. A check reads only what the fragment declares.

## 2. Where sets are connected, and the scan

```ts
// existing: app, machines, the { machine, context } entry form, runtimeSetup, defineConfig
// NEW: rules on an entry; rules in defineConfig (globs, default ["**/*.rules.ts"], node_modules excluded)
export const store = app({
  id: "shop",
  machines: {
    pay: PayMachine,                                                      // no sets: plain form, unchanged
    order: { machine: OrderMachine, rules: [OrderRules] },
    editor: { machine: EditorMachine, rules: [EditorRules, UploadRules] }, // a fragment's set where it is placed
  },
})
export default defineConfig({ apps: [...], rules: ["fixtures/**/*.rules.ts", "tests/**/*.rules.ts"] })
```

- **Entry.** The entry that runs a subject is the only connection, so `{ ...store.machines }` carries sets into a
  grown app. `app()` refuses `RulesSubjectAbsent` (a set whose subject is neither the entry's machine nor a fragment
  it places), a set listed twice, and two sets of one subject sharing a rule name.
- **Scan.** It loads every file the `rules` globs match, as `discover.ts` loads Story files, and keeps each export
  with the brand. Then it checks every entry: of each app the config lists, of each app a discovered Story runs, and
  of each `Story.machine` and `Story.fragment`. A scanned set whose subject an entry runs or places, but which the
  entry does not list, is `RulesUnregistered` (an error), naming the file, the export and the entry.
- **Who runs the scan.** `flow check` runs it, and so does the test reporter that prints rule coverage. So
  `nub run test` fails on an unregistered set too, not only `nub run verify`.
- **Lint.** `flow-state/rules-file`: a `rules()` call is a top-level export of a `*.rules.ts` file. Such a file
  imports no test runner, so loading it never runs a test. This covers the only sets the scan cannot see: unexported
  ones, or ones in a file no glob matches.

```text
$ flow check
error RulesUnregistered  fixtures/shop/machines/order.rules.ts#OrderRules
      Shop/Order runs in app "shop" (entry order), which does not list OrderRules
```

## 3. Inventory: every earlier rule feature, and where it lives now

"Before" is where the feature is decided or built today. "After" is where the external design keeps it; "same"
means unchanged, apart from tokens coming from the set.

1. `invariants`, judged at every publication. Before: Rules O1. After: set's `invariants`.
2. `turns`, accepted turns only; denied and unhandled skipped. Before: Rules O1. After: set's `turns`.
3. subjects `in` (a compound means its subtree) and `on` (any sender). Before: Rules O1. After: same.
4. `event` typed from `on`, absent without it. Before: Rules O1; Types Q3 (`turn`). After: `turn` in the builder.
5. what a check reads; `context` only in turns rules. Before: Rules O1; Types CallbackInputs. After: same.
6. a restore: invariants judge it, turns rules skip it. Before: Rules O1; Host judge table. After: same.
7. the judge per `Turn`: Begin, Turn+Published, Other, no Published, Finished. Before: Host judge; Changes `Turn`.
   After: same; reads the entry's sets.
8. a per-Runtime `last` map; a reload starts empty. Before: Host judge. After: same.
9. rule namespace; a duplicate name is a type error and refused. Before: Rules O3; Types R9, I13. After: per set, plus
   `app()` across one subject's sets.
10. typed rule tokens. Before: Rules O3; Types R9, I12, Q2, Q17. After: `OrderRules.X`; R9, I12, Q2, Q17 deleted.
11. terminals, `TerminalLeft`, never judged by runs. Before: Rules O2; Types Q6; T22. After: per entry, over the
    subject's graph.
12. `RuleSubjectUnreachable` (a warning). Before: Rules O8; T22. After: per entry.
13. `flow explain` lists rules. Before: Rules O8. After: per entry.
14. every Story, generated run and sweep judges, with no extra call. Before: Rules O4; Host R8. After: sets come from
    the entry (section 4).
15. a break shrinks to the shortest Story. Before: Rules O4; `generate.ts` shrink. After: same.
16. several breaks at once: invariants first, then declaration order. Before: Rules O4. After: then entry list order,
    then declaration order.
17. `.rules({ expectBroken, off })` per Story, addable from helpers, kept as data. Before: Rules O4. After: same; tokens
    from sets.
18. `off` by rule, or `"all"`. Before: Rules O4. After: plus a whole set: `off: [OrderRules]`.
19. a rule in both lists is refused. Before: Rules O4. After: same; a set in `off` with its rule expected is refused
    too.
20. `Expect { rule, step?, actor?, where? }` matching. Before: Host R11, `verdictOf`. After: same.
21. `neverBroke`; after the first break the run goes on. Before: Rules O4; Host verdict. After: same.
22. derived runs inherit the switch. Before: Rules O4. After: same (section 4, case 4).
23. the reload sweep drops `expectBroken` in forks. Before: Host (tabs and death). After: same.
24. `propertyTest` runs every seed. Before: Host R14; `generate.ts`. After: same.
25. project run rules module `tests/rules/list.ts`, for config and `Story.app`. Before: Host `RuleSources`; `rules.ts`.
    After: same, beside sets; not a set.
26. Flow's run rules' modes only in Flow's own helper; `breaches` renamed `broken`. Before: Rules O4; T114. After: same.
27. tooling rules (`UnusedWord`, `CleanupLeft`, `PublicationDrift`, `RuleThrew`). Before: Host `RuleSources`. After:
    same.
28. `Verdict<R>`, a switch outside `R` does not compile. Before: Host PublicFaces. After: `R`: run rule ids and the
    entry's set tokens.
29. rule coverage: counts, unseen with why, `off` out of total, expected listed. Before: Rules O5. After: enumerates the
    entry's sets.
30. a Runtime switch, `"judge"` or `"off"`, replacing `enabled`. Before: Rules O6; Types Q5. After: same; reads the
    entry's sets.
31. `RuleBroken`, private fields redacted, the app carries on. Before: Rules O6; Host R12. After: same.
32. a throwing check gives `threw: true` and changes only itself. Before: Host R12, I21. After: same.
33. the CLI exit is a function of the verdict. Before: Host R13; T114. After: same.
34. a fragment rule reads only the fragment; `on` matches a host's raise. Before: Rules O7. After: same.
35. judged per placement and `.each` copy; entry, reset and exit skipped; a frozen trait not judged. Before: Rules O7;
    Changes. After: same.
36. a host can never remove a fragment's rule. Before: Rules O7. After: **at risk**: the scan makes it an error per
    placement.
37. a fragment token switches every placement; ids name the placement and the copy. Before: Rules O7. After:
    `UploadRules.X`; same ids.
38. `Story.fragment` judges a fragment alone; a planted fault for each kind. Before: Rules O7, V7; T109. After: case 3;
    faults unchanged.

**What would have been lost without a fix.**

- **#36:** with sets on entries, a host that leaves out `UploadRules` removes the fragment's rules. The scan checks
  every placement, so leaving it out is `RulesUnregistered`.
- **#14 under `vitest` alone:** if only `flow check` ran the scan, a suite run without it would miss an unregistered
  set. The test reporter runs the scan too.
- **Host R8 for plain Runtime tests:** nothing fails such a test today either (case 5).

The build-time removal trick (Rules O6, `rules: import.meta.env.DEV ? ... : undefined`) does not carry over: an
entry's `rules` is read at import, where the plain CLI has no `import.meta.env` (Types Q5's trace). Under `"off"`,
sets ship as closures that are never called.

## 4. Every Story and test case

**1. App Stories.** A Story's sets come from `setup.app`. Fixtures replace services, never rule sets, and a world
word changes the world, not the judge. The run rules list stays Host's `rules` option.

```ts
// existing: Story.app, id, fixtures, world, rules (the run rules list, Host), .rules, expectBroken, off, step, actor
// NEW: set tokens in the switch
// user-defined: runRules, ShopFake, CartFakeDown, refundTwice
export const refundTwice = Story.app(storeSetup, { id: "shop/refund-twice", fixtures: [ShopFake, CartFakeDown],
  rules: runRules })
  .rules({
    expectBroken: [{ rule: OrderRules.RefundAddsUp, step: 3, actor: mainOrder }],
    off: [EditorRules, OrderRules.ClosedStaysClosed],
  })
  .send(mainOrder, Order.E.Refund({ amount: 5 }))
```

**2. Machine Stories** (planned, @task.V3.T76). `Story.machine` takes the entry shape, so a machine's sets have the
same home in a Story as in an app. A machine in no app is covered by its Stories' entries.

```ts
// existing (Plan): Story.machine; NEW: the entry form { machine, rules } as its first argument
// user-defined: orderStory
const orderStory = (id: string) => Story.machine({ machine: OrderMachine, rules: [OrderRules] }, { id })
export const paidThenRefunded = orderStory("order/paid-refunded")
  .rules({ off: [OrderRules.PaidHasReceipt] })   // R = "PaidHasReceipt" | "RefundAddsUp" | "ClosedStaysClosed"
  .send(Order.E.Pay({ card: "4242" }))
// Story.machine(OrderMachine, { id }) with no sets compiles; the scan then reports RulesUnregistered at that Story.
```

**3. Fragment Stories** (planned, @task.V3.T109). `Story.fragment` judges the set against Flow's stand-in host, one
placement named after the fragment. A host Story judges each real placement and copy.

```ts
// existing (Plan): Story.fragment, enter, leave; NEW: the entry form { fragment, rules }
export const uploadAlone = Story.fragment({ fragment: Upload, rules: [UploadRules] }, { id: "upload/alone" })
  .rules({ expectBroken: [UploadRules.CancelSticks] })
  .enter({ ref: "file-1" })
  .send(Upload.E.Cancel({}))
  .leave()
```

```text
Story.fragment   Upload.CancelSticks                       seen 1
host Story       Desk/Editor/uploads.CancelSticks          seen 2 (copies a, b)   a break names uploads[a]
```

**4. Derived runs.** Each is built from a Story, so it gets the Story's subject and the entry's sets with it, and
the Story's switch as data:

- **generated, shrunk:** built from `samplesOf({ story, ... })`; sets from the Story's entry; switch inherited; expected
  rule off after its break.
- **`propertyTest`:** built from samples, as above; sets from the Story's entry; switch inherited; every seed runs.
- **reload sweep:** built from each Story, forked at each position; sets from the Story's entry; switch inherited,
  `expectBroken` dropped in forks.
- **pair sweep:** built from samples, at each phase and fault; sets from the Story's entry; switch inherited.

**5. A plain test that builds a Runtime.** `runtimeSetup`'s `rules` defaults to `"judge"`: a forgotten option
judges, and the cost of that is speed, not correctness. Production and opt-outs write `"off"`. Such a test is not a
Story, so nothing fails it unless it reads the evidence. `brokenRules` returns that evidence.

```ts
// existing: runtimeSetup, rules: "judge" | "off", inspect; NEW: the default "judge"; brokenRules (flow-state/testing)
const setup = runtimeSetup({ app: store, services: TestServices })          // judges by default
const quiet = runtimeSetup({ app: store, services: TestServices, rules: "off" }) // opts out, visibly
it("refund adds up", async () => {
  const runtime = await start(setup)
  runtime.actor(mainOrder).send(Order.E.Refund({ amount: 5 }))
  expect(brokenRules(runtime)).toEqual([])                                  // RuleBroken records, as data
})
```

**6. Machines and sets made for a test.** A test file runs tests when imported, so no scan may load it. A
test-local machine with rules lives in a module beside the test (`tests/refunds/order.ts`), and its set in
`tests/refunds/order.rules.ts`. The config's `rules` globs include `tests/**/*.rules.ts`. The set is registered on
the entry the test runs (`Story.machine({ machine, rules })` or a test app). `rules()` inside a `*.test.ts` file is
a lint error.

**7. Tests that assert on rules.** A failing Story rejects with the verdict. Coverage is a function over runs.

```ts
// existing: StoryFailed { verdict, run }, Broken; NEW: ruleCoverage (flow-state/testing; the reporter's function)
const failed = await Effect.runPromise(Effect.flip(refundTwice.run()))
expect(failed.verdict.broken.map((b) => b.rule)).toEqual(["Shop/Order.RefundAddsUp"])
expect(failed.run.evidence.filter((e) => e._tag === "RuleBroken")).toHaveLength(1)

const coverage = ruleCoverage([run1, run2])
// { exercised: 12, total: 14, rows: [{ rule: "Shop/Order.PaidHasReceipt", seen: 0, why: "in PAID, never reached" }] }
```

## 5. Against the two concerns

- **Nothing lost.** All 38 features in section 3 are kept. #36 relies on the scan, and Rules O6's build-time
  constant does not carry over, which Types Q5 already ruled out.
- **Nothing silently skipped:**
  1. App Stories: an entry without the set is reported by the scan, in `flow check` and in the reporter.
  2. Machine Stories: a Story's entry without the set is reported by the scan.
  3. Fragment Stories: the same, and each host placement is checked too.
  4. Derived runs: no entry of their own; they inherit the Story's.
  5. Plain Runtime tests: rules are judged by default; failing the test needs `brokenRules` (Q3).
  6. Test-local sets: `*.rules.ts` files are scanned, and lint keeps sets out of test files.
  7. Tests asserting on rules: they read the verdict and coverage, which enumerate every listed set.

## 6. Types Q19 after the move

`B`'s readers were `RuleNames<B>` (deleted here) and G3's deny literals (proposed dropped). Only exactness is left.
A spike on TypeScript 7.0.2 (scratchpad `spike/body.ts`) found that without a capture, an object a body callback
returns is never excess-checked, at any depth. A plain object argument is checked, except for a key from another
member of the schedule union. So D (reshaping the skipped spots into concrete types) gains nothing while the body
is a callback. A keeps `Exact`, with `B` used for that alone. C drops `B` and refuses an excess key at construction
and in `flow check`. The user chose C (2026-11-22), so `B` goes.

## 7. Risks

- **The scan's reach** rests on the globs and the lint rule; a project that disables that rule can hide a set.
- **Bundles:** registered sets ship under `"off"`, as closures that are never called.
- **Placements:** a fragment placed in three machines is listed three times; the scan names each missing one.
- **Plain Runtime tests** pass on a broken rule unless they read `brokenRules`, as Host R8 cannot reach them.

## Questions

1. **Where sets are connected.** A: on the entry that runs the subject: the app entry, `Story.machine`'s and
   `Story.fragment`'s first argument. B: one `rules` list on `app()`, plus a `rules` option on machine and fragment
   Stories. C: a project rules module that the config and `runtimeSetup` import. **Recommendation: A**, since
   locality holds and spreads carry the sets.
2. **The scan's runners and its severity.** A: `RulesUnregistered` is an error, in `flow check` and in the test
   reporter. B: a warning, in `flow check` only. **Recommendation: A**, since silence is the failure this design
   removes.
3. **Plain Runtime tests.** A: default `"judge"`, with `brokenRules(runtime)` for the test to assert. B: a third
   setup mode, `"fail"`, under which a break stops the Runtime with a defect. **Recommendation: A**: one switch, no
   throw inside the app; the docs point such tests to Stories.
4. **Types Q19.** Answered: the user chose C (2026-11-22), construction-only exactness, after a capture-free type
   spike; with rules moved out, `B` has no reader left and is deleted (@spec.Types Q19).
