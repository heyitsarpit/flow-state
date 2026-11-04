// D124: machines through the real front end, so `flow check`'s lint is pinned from a Schema to a finding. Where the value comes from: a form, an API's response. Flow only asks whether the door will take it.
import { Effect, Schema } from "effect";
import type { Fixture } from "../../conformance/harness.ts";
import { definition, Flow, machine, transaction, type Fields } from "./flow.ts";

const formFixture = (id: string, input: Fields, key: readonly string[]): Fixture => ({
  id,
  make: () => {
    const save = transaction({ id: `${id}/save`, input, key: key as never, concurrency: "reject", commit: () => Effect.succeed({}) });
    const d = definition({
      id,
      states: { A: {} },
      events: {},
      internalEvents: { Saved: {}, No: {}, Unsure: {} },
      memory: { n: Flow.initial(Schema.Number, 0) },
      operations: ({ E }) => ({ save: save.outcomes({ success: E.Saved, failure: { NotSent: E.No }, unknown: E.Unsure }) }),
    });
    const m = machine(d, ({ S }) => ({ default: S.A, on: { Saved: {}, No: {}, Unsure: {} } }));
    return m.compiled; // round 12, review L7: no `provide`; this commit needs no service
  },
});
const S = Schema;
const id = { orderId: S.String };
export const formFixtures: Readonly<Record<string, Fixture>> = {
  "form-amount-bigint": formFixture("Form/AmountBigint", { ...id, amount: S.BigInt }, ["orderId"]), // the common bigint: not a key
  "form-key-bigint": formFixture("Form/KeyBigint", { orderId: S.BigInt }, ["orderId"]),
  "form-struct-bigint": formFixture("Form/StructBigint", { ...id, line: S.Struct({ total: S.BigInt }) }, ["orderId"]),
  "form-array-bigint": formFixture("Form/ArrayBigint", { ...id, totals: S.Array(S.BigInt) }, ["orderId"]),
  "form-record-bigint": formFixture("Form/RecordBigint", { ...id, byLine: S.Record(S.String, S.BigInt) }, ["orderId"]),
  "form-nullable-bigint": formFixture("Form/NullableBigint", { ...id, tip: S.NullOr(S.BigInt) }, ["orderId"]),
  "form-set": formFixture("Form/Set", { ...id, tags: S.ReadonlySet(S.String) }, ["orderId"]),
  "form-map": formFixture("Form/Map", { ...id, tags: S.ReadonlyMap(S.String, S.Number) }, ["orderId"]),
  "form-date-key": formFixture("Form/DateKey", { day: S.Date }, ["day"]), // a Date carries, through its `toJSON`: pinned by the CLI's date check
  "form-template": formFixture("Form/Template", { orderId: S.TemplateLiteral(["o-", S.String]) }, ["orderId"]),
  "form-unknown": formFixture("Form/Unknown", { ...id, extra: S.Unknown, more: S.Any }, ["orderId"]), // nothing to say: a string goes
  "form-plain": formFixture("Form/Plain", { ...id, cents: S.Number, note: S.NullOr(S.String), lines: S.Array(S.Struct({ sku: S.String })) }, ["orderId"]),
};
