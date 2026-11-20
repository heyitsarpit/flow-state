import { Duration, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Booking, WARN_MS } from "../../fixtures/wizard/machines/booking.ts";
import { booking, wizardSetup } from "../../fixtures/wizard/app.ts";
import { usual } from "../../fixtures/wizard/stories/usual.ts";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { Fake, Story, turnsOf } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { played } from "../rules/played.ts";
import { timersOf } from "../timers.ts";

// The booking's definition edited in a later build: the same id and memory, two more events.
const Edited = definition({
  id: "Wizard/Booking",
  persist: true,
  states: ["PICKING", "HELD", "BOOKED", "EXPIRED"],
  events: Booking.events,
  internalEvents: { Warned: {}, Expired: {}, Lapsed: {}, Reminded: {} },
  memory: {
    slotId: Flow.initial(Schema.String, ""),
    heldUntil: Flow.initial(Schema.Number, 0),
    warning: Flow.initial(Schema.Boolean, false),
  },
});

type Which =
  | "reordered"
  | "added"
  | "addedByEvent"
  | "addedByRestart"
  | "removed"
  | "renamed"
  | "resent";

// The edited booking's machine: its hold's schedules as `which` edits them.
const editedMachine = (which: Which) =>
  machine(Edited, ({ S, E }) => {
    const expire = {
      schedule: ({
        memory,
        now,
      }: {
        readonly memory: { readonly heldUntil: number };
        readonly now: number;
      }) => memory.heldUntil - now,
      send: which === "resent" ? E.Lapsed : E.Expired,
      armOn: [Flow.entry, E.Extended],
    };

    const warn = {
      schedule: ({
        memory,
        now,
      }: {
        readonly memory: { readonly heldUntil: number };
        readonly now: number;
      }) => memory.heldUntil - WARN_MS - now,
      send: E.Warned,
      armOn: [Flow.entry, E.Extended],
    };

    const schedules = {
      reordered: { warn, expire },
      added: { expire, warn, remind: { schedule: Duration.minutes(1), send: E.Reminded } },
      addedByEvent: {
        expire,
        warn,
        remind: { schedule: Duration.minutes(1), send: E.Reminded, armOn: [E.Extended] },
      },
      addedByRestart: {
        expire,
        warn,
        remind: {
          schedule: Duration.minutes(1),
          send: E.Reminded,
          restartOn: ({ memory }: { readonly memory: { readonly heldUntil: number } }) =>
            memory.heldUntil,
        },
      },
      removed: { expire },
      renamed: { expire, nudge: warn },
      resent: { expire, warn },
    }[which];

    return {
      default: S.PICKING,
      states: {
        HELD: {
          on: {
            Warned: { updateMemory: () => ({ warning: true }) },
            Expired: { target: S.EXPIRED, updateMemory: () => ({ slotId: "" }) },
            Lapsed: { target: S.EXPIRED, updateMemory: () => ({ slotId: "" }) },
            Reminded: { updateMemory: () => ({ warning: true }) },
          },
          schedules,
        },
      },
    };
  });

const RECORD = "actor/Wizard/Booking/inspection";

// The held booking's saved record, then a reload under the edited build, run past both deadlines.
const restoredUnder = async (which: Which) => {
  const saved = await played(usual);
  const text = saved.checkpoints.held.records.stored.get(RECORD) ?? "";
  const edited = editedMachine(which);

  const setup = runtimeSetup({
    app: app({ id: "wizard", machines: { booking: edited } }),
    services: layerIndexedDb(),
    scope: "wizard",
    persistence: { captureMs: 0 },
  });

  const ref = actorRef(edited, "inspection");

  expect(text).toContain('"state":"HELD"');

  return {
    ref,
    run: await played(
      Story.app(setup, { id: `wizard/edited-${which}`, fixtures: [] })
        .world(Fake.storage.put(RECORD, text))
        .reload()
        .ensure(ref)
        .checkpoint("restored")
        .advance("8 minutes")
        .checkpoint("warned")
        .advance("2 minutes")
        .checkpoint("ended"),
    ),
  };
};

