# Type spike: can a body declare `calls` and use them in the same body?

TypeScript **7.0.2** (`/Users/arpit/Developer/flow-state/node_modules/.bin/tsc -p .`, `strict`, exit 0, every `@ts-expect-error` holds).
Not re-run on 5.x; the 3a finding below is a property of this compiler version.
Files: `lib.ts` (minimal model plus a tiny runtime for `lint.ts`), `def.ts` (fixture), `shape1.ts` ... `shape5.ts`, `order.ts`, `lint.ts` (`node lint.ts`).

Model: operation `confirm` (input Schema type, success, three failure tags), a definition with events `Pay{paymentMethodId} | RetryNow | Other | Paid | Declined | TryLater | Unsure`, and memory.
A call is `Call<Need, M, A, F>`: `Need` is the event fields its `select` reads. It is itself an action, and has members `idle` (guard), `retry`, `cancel`. A handler's `actions: ReadonlyArray<Action<E>>` accepts a call only if the handler's event `E` is assignable to `Need`.
Snapshot is `Snapshot<Machine>` with `calls: { [name]: { pending, retryCount } }` and, for `.each` traits, `traits.rows[i].calls.<name>`.

## Result table

P = pass, F = fail, P* = pass with a caveat in the notes. "head" = the error is reported on the callback head, not on the offending line.

| Shape | (a) typed | (b) select vs event | (c) exhaustive | (d) typo | (e) undeclared | (f) unused | (g) snapshot | (h) trait `.each` | (i) messages | (j) excess |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 one literal | F | F | n/a | F | F | F | n/a | n/a | clear but fatal | n/a |
| 2 locals + record | P | P* head | P | P | **F** | lint | P | P | (b) 18 lines at head | P* head |
| 2c locals, `named()` | P | P* head | P | P | **P** | lint | P | P | (e) clear | P* head |
| 3a states fn in a callback literal | **F** | F | F | F | F | F | F | F | cryptic | F |
| 3b `{ calls: fn, states: fn }` | P | P* on `states` | P | P | P | lint | P | P | good | P precise |
| 3c `define({ calls, states: fn })` | P | P* on `states` | P | P | P (P* with locals) | lint | P | P | good | P precise |
| 4 builder `.calls().body()` | P | P* on `states` | P | P | P | lint | P | P | good, (b) tail odd | P precise |
| 5 calls on definition | P | **F** | P | P | P | lint | P (from def alone) | P | good | P*; `bind` extras uncaught |
| 5b `decl<Need>()(op)` | P | P | P | P | P | lint | P | P | good | P*; `bind` extras uncaught |

(f): no shape can make "declared but never used" a type error cheaply. `lint.ts` finds it by identity at runtime: `{ unused: ["spare"] }`. That is a `flow check` job, and it works the same for every shape.

## Findings per shape

