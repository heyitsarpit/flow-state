import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Accounts } from "../../fixtures/transfers/server/accounts.ts";
import {
  type ChequeDeposit,
  depositCheque,
  rentCheque,
} from "../../fixtures/transfers/machines/deposit.ts";
import * as deposits from "../../fixtures/transfers/stories/deposits.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import type { ActorRef } from "../../src/index.ts";

// The bank's balance card and cheque deposit. Expected results: an answer asked before a write
// that invalidates its entry lands nothing, and the trailing read shows the written state
// (Operations R4, I7, entry table: Invalidate on a Running placed entry); a placement's
// `placeholder({ previous })` shows the last key's data, marked, while a new key has none (Plan
// Operations O6); a commit's `progress(p)` shows on its row with no turn (Plan Operations O6); a
// money write declares the input field the server keys it by (Plan Operations O1).

const load = async () => ({
  ...(await import("../../fixtures/transfers/pending/stories.ts")),
  ...(await import("../../fixtures/transfers/pending/balance.ts")),
  depositCheque,
});

const loadDeposit = async () => Promise.resolve({ ...deposits, rentCheque });

// A deposit's row's progress at a cut, none with no row or no progress.
const progressOf = (cut: Cut, ref: ActorRef<typeof ChequeDeposit>) => {
  const row = cut.read(ref)?.operations.get("depositCheque")?.get('{"depositId":"dep-1"}');

  return Predicate.hasProperty(row, "progress") ? row.progress : undefined;
};

describe("the balance card and cheque deposits (Operations R4; Plan Operations O1, O6)", () => {
  it("Operations R4, I7, T4.4: a refresh asked before a card payment loses, and the read after shows the payment", async () => {
    const { readAfterWrite, card } = await load();
    const run = await readAfterWrite.run();

    expect(run.checkpoints.shown.read(card)?.memory.cents).toBe(10_000);
    expect(run.checkpoints.settled.read(Accounts.balance)).toHaveLength(3);
    expect(run.checkpoints.settled.read(card)?.memory.cents).toBe(7500);
  });

  it("Operations R11, I23: a placement whose select names no valid key places nothing and shows its issue, gone once a key is named", async () => {
    const { noAccountYet, card } = await load();
    const run = await noAccountYet.run();

    const shown = (cut: Cut) => ({
      issues: (cut.read(card)?.issues ?? []).map((i) => i.code),
      calls: cut.read(Accounts.balance).length,
      cents: cut.read(card)?.memory.cents,
    });

    expect([run.checkpoints.unchosen, run.checkpoints.chosen].map(shown)).toEqual([
      { issues: ["Defect"], calls: 0, cents: 0 },
      { issues: [], calls: 1, cents: 10_000 },
    ]);
  });

  it("Plan Operations O6: an account switch shows the last account's balance as a placeholder until its own lands", async () => {
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

  it("Plan Operations O6: a deposit's row shows its progress after each part", async () => {
    const { depositInParts, rentCheque } = await loadDeposit();
    const run = await depositInParts.run();

    expect(progressOf(run.checkpoints["one part"], rentCheque)).toBe(1 / 3);
    expect(run.checkpoints.deposited.read(rentCheque)?.state).toBe("DONE");
  });

  it("Plan Operations O3, O6, S6: a deposit whose screen closes goes on, and the screen opened again shows its progress", async () => {
    const { depositClosedMidway, rentCheque } = await loadDeposit();
    const run = await depositClosedMidway.run();

    expect(progressOf(run.checkpoints.reopened, rentCheque)).toBe(1 / 3);
    expect(run.checkpoints.deposited.read(rentCheque)?.state).toBe("DONE");
  });

  it("Plan Operations O6, E8: a reload mid-deposit leaves it unsure with no progress, and resuming deposits it", async () => {
    const { depositReloaded, rentCheque } = await loadDeposit();
    const run = await depositReloaded.run();
    const reloaded = run.checkpoints.reloaded.read(rentCheque);

    expect([reloaded?.state, reloaded?.memory.notice]).toEqual(["READY", "not sure it arrived"]);
    expect(progressOf(run.checkpoints.reloaded, rentCheque)).toBeUndefined();
    expect(run.checkpoints.resumed.read(rentCheque)?.state).toBe("DONE");
  });

  it("Plan Operations O6: a lost part leaves the deposit unsure, its row at the parts it sent", async () => {
    const { depositPartLost, rentCheque } = await loadDeposit();
    const run = await depositPartLost.run();
    const lost = run.checkpoints.lost.read(rentCheque);

    expect([lost?.state, lost?.memory.notice]).toEqual(["READY", "not sure it arrived"]);
    expect(progressOf(run.checkpoints.lost, rentCheque)).toBe(1 / 3);
  });

  it("Plan Operations O3, O6: an aborted deposit is unsure, and resuming sends the same deposit again until it lands", async () => {
    const { depositAbortResume, rentCheque } = await loadDeposit();
    const run = await depositAbortResume.run();

    expect(run.checkpoints.aborted.read(rentCheque)?.memory.notice).toBe("not sure it arrived");
    expect(progressOf(run.checkpoints.aborted, rentCheque)).toBe(1 / 3);
    expect(run.checkpoints.resumed.read(rentCheque)?.state).toBe("DONE");
  });

  it("Plan Operations O1: a money write declares the input field the server keys it by", async () => {
    const { cardPayment, depositCheque } = await load();

    expect(
      [cardPayment, depositCheque].map(
        (c) => Predicate.hasProperty(c, "idempotency") && c.idempotency,
      ),
    ).toEqual([["paymentId"], ["depositId"]]);
  });
});
