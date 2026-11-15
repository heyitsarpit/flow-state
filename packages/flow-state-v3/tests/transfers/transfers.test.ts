import { describe, expect, it } from "vite-plus/test";
import { account, TransfersMachine } from "../../fixtures/transfers/machine.ts";
import { Bank } from "../../fixtures/transfers/server.ts";
import { declined, long, lostThenReload } from "../../fixtures/transfers/stories.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";

const endings = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

const row = (cut: Cut, transferId: string) => {
  const snapshot = cut.read(account);

  return snapshot === undefined
    ? undefined
    : TransfersMachine.definition.O.transfer.get(snapshot.operations, { transferId });
};

describe("transfers", () => {
  it("delivers the bank's decline as a failure (WriteLanes R4)", async () => {
    const run = await declined.run();

    expect(endings(run)).toEqual(["failure Declined"]);
    expect(run.checkpoints.declined.read(account)?.memory).toEqual({ notice: "declined limit" });
  });

  it("a lost answer reads unknown after a reload and reached the bank once (Restore R3, Restore I6)", async () => {
    const run = await lostThenReload.run();
    const { sending, reloaded } = run.checkpoints;

    expect(row(sending, "t1")).toEqual(
      expect.objectContaining({
        _tag: "Some",
        value: { pending: true, uncertain: false, waiting: false, retryCount: 0 },
      }),
    );
    expect(reloaded.now).toBe(5000);
    expect(reloaded.read(Bank.transfer).map((c) => c.status)).toEqual(["held at response"]);
    expect(Object.keys(reloaded.read(Bank).receipts)).toHaveLength(1);
    expect(reloaded.inspection.lanes).toEqual([
      expect.objectContaining({ contract: "Bank/transfer", state: "Held" }),
    ]);
    expect(row(reloaded, "t1")).toEqual(
      expect.objectContaining({
        _tag: "Some",
        value: { pending: false, uncertain: true, waiting: false, retryCount: 0 },
      }),
    );
    expect(endings(run)).toEqual(["unknown Restored"]);
    expect(reloaded.read(account)?.memory).toEqual({ notice: "check your statement" });
  });

  it("runs the long Story, every send of one transfer carrying one idempotency key (WriteLanes R5, WriteLanes I6)", async () => {
    const run = await long.run();

    const reached = run.end
      .read(Bank.transfer)
      .filter((c) => c.status !== "dropped at request" && c.status !== "held at request");

    const keys = new Map<string, ReadonlySet<string>>();

    for (const { input } of reached)
      keys.set(input.transferId, new Set([...(keys.get(input.transferId) ?? []), input.key]));

    expect(long.steps.length).toBeGreaterThanOrEqual(90);
    expect(long.steps.length <= 110).toBe(true);
    expect(keys.size).toBe(36);
    expect([...keys.values()].every((k) => k.size === 1)).toBe(true);
    expect(reached.filter((c) => c.input.transferId === "d0")).toHaveLength(2);
  });
});
