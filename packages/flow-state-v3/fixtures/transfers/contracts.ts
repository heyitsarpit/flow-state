import { Context, Effect, Schema } from "effect";
import { Outcome, transaction } from "../../src/index.ts";

/**
 * The bank refused a transfer.
 */
export class Declined extends Schema.TaggedError<Declined>()("Declined", { code: Schema.String }) {}

/**
 * The bank's answer did not come back.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

/**
 * The bank's answer to a transfer it made.
 */
export const Receipt = Schema.Struct({ receipt: Schema.String });

/**
 * The bank's API: where the data comes from. Its production Layer is `BankHttp`; each send
 * carries its Attempt's id as the idempotency key.
 */
export class BankApi extends Context.Service<
  BankApi,
  {
    readonly transfer: (
      input: { readonly transferId: string; readonly cents: number },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<typeof Receipt.Type, Declined | NoResponse>;
  }
>()("bank/BankApi") {}

/**
 * One transfer, keyed by its id: a lost answer, or no answer within 30 seconds, is unknown.
 */
export const transfer = transaction({
  id: "Bank/transfer",
  input: { transferId: Schema.String, cents: Schema.Number },
  key: ["transferId"],
  concurrency: "reject",
  services: [BankApi],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(BankApi), (api) =>
      api.transfer(input, { idempotencyKey: attempt.id }),
    ).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
      Effect.timeoutOrElse({
        duration: "30 seconds",
        orElse: () => Outcome.unknown({ _tag: "TimedOut" as const }),
      }),
    ),
});
