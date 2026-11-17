import { Effect, Schema } from "effect";
import { definition, deny, Flow, machine, transaction } from "../../src/index.ts";

const save = transaction({
  id: "types/save",
  input: { id: Schema.String },
  key: ["id"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.void,
});

const Lamp = definition({
  id: "types/Lamp",
  states: ["OFF", "ON"],
  events: { Flip: {} },
  internalEvents: { Saved: {}, Failed: {}, Unsure: Flow.uncertain({}) },
  memory: { ready: Flow.initial(Schema.Boolean, false) },
  operations: ({ E }) => ({
    save: save.outcomes({ success: E.Saved, failure: {}, unknown: E.Unsure }),
  }),
});

void machine(Lamp, ({ S }) => ({ default: S.OFF, states: { ON: {} } }));

void machine(Lamp, ({ S }) => ({
  default: S.OFF,
  states: {
    // @ts-expect-error a state body the definition lacks (Machines O1, Compile R14)
    DIM: {},
  },
}));

void machine(Lamp, ({ S }) => ({ default: S.OFF, on: { Flip: S.ON } }));

void machine(Lamp, ({ S }) => ({
  default: S.OFF,
  on: {
    // @ts-expect-error a handler for an event the definition lacks (Machines O1, Compile T11)
    Dim: S.ON,
  },
}));

void machine(Lamp, ({ S }) => ({ default: S.ON }));

void machine(Lamp, ({ S }) => ({
  // @ts-expect-error a state token the definition lacks (Machines O1, Compile T11)
  default: S.DIM,
}));

void machine(Lamp, ({ S, E }) => ({
  default: S.OFF,
  states: { ON: { schedules: { off: { schedule: "1 second", send: E.Flip } } } },
}));

void machine(Lamp, ({ S, E }) => ({
  default: S.OFF,
  states: {
    ON: {
      schedules: {
        // @ts-expect-error an event token the definition lacks (Machines O1, Compile T11)
        off: { schedule: "1 second", send: E.Dim },
      },
    },
  },
}));

void machine(Lamp, ({ S, O }) => ({
  default: S.OFF,
  on: { Flip: { actions: [O.save.commit(() => ({ id: "a" }))] } },
}));

void machine(Lamp, ({ S, O }) => ({
  default: S.OFF,
  on: {
    Flip: {
      // @ts-expect-error an operation the definition lacks (Machines O1, Compile T11)
      actions: [O.load.commit(() => ({ id: "a" }))],
    },
  },
}));

void machine(Lamp, ({ S }) => ({
  default: S.OFF,
  on: { Flip: { guard: ({ memory }) => memory.ready || deny("NotReady") } },
}));

void machine(Lamp, ({ S }) => ({
  default: S.OFF,
  on: {
    Flip: {
      // @ts-expect-error a guard returning false (Machines O4, Compile T6)
      guard: () => false,
    },
  },
}));

void machine(Lamp, ({ S }) => ({
  default: S.OFF,
  on: {
    // @ts-expect-error a null handler (Compile R4; construction.test pairs it)
    Flip: null,
  },
}));

void machine(Lamp, ({ S }) => ({
  default: S.OFF,
  on: {
    // @ts-expect-error a bare string handler (Compile R4; construction.test pairs it)
    Flip: "ON",
  },
}));

void machine(Lamp, ({ S, E }) => ({
  default: S.OFF,
  states: {
    OFF: {
      schedules: {
        // @ts-expect-error an armOn element that is neither an event name nor Flow.entry (Compile R4)
        off: { schedule: "1 second", send: E.Flip, armOn: [5] },
      },
    },
  },
}));

void machine(Lamp, ({ S, E }) => ({
  default: S.OFF,
  states: {
    OFF: {
      schedules: {
        // @ts-expect-error a fixed delay that is not a Duration input (Compile R4; construction.test pairs it)
        off: { schedule: { sec: 5 }, send: E.Flip },
      },
    },
  },
}));
