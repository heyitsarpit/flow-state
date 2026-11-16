import { Context, type Effect } from "effect";

/**
 * The accounts service did not answer.
 */
export type NoAnswer = { readonly _tag: "NoAnswer" };

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
