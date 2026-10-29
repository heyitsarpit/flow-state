# Prior art for recorded expressions (2026-10-30)

Question from the owner: do the operators, IR and source reader of the proposal already exist in Effect or another
library, so Flow could use, wrap or copy them? Research by a Sonnet agent; the Effect citations were spot-checked by
the main session against `node_modules/effect/src` (4.0.5). External rows marked *recalled* were not fetched.

## Effect 4.0.5: no expression IR

- `Predicate`, `Order`, `Equivalence`, `Filter` and `Match` are functions or closures, not data
  (`Predicate.ts:48`, `Order.ts:55`, `Match.ts:255-293`). Tools cannot read them.
- Schema is the only data-shaped part: built-in checks carry `representation: { id, payload }`
  (`Schema.ts:7704-7712`), but a filter in general is "an opaque leaf check" (`SchemaRepresentation.ts:527`), and
  `SchemaRepresentation` describes types, not value expressions such as `eq(record.x, input.y)`.
- `unstable/sql` `Statement` is a server-side SQL fragment builder with no client evaluator (`sql/Statement.ts:156-165`).
- **Reusable directly:** `Order.Date` (`Order.ts:650`), `Order.Number` and `Order.mapInput` for client-side sort
  comparison (check finiteness first: `Order.Number` ranks NaN below all numbers, `Order.ts:183-187`); Schema `Date`
  decoding to decide which fields order by time (rule A4); Schema decode before evaluation. `Equal`/`Hash` is richer
  than the proposal's scalar `eq` and is not used for it.

## Other libraries

| Candidate | Fit |
| --- | --- |
| TanStack DB `query/ir.ts` | **Follow its IR shape:** `PropRef { path }`, `Value { value }`, `Func { name, args }`. Don't depend on it: its evaluator is SQL three-valued and its operator set is wider. MIT. |
| Zero ZQL | Same query on client (memory) and server (Postgres) with a small operator set and explicit `IS`; comparisons with `null` are false, including `null = null`. **Follow the restricted operator set.** Its docs admit case-folding differs by collation, the reason `serverMatches` exists. |
| CEL (Common Expression Language) | Designed for exact, portable evaluation, with a conformance suite: no implicit conversion, overflow is an error, errors propagate as values. **Copy its discipline, not its code** (JS implementations young, *recalled*). |
| LINQ expression trees | The compiler restricts what a lambda may contain and captures it as a tree: the model for the TypeScript source reader. Not available in TypeScript. |
| JSON Logic | Rejected: `==` coerces types. |
| Drizzle, Kysely, Prisma, Electric, Replicache, InstantDB, Convex, MongoDB | Server-only, SQL-string, or no IR; nothing to reuse (*recalled*). |

No library has `when`, `coalesce`, `serverMatches` or `opaque` with exact client/server semantics, so the operator set
stays custom.

## What changes in the proposal (recommended)

1. Name the IR after TanStack's three variants (`ref`, `val`, `func { name, args }`), so it reads familiar.
2. Use Effect's `Order.Date`, `Order.Number` (after a finiteness check) and `Order.mapInput` for client-side
   ordering, and Schema `Date` decoding for rule A4, instead of hand-written comparators.
3. Add a **conformance table** (operator, inputs, result), CEL-style, as the client evaluator's own test; include
   `not`/`or`/`null` rows that show where Zero and TanStack differ. (Revised after review 1: M5-D3 makes it the
   evaluator's test, not a client/server agreement suite, so no server adapter is bound by it.)
4. Keep two-valued nulls with `null = null` true and `isNull`; the only difference from Zero is that equality.
5. Open questions: prior art agrees with every recommendation (no new value operators yet; dates by `getTime()` via
   `Order.Date`; no helpers in version 1; `.as` stays a function, since Effect's `Match` is closures; unevaluable
   predictions skipped, as CEL propagates errors; null sort pairs skipped, as Zero treats null as unordered; the
   agreement check only in `flow check`).
