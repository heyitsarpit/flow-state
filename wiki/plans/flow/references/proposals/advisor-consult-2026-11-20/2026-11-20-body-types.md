---
proposal body-types
status accepted user 2026-11-20 [@review.advisor-holes]
    proposed 2026-11-20
---
# Proposal: machine-body types that hold at any depth (2026-11-20; revised after review and hole-poking)

Questions 1 to 3: the recommendations were accepted; see @review.advisor-holes.

**Bottom line (proposed):** `machine()` captures the whole body as one `const` type parameter `B` and checks it
against `B & Exact<B, MachineBody<D>>`, where `Exact` maps every key the shape lacks to `never` at every depth,
including the keys of objects a handler returns. No change of shape: the body stays one callback. `B` is used for
the check only and is not returned: `Machine`'s second parameter carries just the rule names, so declarations and
`Machine<typeof X>` stay as they are today. A copy of the package with this signature compiles every fixture and
type test unchanged, except the lines that are wrong (they now fail where they are written). It removes the
freedom "a body is anything assignable to its contract, judged against a contextual type TypeScript may not have
resolved yet". It does not type a value from its sibling (`event` from a rule's `on`, `key` from a schedule's
`keys`): that needs one generic per entry, which changes @plan.Rules.O1's written shape (question 1).

## The class and the freedom

Two TypeScript rules make one class:

- **Widening.** A literal keeps its literal type only if its contextual type admits one. Inside a generic call the
  body is checked while `D` is in an inference context; at depth 2 (a compound's `states`) the contextual type is
  the deferred conditional `NodeBody<D, …>`, so `"1 second"` widens to `string` and then fails `Duration.Input`.
  Spike 3: `NoInfer` on the return still widens; an explicit `machine<typeof X>`, a curried call or a `const B`
  keep it.
- **No excess check on returns.** TypeScript never excess-checks an object returned from an arrow, at any depth,
  even against a concrete return type (spike 2); only weak-type detection fires, which is why
  `states: { ON: { onn: {} } }` errors today and `{ on: {}, onn: {} }` would not.

The freedom: the body is a structural subtype of `MachineBody<D>`. Anything assignable passes, and literals are
judged against a type that is still generic. Every symptom in question 1 of the advisor file follows from it.

## The design

```ts
// NEW: B, Exact, LeafOf, RuleNames   existing: D, MachineBody, Machine, entry   shared: Made (raw-throws)
export const machine = entry("machine",
  <D extends AnyDefinition, const B extends MachineBody<D> = MachineBody<D>>(
    definition: D,
    body: (tokens: Tokens<D>) => B & Exact<B, MachineBody<D>>,
  ): Machine<D, RuleNames<B>> => { /* unchanged */ });   // names only: Machine<typeof X> still equals it

type Exact<B, Sh> = B extends LeafOf<Sh> ? unknown       // a value the shape admits whole at this place
  : B extends (...args: infer A) => infer R ? (...args: A) => Keys<R, ReturnOf<Sh>> // returned data: keys only
  : B extends ReadonlyArray<unknown> ? { readonly [I in keyof B]: Exact<B[I], ElementOf<Sh>> }
  : B extends object ? { readonly [K in keyof B]: K extends KeysOf<Sh> ? Exact<B[K], At<Sh, K>> : never }
  : unknown;
type LeafOf<Sh> = Sh extends Made | Pipeable ? Sh : never;   // judged on Flow's shape, never on the user's keys
type Keys<R, Sh> = unknown extends Sh ? unknown             // a place typed unknown is not checked
  : R extends object ? { readonly [K in keyof R]: K extends KeysOf<Sh> ? unknown : never } : unknown;
```

Why it keeps contextual typing where @task.V3.T104's `ExactBody` lost it: contextual types come from `B`'s
constraint, `MachineBody<D>`, exactly as today; `Exact` maps every known place to `unknown`, so the intersection
adds no type to a handler's `memory`, `event`, a guard's input, `O` handles or `E.X.from`. It only adds `never`
where a key is extra. `KeysOf` and `At` distribute over the shape's unions. This is Effect's own idiom:
`Types.NoExcessProperties` (`effect/dist/Types.d.ts:858`) and `Match`'s exact handlers (`Match.d.ts:431`), applied
recursively.

**Where the walk stops.** A value is left to its own type only when it is assignable to a leaf the shape itself
lists at that place: a `Made` value (a token, an ending, a captured builder result; the one brand raw-throws
defines, a symbol key, not `~flow`) or an Effect value (`Duration`, `Schedule`, a Schema). The test reads Flow's
shape, so a user object that happens to hold `tag`, `pipe` or `ending`, or an event named `ending`, is still
walked. A place the shape types as `unknown` (a `restartOn` result) is not checked.

**What `Machine` carries.** `Machine<D, Names extends string = never>` with `rules: { [N in Names]: RuleToken<N> }`.
Returning the whole `B` instead inlines every handler type wherever a machine is exported (Room's declaration grows
from 5.9 KB to 36 KB) and breaks 29 exact type assertions; names give @plan.Rules.O3 its tokens at today's size.
O3's text says "the body's type as a second parameter", so this is a wording change to an accepted Plan (question
2).

