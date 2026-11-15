import { Exit } from "effect";
import { Fake } from "../../src/host/testing/index.ts";
import { BankApi } from "./contracts.ts";

/**
 * The bank's truth: one receipt per idempotency key, over 1000 cents declined, and each account's
 * balance.
 */
export const bankServer = Fake.server(BankApi, () => {
  const receipts = new Map<string, string>();

  return {
    transfer: (input, { idempotencyKey }) => {
      if (input.cents > 1000) return Exit.fail({ _tag: "Declined" as const, code: "limit" });
      const receipt = receipts.get(idempotencyKey) ?? `r${receipts.size + 1}`;
      receipts.set(idempotencyKey, receipt);

      return Exit.succeed({ receipt });
    },
    balance: () => Exit.succeed({ cents: 10_000 - 100 * receipts.size }),
  };
});
