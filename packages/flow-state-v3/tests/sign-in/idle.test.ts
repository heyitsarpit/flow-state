import { describe, expect, it } from "vite-plus/test";
import { idleOf, mainIdle } from "../../fixtures/sign-in/app.ts";
import {
  idleManySessions,
  idleNeverReturns,
  idlePolicyRefused,
  idleRefusedSignOut,
  idleUsual,
  SESSIONS,
} from "../../fixtures/sign-in/stories/idle.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { played } from "../rules/played.ts";
import { timersOf } from "../timers.ts";

// The idle sign-out: a refused wait tried again on every occasion and saved, an activity count's
// baseline kept across a reload, and issues that go with their state (Schedules R1, R3, R5, R11,
// R14). Expected views are the Spec's tables, worked by hand at each checkpoint.

const SLOT = {
  arming: "states.SIGNED_IN.schedules.idle.schedule",
  restartOn: "states.SIGNED_IN.schedules.idle.restartOn",
} as const;

// The idle sign-out at a checkpoint: its state, its timer and its issues as `source slot`.
const at = (run: StoryRun<string>, name: string) => {
  const snapshot = run.checkpoints[name]?.read(mainIdle);

  return {
    state: snapshot?.state,
    timers: timersOf(snapshot),
    issues: (snapshot?.issues ?? []).map(
      (i) => `${String(i.path.at(-1))} ${String(i.details["slot"])}`,
    ),
  };
};

describe("the idle sign-out (Schedules R1, R3, R5, R11, R14)", () => {
  it("Schedules R7, R12, R13: activity restarts the wait, fifteen idle minutes sign the session out, and signing in again starts a new wait", async () => {
    const run = await played(idleUsual);

    expect(["started", "active", "signed out", "signed in again"].map((n) => at(run, n))).toEqual([
      { state: "SIGNED_IN", timers: { idle: { dueAt: 900_000 } }, issues: [] },
      { state: "SIGNED_IN", timers: { idle: { dueAt: 1_500_000 } }, issues: [] },
      { state: "SIGNED_OUT", timers: {}, issues: [] },
      { state: "SIGNED_IN", timers: { idle: { dueAt: 2_400_000 } }, issues: [] },
    ]);
  });

  it("Schedules R3, T4: the sign-out that never comes back: a count read before an unreadable report and a reload still restarts the wait when the user is active again", async () => {
    const run = await played(idleNeverReturns);

    expect(
      ["watching", "unreadable", "reloaded", "active again", "signed out"].map((n) => at(run, n)),
    ).toEqual([
      { state: "SIGNED_IN", timers: {}, issues: [] },
      { state: "SIGNED_IN", timers: {}, issues: [`schedule idle ${SLOT.restartOn}`] },
      { state: "SIGNED_IN", timers: {}, issues: [`schedule idle ${SLOT.restartOn}`] },
      { state: "SIGNED_IN", timers: { idle: { dueAt: 960_000 } }, issues: [] },
      { state: "SIGNED_OUT", timers: {}, issues: [] },
    ]);
  });

  it("Schedules R1, R11, R14: a policy past the longest timer refuses the next wait with an issue, kept across a reload, and the next policy starts it", async () => {
    const run = await played(idlePolicyRefused);

    expect(["policy", "refused", "reloaded", "valid", "signed out"].map((n) => at(run, n))).toEqual(
      [
        { state: "SIGNED_IN", timers: { idle: { dueAt: 900_000 } }, issues: [] },
        { state: "SIGNED_IN", timers: {}, issues: [`schedule idle ${SLOT.arming}`] },
        { state: "SIGNED_IN", timers: {}, issues: [`schedule idle ${SLOT.arming}`] },
        { state: "SIGNED_IN", timers: { idle: { dueAt: 1_860_000 } }, issues: [] },
        { state: "SIGNED_OUT", timers: {}, issues: [] },
      ],
    );
  });

  it("Schedules R5, R13: a refused wait's issue goes with the active state when the session signs out", async () => {
    const run = await played(idleRefusedSignOut);

    expect(["refused", "signed out"].map((n) => at(run, n))).toEqual([
      { state: "SIGNED_IN", timers: {}, issues: [`schedule idle ${SLOT.arming}`] },
      { state: "SIGNED_OUT", timers: {}, issues: [] },
    ]);
  });

  it(`Schedules R3, R12: ${String(SESSIONS)} sessions keep their own waits across two reloads and are signed out together`, async () => {
    const run = await played(idleManySessions);

    const all = (name: "reloaded" | "signed out") =>
      Array.from({ length: SESSIONS }, (_, n) => {
        const snapshot = run.checkpoints[name].read(idleOf(n));

        return { state: snapshot?.state, timers: timersOf(snapshot) };
      });

    expect([all("reloaded"), all("signed out")]).toEqual([
      Array.from({ length: SESSIONS }, () => ({
        state: "SIGNED_IN",
        timers: { idle: { dueAt: 900_000 } },
      })),
      Array.from({ length: SESSIONS }, () => ({ state: "SIGNED_OUT", timers: {} })),
    ]);
  });
});
