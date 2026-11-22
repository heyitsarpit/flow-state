import { Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { Fake, Story, type StoryRun } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";
import { played } from "../rules/played.ts";
import { timersOf } from "../timers.ts";

// A persisted lamp with one keyed one-minute schedule `t`: its keys, each reason's held keys
// (`R:key`), its `restartOn` selection and whether a firing's send is refused are memory. Key
// `far` asks for a delay past the timer limit, so its start is refused. Later builds edit the
// schedule's fields: a reason renamed, added or reordered, the key's field renamed, or the
// selection's Schema changed (Schedules R14, its decode table).

const Written = {
  keys: Schema.Array(Schema.String),
  holds: Schema.Array(Schema.String),
  sel: Schema.Number,
  refuse: Schema.Boolean,
  n: Schema.Number,
};

const memoryOf = (keys: ReadonlyArray<string>) => ({
  keys: Flow.initial(Written.keys, keys),
  holds: Flow.initial(Written.holds, []),
  sel: Flow.initial(Schema.Number, 0),
  refuse: Flow.initial(Schema.Boolean, false),
  n: Flow.initial(Schema.Number, 0),
  ticks: Flow.initial(Schema.Array(Schema.String), []),
});

const Lamp = definition({
  id: "Records/Lamp",
  persist: true,
  states: ["ON"],
  events: { Set: Written },
  internalEvents: { Tick: { id: Schema.String } },
  memory: memoryOf([]),
  schedules: { t: { key: { id: Schema.String }, pausedBy: ["A"], restartOn: Schema.Number } },
});

const delayOf = (id: string) => (id === "far" ? 2 ** 31 : 60_000);

const unreadable = (what: string) => {
  throw new Error(`${what} cannot be read`);
};

const LampMachine = machine(Lamp, ({ S, E }) => ({
  default: S.ON,
  on: {
    Set: { updateMemory: ({ event }) => event },
    Tick: {
      updateMemory: ({ event, memory }) =>
        memory.refuse ? unreadable("the firing") : { ticks: [...memory.ticks, event.id] },
    },
  },
  states: {
    ON: {
      schedules: {
        t: {
          keys: ({ memory }) => memory.keys.map((id) => ({ id })),
          schedule: ({ key }) => delayOf(key.id),
          send: E.Tick.from(({ key }) => ({ id: key.id })),
          restartOn: ({ memory }) => memory.sel,
          paused: { A: ({ key, memory }) => memory.holds.includes(`A:${key.id}`) },
        },
      },
    },
  },
}));

// A later build of the lamp, typed as the build it edits: its reasons, its key's field and its
// selection's Schema as the edit declares them.
type Edit = {
  readonly reasons: ReadonlyArray<string>;
  readonly field: string;
  readonly selection: "number" | "string";
};

const editedOf = (edit: Edit) => {
  const key = { [edit.field]: Schema.String };
  const selection = edit.selection === "number" ? Schema.Number : Schema.String;

  const Edited = definition({
    id: "Records/Lamp",
    persist: true,
    states: ["ON"],
    events: { Set: Written },
    internalEvents: { Tick: { id: Schema.String } },
    memory: memoryOf([]),
    schedules: { t: { key, pausedBy: edit.reasons, restartOn: selection } },
  });

  const idOf = (k: Readonly<Record<string, string>>) => k[edit.field] ?? "";

  const built: typeof LampMachine = loose(
    machine(Edited, ({ S, E }) => ({
      default: S.ON,
      on: {
        Set: { updateMemory: ({ event }) => event },
        Tick: { updateMemory: ({ event, memory }) => ({ ticks: [...memory.ticks, event.id] }) },
      },
      states: {
        ON: {
          schedules: {
            t: loose({
              keys: ({ memory }: { memory: { keys: ReadonlyArray<string> } }) =>
                memory.keys.map((id) => ({ [edit.field]: id })),
              schedule: ({ key }: { key: Record<string, string> }) => delayOf(idOf(key)),
              send: E.Tick.from(
                loose(({ key }: { key: Record<string, string> }) => ({ id: idOf(key) })),
              ),
              restartOn: ({ memory }: { memory: { sel: number } }) =>
                edit.selection === "number" ? memory.sel : String(memory.sel),
              paused: Object.fromEntries(
                edit.reasons.map((r) => [
                  r,
                  ({
                    key,
                    memory,
                  }: {
                    key: Record<string, string>;
                    memory: { holds: ReadonlyArray<string> };
                  }) => memory.holds.includes(`${r}:${idOf(key)}`),
                ]),
              ),
            }),
          },
        },
      },
    })),
  );

  return built;
};

const RECORD = "actor/Records/Lamp/lamp";

const setupOf = (lamp: typeof LampMachine) =>
  runtimeSetup({
    app: app({ id: "records", machines: { lamp } }),
    services: layerIndexedDb(),
    scope: "records",
    persistence: { captureMs: 0 },
  });

const lampRef = (lamp: typeof LampMachine) => actorRef(lamp, "lamp");

type Fields = {
  readonly keys: ReadonlyArray<string>;
  readonly holds: ReadonlyArray<string>;
  readonly sel: number;
  readonly refuse: boolean;
  readonly n: number;
};

const set = (fields: Partial<Fields>) =>
  Lamp.E.Set({ keys: ["k"], holds: [], sel: 0, refuse: false, n: 0, ...fields });

// FLOW_STATE_ALLOW_UNKNOWN: one timer as a snapshot shows it.
const shownOf = (one: unknown) => {
  const fields: unknown = Predicate.hasProperty(one, "key") ? one.key : {};

  const key = Predicate.isObject(fields)
    ? Object.entries(fields)
        .map(([field, value]) => `${field}=${String(value)}`)
        .join(",")
    : "-";

  if (Predicate.hasProperty(one, "dueAt")) return [`${key} due ${String(one.dueAt)}`];

  if (Predicate.hasProperty(one, "left") && Predicate.hasProperty(one, "pausedBy"))
    return [`${key} held ${String(one.left)} ${String(one.pausedBy)}`];

  return [];
};

// The lamp's armed timers at a checkpoint, as `key due dueAt` or `key held left reasons`.
const shown = (run: StoryRun<string>, name: string, lamp: typeof LampMachine) => {
  const timers: unknown = timersOf(run.checkpoints[name]?.read(lampRef(lamp)));
  const list: unknown = Predicate.hasProperty(timers, "t") ? timers.t : [];

  return (Array.isArray(list) ? Array.from<unknown>(list) : []).flatMap(shownOf).toSorted();
};

// The lamp's issues at a checkpoint, as `source slot`.
const issuesAt = (run: StoryRun<string>, name: string, lamp: typeof LampMachine) =>
  (run.checkpoints[name]?.read(lampRef(lamp))?.issues ?? []).map(
    (i) => `${String(i.path.at(-1))} ${String(i.details["slot"])}`,
  );

// The lamp's saved record at a checkpoint: its format and its schedule `t`'s timers, wherever the
// record's body keeps the schedules of state ON.
const savedAt = (run: StoryRun<string>, name: string) => {
  const text = run.checkpoints[name]?.records.stored.get(RECORD) ?? "{}";
  const json: unknown = JSON.parse(text);
  const body: unknown = Predicate.hasProperty(json, "body") ? json.body : json;
  const schedules: unknown = Predicate.hasProperty(body, "schedules") ? body.schedules : {};
  const on: unknown = Predicate.hasProperty(schedules, "ON") ? schedules.ON : {};

  return {
    format: Predicate.hasProperty(json, "format") ? json.format : undefined,
    t: Predicate.hasProperty(on, "t") ? on.t : undefined,
  };
};

// A record a format-5 build saved: `k` due at one minute, `j` held by A with half a minute left,
// and `m` idle.
const FORMAT_FIVE =
  '{"baselines":{},"context":{},"format":5,"graph":{},"machine":"Records/Lamp",' +
  '"memory":{"holds":["A:j"],"keys":["j","k","m"],"n":0,"refuse":false,"sel":0,"ticks":[]},' +
  '"name":"lamp","schedules":[' +
  '{"armedAt":0,"attempt":0,"key":{"id":"j"},"left":30000,"name":"t","pausedBy":["A"]},' +
  '{"armedAt":0,"attempt":0,"dueAt":60000,"key":{"id":"k"},"name":"t"},' +
  '{"key":{"id":"m"},"name":"t"}],"seen":{},"state":"ON"}';

const SLOTS = {
  arming: "states.ON.schedules.t.schedule",
  send: "on.Tick[0].updateMemory",
} as const;

describe("the saved timer of format 6 (Schedules R3, R14; Records R12)", () => {
  it.fails("Schedules R14: a refused start, a baseline and a refused firing are saved in the timer of a format-6 record", async () => {
    const lamp = lampRef(LampMachine);

    const run = await played(
      Story.app(setupOf(LampMachine), { id: "records/format-six", fixtures: [] })
        .ensure(lamp)
        .send(lamp, set({ keys: ["far", "k"], refuse: true }))
        .advance("1 minute")
        .checkpoint("saved"),
    );

    expect(savedAt(run, "saved")).toMatchObject({
      format: 6,
      t: [
        { key: { id: "far" }, selection: "0", arming: { _tag: "Refused", slot: SLOTS.arming } },
        {
          key: { id: "k" },
          selection: "0",
          arming: { _tag: "Idle" },
          firing: { slot: SLOTS.send },
        },
      ],
    });
  });

  it.fails("Schedules R14 decode table: a format-5 record restores due, held and idle timers as they were, reads its first baseline silently, and saves as format 6", async () => {
    const lamp = lampRef(LampMachine);

    const run = await played(
      Story.app(setupOf(LampMachine), { id: "records/format-five", fixtures: [] })
        .world(Fake.storage.put(RECORD, FORMAT_FIVE))
        .reload()
        .ensure(lamp)
        .checkpoint("restored")
        .send(lamp, set({ keys: ["j", "k", "m"], holds: ["A:j"], n: 1 }))
        .checkpoint("saved"),
    );

    expect({
      restored: shown(run, "restored", LampMachine),
      saved: savedAt(run, "saved"),
    }).toMatchObject({
      restored: ["id=j held 30000 A", "id=k due 60000"],
      saved: {
        format: 6,
        t: [
          {
            key: { id: "j" },
            selection: "0",
            reasons: ["A"],
            arming: { _tag: "Held", left: 30_000 },
          },
          { key: { id: "k" }, selection: "0", arming: { _tag: "Due", dueAt: 60_000 } },
          { key: { id: "m" }, selection: "0", arming: { _tag: "Idle" } },
        ],
      },
    });
  });
});

// The saved lamp: `k` armed at ten seconds and held by A since twenty, with fifty seconds left.
const savedHeld = Story.app(setupOf(LampMachine), { id: "records/held", fixtures: [] })
  .ensure(lampRef(LampMachine))
  .advance("10 seconds")
  .send(lampRef(LampMachine), set({ keys: ["k"] }))
  .advance("10 seconds")
  .send(lampRef(LampMachine), set({ keys: ["k"], holds: ["A:k"] }))
  .checkpoint("saved");

// The saved records restored under a later build at thirty seconds, then the clock run out.
const restoredUnder = async (edit: Edit, holds: ReadonlyArray<string>) => {
  const saved = await played(savedHeld);
  const lamp = editedOf(edit);

  const run = await played(
    Story.app(setupOf(lamp), { id: "records/edited", fixtures: [] })
      .world(
        ...[...saved.checkpoints.saved.records.stored].map(([key, text]) =>
          Fake.storage.put(key, text),
        ),
      )
      .advance("30 seconds")
      .reload()
      .ensure(lampRef(lamp))
      .checkpoint("woke")
      .send(lampRef(lamp), set({ keys: ["k"], holds, n: 1 }))
      .checkpoint("restored")
      .advance("10 minutes")
      .checkpoint("ended"),
  );

  return {
    woke: shown(run, "woke", lamp),
    restored: shown(run, "restored", lamp),
    issues: issuesAt(run, "restored", lamp),
    ticks: run.checkpoints.ended.read(lampRef(lamp))?.memory.ticks ?? [],
  };
};

describe("restore after the schedule's fields are edited (Schedules R14, its decode table)", () => {
  it("Schedules R14: a pause reason renamed is the old name dropped and the new one read fresh: the hold resumes from its left and fires once", async () => {
    expect(
      await restoredUnder({ reasons: ["Z"], field: "id", selection: "number" }, ["A:k"]),
    ).toEqual({
      woke: ["id=k due 80000"],
      restored: ["id=k due 80000"],
      issues: [],
      ticks: ["k"],
    });
  });

  it("Schedules R14: a pause reason added holds silently when it reads true, and the saved one keeps its hold", async () => {
    expect(
      await restoredUnder({ reasons: ["A", "B"], field: "id", selection: "number" }, [
        "A:k",
        "B:k",
      ]),
    ).toEqual({
      woke: ["id=k held 50000 A"],
      restored: ["id=k held 50000 A,B"],
      issues: [],
      ticks: [],
    });
  });

  it("Schedules R14: pause reasons reordered keep the hold by name", async () => {
    expect(
      await restoredUnder({ reasons: ["B", "A"], field: "id", selection: "number" }, ["A:k"]),
    ).toEqual({
      woke: ["id=k held 50000 A"],
      restored: ["id=k held 50000 A"],
      issues: [],
      ticks: [],
    });
  });

  it("Schedules R14: a key whose field is renamed is a keying change: the saved timer is dropped and the listed key starts from step one", async () => {
    expect(await restoredUnder({ reasons: ["A"], field: "room", selection: "number" }, [])).toEqual(
      {
        woke: ["room=k held 60000 A"],
        restored: ["room=k due 90000"],
        issues: [],
        ticks: ["k"],
      },
    );
  });

  it("Schedules R14: a selection whose Schema changed is no baseline: the restore reads it silently and starts nothing", async () => {
    expect(await restoredUnder({ reasons: ["A"], field: "id", selection: "string" }, [])).toEqual({
      woke: ["id=k held 50000 A"],
      restored: ["id=k due 80000"],
      issues: [],
      ticks: ["k"],
    });
  });
});

// A lamp whose unkeyed schedule `t` arms on entry, created asking for a delay past the limit.
const Far = definition({
  id: "Records/Far",
  persist: true,
  states: ["ON"],
  events: { Set: { n: Schema.Number } },
  internalEvents: { Tick: {} },
  memory: { n: Flow.initial(Schema.Number, 0), ticks: Flow.initial(Schema.Number, 0) },
  schedules: { t: {} },
});

const FarMachine = machine(Far, ({ S, E }) => ({
  default: S.ON,
  on: {
    Set: { updateMemory: ({ event }) => event },
    Tick: { updateMemory: ({ memory }) => ({ ticks: memory.ticks + 1 }) },
  },
  states: {
    ON: {
      schedules: {
        t: { schedule: ({ memory }) => (memory.n === 0 ? 2 ** 31 : 60_000), send: E.Tick },
      },
    },
  },
}));

describe("a start refused at creation (Schedules R1, R11, R14)", () => {
  it.fails("Schedules R11: a start refused at creation is its timer's Refused arming with its issue, kept across a reload, and armed once its delay reads valid", async () => {
    const far = actorRef(FarMachine, "far");

    const run = await played(
      Story.app(
        runtimeSetup({
          app: app({ id: "records-far", machines: { far: FarMachine } }),
          services: layerIndexedDb(),
          scope: "records-far",
          persistence: { captureMs: 0 },
        }),
        { id: "records/refused-at-creation", fixtures: [] },
      )
        .ensure(far)
        .checkpoint("created")
        .reload()
        .ensure(far)
        .checkpoint("reloaded")
        .send(far, Far.E.Set({ n: 1 }))
        .checkpoint("valid")
        .advance("1 minute")
        .checkpoint("fired"),
    );

    const at = (name: "created" | "reloaded" | "valid" | "fired") => {
      const snapshot = run.checkpoints[name].read(far);

      return {
        issues: (snapshot?.issues ?? []).map(
          (i) => `${String(i.path.at(-1))} ${String(i.details["slot"])}`,
        ),
        ticks: snapshot?.memory.ticks,
      };
    };

    expect((["created", "reloaded", "valid", "fired"] as const).map(at)).toEqual([
      { issues: [`schedule t ${SLOTS.arming}`], ticks: 0 },
      { issues: [`schedule t ${SLOTS.arming}`], ticks: 0 },
      { issues: [], ticks: 0 },
      { issues: [], ticks: 1 },
    ]);
  });
});

// A lamp whose key's field is a number saved as text by its declared Schema.
const Coded = definition({
  id: "Records/Coded",
  persist: true,
  states: ["ON"],
  events: {},
  internalEvents: { Tick: {} },
  memory: { ticks: Flow.initial(Schema.Number, 0) },
  schedules: { t: { key: { id: Schema.NumberFromString } } },
});

const CodedMachine = machine(Coded, ({ S, E }) => ({
  default: S.ON,
  on: { Tick: { updateMemory: ({ memory }) => ({ ticks: memory.ticks + 1 }) } },
  states: {
    ON: { schedules: { t: { keys: () => [{ id: 1 }], schedule: "1 minute", send: E.Tick } } },
  },
}));

describe("a key saved by its declared Schema (Schedules R14, selectionCodec)", () => {
  it.fails("Schedules R14: a timer's key is saved as its declared key Schema encodes it, and restores as the same timer", async () => {
    const coded = actorRef(CodedMachine, "coded");

    const setup = runtimeSetup({
      app: app({ id: "records-coded", machines: { coded: CodedMachine } }),
      services: layerIndexedDb(),
      scope: "records-coded",
      persistence: { captureMs: 0 },
    });

    const run = await played(
      Story.app(setup, { id: "records/coded-key", fixtures: [] })
        .ensure(coded)
        .advance("10 seconds")
        .checkpoint("saved")
        .reload()
        .ensure(coded)
        .advance("1 minute")
        .checkpoint("fired"),
    );

    const text = run.checkpoints.saved.records.stored.get("actor/Records/Coded/coded") ?? "";

    expect({
      key: text.includes('"key":{"id":"1"}'),
      ticks: run.checkpoints.fired.read(coded)?.memory.ticks,
    }).toEqual({ key: true, ticks: 1 });
  });
});
