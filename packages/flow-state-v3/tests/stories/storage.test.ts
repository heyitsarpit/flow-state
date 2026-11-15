import { describe, expect, it } from "vite-plus/test";
import { account } from "../../fixtures/transfers/machine.ts";
import { Bank } from "../../fixtures/transfers/server.ts";
import { bankStory } from "../../fixtures/transfers/stories.ts";
import { Fake, type StoryRun } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

const endings = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

const minted = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Minted" ? [e.attempt] : []));

describe("Fake storage words", () => {
  it("hold keeps the acknowledging write out, and no call is made until release lands it (Stories R11, I13; WriteAhead R13)", async () => {
    const run = checked(
      await bankStory("storage/hold")
        .ensure(account)
        .world(Fake.storage.hold())
        .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
        .checkpoint("acknowledging")
        .world(Fake.storage.release())
        .checkpoint("sent")
        .run(),
    );

    const { acknowledging, sent } = run.checkpoints;
    const held = acknowledging.records.batches.filter((b) => b.status === "held");

    expect(acknowledging.read(Bank.transfer)).toEqual([]);
    expect(held.map((b) => [b.purpose, b.acknowledges])).toEqual([["acknowledge", minted(run)]]);
    expect(sent.read(Bank.transfer).map((c) => c.status)).toEqual(["answered"]);
    expect(sent.records.batches.filter((b) => b.status === "held")).toEqual([]);
    expect(endings(run)).toEqual(["success success"]);
  });

  it("refuse fails the acknowledging write, so the transfer ends NotSent unsent (Stories R11, I13; WriteAhead R13)", async () => {
    const run = checked(
      await bankStory("storage/refuse")
        .ensure(account)
        .world(Fake.storage.refuse())
        .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
        .checkpoint("refused")
        .run(),
    );

    const { refused } = run.checkpoints;

    expect(refused.read(Bank.transfer)).toEqual([]);
    expect(
      refused.records.batches.filter((b) => b.status === "refused").map((b) => b.purpose),
    ).toEqual(["acknowledge"]);
    expect(endings(run)).toEqual(["notSent StorageRefused"]);
    expect(refused.read(account)?.memory).toEqual({ notice: "not sent StorageRefused" });
  });

  it("a held write still out when disposeRuntime starts lands on release, since its page is alive (Stories R11, R13)", async () => {
    const run = checked(
      await bankStory("storage/held-across-dispose")
        .ensure(account)
        .world(Fake.storage.hold())
        .send(account, { _tag: "Send", transferId: "t1", cents: 500 })
        .disposeRuntime()
        .world(Fake.storage.release())
        .checkpoint("released")
        .run(),
    );

    const { released } = run.checkpoints;

    expect(
      released.records.batches.filter((b) => b.purpose === "acknowledge").map((b) => b.status),
    ).toEqual(["landed"]);
    expect(released.read(Bank.transfer)).toEqual([]);
  });
});
