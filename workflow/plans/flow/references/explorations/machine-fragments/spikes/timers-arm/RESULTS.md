# Results: typing `arm` / `disarm` for schedules

Tooling: tsc 7.0.2 (native), repo `node_modules`. Real `effect` 4.0.5 resolved fine (`Schema.String` used in the definition).
Naming follows the coordinator: node-level `schedules`, view `snapshot.schedules.cooldown`, and in (b) the definition list is `schedules: { cooldown: {}, … }`.

## Layout

- `src/core.ts`: stand-in library (`definition`, `S` and `E` tokens, `NodeCfg`, `Transition`, `Machine`). No runtime behaviour.
- `src/{a,b,c}.ts`: the three strategies. `src/{a,b,c}.fixture.ts`: positive cases plus `@ts-expect-error` negatives. `npx tsc -p tsconfig.json` (use `./t.sh -p tsconfig.json`) passes clean.
- `probes/*.probe.ts`: the same mistakes without `expect-error`, to read the messages. They are meant to fail.
- `complete.mjs`: drives the real language server (`tsc --lsp --stdio`) and asks for completions at a `/*|*/` marker. `probes/control.complete.ts` proves the harness works on a plain literal union.
- `gen.mjs` + `scaled/`: generated machines for compile-time growth.

## Summary table

| Check | (a) validate after inference | (b) names in definition | (c) arm by reference |
|---|---|---|---|
| 1 typo in `arm` | error | error | error (undefined identifier) |
| 2 unknown `disarm` | error | error | error |
| 3 child arms ancestor timer | accepted | accepted | accepted |
| 3b sibling/unrelated timer rejected | yes, with the scoped validator | no with plain (b); yes with extra scoped validator (`machineScoped`) | yes, scoped validator (weak, see below) |
| 4 editor knows names at `arm: ["|"]` | no (0 completions) | yes (`cooldown, settle`) | no filtered list (all identifiers in scope) |
| 5 `snapshot.schedules.cooldown` is `{dueAt:number}\|undefined`, unknown is error | yes | yes | yes |
| 6 no `as`, no explicit generics at call sites | yes | yes | yes |
| 7 other fields still check (events, state tokens, targets) | yes | yes | yes |
| Compile cost at 36 states / 40 schedules (instantiations) | 43k | 11k | 43k |

## (a) Validate after inference

Shape: `machine<const D, const C extends Cfg<D>>(d, f: (t) => C & Validate<C>)`. `Validate<C>` walks the inferred config and narrows each `arm`/`disarm` to the names in scope (ancestors plus self). The view type is the union of every `schedules` key in the tree.

Worked:
- Typos and unknown `disarm` names are rejected, and a sibling's timer is rejected (`PASSWORD` arming `TWO_FACTOR`'s `cooldown`).
- `const C` does flow through the arrow-function return, so literals are kept without `as`.
- Machine-wide validation (any declared name anywhere) is a one-line variant (`machineWide`).
- The view type is exactly the declared keys.

Failed or weak:
- No autocomplete. The contextual type for the element is plain `string` (the constraint), because the narrowing lives in an intersection that depends on the inferred `C`. LSP returned 0 completions at `arm: ["|"]`. Proxy check: `arm: [0]` says "Type 'number' is not assignable to type 'string'".
- Error text names the whole tuple, not the element:

```
probes/a.probe.ts(11,39): error TS2322: Type '["cooldwn"]' is not assignable to type 'readonly ["cooldwn"] & readonly "cooldown"[]'.
  Type '["cooldwn"]' is not assignable to type 'readonly "cooldown"[]'.
    Type '"cooldwn"' is not assignable to type '"cooldown"'.
```

  It points at the `arm` array (right line), and the valid names are visible. No "did you mean".
- Sibling error is cryptic: `Type '["cooldown"]' is not assignable to type 'readonly ["cooldown"] & readonly never[]'` then `'"cooldown"' is not assignable to type 'never'`. A reader has to infer "out of scope".
- Typos in event names or targets still give normal messages (property does not exist, `Object literal may only specify known properties`), but the type text is long because `Definition<…>` is printed in full.

## (b) Names in the definition

Shape: `definition({ …, schedules: { cooldown: {}, settle: {} } })`. `arm`/`disarm` are `readonly ("cooldown"|"settle")[]` straight from `D`. Node `schedules` is `{ [K in names]?: Sched }`.

Worked:
- Best error location and text, because the contextual type is a plain union that does not depend on `C`:

```
probes/b.probe.ts(7,97): error TS2820: Type '"cooldwn"' is not assignable to type 'TimerNames<Definition<…>>'. Did you mean '"cooldown"'?
```

  The position (col 97) is the string literal itself. The `TimerNames<Definition<…>>` alias text is noisy; a named alias on the definition would shorten it.
- Real autocomplete: LSP returned `cooldown, settle` at `arm: ["|"]`.
- `snapshot.schedules` type comes from the definition, so it does not depend on inference.
- Other fields type-check as before.

