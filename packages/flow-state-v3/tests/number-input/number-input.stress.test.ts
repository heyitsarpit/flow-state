import { describe, expect, it } from "vite-plus/test";
import { quantity } from "../../fixtures/number-input/app.ts";
import { stress } from "../../fixtures/number-input/stories/usual.ts";
import { Stepper } from "../../fixtures/number-input/machines/stepper.ts";
import { publishedOf, turnsOf } from "../../src/host/testing/index.ts";
import { played } from "../rules/played.ts";

describe("number input: stress", () => {
  it("NUMBER-12: a hundred and fifty gestures keep every value within its bounds, and every commit is one per interaction and differs from its start", async () => {
    const run = await played(stress);
    const fields = publishedOf(run, quantity).map((p) => p.memory);

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

    expect(stress.steps.length).toBeGreaterThanOrEqual(300);
    expect(outOfBounds).toEqual([]);
    expect(wrong).toEqual([]);
    expect(commits.filter((c) => c.after.lastCommit.seq !== 0).length).toBeGreaterThan(10);
    expect(
      [Stepper.E.RepeatDue, Stepper.E.Tick, Stepper.E.WheelDue].map(
        (token) => turnsOf(run, token).length > 0,
      ),
    ).toEqual([true, true, true]);
  });
});
