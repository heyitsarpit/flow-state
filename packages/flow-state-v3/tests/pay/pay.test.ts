import { describe, expect, it } from "vite-plus/test";
import { PayMachine } from "../../fixtures/pay/machine.ts";
import { Shop } from "../../fixtures/pay/server.ts";
import { checkout, lostConfirm } from "../../fixtures/pay/stories.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";

const payment = (cut: Cut) => {
  const snapshot = cut.read(checkout);

  return snapshot === undefined
    ? undefined
    : PayMachine.definition.O.pay.get(snapshot.operations, { intentId: "pi1" });
};

const payEndings = (run: StoryRun) =>
  run.evidence.flatMap((e) =>
    e._tag === "Ended" && e.operation === "pay" ? [`${e.channel} ${e.reason}`] : [],
  );

describe("Pay across a reload", () => {
  it("a confirm held at response past its deadline reads unknown after a reload, and the shop handled one confirm (Restore R3, Restore I6; WriteLanes R2)", async () => {
    const run = await lostConfirm.run();
    const { late, reloaded, after } = run.checkpoints;

    expect(payment(run.checkpoints["before deadline"])).toEqual(
      expect.objectContaining({
        value: { pending: true, uncertain: false, waiting: false, retryCount: 0 },
      }),
    );
    expect(late.read(checkout)?.state).toBe("UNSURE");
    expect(reloaded.now).toBe(61_000);
    expect(reloaded.read(checkout)?.state).toBe("UNSURE");
    expect(payment(reloaded)).toEqual(
      expect.objectContaining({
        value: { pending: false, uncertain: true, waiting: false, retryCount: 0 },
      }),
    );
    expect(reloaded.inspection.lanes.map((l) => [l.operation, l.state])).toEqual([["pay", "Held"]]);
    expect(payEndings(run)).toEqual(["unknown TimedOut", "unknown Restored"]);
    expect(reloaded.read(Shop.confirm).map((c) => c.status)).toEqual(["held at response"]);
    expect(after.read(Shop.confirm).map((c) => c.status)).toEqual(["held at response"]);
    expect(after.read(Shop).intents).toEqual({ pi1: "requires_capture" });
    expect(after.read(Shop.intent).map((c) => c.status)).toEqual(["answered"]);
    expect(after.read(Shop).orders).toEqual({ c1: "o1" });
  });
});
