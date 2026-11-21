---
proposal external-rules
status proposed 2026-11-22
---
# Rules declared outside the machine

**Bottom line (proposed):** a rule set is its own branded value, `rules(subject, build)`, typed from its machine or
fragment. It reaches every run through one place, the app entry it describes (`{ machine, rules: [...] }`), and
`flow check` scans the project's `*.rules.ts` files for the brand, so a rule set no app entry lists is the error
`RulesUnregistered`, never a silent skip. The Runtime, Stories, the CLI and evidence read rule sets only from app
entries. The body loses `rules`, `turn` and every type that carried rule names; `B` keeps one reader, exactness.

**Why now:** the user accepted (2026-11-22) moving rules out of the machine body. The worry is discovery: an
unattached value can be forgotten, and then no run judges it and rule coverage cannot list what it never saw.

**Read first:** @plan.Rules; @spec.Types (R9, I12, I13, Q3, Q19, G3); @spec.Host (`RuleSources`, the judge,
`verdictOf`); code:packages/flow-state-v3/src/host/cli/discover.ts; @proposal.rules ("Inline, opted into outside tests":
the reason rules were kept inline was that they then need no registration).

## 1. The API

```ts
// fixtures/shop/machines/order.rules.ts       (NEW file convention: *.rules.ts)
// existing: OrderMachine, S, E, S.X, E.X, check, in, on, invariants, turns, terminals, event, before, after
// NEW: rules (an exported function), turn (moved here from the body's tokens), the RuleSet brand
// user-defined: OrderRules, PaidHasReceipt, RefundKeepsTotal, NoRefundAfterClose
export const OrderRules = rules(OrderMachine, ({ S, E, turn }) => ({
  invariants: {
    PaidHasReceipt: { in: S.PAID, check: ({ memory }) => memory.receipt !== null },
  },
  turns: {
    RefundKeepsTotal: turn({
      on: E.Refund,
      check: ({ event, before, after }) => after.memory.refunded === before.memory.refunded + event.amount,
    }),
    NoRefundAfterClose: turn({ check: ({ before, after }) => !before.memory.closed || after.memory.closed }),
  },
  terminals: [S.REFUNDED],
}))

OrderRules.PaidHasReceipt   // NEW place of the token: RuleToken<"PaidHasReceipt">, was OrderMachine.rules.X
OrderRules.Typo             // type error
```

- **Typing.** `rules<D, const R>(subject: Machine<D> | Fragment<D>, build: ExactRules<NoInfer<D>, R>):
  RuleSet<D, NamesOf<R>>`. `R` captures only the returned rules object, never the body. Spiked under `strict` and
  `exactOptionalPropertyTypes` on TypeScript 7.0.2 (scratchpad `spike/helper3.ts`, 30 k instantiations): names
  inferred, `OrderRules.Typo` refused, `check` inputs inferred with no annotation, a wrong payload field
  (`event.amount` on `E.Pay`) refused, an excess key in an invariant refused.
- **`event` from `on`.** Needs `turn`, as @spec.Types Q3 found: a plain `{ on, check }` entry leaves `event`
  untyped (spiked: implicit `any`), because TypeScript discriminates a union only on a literal-typed property and an
  event token is a callable object. `turn` stays a token, now of the rules builder. An excess key inside `turn({...})`
  is not caught by the type (spiked); construction refuses it.
