import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { BankApi } from "../services.ts";

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
        orElse: () => Outcome.unknown({ _tag: "TimedOut" as const }),
      }),
    ),
});
