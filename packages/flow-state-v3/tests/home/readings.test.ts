import { describe, expect, it } from "vite-plus/test";
import { loungeCard } from "../../fixtures/home/app.ts";
import { Sensors } from "../../fixtures/home/server/sensors.ts";
import {
  cardUsual,
  disposedMidRead,
  releaseMeetsSchedule,
} from "../../fixtures/home/stories/readings.ts";
import type { Cut } from "../../src/host/testing/index.ts";

// The thermometer card: a placed read refreshed by a schedule (Operations Q2: a refetch on an
// interval is a schedule running `O.x.refetch()`), and a released reading whose `Release` alarm
// shares an instant with a `Schedule` alarm (Changes Q9; kind order A, Release before Schedule,
// kept by the turn walk's tag).

describe("the thermometer card (Operations O2, Q2; R8)", () => {
  it("Operations O2, Q2: the card's placed reading shows at once, and its scheduled refresh reads the warmer room", async () => {
    const run = await cardUsual.run();

    expect(run.checkpoints.shown.read(loungeCard)?.memory.celsius).toBe(19);
    expect(run.checkpoints.refreshed.read(Sensors.reading)).toHaveLength(2);
    expect(run.checkpoints.refreshed.read(loungeCard)?.memory.celsius).toBe(22);
  });

  it("Operations R8, Releases (placements' build-time choice): a disposal during a placement's read releases it within the disposal bound, at once", async () => {
    const run = await disposedMidRead.run();

    expect(run.checkpoints.reading.read(Sensors.reading).map((c) => c.status)).toEqual([
      "held at request",
    ]);
    // Nothing waits on the stopped reading: released later, its answer reaches no one.
    expect(run.checkpoints.released.read(Sensors.reading).map((c) => c.status)).toEqual([
      "handled",
    ]);
    expect(run.checkpoints.disposed.now - run.checkpoints.reading.now).toBe(0);
    expect(run.evidence.filter((e) => e._tag === "RuntimeDisposed")).toHaveLength(1);
  });

  it("Changes Q9 (deciding), Operations R8, I11, I22: a Release and a Schedule alarm at one instant: the card is back, holds the key, and shows one ReleaseOverdue until the reading ends, whichever alarm is taken first (the Release writes no state)", async () => {
    const run = await releaseMeetsSchedule.run();

    const shown = (cut: Cut) => ({
      state: cut.read(loungeCard)?.state,
      codes: (cut.read(loungeCard)?.issues ?? []).map((i) => i.code),
    });

    expect([run.checkpoints.away, run.checkpoints.met, run.checkpoints.ended].map(shown)).toEqual([
      { state: "AWAY", codes: [] },
      { state: "SHOWN", codes: ["ReleaseOverdue"] },
      { state: "SHOWN", codes: [] },
    ]);
  });
});
