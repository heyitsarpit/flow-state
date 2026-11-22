import { Struct } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { house } from "../../fixtures/home/app.ts";
import { House } from "../../fixtures/home/machines/house.ts";
import { Room } from "../../fixtures/home/machines/room.ts";
import { Thermostat } from "../../fixtures/home/server/thermostat.ts";
import { homeStory, lounge, loungeWithSensors } from "../../fixtures/home/stories/usual.ts";
import { Step, type StoryRun } from "../../src/host/testing/index.ts";
import {
  alarmsMatch,
  consumersEndFirst,
  onePublication,
  onlyTurnsWrite,
  rowsHeardLive,
  steppedOf,
} from "./turn-invariants.ts";

// The turn's parts on the home app, the sequence test of Changes I5, I9, I12, I13 and I15 to I17:
// every sequence of the atoms below from one start, a checkpoint after every step, and each
// invariant judged on every step. I13 is judged by every cut, which rebuilds the indexes. I7 is the
// mailbox's own test (src/core/turn-parts.test.ts): no Story fills a mailbox past one drain.

const base = homeStory("turn/sequence");

const HOUR = 3_600_000;

// Each atom as the steps one builder call makes; the thermostat answers at once.
const ATOMS = {
  leave: base.send(house, House.E.Leave()).steps,
  arrive: base.send(house, House.E.Arrive()).steps,
  vacation: base.send(house, House.E.StartVacation({ until: HOUR })).steps,
  vacationTooFar: base.send(house, House.E.StartVacation({ until: 2 ** 31 + HOUR })).steps,
  target: base.send(lounge, Room.E.SetTarget({ celsius: 22 })).steps,
  boost: base.send(lounge, Room.E.Boost()).steps,
  offline: base.send(lounge, Room.E.Disconnected()).steps,
  sensor: base.send(lounge, Room.E.AddSensor({ id: "m2", kind: "motion" })).steps,
  noSensor: base.send(lounge, Room.E.RemoveSensor({ id: "t1" })).steps,
  unplug: base.world(Thermostat.unplug({ room: "lounge" })).steps,
  detach: base.detach(lounge).steps,
  ensure: base.ensure(lounge).steps,
  minute: base.advance("1 minute").steps,
  grace: base.advance("100 millis").steps,
  dispose: base.dispose(lounge).steps,
  reload: base.reload({ reattach: false }).steps,
  disposeRuntime: base.disposeRuntime().steps,
} as const;

type Atom = keyof typeof ATOMS;

const NAMES = Struct.keys(ATOMS);

// Every sequence of `depth` atoms; the Runtime's disposal only last, since nothing runs after it.
// RETURN_TYPE: recursive: each depth extends the sequences one shorter.
const sequencesOf = (depth: number): ReadonlyArray<ReadonlyArray<Atom>> =>
  depth === 0
    ? [[]]
    : sequencesOf(depth - 1).flatMap((prefix) =>
        prefix.at(-1) === "disposeRuntime" ? [] : NAMES.map((atom) => [...prefix, atom]),
      );

const DEPTH = process.env["FLOW_STRESS"] === undefined ? 2 : 3;

const SEQUENCES = sequencesOf(DEPTH);

const start = loungeWithSensors(base).checkpoint("start").steps;

// The lounge reads the house's mode: the one consumer and its provider.
const BOUND = new Map([['Home/Room/{"room":"lounge"}', ["Home/House/home"]]]);

type Judged = { readonly run: StoryRun<string>; readonly atoms: ReadonlyArray<Atom> };

const runs: Promise<ReadonlyArray<Judged>> = Promise.all(
  SEQUENCES.map(async (atoms) => {
    const steps = atoms.flatMap((atom, at) => [
      ...ATOMS[atom],
      Step.checkpoint({ name: `after ${String(at)} ${atom}` }),
    ]);

    return { run: await base.run({ steps: [...start, ...steps] }), atoms };
  }),
);

const judge = async (rule: (j: Judged) => ReadonlyArray<string>) =>
  (await runs).flatMap((j) => rule(j).map((breach) => `${j.atoms.join(" > ")}: ${breach}`));

describe("the turn's parts over every sequence of home's atoms (Changes T1, T14)", () => {
  it.fails("Changes I12: after every step the alarms are exactly one per live owner fact", async () => {
    const breaches = await judge(({ run }) =>
      Object.entries(run.checkpoints).flatMap(([name, cut]) => alarmsMatch(cut, name)),
    );

    expect(breaches).toEqual([]);
  });

  it("Changes I5: every accepted turn publishes once, after its record, before its actor's next turn", async () => {
    expect(await judge(({ run }) => onePublication(run))).toEqual([]);
  });

  it("Changes I9: after every step a row in a mailbox has a live audience, a save that lands after its room was disposed included", async () => {
    const landed = await loungeWithSensors(base)
      .world(Thermostat.setTarget.hold())
      .send(lounge, Room.E.SetTarget({ celsius: 22 }))
      .dispose(lounge)
      .world(Thermostat.setTarget.release())
      .checkpoint("landed")
      .run();

    const breaches = await judge(({ run }) =>
      Object.entries(run.checkpoints).flatMap(([name, cut]) => rowsHeardLive(cut, name)),
    );

    expect([...breaches, ...rowsHeardLive(landed.checkpoints.landed, "landed")]).toEqual([]);
  });

  it("Changes I15, I16: across every step only a turn or a start writes an actor's state or memory", async () => {
    const breaches = await judge(({ run }) => steppedOf(run).flatMap(onlyTurnsWrite));

    expect(breaches).toEqual([]);
  });

  it("Changes I17: a step that ends the lounge and its house ends the lounge first", async () => {
    const breaches = await judge(({ run }) =>
      steppedOf(run).flatMap((s) => consumersEndFirst(s, BOUND)),
    );

    expect(breaches).toEqual([]);
  });

  it("Changes I13: every sequence runs to its end, so every cut rebuilt the world's indexes without drift", async () => {
    expect((await runs).length).toBe(SEQUENCES.length);
  });
});
