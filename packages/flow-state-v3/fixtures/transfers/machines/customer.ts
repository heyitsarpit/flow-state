import { DateTime, Option, Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

const Bill = { payee: Schema.String, due: Schema.String };

const Bills = Schema.Array(Schema.Struct(Bill));

// When a payee's bill is due, in Runtime Clock milliseconds, read from the date text the bank
// sends ("1970-01-02"); a date the app cannot read throws, as a parser does.
const dueOf = (bills: typeof Bills.Type, payee: string) =>
  Option.match(DateTime.make(bills.find((b) => b.payee === payee)?.due ?? ""), {
    onNone: () => {
      throw new Error(`unreadable due date for ${payee}`);
    },
    onSome: DateTime.toEpochMillis,
  });

/**
 * The signed-in bank customer: the account they send from, none until chosen, which they provide
 * to every form; and their bill reminders: the bills the bank lists, each a payee and a due date
 * as text, whether they have snoozed reminders, and when each payee was last reminded.
 */
export const Customer = definition({
  id: "Bank/Customer",
  persist: true,
  states: ["ACTIVE"],
  events: {
    Choose: { account: Schema.String },
    BillsListed: { bills: Bills },
    Paid: { payee: Schema.String },
    Snooze: {},
    Unsnooze: {},
  },
  internalEvents: { Reminded: { payee: Schema.String, at: Schema.Number } },
  memory: {
    account: Flow.initial(Schema.String, ""),
    bills: Flow.initial(Bills, []),
    snoozed: Flow.initial(Schema.Boolean, false),
    reminded: Flow.initial(Schema.Record(Schema.String, Schema.Number), {}),
  },
  schedules: {
    remind: { key: { payee: Schema.String }, pausedBy: ["Snoozed"], restartOn: Schema.Number },
  },
});

/**
 * The customer: choosing an account makes it the one their forms send from. Each listed bill is
 * reminded when it falls due, held while the customer has snoozed reminders, and started again
 * when its due date moves; a paid bill leaves the list. A bill due further out than the longest
 * timer, or a due date the app cannot read, is that bill's issue: a far one is tried again on
 * every occasion, and starts on the next one once it is in range.
 */
export const CustomerMachine = machine(Customer, ({ S, E }) => ({
  default: S.ACTIVE,
  on: {
    Choose: { updateMemory: ({ event }) => ({ account: event.account }) },
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
    ACTIVE: {
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
