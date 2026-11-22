---
proposal body-key-typos
status accepted user 2026-11-22
    proposed 2026-11-22
---
# Misspelled keys in a machine body: a fix that changes no body (2026-11-22)

**Bottom line (proposed): a fix exists with no change to how bodies are written.** Capture the body's type as a
second type parameter `B` and check `B & Exact<B, MachineBody<D>>`. On a copy of the real package every fixture and
type test still compiles, and `target`, `updateMemory`, `guard`, `actions`, `states` and `schedules` typos each get
a red line on the misspelled key. Cost: +14% check time (1.19 s to 1.36 s), +35% instantiations (5.06M to 6.81M),
+0.28 GB. This is the shape @proposal.body-capture-settled called C6; this spike rebuilt it from scratch and
reaches the same result. The Q19 premise (@spec.Types Q19) that the only working shapes need a `body(...)` wrapper
or capturing the body's type is half right: capturing changes the signature of `machine`, not any body.
`updateMemory` returns are also checked by it; the wrapper and object-form options below miss those.

Sources: @spec.Types Q19, @proposal.body-capture-settled. TypeScript 7.0.2, `effect-tsgo tsc` (the `check:effect`
script). Scratch files: `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-IhoC9C/ea3e337d-79ca-4c81-b5be-2e960e123bd1/scratchpad/type-spike/`
(`machine.exact.ts` is the spiked `machine.ts`). Nothing in `src/` was edited.

## Root cause

