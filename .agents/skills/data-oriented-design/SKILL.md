---
name: data-oriented-design
description: Design programs data-first with Schema-owned validation and clean transformation phases. Use when modeling application data or simplifying scattered validation and procedural code.
---

1. **Define application data as Schema first.** Derive input and admitted types from
   schemas. Keep known data precisely typed; reserve unknown inputs for actual external
   boundaries. A typed input still needs validation of rules its static type cannot express.

   ```ts
   import { Effect, Option, Result, Schema, Struct, flow } from "effect";

   const Line = Schema.Struct({
     sku: Schema.NonEmptyString,
     quantity: Schema.Int.check(Schema.isGreaterThan(0)),
     unitPriceCents: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
   });

   const OrderFields = Schema.Struct({
     lines: Schema.Array(Line),
     note: Schema.OptionFromOptionalNullOr(Schema.String),
     discountPercent: Schema.Int.check(
       Schema.isBetween({ minimum: 0, maximum: 100 }),
     ),
   });
   ```

   Derive related schemas from existing fields instead of copying definitions.

   ```ts
   const LineIdentity = Line.mapFields(Struct.pick(["sku"]));
   const DomainOrderFields = Schema.toType(OrderFields);
   ```

   mapFields preserves the selected field schemas but drops parent-level checks by default;
   rebuild any relationships the derived schema needs. toType describes already-decoded
   data, so DomainOrderFields expects note to be an Option rather than raw absence.

2. **Write named validation functions and compose them into custom schemas.** Field
   schemas establish shape; custom validators establish relationships. Keep algorithms
   readable as plain functions, with Schema owning their composition and failure reporting.
   Expose one validation function that returns admitted data or an error as a Result.

   ```ts
   const validateUniqueSkus = (order: typeof OrderFields.Type) => {
     const seen = new Set<string>();
     for (const [index, line] of order.lines.entries()) {
       if (seen.has(line.sku)) {
         return { path: ["lines", index, "sku"], issue: `Duplicate SKU: ${line.sku}` };
       }
       seen.add(line.sku);
     }
     return true;
   };

   const Order = OrderFields.check(Schema.makeFilter(validateUniqueSkus));
   type OrderInput = typeof Order.Encoded;
   type Order = typeof Order.Type;

   const validateOrder = Schema.decodeResult(Order, { onExcessProperty: "error" });
   ```

   Attach relational failures to the responsible field. The duplicate rule above points
   to ["lines", index, "sku"], identifying both the broken relationship and its location.
   A custom filter can return multiple path-specific issues for independent failures.
   Use errors: "all" only when accumulation fits the contract; preserve deliberate
   first-error precedence for ordered admission and compilation.

3. **Build clean operators over admitted data in explicit phases.** Each operator
   performs one meaningful transformation. Validate once before entering the pipeline;
   propagate failures without running later phases. Preserve phase order when diagnostics
   or observations depend on it, even if merging passes would shorten the code.

   ```ts
   const priceLines = (lines: Order["lines"]) =>
     lines.map((line) => ({
       sku: line.sku,
       amountCents: line.quantity * line.unitPriceCents,
     }));

   const subtotal = (lines: ReturnType<typeof priceLines>) =>
     lines.reduce((sum, line) => sum + line.amountCents, 0);

   const applyDiscount = (amountCents: number, percent: number) =>
     Math.round(amountCents * (100 - percent) / 100);

   const calculateQuote = (order: Order) => {
     const priced = priceLines(order.lines);
     const totalCents = applyDiscount(subtotal(priced), order.discountPercent);
     return { lines: priced, totalCents };
   };

   const quote = flow(validateOrder, Result.map(calculateQuote));
   ```

   Prioritize readable code over a functional appearance. Use flow for a clear reusable
   composition and pipe when it makes a longer transformation easier to follow. Prefer
   ordinary calls and named intermediate values when they read better. Result.map runs
   only after success; use Result.flatMap when the next phase can also fail.

4. **Pass context into schema factories when rules depend on a registry or parent.**
   Prefer `makeOrderSchema(catalog)` over global catalog access or rechecking product
   membership in pricing. Construct its decoder once per stable context. Preserve exact
   object identity when a matching identifier alone does not establish membership.

   **Required: normalize absence to Option at every seam, preferably in Schema.**
   OrderFields.note above transforms a missing key, null, or undefined into Option.none,
   and a string into Option.some. The decoded field is required and has type Option<string>.
   **Always use Schema.OptionFromOptionalNullOr for optional or nullable schema fields so null and undefined never appear downstream; decoded absence must be Option.**
   Normalize lookup results and foreign responses at their adapters when no schema is involved.
   Internal domain types and function results must use Option instead of null, undefined,
   nullable unions, or optional properties that represent absence. Keep raw absence only
   inside boundary adapters; translate Option back only at an external output boundary.

   ```ts
   const noteText = (order: Order) =>
     Option.getOrElse(order.note, () => "No note");
   ```

   If missing, null, and explicit undefined have different meanings, classify them at
   the seam into a tagged domain value before normalization; do not erase that distinction.
   Consume Option with map, flatMap, or match; do not unwrap it back to null or undefined
   inside the domain. Void-returning commands represent no result, not optional domain data.

   Distinguish domain absence from an explicitly defined default. When omission means a
   concrete value, choose whether the default belongs to decoding or only construction.

   ```ts
   const Attempts = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
   const RetryInput = Schema.Struct({
     attempts: Attempts.pipe(Schema.withDecodingDefaultKey(Effect.succeed(3))),
   });
   ```

   ```ts
   const RetryConstruction = Schema.Struct({
     attempts: Attempts.pipe(Schema.withConstructorDefault(Effect.succeed(3))),
   });
   ```

   RetryInput decodes a missing attempts key as 3; explicit undefined and invalid values
   still fail. RetryConstruction.make({}) supplies 3, but its decoder requires attempts.
   Constructor defaults do not establish decoding defaults. Keep meaningful absence as
   Option; introduce a default only when the domain explicitly defines that meaning.

