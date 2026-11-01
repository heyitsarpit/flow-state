# Schema admission and boundaries

Use Schema for unknown or authored data and for invariants that need explicit
admission. Keep deterministic algorithms readable as named functions. Schema owns
their composition and failure reporting.

## Define and derive data

Derive input and admitted types from schemas. Keep known data precisely typed and
reserve unknown inputs for actual external boundaries. A typed input still needs
validation for rules its static type cannot express.

```ts
import { Data, Effect, Option, Result, Schema, Struct, flow } from "effect";

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

`mapFields` preserves the selected field schemas but drops parent-level checks by
default; rebuild any relationships the derived schema needs. `toType` describes
already-decoded data, so `DomainOrderFields` expects `note` to be an `Option` rather
than raw absence.

## Compose named validation

Field schemas establish shape; custom validators establish relationships. Expose one
validation function that returns admitted data or a `Result` error.

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

Attach relational failures to the responsible field. The duplicate rule points to
`["lines", index, "sku"]`, identifying both the broken relationship and its
location. A custom filter can return multiple path-specific issues for independent
failures. Use `errors: "all"` only when accumulation fits the contract; preserve
deliberate first-error precedence for ordered admission and compilation.

## Context-dependent schemas

Pass a registry or parent into a schema factory when rules depend on it. Prefer
`makeOrderSchema(catalog)` over global catalog access or rechecking product
membership in pricing. Construct its decoder once per stable context. Preserve exact
object identity when a matching identifier alone does not establish membership.

## Normalize absence at seams

Prefer Schema for absence normalization:

- `Schema.OptionFromOptionalNullOr` turns a missing key, `null`, or `undefined` into
  `Option.none`, and a string into `Option.some`.
- Use it for optional or nullable schema fields so `null` and `undefined` do not
  appear downstream. The decoded field is required and has type `Option<string>`.
- Normalize lookup results and foreign responses at adapters when no schema is
  involved.
- Internal domain types and function results use `Option` instead of `null`,
  `undefined`, nullable unions, or optional properties that represent absence.
- Keep raw absence inside boundary adapters; translate `Option` back only at an
  external output boundary.

If missing, `null`, and explicit `undefined` have different meanings, classify them
at the seam into a tagged domain value before normalization. Do not erase that
distinction. Consume `Option` with `map`, `flatMap`, or `match`; do not unwrap it
back to `null` or `undefined` inside the domain. Void-returning commands represent
no result, not optional domain data.

Distinguish domain absence from an explicitly defined default. When omission means a
concrete value, decide whether the default belongs to decoding or only construction.

```ts
const noteText = (order: Order) =>
  Option.getOrElse(order.note, () => "No note");
```

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

`RetryInput` decodes a missing `attempts` key as `3`; explicit `undefined` and
invalid values still fail. `RetryConstruction.make({})` supplies `3`, but its
decoder requires `attempts`. Constructor defaults do not establish decoding
defaults. Keep meaningful absence as `Option`; introduce a default only when the
domain explicitly defines that meaning.
