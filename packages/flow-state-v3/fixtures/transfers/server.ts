import { Effect, Exit, Layer, Schema } from "effect";
import { Fake } from "../../src/host/testing/index.ts";
import { BankApi, Declined, NoResponse, Receipt } from "./contracts.ts";

const BankTruth = Schema.Struct({
  receipts: Schema.Record(Schema.String, Schema.String),
  limit: Schema.Number,
});

/**
 * The bank's truth: one receipt per idempotency key, and a limit above which a transfer is
 * declined.
 */
export const Bank = Fake.server("Bank", {
  truth: BankTruth,
  initial: { receipts: {}, limit: 1000 },
  endpoints: {
    transfer: Fake.call({
      request: { transferId: Schema.String, cents: Schema.Number, key: Schema.String },
      success: Receipt,
      failure: Declined,
      handle: (truth: typeof BankTruth.Type, { cents, key }) => {
        if (cents > truth.limit) return { truth, exit: Exit.fail(new Declined({ code: "limit" })) };
        const receipt = truth.receipts[key] ?? `r${Object.keys(truth.receipts).length + 1}`;

        return {
          truth: { ...truth, receipts: { ...truth.receipts, [key]: receipt } },
          exit: Exit.succeed({ receipt }),
        };
      },
    }),
  },
  controls: {
    limit: Fake.control({ cents: Schema.Number }, (truth: typeof BankTruth.Type, { cents }) => ({
      ...truth,
      limit: cents,
    })),
  },
});

/**
 * The port fake: `BankApi` over the bank's server, a lost answer read as the port's NoResponse.
 */
export const BankFake = Layer.effect(
  BankApi,
  Effect.map(Bank, (bank) =>
    BankApi.of({
      transfer: (input, { idempotencyKey }) =>
        bank
          .transfer({ ...input, key: idempotencyKey })
          .pipe(Effect.catchTag("FakeLost", () => Effect.fail(new NoResponse()))),
    }),
  ),
);
