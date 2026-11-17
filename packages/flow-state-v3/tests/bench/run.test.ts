import { describe, expect, it } from "vite-plus/test";
import { timeStory } from "../../bench/time.ts";
import { long } from "../../fixtures/transfers/stories/usual.ts";

describe("bench", () => {
  it("every timed run of the long Story does the turns a tested run does, in order (Stories I18)", async () => {
    const tested = (await long.run()).evidence.filter((e) => e._tag === "Turn");
    const timed = await timeStory(long, 3);

    expect(tested.length).toBeGreaterThan(0);
    expect(timed).toHaveLength(3);

    for (const run of timed) expect(run.turns).toEqual(tested);
  });
});
