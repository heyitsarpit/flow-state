import { describe, expect, it } from "vite-plus/test";
import { Story } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, machine, runtimeSetup } from "../../src/index.ts";

const Lamp = definition({ id: "Foreign/Lamp", states: ["OFF", "ON"], events: { Flip: {} } });
const Door = definition({ id: "Foreign/Door", states: ["SHUT", "OPEN"], events: { Push: {} } });

const LampMachine = machine(Lamp, ({ S }) => ({ default: S.OFF, on: { Flip: S.ON } }));
const DoorMachine = machine(Door, ({ S }) => ({ default: S.SHUT, on: { Push: S.OPEN } }));

const lamps = Story.app(
  runtimeSetup({ app: app({ id: "foreign-lamps", machines: { lamp: LampMachine } }) }),
  {
    id: "foreign/lamps",
    fixtures: [],
  },
);

const doors = Story.app(
  runtimeSetup({ app: app({ id: "foreign-doors", machines: { door: DoorMachine } }) }),
  {
    id: "foreign/doors",
    fixtures: [],
  },
);

const door = actorRef(DoorMachine, "front");

describe("a run's steps name only its app's machines (Actors R24, Stories T2)", () => {
  it("Actors R24: steps of another app's Story are refused ForeignActorRef, not run against a machine the app lacks", async () => {
    const pushed = doors.ensure(door).send(door, Door.E.Push());

    await expect(lamps.run({ steps: pushed.steps })).rejects.toThrow(/ForeignActorRef/u);
  });

  it("Actors R24: the app's own steps run", async () => {
    const pushed = doors.ensure(door).send(door, Door.E.Push());

    expect((await doors.run({ steps: pushed.steps })).end.read(door)?.state).toBe("OPEN");
  });
});