Failed or weak:
- Names are machine-wide: a sibling may arm any declared name. The ancestor-scope check needs the same inferred-config validator as (a) (`machineScoped`, works, but then that part loses literal-union errors in favour of the (a) style message; the plain union error still comes first for typos).
- "Filled exactly where?" needs a second check on inferred `C`. I added two: every declared name must be filled, and no undeclared `schedules` key. The second is needed because `const C` inference lets an extra key through the base constraint (no excess-property check). Both work, but they report at the whole callback, not at the offending line:

```
probes/b.probe.ts(20,31): error TS2322: Type '{ readonly default: …; readonly states: {…} }' is not assignable to type '{ … } & { …; }'.
  Property '__unfilledTimers' is missing in type '{ … }' but required in type '{ readonly __unfilledTimers: "settle"; }'.
```

  The branded property name and the missing name (`"settle"`, `"extra"`) are readable on line 2, but the main line is a wall of type text.
- Names are written twice (definition, then `schedules`). That is the price for a typed name list.
- Cheapest to compile (see below).

## (c) Arm by reference

Shape: `const cooldown = timer("30 seconds", E.CooldownOver)`; `schedules: { cooldown }`; `arm: [cooldown]`. `timer` returns `Timer<EventName>`.

Worked:
- A typo is an ordinary compiler error: `Cannot find name 'cooldwn'. Did you mean 'cooldown'?` at the identifier. Rename and go-to-definition work.
- Scoped validator rejects arming a timer not registered on this node or an ancestor (same `never` style message as (a)).
- View keys come from the `schedules` keys.

Failed or weak:
- The timer object does not know its own name; the name comes from the key in `schedules`. So the check "is this timer registered here" can only compare by type, which is `Timer<EventName>`. Two timers that send the same event are indistinguishable, so arming `other` where only `cooldown` is registered passes (tested in `c.fixture.ts`). Fixing that needs a unique brand per timer, which cannot be inferred from `timer(...)` without an explicit generic or a name argument.
- Without the scoped validator, anything of type `Timer` is accepted in `arm` (`machineLoose`), including a timer never registered.
- Timers must be created outside the `machine(...)` callback or take `E` from `tokens(def)`; the `E` in the callback is not available at module level. Not a typing problem, but the declaration moves away from the node.
- No filtered autocomplete: the editor lists every identifier in scope (1227 items, mostly DOM globals in this config).
- Same scoped-validator cost as (a): 43k instantiations.

## Compile time

`tsc --extendedDiagnostics`, single run each, all generated machines compile clean. "States" counts groups plus leaves, and each leaf has 3 transitions arming 2 schedules. Small fixture total includes about 8k instantiations for `core.ts` itself.

| Case | (a) inst / check | (b) inst / check | (c) inst / check |
|---|---|---|---|
| Small fixture (SignIn + negatives) | 10.2k / 5 ms | 8.4k / 5 ms | 10.9k / 5 ms |
| 18 states, 20 schedules | 24.6k / 16 ms | 8.5k / 4 ms | 24.7k / 15 ms |
| 36 states, 40 schedules | 43.0k / 27 ms | 10.8k / 6 ms | 43.2k / 26 ms |
| 72 states, 80 schedules | 81.0k / 48 ms | 16.6k / 10 ms | 81.3k / 52 ms |
| 144 states, 160 schedules | 161k / 103 ms | 32.6k / 20 ms | 162k / 113 ms |

Growth is linear for all three; there is no blow-up. (b) is about five times cheaper because the plain version has no inferred-config walk. Note (b) with the completeness check costs a little more than shown (the scaled (b) file uses the completeness check; it has no scoped validator). Absolute times are tiny here; check these again at real machine sizes with real guards and memory types.

## Surprises

- `const` type parameters do infer through the callback return, and `C & Validate<C>` as the callback's return type works without `as` or explicit generics.
- Inference of `C` lets an undeclared `schedules` key through the base constraint. Any strategy that relies on `NodeCfg<…>` alone for this has a hole; it needs an explicit check (done in (b)).
- (a)'s validator costs completion, not correctness: the contextual type becomes `string`.

## Recommendation

Use (b), names in the definition, for `arm`/`disarm` and the `snapshot.schedules` view.

Reasons:
- It is the only one with real autocomplete and a pointed "Did you mean" error at the literal.
- The view type is fixed by the definition and independent of inference, so it cannot collapse.
- It is about five times cheaper to compile.
- Duplicate naming is small: a list of names in the definition, which also doubles as documentation of what the machine can time.

Add two cheap checks on the inferred config (done in `b.ts`): every declared name is filled, and no undeclared `schedules` key. Accept that the error for these two lands on the whole callback; it is readable but noisy. Skip ancestor-scope checking at compile time unless it matters; if it does, layer the (a)-style `VNode` on top (`machineScoped`) at the cost of the cheaper compile and a `never`-style message. A runtime check at machine build is a good backstop.

Keep (c) only if go-to-definition on timers matters more than completion: it cannot tell same-event timers apart without a per-timer brand.
