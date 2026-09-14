# Optional derived operations and proofs

Use these patterns when they express a real invariant or simplify a compiler,
operator, or proof. They are not required conventions.

## Schema-derived dispatch

An existing union can expose exhaustive matching and typed variant selection. Use
this for plan dispatch or compiler phases when it reads more clearly than a switch.
Matching and selection consume admitted data; they do not perform admission.

- The union is still attached to its schema: use `Plan.match` and `Plan.isAnyOf`.
- The union is plain trusted data: use `Data.taggedEnum` and `$match`.
- The value is unknown: decode first. Neither matcher is an admission boundary.

```ts
const Plan = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("start"), target: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("stop") }),
]).pipe(Schema.toTaggedUnion("kind"));
```

```ts
const describePlan = Plan.match({
  start: plan => `Start ${plan.target}`,
  stop: () => "Stop",
});
```

```ts
const selectStarts = (plans: readonly (typeof Plan.Type)[]) =>
  plans.filter(Plan.isAnyOf(["start"]));
```

Missing match cases fail typechecking; selected start plans retain their target
field. Derive these operations from the union instead of maintaining parallel tag
lists or casts.

## Schema-derived comparison

When plain configuration has structural value semantics, derive its equivalence
instead of repeating field-by-field comparison logic.

```ts
const Config = Schema.Struct({ retries: Schema.Int, targets: Schema.Array(Schema.String) });
const sameConfig = Schema.toEquivalence(Config);
```

Declared struct fields determine comparison, with nested arrays compared by value.
Use this for configuration change detection or output comparison only when those are
the desired laws. Retain identity checks for registered descriptors and dedicated
algorithms for alias-sensitive graphs or canonical keys.

## Schema-derived test data

Generate valid domain values for existing compiler and operator properties, such as
deterministic output, preserved order, and input isolation.

```ts
import { FastCheck } from "effect/testing";
const configArbitrary = Schema.toArbitrary(Config)(FastCheck);
const samples = FastCheck.sample(configArbitrary, 25);
```

The factory call above targets `effect@4.0.0-rc.112`; newer documentation may show a
direct Arbitrary return instead. Check the installed API. Opaque declarations can
require custom generation support. Keep targeted invalid, identity, and
hostile-reflection fixtures; generated valid data does not replace them.

The examples use Effect Schema v4. Use the project's schema library and error
channel. Schema refinements do not automatically create nominal types: keep trusted
operators private or add a brand when callers must prove admission. Keep data owned
or immutable while later phases trust it.

Test validation failures, diagnostic paths, phase ordering, mutation isolation, and
successful calculations. Monetary arithmetic in the quote example assumes safe
integer totals; choose the domain's numeric representation and bounds in real code.
