import { Effect } from "effect";
import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import { loungeTimer, musicTimedSetup, timerOf } from "../../fixtures/player/app.ts";
import { sleepTimerEdges } from "../../fixtures/player/stories/edges.ts";
import { sixteenTimers } from "../../fixtures/player/stories/load.ts";
import { after, LONGEST_MS, sleepTimer } from "../../fixtures/player/stories/usual.ts";
import { FlowError } from "../../src/index.ts";
import { played } from "../rules/played.ts";
import { loose } from "../loose.ts";

const invalidEvent = (error: unknown) =>
  error instanceof FlowError && error.code === "InvalidEvent";

describe("a sleep timer set by a Duration (Compile R14, Actors R14, Turn R14)", () => {
  it("Compile R14, Turn R14: a Set whose DurationFromMillis field holds a Duration arms the timer, which falls asleep at half an hour, not a millisecond before", async () => {
    const run = await played(sleepTimer);

    expect(run.checkpoints.armed.read(loungeTimer)).toEqual(
      expect.objectContaining({
        state: "ARMED",
        memory: expect.objectContaining({ after: after(1_800_000) }),
      }),
    );
    expect(run.checkpoints["just short"].read(loungeTimer)?.state).toBe("ARMED");
    expect(run.checkpoints.asleep.read(loungeTimer)?.state).toBe("ASLEEP");
    expect(run.checkpoints.cancelled.read(loungeTimer)).toEqual(
      expect.objectContaining({ state: "IDLE", memory: expect.objectContaining({ after: null }) }),
    );
  });

  it.fails("Turn R14 (fixtures.md E5): a computed delay of −1 ms counts as zero, so its timer is asleep on the next turn", async () => {
    const run = await played(sleepTimerEdges);

    expect(run.checkpoints.set.read(timerOf(2))?.state).toBe("ASLEEP");
  });

  it("Turn R14 (fixtures.md E5): a timer of 0 ms is asleep at once; one of 2^31 - 1 ms is armed a millisecond short and asleep at it; one of 2^31 ms refuses its Set's turn and stays idle", async () => {
    const run = await played(sleepTimerEdges);

    expect(run.checkpoints.set.read(timerOf(0))?.state).toBe("ASLEEP");
    expect(run.checkpoints.set.read(timerOf(3))).toEqual(
      expect.objectContaining({ state: "IDLE", memory: expect.objectContaining({ after: null }) }),
    );
    expect(run.checkpoints["just short"].read(timerOf(1))?.state).toBe("ARMED");
    expect(run.checkpoints.asleep.read(timerOf(1))).toEqual(
      expect.objectContaining({
        state: "ASLEEP",
        memory: expect.objectContaining({ after: after(LONGEST_MS) }),
      }),
    );
  });

  it("Turn R14 (fixtures.md L1): of sixteen timers set for n minutes, all are asleep after sixteen minutes", async () => {
    const run = await played(sixteenTimers);

    for (const n of [0, 1, 15]) expect(run.checkpoints.end.read(timerOf(n))?.state).toBe("ASLEEP");
  });

  it("E2, E7, Actors R14, Compile R14: a duration that is null, undefined, or the milliseconds the field encodes to is refused InvalidEvent", () => {
    const runtime = musicTimedSetup.construct();
    Effect.runSync(runtime.ready());
    const handle = runtime.ensureActor(loungeTimer);

    for (const value of [null, undefined, 1_800_000])
      assert.throws(() => handle.send(loose({ _tag: "Set", after: value })), invalidEvent);
  });
});
