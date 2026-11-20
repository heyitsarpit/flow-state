# Proposal: machine-body types that hold at any depth (2026-11-20)

**Bottom line (proposed):** `machine()` captures the whole body as one `const` type parameter `B` and checks it
against `B & Exact<B, MachineBody<D>>`, where `Exact` maps every key the shape lacks to `never` at every depth,
including the keys of objects a handler returns. No change of shape: the body stays one callback. A copy of the
package with this signature compiles every fixture and type test unchanged, except the lines that are wrong (they now
fail where they are written). It removes the freedom "a body is anything assignable to its contract, judged against a
contextual type TypeScript may not have resolved yet". It does not type a value from its sibling (`event` from a
rule's `on`, `key` from a schedule's `keys`): that needs one generic per entry, open question Q2.

## The class and the freedom

Two TypeScript rules make one class:

- **Widening.** A literal keeps its literal type only if its contextual type admits one. Inside a generic call the
  body is checked while `D` is in an inference context; at depth 2 (a compound's `states`) the contextual type is the
  deferred conditional `NodeBody<D, …>`, so `"1 second"` widens to `string` and then fails `Duration.Input`. Proved by
  spike 2: `NoInfer` on the return still widens; an explicit `machine<typeof X>`, a curried call or a
  `const B` keep it.
- **No excess check on returns.** TypeScript never excess-checks an object returned from an arrow, at any depth,
  even against a concrete return type (spike 1); only weak-type detection (an object of all-optional keys sharing
  none) fires, which is why `states: { ON: { onn: {} } }` errors today and `{ on: {}, onn: {} }` would not.

The freedom: the body is a structural subtype of `MachineBody<D>`. Anything assignable passes, and literals are judged
against a type that is still generic. Every symptom in question 1 follows from it.

## The design

```ts
// NEW: B, Exact          existing: D, MachineBody, Machine
export const machine = entry("machine",
  <D extends AnyDefinition, const B extends MachineBody<D> = MachineBody<D>>(
    definition: D,
    body: (tokens: Tokens<D>) => B & Exact<B, MachineBody<D>>,
  ): Machine<D, B> => { /* unchanged; Machine's B defaults, so Machine<typeof X> compiles */ });

// NEW: Exact. A Flow token, ending or Effect value is checked by its own type, never walked.
type Exact<B, Sh> = B extends Made ? unknown
  : B extends (...args: infer A) => infer R ? (...args: A) => Keys<R, ReturnOf<Sh>> // returned data: keys only
  : B extends ReadonlyArray<unknown> ? { readonly [I in keyof B]: Exact<B[I], ElementOf<Sh>> }
  : B extends object ? { readonly [K in keyof B]: K extends KeysOf<Sh> ? Exact<B[K], At<Sh, K>> : never }
  : unknown;
```

Why it keeps contextual typing where @task.V3.T104's `ExactBody` lost it: contextual types come from `B`'s
constraint, `MachineBody<D>`, exactly as today; `Exact` maps every known place to `unknown`, so the intersection adds
no type to a handler's `memory`, `event`, a guard's input, `O` handles or `E.X.from`. It only adds `never` where a key
is extra. `ExactBody` replaced the contract with a type built from `B`, so inference had nothing to read. `KeysOf`
and `At` distribute over the shape's unions (a handler is an alternative, a token or a list). This is Effect's own
idiom: `Types.NoExcessProperties` (`effect/dist/Types.d.ts:858`) and `Match`'s
`P extends Handlers & { [K in Exclude<keyof P, …>]: never }` (`effect/dist/Match.d.ts:431`), applied recursively.

Cost to reading: none at the call site; one exported helper type and a second, defaulted type parameter.
Construction still refuses every extra key for casts and plain JavaScript (Compile R4 stays).

## Spikes (all under `scratchpad/q1/`, `tsc` 7.0.2, the package's flags)

The scratchpad is this session's temporary folder (`/private/tmp/claude-501/…/scratchpad/`); it may be cleared.
`q1/pkg/` is a copy of `src/`, `fixtures/` and `tests/` with the signature above patched into `pkg/src/machine.ts`;
`q1/tsconfig.json` checks it with every fixture and `tests/types/`.

1. `q1/s0-repro.ts`: today's `machine()` widens a depth-2 delay to `string`; depth 1 is fine.
2. `q1/s1-ts-basics.ts`: an arrow's returned object is never excess-checked, even against a concrete type.
3. `q1/s2-depth.ts`: `NoInfer` return still widens; curried `machine(D)(body)` and `const B` keep the literal.
4. `q1/pkg` whole check: every fixture (about 40 machines, `payBody` through `Parameters<typeof machine<typeof Pay>>`,
   `MirrorMachine: Machine<typeof Mirror>`, Effect `Schedule` values, Set/Map/Option memory) compiles with no
   implicit `any`. `nested-schedule.test-d.ts`'s inverted `@ts-expect-error` becomes unused (literals kept);
   `excess-keys.test-d.ts`'s four owed lines fail: `onn` at `onn`, `updateMemry` at its key, `bogus: 1` at `bogus`, and
   `cuont` at the handler's `updateMemory` key, naming `cuont`. The planted `pausedPull` in
   `fixtures/sync/stories/structure.ts:61` (an `onContext` in a state) now fails to compile: a true positive.
5. `q1/pkg/s6-depth-exact.ts`: depth 3 `armOnn`, depth 2 `onn` beside valid keys, and `"1 secnd"` each
   fail on their line.
6. `q1/pkg/s4-rules.ts`: Rules O3 on top: `M.rules.SetLandsInBounds` is a typed token, `M.rules.Nope` an error, a
   name in both `invariants` and `turns` errors at the duplicate key, a misspelt rule key errors, invariant
   `memory` is inferred, `machine(Pay, payBody)` still assigns to `Machine<typeof Pay>`. **Fails:** a turns rule's
   `event` from a sibling `on: E.Set` is implicit `any`; neither a union over events nor an extra `Exact`-style
   intersection discriminates by a token.
7. `q1/pkg/s5-turn-helper.ts`: one generic per rule (`turn({ on: E.Set, check })`, a handed token) types `event` as
   Set's payload and refuses `event.vlaue`, inside the same exact body.

Type-check time of the copy (fixtures and type tests): 5.4 s CPU, 1.17 s wall before; 6.5 s CPU, 1.36 s wall after.

## Real machines

| Machine | What it exercises | Result under the design |
| --- | --- | --- |
| Stepper (`number-input`) | A callback body with a block and shared handlers | Compiles; rules spike runs on it |
| Cart (`shop`) | `O` write handles in `actions`, lane endings | Compiles; handles keep their types |
| CheckoutFlow (`shop`) | `C.slot.change` reactions, nested states | `onContext` entries are tokens, not walked |
| Pay (`services/shop`) | Shared `payBody` typed by the constraint | Its explicit return type is excess-checked |
| Room (`home`) | An Effect `Schedule` value as `schedule` | Compiles once `pipe`-carrying values stop the walk |
| Nests (`session`) | Memory returns holding Set, Map, Option | Compiles: returned objects are checked by keys only |

## Open questions

**Q1. Adopt `const B` with `Exact` as the one body signature?**

- **A (recommended):** yes, as above; @task.V3.T57's leftovers, T109, T76 and T77 build on it, and Rules O3's
  `Machine<D, B>` uses the same `B`.
- **B:** curried `machine(Def)((tokens) => body)`: fixes widening only, still no excess checks, and changes every file.
- **C:** keep today's signature and leave exactness to construction.

**Q2. How does a value get typed from its sibling (`event` from a rule's `on`, `key` from a schedule's `keys`)?**

- **A (recommended):** one generic per entry through a handed word, as spike 7: `turn({ on: E.Set, check })`. It
  changes Rules O1's written shape, which is the user's accepted decision, so it needs the user.
- **B:** key the entry by event: `turns: { Set: { SetLandsInBounds: check } }`: no new word, but a second level.
- **C:** `event` typed as the union of all payloads, narrowed by `_tag`: no new word, weaker types.

**Q3. Where should a misspelt returned key's error sit?** Today's design reports it on the handler's key
(`updateMemory`), naming the field.

- **A (recommended):** accept that; the message names the field.
- **B:** try a shape that elaborates into the return (one signature instead of an intersection); unproven.

## Uncovered

- Typing schedule callbacks' `context` and `pausedBy`/`key` by the schedule's own `keys` (same sibling class, Q2).
- The rule-token runtime: `Machine<D, B>`'s `rules` map and construction's duplicate refusal (Rules O3, T106).
- `Exact`'s stop list (`~flow`, `ending`, `tag`, `pipe`) would also skip a user object with such a key.
- Raw-throws' gated constructor: `entry` keeps the signature by cast today; not re-spiked against
  `raw-throws-2026-11-20.md`'s `Gate<F>`, which its own spike says keeps `const` generics.
- Fragments' bodies (T109): same signature expected, not spiked.
- Type-check time on the full test suite, the docs build and editor latency.

## Sidecar log

- One Haiku (prior art: literals and exact keys in deep config). Accepted, read at source: `NoExcessProperties`
  (`Types.d.ts:858`), `Match`'s exact handlers (`Match.d.ts:431`), `ExecutionPlan.make`'s `Steps & { … }`
  (`ExecutionPlan.d.ts:155`). Rejected as not relevant here: its `NoInfer` and TanStack `memo` findings.

## Review findings (Sonnet review, 2026-11-20)

Findings for the next lead to resolve; ✓ marks one the coordinator checked in the code. Nothing here is decided.

1. Wrong: an object returned from a field typed `=> unknown` (`restartOn`) is rejected: every key becomes `never`
   (spike q1/pkg/s9-holes.ts). `Keys` must pass `unknown` through.
2. The stop-list (`~flow`, `ending`, `tag`, `pipe`) leaves holes: an event named `ending` and objects with a `tag`
   or `pipe` key skip checking (spikes s9, s10). Match tokens by one unique brand instead.
3. raw-throws makes tokens opaque without `~flow`; define `Made` once, on a phantom-symbol brand, in both.
4. The spike returns `Machine<D>`, not `Machine<D, B>`; returning `B` (needed by Rules O3) is untested.
5. Errors land on the bad key and name it; messages read "not assignable to 'never'", never "unknown key"; a
   ternary union reports on the whole `on` value.
6. `turn(...)` (or a constructor on the token, `E.Set.turn(...)`) is needed to type `event` from `on`; either
   changes Rules O1's written shape, which the user accepted.
7. Confirmed by re-run: the expected diagnostics only, depth-2 and depth-3 literals kept, Pay's shared body and
   `Machine<typeof X>` assign; type-check 1.47 s wall.
