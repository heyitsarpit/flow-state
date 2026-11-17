import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

/**
 * The workspace calendar's visible range: the first and last day shown, as day numbers.
 */
export const Calendar = definition({
  id: "Workspace/Calendar",
  persist: true,
  states: ["OPEN"],
  events: { Show: { from: Schema.Number, to: Schema.Number } },
  memory: { from: Flow.initial(Schema.Number, 0), to: Flow.initial(Schema.Number, 0) },
});

/**
 * The calendar: showing a range replaces the one shown.
 */
export const CalendarMachine = machine(Calendar, ({ S }) => ({
  default: S.OPEN,
  on: { Show: { updateMemory: ({ event }) => ({ from: event.from, to: event.to }) } },
}));

const daysOf = (s: { readonly memory: { readonly from: number; readonly to: number } }) =>
  Array.from({ length: Math.max(0, s.memory.to - s.memory.from) }, (_, n) => s.memory.from + n);

const Days = Schema.Array(Schema.Number);

/**
 * The agenda beside the calendar: every day in the range it shows, thousands when the range is
 * long; it counts each change it hears, and is kept across reloads.
 */
export const Agenda = definition({
  id: "Workspace/Agenda",
  persist: true,
  states: ["SHOWN"],
  events: {},
  internalEvents: { Heard: {} },
  memory: { heard: Flow.initial(Schema.Number, 0) },
  context: { days: Calendar.Provider.select(Days, daysOf) },
});

/**
 * The agenda: each changed list of days is one more heard.
 */
export const AgendaMachine = machine(Agenda, ({ S, E }) => ({
  default: S.SHOWN,
  onContext: [{ select: ({ context }) => context.days, event: E.Heard }],
  on: { Heard: { updateMemory: ({ memory }) => ({ heard: memory.heard + 1 }) } },
}));

/**
 * A glance at the agenda in a popover: the same days, never saved.
 */
export const Peek = definition({
  id: "Workspace/Peek",
  persist: false,
  states: ["SHOWN"],
  events: {},
  internalEvents: { Heard: {} },
  memory: { heard: Flow.initial(Schema.Number, 0) },
  context: { days: Calendar.Provider.select(Days, daysOf) },
});

/**
 * The glance: each changed list of days is one more heard.
 */
export const PeekMachine = machine(Peek, ({ S, E }) => ({
  default: S.SHOWN,
  onContext: [{ select: ({ context }) => context.days, event: E.Heard }],
  on: { Heard: { updateMemory: ({ memory }) => ({ heard: memory.heard + 1 }) } },
}));