TypeScript checks excess keys only on a fresh object literal that is assigned to a type: an argument, an annotated
return, `satisfies`. An arrow function that is contextually typed has an inferred return type, and that type is
not fresh, so `() => ({ ... })` against `() => Body` runs no excess-key check (a long-open TypeScript limit,
microsoft/TypeScript#241). The only thing left that catches a key is weak-type detection: a target whose properties
are all optional rejects a source that shares no property with it, and TypeScript then re-elaborates the error into
the literal and words it as an excess-key error. So the rule is:

| Written                                  | Result   | Why                                                |
| ---------------------------------------- | -------- | -------------------------------------------------- |
| `Go: { targett: S.B }`                   | error    | no key in common with `AlternativeConfig`          |
| `Go: { target: S.B, updateMemori: ... }` | no error | `target` overlaps, so the weak check passes        |
| `states: { Z: {} }`                      | error    | no key in common with the states                   |
| `states: { A: {}, Z: {} }`               | no error | a valid sibling overlaps                           |
| `{ default: S.A, extra: 1 }`             | no error | `default` overlaps                                 |
| `updateMemory: () => ({ memori: 1 })`    | no error | return is not fresh; `Partial<W> & {}` is not weak |

That is why a lone misspelled key under `states` errors and `updateMemori` beside `target` does not: the user saw
two outcomes of one missing check. Minimal repro (plain TypeScript, no Flow):

```ts
type Cfg = { target?: string; guard?: boolean };
type Body = { on?: { Go?: Cfg | string } };
declare function m1(body: () => Body): void;
declare function m2(body: Body): void;

m2({ on: { Go: { target: "x", targett: "y" } } });            // error: fresh literal
m1(() => ({ on: { Go: { target: "x", targett: "y" } } }));    // NO error: return is not fresh
m1(() => ({ on: { Go: { targett: "y" } } }));                 // error: weak type, no overlap
m1(() => ({ on: { Go: { target: "x", targett: "y" } } }) satisfies Body); // error
```

I checked that weak-type detection is the trigger: giving the target an index signature (so it is not weak)
removes the lone-key error too. The fixtures' unions in `Handler` do not matter; `AlternativeConfig` has no index
signature that absorbs keys.

## Prior art

- **XState v5**, `setup(...).createMachine(config)`
  (`packages/core/src/setup.ts`, signature `createMachine: <const TConfig extends MachineConfig<...>>(config: TConfig)`,
  local clone `codebases/xstate` at `8a535310`). I compiled it: `targett`, `onn` and `Gooo` alone are refused (weak
  type), but `{ target: "B", actionss: [] }` and a root `extra: 1` compile. A bare type parameter takes only its
  constraint as the contextual type, with no excess check, so XState has the same gap, and no `Exact` type. It is
  not a model for this.
- **effect-machine**
  ([Machine.ts](https://github.com/typeonce-dev/effect-machine/blob/main/packages/effect-machine/src/Machine.ts)):
  `Machine.make(...).handle({ initial, states: { S: { on: { Event: { target } } } } })` takes the config as a direct
  argument and adds validation types (`HandlerUnknownConfigKeyValidation`, `HandlerOnKeyValidation`) that name an
  unknown config key or unknown event key. Read through a summarising fetch and not compiled: treat that it rejects
  `targett` beside `target` as unverified. Its mechanism is the same as the object form below: a direct argument,
  plus hand-written key validators.

## Attempts

Every row ran against the real fixtures and tests. "Compiles" means `check:effect` shows only the lines marked as
wanted below.

| Shape                                                          | Compiles          | `target` `targett`      | `updateMemory` | `guard`, `actions` | `updateMemory` return key |
| -------------------------------------------------------------- | ----------------- | ----------------------- | -------------- | ------------------ | ------------------------- |
| Today: `body: BodyOf<NoInfer<D>>`                              | yes               | lone only               | lone only      | no                 | no                        |
| `NoInfer<Body>` in the return                                  | yes               | lone only               | lone only      | no                 | no                        |
| `<const B extends Body>(body: () => B)`                        | yes               | lone only               | lone only      | no                 | no                        |
| `<B extends Body>(body: () => B & Body)`                       | yes               | lone only               | lone only      | no                 | no                        |
| Weak-type tricks (make configs non-weak)                       | yes               | worse: lone too is lost | -              | -                  | -                         |
| **A. Capture `B`, `B & Exact<B, MachineBody<D>>`**             | yes               | yes                     | yes            | yes                | yes                       |
| B. `body(...)` from the tokens: `({ S, body }) => body({...})` | n/a, new token    | yes                     | yes            | yes                | no                        |
| C. Object form: `machine(D, { default: D.S.A, ... })`          | n/a, new overload | yes                     | yes            | yes                | no                        |

The first four rows are plain-TypeScript runs of the repro with each variant (all five lines but the lone key
compile). No shape that leaves the signature as `(tokens) => body` and does not capture `B` works.

### A. Capture `B` (no change to bodies)

```ts
// NEW: B, Exact, Unknown   existing: D, MachineBody, Tokens (the old BodyOf's parameter)
export const machine = entry("machine",
  <D extends AnyDefinition, B extends MachineBody<D> = MachineBody<D>>(
    definition: D,
    body: BodyOf<NoInfer<D>, B>,        // was BodyOf<NoInfer<D>>
  ): Machine<D> => { /* unchanged but for one cast to call body */ });

type BodyOf<D, B> = [D] extends [AnyDefinition]
  ? (tokens: Tokens<D>) => [MachineBody<D>] extends [B] ? B : B & Exact<B, MachineBody<D>>
  : never;

type Unknown<K> = { readonly "unknown key": K };
type Leaf = { readonly [KindOf]: unknown } | { readonly pipe: unknown };     // tokens, Effect values
type Exact<V, T> = unknown extends T ? V : V extends Leaf ? V
  : V extends (...a: infer A) => infer R ? (...a: A) => KeysOnly<R, ReturnOfAll<T>>   // updateMemory's return
  : V extends ReadonlyArray<unknown> ? { readonly [I in keyof V]: Exact<V[I], ElementOf<T>> }
  : V extends object ? { readonly [K in keyof V]: K extends KeysOf<PlainOf<T>>
        ? Exact<V[K], At<PlainOf<T>, K>> : Unknown<K> }
  : V;
```

A user body is unchanged. Decisions inside it, found by failing first:

- `[MachineBody<D>] extends [B] ? B : ...` is needed. Without it `Parameters<typeof machine<typeof Pay>>[1]` (the
  `payBody` pattern in `pay.ts` and `cells.ts`) takes the default `B = MachineBody<D>` and `Exact` over the whole
  type fails with TS2590 "union type too complex".
- The unknown-key marker must be an object type, not a string literal. With `` `unknown key ${K}` `` a primitive
  value (`extra: 1`, `targett: "self"`) makes `number & "unknown key"` collapse to `never`, the object to `never`,
  and every sibling key gets a red line too. An object marker keeps the error on the misspelled key alone.
- `Leaf` is judged on the user's value, as `KindOf`-branded tokens or anything with `pipe` (Effect `Duration`,
  `Schedule`).

Result on the real tree: 0 unexpected errors; the 6 errors are the lines meant to fail: the four "owed" lines in
`tests/types/excess-keys.test-d.ts` (69, 93, 99, 104), and the two planted fixtures `home/stories/structure.ts:209`
(`Vacaton` pause reason) and `sync/stories/structure.ts:61` (`onContext` in a state body), which then need
`@ts-expect-error`. Probes (compound states, schedules, arrays, expression bodies), each flagged on the misspelled
key only: `Zed` beside `HOME` under `states`; `taget` beside `target` at depth 3; `sned` in a schedule placement;
`gaurd`; `guardd: []`; `actionss: []`; `updateMemori`; `memori` returned by `updateMemory`; `Stopp` beside `Go`
under `on`; a root `extra`. The valid body of each is clean, and `payBody`, `Machine<typeof X>` and all 13 fixture
apps compile.

Cost (three runs each, same machine, `--extendedDiagnostics`):

| Signature | Check time  | Instantiations | Memory  |
| --------- | ----------- | -------------- | ------- |
| Today     | 1.11-1.26 s | 5,058,120      | 1.16 GB |
| A         | 1.33-1.38 s | 6,809,943      | 1.45 GB |

Limits, found by running:

- A block-bodied arrow (`({ S }) => { ...; return { ... }; }`, as `room.ts` writes) puts the error on the whole
  argument, not on the key, because TypeScript elaborates into expression bodies only. The message still names the
  path (`The types of 'on.Go.updateMemori' are incompatible`). Any body error behaves so today.
- Messages read `Type '...' is not assignable to type '... & Unknown<"updateMemori">'`; a lone key still gets
  TypeScript's own wording.
- A hoisted object with an extra key (`const saveTarget = {...}` in `room.ts`) is refused; plain TypeScript would pass
  it. No fixture does this.
- Arrays are captured as arrays of a union, not tuples (`const` is inert behind the conditional).
- Not measured: editor latency and completions inside `on: { ... }` (the language server was not driven), the docs
  build, declaration output, `Machine<D, R>`'s second parameter (it is gone with rules out of the body).

### B. `body(...)` from the tokens

```ts
// NEW: body (a token)
machine(House, ({ S, E, body }) => body({
  default: S.HOME,
  on: { Leave: { target: S.AWAY, updateMemori: () => ({ until: 0 }) } },   // error on updateMemori
}));
```

`body: (b: MachineBody<D>) => MachineBody<D>` is the identity; its argument is a fresh literal, so TypeScript's own
check runs, with TypeScript's own error wording and no generic `B`. It adds no check time. Cost: every body gains a
wrapper (`body(` and a closing `)`), a block-bodied function must wrap its `return`, and a key typo inside
`updateMemory`'s return is still not caught.

### C. Object form with tokens from the definition

```ts
// NEW: the second argument may be the body itself
const { S, E } = House;                                      // existing tokens, read from the definition
machine(House, { default: S.HOME, on: { Leave: S.AWAY } });  // fresh literal: checked
```

Also a fresh literal, so the same coverage as B (also no `updateMemory` return keys) and no generic. Cost: `C` (the
reaction tokens) and any per-machine owner would have to exist on the definition rather than be handed to the body;
a second way to write a body, and every fixture that uses `payBody(tokens)` keeps the function form. XState and
effect-machine both pass the config as a direct object; XState does not check it, effect-machine adds its own
validators.

## Recommendation (proposed)

Take A. It is the only shape that changes no body, covers every key including those `updateMemory` returns, and
needs no new concept for a user or an agent to learn. Its price is borne by the type checker (about 14% more check
time on 13 apps) and by messages that are less friendly than TypeScript's own. If that time is not acceptable, B
is the fallback: it is cheap and plain, but costs one wrapper in every body and leaves `updateMemory` returns
unchecked. C needs a second authoring form and gains nothing over B.

If A is taken, Q19 (option C, runtime only) changes to "types refuse every unknown body key; construction and
`flow check` still refuse them for a body the types did not see". Lines in `excess-keys.test-d.ts` marked `wrong`
become `@ts-expect-error` lines, and the two planted fixtures get one. Nothing is decided: this record changes no
Spec, Plan or Task.
