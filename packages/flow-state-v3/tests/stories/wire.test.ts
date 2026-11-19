import { describe, expect, it } from "vite-plus/test";
import { account } from "../../fixtures/transfers/app.ts";
import { Transfers } from "../../fixtures/transfers/machines/transfers.ts";
import { Bank } from "../../fixtures/transfers/server/bank.ts";
import { bankStory } from "../../fixtures/transfers/stories/usual.ts";
import { Fake, type Cut, type StoryRun, type WorldWord } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

const endings = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

const statuses = (cut: Cut) => cut.read(Bank.transfer).map((c) => c.status);

const receipts = (cut: Cut) => Object.keys(cut.read(Bank).receipts).length;

const notice = (cut: Cut) => cut.read(account)?.memory["notice"];

// One transfer under a wire word, then whatever follows, then a second transfer no word touches.
const wired = async (word: WorldWord, ...after: ReadonlyArray<WorldWord | "30 seconds">) => {
  const sent = bankStory("wire/word")
    .ensure(account)
    .world(word)
    .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
    .checkpoint("first");

  const followed = after.reduce(
    (story, next) => (next === "30 seconds" ? story.advance(next) : story.world(next)),
    sent,
  );

  return checked(
    await followed
      .checkpoint("between")
      .send(account, Transfers.E.Send({ transferId: "t2", cents: 500 }))
      .checkpoint("next")
      .run(),
  );
};

describe("Fake wire words", () => {
  it("hold at request keeps the handler from running; release runs it once and answers; no word answers with a given Exit (Stories R9, R10, I8)", async () => {
    const run = await wired(Bank.transfer.hold(), Bank.transfer.release());
    const { first, between, next } = run.checkpoints;

    expect(statuses(first)).toEqual(["held at request"]);
    expect(receipts(first)).toBe(0);
    expect(first.inspection.lanes.map((l) => l.state)).toEqual(["InFlight"]);
    expect(statuses(between)).toEqual(["answered"]);
    expect(receipts(between)).toBe(1);
    expect(statuses(next)).toEqual(["answered", "answered"]);
    expect(endings(run)).toEqual(["success success", "success success"]);
    expect(notice(next)).toBe("sent r2");
    // @ts-expect-error there is no answer word: an answer is always the handler's
    expect(Bank.transfer.answer).toBeUndefined();
    // @ts-expect-error an endpoint the server does not declare
    expect(Bank.balance).toBeUndefined();
  });

  it("hold at response runs the handler at once; release delivers its answer (Stories R9, R10, I8)", async () => {
    const run = await wired(Bank.transfer.hold({ at: "response" }), Bank.transfer.release());
    const { first, between } = run.checkpoints;

    expect(statuses(first)).toEqual(["held at response"]);
    expect(receipts(first)).toBe(1);
    expect(notice(first)).toBe("");
    expect(statuses(between)).toEqual(["answered"]);
    expect(receipts(between)).toBe(1);
    expect(endings(run)).toEqual(["success success", "success success"]);
  });

  it("drop at request never reaches the server; the port's NoResponse ends it unknown at once (Stories R9, I9; WriteLanes R2)", async () => {
    const run = await wired(Bank.transfer.drop());
    const { first, next } = run.checkpoints;

    expect(statuses(first)).toEqual(["dropped at request"]);
    expect(receipts(first)).toBe(0);
    expect(notice(first)).toBe("check your statement");
    expect(statuses(next)).toEqual(["dropped at request", "answered"]);
    expect(endings(run)).toEqual(["unknown NoResponse", "success success"]);
    expect(notice(next)).toBe("sent r1");
  });

  it("offline loses every call at request, reaching no server; a wire word given meanwhile waits for the network (Stories R17, I9, I22)", async () => {
    const run = checked(
      await bankStory("wire/offline")
        .ensure(account)
        .world(Fake.network.offline(), Bank.transfer.hold())
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .send(account, Transfers.E.Send({ transferId: "t2", cents: 500 }))
        .checkpoint("offline")
        .world(Fake.network.online())
        .send(account, Transfers.E.Send({ transferId: "t3", cents: 500 }))
        .checkpoint("online")
        .world(Bank.transfer.release())
        .checkpoint("released")
        .run(),
    );

    const { offline, online, released } = run.checkpoints;

    expect(statuses(offline)).toEqual(["dropped at request", "dropped at request"]);
    expect(receipts(offline)).toBe(0);
    expect(statuses(online)).toEqual([
      "dropped at request",
      "dropped at request",
      "held at request",
    ]);
    expect(receipts(online)).toBe(0);
    expect(statuses(released)).toEqual(["dropped at request", "dropped at request", "answered"]);
    expect(endings(run)).toEqual(["unknown NoResponse", "unknown NoResponse", "success success"]);
  });

  it("drop at response changes truth once and loses the answer: unknown NoResponse (Stories R9, I8)", async () => {
    const run = await wired(Bank.transfer.drop({ at: "response" }));
    const { first, next } = run.checkpoints;

    expect(statuses(first)).toEqual(["dropped at response"]);
    expect(receipts(first)).toBe(1);
    expect(endings(run)).toEqual(["unknown NoResponse", "success success"]);
    expect(notice(next)).toBe("sent r2");
  });

  it("a held call never released ends at the commit's own deadline; a later release runs no code of the commit (Stories R9, I10, I11)", async () => {
    const run = await wired(Bank.transfer.hold(), "30 seconds", Bank.transfer.release());
    const { between, next } = run.checkpoints;

    expect(statuses(between)).toEqual(["handled"]);
    expect(receipts(between)).toBe(1);
    expect(notice(between)).toBe("check your statement");
    expect(endings(run)).toEqual(["unknown TimedOut", "success success"]);
    expect(notice(next)).toBe("sent r2");
  });
});
