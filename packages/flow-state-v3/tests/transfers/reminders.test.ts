import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { myBills } from "../../fixtures/transfers/app.ts";
import {
  BILLS,
  remindersFarBill,
  remindersFarPaid,
  remindersManyBills,
  remindersOldDate,
  remindersUsual,
} from "../../fixtures/transfers/stories/reminders.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { played } from "../rules/played.ts";
import { timersOf } from "../timers.ts";

// The bill reminders: a reminder too far out refused with an issue, saved and started at the first
// occasion once in range; a due date's baseline kept across a reload; issues that go with their
// bill (Schedules R1, R3, R5, R14). Expected views are the Spec's tables, worked by hand at each
// checkpoint; the Runtime Clock starts at 1970-01-01, so a date's milliseconds are its deadline.

const DAY = 86_400_000;

const SLOT = {
  arming: "states.ON.schedules.remind.schedule",
  restartOn: "states.ON.schedules.remind.restartOn",
} as const;

// FLOW_STATE_ALLOW_UNKNOWN: one timer as a snapshot shows it.
const shownOf = (one: unknown) => {
  const payee =
    Predicate.hasProperty(one, "key") && Predicate.hasProperty(one.key, "payee")
      ? String(one.key.payee)
      : "-";

  if (Predicate.hasProperty(one, "dueAt")) return [`${payee} due ${String(one.dueAt)}`];

  if (Predicate.hasProperty(one, "left") && Predicate.hasProperty(one, "pausedBy"))
    return [`${payee} held ${String(one.left)} ${String(one.pausedBy)}`];

  return [];
};

// The reminders at a checkpoint: their timers, their issues as `source slot` and who was reminded.
const at = (run: StoryRun<string>, name: string) => {
  const snapshot = run.checkpoints[name]?.read(myBills);
  const timers: unknown = timersOf(snapshot);
  const list: unknown = Predicate.hasProperty(timers, "remind") ? timers.remind : [];

  return {
    timers: (Array.isArray(list) ? Array.from<unknown>(list) : []).flatMap(shownOf).toSorted(),
    issues: (snapshot?.issues ?? []).map(
      (i) => `${String(i.path.at(-1))} ${String(i.details["slot"])}`,
    ),
    reminded: snapshot?.memory.reminded ?? {},
  };
};

const issueOf = (payee: string, slot: string) => `schedule remind {"payee":"${payee}"} ${slot}`;

describe("the bill reminders (Schedules R1, R3, R5, R14)", () => {
  it("Schedules R6, R7, R12: each bill reminded at its date, held by a snooze, started again when its date moves, gone when paid", async () => {
    const run = await played(remindersUsual);

    expect(
      ["listed", "power reminded", "snoozed", "unsnoozed", "moved", "paid"].map((n) => at(run, n)),
    ).toEqual([
      {
        timers: [`power due ${String(DAY)}`, `water due ${String(2 * DAY)}`],
        issues: [],
        reminded: {},
      },
      { timers: [`water due ${String(2 * DAY)}`], issues: [], reminded: { power: DAY } },
      { timers: [`water held ${String(DAY)} Snoozed`], issues: [], reminded: { power: DAY } },
      { timers: ["water due 176400000"], issues: [], reminded: { power: DAY } },
      { timers: [`water due ${String(3 * DAY)}`], issues: [], reminded: { power: DAY } },
      { timers: [], issues: [], reminded: { power: DAY } },
    ]);
  });

  it.fails("Schedules R3, T4: the reminder at the old date: a date read before an unreadable one and a reload still starts the reminder again when the date moves", async () => {
    const run = await played(remindersOldDate);

    expect(["unreadable", "reloaded", "moved", "reminded"].map((n) => at(run, n))).toEqual([
      {
        timers: [`rent due ${String(2 * DAY)}`],
        issues: [issueOf("rent", SLOT.restartOn)],
        reminded: {},
      },
      {
        timers: [`rent due ${String(2 * DAY)}`],
        issues: [issueOf("rent", SLOT.restartOn)],
        reminded: {},
      },
      { timers: [`rent due ${String(DAY)}`], issues: [], reminded: {} },
      { timers: [], issues: [], reminded: { rent: DAY } },
    ]);
  });

  it.fails("Schedules R1, R14: a reminder past the longest timer is refused with an issue, kept across a reload, and started at the first change once in range", async () => {
    const run = await played(remindersFarBill);

    expect(["refused", "reloaded", "in range", "reminded"].map((n) => at(run, n))).toEqual([
      { timers: [], issues: [issueOf("tax", SLOT.arming)], reminded: {} },
      { timers: [], issues: [issueOf("tax", SLOT.arming)], reminded: {} },
      {
        timers: [`gas due ${String(8 * DAY)}`, `tax due ${String(31 * DAY)}`],
        issues: [],
        reminded: {},
      },
      { timers: [], issues: [], reminded: { gas: 8 * DAY, tax: 31 * DAY } },
    ]);
  });

  it.fails("Schedules R5: a refused reminder's issue goes with its bill when it is paid", async () => {
    const run = await played(remindersFarPaid);

    expect(["refused", "paid"].map((n) => at(run, n))).toEqual([
      { timers: [], issues: [issueOf("tax", SLOT.arming)], reminded: {} },
      { timers: [], issues: [], reminded: {} },
    ]);
  });

  it(`Schedules R3, R6: ${String(BILLS)} bills held by a snooze keep their time left across two reloads and are reminded together`, async () => {
    const run = await played(remindersManyBills);
    const payees = Array.from({ length: BILLS }, (_, n) => `payee-${String(n)}`);
    const held = payees.map((p) => `${p} held ${String(DAY)} Snoozed`).toSorted();

    expect(["held", "reloaded", "reminded"].map((n) => at(run, n))).toEqual([
      { timers: held, issues: [], reminded: {} },
      { timers: held, issues: [], reminded: {} },
      { timers: [], issues: [], reminded: Object.fromEntries(payees.map((p) => [p, DAY])) },
    ]);
  });
});
