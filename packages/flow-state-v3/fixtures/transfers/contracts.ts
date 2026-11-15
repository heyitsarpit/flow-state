import { Context, Effect, Schema } from "effect";
import { Outcome, transaction } from "../../src/index.ts";

/**
 * The bank refused a transfer.
 */
export type Declined = { readonly _tag: "Declined"; readonly code: string };

/**
 * The bank's answer did not come back.
 */
export type Lost = { readonly _tag: "NoResponse" };

/**
 * The bank's API: where the data comes from. A real app gives it a Layer over fetch; each send
 * carries its Attempt's id as the idempotency key.
 */
export class BankApi extends Context.Service<
  BankApi,
  {
    readonly transfer: (
      input: { readonly transferId: string; readonly cents: number },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<{ readonly receipt: string }, Declined | Lost>;
    readonly balance: (input: {
      readonly account: string;
    }) => Effect.Effect<{ readonly cents: number }, Lost>;
  }
>()("flow-state-v3/fixtures/transfers/BankApi") {}

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
