import { DateTime, Option, Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

const Bill = { payee: Schema.String, due: Schema.String };

type Bills = ReadonlyArray<{ readonly payee: string; readonly due: string }>;

// When a payee's bill is due, in Runtime Clock milliseconds, read from the date text the bank
// sends ("1970-01-02"); a date the app cannot read throws, as a parser does.
const dueOf = (bills: Bills, payee: string) =>
  Option.match(DateTime.make(bills.find((b) => b.payee === payee)?.due ?? ""), {
    onNone: () => {
      throw new Error(`unreadable due date for ${payee}`);
    },
    onSome: DateTime.toEpochMillis,
  });

/**
 * A customer's bill reminders, named by the customer: the bills the bank lists, each a payee and
 * a due date as text; whether the customer has snoozed reminders; and when each payee was last
 * reminded.
 */
export const BillReminders = definition({
  id: "Bank/BillReminders",
  persist: true,
  states: ["ON"],
  events: {
    BillsListed: { bills: Schema.Array(Schema.Struct(Bill)) },
    Paid: { payee: Schema.String },
    Snooze: {},
    Unsnooze: {},
  },
  internalEvents: { Reminded: { payee: Schema.String, at: Schema.Number } },
  memory: {
    customer: Flow.input(Schema.String),
    bills: Flow.initial(Schema.Array(Schema.Struct(Bill)), []),
    snoozed: Flow.initial(Schema.Boolean, false),
    reminded: Flow.initial(Schema.Record(Schema.String, Schema.Number), {}),
  },
  schedules: {
    remind: { key: { payee: Schema.String }, pausedBy: ["Snoozed"], restartOn: Schema.Number },
  },
});

/**
 * The reminders: each listed bill is reminded when it falls due, held while the customer has
 * snoozed reminders, and started again when its due date moves; a paid bill leaves the list. A
 * bill due further out than the longest timer, or a due date the app cannot read, is that bill's
 * issue: a far one is tried again on every change, and starts at the first once it is in range.
 */
export const BillRemindersMachine = machine(BillReminders, ({ S, E }) => ({
  default: S.ON,
  on: {
    BillsListed: { updateMemory: ({ event }) => ({ bills: event.bills }) },
    Paid: {
      updateMemory: ({ event, memory }) => ({
        bills: memory.bills.filter((b) => b.payee !== event.payee),
      }),
    },
    Snooze: { updateMemory: () => ({ snoozed: true }) },
    Unsnooze: { updateMemory: () => ({ snoozed: false }) },
    Reminded: {
      updateMemory: ({ event, memory }) => ({
        reminded: { ...memory.reminded, [event.payee]: event.at },
      }),
    },
  },
  states: {
    ON: {
      schedules: {
        remind: {
          keys: ({ memory }) => memory.bills.map((b) => ({ payee: b.payee })),
          schedule: ({ key, memory, now }) => dueOf(memory.bills, key.payee) - now,
          restartOn: ({ key, memory }) => dueOf(memory.bills, key.payee),
          paused: { Snoozed: ({ memory }) => memory.snoozed },
          send: E.Reminded.from(({ key, firedAt }) => ({ payee: key.payee, at: firedAt })),
        },
      },
    },
  },
}));
