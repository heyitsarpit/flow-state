import { samplesOf, Story } from "../../../src/host/testing/index.ts";
import { bankRemindingSetup, myBills } from "../app.ts";
import { Customer } from "../machines/customer.ts";
import { AccountsFake, BankFake } from "../server/layer.ts";

/**
 * The bank with each customer's bill reminders over its port fakes, the main customer's reminders
 * started at clock 0 (1970-01-01, the Runtime Clock's origin).
 */
export const remindersStory = (id: string) =>
  Story.app(bankRemindingSetup, { id, fixtures: [BankFake, AccountsFake] }).ensure(myBills);

const listed = (...bills: ReadonlyArray<readonly [string, string]>) =>
  Customer.E.BillsListed({ bills: bills.map(([payee, due]) => ({ payee, due })) });

/**
 * Power is due in a day and water in two: power is reminded at its date; a snooze holds water's
 * reminder and an unsnooze an hour later resumes it; water's date moves a day later and its
 * reminder starts again; paid, it leaves.
 */
export const remindersUsual = remindersStory("transfers/reminders-usual")
  .send(myBills, listed(["power", "1970-01-02"], ["water", "1970-01-03"]))
  .checkpoint("listed")
  .advance("1 day")
  .checkpoint("power reminded")
  .send(myBills, Customer.E.Snooze())
  .checkpoint("snoozed")
  .advance("1 hour")
  .send(myBills, Customer.E.Unsnooze())
  .checkpoint("unsnoozed")
  .send(myBills, listed(["power", "1970-01-02"], ["water", "1970-01-04"]))
  .checkpoint("moved")
  .send(myBills, Customer.E.Paid({ payee: "water" }))
  .checkpoint("paid");

/**
 * The reminder at the old date: rent's due date arrives unreadable once, the page reloads, and the
 * bank lists rent a day earlier. Right ending: its reminder starts again for the new date. Wrong
 * ending: the reload forgets the date the app last read, the new date is taken as a first reading,
 * and rent is reminded a day late, at the old date.
 */
export const remindersOldDate = remindersStory("transfers/reminders-old-date")
  .send(myBills, listed(["rent", "1970-01-03"]))
  .advance("1 hour")
  .send(myBills, listed(["rent", "the third"]))
  .checkpoint("unreadable")
  .reload()
  .ensure(myBills)
  .checkpoint("reloaded")
  .send(myBills, listed(["rent", "1970-01-02"]))
  .checkpoint("moved")
  .advance("1 day")
  .checkpoint("reminded");

/**
 * A tax bill due in 31 days, further out than the longest timer: its reminder is refused with an
 * issue, which stands across a reload; a week later, when the bank lists a gas bill beside it, the
 * tax reminder is in range and starts; both are reminded on their dates.
 */
export const remindersFarBill = remindersStory("transfers/reminders-far-bill")
  .send(myBills, listed(["tax", "1970-02-01"]))
  .checkpoint("refused")
  .reload()
  .ensure(myBills)
  .checkpoint("reloaded")
  .advance("7 days")
  .send(myBills, listed(["tax", "1970-02-01"], ["gas", "1970-01-09"]))
  .checkpoint("in range")
  .advance("24 days")
  .checkpoint("reminded");

/**
 * A far bill's issue goes with the bill: paid, it shows nothing.
 */
export const remindersFarPaid = remindersStory("transfers/reminders-far-paid")
  .send(myBills, listed(["tax", "1970-02-01"]))
  .checkpoint("refused")
  .send(myBills, Customer.E.Paid({ payee: "tax" }))
  .checkpoint("paid");

/**
 * How many bills the load Story lists: a first guess, to be measured on the bench.
 */
export const BILLS = 64;

const payees = Array.from({ length: BILLS }, (_, n) => `payee-${String(n)}`);

/**
 * Many bills due tomorrow, held together by a snooze through two reloads, resumed together and
 * reminded together (S2 × 64 bills under L1 and L4).
 */
export const remindersManyBills = remindersStory("transfers/reminders-many-bills")
  .send(myBills, listed(...payees.map((p) => [p, "1970-01-02"] as const)))
  .send(myBills, Customer.E.Snooze())
  .checkpoint("held")
  .reload()
  .ensure(myBills)
  .reload()
  .ensure(myBills)
  .checkpoint("reloaded")
  .send(myBills, Customer.E.Unsnooze())
  .advance("1 day")
  .checkpoint("reminded");

/**
 * What the bank and the customer can do around the reminders, for generated runs: bills listed
 * due tomorrow, now, a millisecond ago, a day ago, at the longest timer and a millisecond past it,
 * a month out, and unreadable, none at all; a bill paid; snoozes.
 */
export const reminderSamples = samplesOf({
  id: "bank-reminders",
  story: remindersStory("bank-reminders/samples"),
  names: { setup: "bankRemindingSetup", fixtures: ["BankFake", "AccountsFake"] },
  actors: { myBills },
  servers: {},
  failures: [],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(myBills, listed(["power", "1970-01-02"], ["water", "1970-01-03"]))
      .send(myBills, listed(["now", "1970-01-01T00:00:00.000Z"]))
      .send(myBills, listed(["just", "1969-12-31T23:59:59.999Z"]))
      .send(myBills, listed(["power", "1970-01-25T20:31:23.647Z"]))
      .send(myBills, listed(["power", "1970-01-25T20:31:23.648Z"]))
      .send(myBills, listed(["tax", "1970-02-01"]))
      .send(myBills, listed(["late", "1969-12-31"]))
      .send(myBills, listed(["rent", "the third"]))
      .send(myBills, listed())
      .send(myBills, Customer.E.Paid({ payee: "power" }))
      .send(myBills, Customer.E.Snooze())
      .send(myBills, Customer.E.Unsnooze()),
});

/**
 * Every named Story of the bill reminders.
 */
export const reminderStories = {
  remindersUsual,
  remindersOldDate,
  remindersFarBill,
  remindersFarPaid,
  remindersManyBills,
};
