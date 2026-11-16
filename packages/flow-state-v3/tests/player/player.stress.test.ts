import { describe, expect, it } from "vite-plus/test";
import { stress } from "../../fixtures/player/stories.ts";
import { played } from "../rules/played.ts";

const LEAVES = new Set(["OFF", "ON.BUFFERING", "ON.PLAYING", "ON.PAUSED"]);

describe("player: stress", () => {
  it("forty listens publish only leaf states, and every tick turns from PLAYING (Turn R1, I1, R14)", async () => {
    const run = await played(stress);

    const states = run.evidence.flatMap((e) => (e._tag === "Published" ? [e.state] : []));

    const ticks = run.evidence.flatMap((e) =>
      e._tag === "Turn" && e.event === "Tick" ? [e.from] : [],
    );

    expect(stress.steps.length).toBeGreaterThanOrEqual(250);
    expect(states.filter((s) => !LEAVES.has(s))).toEqual([]);
    expect(ticks.length).toBeGreaterThan(40);
    expect(new Set(ticks)).toEqual(new Set(["ON.PLAYING"]));
  });
});
