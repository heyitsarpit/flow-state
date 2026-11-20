import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { NoAnswer } from "../services.ts";

const AccountsTruth = Schema.Struct({ balances: Schema.Record(Schema.String, Schema.Number) });

type Truth = typeof AccountsTruth.Type;

/**
 * The accounts service's truth: each account's balance; `acct-1` starts with 10,000 cents and any
 * other account with none. A control sets a balance.
 */
export const Accounts = Fake.server("Accounts", {
  truth: AccountsTruth,
  initial: { balances: { "acct-1": 10_000 } },
  endpoints: {
    balance: Fake.call({
      request: { account: Schema.String },
      success: Schema.Struct({ cents: Schema.Number }),
      failure: Schema.Never,
      handle: (truth: Truth, { account }) => ({
        truth,
        exit: Exit.succeed({ cents: truth.balances[account] ?? 0 }),
      }),
    }),
  },
  controls: {
    setBalance: Fake.control(
      { account: Schema.String, cents: Schema.Number },
      (truth: Truth, { account, cents }) => ({
        balances: { ...truth.balances, [account]: cents },
      }),
    ),
  },
  lost: () => new NoAnswer(),
});
