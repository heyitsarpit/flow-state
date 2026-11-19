import { Context, type Effect, Schema } from "effect";

/**
 * The accounts service did not answer.
 */
export class NoAnswer extends Schema.TaggedError<NoAnswer>()("NoAnswer", {}) {}

/**
 * The accounts service: where an account's balance comes from.
 */
export class AccountsApi extends Context.Service<
  AccountsApi,
  {
    readonly balance: (input: {
      readonly account: string;
    }) => Effect.Effect<{ readonly cents: number }, NoAnswer>;
  }
>()("flow-state-v3/fixtures/transfers/AccountsApi") {}

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
