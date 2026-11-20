---
proposal body-capture-settled
status proposed 2026-11-20
---
# Body capture settled: `Exact` works on the real package

**Verdict (proposed): the advisor consult is right and the typed-machine design's section 3.1 is wrong.**
`machine()` can capture the body as a type parameter and still check it exactly. On a copy of the real package the
signature below keeps all 269 `@ts-expect-error` lines, compiles every fixture and shared body, and adds refusals
today's signature lacks, for about 28% more check time and no change to any declaration. "The body is checked and
never read back" is a choice, not a TypeScript limit. Two corrections to the advisor's text: the body parameter
must sit behind today's conditional (`[D] extends [AnyDefinition] ? … : never` over `NoInfer<D>`), and a leaf maps
to itself, not to `unknown`.

Sources: @proposal.body-types (spikes 4, 5, 9),
@proposal.spec-typed-machine section 3.1, @task.V3.T113, @task.V3.T57, @plan.Rules.O3.

## Why the two spikes disagreed

`B & Exact<B, MachineBody<D>>` with `B extends MachineBody<D>` was not among the typed-machine design's eight.
Its shapes fall in three groups, and each fails for a reason `Exact` avoids:

| Typed-machine shape                         | What it did                                               | Why `Exact` differs               |
| ------------------------------------------- | --------------------------------------------------------- | --------------------------------- |
| V1, V2, V4: `BodyOf<D> & ((t: never) => B)` | `B` infers from a second, free site                       | `B` is constrained; no free site  |
| V3: `(t) => MachineBody<D> & B`, `B` free   | the literal's keys join the target                        | extra keys are mapped to `never`  |
| V5: V3 plus `NoExcess`                      | used `keyof Spec` on unions; skipped functions and arrays | keys distribute over unions       |
| V7, V8: a parameter at `schedules` only     | `D` still generic when it infers                          | the conditional over `NoInfer<D>` |

