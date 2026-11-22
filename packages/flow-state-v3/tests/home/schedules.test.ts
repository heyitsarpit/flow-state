import { Duration, Effect, Option, Predicate, Schedule, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { house, roomOf } from "../../fixtures/home/app.ts";
import { House } from "../../fixtures/home/machines/house.ts";
import { Room } from "../../fixtures/home/machines/room.ts";
import { noSensors, reconnectBackoff, vacationEdges } from "../../fixtures/home/stories/edges.ts";
import { manyRooms, ROOMS } from "../../fixtures/home/stories/load.ts";
import {
  houseFirst,
  reloadedPaused,
  roomFirst,
  roomsAddedMidTick,
  unusedOverdue,
  unusedReturn,
  unusedWhileSaving,
  vacationEndedUnused,
} from "../../fixtures/home/stories/structure.ts";
import {
  boost,
  heaterSteps,
  lounge,
  pauseReasons,
  reachedWhileSaving,
  sensorChurn,
  usual,
  vacationOver,
} from "../../fixtures/home/stories/usual.ts";
import { evidenceOf, publishedOf, Story, turnsOf } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { played } from "../rules/played.ts";
import { heldBy, timerNames, timersOf } from "../timers.ts";
import { alarmsMatch } from "../turn/turn-invariants.ts";

// A keyed poll timer of the lounge's sensor `id`, running or held.
const running = (id: string, dueAt: number) => ({ key: { id }, dueAt });

const held = (id: string, left: number, pausedBy: ReadonlyArray<string>) => ({
  key: { id },
  left,
  pausedBy,
});

describe("paused timers (Turn R27, R19; Machines O8)", () => {
  it("Turn R27: a keyed schedule is held per key: a pending save holds the temperature poll, which shows left and pausedBy and never dueAt, while the motion poll runs", async () => {
    const run = await played(usual);

    expect(timersOf(run.checkpoints.saving.read(lounge))).toEqual({
      poll: [running("m1", 70_000), held("t1", 60_000, ["Saving"])],
      check: { dueAt: 360_000 },
    });
  });

  it("Turn R19, R27: the save's ending is a lane change that re-checks paused, so each key resumes from its left", async () => {
    const run = await played(usual);

    expect(timersOf(run.checkpoints.saved.read(lounge))).toEqual({
      poll: [running("m1", 70_000), running("t1", 123_000)],
      check: { dueAt: 360_000 },
    });
  });

  it("Turn R19: a denied ending's admission is a lane change that re-checks paused, so the held poll resumes", async () => {
    const run = await played(usual);

    expect(evidenceOf(run, Room.E.Saved).map((e) => e._tag)).toContain("Denied");
    expect(timersOf(run.checkpoints.saved.read(lounge))).toEqual(
      expect.objectContaining({ poll: [running("m1", 70_000), running("t1", 123_000)] }),
    );
  });

  it("Turn R19: an unhandled ending's lane change still re-checks paused, so the held polls resume", async () => {
    const run = await played(reachedWhileSaving);

    expect(timersOf(run.checkpoints["idle, saving"].read(lounge))).toEqual({
      poll: [running("m1", 20_000), held("t1", 55_000, ["Saving"])],
    });
    expect(timersOf(run.checkpoints["saved unheard"].read(lounge))).toEqual({
      poll: [running("m1", 20_000), running("t1", 65_000)],
    });
    expect(evidenceOf(run, Room.E.Saved).map((e) => e._tag)).toContain("Unhandled");
  });

  it("Turn R27: a vacation holds an unkeyed multi-step Schedule inside its current delay, and its attempt does not advance while held", async () => {
    const run = await played(usual);

    expect(timersOf(run.checkpoints["on vacation"].read(lounge))).toEqual({
      poll: [running("m1", 490_000), held("t1", 60_000, ["Vacation"])],
      check: { left: 297_000, pausedBy: ["Vacation"] },
    });
    expect(run.checkpoints["an hour away"].read(lounge)?.memory.checks).toEqual([1]);
  });

  it("Turn R27: arriving home resumes every held timer from its left (dueAt = now + left); paused time never counts", async () => {
    const run = await played(usual);

    expect(timersOf(run.checkpoints["home again"].read(lounge))).toEqual({
      poll: [running("m1", 4_090_000), running("t1", 4_143_000)],
      check: { dueAt: 4_380_000 },
    });
    expect(run.checkpoints["checked twice"].read(lounge)?.memory.checks).toEqual([1, 2]);
  });

  it("Turn R27: pause reasons hold separately, pausedBy lists the active ones in declaration order, and one clearing never resumes while another holds", async () => {
    const run = await played(pauseReasons);

    expect(timersOf(run.checkpoints.both.read(lounge))).toEqual({
      poll: [running("m1", 10_000), held("t1", 56_000, ["Vacation", "Saving"])],
      check: { left: 300_000, pausedBy: ["Vacation"] },
    });
    expect(timersOf(run.checkpoints["one cleared"].read(lounge))).toEqual({
      poll: [running("m1", 70_000), held("t1", 56_000, ["Vacation"])],
      check: { left: 300_000, pausedBy: ["Vacation"] },
    });
    expect(run.checkpoints["polled after"].read(lounge)?.memory.polls).toEqual({ m1: 70_000 });
  });

  it("Turn R27: schedule evidence records each pause and resume with its reasons", async () => {
    const run = await played(usual);

    const paused = run.evidence.flatMap((e) =>
      e._tag === "Paused" ? [[e.schedule, e.key, e.reasons, e.left] as const] : [],
    );

    const resumed = run.evidence.flatMap((e) =>
      e._tag === "Resumed" ? [[e.schedule, e.key, e.dueAt] as const] : [],
    );

    expect(paused).toEqual([
      ["poll", Option.some({ id: "t1" }), ["Saving"], 60_000],
      ["poll", Option.some({ id: "t1" }), ["Vacation"], 60_000],
      ["check", Option.none(), ["Vacation"], 297_000],
    ]);
    expect(resumed).toEqual([
      ["poll", Option.some({ id: "t1" }), 123_000],
      ["poll", Option.some({ id: "t1" }), 4_143_000],
      ["check", Option.none(), 4_380_000],
    ]);
  });
});

describe("keyed schedules (Turn R16, R15, I35)", () => {
  it("Turn R16: one timer per key, armed when it appears, restarted alone when its restartOn selection changes, cancelled when it leaves, fresh when it returns", async () => {
    const run = await played(sensorChurn);

    expect(timersOf(run.checkpoints.added.read(lounge))).toEqual({
      poll: [running("m1", 40_000), running("m2", 40_000), running("t1", 60_000)],
    });
    expect(timersOf(run.checkpoints.changed.read(lounge))).toEqual({
      poll: [running("m1", 40_000), running("m2", 40_000), running("t1", 40_000)],
    });
    expect(run.checkpoints["changed polled"].read(lounge)?.memory.polls).toEqual({
      m1: 40_000,
      m2: 40_000,
      t1: 40_000,
    });
    expect(timersOf(run.checkpoints.removed.read(lounge))).toEqual({
      poll: [running("m2", 60_000), running("t1", 60_000)],
    });
    expect(run.checkpoints.removed.read(lounge)?.memory.polls).toEqual({
      m1: 40_000,
      m2: 50_000,
      t1: 50_000,
    });
    expect(timersOf(run.checkpoints.returned.read(lounge))).toEqual({
      poll: [running("m1", 65_000), running("m2", 60_000), running("t1", 60_000)],
    });
    expect(run.checkpoints["returned polled"].read(lounge)?.memory.polls).toEqual(
      expect.objectContaining({ m1: 65_000 }),
    );
  });

  it("Turn R15, I32, R30: keyed timers due together fire as separate turns in their keys' code-unit order", async () => {
    const run = await played(sensorChurn);
    const polled = publishedOf(run, lounge).map((p) => p.memory.polls);
    const firstAt40 = (id: string) => polled.findIndex((polls) => polls[id] === 40_000);

    expect([firstAt40("m1"), firstAt40("m2"), firstAt40("t1")]).toEqual([
      firstAt40("m1"),
      firstAt40("m1") + 1,
      firstAt40("m1") + 2,
    ]);
    expect(firstAt40("m1")).toBeGreaterThan(0);
  });

  it("Machines O8: a keyed schedule with no keys is absent from the snapshot, never an empty default", async () => {
    const run = await played(noSensors);

    expect(run.checkpoints.empty.read(lounge)?.schedules).toEqual({});
  });
});

describe("armOn and disarmOn by token (Turn R14)", () => {
  it("Turn R14: an armOn event token is no Flow.entry: the boost is idle when heating starts", async () => {
    const run = await played(boost);

    expect(timerNames(run.checkpoints.heating.read(lounge))).not.toContain("boost");
  });

  it("Turn R14: Boost arms and restarts the boost; CancelBoost removes it with no handler written and is not Unhandled; a later Boost runs to its end", async () => {
    const run = await played(boost);

    expect(timersOf(run.checkpoints.boosted.read(lounge))).toEqual(
      expect.objectContaining({ boost: { dueAt: 1_800_000 } }),
    );
    expect(timersOf(run.checkpoints.restarted.read(lounge))).toEqual(
      expect.objectContaining({ boost: { dueAt: 2_400_000 } }),
    );
    expect(run.checkpoints.restarted.read(lounge)?.memory.boosts).toBe(0);
    expect(run.checkpoints.cancelled.read(lounge)?.memory.boosts).toBe(0);
    expect(run.checkpoints.ended.read(lounge)?.memory.boosts).toBe(1);
    expect(evidenceOf(run, Room.E.CancelBoost).filter((e) => e._tag === "Unhandled")).toEqual([]);
  });
});

describe("an Effect Schedule stepped by the host (Turn R15, R16, I33, I34)", () => {
  it("Turn R15: a multi-step Schedule fires each step until complete, each send carrying its attempt", async () => {
    const run = await played(heaterSteps);

    expect(run.checkpoints["three checks"].read(lounge)?.memory.checks).toEqual([1, 2, 3]);
    expect(run.checkpoints.complete.read(lounge)?.memory.checks).toEqual([1, 2, 3]);
    expect(timerNames(run.checkpoints.complete.read(lounge))).not.toContain("check");
  });

  it("Turn R14, R16: a new target re-enters and changes restartOn in one turn, arming once from step one; disarmOn stops it; a later target starts it again", async () => {
    const run = await played(heaterSteps);

    expect(run.checkpoints.restarted.read(lounge)?.memory.checks).toEqual([1, 2, 3, 1]);
    expect(timersOf(run.checkpoints.restarted.read(lounge))).toEqual(
      expect.objectContaining({ check: { dueAt: 2_100_000 } }),
    );
    expect(run.checkpoints["window open"].read(lounge)?.memory.checks).toEqual([1, 2, 3, 1]);
    expect(run.checkpoints["after the window"].read(lounge)?.memory.checks).toEqual([
      1, 2, 3, 1, 1,
    ]);
  });

  it("Turn R17, R15: a step due while the room was unused fires once on its return, and the next delay starts at that firing", async () => {
    const run = await played(unusedOverdue);

    expect(run.checkpoints.waiting.read(lounge)?.memory.checks).toEqual([]);
    expect(run.checkpoints.returned.read(lounge)?.memory.checks).toEqual([1]);
    expect(timersOf(run.checkpoints.returned.read(lounge))).toEqual(
      expect.objectContaining({ check: { dueAt: 1_500_000 } }),
    );
    expect(run.checkpoints["next step"].read(lounge)?.memory.checks).toEqual([1, 2]);
  });

  it("Turn R17, I22: on its return each overdue key's poll fires once, never a catch-up burst", async () => {
    const run = await played(unusedReturn("home/unused-return"));

    expect(turnsOf(run, Room.E.Polled)).toHaveLength(2);
    expect(run.checkpoints.returned.read(lounge)?.memory.polls).toEqual({
      m1: 1_200_000,
      t1: 1_200_000,
    });
  });
});

describe("a host-stepped step past the timer limit (Turn R15)", () => {
  it("Turn R15 (fixtures.md E5): a step past 2^31 − 1 ms lets the firing that computed it commit, then ends the schedule with one issue", async () => {
    const run = await played(reconnectBackoff);

    expect(run.checkpoints["first reminder"].read(lounge)?.memory.notice).toBe(
      "Reconnect the thermostat (reminder 1).",
    );
    expect(timersOf(run.checkpoints["first reminder"].read(lounge))).toEqual({
      reconnect: { dueAt: 3_600_000 + 50 * 3_600_000 },
    });
    expect(run.checkpoints["second reminder"].read(lounge)?.memory.notice).toBe(
      "Reconnect the thermostat (reminder 2).",
    );
    expect(timersOf(run.checkpoints["second reminder"].read(lounge))).toEqual({});
    expect(run.checkpoints["second reminder"].read(lounge)?.issues).toHaveLength(1);
  });
});

// An offline device reminded hourly, as Room's reconnect reminder is, whose reminder records what
// its send mapper read as the firing's key: the attempt when the key is undefined, else -1.
const Nudger = definition({
  id: "Home/Nudger",
  states: ["OFFLINE"],
  events: {},
  internalEvents: { Nudged: { attempt: Schema.Number } },
  memory: { notice: Flow.initial(Schema.String, "") },
  schedules: { reconnect: {} },
});

const NudgerMachine = machine(Nudger, ({ S, E }) => ({
  default: S.OFFLINE,
  on: {
    Nudged: { updateMemory: ({ event }) => ({ notice: `reminder ${String(event.attempt)}` }) },
  },
  states: {
    OFFLINE: {
      schedules: {
        reconnect: {
          schedule: Duration.hours(1),
          send: E.Nudged.from((firing) => ({
            attempt: Predicate.isUndefined(firing.key) ? firing.attempt : -1,
          })),
        },
      },
    },
  },
}));

const nudger = actorRef(NudgerMachine, "nudger");

describe("an unkeyed schedule's key at run time (Types R3, I3)", () => {
  it("Types R3: an unkeyed schedule's send mapper reads key as undefined, the value its type states", async () => {
    const run = await played(
      Story.app(runtimeSetup({ app: app({ id: "nudger", machines: { nudger: NudgerMachine } }) }), {
        id: "home/unkeyed-key",
        fixtures: [],
      })
        .ensure(nudger)
        .advance("1 hour")
        .checkpoint("reminded"),
    );

    expect(run.checkpoints.reminded.read(nudger)?.memory.notice).toBe("reminder 1");
  });
});

describe("restore of held timers (Turn R17, R27)", () => {
  it("Turn R17: a reload keeps each held timer's left and re-evaluates keys and paused silently", async () => {
    const run = await played(reloadedPaused);

    expect(timersOf(run.checkpoints.reloaded.read(lounge))).toEqual({
      poll: [running("m1", 430_000), held("t1", 60_000, ["Vacation"])],
      check: { left: 180_000, pausedBy: ["Vacation"] },
    });
    expect(run.checkpoints.reloaded.read(lounge)?.issues).toEqual([]);
    expect(run.checkpoints.reloaded.read(lounge)?.memory.checks).toEqual([1]);
  });

  it("Turn R17: a restored held multi-step Schedule finishes its left, then continues at its next step, its attempt counting on from the arming", async () => {
    const run = await played(reloadedPaused);

    expect(run.checkpoints["left finished"].read(lounge)?.memory.checks).toEqual([1, 2]);
    expect(run.checkpoints["step one again"].read(lounge)?.memory.checks).toEqual([1, 2, 3]);
  });

  it("Machines O5: a restored series continues at its saved attempt, so a reload adds no firing and the series ends after its third check", async () => {
    const run = await played(reloadedPaused);

    expect(run.checkpoints["series over"].read(lounge)?.memory.checks).toEqual([1, 2, 3]);
    expect(timerNames(run.checkpoints["series over"].read(lounge))).not.toContain("check");
  });

  it("Turn R17, R27: a saved hold whose reason is false at the restore resumes from its left", async () => {
    const run = await played(vacationEndedUnused);

    expect(timersOf(run.checkpoints["room after"].read(lounge))).toEqual({
      poll: [running("m1", 40_000), running("t1", 95_000)],
    });
  });

  it("Turn R17, R27: a room opened before its house reads the restored vacation and holds its new key's full delay", async () => {
    const run = await played(roomFirst);

    expect(timersOf(run.checkpoints["room first"].read(lounge))).toEqual({
      poll: [held("t1", 60_000, ["Vacation"])],
    });
  });
});

describe("structure (fixtures.md S6, S8)", () => {
  it("Turn R17, R27 (S6, house first): the room restored after its house holds its temperature poll's left; its motion poll restarts at its first step", async () => {
    const run = await played(houseFirst);

    expect(timersOf(run.checkpoints["room after"].read(lounge))).toEqual({
      poll: [running("m1", 10_000), held("t1", 60_000, ["Vacation"])],
    });
  });

  it("Turn R27 (S8 × 8): keys that appear while paused arm held, with their full delay", async () => {
    const run = await played(roomsAddedMidTick);

    expect(
      Array.from({ length: 8 }, (_, n) => timersOf(run.checkpoints.added.read(roomOf(n)))),
    ).toEqual(Array.from({ length: 8 }, () => ({ poll: [held("t1", 60_000, ["Vacation"])] })));
  });
});

describe("computed delays (Turn R14)", () => {
  it("Turn R14: a computed delay of −1 ms counts as zero: due at once, fired on the next turn, never in the arming turn", async () => {
    const run = await played(vacationOver);

    expect(turnsOf(run, House.E.StartVacation).map((t) => t.to)).toEqual(["VACATION"]);
    expect(turnsOf(run, House.E.Returned).map((t) => [t.from, t.to])).toEqual([
      ["VACATION", "HOME"],
    ]);
    expect(run.checkpoints.home.read(house)?.state).toBe("HOME");
    expect(run.checkpoints.home.read(house)?.issues).toEqual([]);
  });

  it("Turn R14 (fixtures.md E5): vacations ending −1 ms and 0 ms on come home on the next turn", async () => {
    const run = await played(vacationEdges);

    expect(run.checkpoints["minus one fired"].read(house)?.state).toBe("HOME");
    expect(run.checkpoints["zero fired"].read(house)?.state).toBe("HOME");
    expect(
      turnsOf(run, House.E.Returned)
        .slice(0, 2)
        .map((t) => t.from),
    ).toEqual(["VACATION", "VACATION"]);
  });

  it("Turn R14 (fixtures.md E5): a vacation 2^31 ms on refuses its turn; one 2^31 − 1 ms on is armed a millisecond short and home at it", async () => {
    const run = await played(vacationEdges);

    expect(run.checkpoints.past.read(house)?.state).toBe("HOME");
    expect(run.checkpoints.past.read(house)?.issues).toHaveLength(1);
    expect(run.checkpoints["just short"].read(house)?.state).toBe("VACATION");
    expect(run.checkpoints["longest fired"].read(house)?.state).toBe("HOME");
  });
});

describe("load (fixtures.md L1, L4)", () => {
  it("Turn R27, R17: 64 rooms: one vacation holds each room's two temperature polls and its heating check, they stay held across a reload, and all resume", async () => {
    const run = await played(manyRooms);

    const vacationHeld = (name: "all held" | "resumed") =>
      Array.from({ length: ROOMS }, (_, n) =>
        heldBy(run.checkpoints[name].read(roomOf(n)), ["Vacation"]),
      );

    expect(vacationHeld("all held")).toEqual(
      Array.from({ length: ROOMS }, (_, n) => (n % 2 === 0 ? 3 : 2)),
    );
    expect(vacationHeld("resumed")).toEqual(Array.from({ length: ROOMS }, () => 0));
  });
});

// A keyed schedule disarmed by an event: each list item's reminder, stopped by Mute.
const Reminders = definition({
  id: "Home/Reminders",
  states: ["ON"],
  events: { Mute: {} },
  internalEvents: { Reminded: { id: Schema.String } },
  memory: {
    items: Flow.initial(Schema.Array(Schema.String), ["a", "b"]),
    reminded: Flow.initial(Schema.Number, 0),
  },
  schedules: { remind: { key: { id: Schema.String } } },
});

const RemindersMachine = machine(Reminders, ({ S, E }) => ({
  default: S.ON,
  states: {
    ON: {
      on: {
        Mute: {},
        Reminded: { updateMemory: ({ memory }) => ({ reminded: memory.reminded + 1 }) },
      },
      schedules: {
        remind: {
          keys: ({ memory }) => memory.items.map((id) => ({ id })),
          schedule: "1 minute",
          send: E.Reminded.from(({ key }) => ({ id: key.id })),
          disarmOn: [E.Mute],
        },
      },
    },
  },
}));

const reminders = actorRef(RemindersMachine, "reminders");

describe("disarmOn on a keyed schedule (Turn R14, R27)", () => {
  it("Turn R14: an event a keyed schedule lists in disarmOn stops every key's timer, and nothing fires later", async () => {
    const run = await played(
      Story.app(
        runtimeSetup({ app: app({ id: "reminders", machines: { reminders: RemindersMachine } }) }),
        {
          id: "home/keyed-disarm",
          fixtures: [],
        },
      )
        .ensure(reminders)
        .checkpoint("armed")
        .send(reminders, Reminders.E.Mute())
        .advance("5 minutes")
        .checkpoint("muted"),
    );

    expect(timerNames(run.checkpoints.armed.read(reminders))).toEqual(["remind"]);
    expect(timersOf(run.checkpoints.muted.read(reminders))).toEqual({});
    expect(run.checkpoints.muted.read(reminders)?.memory.reminded).toBe(0);
  });
});

// A search box: typing restarts a debounce from the query; Submit searches at once, clears the
// query and stops the debounce.
const Search = definition({
  id: "Home/Search",
  states: ["READY"],
  events: { Typed: { query: Schema.String }, Submit: {} },
  internalEvents: { Debounced: {} },
  memory: {
    query: Flow.initial(Schema.String, ""),
    searches: Flow.initial(Schema.Number, 0),
  },
  schedules: { debounce: { restartOn: Schema.String } },
});

const SearchMachine = machine(Search, ({ S, E }) => ({
  default: S.READY,
  on: {
    Typed: { updateMemory: ({ event }) => ({ query: event.query }) },
    Submit: { updateMemory: ({ memory }) => ({ query: "", searches: memory.searches + 1 }) },
    Debounced: { updateMemory: ({ memory }) => ({ searches: memory.searches + 1 }) },
  },
  states: {
    READY: {
      schedules: {
        debounce: {
          schedule: "300 millis",
          send: E.Debounced,
          restartOn: ({ memory }) => memory.query,
          disarmOn: [E.Submit],
        },
      },
    },
  },
}));

const search = actorRef(SearchMachine, "search");

describe("disarmOn beside restartOn (Turn R14)", () => {
  it("Turn R14: a disarmOn event that also changes restartOn's selection leaves the schedule disarmed, and a later change re-arms it", async () => {
    const run = await played(
      Story.app(runtimeSetup({ app: app({ id: "search", machines: { search: SearchMachine } }) }), {
        id: "home/submit-clears-query",
        fixtures: [],
      })
        .ensure(search)
        .send(search, Search.E.Typed({ query: "lamp" }))
        .checkpoint("typing")
        .send(search, Search.E.Submit())
        .checkpoint("submitted")
        .advance("1 second")
        .checkpoint("quiet")
        .send(search, Search.E.Typed({ query: "desk" }))
        .advance("1 second")
        .checkpoint("typed again"),
    );

    expect(timerNames(run.checkpoints.typing.read(search))).toEqual(["debounce"]);
    expect(timersOf(run.checkpoints.submitted.read(search))).toEqual({});
    expect(run.checkpoints.quiet.read(search)?.memory.searches).toBe(1);
    expect(run.checkpoints["typed again"].read(search)?.memory.searches).toBe(2);
  });
});

// A meter that reads once a minute until its Schedule dies on its second step.
const Meter = definition({
  id: "Home/Meter",
  states: ["ON"],
  events: {},
  internalEvents: { Read: {} },
  memory: { reads: Flow.initial(Schema.Number, 0) },
  schedules: { read: {} },
});

// A Schedule whose first step waits a minute and whose second dies.
const diesOnSecondStep = Schedule.fromStep(
  Effect.sync(() => {
    let taken = 0;

    return () => {
      taken += 1;

      return taken >= 2
        ? Effect.die(new Error("the meter's Schedule broke"))
        : Effect.succeed<[number, Duration.Duration]>([taken, Duration.minutes(1)]);
    };
  }),
);

const MeterMachine = machine(Meter, ({ S, E }) => ({
  default: S.ON,
  on: { Read: { updateMemory: ({ memory }) => ({ reads: memory.reads + 1 }) } },
  states: { ON: { schedules: { read: { schedule: diesOnSecondStep, send: E.Read } } } },
}));

const meter = actorRef(MeterMachine, "meter");

describe("a Schedule whose step dies (Turn R15, R25)", () => {
  it("Turn R15: a step that dies after a firing keeps the firing and ends the schedule with one issue at its slot", async () => {
    const run = await played(
      Story.app(runtimeSetup({ app: app({ id: "meter", machines: { meter: MeterMachine } }) }), {
        id: "home/meter-step-dies",
        fixtures: [],
      })
        .ensure(meter)
        .advance("5 minutes")
        .checkpoint("after"),
    );

    const after = run.checkpoints.after.read(meter);

    expect(after?.memory.reads).toBe(1);
    expect(timersOf(after)).toEqual({});
    expect(after?.issues.map((i) => i.path)).toEqual([["Home/Meter", "meter", "schedule read"]]);
  });
});

// A ticker that counts every 50 ms, and a dashboard reading two of its values, so returning to the
// ticker through the dashboard gives it two uses in one step.
const Ticker = definition({
  id: "Home/Ticker",
  states: ["ON"],
  events: {},
  internalEvents: { Ticked: {} },
  memory: { ticks: Flow.initial(Schema.Number, 0) },
  schedules: { tick: {} },
});

const TickerMachine = machine(Ticker, ({ S, E }) => ({
  default: S.ON,
  on: { Ticked: { updateMemory: ({ memory }) => ({ ticks: memory.ticks + 1 }) } },
  states: {
    ON: { schedules: { tick: { schedule: Schedule.spaced("50 millis"), send: E.Ticked } } },
  },
}));

const Dashboard = definition({
  id: "Home/Dashboard",
  states: ["SHOWING"],
  events: {},
  context: { ticks: Flow.context(Ticker.M.ticks), on: Flow.context(Ticker.state) },
});

const DashboardMachine = machine(Dashboard, ({ S }) => ({ default: S.SHOWING }));

const ticker = actorRef(TickerMachine, "ticker");
const dashboard = actorRef(DashboardMachine, "dashboard");

describe("an overdue series returned to by two uses at once (Turn R15, R17, I22)", () => {
  it("Turn R17: two uses returning in one step fire the overdue step once, then the series continues from that firing", async () => {
    const run = await played(
      Story.app(
        runtimeSetup({
          app: app({
            id: "ticker",
            machines: {
              ticker: TickerMachine,
              dashboard: { machine: DashboardMachine, context: { ticks: ticker, on: ticker } },
            },
          }),
        }),
        { id: "home/ticker-two-uses", fixtures: [] },
      )
        .ensure(ticker)
        .detach(ticker)
        .advance("80 millis")
        .checkpoint("waiting")
        .ensure(dashboard)
        .checkpoint("returned")
        .advance("50 millis")
        .checkpoint("next step"),
    );

    expect(run.checkpoints.waiting.read(ticker)?.memory.ticks).toBe(0);
    expect(run.checkpoints.returned.read(ticker)?.memory.ticks).toBe(1);
    expect(run.checkpoints["next step"].read(ticker)?.memory.ticks).toBe(2);
  });
});

// A heater check whose restart selection and pause reason throw while its sensor is broken.
const Heater = definition({
  id: "Home/Heater",
  states: ["ON"],
  events: { Break: {}, Fix: {}, SetTarget: { celsius: Schema.Number } },
  internalEvents: { Checked: {} },
  memory: {
    broken: Flow.initial(Schema.Boolean, false),
    target: Flow.initial(Schema.Number, 20),
    checks: Flow.initial(Schema.Number, 0),
  },
  schedules: { check: { pausedBy: ["Away"], restartOn: Schema.Number } },
});

const unreadable = (broken: boolean) => {
  if (broken) throw new Error("the sensor is broken");
};

const HeaterMachine = machine(Heater, ({ S, E }) => ({
  default: S.ON,
  on: {
    Break: { updateMemory: () => ({ broken: true }) },
    Fix: { updateMemory: () => ({ broken: false }) },
    SetTarget: { updateMemory: ({ event }) => ({ target: event.celsius }) },
    Checked: { updateMemory: ({ memory }) => ({ checks: memory.checks + 1 }) },
  },
  states: {
    ON: {
      schedules: {
        check: {
          schedule: "5 minutes",
          send: E.Checked,
          armOn: [Flow.entry],
          restartOn: ({ memory }) => {
            unreadable(memory.broken);

            return memory.target;
          },
          paused: {
            Away: ({ memory }) => {
              unreadable(memory.broken);

              return false;
            },
          },
        },
      },
    },
  },
}));

const heater = actorRef(HeaterMachine, "heater");

describe("schedule functions that throw (Turn R19, R25)", () => {
  it("Turn R19, R25: a restartOn and a pause reason that throw keep the timer as it was with one issue, which a later success clears", async () => {
    const run = await played(
      Story.app(runtimeSetup({ app: app({ id: "heater", machines: { heater: HeaterMachine } }) }), {
        id: "home/heater-sensor-broken",
        fixtures: [],
      })
        .ensure(heater)
        .advance("2 minutes")
        .send(heater, Heater.E.Break())
        .checkpoint("broken")
        .send(heater, Heater.E.SetTarget({ celsius: 23 }))
        .checkpoint("set while broken")
        .send(heater, Heater.E.Fix())
        .checkpoint("fixed"),
    );

    expect(timersOf(run.checkpoints.broken.read(heater))).toEqual({ check: { dueAt: 300_000 } });
    expect(run.checkpoints.broken.read(heater)?.issues).toHaveLength(1);
    expect(timersOf(run.checkpoints["set while broken"].read(heater))).toEqual({
      check: { dueAt: 300_000 },
    });
    expect(run.checkpoints.fixed.read(heater)?.issues).toEqual([]);
    expect(timersOf(run.checkpoints.fixed.read(heater))).toEqual({ check: { dueAt: 420_000 } });
  });
});

describe("a room left unused while it saves (Changes C5 Use row, I12; Turn R17, I22)", () => {
  it("Changes C5: used again, the lounge's overdue check and motion poll fire once and its next check is five minutes on", async () => {
    const run = await played(unusedWhileSaving);
    const awake = run.checkpoints.awake.read(lounge);

    expect({
      polled: awake?.memory.polls["m1"],
      checks: awake?.memory.checks,
      timers: timersOf(awake),
    }).toEqual({
      polled: 1_200_000,
      checks: [1],
      timers: expect.objectContaining({ check: { dueAt: 1_500_000 } }),
    });
  });

  it("Changes I12: while the lounge is unused its timers hold no alarm, and no grace runs while its save is on the wire", async () => {
    const run = await played(unusedWhileSaving);

    expect([
      ...alarmsMatch(run.checkpoints.asleep, "asleep"),
      ...alarmsMatch(run.checkpoints["still saving"], "still saving"),
      ...alarmsMatch(run.checkpoints.awake, "awake"),
    ]).toEqual([]);
  });
});
