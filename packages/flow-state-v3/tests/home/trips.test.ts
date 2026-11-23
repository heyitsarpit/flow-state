import { describe, expect, it } from "vite-plus/test";
import { house, trip } from "../../fixtures/home/app.ts";
import { tripPastLongest } from "../../fixtures/home/stories/edges.ts";
import { tripBooked } from "../../fixtures/home/stories/usual.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import { played } from "../rules/played.ts";
import { timersOf } from "../timers.ts";

// A trip sends the house its vacation: an actor's send, which its sender cannot send again.

const houseAt = (cut: Cut) => {
  const snapshot = cut.read(house);

  return {
    state: snapshot?.state,
    timers: timersOf(snapshot),
    issues: (snapshot?.issues ?? []).map(
      (i) => `${String(i.path.at(-1))} ${String(i.details["slot"])}`,
    ),
  };
};

describe("a trip puts the house on vacation (Schedules R11; Changes R1)", () => {
  it("Schedules R11: a booked trip's vacation arms the homecoming at the trip's return, and the house is home at it", async () => {
    const run = await played(tripBooked);

    expect([houseAt(run.checkpoints.booked), houseAt(run.checkpoints.back)]).toEqual([
      { state: "VACATION", timers: { homecoming: { dueAt: 36_000_000 } }, issues: [] },
      { state: "HOME", timers: {}, issues: [] },
    ]);
    expect(run.checkpoints.back.read(trip("summer"))?.state).toBe("BOOKED");
  });

  it("Schedules R11: an actor's send whose own arm has a bad delay commits with the start refused and its issue; the same event sent by hand is refused whole", async () => {
    const run = await played(tripPastLongest);

    expect([houseAt(run.checkpoints.booked), houseAt(run.checkpoints["sent by hand"])]).toEqual([
      {
        state: "VACATION",
        timers: {},
        issues: ["schedule homecoming states.VACATION.schedules.homecoming.schedule"],
      },
      {
        state: "HOME",
        timers: {},
        issues: ["event StartVacation states.VACATION.schedules.homecoming.schedule"],
      },
    ]);
  });
});
