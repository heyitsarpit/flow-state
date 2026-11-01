# Field validation with Effect 4.0.5 Schema

Verified against installed `/Users/arpit/Developer/workflow/lint-bomb/node_modules/effect` (4.0.5, `package.json:4`), by reading `src/` and by running a script plus `tsc`.
Paths below are relative to that `effect/`. Line numbers are in `src/`.

## A. A schema's type without its checks

- **`Schema.toType` keeps checks.** It is documented as "sets `Encoded` to equal the decoded `Type`" (`Schema.ts:2574-2589`) and calls `SchemaAST.toType` (`SchemaAST.ts:4704`). That function moves `encodingChecks` into `checks` and never removes checks. Run: `Schema.toType(Schema.String.check(f)).ast.checks.length === 1`.
- **`Schema.typeCodec` does not exist in 4.0.5.**
- **No public strip-checks helper.**
  - `SchemaAST.replaceChecks(ast, undefined)` (`SchemaAST.ts:4393`) is marked `@internal`.
  - It is absent from `dist/SchemaAST.d.ts`, so it will not typecheck. It exists at runtime only.
  - `Schema.make(ast)` (`Schema.ts:2329`) takes an AST but is typed `<S extends Constraint>(ast: S["ast"]) => S`.
  - Using it would be a cast: `Schema.make<Schema.String>(SchemaAST.replaceChecks(ast, undefined))`.
  - `replaceChecks` is `@internal`, so it is not a supported API.
- **Answer: no clean supported way.** For a bare `Schema.String.check(...)` the base type is just `Schema.String`, but you can't recover it from the checked schema. You can only keep the base alongside.
- **The checked schema's type-level `Type` is `string`.** Checks don't change `Type`, so `Schema.Codec<string>` is the same for the checked and unchecked schema. Only the runtime AST differs.
  - Event payload and memory must use a schema whose AST has no checks, or `Schema.String` itself.
  - Typing is not the problem. Admission validates by the AST, so the AST must be check-free.

## B. Running checks synchronously, no throw, with messages

Use `Schema.decodeUnknownResult(schema)(input)` (`Schema.ts:1725`).

- Signature: `(input: unknown, options?: ParseOptions) => Result<S["Type"], SchemaError>`. It is pure and sync.
- The failure is `SchemaError` with `.issue: SchemaIssue.Issue` (`Schema.ts:1208-1210`).
- `SchemaParser.decodeUnknownResult` (`SchemaParser.ts:496`) fails with the raw `Issue` directly and avoids allocating `SchemaError`.
- The documented gotcha (`Schema.ts:1717-1720`) is that defects in a filter throw. A pure filter is fine.
- `Schema.decodeUnknownOption` is at `Schema.ts:1661`. It has no message.
- `Schema.is(schema)(x)` (`SchemaParser.ts:143`) is a boolean only. It is useless for messages.
- Message: `SchemaIssue.makeFormatterDefault()` (`SchemaIssue.ts:1427`) returns `Formatter<string>` (`SchemaIssue.ts:1125`). It is `SchemaIssue.defaultFormatter` internally.
  - Multiple issues are joined with `\n`, each rendered as `"<message>"` or `"<message>\n  at <path>"`.
  - For a nested path the message includes the `at <path>` line.
  - `makeFormatterStandardSchemaV1()` (`SchemaIssue.ts:1303`) returns `{ issues: [{ message, path }] }`.
  - That one is the way to get a list of all messages: `.issues.map(i => i.message)`.
- **`makeFilter`'s returned string survives.** A string becomes `InvalidValue` with the `message` annotation (`Schema.ts:6790-6797`).
  - `defaultCheckHook` (`SchemaIssue.ts:1258`) = `findMessage(issue.issue) ?? findMessage(issue)`.
  - Verified output: `"12"` against `String.check(makeFilter(s => /^\d{6}$/.test(s) || "Enter the 6-digit code"))` formats to exactly `"Enter the 6-digit code"`.
  - The top-level issue `_tag` is `"Composite"`, not `"Filter"`. Always go through the formatter, not `issue.message`.
  - With no custom message, the built-in checks give e.g. `Expected a value with a length of at least 8`.
- **First vs all.** The default `ParseOptions` is `errors: "first"`, so only the first failing check is reported. `decodeUnknownResult(s)(v, { errors: "all" })` reports all failures. Verified: the output is two lines for two failing checks.
  - First failure: `fmt(issue)` with defaults.
  - All failures: pass `{ errors: "all" }`.
  - If you split the output, split on `"\n"`. Prefer the StandardSchemaV1 formatter and use `.issues[0].message`.

```ts
const fmt = SchemaIssue.makeFormatterDefault()
const r = Schema.decodeUnknownResult(Code)("12")            // Result<string, SchemaError>
Result.isFailure(r) ? fmt(r.failure.issue) : null           // "Enter the 6-digit code"
```

