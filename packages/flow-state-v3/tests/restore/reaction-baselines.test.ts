import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Fake, Story } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { checked } from "../rules/rules.ts";
import { layerIndexedDb } from "../../src/host/persistence.ts";

// A counter whose count a badge hears; both are kept across reloads.
const Counter = definition({
  id: "Release/Counter",
  persist: true,
  states: ["READY"],
  events: { Set: { n: Schema.Number } },
  memory: { n: Flow.initial(Schema.Number, 0) },
});

const CounterMachine = machine(Counter, ({ S }) => ({
  default: S.READY,
  on: { Set: { updateMemory: ({ event }) => ({ n: event.n }) } },
}));

// The badge: several reactions hear its one count, each counting what it heard.
const Badge = definition({
  id: "Release/Badge",
  persist: true,
  states: ["SHOWN"],
  events: {},
  internalEvents: { Heard: {}, Bumped: {}, Pinged: {} },
  memory: {
    heard: Flow.initial(Schema.Number, 0),
    bumped: Flow.initial(Schema.Number, 0),
    pinged: Flow.initial(Schema.Number, 0),
  },
  context: { count: Flow.context(Counter.M.n) },
});

const counted = {
  Heard: {
    updateMemory: ({ memory }: { memory: { heard: number } }) => ({ heard: memory.heard + 1 }),
  },
  Bumped: {
    updateMemory: ({ memory }: { memory: { bumped: number } }) => ({ bumped: memory.bumped + 1 }),
  },
  Pinged: {
    updateMemory: ({ memory }: { memory: { pinged: number } }) => ({ pinged: memory.pinged + 1 }),
  },
};

// The first release: Heard's `when` has a defect at a count of 1, so its baseline stays at 0 and
// is saved apart from the count's last value; Bumped hears every change.
const FirstRelease = machine(Badge, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [
    C.count.change({
      when: (current) => {
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a user's when that throws: the defect that keeps its baseline
        if (current === 1) throw new Error("one");

        return true;
      },
      event: E.Heard,
    }),
    C.count.change({ event: E.Bumped }),
  ],
  on: counted,
}));

// Each next release fixes Heard's defect and edits the reactions on the count.
const releases = {
  reordered: machine(Badge, ({ S, E, C }) => ({
    default: S.SHOWN,
    onContext: [C.count.change({ event: E.Bumped }), C.count.change({ event: E.Heard })],
    on: counted,
  })),
  added: machine(Badge, ({ S, E, C }) => ({
    default: S.SHOWN,
    onContext: [
      C.count.change({ event: E.Pinged }),
      C.count.change({ event: E.Heard }),
      C.count.change({ event: E.Bumped }),
    ],
    on: counted,
  })),
  removed: machine(Badge, ({ S, E, C }) => ({
    default: S.SHOWN,
    onContext: [C.count.change({ event: E.Bumped })],
    on: counted,
  })),
};

const setupOf = (badge: typeof FirstRelease) =>
  runtimeSetup({
    app: app({
      id: "release-badges",
      machines: {
        counter: CounterMachine,
        badge: { machine: badge, context: { count: actorRef(CounterMachine, "c") } },
      },
    }),
    services: layerIndexedDb(),
    scope: "badges",
    persistence: { captureMs: 0 },
  });

const counter = actorRef(CounterMachine, "c");

// The first release's saved world: the count moved to 1; Bumped heard it, Heard's defect kept its
// baseline at 0.
const firstWorld = async () => {
  const badge = actorRef(FirstRelease, "b");

  const run = await Story.app(setupOf(FirstRelease), { id: "release/first", fixtures: [] })
    .ensure(counter)
    .ensure(badge)
    .send(counter, Counter.E.Set({ n: 1 }))
    .checkpoint("saved")
    .run();

  return {
    memory: run.checkpoints.saved.read(badge)?.memory,
    stored: run.checkpoints.saved.records.stored,
  };
};

// The next release booted over the first one's saved world: the badge restored and settled.
const nextRelease = async (release: keyof typeof releases) => {
  const first = await firstWorld();
  const machineOf = releases[release];
  const badge = actorRef(machineOf, "b");

  const run = checked(
    await Story.app(setupOf(machineOf), { id: `release/${release}`, fixtures: [] })
      .world(...[...first.stored].map(([key, text]) => Fake.storage.put(key, text)))
      .reload()
      .ensure(counter)
      .ensure(badge)
      .checkpoint("restored")
      .run(),
  );

  return { first: first.memory, restored: run.checkpoints.restored.read(badge)?.memory };
};

describe("a saved baseline finds its own reaction after the machine's reactions change (Restore R2, R5; Turn R22)", () => {
  it("Restore R5, Turn R22: reordered: Heard's kept baseline stays Heard's, so Heard hears the count once and Bumped makes up nothing", async () => {
    const { first, restored } = await nextRelease("reordered");

    expect(first).toEqual({ heard: 0, bumped: 1, pinged: 0 });
    expect(restored).toEqual({ heard: 1, bumped: 1, pinged: 0 });
  });

  it("Restore R5, Turn R22: a reaction added first starts from the count's last value, silent; Heard's kept baseline stays Heard's", async () => {
    const { restored } = await nextRelease("added");

    expect(restored).toEqual({ heard: 1, bumped: 1, pinged: 0 });
  });

  it("Restore R5, Turn R22: Heard removed: its kept baseline goes with it, and Bumped makes up nothing", async () => {
    const { restored } = await nextRelease("removed");

    expect(restored).toEqual({ heard: 0, bumped: 1, pinged: 0 });
  });
});
