import { Duration, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Booking, WARN_MS } from "../../fixtures/wizard/machines/booking.ts";
import { booking, wizardSetup } from "../../fixtures/wizard/app.ts";
import { usual } from "../../fixtures/wizard/stories/usual.ts";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { Fake, Story, turnsOf } from "../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  runtimeSetup,
  type ScheduleDecls,
} from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";
import { played } from "../rules/played.ts";
import { timersOf } from "../timers.ts";

// The booking's definition edited in a later build: the same id and memory, two more events,
// and its schedules declared as `which` edits them.
const editedOf = <const D extends ScheduleDecls>(schedules: D) =>
  definition({
    id: "Wizard/Booking",
    persist: true,
    states: ["PICKING", "HELD", "BOOKED", "EXPIRED"],
    events: {
      Held: { slotId: Schema.String, heldUntil: Schema.Number },
      Extended: { heldUntil: Schema.Number },
      DismissWarning: {},
      Book: {},
      PickAgain: {},
    },
    internalEvents: { Warned: {}, Expired: {}, Lapsed: {}, Reminded: {} },
    memory: {
      slotId: Flow.initial(Schema.String, ""),
      heldUntil: Flow.initial(Schema.Number, 0),
      warning: Flow.initial(Schema.Boolean, false),
    },
    schedules,
  });

const Edited = editedOf({ expire: {}, warn: {}, remind: {} });

type Which =
  | "reordered"
  | "added"
  | "addedByEvent"
  | "addedByRestart"
  | "removed"
  | "renamed"
  | "resent";

// The edited booking's machine: its hold's schedules as `which` edits them.
const DECLARED = {
  reordered: { warn: {}, expire: {} },
  added: { expire: {}, warn: {}, remind: {} },
  addedByEvent: { expire: {}, warn: {}, remind: {} },
  addedByRestart: { expire: {}, warn: {}, remind: { restartOn: Schema.Number } },
  removed: { expire: {} },
  renamed: { expire: {}, nudge: {} },
  resent: { expire: {}, warn: {} },
};

// The build `which` edits to, typed as the booking it edits: each edit declares what it places.
const editedMachine = (which: Which) => {
  const declared: typeof Edited = loose(editedOf(DECLARED[which]));

  return machine(declared, ({ S, E }) => {
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
          schedules: loose(schedules),
        },
      },
    };
  });
};

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

// A persisted one-minute schedule held by reason A while `a` is set, and the same machine as a
// later build edits it, with no pause reasons.
const holdOf = <const P extends ReadonlyArray<string>>(pausedBy: P) =>
  definition({
    id: "Edits/Hold",
    persist: true,
    states: ["ON"],
    events: { Set: { a: Schema.Boolean } },
    internalEvents: { Tick: {} },
    memory: { a: Flow.initial(Schema.Boolean, false), ticks: Flow.initial(Schema.Number, 0) },
    schedules: { t: { pausedBy } },
  });

const Hold = holdOf(["A"]);

// A later build of the hold, typed as the build it edits.
// RETURN_TYPE: the hold's type, which the later build stands in for.
const later = (built: unknown): typeof Hold => loose(built);

// A later build without the pause reason is typed as the build it edits.
const holdMachine = (withPause: boolean) =>
  machine(withPause ? Hold : later(holdOf([])), ({ S, E }) => ({
    default: S.ON,
    on: {
      Set: { updateMemory: ({ event }) => ({ a: event.a }) },
      Tick: { updateMemory: ({ memory }) => ({ ticks: memory.ticks + 1 }) },
    },
    states: {
      ON: {
        schedules: {
          t: withPause
            ? { schedule: "1 minute", send: E.Tick, paused: { A: ({ memory }) => memory.a } }
            : loose({ schedule: "1 minute", send: E.Tick }),
        },
      },
    },
  }));

const HoldPaused = holdMachine(true);

const HoldPlain = holdMachine(false);

const holdSetup = (withPause: boolean) =>
  runtimeSetup({
    app: app({ id: "hold", machines: { hold: withPause ? HoldPaused : HoldPlain } }),
    services: layerIndexedDb(),
    scope: "hold",
    persistence: { captureMs: 0 },
  });

describe("a hold restored under a build without pause reasons (Schedules R6, R14)", () => {
  it("Schedules R14, I3: a hold restored under a build with every pause reason removed resumes from its left and fires once", async () => {
    const held = actorRef(HoldPaused, "hold");
    const plain = actorRef(HoldPlain, "hold");

    const saved = await played(
      Story.app(holdSetup(true), { id: "hold/saved", fixtures: [] })
        .ensure(held)
        .advance("10 seconds")
        .send(held, Hold.E.Set({ a: true }))
        .checkpoint("held"),
    );

    const records = saved.checkpoints.held.records.stored;

    const run = await played(
      Story.app(holdSetup(false), { id: "hold/edited", fixtures: [] })
        .world(...[...records].map(([key, text]) => Fake.storage.put(key, text)))
        .advance("10 seconds")
        .reload()
        .ensure(plain)
        .checkpoint("restored")
        .advance("10 minutes")
        .checkpoint("ended"),
    );

    expect(timersOf(saved.checkpoints.held.read(held))).toEqual({
      t: { left: 50_000, pausedBy: ["A"] },
    });
    expect(timersOf(run.checkpoints.restored.read(plain))).toEqual({ t: { dueAt: 60_000 } });
    expect(run.checkpoints.ended.read(plain)?.memory.ticks).toBe(1);
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
        Schema.Struct({
          format: Schema.Number,
          schedules: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown)),
        }),
      ),
    )(run.checkpoints.saved.records.stored.get(RECORD) ?? "{}");

    // Records R12: format 6 files each timer under the state path that declares it, then its name.
    const byName = Object.fromEntries(
      Object.values(saved.schedules).flatMap((names) => Object.entries(names)),
    );

    expect(saved.format).toBe(6);
    expect(byName).toEqual({
      expire: { arming: { _tag: "Due", armedAt: 600_000, attempt: 0, dueAt: 600_000 } },
      warn: expect.objectContaining({ arming: expect.objectContaining({}) }),
    });
  });

  it("Turn R17: a format-4 record saved after its warning fired restores with that warning ended, so it does not fire again", async () => {
    const warned = FORMAT_FOUR.replace('"warning":false', '"warning":true').replace(
      ',{"dueAt":480000,"name":"warn","send":"Warned"}',
      "",
    );

    const run = await played(
      Story.app(wizardSetup, { id: "wizard/format-four-warned", fixtures: [] })
        .world(Fake.storage.put(RECORD, warned))
        .reload()
        .ensure(booking)
        .checkpoint("restored")
        .advance("9 minutes")
        .checkpoint("before expiry"),
    );

    expect(warned).not.toContain('warn"');
    expect(timersOf(run.checkpoints.restored.read(booking))).toEqual({
      expire: { dueAt: 600_000 },
    });
    expect(turnsOf(run, Booking.E.Warned)).toEqual([]);
    expect(run.checkpoints["before expiry"].read(booking)?.state).toBe("HELD");
  });
});