5. **Represent phase outcomes and ownership explicitly.** Use tagged unions when success
   variants carry different data. Share small mechanics only when their rules match;
   keep domain-specific validation and error projection with their owner. Derive redundant
   views, copy mutable data at ownership boundaries, and separate execution from preparation.

   Introduce Effect when a phase performs work such as persistence. Lift the existing
   Result once; failed validation must skip the save. Pure quotation remains synchronous.

   ```ts
   type Quote = ReturnType<typeof calculateQuote>;
   const saveQuote = (input: OrderInput, save: (value: Quote) => Effect.Effect<void, Error>) =>
     Effect.gen(function* () {
       const value = yield* Effect.fromResult(quote(input));
       yield* save(value);
     });
   ```

   Use a generator when named steps read more clearly than chained adapters. Do not turn
   pure calculations into Effects or introduce combinators solely to look Effect-native.

## Optional best practices for authored configuration

Use these patterns when they express an actual domain invariant or simplify downstream
code. They are not required conventions; do not reshape unrelated data to fit them.

**Complete tables:** when every declared key needs a value, a finite-key Record can
establish coverage upfront. Use excess-property rejection if extra keys are also invalid.

```ts
const StateName = Schema.Literals(["idle", "active"]);
const StateTable = Schema.Record(StateName, Schema.Boolean);
```

**Nonempty collections:** when at least one item is required, NonEmptyArray carries that
guarantee into indexing. Keep an ordinary Array when empty is a meaningful state.

```ts
const Targets = Schema.NonEmptyArray(StateName);
const firstTarget = (targets: typeof Targets.Type) => targets[0];
```

**Branch-specific configuration:** when variants require different fields, a tagged union
can make valid combinations explicit. Keep a simple struct when there are no such variants.

```ts
const NodeConfig = Schema.TaggedUnion({
  leaf: {},
  compound: { initial: StateName, children: Targets },
});
```

If the domain also requires initial to name a child, express that relationship separately
and attach its failure to the responsible field.

```ts
const ValidNode = NodeConfig.check(Schema.makeFilter(node =>
  node._tag === "leaf" || node.children.includes(node.initial) ||
  { path: ["initial"], issue: "Initial must be a child" }));
```

## Optional best practices for operators and proofs

**Schema-derived dispatch:** an existing union can expose exhaustive matching and typed
variant selection. Use this for plan dispatch or compiler phases when it reads more clearly
than a switch. Match and selection consume admitted data; they do not perform admission.

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

Missing match cases fail typechecking; selected start plans retain their target field.
Derive these operations from the union instead of maintaining parallel tag lists or casts.

**Schema-derived comparison:** when plain configuration has structural value semantics,
derive its equivalence instead of repeating field-by-field comparison logic.

```ts
const Config = Schema.Struct({ retries: Schema.Int, targets: Schema.Array(Schema.String) });
const sameConfig = Schema.toEquivalence(Config);
```

Declared struct fields determine comparison, with nested arrays compared by value. Use
this for configuration change detection or output comparison only when those are the
desired laws. Retain identity checks for registered descriptors and dedicated algorithms
for alias-sensitive graphs or canonical keys.

**Schema-derived test data:** generate valid domain values for existing compiler and
operator properties, such as deterministic output, preserved order, and input isolation.

```ts
import { FastCheck } from "effect/testing";
const configArbitrary = Schema.toArbitrary(Config)(FastCheck);
const samples = FastCheck.sample(configArbitrary, 25);
```

The factory call above targets effect@4.0.0-rc.112; newer documentation may show a direct
Arbitrary return instead. Check the installed API. Opaque declarations can require custom
generation support. Keep targeted invalid, identity, and hostile-reflection fixtures;
generated valid data does not replace them.

The example uses Effect Schema v4; use the project's schema library and error channel.
Schema refinements do not automatically create nominal types: keep trusted operators
private or add a brand when callers must prove admission. Keep data owned or immutable
while later phases trust it. Test validation failures, diagnostic paths, phase ordering,
mutation isolation, and successful calculations. Monetary arithmetic here assumes safe
integer totals; choose the domain's numeric representation and bounds in real code.