### 1. One object literal
`calls` is not in scope inside `states`; it needs `this` or a self-reference, and neither works.
- `actions: [calls.pay]` -> `TS2304: Cannot find name 'calls'.`
- `this.calls.pay` in an arrow body -> `TS2532: Object is possibly 'undefined'.` (`this` is the module's.)
- `const self = { calls, states: ... self.calls.pay }` -> `TS7022: 'self' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.` plus `TS2448: Block-scoped variable 'self' used before its declaration.`
- A method `states() { ... this.calls.pay }` with `states(this: { calls: C })` does infer, and a typo is caught (`Property 'pya' does not exist on type '{ pay: Call<...> }'`). It needs method syntax and `this`. Not recommended.

### 2. Local consts plus a `calls` record
Types are fine: `pay` is a real `Call<PayNeed, ...>`, `actions: [pay]`, `guard: [pay.idle]`, `pay.retry`, the snapshot and the trait rows all type-check.
Two real problems:
- **A const used but forgotten in `calls` compiles** (`e2`). The lane then has no `s.calls` entry, so a view cannot read it. Plain consts have no identity in the type system. `lint.ts` reports `undeclared: 1`.
- **A block-bodied callback cannot elaborate errors.** TS only drills into expression bodies, so every error inside the returned `states` collapses onto the callback head: `TS2345: Argument of type '({ O, E }: Helpers<...>) => {...}' is not assignable to parameter of type '(h: Helpers<...>) => Body<...>'` followed by 17 indented lines. The tail is the useful part: `Property 'paymentMethodId' is missing in type '{ readonly _tag: "Other"; }' but required in type 'PayNeed'.` Errors that are not assignability (`pya`, `nope`, a select error) stay precise.

2c (`const pay = named("pay", O.x.commit(...))`) makes the forgotten const a type error, at the cost of writing each name twice:
`Property 'forgotten' is missing in type '{ pay: ... }' but required in type 'Forgotten<...>'` (the required value type is the string `"used in states but not in \`calls\`"`). Guards count as a use too (`forgotten.idle`).

### 3. States as a function of calls
**The owner's worry is real here, in a narrow, specific way.**
- **3a** `machine(Def, ({ O }) => ({ calls: {...}, states: ({ calls }) => ... }))`. TS 4.7 inference of one property from an earlier one does **not** carry through an outer callback that has a parameter. `C` collapses to its `Record<string, Call>` constraint. Without a guard this compiles silently: `calls.pya` is accepted and every call is a loose `AnyCall`, so none of (a)-(e) catch anything. Reproduced with minimal declarations: it works for a direct argument (`f({ calls, states: fn })`) and for a parameterless arrow (`() => ({...})`), and fails for `(h) => ({...})`. I added an `Inferred<C>` guard (`string extends keyof C ? { "calls could not be inferred ...": never } : unknown`) so the failure is loud:
  `Property '"calls could not be inferred (C collapsed to Record<string, Call>)"' is missing in type '{ pay: Call<...> }' but required in type '{ readonly "calls could not be inferred ...": never }'.`
  Loud but cryptic, and the author did nothing wrong.
- **3b** `machineO(Def, { calls: ({ O, E }) => ({...}), states: ({ calls, E }) => ({...}) })`. Two function properties of one literal; TS infers left to right. Everything passes and errors are precise. **But it is order-sensitive**: write `states` before `calls` and it collapses exactly like 3a (`order.ts`, caught only by the guard).
- **3c** `({ O, E, define }) => define({ calls, states: ({ calls }) => ... })`. `define` is an identity function; the body is a direct argument, so it infers. Passes. Locals before `define` bring back shape 2's forgotten-const hole.

### 4. Two-step builder
`machineB(Def).calls(({ O, E }) => ({ pay })).body(({ calls }) => ({ initial, states }))`. `calls` is fixed by an ordinary call return before `body` is typed, so there is no cross-property inference, no order sensitivity and no scope escape: the body sees only `calls` and `E`. Everything passes, including the trait. Typos and exhaustiveness are precise. (b) is reported on the `states` property; its tail reads `Type '{ actions: [Call<PayNeed, ...>] }' is not assignable to type 'undefined'`, which is less helpful than 3b's `Property 'paymentMethodId' is missing ...`.

### 5. Calls on the definition
`definition({ calls: { pay: confirm } })`, `machine5(Def, ({ calls, E }) => ({ bind: { pay: { select, outcomes } }, states }))`.
- Good: the snapshot `s.calls.pay.pending` is derived from the definition alone, so views do not depend on the body. A typo or an undeclared call is impossible (`Property 'pya' does not exist on type 'Handles<...>'`). A declared call that is never bound is an error (`Property 'pay' is missing in type '{}' but required in type '{ readonly pay: { readonly select: ...`).
- **(b) fails for a plain declaration.** The handle is created before `select` exists, so it cannot know which event fields the select reads. It can be listed under any event (`b5b` compiles), and the select's `event` is `unknown` (`TS18046: 'event' is of type 'unknown'.`). 5b (`decl<PayNeed>()(confirm)`) restores both checks by moving the event fields onto the definition, so one call's contract is split across two files.
- `bind` has no excess-property check: `bind: { pay, ghost }` compiles. Mapper inference also degrades: `E.Paid.from((v) => v.chargeId)` gives `'v' is of type 'unknown'` inside `bind`, so mappers need annotations.
- Not worth it: it makes the snapshot type easy, which the other shapes also get from the body's `calls`, and it costs (b).

## Cross-cutting
- **(b) is a declaration problem, not an inference problem.** A `select` cannot infer which event fields it reads. Write `commit<PayNeed>(...)`. Without it `event` is `unknown` and the select fails loudly at the read. Listing the call under an event without the field fails at the listing site, in every shape except 5.
- **Excess-property checks (j).** A returned literal from a callback gets none from TS, and a generic `S extends States` falls silently back to its constraint (`A: 3` and `on: { Teapot: {} }` compiled). What works: an unconstrained `S` returned as `S & Strict<S> & States<Ev, M>`, where unknown keys become `never` (`Type '[]' is not assignable to type 'never'`, `Type '{}' is not assignable to type 'never'`). The cost: an intersection return stops TS from elaborating (b) onto the offending line.
- **Snapshot (g) and traits (h)** need no special care in any shape that has a `calls` type: `Snapshot<M>` reads `calls` off the machine's type, and a trait's `Row<Trait>` does the same for `.each` copies. `s.calls.charge` and `row.calls.save` are errors.
- **`flow check` still owns:** declared-but-unused (f), and in shape 2 undeclared-but-used (e).

## Recommendation
The owner's worry is real but narrow: it is **local inference of `states` from `calls` in the same literal** (3a, and 3b when reordered), plus the **forgotten const** in shape 2. It is not a general weakness of declaring calls first.

Least error-prone: **shape 4, the two-step builder.** It uses no clever inference, has no order sensitivity and no escape from scope, and checks (a)-(e), (g), (h) and (j) all hold.

```ts
export const checkout = machineB(Checkout)
  .calls(({ O, E }) => ({
    pay: O.Stripe.confirm.commit<{ paymentMethodId: string }>(
      ({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }),
      { outcomes: { success: E.Paid.from((v) => ({ chargeId: v.chargeId })), failure: { CardDeclined: E.Declined.from((r) => ({ code: r.declineCode })), Busy: E.TryLater, Rejected: E.TryLater }, unknown: E.Unsure } }),
  }))
  .body(({ calls }) => ({
    initial: "CARD",
    states: { CARD: { on: { Pay: { target: "PAYING", guard: [calls.pay.idle], actions: [calls.pay] } } } },
  }))
```

If one literal is preferred, **3b** reads best and has the best messages, provided `calls` is written before `states` and the `Inferred` guard stays. Avoid shape 1 (cannot be written), 3a (silent collapse without a guard), shape 2 plain (the forgotten const), and shape 5 (loses (b)).
