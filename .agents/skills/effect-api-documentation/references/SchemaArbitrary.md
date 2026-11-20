# `Arbitrary`

Source: installed `effect@4.1.4`, module `effect/Arbitrary` (`node_modules/effect/src/Arbitrary.ts`). Examples assume `import { Arbitrary, Schema } from "effect"`.

`@stability unstable`: every export in the module is tagged unstable.

Note: there is no `Arbitrary.make` in 4.1.4. The schema-to-generator bridge is `Arbitrary.schema(schema, options?)` (Arbitrary.ts:423). Schema-derived generation is also how `@effect/vitest` compiles schema inputs (internal.ts:45-57).

`Arbitrary` derives, samples, shrinks and checks values. `checkEffect` is the property runner. Its `concurrency` option (Arbitrary.ts:201-210) is present in 4.1.4.

## API index

1. [Arbitrary.schema](#arbitraryschema)
2. [Arbitrary.checkEffect](#arbitrycheckeffect)
3. [Arbitrary.sampleEffect](#arbitrysampleeffect)
4. [Arbitrary.configureGlobal](#arbitraryconfigureglobal)

### Additional known APIs (not expanded)

`Arbitrary.Arbitrary`, `Arbitrary.Constant`, `Arbitrary.array`, `Arbitrary.map`, `Arbitrary.filter`, `Arbitrary.filterMap`,
`Arbitrary.flatMap`, `Arbitrary.all`, `Arbitrary.isArbitrary`, `Arbitrary.formatCheckFailure`, `Arbitrary.TypeId`,
`Arbitrary.SchemaOptions`, `Arbitrary.ArrayOptions`, `Arbitrary.SampleOptions`, `Arbitrary.SampleError`, `Arbitrary.CheckOptions`,
`Arbitrary.GlobalOptions`, `Arbitrary.Replay`, `Arbitrary.CheckResult`, `Arbitrary.Passed`, `Arbitrary.Falsified`,
`Arbitrary.Exhausted`, `Arbitrary.ReplayMismatch`, `Arbitrary.ReturnedFalse`, `Arbitrary.PropertyError`, `Arbitrary.PropertyFailure`

### [Arbitrary.schema](/Users/arpit/Developer/flow-state/node_modules/effect/src/Arbitrary.ts:423)

Creates an `Arbitrary` for the type of a `Schema`.

Signature:

```ts
function schema<S extends Schema.Constraint>(
  schema: S,
  options?: SchemaOptions<S["Type"]>
): Arbitrary<S["Type"]>
```

`SchemaOptions<A>` has one optional field: `shrink?: (value: A) => ReadonlyArray<A>` (Arbitrary.ts:74-80).

Confirmed behaviour (Arbitrary.ts:408-422): a custom `shrink` replaces the Schema-derived shrinking. It is evaluated lazily after a property failure and must be synchronous, deterministic, terminating and free of mutation. Each returned candidate is validated against the decoded side of the original Schema before it reaches the property.

Example:

```ts
import { Arbitrary, Schema } from "effect"

const User = Schema.Struct({
  name: Schema.String,
  age: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 120 }))
})

const users = Arbitrary.schema(User)
```

### [Arbitrary.checkEffect](/Users/arpit/Developer/flow-state/node_modules/effect/src/Arbitrary.ts:855)

Checks a pure or effectful property. Returns a `CheckResult` value rather than failing, so failures are data.

Signature:

```ts
function checkEffect<A, E = never, R = never>(
  self: Arbitrary<A>,
  property: (value: A) => boolean | Effect.Effect<boolean, E, R>,
  options?: CheckOptions
): Effect.Effect<CheckResult<A, E>, never, R>
```

`CheckOptions` (Arbitrary.ts:201-210):

```ts
interface CheckOptions {
  readonly runs?: number
  readonly concurrency?: number   // positive safe integer, default 1
  readonly size?: number
  readonly maxDiscards?: number
  readonly maxShrinks?: number
  readonly seed?: string | number
  readonly replay?: Replay
}
```

Confirmed behaviour:

- `concurrency` bounds the number of pending generated cases, including evaluations that finished ahead of an earlier case. Results are still processed in generation order. For deterministic generators and independent, repeatable properties, changing it preserves the result, including the selected failure, run and discard counts, shrinks and replay token (Arbitrary.ts:180-190).
- Later cases can run speculatively. Their fibers are interrupted and awaited before shrinking or returning. Shrinking stays sequential.
- When `replay` is present, `runs`, `size`, `maxDiscards`, `maxShrinks`, `seed` and `concurrency` are ignored, and replay stays sequential (Arbitrary.ts:191-199).
- Returning `false` and failing the Effect are both shrinkable falsifications. Defects and interruption continue through the Effect instead of becoming a `CheckResult` (Arbitrary.ts:849-853).
- Properties must treat generated values as immutable, and must give the same outcome for the same input (Arbitrary.ts:829-850).

`CheckResult<A, E>` is `Passed | Falsified<A, E> | Exhausted | ReplayMismatch` (Arbitrary.ts:361). `Falsified` carries `initialInput`, `shrunkInput`, `failure` (`ReturnedFalse` or `PropertyError<E>`), `runs`, `discards`, `shrinks` and `replay` (Arbitrary.ts:302-318).

Example:

```ts
import { Arbitrary, Effect, Schema } from "effect"

const Pair = Schema.Tuple([Schema.Int, Schema.Int])

const program = Effect.gen(function*() {
  const result = yield* Arbitrary.checkEffect(
    Arbitrary.schema(Pair),
    ([a, b]) => Effect.succeed(a + b === b + a),
    { runs: 200, concurrency: 4 }
  )
  return result._tag
})
// program => Effect<"Passed" | "Falsified" | "Exhausted" | "ReplayMismatch">
```

### [Arbitrary.sampleEffect](/Users/arpit/Developer/flow-state/node_modules/effect/src/Arbitrary.ts:820)

Draws values directly from an `Arbitrary` for inspection or fixtures.

Signature:

```ts
function sampleEffect<A>(
  self: Arbitrary<A>,
  options?: SampleOptions
): Effect.Effect<ReadonlyArray<A>, SampleError>
```

`SampleOptions` has `count`, `size`, `maxDiscards`, `seed` (Arbitrary.ts:121-130). `SampleError` carries `generated`, `discards` and `seed` (Arbitrary.ts:140-146).

Example:

```ts
import { Arbitrary, Effect, Schema } from "effect"

const samples = Effect.gen(function*() {
  // SampleError is the typed failure of this Effect
  return yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.Int), { count: 5, seed: 42 })
})
```

### [Arbitrary.configureGlobal](/Users/arpit/Developer/flow-state/node_modules/effect/src/Arbitrary.ts:240)

Sets defaults used by `checkEffect` and `sampleEffect`.

Signature:

```ts
const configureGlobal: (options: GlobalOptions) => void
```

`GlobalOptions` has `check?: Omit<CheckOptions, "replay">` and `sample?: SampleOptions` (Arbitrary.ts:218-225).

Confirmed behaviour (Arbitrary.ts:226-239): options are resolved once per execution in this order: explicit values, configured defaults, built-in defaults. Pass `{}` to reset. Configure before starting concurrent tests. Changes affect later executions, including Effects created earlier, but not active runs.

Example:

```ts
import { Arbitrary } from "effect"

Arbitrary.configureGlobal({ check: { concurrency: 4, runs: 500 } })
```
