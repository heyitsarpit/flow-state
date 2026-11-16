import { describe, expect, it } from "vite-plus/test";
import { stress } from "../../fixtures/number-input/stories.ts";
import { played } from "../rules/played.ts";
import { published } from "./reads.ts";

describe("number input: stress", () => {
  it("NUMBER-12: a hundred and fifty gestures keep every value within its bounds, and every commit is one per interaction and differs from its start", async () => {
    const run = await played(stress);
    const fields = published(run);

    const outOfBounds = fields.filter(
      (m) =>
        m.value !== null &&
        (m.value < (m.settings.min ?? m.value) || m.value > (m.settings.max ?? m.value)),
    );

    const commits = fields.flatMap((m, i) => {
      const before = fields[i - 1];

      return before !== undefined && m.lastCommit.seq !== before.lastCommit.seq
        ? [{ before, after: m }]
        : [];
    });

    const wrong = commits.filter(
      ({ before, after }) =>
        after.lastCommit.seq !== 0 &&
        (after.lastCommit.seq !== before.lastCommit.seq + 1 ||
          (before.started === null ? before.value : before.started.from) ===
            after.lastCommit.value),
    );

    const fired = new Set(run.evidence.flatMap((e) => (e._tag === "Turn" ? [e.event] : [])));

    expect(stress.steps.length).toBeGreaterThanOrEqual(300);
    expect(outOfBounds).toEqual([]);
    expect(wrong).toEqual([]);
    expect(commits.filter((c) => c.after.lastCommit.seq !== 0).length).toBeGreaterThan(10);
    expect(["RepeatDue", "Tick", "WheelDue"].filter((e) => fired.has(e))).toEqual([
      "RepeatDue",
      "Tick",
      "WheelDue",
    ]);
  });
});
