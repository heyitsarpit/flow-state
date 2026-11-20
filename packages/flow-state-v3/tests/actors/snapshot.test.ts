import { Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Story } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";

const Lamp = definition({
  id: "Snapshot/Lamp",
  states: ["OFF", "ON"],
  events: { Flip: {}, Fix: {}, Break: {} },
  internalEvents: { Dim: {} },
  memory: { broken: Flow.initial(Schema.Boolean, true), flips: Flow.initial(Schema.Number, 0) },
});

const LampMachine = machine(Lamp, ({ S, E }) => ({
  default: S.OFF,
  on: {
    Flip: {
      updateMemory: ({ memory }) => {
        if (memory.broken) throw new Error("broken");

        return { flips: memory.flips + 1 };
      },
    },
    Fix: { updateMemory: () => ({ broken: false }) },
    Break: { updateMemory: () => ({ broken: true }) },
    Dim: {},
  },
  states: {
    OFF: { schedules: { dim: { schedule: "2 seconds", send: E.Dim } } },
  },
}));

const lamp = actorRef(LampMachine, "hall");

const setup = runtimeSetup({ app: app({ id: "snapshot", machines: { lamp: LampMachine } }) });

const story = (id: string) => Story.app(setup, { id, fixtures: [] }).ensure(lamp);

const sources = (issues: ReadonlyArray<{ readonly path: ReadonlyArray<string | number> }>) =>
  issues.map((d) => d.path[2]);

describe("the snapshot (Turn R23, R25; Runtime O3)", () => {
  it("Turn R23: a snapshot shows its lifecycle and each armed schedule with its deadline, keyed", async () => {
    const run = await story("snapshot/schedules").checkpoint("on").run();
    const read = run.checkpoints.on.read(lamp);

    expect(read?.lifecycle).toBe("active");
    expect(read?.schedules).toEqual({ dim: { dueAt: 2000 } });
  });

  it("Turn R25, I31: a refused turn's issue stays until its own source succeeds; another source's success leaves it", async () => {
    const run = await story("snapshot/issues")
      .send(lamp, Lamp.E.Flip())
      .checkpoint("refused")
      .send(lamp, Lamp.E.Fix())
      .checkpoint("other")
      .send(lamp, Lamp.E.Flip())
      .checkpoint("cleared")
      .run();

    expect(sources(run.checkpoints.refused.read(lamp)?.issues ?? [])).toEqual(["event Flip"]);
    expect(run.checkpoints.refused.read(lamp)?.issues[0]?.code).toBe("Defect");
    expect(sources(run.checkpoints.other.read(lamp)?.issues ?? [])).toEqual(["event Flip"]);
    expect(run.checkpoints.cleared.read(lamp)?.issues).toEqual([]);
  });

  it("Turn R25, I31: a new incarnation inherits no issue", async () => {
    const run = await story("snapshot/new-incarnation")
      .send(lamp, Lamp.E.Flip())
      .dispose(lamp)
      .ensure(lamp)
      .checkpoint("again")
      .run();

    expect(run.checkpoints.again.read(lamp)?.issues).toEqual([]);
  });

  it("Runtime O3: after disposeActor a snapshot reads the last incarnation's terminal state, disposed", async () => {
    const run = await story("snapshot/terminal")
      .send(lamp, Lamp.E.Fix())
      .send(lamp, Lamp.E.Flip())
      .dispose(lamp)
      .checkpoint("disposed")
      .run();

    const read = run.checkpoints.disposed.read(lamp);
    expect(read?.lifecycle).toBe("disposed");
    expect(read?.memory.flips).toBe(1);
  });

  it("Runtime O6: during and after Runtime disposal a live actor reads disposing, then disposed", async () => {
    const run = await story("snapshot/runtime-disposal").disposeRuntime().checkpoint("gone").run();

    expect(run.checkpoints.gone.read(lamp)?.lifecycle).toBe("disposed");
  });
});

const Alarm = definition({
  id: "Snapshot/Alarm",
  states: ["WAITING"],
  events: {},
  internalEvents: { Never: {} },
  memory: { gap: Flow.initial(Schema.Number, 2 ** 31) },
});

const AlarmMachine = machine(Alarm, ({ S, E }) => ({
  default: S.WAITING,
  states: {
    WAITING: { schedules: { broken: { schedule: ({ memory }) => memory.gap, send: E.Never } } },
  },
}));

const alarm = actorRef(AlarmMachine, "alarm");

const alarms = runtimeSetup({ app: app({ id: "alarms", machines: { alarm: AlarmMachine } }) });

describe("issues name their schedule (Diagnostics R5)", () => {
  it("Diagnostics R5: an issue a schedule's delay raises at creation names that schedule, in evidence and snapshot", async () => {
    const run = await Story.app(alarms, { id: "snapshot/schedule-issue", fixtures: [] })
      .ensure(alarm)
      .checkpoint("created")
      .run();

    const slots = run.evidence.flatMap((e) => (e._tag === "Issue" ? Option.toArray(e.slot) : []));
    expect(slots).toHaveLength(1);
    expect(slots[0]).toContain("broken");
    expect(run.checkpoints.created.read(alarm)?.issues[0]?.details["slot"]).toContain("broken");
  });
});
