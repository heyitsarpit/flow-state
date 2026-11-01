# Schemas and failures

Read this when a change crosses a data boundary or changes the meaning of an
outcome or failure.

## Decode external data once

- Use `unknown` for unvalidated input and foreign causes.
- Decode the complete value at its real boundary.
- Derive the TypeScript type from the schema when possible.
- Use an adapter when wire and domain shapes intentionally differ.
- Validate configuration, environment data, HTTP payloads, persisted data, and fixtures at their boundary.
- Use `never` only for a genuinely impossible state. Do not use it to skip validation.

```ts
const AccountNumber = Schema.String.pipe(
  Schema.pattern(/^[0-9]+$/u),
  Schema.brand("AccountNumber"),
);
const Account = Schema.Struct({ id: Schema.String, accountNumber: AccountNumber });
type Account = typeof Account.Type;

const raw: unknown = JSON.parse(input);
const account = Schema.decodeUnknownSync(Account)(raw);
```

Do not check one marker and cast the rest. Do not maintain a separate type when
schema drift could break the contract.

## Keep outcomes distinct

Keep these meanings separate when callers can observe them:

- Success.
- Expected absence.
- No-op.
- Refusal.
- Expected operational failure.
- Defect.
- Interruption.
- Cleanup failure.

Use `Option` for expected absence. Use typed failures for expected operational
failure. Keep defects and interruption separate until the host renders them.
Treat cleanup failure as part of the resource contract.

Do not hide meaning in `undefined`, `false`, an empty collection, or a generic
error.

## Use the canonical failure type

- Use the repository's canonical `Diagnostic` for expected failures.
- Its owner defines the one `Schema.TaggedError`.
- Feature code maps failures through named projectors.
- Do not add feature-level `Data.TaggedError`, `Schema.TaggedError`, or error classes.
- Keep `Diagnostic` in the `E` channel.

## Use `Result` for local recovery

Use `Result` when the work is pure and the caller needs explicit success or
failure. Return `Effect` directly when the operation needs Effect semantics.

```ts
const parseCount = (value: string): Result.Result<number, Diagnostic> =>
  /^\d+$/u.test(value)
    ? Result.succeed(Number(value))
    : Result.fail(invalidCountDiagnostic());

const program = Effect.fromResult(parseCount(input));
```

## Name reusable narrowing

- Use an Effect `Predicate` when a guard has a stable name, will be reused, or composes with other predicates.
- Inline a one-use condition.
- Narrow `unknown` once at the boundary.
- Do not publish an unexplained `unknown` Effect channel.
