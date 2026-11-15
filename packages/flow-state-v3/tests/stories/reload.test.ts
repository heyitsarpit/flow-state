import { describe, expect, it } from "vite-plus/test";
import { account } from "../../fixtures/transfers/machine.ts";
import { Bank } from "../../fixtures/transfers/server.ts";
import { bankStory } from "../../fixtures/transfers/stories.ts";
import { type Cut, Fake, type StoryRun } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

const endings = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

// What a dead page could change if it ran again: the Runtime's cut and the store's records.
const runtimeSide = (cut: Cut) => ({ inspection: cut.inspection, stored: cut.records.stored });

describe("A dead page", () => {
  it("writes nothing after a reload: its held write, released, is aborted and completes nothing (Stories R13, I13, I14)", async () => {
    const story = bankStory("reload/held-write")
      .ensure(account)
      .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
      .world(Fake.storage.hold())
      .send(account, { _tag: "Send", transferId: "t2", cents: 500 })
      .reload()
      .checkpoint("reloaded");

    const before = checked(await story.run());
    const run = checked(await story.world(Fake.storage.release()).checkpoint("released").run());
    const { reloaded, released } = run.checkpoints;

    expect(released.records.batches.filter((b) => b.page === 0).map((b) => b.status)).toContain(
      "aborted",
    );
    expect(runtimeSide(released)).toEqual(runtimeSide(reloaded));
    expect(released.read(Bank.transfer)).toEqual(reloaded.read(Bank.transfer));
    expect(run.evidence).toEqual(before.evidence);
    expect(endings(run)).toEqual(["success success"]);
  });

  it("is answered nothing: its call held at request, released, is handled once and delivers nothing (Stories R13, I8, I10, I14; Restore R3)", async () => {
    const story = bankStory("reload/held-call")
      .ensure(account)
      .world(Bank.transfer.hold())
      .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
      .reload()
      .checkpoint("reloaded");

    const before = checked(await story.run());
    const run = checked(await story.world(Bank.transfer.release()).checkpoint("released").run());
    const { reloaded, released } = run.checkpoints;

    expect(reloaded.read(Bank.transfer).map((c) => c.status)).toEqual(["held at request"]);
    expect(released.read(Bank.transfer).map((c) => [c.status, c.page])).toEqual([["handled", 0]]);
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
        .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
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

  it("release takes the oldest held call, a dead page's before a live one, and the live Attempt still ends unknown at its deadline (Stories R9, R13)", async () => {
    const run = checked(
      await bankStory("reload/oldest-held")
        .ensure(account)
        .world(Bank.transfer.hold())
        .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
        .reload()
        .world(Bank.transfer.hold())
        .send(account, { _tag: "Resend", transferId: "t1" })
        .world(Bank.transfer.release())
        .checkpoint("released")
        .advance("31 seconds")
        .checkpoint("late")
        .run(),
    );

    const { released, late } = run.checkpoints;

    expect(released.read(Bank.transfer).map((c) => [c.page, c.status])).toEqual([
      [0, "handled"],
      [1, "held at request"],
    ]);
    expect(endings(run)).toEqual(["unknown Restored", "unknown TimedOut"]);
    expect(late.inspection.lanes.map((l) => l.state)).toEqual(["Held"]);
  });
});