## C. Checks as standalone values

- `Schema.makeFilter<T>(fn, annotations?, abort?) => SchemaAST.Filter<T>` (`Schema.ts:6775`; `SchemaAST.ts:4216`).
  - `fn` returns `FilterOutput = undefined | boolean | FilterIssue | ReadonlyArray<FilterIssue>` (`Schema.ts:6810`), where `FilterIssue` is a `string | Issue | {path, issue}`.
  - `true`/`undefined` mean success. A string is the message.
- `SchemaAST.Check<T> = Filter<T> | FilterGroup<T>` (`SchemaAST.ts:4213`). `Filter<in T>` is contravariant.
- `Schema.makeFilterGroup([...checks], annotations?) => FilterGroup<T>` (`Schema.ts:6837`) bundles several checks. `Filter` and `FilterGroup` also have `.and(other)`.
- Applying: `schema.check(...checks)` takes `readonly [Check<S["Type"]>, ...Array<Check<S["Type"]>>]` (`Schema.ts:201`). It is a non-empty tuple, so an array needs a tuple or non-empty type. `Schema.check(...)` (`Schema.ts:5185`) is the pipeable form.
- Built-ins such as `Schema.isMinLength(8)` are `Check`s too, so they mix with custom ones.
- Because filters are values, `SixDigits` is reusable at an API boundary: `Schema.String.check(SixDigits)`.
- Annotate `makeFilter<string>` explicitly. Otherwise `T` is inferred from the callback parameter.

## D. Recommendation

**Recommended design: (2) `Field(base, checks)`, with a small `validate` built from the real API.**

Why:
- **Nothing is stripped.** `base` is a normal check-free schema, used for the event payload and the memory.
- **Validation is built once**: `base.check(...checks)`, then `decodeUnknownResult`.
- **The filters stay plain `makeFilter` values.** The same `SixDigits` is reusable at an API boundary.
- **Design (1) can't be done on the supported API.** It needs `replaceChecks`, which is internal, and the cast above.

```ts
import { Result, Schema, SchemaIssue, type SchemaAST } from "effect"

const fmt = SchemaIssue.makeFormatterDefault()

export const Field = <S extends Schema.Top>(
  base: S, // e.g. Schema.String: no checks, so Changed never refuses typing
  checks: readonly [SchemaAST.Check<S["Type"]>, ...Array<SchemaAST.Check<S["Type"]>>],
) => {
  const checked = base.check(...checks)                    // built once
  const decode = Schema.decodeUnknownResult(checked)      // sync, pure, no throw
  const firstIssue = (v: S["Type"]): string | null => {
    const r = decode(v)
    return Result.isSuccess(r) ? null : fmt(r.failure.issue)
  }
  return trait({
    id: "Field",
    events: { Changed: { value: base } },                 // payload: no checks
    memory: {
      value: Flow.input(base),
      start: Flow.private(Flow.initial(base, ({ value }) => value)),
      error: Flow.initial(Schema.NullOr(Schema.String), ({ value }) => firstIssue(value)),
      touched: Flow.initial(Schema.Boolean, false),
    },
    /* ...as in the draft; replace firstIssue(value, v) with firstIssue(v) */
  })
}

// call site
const SixDigits = Schema.makeFilter<string>((s) => /^\d{6}$/.test(s) || "Enter the 6-digit code")
const Code = Field(Schema.String, [SixDigits])
// API boundary: Schema.String.check(SixDigits)
```

Typecheck: I ran `tsc` (`lint-bomb`, `Field(Schema.String, [SixDigits])` and the `firstIssue` body) with no errors. The harness did flag a deliberate error, so the check was real.

Caveats:
- **Purity.** Everything is sync and pure if the filters are pure, with no throw for schema failures. A throwing filter would throw.
- **Memoize.** `base.check(...)` and `decodeUnknownResult(...)` are built once per `Field(...)` call, not per event.
- **Inference.**
  - `S extends Schema.Top`. A narrower bound like `Codec<V, I>` also works for plain schemas.
  - Write `makeFilter<string>` explicitly.
  - Mixed checks such as `[SixDigits, Schema.isMinLength(3)]` infer fine. An empty array is a type error (non-empty tuple).
- **Use the base `Type` for payloads.** If `base` is a transform (e.g. `NumberFromString`), `decodeUnknownResult` on the checked schema decodes the `Encoded` side. Keep `base` to non-transforming schemas, or use `Schema.toType(base)` for the payload.
- **Filter-message errors.** Messages come from the filters. Ask each filter for a string (or pass `{ message }` in annotations) so the UI never shows the built-in text.
- **Multiple messages.** `errors: "all"` makes the formatter join with `\n`.
