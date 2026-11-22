import { Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { account, savings } from "../../fixtures/transfers/app.ts";
import { Transfers } from "../../fixtures/transfers/machines/transfers.ts";
import { Bank } from "../../fixtures/transfers/server/bank.ts";
import {
  bankStory,
  refusedHeldWrite,
  refusedResendCapture,
} from "../../fixtures/transfers/stories/usual.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { type Cut, Fake, Story } from "../../src/host/testing/index.ts";
import { laneFacts } from "../checkout.ts";
import { checked } from "../rules/rules.ts";
import { layerIndexedDb } from "../../src/host/persistence.ts";

// The fields of an actor record and a lane record these tests read (Codec R5).
const ActorRecord = Schema.fromJsonString(
  Schema.Struct({ schedules: Schema.Array(Schema.Unknown) }),
);

const LaneRecord = Schema.fromJsonString(
  Schema.Struct({ inFlight: Schema.Boolean, retryCount: Schema.Number }),
);

const actorRecord = (cut: Cut, key: string) =>
  Option.flatMap(
    Option.fromUndefinedOr(cut.records.stored.get(key)),
    Schema.decodeUnknownOption(ActorRecord),
  );

const laneRecords = (cut: Cut) =>
  [...cut.records.stored].flatMap(([key, text]) =>
    key.startsWith("lane/") ? Option.toArray(Schema.decodeUnknownOption(LaneRecord)(text)) : [],
  );

describe("lane records of Held heads (WriteAhead R5, I24)", () => {
  it("WriteAhead R5: a re-send whose capture is refused goes back to Held, and its lane record reads inFlight false", async () => {
    const run = checked(
      await bankStory("WRITE-AHEAD/refused-resend-capture")
        .ensure(account)
        .world(Bank.transfer.drop({ at: "response" }))
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .checkpoint("held")
        .world(Fake.storage.refuse())
        .send(account, Transfers.E.Resend({ transferId: "t1" }))
        .advance("10 seconds")
        .checkpoint("refused")
        .run(),
    );

    const { held, refused } = run.checkpoints;

    expect(laneRecords(held).map((r) => r.inFlight)).toEqual([false]);
    expect(refused.inspection.lanes.map((l) => l.phase)).toEqual(["Held"]);
    expect(laneRecords(refused).map((r) => r.inFlight)).toEqual([false]);
  });
});

describe("a Held lane whose saves are refused (WriteAhead R5, R10)", () => {
  it("WriteAhead R5, R10: a re-send whose capture is refused writes its Held lane record within the capture interval, though no earlier save of it landed", async () => {
    const run = checked(await refusedResendCapture.run());
    const { "held unsaved": unsaved, "capture refused": refused, saved } = run.checkpoints;

    expect(unsaved.inspection.lanes.map((l) => l.phase)).toEqual(["Held"]);
    expect(laneRecords(unsaved).map((r) => r.inFlight)).toEqual([true]);
    expect(refused.inspection.lanes.map((l) => l.phase)).toEqual(["Held"]);
    expect(saved.records.batches.map((b) => b.status).slice(-3)).toEqual([
      "refused",
      "refused",
      "landed",
    ]);
    expect(laneRecords(saved).map((r) => r.inFlight)).toEqual([false]);
  });
});

describe("an acknowledging write the store takes and then refuses (WriteAhead R13)", () => {
  it("WriteAhead R13: the write is never sent and ends NotSent StorageRefused, with StorageFailure evidence", async () => {
    const run = checked(await refusedHeldWrite.run());
    const { acknowledging, refused } = run.checkpoints;

    expect(acknowledging.inspection.lanes.map((l) => l.phase)).toEqual(["Acknowledging"]);
    expect(refused.inspection.lanes).toEqual([]);
    expect(refused.read(Bank.transfer)).toEqual([]);
    expect(refused.read(account)?.memory.notice).toBe("not sent StorageRefused");
    expect(refused.records.batches.map((b) => b.status)).toContain("refused");
    expect(laneFacts(run.evidence, "StorageFailure")).toBe(1);
  });
});

describe("a re-send's capture (WriteAhead R13)", () => {
  it("WriteAhead R13: the capture a re-send waits for carries the retryCount that re-send will carry", async () => {
    const run = checked(
      await bankStory("WRITE-AHEAD/resend-capture-count")
        .ensure(account)
        .world(Bank.transfer.drop({ at: "response" }))
        .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
        .world(Fake.storage.hold())
        .send(account, Transfers.E.Resend({ transferId: "t1" }))
        .checkpoint("capturing")
        .run(),
    );

    const { capturing } = run.checkpoints;
    const capture = capturing.records.batches.at(-1);

    expect(capture?.purpose).toBe("capture");
    expect(capture?.status).toBe("held");
    expect(capturing.inspection.lanes.map((l) => l.retryCount)).toEqual([0]);
    expect(capturing.read(Bank.transfer)).toHaveLength(1);

    const run2 = await bankStory("WRITE-AHEAD/resend-capture-count-landed")
      .ensure(account)
      .world(Bank.transfer.drop({ at: "response" }))
      .send(account, Transfers.E.Send({ transferId: "t1", cents: 500 }))
      .world(Fake.storage.hold())
      .send(account, Transfers.E.Resend({ transferId: "t1" }))
      .reload({ heldWrites: "land" })
      .checkpoint("booted")
      .run();

    const lane = laneRecords(run2.checkpoints.booted);

    expect(lane.map((r) => r.retryCount)).toEqual([1]);
  });
});

describe("when records are written (WriteAhead R10, R12, I12)", () => {
  it("WriteAhead I12: a refused batch's records are issued again within the capture interval, with no other input", async () => {
    const run = checked(
      await bankStory("WRITE-AHEAD/refused-then-quiet")
        .world(Fake.storage.refuse())
        .ensure(account)
        .checkpoint("refused")
        .advance("6 seconds")
        .checkpoint("later")
        .run(),
    );

    const { refused, later } = run.checkpoints;

    expect(refused.records.batches.map((b) => b.status)).toEqual(["refused"]);
    expect(Option.isSome(actorRecord(later, "actor/Bank/Transfers/acct-1"))).toBe(true);
  });

  it("Actors I37, WriteAhead I23: a free actor ends at its grace while a batch is out, and the batch that lands discharges only what it carried", async () => {
    const run = checked(
      await bankStory("WRITE-AHEAD/end-while-out")
        .world(Fake.storage.hold())
        .ensure(account)
        .ensure(savings)
        .detach(account)
        .detach(savings)
        .advance("1 second")
        .checkpoint("ended")
        .world(Fake.storage.release())
        .checkpoint("landed")
        .run(),
    );

    const { ended, landed } = run.checkpoints;

    expect(ended.inspection.actors).toEqual([]);
    expect(ended.records.batches.map((b) => b.status)).toEqual(["held"]);
    expect(Option.isSome(actorRecord(landed, "actor/Bank/Transfers/acct-1"))).toBe(true);
    expect(Option.isSome(actorRecord(landed, "actor/Bank/Transfers/acct-2"))).toBe(true);
    expect(landed.records.batches.map((b) => b.status)).toEqual(["landed", "landed"]);
  });
});

const Lamp = definition({
  id: "WriteAhead/Lamp",
  persist: true,
  states: ["ON"],
  events: { Touch: {}, Press: {} },
  internalEvents: { Tick: {} },
  memory: { touches: Flow.initial(Schema.Number, 0) },
  operations: () => ({}),
  schedules: { tick: {} },
});

// A lamp whose touch arms a tick that no state handles, so the firing is Unhandled; a press counts.
const LampMachine = machine(Lamp, ({ S, E }) => ({
  default: S.ON,
  on: { Press: { updateMemory: ({ memory }) => ({ touches: memory.touches + 1 }) } },
  states: {
    ON: { schedules: { tick: { schedule: "1 second", send: E.Tick, armOn: [E.Touch] } } },
  },
}));

const lamp = actorRef(LampMachine, "hall");

const lampSetup = runtimeSetup({
  app: app({ id: "lamps", machines: { lamp: LampMachine } }),
  services: layerIndexedDb(),
  scope: "lamps",
  persistence: { captureMs: 0 },
});

describe("what a step touched is written (WriteAhead I21)", () => {
  it("WriteAhead I21: a schedule's firing that no state handles still rewrites the actor record without the schedule", async () => {
    const run = checked(
      await Story.app(lampSetup, { id: "WRITE-AHEAD/unhandled-firing", fixtures: [] })
        .ensure(lamp)
        .send(lamp, Lamp.E.Touch())
        .checkpoint("armed")
        .advance("1 second")
        .checkpoint("fired")
        .run(),
    );

    const schedulesAt = (cut: Cut) =>
      Option.map(actorRecord(cut, "actor/WriteAhead/Lamp/hall"), (r) => r.schedules.length);

    expect(schedulesAt(run.checkpoints.armed)).toEqual(Option.some(1));
    expect(run.evidence.some((e) => e._tag === "Unhandled")).toBe(true);
    expect(schedulesAt(run.checkpoints.fired)).toEqual(Option.some(0));
  });
});

const quietLampSetup = runtimeSetup({
  app: app({ id: "lamps", machines: { lamp: LampMachine } }),
  services: layerIndexedDb(),
  scope: "lamps",
  persistence: {},
});

const touchesAt = (cut: Cut) =>
  Option.map(
    Option.flatMap(
      Option.fromUndefinedOr(cut.records.stored.get("actor/WriteAhead/Lamp/hall")),
      Schema.decodeUnknownOption(
        Schema.fromJsonString(Schema.Struct({ memory: Schema.Struct({ touches: Schema.Number }) })),
      ),
    ),
    (r) => r.memory.touches,
  );

describe("the default capture interval (WriteAhead R10, I12, Q3)", () => {
  it("WriteAhead I12: at the default 5 s, plain memory written at 0 s and again at 3 s lands at 5 s from the first, not before and not later", async () => {
    const run = checked(
      await Story.app(quietLampSetup, { id: "WRITE-AHEAD/default-interval", fixtures: [] })
        .ensure(lamp)
        .send(lamp, Lamp.E.Press())
        .advance("3 seconds")
        .send(lamp, Lamp.E.Press())
        .advance("1999 millis")
        .checkpoint("before")
        .advance("1 millis")
        .checkpoint("due")
        .run(),
    );

    expect(touchesAt(run.checkpoints.before)).toEqual(Option.none());
    expect(touchesAt(run.checkpoints.due)).toEqual(Option.some(2));
    expect(run.checkpoints.due.records.batches).toHaveLength(1);
  });
});

describe("a batch the store holds and then refuses (WriteAhead R10, R12)", () => {
  it("WriteAhead R10: a held-then-refused batch's keys are captured again from the World as it then stands, so the next batch carries the record changed while it was held", async () => {
    const run = checked(
      await Story.app(lampSetup, { id: "WRITE-AHEAD/held-then-refused", fixtures: [] })
        .world(Fake.storage.hold())
        .ensure(lamp)
        .send(lamp, Lamp.E.Press())
        .checkpoint("held")
        .world(Fake.storage.refuseHeld())
        .checkpoint("refused")
        .run(),
    );

    const { held, refused } = run.checkpoints;

    expect(held.records.batches.map((b) => b.status)).toEqual(["held"]);
    expect(touchesAt(held)).toEqual(Option.none());
    expect(refused.records.batches.map((b) => b.status)).toEqual(["refused", "landed"]);
    expect(touchesAt(refused)).toEqual(Option.some(1));
  });

  it("WriteAhead R10: the held batch itself carries the record as it was before the press (landed here as its tab dies), so the put-back after a refusal, which carries the press, is fresh", async () => {
    const run = checked(
      await Story.app(lampSetup, { id: "WRITE-AHEAD/held-then-landed", fixtures: [] })
        .world(Fake.storage.hold())
        .ensure(lamp)
        .send(lamp, Lamp.E.Press())
        .reload({ reattach: false, heldWrites: "land" })
        .checkpoint("held landed")
        .run(),
    );

    expect(touchesAt(run.checkpoints["held landed"])).toEqual(Option.some(0));
  });

  it("WriteAhead R10: an actor disposed while its batch is held, then refused, has its record removed by the next batch, not put back", async () => {
    const run = checked(
      await Story.app(lampSetup, { id: "WRITE-AHEAD/removed-while-held", fixtures: [] })
        .world(Fake.storage.hold())
        .ensure(lamp)
        .send(lamp, Lamp.E.Press())
        .dispose(lamp)
        .checkpoint("held")
        .world(Fake.storage.refuseHeld())
        .checkpoint("refused")
        .run(),
    );

    const { held, refused } = run.checkpoints;

    expect(held.records.batches.map((b) => b.status)).toEqual(["held"]);
    expect(refused.records.batches.map((b) => b.status)).toEqual(["refused", "landed"]);
    expect(refused.records.stored.has("actor/WriteAhead/Lamp/hall")).toBe(false);
  });
});