Cost to reading: none at the call site; one exported helper type and a second, defaulted type parameter. Errors
land on the extra key and name it, but read "not assignable to type 'never'", never "unknown key"; a ternary of two
handlers reports on the whole value; a misspelt key in a returned object reports on the handler's key
(`updateMemory`), naming the field. Construction still refuses every extra key for casts and plain JavaScript
(@spec.Compile.R4 stays).

## Spikes (under the session scratchpad, `tsc` 7.0.2, the package's flags; the folder may be cleared)

`q1/pkg/` is a copy of `src/`, `fixtures/` and `tests/` with the first-pass signature; `holes/pkg2` returns
`Machine<D, B>`; `fable/pkg3` is this revision (names only, `LeafOf`, the `Keys` fix).

1. `q1/s0-repro.ts`: today's `machine()` widens a depth-2 delay to `string`; depth 1 is fine.
2. `q1/s1-ts-basics.ts`: an arrow's returned object is never excess-checked, even against a concrete type.
3. `q1/s2-depth.ts`: `NoInfer` return still widens; curried `machine(D)(body)` and `const B` keep the literal.
4. `q1/pkg` whole check: every fixture (about 40 machines, `payBody` through `Parameters<typeof machine<typeof Pay>>`,
   Effect `Schedule` values, Set/Map/Option memory) compiles with no implicit `any`. `nested-schedule.test-d.ts`'s
   inverted `@ts-expect-error` becomes unused; `excess-keys.test-d.ts`'s four owed lines fail on their keys. The
   planted `pausedPull` in `fixtures/sync/stories/structure.ts:61` now fails to compile: a true positive.
5. `q1/pkg/s6-depth-exact.ts`: depth 3 `armOnn`, depth 2 `onn` beside valid keys, and `"1 secnd"` fail on their line.
6. `q1/pkg/s4-rules.ts`: rule tokens typed, a duplicate name and a misspelt rule key error, invariant `memory`
   inferred. **Fails:** a turns rule's `event` from a sibling `on: E.Set` is implicit `any`.
7. `q1/pkg/s5-turn-helper.ts`: `turn({ on: E.Set, check })` types `event` as Set's payload and refuses
   `event.vlaue`, inside the same exact body.
8. `holes/pkg2` and `holes/dts`: returning `B` gives 29 new TS2344 errors on `toEqualTypeOf<Machine<…>>` and
   declarations of 36 KB (Room) and 64 KB (Stepper) against 5.9 and 5.6 today.
9. `fable/pkg3` (this revision, run): the same six expected errors as spike 4 and no others in `src/`, fixtures or
   `tests/types/`; `M.rules.A` typed, `M.rules.Nope` an error, `Machine<typeof Stepper>` and the shared `payBody`
   still assign; Room's declaration is 5882 bytes and Stepper's 5635. With `LeafOf` and the `Keys` fix,
   `s9-holes.ts` and `s10.ts` behave as wanted: a `restartOn` object passes; `tag`, `pipe` and `bogus` in a handler
   each error; an event named `ending` no longer hides `Gone`. Whole check 1.5 s wall (1.2 s today). The spike
   keeps today's `~flow` marks as its `Made`; the symbol brand itself is not spiked.

