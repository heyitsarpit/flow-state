import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { hall } from "../../fixtures/home/app.ts";
import { loungeFormatFive } from "../../fixtures/home/stories/edges.ts";
import {
  DEVICES,
  hubFirmwareReload,
  hubIntervalEdges,
  hubIntervalRefused,
  hubManyDevices,
  hubRefusedGone,
  hubUsual,
} from "../../fixtures/home/stories/hub.ts";
import { lounge } from "../../fixtures/home/stories/usual.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { played } from "../rules/played.ts";
import { timersOf } from "../timers.ts";

// The hub's pings: each device's timer, issues read from each timer's last check outcomes, a
// refused start tried again on every occasion and saved, and each check's last outcome kept
// across a reload (Schedules R1, R3, R5, R11, R14). Expected views are the Spec's tables, worked
// by hand at each checkpoint.

const SLOT = {
  arming: "states.ONLINE.schedules.ping.schedule",
  restartOn: "states.ONLINE.schedules.ping.restartOn",
} as const;

// FLOW_STATE_ALLOW_UNKNOWN: one timer as a snapshot shows it.
const shownOf = (one: unknown) => {
  const key =
    Predicate.hasProperty(one, "key") && Predicate.hasProperty(one.key, "id") ? one.key.id : "-";

  if (Predicate.hasProperty(one, "dueAt")) return [`${String(key)} due ${String(one.dueAt)}`];

  if (Predicate.hasProperty(one, "left") && Predicate.hasProperty(one, "pausedBy"))
    return [`${String(key)} held ${String(one.left)} ${String(one.pausedBy)}`];

  return [];
};

// The hub at a checkpoint: its timers, its issues as `key slot`, and its pings.
const at = (run: StoryRun<string>, name: string) => {
  const snapshot = run.checkpoints[name]?.read(hall);
  const timers: unknown = timersOf(snapshot);
  const list: unknown = Predicate.hasProperty(timers, "ping") ? timers.ping : [];

  return {
    timers: (Array.isArray(list) ? Array.from<unknown>(list) : []).flatMap(shownOf).toSorted(),
    issues: (snapshot?.issues ?? [])
      .map((i) => `${String(i.path.at(-1))} ${String(i.details["slot"])}`)
      .toSorted(),
    pings: snapshot?.memory.pings ?? {},
  };
};

const issueOf = (id: string, slot: string) => `schedule ping {"id":"${id}"} ${slot}`;