describe("restore after the definition is edited (Turn R17; Machines O5)", () => {
  it("Turn R17: reordered schedules restore by name, each keeping its deadline", async () => {
    const { ref, run } = await restoredUnder("reordered");

    expect(timersOf(run.checkpoints.restored.read(ref))).toEqual({
      warn: { dueAt: 480_000 },
      expire: { dueAt: 600_000 },
    });
    expect(run.checkpoints.ended.read(ref)?.state).toBe("EXPIRED");
  });

  it("Turn R17, R14: a schedule added to the restored state starts at the restore with its full delay, as its entry would, so no ending is lost", async () => {
    const { ref, run } = await restoredUnder("added");

    expect(timersOf(run.checkpoints.restored.read(ref))).toEqual({
      expire: { dueAt: 600_000 },
      warn: { dueAt: 480_000 },
      remind: { dueAt: 60_000 },
    });
    expect(turnsOf(run, Edited.E.Reminded)).toHaveLength(1);
  });

  it("Turn R17, R14: a schedule added to the restored state that its entry would not arm (armOn an event, or restartOn alone) stays idle at the restore", async () => {
    for (const which of ["addedByEvent", "addedByRestart"] as const) {
      const { ref, run } = await restoredUnder(which);

      expect(timersOf(run.checkpoints.restored.read(ref))).toEqual({
        expire: { dueAt: 600_000 },
        warn: { dueAt: 480_000 },
      });
      expect(turnsOf(run, Edited.E.Reminded)).toEqual([]);
    }
  });

  it("Turn R17: a removed schedule's saved deadline is dropped and never fires", async () => {
    const { ref, run } = await restoredUnder("removed");

    expect(timersOf(run.checkpoints.restored.read(ref))).toEqual({ expire: { dueAt: 600_000 } });
    expect(turnsOf(run, Edited.E.Warned)).toEqual([]);
  });

  it("Turn R17, R14: a renamed schedule is a removal and an addition: the old name's deadline is dropped and the new name starts at the restore", async () => {
    const { ref, run } = await restoredUnder("renamed");

    expect(timersOf(run.checkpoints.restored.read(ref))).toEqual({
      expire: { dueAt: 600_000 },
      nudge: { dueAt: 480_000 },
    });
    expect(turnsOf(run, Edited.E.Warned)).toHaveLength(1);
  });

  it("Turn R17: a restored deadline fires the send the current definition declares, never the one saved with it", async () => {
    const { ref, run } = await restoredUnder("resent");

    expect(run.checkpoints.ended.read(ref)?.state).toBe("EXPIRED");
    expect(turnsOf(run, Edited.E.Lapsed)).toHaveLength(1);
    expect(turnsOf(run, Edited.E.Expired)).toEqual([]);
  });
});

// A booking record as a release on record format 4 saved it: held, with its two deadlines.
const FORMAT_FOUR =
  '{"baselines":{},"context":{},"format":4,"graph":{},"machine":"Wizard/Booking",' +
  '"memory":{"heldUntil":600000,"slotId":"s-0900","warning":false},"name":"inspection",' +
  '"schedules":[{"dueAt":600000,"name":"expire","send":"Expired"},' +
  '{"dueAt":480000,"name":"warn","send":"Warned"}],"seen":{},"state":"HELD"}';

describe("the step up from record format 4 (Turn R17)", () => {
  it("Turn R17: a format-4 record restores with its deadlines, and its next save is the current format with each timer's attempt", async () => {
    const run = await played(
      Story.app(wizardSetup, { id: "wizard/format-four", fixtures: [] })
        .world(Fake.storage.put(RECORD, FORMAT_FOUR))
        .reload()
        .ensure(booking)
        .checkpoint("restored")
        .send(booking, Booking.E.DismissWarning())
        .checkpoint("saved"),
    );

    expect(timersOf(run.checkpoints.restored.read(booking))).toEqual({
      expire: { dueAt: 600_000 },
      warn: { dueAt: 480_000 },
    });

    const saved = Schema.decodeUnknownSync(
      Schema.fromJsonString(
        Schema.Struct({ format: Schema.Number, schedules: Schema.Array(Schema.Unknown) }),
      ),
    )(run.checkpoints.saved.records.stored.get(RECORD) ?? "{}");

    expect(saved.format).toBe(5);
    expect(saved.schedules).toEqual([
      expect.objectContaining({ name: "expire", dueAt: 600_000, attempt: 0 }),
      expect.objectContaining({ name: "warn" }),
    ]);
  });
});