## Real machines

| Machine                  | What it exercises                                | Result under the design                             |
| ------------------------ | ------------------------------------------------ | --------------------------------------------------- |
| Stepper (`number-input`) | A callback body with a block and shared handlers | Compiles; rules spike runs on it                    |
| Cart (`shop`)            | `O` write handles in `actions`, lane endings     | Compiles; handles keep their types                  |
| CheckoutFlow (`shop`)    | `C.slot.change` reactions, nested states         | `onContext` entries are tokens, not walked          |
| Pay (`services/shop`)    | Shared `payBody` typed by the constraint         | Its explicit return type is excess-checked          |
| Room (`home`)            | An Effect `Schedule` value as `schedule`         | Compiles: the shape lists it as a leaf              |
| Nests (`session`)        | Memory returns holding Set, Map, Option          | Compiles: returned objects are checked by keys only |

## Open questions

1. **`event` from a turns rule's `on`.** (user; it edits @plan.Rules.O1, and @task.V3.T106 is next) No body
   signature types `event` from a sibling `on` (spike 6).
   - A (recommended): one generic per rule through a handed word (spike 7), built as a gated builder
     (raw-throws): before `SetLandsInBounds: { on: E.Set, check }`; after
     `SetLandsInBounds: turn({ on: E.Set, check })` (NEW: `turn`; a rule without `on` stays a bare function).
   - B: key by event: `turns: { Set: { SetLandsInBounds: check } }`; no new word, but a second level, and O3's
     name-uniqueness check crosses it.
   - C: keep O1's shape; `event` is the union of all payloads, narrowed by `_tag`.
2. **`Machine`'s second parameter.** (user; a wording change to @plan.Rules.O3) A: the rule names only
   (recommended; spike 9). B: the whole body type, as O3 says today (spike 8's cost).
3. **Adopt `const B` with `Exact` as the one body signature?** (user) A: yes, as above (recommended;
   @task.V3.T57's leftovers, T109, T76 and T77 build on it). B: curried `machine(Def)((tokens) => body)`: fixes
   widening only, no excess checks, changes every file. C: keep today's signature; exactness at construction only.

## Uncovered

- Typing schedule callbacks' `context`, `pausedBy` and `key` by the schedule's own `keys`: the same sibling class
  as question 1, so the same answer (a handed word per schedule) is expected; not spiked.
- The rule-token run time: `machine()` filling `rules` and refusing duplicates (@plan.Rules.O3, T106).
- `Exact` over the symbol-keyed `Made` brand, and against raw-throws' `Gate<F>` (its spike says `const` generics
  survive the gate; not re-run on the real `machine`).
- Fragments' bodies (T109): same signature expected, not spiked.
- Type-check time on the full test suite, the docs build and editor latency.

## Revision log

Review = the Sonnet review; Hole and HQ = @review.advisor-holes §4 holes and questions. No sidecars were
started for the revision; `fable/pkg3` (spike 9) re-ran the claims on a copy of the real package.

- Review 1: fixed. `Keys` passes a shape of `unknown` through (spike 9, `s9-holes.ts` H1).
- Review 2: fixed. The stop is `LeafOf<Sh>`, judged on the shape; H3, H4 and `s10.ts` now error as they should.
- Review 3, seam 4: fixed. `Made` is raw-throws' one brand; how it is made at run time is raw-throws' question 1.
- Review 4, Hole 1, HQ1: fixed. `Machine<D, Names>`; verified by spike 9; the Plan wording is question 2.
- Review 5: fixed in the text (what the errors say and where they land).
- Review 6, Hole 2, HQ2: left to the user (question 1), with before and after.
- Review 7: confirmed again by spike 9.
- Hole 3: fixed. `turn(...)` is a gated builder returning `Made`; order with T98 is raw-throws' question 3.
- HQ3: kept as question 3; the first-pass question on where a returned key's error sits is now a stated limit.
- First-pass sidecar (Haiku, prior art): accepted then, unchanged (`NoExcessProperties`, `Match`, `ExecutionPlan`).
