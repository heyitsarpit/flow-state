import { describe, expect, it } from "vite-plus/test";
import { account } from "../../fixtures/transfers/app.ts";
import { Transfers } from "../../fixtures/transfers/machines/transfers.ts";
import { Bank } from "../../fixtures/transfers/server/bank.ts";
import { bankStory, deadline, usual } from "../../fixtures/transfers/stories/usual.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";
import { ONE_MILLI, SHORT_OF_BOUND } from "../checkout.ts";
import { checked } from "../rules/rules.ts";

const endings = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

const turns = (run: StoryRun) => run.evidence.flatMap((e) => (e._tag === "Turn" ? [e.event] : []));

const actorRecords = (cut: Cut) =>
  [...cut.records.stored.keys()].filter((k) => k.startsWith("actor/"));

const sent = bankStory("steps/sent")
  .ensure(account)
  .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }));

describe("Story step words", () => {
  it("ensure and send land two keyed transfers at once (WriteLanes R6)", async () => {
    const run = checked(await usual.run());

    expect(endings(run)).toEqual(["success success", "success success"]);
    expect(run.checkpoints.sent.read(account)?.memory).toEqual({ notice: "sent r2" });
    expect(run.checkpoints.sent.inspection.actors.map((a) => a.actor)).toHaveLength(1);
  });

  it("send restores from a record but never creates an actor (Stories R3)", async () => {
    const run = checked(
      await bankStory("steps/send-absent")
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .checkpoint("sent")
        .ensure(account)
        .send(account, Transfers.E.Send({ transferId: "t2", cents: 500 }))
        .checkpoint("ensured")
        .run(),
    );

    expect(run.checkpoints.sent.read(account)).toBeUndefined();
    expect(run.checkpoints.sent.read(Bank.transfer)).toEqual([]);
    expect(run.checkpoints.ensured.read(Bank.transfer).map((c) => c.input.transferId)).toEqual([
      "t2",
    ]);
  });

  it("detach ends the use, so the nudge never fires and the actor leaves the cut (Turn I23, Actors R8)", async () => {
    const used = checked(await sent.advance("21 seconds").run());

    const detached = checked(
      await sent.detach(account).advance("21 seconds").checkpoint("later").run(),
    );

    expect(turns(used)).toEqual(["Send", "Done", "Nudge"]);
    expect(turns(detached)).toEqual(["Send", "Done"]);
    expect(detached.checkpoints.later.inspection.actors).toEqual([]);
    expect(actorRecords(detached.checkpoints.later)).toHaveLength(1);
  });

  it("dispose ends the actor and removes it from the cut and the store (Actors R20)", async () => {
    const run = checked(
      await sent.checkpoint("kept").dispose(account).checkpoint("disposed").run(),
    );

    expect(endings(run)).toEqual(["success success"]);
    expect(actorRecords(run.checkpoints.kept)).toHaveLength(1);
    expect(run.checkpoints.disposed.inspection.actors).toEqual([]);
    expect(actorRecords(run.checkpoints.disposed)).toEqual([]);
  });

  it("dispose with how forget forgets the identity and its record (Actors R21)", async () => {
    const run = checked(
      await sent
        .checkpoint("kept")
        .dispose(account, { how: "forget" })
        .checkpoint("forgotten")
        .run(),
    );

    expect(actorRecords(run.checkpoints.kept)).toHaveLength(1);
    expect(actorRecords(run.checkpoints.forgotten)).toEqual([]);
    expect(run.checkpoints.forgotten.read(account)?.lifecycle).toBe("disposed");
  });

  it("disposeRuntime runs the Runtime's dispose to its end, keeping the last snapshot (Actors R22, R23)", async () => {
    const run = checked(await sent.disposeRuntime().checkpoint("disposed").run());

    expect(run.checkpoints.disposed.inspection.lifecycle).toBe("Disposed");
    expect(run.evidence.filter((e) => e._tag === "RuntimeDisposed")).toHaveLength(1);
    expect(run.checkpoints.disposed.read(account)?.memory).toEqual({ notice: "sent r1" });
  });

  it("disposeRuntime with a call on the wire ends it unknown Disposed at the 5 s bound (Actors R22, I35)", async () => {
    const run = checked(
      await bankStory("steps/dispose-on-wire")
        .ensure(account)
        .world(Bank.transfer.hold())
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .disposeRuntime()
        .checkpoint("disposing")
        .advance(SHORT_OF_BOUND)
        .checkpoint("bound")
        .advance(ONE_MILLI)
        .checkpoint("disposed")
        .world(Bank.transfer.release())
        .run(),
    );

    expect(run.checkpoints.disposing.inspection.lifecycle).toBe("Disposing");
    expect(run.checkpoints.bound.inspection.lifecycle).toBe("Disposing");
    expect(run.checkpoints.disposed.inspection.lifecycle).toBe("Disposed");
    expect(endings(run)).toEqual(["unknown Disposed"]);
  });

  it("world applies a control before the next call: a lowered limit declines it (Stories R8)", async () => {
    const run = checked(
      await bankStory("steps/world")
        .ensure(account)
        .world(Bank.limit({ cents: 100 }))
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .checkpoint("declined")
        .run(),
    );

    expect(run.checkpoints.declined.read(Bank).limit).toBe(100);
    expect(endings(run)).toEqual(["failure Declined"]);
  });

  it("advance wakes the nudge at 20 s and the deadline at 30 s, not a millisecond before (Turn I22; WriteLanes R2)", async () => {
    const run = checked(await deadline.run());
    const notice = (cut: Cut) => cut.read(account)?.memory["notice"];

    expect(run.checkpoints["before nudge"].now).toBe(19_999);
    expect(notice(run.checkpoints["before nudge"])).toBe("");
    expect(notice(run.checkpoints.nudged)).toBe(", nudged");
    expect(notice(run.checkpoints["before deadline"])).toBe(", nudged");
    expect(run.checkpoints.late.now).toBe(30_000);
    expect(notice(run.checkpoints.late)).toBe("check your statement");
    expect(turns(run)).toEqual(["Send", "Nudge", "Unsure"]);
    expect(endings(run)).toEqual(["unknown TimedOut"]);
  });

  it("reload boots the tab's next open at the same time and ensures again only the uses still held (Stories R13; Restore R3)", async () => {
    const run = checked(
      await sent
        .advance("2 seconds")
        .reload()
        .checkpoint("kept")
        .detach(account)
        .reload()
        .checkpoint("released")
        .run(),
    );

    expect(run.checkpoints.kept.now).toBe(2000);
    expect(run.checkpoints.kept.read(account)?.memory).toEqual({ notice: "sent r1" });
    expect(run.checkpoints.kept.inspection.actors).toHaveLength(1);
    expect(run.checkpoints.released.inspection.actors).toEqual([]);
    expect(actorRecords(run.checkpoints.released)).toHaveLength(1);
  });

  it("checkpoint holds now, inspection, the actor, truth, calls and the store, unchanged by later steps (Stories R12, I15, I16)", async () => {
    const run = checked(
      await bankStory("steps/checkpoint")
        .ensure(account)
        .world(Bank.transfer.hold())
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .advance("2 seconds")
        .checkpoint("held")
        .world(Bank.transfer.release())
        .checkpoint("done")
        .run(),
    );

    const { held, done } = run.checkpoints;

    expect(held.now).toBe(2000);
    expect(held.inspection.lanes.map((l) => [l.operation, l.contract, l.state])).toEqual([
      ["transfer", "Bank/transfer", "InFlight"],
    ]);
    expect(held.inspection.timers.map((t) => t.kind)).toEqual(["Schedule"]);
    expect(held.read(Bank.transfer).map((c) => [c.input.transferId, c.status])).toEqual([
      ["t1", "held at request"],
    ]);
    expect(held.read(Bank).receipts).toEqual({});
    expect(held.read(account)?.memory).toEqual({ notice: "" });
    expect(held.records.batches.every((b) => b.status === "landed")).toBe(true);
    expect([...held.records.stored.keys()].some((k) => k.startsWith("lane/"))).toBe(true);

    expect(done.read(Bank.transfer).map((c) => c.status)).toEqual(["answered"]);
    expect(Object.values(done.read(Bank).receipts)).toEqual(["r1"]);
    expect(done.inspection.lanes).toEqual([]);
    expect(done.read(account)?.memory).toEqual({ notice: "sent r1" });
    expect(held.read(Bank.transfer).map((c) => c.status)).toEqual(["held at request"]);
  });

  it("two reads of the runtime cut at one point are equal and add no evidence (Stories I16)", async () => {
    const story = bankStory("steps/two-reads")
      .ensure(account)
      .world(Bank.transfer.hold())
      .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }));

    const once = checked(await story.checkpoint("first").run());
    const twice = checked(await story.checkpoint("first").checkpoint("second").run());

    expect(twice.checkpoints.second.inspection).toEqual(twice.checkpoints.first.inspection);
    expect(twice.checkpoints.first.inspection).toEqual(once.checkpoints.first.inspection);
    expect(twice.evidence).toEqual(once.evidence);
  });

  it("a reload after disposeRuntime ensures again every actor the Story still uses (Stories R13)", async () => {
    const run = checked(
      await sent.disposeRuntime().advance("6 seconds").reload().checkpoint("reloaded").run(),
    );

    expect(run.checkpoints.reloaded.inspection.lifecycle).toBe("Open");
    expect(run.checkpoints.reloaded.inspection.actors.map((a) => a.actor)).toEqual([
      "Bank/Transfers/acct-1",
    ]);
  });

  it("reload({ reattach: false }) ensures nothing the Story used; only what the boot wakes is live (Stories R13; Restore R1)", async () => {
    const run = checked(
      await sent.checkpoint("before").reload({ reattach: false }).checkpoint("reloaded").run(),
    );

    expect(run.checkpoints.before.inspection.actors).toHaveLength(1);
    expect(run.checkpoints.reloaded.inspection.actors).toEqual([]);
  });
});
