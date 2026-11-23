import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { AvailableApi, BankApi, TimedOut } from "../services.ts";

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
    BankApi.use((api) => api.transfer(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
      Effect.timeoutOrElse({
        duration: "30 seconds",
        orElse: () => Outcome.unknown(new TimedOut()),
      }),
    ),
});

/**
 * A card payment from an account, keyed by its payment id. A lost answer is unknown.
 */
export const cardPayment = transaction({
  id: "Bank/cardPayment",
  input: { paymentId: Schema.String, account: Schema.String, cents: Schema.Number },
  key: ["paymentId"],
  concurrency: "reject",
  services: [AvailableApi],
  // The server keys a card payment by the payment's own id, not by the Attempt.
  idempotency: ["paymentId"],
  commit: (input) =>
    AvailableApi.use((api) => api.debit(input, { idempotencyKey: input.paymentId })).pipe(
      Effect.catchTag("NoAnswer", (e) => Outcome.unknown(e)),
    ),
});