describe("the hub's pings (Schedules R1, R3, R5, R11, R14)", () => {
  it("Schedules R6, R7, R12: pings on each device's interval, held while away, restarted by a new major version, ended by unpairing", async () => {
    const run = await played(hubUsual);

    expect(
      ["paired", "pinged", "away", "still away", "home", "updated", "unpaired"].map((n) =>
        at(run, n),
      ),
    ).toEqual([
      { timers: ["cam due 60000", "lock due 30000"], issues: [], pings: {} },
      {
        timers: ["cam due 120000", "lock due 90000"],
        issues: [],
        pings: { cam: 60_000, lock: 60_000 },
      },
      {
        timers: ["cam held 50000 Away", "lock held 20000 Away"],
        issues: [],
        pings: { cam: 60_000, lock: 60_000 },
      },
      {
        timers: ["cam held 50000 Away", "lock held 20000 Away"],
        issues: [],
        pings: { cam: 60_000, lock: 60_000 },
      },
      {
        timers: ["cam due 720000", "lock due 690000"],
        issues: [],
        pings: { cam: 60_000, lock: 60_000 },
      },
      {
        timers: ["cam due 720000", "lock due 700000"],
        issues: [],
        pings: { cam: 60_000, lock: 60_000 },
      },
      { timers: ["lock due 820000"], issues: [], pings: { cam: 60_000, lock: 790_000 } },
    ]);
  });

  it("Schedules R3, T4: the ping that never comes back: a firmware version read before an unreadable report and a reload still restarts the lock's pings when it updates", async () => {
    const run = await played(hubFirmwareReload);

    expect(["quiet", "unreadable", "reloaded", "updated", "pinged"].map((n) => at(run, n))).toEqual(
      [
        { timers: [], issues: [], pings: {} },
        { timers: [], issues: [issueOf("lock", SLOT.restartOn)], pings: {} },
        { timers: [], issues: [issueOf("lock", SLOT.restartOn)], pings: {} },
        { timers: ["lock due 40000"], issues: [], pings: {} },
        { timers: ["lock due 70000"], issues: [], pings: { lock: 40_000 } },
      ],
    );
  });

  it("Schedules R1, R14: a refused interval keeps its issue across a reload and is armed once the camera reports a valid one", async () => {
    const run = await played(hubIntervalRefused);

    expect(["refused", "reloaded", "valid", "pinged"].map((n) => at(run, n))).toEqual([
      { timers: [], issues: [issueOf("cam", SLOT.arming)], pings: {} },
      { timers: [], issues: [issueOf("cam", SLOT.arming)], pings: {} },
      { timers: ["cam due 60000"], issues: [], pings: {} },
      { timers: ["cam due 120000"], issues: [], pings: { cam: 60_000 } },
    ]);
  });

  it("Schedules R5, R11: a refused start's issue goes when its device is unpaired, and Quiet ends a refused start with its issue", async () => {
    const run = await played(hubRefusedGone);

    expect(["refused", "unpaired", "refused again", "quiet"].map((n) => at(run, n))).toEqual([
      { timers: [], issues: [issueOf("cam", SLOT.arming)], pings: {} },
      { timers: [], issues: [], pings: {} },
      { timers: [], issues: [issueOf("cam", SLOT.arming)], pings: {} },
      { timers: [], issues: [], pings: {} },
    ]);
  });

  it("Schedules R11, R12: an interval of 2^31 − 1 ms is armed and pinged at it; 2^31 ms is refused with its issue", async () => {
    const run = await played(hubIntervalEdges);
    const longest = 2 ** 31 - 1;

    expect(["paired", "longest pinged"].map((n) => at(run, n))).toEqual([
      {
        timers: [`longest due ${String(longest)}`],
        issues: [issueOf("past", SLOT.arming)],
        pings: {},
      },
      {
        timers: [`longest due ${String(2 * longest)}`],
        issues: [issueOf("past", SLOT.arming)],
        pings: { longest },
      },
    ]);
  });

  it(`Schedules R3, R6: ${String(DEVICES)} devices held together keep their time left across a reload and are pinged together on arrival`, async () => {
    const run = await played(hubManyDevices);
    const ids = Array.from({ length: DEVICES }, (_, n) => `d${String(n)}`);
    const held = ids.map((id) => `${id} held 5000 Away`).toSorted();

    expect(["held", "reloaded", "pinged"].map((n) => at(run, n))).toEqual([
      { timers: held, issues: [], pings: {} },
      { timers: held, issues: [], pings: {} },
      {
        timers: ids.map((id) => `${id} due 20000`).toSorted(),
        issues: [],
        pings: Object.fromEntries(ids.map((id) => [id, 10_000])),
      },
    ]);
  });
});

// The lounge's saved record at a checkpoint: its format and its poll timers, wherever the
// record's body keeps the schedules of state ONLINE.
const savedLounge = (run: StoryRun<string>, name: string) => {
  const text = run.checkpoints[name]?.records.stored.get('actor/Home/Room/{"room":"lounge"}');
  const json: unknown = JSON.parse(text ?? "{}");
  const body: unknown = Predicate.hasProperty(json, "body") ? json.body : json;
  const schedules: unknown = Predicate.hasProperty(body, "schedules") ? body.schedules : {};
  const online: unknown = Predicate.hasProperty(schedules, "ONLINE") ? schedules.ONLINE : {};

  return {
    format: Predicate.hasProperty(json, "format") ? json.format : undefined,
    poll: Predicate.hasProperty(online, "poll") ? online.poll : undefined,
  };
};

describe("a room saved by a format-5 build (Schedules R14, its decode table; Records R12)", () => {
  it("Schedules R14: the lounge's format-5 record restores its held and due polls, frees the hold the house no longer holds, and is next saved as format 6", async () => {
    const run = await played(loungeFormatFive);
    const timers: unknown = timersOf(run.checkpoints.restored.read(lounge));

    const polls = (name: "motion polled" | "temperature polled") =>
      run.checkpoints[name].read(lounge)?.memory.polls;

    expect({
      restored: timers,
      saved: savedLounge(run, "saved"),
      polled: [polls("motion polled"), polls("temperature polled")],
    }).toMatchObject({
      restored: {
        poll: [
          { key: { id: "m1" }, dueAt: 10_000 },
          { key: { id: "t1" }, dueAt: 55_000 },
        ],
      },
      saved: {
        format: 6,
        poll: [
          { key: { id: "m1" }, selection: '"motion"', arming: { _tag: "Due", dueAt: 10_000 } },
          { key: { id: "m2" }, selection: '"motion"', arming: { _tag: "Due", dueAt: 10_000 } },
          { key: { id: "t1" }, selection: '"temperature"', arming: { _tag: "Due", dueAt: 55_000 } },
        ],
      },
      polled: [
        { m1: 10_000, m2: 10_000 },
        { m1: 50_000, m2: 50_000, t1: 55_000 },
      ],
    });
  });
});