- **Construction.** `rules()` returns a construction value like `machine()` (`Built | Refused`): a duplicate name, an
  unknown key, a foreign token, an empty or repeated `terminals` entry are refused with the same reason the types
  give (@spec.Types I13's twin rule moves here).
- **Fragments and subroutines.** `rules(Upload, ...)` takes a `trait` or `subroutine`; the builder gets the
  fragment's own `S` (subroutine only), `E` (with `hostEvents`) and `turn`, and `check` reads only what the
  fragment declares (@plan.Rules O7, unchanged). Registered on each host entry that places it (section 2).

## 2. Discovery

**The trace that failed before.** Rules in a separate value with nothing pointing at them:

```text
1. author adds fixtures/shop/machines/order.rules.ts, exports OrderRules; nothing imports it
2. every Story of shop runs; the judge knows no Order rule; all pass
3. rule coverage prints "12 of 12 exercised": it lists what it was handed, so OrderRules is absent, not unseen
4. a planted fault that breaks PaidHasReceipt passes the suite              -> silent skip
```

**This design: one registration, one scan, one lint rule.**

```ts
// fixtures/shop/app.ts
// existing: app, machines, the { machine, context } entry form
// NEW: rules on an app entry
export const store = app({
  id: "shop",
  machines: {
    pay: PayMachine,                                              // no rules: plain form, unchanged
    order: { machine: OrderMachine, rules: [OrderRules] },        // NEW: rules beside the machine
    editor: { machine: EditorMachine, rules: [EditorRules, UploadRules] }, // a fragment's set where it is placed
  },
})

// flow.config.ts
// NEW: rules, the globs of rule-set files; default ["**/*.rules.ts"], node_modules excluded
export default defineConfig({ apps: [...], rules: ["fixtures/**/*.rules.ts"] })
```

- **Registration.** The app entry is the only connection. Locality: the rules sit next to the machine they describe,
  and `{ ...store.machines }` carries them into a grown app. `app()` refuses a set whose subject is neither the
  entry's machine nor a fragment it places (`RulesSubjectAbsent`), a set listed twice, and two sets of one subject
  sharing a rule name.
- **Scan.** `flow check` loads every file the config's `rules` globs match, as `discover.ts` loads Story files, and
  keeps every export with the `RuleSet` brand. For each app it checks (the config's apps and every app a listed
  Story runs), a scanned set whose subject the app runs or places but whose entry does not list it is
  `RulesUnregistered` (error), naming the file, the export, the app and the entry. A glob matching no file is an
  error, as for Stories.
- **Lint.** A `rules()` call must be a top-level export of a `*.rules.ts` file (`flow-state/rules-file`). This closes
  the one gap the scan cannot see: a set that is unexported or in a file no glob matches.
- **At a Story.** `.rules({ off: [OrderRules] })` naming a set its app does not register is a type error and a
  construction refusal, so a Story that mentions a set also catches its absence.

```text
$ flow check
error RulesUnregistered  fixtures/shop/machines/order.rules.ts#OrderRules
      Shop/Order runs in app "shop" (entry order), which does not list OrderRules
```

Step 4 of the trace now fails before any Story runs. `nub run verify` runs `flow check`, so the gate catches it.

## 3. Connection

- **Runtime.** `runtimeSetup({ app, rules: "judge" | "off" })` (existing, @spec.Types Q5). At start, `judge` builds
  one index, machine id to its entries' sets, from `app.machines`; the judge (`host/judge.ts`) reads that index
  instead of `Compiled.rules`. `off`: no index, no `last` map, the driver installs no judge step, so no per-publication
  cost; the set's closures are only bundled. Stories and the CLI always judge.
- **Stories.** No per-Story wiring: `Story.app(setup)` gets the sets through `setup.app`. The switch takes set tokens:

  ```ts
  // existing: .rules, expectBroken, off, "all"
  // NEW: a whole set in off; tokens from the set, not the machine
  export const refundTwice = storeStory("shop/refund-twice")
    .rules({ expectBroken: [OrderRules.RefundKeepsTotal], off: [EditorRules] })
  ```

  The switch's `R` is the union of the app's registered set tokens, derived from the entries' `rules` tuples.
  `Story.machine` and `Story.fragment` (planned) take `{ rules: [...] }` once in the helper that builds them, and the
  scan checks those Stories as it checks apps.
- **CLI.** `flow check` proves each registered set's `terminals` over its subject's compiled graph (`TerminalLeft`)
  and warns `RuleSubjectUnreachable`, per entry, so a fragment set is proved at each placement. `flow explain` lists
  rules per app entry. Rule coverage enumerates every registered set of the run's app, so an unexercised rule is
  unseen with its reason, and the scan guarantees registered equals declared.
- **Evidence.** `RuleBroken { rule, actor, step, threw }` unchanged; `rule` is the set token's id,
  `<machine or placement id>.<Name>` as today (`Shop/Order.PaidHasReceipt`, `Desk/Editor/uploads.CancelSticks`).

The single graph is untouched: the graph is the body; rules were never edges. Static analysis gains one input
(registered sets) and one scan. Every rule still has one token and one id.

## 4. What it deletes or simplifies

| Deleted                                                     | Replaced by                                     |
| ----------------------------------------------------------- | ----------------------------------------------- |
| the body's `rules` key (`invariants`, `turns`, `terminals`) | `rules(subject, build)`                         |
| `turn` in `BodyTokens<D>`                                   | `turn` in the rules builder's tokens            |
| `RuleNames<B>`, `Machine<D, R>`'s `R`, `machine.rules`      | `RuleSet<D, R>`; `Machine<D>` has one parameter |
| `Compiled.rules`, its compile step and construction rows    | the set's own construction value                |
| @spec.Types R9, I12, Q2, Q17                                | nothing: the rule tokens live on a built set    |

**Types Q19: can the body type go?** Its readers were `RuleNames<B>` (gone here) and G3's deny literals (proposed
dropped in Q19). Only exactness remains, so `B` becomes `ExactBodyOf`'s private capture with no reader in the return
type. Spiked on TypeScript 7.0.2 (scratchpad `spike/body.ts`): with no capture, a body callback's returned object is
not excess-checked at all, at the top level, inside a handler or an array alternative; a plain object argument is,
except a key from another member of the schedule union.

- **A, keep `Exact` (recommended for now):** R2 and I2 stand; the cost is the capture, now for one job.
- **C, construction only:** drop `B`; `machine()` and `flow check` refuse an excess key at its path
  (`onExcessProperty: "error"` already does). A typo is caught at import, not in the editor; R2 and I2 change.
- **D, reshape the spots TypeScript skips:** does not help while the body is a callback: the return is never
  excess-checked, so concrete handler and schedule types gain nothing without `Exact`.

## 5. Risks

- **The scan's reach.** It sees only files the globs match; the lint rule is what makes the convention binding. A
  project that disables that lint rule can hide a set again.
- **Bundles.** A registered set is imported into the production bundle even under `rules: "off"`; only its closures,
  never called. Removing them needs a build-time constant in user code.
- **Placements.** A fragment placed in three machines is listed three times; the scan names each missing placement.
- **Two sources for coverage.** Coverage trusts the app; the scan is what makes the app complete. A suite run through
  `vitest` without `flow check` can still miss an unregistered set until `nub run verify`.

## Questions

1. Where a set is registered. A: on the app entry, `{ machine, rules }` (locality; spreads carry it). B: one `rules`
   list on `app()` (one place; a fragment set listed once per app, and every app must repeat it). C: a project rules
   module that `flow.config.ts` and `runtimeSetup` import, like the run rules module. **Recommendation: A.**
2. How bad is an unregistered set. A: `RulesUnregistered` is an error in `flow check`. B: a warning. **Recommendation:
   A**, since silence is the failure this design exists to remove.
3. Types Q19 after this move. A: keep `Exact`, `B` with one reader. C: construction-only exactness, delete `B`.
   **Recommendation: A** until the T113 fixtures migrate and the check cost is measured (Q15); then decide on numbers.
