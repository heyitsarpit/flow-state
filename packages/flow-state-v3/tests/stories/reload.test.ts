import { describe, expect, it } from "vite-plus/test";
import { account } from "../../fixtures/transfers/app.ts";
import { Transfers } from "../../fixtures/transfers/machines/transfers.ts";
import { Bank } from "../../fixtures/transfers/server/bank.ts";
import { bankStory } from "../../fixtures/transfers/stories/usual.ts";
import { type Cut, Fake, type StoryRun } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

const endings = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

// What a dead tab could change if it ran again: the Runtime's cut and the store's records.
const runtimeSide = (cut: Cut) => ({ inspection: cut.inspection, stored: cut.records.stored });

describe("A tab's opens", () => {
  it("each mint ids from the tab's name and open count, so ids never repeat across a reload (Stories R14)", async () => {
    const run = checked(
      await bankStory("reload/seeded")
        .ensure(account)
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .reload()
        .send(account, Transfers.E.Send({ transferId: "t2", cents: 500 }))
        .run(),
    );

    const minted = run.evidence.flatMap((e) => (e._tag === "Minted" ? [e.attempt] : []));

    expect(minted).toHaveLength(2);
    expect(minted[0]).toContain(Buffer.from("main:1").toString("hex"));
    expect(minted[1]).toContain(Buffer.from("main:2").toString("hex"));
  });
});

describe("A dead tab", () => {
  it("writes nothing after a reload: its held write is aborted at the reload, and a release finds nothing held (Stories R13, I13, I14)", async () => {
    const story = bankStory("reload/held-write")
      .ensure(account)
      .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
      .world(Fake.storage.hold())
      .send(account, Transfers.E.Send({ transferId: "t2", cents: 500 }))
      .reload()
      .checkpoint("reloaded");

    const run = checked(await story.run());
    const { reloaded } = run.checkpoints;

    expect(reloaded.records.batches.filter((b) => b.tab.open === 1).map((b) => b.status)).toContain(
      "aborted",
    );
    expect(reloaded.records.batches.filter((b) => b.status === "held")).toEqual([]);
    expect(endings(run)).toEqual(["success success"]);
    await expect(story.world(Fake.storage.release()).run()).rejects.toThrow(
      "nothing held at the store",
    );
  });

  it("leaves a release to the live tab: a write held after the reload lands on release while the dead tab's stays aborted (Stories R11, R13)", async () => {
    const run = checked(
      await bankStory("reload/release-reaches-the-live-tab")
        .ensure(account)
        .world(Fake.storage.hold())
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .reload()
        .world(Fake.storage.hold())
        .send(account, Transfers.E.Send({ transferId: "t2", cents: 500 }))
        .world(Fake.storage.release())
        .checkpoint("released")
        .run(),
    );

    const { released } = run.checkpoints;

    expect(
      released.records.batches
        .filter((b) => b.purpose === "acknowledge")
        .map((b) => [b.tab.open, b.status]),
    ).toEqual([
      [1, "aborted"],
      [2, "landed"],
    ]);
    expect(released.read(Bank.transfer).map((c) => c.input.transferId)).toEqual(["t2"]);
    expect(runtimeSide(released).stored.size).toBeGreaterThan(0);
  });

  it("is answered nothing: its call held at request, released, is handled once and delivers nothing (Stories R13, I8, I10, I14; Restore R3)", async () => {
    const story = bankStory("reload/held-call")
      .ensure(account)
      .world(Bank.transfer.hold())
      .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
      .reload()
      .checkpoint("reloaded");

    const before = checked(await story.run());
    const run = checked(await story.world(Bank.transfer.release()).checkpoint("released").run());
    const { reloaded, released } = run.checkpoints;

    expect(reloaded.read(Bank.transfer).map((c) => c.status)).toEqual(["held at request"]);
    expect(released.read(Bank.transfer).map((c) => [c.status, c.tab])).toEqual([
      ["handled", { name: "main", open: 1 }],
    ]);
    expect(Object.keys(released.read(Bank).receipts)).toHaveLength(1);
    expect(runtimeSide(released)).toEqual(runtimeSide(reloaded));
    expect(run.evidence).toEqual(before.evidence);
    expect(endings(run)).toEqual(["unknown Restored"]);
    expect(released.read(account)?.memory).toEqual({ notice: "check your statement" });
  });

  it("never moves its clock again, so its deadline never fires after the reload (Stories R13, I6)", async () => {
    const run = checked(
      await bankStory("reload/clock")
        .ensure(account)
        .world(Bank.transfer.hold())
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .advance("10 seconds")
        .reload()
        .checkpoint("reloaded")
        .advance("31 seconds")
        .checkpoint("later")
        .world(Bank.transfer.release())
        .run(),
    );

    expect(run.checkpoints.reloaded.now).toBe(10_000);
    expect(run.checkpoints.later.now).toBe(41_000);
    expect(endings(run)).toEqual(["unknown Restored"]);
    expect(run.checkpoints.later.read(Bank.transfer).map((c) => c.status)).toEqual([
      "held at request",
    ]);
  });

  it("release takes the oldest held call, a dead tab's before a live one, and the live Attempt still ends unknown at its deadline (Stories R9, R13)", async () => {
    const run = checked(
      await bankStory("reload/oldest-held")
        .ensure(account)
        .world(Bank.transfer.hold())
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .reload()
        .world(Bank.transfer.hold())
        .send(account, Transfers.E.Resend({ transferId: "t1" }))
        .world(Bank.transfer.release())
        .checkpoint("released")
        .advance("31 seconds")
        .checkpoint("late")
        .run(),
    );

    const { released, late } = run.checkpoints;

    expect(released.read(Bank.transfer).map((c) => [c.tab.open, c.status])).toEqual([
      [1, "handled"],
      [2, "held at request"],
    ]);
    expect(endings(run)).toEqual(["unknown Restored", "unknown TimedOut"]);
    expect(late.inspection.lanes.map((l) => l.state)).toEqual(["Held"]);
  });
});
