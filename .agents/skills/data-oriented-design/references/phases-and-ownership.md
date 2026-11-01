# Transformations, phases, and ownership

Start with the data throughout the application: configuration, state, intermediate
results, facts, plans, and outcomes. Transformations and decisions operate on that
data. Effect coordinates execution.

```text
Application data ↔ transformations and decisions ↔ application data
                              ↓
                      Effect execution
```

Compute shared facts once per owned snapshot. Produce inspectable plans when
preparation and execution benefit from separate owners. Prefer idempotent
transformations when repeating them should have no additional effect. These are
optional patterns, not required layers for every function.

## Operators over admitted data

Each operator should perform one meaningful transformation. Validate once before the
pipeline. Propagate failures without running later phases. Preserve phase order when
diagnostics or observations depend on it, even if merging passes would shorten code.

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

Prefer readable code over a functional appearance. Use `flow` for a clear reusable
composition and `pipe` when it makes a longer transformation easier to follow.
Ordinary calls and named intermediate values are often clearer. `Result.map` runs
only after success; use `Result.flatMap` when the next phase can also fail.

## Outcomes and ownership

- Use `Result` or `Option` for their canonical two-case meanings.
- Prefer `Data.TaggedEnum` for three or more trusted variants. Use `Data.taggedEnum`
  for constructors and exhaustive `$match`.
- Share mechanics only when their rules match.
- Keep validation and error projection with their owner.
- Derive redundant views.
- Copy mutable data at ownership boundaries.
- Separate preparation from execution.

```ts
// Before: the phase shape is rebuilt at each branch.
const outcome = approved
  ? { stage: "finalized", invoiceId }
  : { stage: "needs-approval", approver };
```

```ts
// After: four lifecycle variants are named once.
type QuoteLifecycle = Data.TaggedEnum<{
  Draft: { lines: QuoteLine[] }
  Calculated: { quote: Quote }
  NeedsApproval: { quote: Quote; approver: string }
  Finalized: { quote: Quote; invoiceId: string }
}>;

const QuoteLifecycle = Data.taggedEnum<QuoteLifecycle>();
const outcome = QuoteLifecycle.NeedsApproval({ quote, approver });
const label = QuoteLifecycle.$match({
  Draft: ({ lines }) => `draft: ${lines.length} lines`,
  Calculated: () => "calculated",
  NeedsApproval: ({ approver }) => `awaiting ${approver}`,
  Finalized: ({ invoiceId }) => `finalized: ${invoiceId}`,
})(outcome);
```

## Keep execution effectful only where needed

Introduce Effect when a phase performs work such as persistence. Lift the existing
`Result` once; failed validation must skip the save. Pure quotation remains
synchronous.

```ts
type Quote = ReturnType<typeof calculateQuote>;
const saveQuote = (input: OrderInput, save: (value: Quote) => Effect.Effect<void, Error>) =>
  Effect.gen(function* () {
    const value = yield* Effect.fromResult(quote(input));
    yield* save(value);
  });
```

Use a generator when named steps read more clearly than chained adapters. Do not
turn pure calculations into Effects or introduce combinators solely to look
Effect-native.

## Downstream patterns

The examples use named helpers as stand-ins for domain algorithms.

**Compute reusable facts.** Keep indexes and analysis results separate from the
primary representation. Build them once per owned snapshot so updates cannot leave
stale facts behind.

```ts
const facts = analyzeDefinition(definition);
const resolved = resolveBehavior(structure, facts);
const diagnostics = findUnreachableStates(resolved, facts);
```

**Interpret plans separately.** Decision code produces instructions that execution
and explanation can both consume. Use the schema-derived exhaustive matcher in
[references/proofs.md](proofs.md) when it makes interpreters clearer. Use
`Data.TaggedEnum` for trusted plan values when constructors make complete
instructions easier to read. Keep ordering and execution semantics explicit.

```ts
// Before: plan values are assembled by separate branches.
const steps = planChange(current, requested);
const explanation = describeSteps(steps);
const program = executeSteps(steps);
```

```ts
// After: trusted plan variants have named constructors and one matcher.
type Step = Data.TaggedEnum<{
  Create: { key: string; value: string }
  Update: { key: string; value: string }
  Remove: { key: string }
  Skip: { key: string; reason: string }
}>;
const Step = Data.taggedEnum<Step>();
const step = Step.Update({ key: "mode", value: "safe" });
const explanation = Step.$match({
  Create: ({ key }) => `create ${key}`,
  Update: ({ key }) => `update ${key}`,
  Remove: ({ key }) => `remove ${key}`,
  Skip: ({ key, reason }) => `skip ${key}: ${reason}`,
})(step);
const program = executeSteps([step]);
```

**Make functions idempotent when possible.** When an operation means “ensure this
state,” repeating it should have no additional effect. For a transformation,
`f(f(x))` should equal `f(x)` by domain value. Determinism alone does not establish
this property.

```ts
const ensureTarget = (targets: readonly string[], target: string): readonly string[] =>
  targets.includes(target) ? targets : [...targets, target];
```

Ensuring the same target twice adds it only once. Keep intentionally cumulative
operations cumulative. For external effects, idempotence must be enforced by the
execution owner.
