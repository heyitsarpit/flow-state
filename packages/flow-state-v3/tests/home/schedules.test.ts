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
import { evidenceOf, publishedOf, turnsOf } from "../../src/host/testing/index.ts";
import { render } from "../../src/host/trace.ts";
import { played } from "../rules/played.ts";
import { heldBy, timerNames, timersOf } from "../timers.ts";

// A keyed poll timer of the lounge's sensor `id`, running or held.
const running = (id: string, dueAt: number) => ({ key: { id }, dueAt });

const held = (id: string, left: number, pausedBy: ReadonlyArray<string>) => ({
  key: { id },
  left,
  pausedBy,
});

describe("paused timers (Turn R27, R19; Machines O8)", () => {
  it.fails("Turn R27: a keyed schedule is held per key: a pending save holds the temperature poll, which shows left and pausedBy and never dueAt, while the motion poll runs", async () => {
    const run = await played(usual);

    expect(timersOf(run.checkpoints.saving.read(lounge))).toEqual({
      poll: [running("m1", 70_000), held("t1", 60_000, ["Saving"])],
      check: { dueAt: 360_000 },
    });
  });

  it.fails("Turn R19, R27: the save's ending is a lane change that re-checks paused, so each key resumes from its left", async () => {
    const run = await played(usual);

    expect(timersOf(run.checkpoints.saved.read(lounge))).toEqual({
      poll: [running("m1", 70_000), running("t1", 123_000)],
      check: { dueAt: 360_000 },
    });
  });

  it.fails("Turn R19: a denied ending's admission is a lane change that re-checks paused, so the held poll resumes", async () => {
    const run = await played(usual);

    expect(evidenceOf(run, Room.E.Saved).map((e) => e._tag)).toContain("Denied");
    expect(timersOf(run.checkpoints.saved.read(lounge))).toEqual(
      expect.objectContaining({ poll: [running("m1", 70_000), running("t1", 123_000)] }),
    );
  });

  it.fails("Turn R19: an unhandled ending's lane change still re-checks paused, so the held polls resume", async () => {
    const run = await played(reachedWhileSaving);

    expect(timersOf(run.checkpoints["idle, saving"].read(lounge))).toEqual({
      poll: [running("m1", 20_000), held("t1", 55_000, ["Saving"])],
    });
    expect(timersOf(run.checkpoints["saved unheard"].read(lounge))).toEqual({
      poll: [running("m1", 20_000), running("t1", 65_000)],
    });
    expect(evidenceOf(run, Room.E.Saved).map((e) => e._tag)).toContain("Unhandled");
  });

  it.fails("Turn R27: a vacation holds an unkeyed multi-step Schedule inside its current delay, and its attempt does not advance while held", async () => {
    const run = await played(usual);

    expect(timersOf(run.checkpoints["on vacation"].read(lounge))).toEqual({
      poll: [running("m1", 490_000), held("t1", 60_000, ["Vacation"])],
      check: { left: 297_000, pausedBy: ["Vacation"] },
    });
    expect(run.checkpoints["an hour away"].read(lounge)?.memory.checks).toEqual([1]);
  });

  it.fails("Turn R27: arriving home resumes every held timer from its left (dueAt = now + left); paused time never counts", async () => {
    const run = await played(usual);

    expect(timersOf(run.checkpoints["home again"].read(lounge))).toEqual({
      poll: [running("m1", 4_090_000), running("t1", 4_143_000)],
      check: { dueAt: 4_380_000 },
    });
    expect(run.checkpoints["checked twice"].read(lounge)?.memory.checks).toEqual([1, 2]);
  });

  it.fails("Turn R27: pause reasons hold separately, pausedBy lists the active ones in declaration order, and one clearing never resumes while another holds", async () => {
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

  it.fails("Turn R27: schedule evidence records each pause and resume with its reasons", async () => {
    const text = render((await played(usual)).trace, "text");

    expect(
      [/paused poll .*Saving/u, /resumed poll/u, /paused check .*Vacation/u].map((r) =>
        r.test(text),
      ),
    ).toEqual([true, true, true]);
  });
});

describe("keyed schedules (Turn R16, R15, I35)", () => {
  it.fails("Turn R16: one timer per key, armed when it appears, restarted alone when its restartOn selection changes, cancelled when it leaves, fresh when it returns", async () => {
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

  it.fails("Turn R15, I32: keyed timers due together fire as separate turns in the keys' order", async () => {
    const run = await played(sensorChurn);
    const polled = publishedOf(run, lounge).map((p) => p.memory.polls);
    const firstAt40 = (id: string) => polled.findIndex((polls) => polls[id] === 40_000);

    expect([firstAt40("t1"), firstAt40("m1"), firstAt40("m2")]).toEqual([
      firstAt40("t1"),
      firstAt40("t1") + 1,
      firstAt40("t1") + 2,
    ]);
    expect(firstAt40("t1")).toBeGreaterThan(0);
  });

  it.fails("Machines O8: a keyed schedule with no keys is absent from the snapshot, never an empty default", async () => {
    const run = await played(noSensors);

    expect(run.checkpoints.empty.read(lounge)?.schedules).toEqual({});
  });
});

describe("armOn and disarmOn by token (Turn R14)", () => {
  it.fails("Turn R14: an armOn event token is no Flow.entry: the boost is idle when heating starts", async () => {
    const run = await played(boost);

    expect(timerNames(run.checkpoints.heating.read(lounge))).not.toContain("boost");
  });

  it.fails("Turn R14: Boost arms and restarts the boost; CancelBoost removes it with no handler written and is not Unhandled; a later Boost runs to its end", async () => {
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
  it.fails("Turn R15: a multi-step Schedule fires each step until complete, each send carrying its attempt", async () => {
    const run = await played(heaterSteps);

    expect(run.checkpoints["three checks"].read(lounge)?.memory.checks).toEqual([1, 2, 3]);
    expect(run.checkpoints.complete.read(lounge)?.memory.checks).toEqual([1, 2, 3]);
    expect(timerNames(run.checkpoints.complete.read(lounge))).not.toContain("check");
  });

  it.fails("Turn R14, R16: a new target re-enters and changes restartOn in one turn, arming once from step one; disarmOn stops it; a later target starts it again", async () => {
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

  it.fails("Turn R17, R15: a step due while the room was unused fires once on its return, and the next delay starts at that firing", async () => {
    const run = await played(unusedOverdue);

    expect(run.checkpoints.waiting.read(lounge)?.memory.checks).toEqual([]);
    expect(run.checkpoints.returned.read(lounge)?.memory.checks).toEqual([1]);
    expect(timersOf(run.checkpoints.returned.read(lounge))).toEqual(
      expect.objectContaining({ check: { dueAt: 1_500_000 } }),
    );
    expect(run.checkpoints["next step"].read(lounge)?.memory.checks).toEqual([1, 2]);
  });

  it.fails("Turn R17, I22: on its return each overdue key's poll fires once, never a catch-up burst", async () => {
    const run = await played(unusedReturn("home/unused-return"));

    expect(turnsOf(run, Room.E.Polled)).toHaveLength(2);
    expect(run.checkpoints.returned.read(lounge)?.memory.polls).toEqual({
      m1: 1_200_000,
      t1: 1_200_000,
    });
  });
});

describe("a host-stepped step past the timer limit (Turn R15)", () => {
  it.fails("Turn R15 (fixtures.md E5): a step past 2^31 − 1 ms lets the firing that computed it commit, then ends the schedule with one issue", async () => {
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

describe("restore of held timers (Turn R17, R27)", () => {
  it.fails("Turn R17: a reload keeps each held timer's left and re-evaluates keys and paused silently", async () => {
    const run = await played(reloadedPaused);

    expect(timersOf(run.checkpoints.reloaded.read(lounge))).toEqual({
      poll: [running("m1", 430_000), held("t1", 60_000, ["Vacation"])],
      check: { left: 180_000, pausedBy: ["Vacation"] },
    });
    expect(run.checkpoints.reloaded.read(lounge)?.issues).toEqual([]);
    expect(run.checkpoints.reloaded.read(lounge)?.memory.checks).toEqual([1]);
  });

  it.fails("Turn R17: a restored held multi-step Schedule finishes its left, then continues from step one, its attempt counting on from the arming", async () => {
    const run = await played(reloadedPaused);

    expect(run.checkpoints["left finished"].read(lounge)?.memory.checks).toEqual([1, 2]);
    expect(run.checkpoints["step one again"].read(lounge)?.memory.checks).toEqual([1, 2, 3]);
  });

  it.fails("Machines O5 (Pending D40): a restored series continues at its saved attempt, so a reload adds no firing and the series ends after its third check", async () => {
    const run = await played(reloadedPaused);

    expect(run.checkpoints["series over"].read(lounge)?.memory.checks).toEqual([1, 2, 3]);
    expect(timerNames(run.checkpoints["series over"].read(lounge))).not.toContain("check");
  });

  it.fails("Turn R17, R27: a saved hold whose reason is false at the restore resumes from its left", async () => {
    const run = await played(vacationEndedUnused);

    expect(timersOf(run.checkpoints["room after"].read(lounge))).toEqual({
      poll: [running("m1", 40_000), running("t1", 95_000)],
    });
  });

  it.fails("Turn R17, R27: a room opened before its house reads the restored vacation and holds its new key's full delay", async () => {
    const run = await played(roomFirst);

    expect(timersOf(run.checkpoints["room first"].read(lounge))).toEqual({
      poll: [held("t1", 60_000, ["Vacation"])],
    });
  });
});

describe("structure (fixtures.md S6, S8)", () => {
  it.fails("Turn R17, R27 (S6, house first): the room restored after its house holds its temperature poll's left; its motion poll restarts at its first step", async () => {
    const run = await played(houseFirst);

    expect(timersOf(run.checkpoints["room after"].read(lounge))).toEqual({
      poll: [running("m1", 10_000), held("t1", 60_000, ["Vacation"])],
    });
  });

  it.fails("Turn R27 (S8 × 8): keys that appear while paused arm held, with their full delay", async () => {
    const run = await played(roomsAddedMidTick);

    expect(
      Array.from({ length: 8 }, (_, n) => timersOf(run.checkpoints.added.read(roomOf(n)))),
    ).toEqual(Array.from({ length: 8 }, () => ({ poll: [held("t1", 60_000, ["Vacation"])] })));
  });
});

describe("computed delays (Turn R14)", () => {
  it.fails("Turn R14: a computed delay of −1 ms counts as zero: due at once, fired on the next turn, never in the arming turn", async () => {
    const run = await played(vacationOver);

    expect(run.checkpoints.set.read(house)?.state).toBe("VACATION");
    expect(timersOf(run.checkpoints.set.read(house))).toEqual({ homecoming: { dueAt: 3_600_000 } });
    expect(run.checkpoints.home.read(house)?.state).toBe("HOME");
    expect(turnsOf(run, House.E.Returned)).toHaveLength(1);
  });

  it.fails("Turn R14 (fixtures.md E5): vacations ending −1 ms and 0 ms on come home on the next turn", async () => {
    const run = await played(vacationEdges);

    expect(run.checkpoints["minus one"].read(house)?.state).toBe("VACATION");
    expect(run.checkpoints["minus one fired"].read(house)?.state).toBe("HOME");
    expect(run.checkpoints["zero fired"].read(house)?.state).toBe("HOME");
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
  it.fails("Turn R27, R17: 64 rooms: one vacation holds each room's two temperature polls and its heating check, they stay held across a reload, and all resume", async () => {
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
