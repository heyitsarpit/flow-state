import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Accounts } from "../../fixtures/transfers/server/accounts.ts";
import type { Cut } from "../../src/host/testing/index.ts";

// The bank's balance card and cheque deposit. Expected results: an answer asked before a write
// that invalidates its entry lands nothing, and the trailing read shows the written state
// (Operations R4, I7, entry table: Invalidate on a Running placed entry); a placement's
// `placeholder({ previous })` shows the last key's data, marked, while a new key has none (Plan
// Operations O6); a commit's `progress(p)` shows on its row with no turn (Plan Operations O6); a
// money write declares the input field the server keys it by (Plan Operations O1). These use
// members not yet built, so their fixtures load inside each test.

const load = async () => ({
  ...(await import("../../fixtures/transfers/pending/stories.ts")),
  ...(await import("../../fixtures/transfers/pending/balance.ts")),
  ...(await import("../../fixtures/transfers/pending/deposit.ts")),
});

describe("the balance card and cheque deposits (Operations R4; Plan Operations O1, O6)", () => {
  it.fails("Operations R4, I7, T4.4: a refresh asked before a card payment loses, and the read after shows the payment", async () => {
    const { readAfterWrite, card } = await load();
    const run = await readAfterWrite.run();

    expect(run.checkpoints.shown.read(card)?.memory.cents).toBe(10_000);
    expect(run.checkpoints.settled.read(Accounts.balance)).toHaveLength(3);
    expect(run.checkpoints.settled.read(card)?.memory.cents).toBe(7500);
  });

  it.fails("Plan Operations O6: an account switch shows the last account's balance as a placeholder until its own lands", async () => {
    const { switchAccount, card } = await load();
    const run = await switchAccount.run();

    const shown = (cut: Cut) => {
      const memory = cut.read(card)?.memory;

      return [memory?.cents, memory?.placeholder];
    };

    expect([run.checkpoints.switching, run.checkpoints.switched].map(shown)).toEqual([
      [10_000, true],
      [0, false],
    ]);
  });

  it.fails("Plan Operations O6: a deposit's row shows its progress after each part", async () => {
    const { depositInParts, rentCheque } = await load();
    const run = await depositInParts.run();

    const progress = (cut: Cut) => {
      const row = cut
        .read(rentCheque)
        ?.operations.get("depositCheque")
        ?.get('{"depositId":"dep-1"}');

      return Predicate.hasProperty(row, "progress") ? row.progress : undefined;
    };

    expect(progress(run.checkpoints["one part"])).toBe(1 / 3);
    expect(run.checkpoints.deposited.read(rentCheque)?.state).toBe("DONE");
  });

  it.fails("Plan Operations O1: a money write declares the input field the server keys it by", async () => {
    const { cardPayment, depositCheque } = await load();

    expect(
      [cardPayment, depositCheque].map(
        (c) => Predicate.hasProperty(c, "idempotency") && c.idempotency,
      ),
    ).toEqual([["paymentId"], ["depositId"]]);
  });
});
