import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import {
  atBound,
  defaults,
  Direction,
  parsed,
  Settings,
  Size,
  snapped,
  stepFrom,
  Value,
} from "./stepping.ts";

const Started = Schema.NullOr(Schema.Struct({ from: Value }));

const Commit = Schema.Struct({ seq: Schema.Number, value: Value });

export const Stepper = definition({
  id: "Number/Stepper",
  states: ["IDLE", "HOLD_DELAY", "HOLD_REPEAT", "HOLD_STOPPED", "WHEELING"],
  events: {
    Configure: { settings: Settings },
    Set: { value: Value },
    StepBy: { direction: Direction, size: Size },
    Press: { direction: Direction, size: Size },
    Release: {},
    Cancel: {},
    Wheel: { direction: Direction },
    Typed: { text: Schema.String },
    Blur: {},
    Key: { key: Schema.Literals(["Home", "End"]) },
  },
  internalEvents: { RepeatDue: {}, Tick: {}, WheelDue: {} },
  memory: {
    settings: Flow.initial(Settings, defaults),
    value: Flow.initial(Value, null),
    draft: Flow.initial(Schema.NullOr(Schema.String), null),
    started: Flow.initial(Started, null),
    held: Flow.initial(Schema.Struct({ direction: Direction, size: Size }), {
      direction: 1,
      size: "step",
    }),
    lastCommit: Flow.initial(Commit, { seq: 0, value: null }),
  },
});

/**
 * A field's memory, as its views read it.
 */
export type StepperMemory = typeof Stepper.Memory.Type;

type Memory = StepperMemory;

type Move = StepperMemory["held"];

const changed = (memory: Memory, value: Memory["value"]) => ({
  value,
  started: value === memory.value ? memory.started : (memory.started ?? { from: memory.value }),
});

const committed = (memory: Memory) => ({
  started: null,
  lastCommit:
    memory.started !== null && memory.started.from !== memory.value
      ? { seq: memory.lastCommit.seq + 1, value: memory.value }
      : memory.lastCommit,
});

const unlocked = ({ memory }: { readonly memory: Memory }) =>
  !memory.settings.disabled || deny("Disabled");

const free = (memory: Memory, move: Move) =>
  !atBound(memory.settings, memory.value, move.direction, move.size) || deny("AtBound");

const stepped = (memory: Memory, move: Move) => ({
  ...changed(memory, stepFrom(memory.settings, memory.value, move.direction, move.size)),
  draft: null,
  held: move,
});

const typed = (memory: Memory, text: string) => {
  const n = parsed(memory.settings, text);
  const { min, max } = memory.settings;

  if (text.trim() === "") return { draft: text, ...changed(memory, null) };

  return n !== null && n >= (min ?? n) && n <= (max ?? n)
    ? { draft: text, ...changed(memory, n) }
    : { draft: text };
};

const typedValue = (memory: Memory, draft: string) => {
  if (draft.trim() === "") return null;
  const n = parsed(memory.settings, draft);

  return n === null ? memory.value : snapped(memory.settings, n);
};

const left = (memory: Memory) => {
  const value = memory.draft === null ? memory.value : typedValue(memory, memory.draft);
  const after = { ...memory, ...changed(memory, value), draft: null };

  return { ...after, ...committed(after) };
};

const boundOf = (memory: Memory, key: "Home" | "End") =>
  key === "Home" ? memory.settings.min : memory.settings.max;

/**
 * A number field with − and + buttons: a press steps once, a hold steps again at 400 ms and every
 * 60 ms after until a bound; the wheel steps when on and commits 300 ms after its last turn;
 * typing follows the value while it is a number within the bounds, and leaving the field clamps
 * and snaps it. A commit counts only when the value differs from where the interaction began.
 */
export const StepperMachine = machine(Stepper, ({ S, E }) => {
  const release = {
    target: S.IDLE,
    updateMemory: ({ memory }: { readonly memory: Memory }) => committed(memory),
  };

  const again = {
    guard: [unlocked, ({ memory }: { readonly memory: Memory }) => free(memory, memory.held)],
    updateMemory: ({ memory }: { readonly memory: Memory }) => stepped(memory, memory.held),
  };

  return {
    default: S.IDLE,
    on: {
      Configure: { updateMemory: ({ event }) => ({ settings: event.settings }) },
      Set: {
        updateMemory: ({ memory, event }) => ({
          value: event.value === null ? null : snapped(memory.settings, event.value),
          draft: null,
        }),
      },
      StepBy: {
        guard: [unlocked, ({ memory, event }) => free(memory, event)],
        updateMemory: ({ memory, event }) => ({
          value: stepFrom(memory.settings, memory.value, event.direction, event.size),
          draft: null,
        }),
      },
    },
    states: {
      IDLE: {
        on: {
          Press: {
            guard: [unlocked, ({ memory, event }) => free(memory, event)],
            target: S.HOLD_DELAY,
            updateMemory: ({ memory, event }) => stepped(memory, event),
          },
          Wheel: {
            guard: [
              ({ memory }) => memory.settings.wheel || deny("WheelOff"),
              unlocked,
              ({ memory, event }) => free(memory, { direction: event.direction, size: "step" }),
            ],
            target: S.WHEELING,
            updateMemory: ({ memory, event }) =>
              stepped(memory, { direction: event.direction, size: "step" }),
          },
          Typed: {
            guard: [unlocked],
            updateMemory: ({ memory, event }) => typed(memory, event.text),
          },
          Blur: { guard: [unlocked], updateMemory: ({ memory }) => left(memory) },
          Key: {
            guard: [
              unlocked,
              ({ memory, event }) => boundOf(memory, event.key) !== null || deny("NoBound"),
            ],
            updateMemory: ({ memory, event }) => {
              const bound = boundOf(memory, event.key) ?? 0;
              const value = event.key === "Home" ? bound : snapped(memory.settings, bound);
              const after = { ...memory, ...changed(memory, value), draft: null };

              return { ...after, ...committed(after) };
            },
          },
        },
      },
      HOLD_DELAY: {
        schedules: { delay: { schedule: "400 millis", send: E.RepeatDue } },
        on: {
          RepeatDue: [{ ...again, target: S.HOLD_REPEAT }, { target: S.HOLD_STOPPED }],
          Release: release,
          Cancel: release,
        },
      },
      HOLD_REPEAT: {
        schedules: {
          repeat: { schedule: "60 millis", send: E.Tick, armOn: [Flow.entry, "Tick"] },
        },
        on: { Tick: [again, { target: S.HOLD_STOPPED }], Release: release, Cancel: release },
      },
      HOLD_STOPPED: { on: { Release: release, Cancel: release } },
      WHEELING: {
        schedules: {
          settle: {
            schedule: "300 millis",
            send: E.WheelDue,
            armOn: [Flow.entry, "Wheel"],
          },
        },
        on: {
          Wheel: {
            guard: [
              unlocked,
              ({ memory, event }) => free(memory, { direction: event.direction, size: "step" }),
            ],
            updateMemory: ({ memory, event }) =>
              stepped(memory, { direction: event.direction, size: "step" }),
          },
          WheelDue: release,
          Blur: release,
        },
      },
    },
  };
});
