import { describe, expect, it } from "vite-plus/test";
import { house } from "../../fixtures/home/app.ts";
import { House } from "../../fixtures/home/machines/house.ts";
import { homeStory } from "../../fixtures/home/stories/usual.ts";
import { refusedTurnIssueOnly } from "./refusals.ts";

// Turn I14's rule reads a schedule's refused start after a committed turn as that turn's issue,
// never a refusal; a turn's own arm refused later is still judged as its own refusal (Schedules
// R11). The run below has a committed turn, then a refused one whose snapshot is taken out.

describe("a refused turn after a committed one is judged on its own (Turn I14; Schedules R11)", () => {
  it("Turn I14: a vacation past the longest timer, refused after a committed turn, is a refusal: without its snapshot the rule reports it", async () => {
    const run = await homeStory("rules/refusal-window")
      .ensure(house)
      .send(house, House.E.Leave())
      .send(house, House.E.StartVacation({ until: 2 ** 31 }))
      .run();

    const refusal = run.evidence.findLastIndex((e) => e._tag === "Issue");
    const published = run.evidence.findIndex((e, n) => n > refusal && e._tag === "Published");
    const without = run.evidence.filter((_, n) => n !== published);

    expect(refusal).toBeGreaterThan(0);
    expect(refusedTurnIssueOnly.breaches(run)).toEqual([]);
    expect(refusedTurnIssueOnly.breaches({ ...run, evidence: without })).toEqual([
      `Turn I14: the refused event turn (evidence ${String(refusal)}) published 0 snapshots, not one`,
    ]);
  });
});