Its stated cause ("an inferred parameter that sees a literal learns its keys, so it can no longer be excess") is
true and is exactly what the `never` map answers. I reproduced the failure family: variant E (V1's shape added to
`Exact`) loses 10 refusals (`machine.test-d.ts(34,9): error TS2578: Unused '@ts-expect-error' directive`), and
variant F (V5's shape) moves errors off their lines (`excess-keys.test-d.ts(51,11): error TS2578`).

## Signatures run

TypeScript `7.0.2+effect-tsgo.0.61.0`, `effect-tsgo tsc -p tsconfig.json` (the `check:effect` script), on a copy
of `src/`, `fixtures/`, `tests/`, `bench/`. "Suite" is the unchanged tree; "spike" is 13 wrong and 5 valid bodies
I added (`tests/types/spike.test-d.ts`), plus `probe.test-d.ts` for what `B` holds.

| Signature                                                   | Suite errors                          | Spike refusals     | Check time |
| ----------------------------------------------------------- | ------------------------------------- | ------------------ | ---------- |
| Today: `body: BodyOf<NoInfer<D>>`                           | 0                                     | 2 of 13            | 0.92 s     |
| A: advisor's text, `(t: Tokens<D>) => B & Exact<…>`         | 5 wanted + 1 false                    | misses the ternary | 1.15 s     |
| **C6: `Exact` behind the conditional, leaf maps to itself** | **5 wanted, 0 false**                 | **13 of 13**       | **1.18 s** |
| C3: every terminal maps to `B`                              | valid `cells.ts` refused; errors move | -                  | 2.07 s     |
| E: `BodyOf<NoInfer<D>> & (…Exact…)`                         | 17; 10 refusals lost                  | -                  | 1.21 s     |
| F: `B` free, `MachineBody<D> & B & Exact`                   | 27; errors move                       | -                  | 1.20 s     |
| G: C6 plus `& ((t: never) => B)` to keep tuples             | `payBody` breaks; refusals lost       | -                  | 1.29 s     |

The five wanted suite errors are the four lines `excess-keys.test-d.ts` marks "owed" and one planted fixture:

```text
tests/types/excess-keys.test-d.ts(69,19): error TS2322: Type '() => { count: number; cuont: number; }' is not
  assignable to type '(() => {…}) & (() => { readonly count: unknown; readonly cuont: never; })'.
tests/types/excess-keys.test-d.ts(93,49): error TS2322: Type '{}' is not assignable to type 'never'.
tests/types/excess-keys.test-d.ts(99,33): error TS2322: Type '() => {}' is not assignable to type 'never'.
tests/types/excess-keys.test-d.ts(104,76): error TS2322: Type 'number' is not assignable to type 'never'.
fixtures/sync/stories/structure.ts(61,9): error TS2322: Type 'Change[]' is not assignable to type 'never'.
```

The two today refuses are the depth-3 `"1 secnd"` and a typo inside `Flow.keyed` (its own parameter checks it).
A's false error is why the conditional is needed (a depth-2 `send` mapper loses its contextual type):
`tests/types/schedules.test-d.ts(226,39): error TS2345: Argument of type '({ attempt }: { attempt: any; }) => …'`.

## C6 against each question

| Question                                           | Today           | C6                         | Evidence (C6 unless said)                              |
| -------------------------------------------------- | --------------- | -------------------------- | ------------------------------------------------------ |
| Every refusal in `tests/types/` kept               | yes             | yes                        | no TS2578 in the run; 215 directives there, 269 in all |
| Fixtures, `payBody`, `Machine<typeof X>` (3 sites) | yes             | yes                        | no error in `pay.ts`, `cells.ts`, `mirror.ts`          |
| `gaurd` in an alternative                          | compiles        | refused                    | `spike.test-d.ts(26,71): TS2322: 'never[]' … 'never'`  |
| `pausd` in an unkeyed schedule                     | compiles        | refused                    | `spike.test-d.ts(28,120): TS2322: '{}' … 'never'`      |
| Misspelt key a handler returns                     | compiles        | refused                    | `spike.test-d.ts(30,57)`, on `updateMemory`            |
| Depth-3 `armOnn`; `onn` beside `on`                | compiles        | refused                    | `spike.test-d.ts(33,60)`, `(35,159)`                   |
| Depth-3 `"1 secnd"`; typo inside `Flow.keyed`      | refused         | refused                    | `spike.test-d.ts(38,24)`, `(48,158)` (both)            |
| Typo in one branch of a ternary of handlers        | compiles        | refused                    | `spike.test-d.ts(46,51)`, on the other branch          |
| Keys named `tag`, `pipe`, `ending`                 | -               | valid passes; typo refused | `spike.test-d.ts(60,58)`, `(62,71)`                    |
| Depth-2 and depth-3 literals captured in `B`       | -               | yes                        | `probe.test-d.ts`: 0 errors                            |
| Declarations                                       | 4,685,054 B     | identical                  | Room 5875 B, Stepper 5628 B, both runs                 |
| Check time, memory                                 | 0.92 s, 1.05 GB | 1.18 s, 1.28 GB            | three runs each; 4.56M to 5.94M instantiations         |

`probe.test-d.ts` reads back, from a body with schedules at depth 2 and 3: the schedule names (`"beat"`,
`"tick"`), the delay literals (`"2 seconds"`, `"1 second"`), the pause reasons (`"Muted" | "Away"`) and the
`armOn` event tags.

Limits found:

- `const` is inert behind the conditional: arrays are captured as arrays of a union, not tuples (`armOn` is
  `(Entry | EventToken<"Seek", …>)[]`). Names, keys and string literals are kept. Variant G, which restores
  tuples, breaks everything.
- Messages read "not assignable to type 'never'", and a ternary's error lands on the valid branch.
- A hoisted object with an extra key is refused too (`spike.test-d.ts(65,51)`); TypeScript's own check would
  pass it. No fixture does this.
- Not run: editor latency, the docs build, a symbol-keyed brand in place of the `~flow` marks, fragments.

## The signature to ship (C6)

```ts
// NEW: B, Exact, ExactBodyOf, Keys, LeafOf, Plain   existing: D, MachineBody, BodyTokens (BodyOf's parameter)
<D extends AnyDefinition, const B extends MachineBody<D> = MachineBody<D>>(
  definition: D,
  body: ExactBodyOf<NoInfer<D>, B>,
): Machine<D>   // or Machine<D, RuleNames<B>>

type ExactBodyOf<D, B> = [D] extends [AnyDefinition]
  ? (tokens: BodyTokens<D>) => B & Exact<B, MachineBody<D>>
  : never;
type LeafMark = { readonly "~flow": string } | { readonly tag: string } | { readonly ending: unknown }
  | { readonly pipe: unknown };
type LeafOf<Sh> = Sh extends LeafMark ? Sh : never;   // judged on Flow's shape, never on the user's keys
type Plain<Sh> = Sh extends LeafMark | Fn | ReadonlyArray<unknown> ? never : Sh extends object ? Sh : never;
type KeysOf<Sh> = Sh extends unknown ? keyof Sh : never;
type At<Sh, K> = Sh extends unknown ? (K extends keyof Sh ? Exclude<Sh[K], undefined> : never) : never;
type Keys<R, Sh> = [Sh] extends [never] ? unknown : unknown extends Sh ? unknown
  : R extends ReadonlyArray<unknown> | Fn | LeafOf<Sh> ? unknown
  : R extends object ? { readonly [K in keyof R]: K extends KeysOf<Plain<Sh>> ? unknown : never } : unknown;
type Exact<B, Sh> = B extends LeafOf<Sh> ? B   // itself, so a union with a token does not absorb the check
  : B extends (...args: infer A) => infer R ? (...args: A) => Keys<R, ReturnOf<Sh>>
  : B extends ReadonlyArray<unknown> ? { readonly [I in keyof B]: Exact<B[I], ElementOf<Sh>> }
  : B extends object
    ? { readonly [K in keyof B]: K extends KeysOf<Plain<Sh>> ? Exact<B[K], At<Plain<Sh>, K>> : never }
    : unknown;
```

The `const` modifier can be dropped (it does nothing here). The full file is
`/private/tmp/claude-501/-Users-arpit--claude-spares-spare-4kkXXd/a725f531-3dec-4d58-90f5-b639943ea4d1/scratchpad/bc/machine.C6.ts`;
outputs are `C6.out`, `base2.out`, `exactA.out`, `C3.out`, `E.out`, `F.out`, `G.out` beside it (the folder may be
cleared).

## Consequences (proposed)

- **Typed-machine design, section 3.1.** The rule "never read back" loses its proof. Sections 3.2 to 3.5 (one
  `Parts<D>`, `.Type` phantoms, deleting mapper annotations) do not depend on it and stand. Section 3.7's two
  holes close with C6, with no cause-hunt and no change of shape.
- **@task.V3.T113.** Its "excess keys still fail" acceptance is met by C6, and the four owed lines in
  `excess-keys.test-d.ts` become real `@ts-expect-error` lines. The snapshot's schedule names, pause reasons and
  delays can be read from `B`. T113 should build on C6 first.
- **Declared-schedules Task.** Not needed for typing. A snapshot typed from the body needs `Machine` to carry
  what it reads; carrying names and reasons only (as the advisor's `Machine<D, Names>` does for rules) keeps
  declarations small, where carrying all of `B` is the advisor's measured 36 KB. Declaring schedules on the
  definition is then justified only by what a definition-only reader needs: `Snapshot<typeof Def>` without the
  machine, and a saved record's key codec. The keyed schedule's `key` in `send` is the sibling class (not a body
  capture question) and is unchanged by this.
- **Rule tokens.** `Machine<D, Names>` is buildable: `B` holds every key of the body at every depth, so
  `RuleNames<B>` is a `keyof` read. Not run on a real `rules` field, since `MachineBody` has none yet.
- **`fixtures/sync/stories/structure.ts:61`** is a planted wrong body that stops compiling; it needs a cast or
  a `@ts-expect-error` when C6 lands.
