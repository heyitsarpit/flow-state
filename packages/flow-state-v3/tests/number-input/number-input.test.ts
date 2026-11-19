import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import { defaults } from "../../fixtures/number-input/machines/stepping.ts";
import { quantity } from "../../fixtures/number-input/app.ts";
import { Stepper, StepperMachine } from "../../fixtures/number-input/machines/stepper.ts";
import { bounded, numberStory, usual } from "../../fixtures/number-input/stories/usual.ts";
import { actorRef } from "../../src/index.ts";
import { publishedOf, type Cut, type StoryRun } from "../../src/host/testing/index.ts";
import { played } from "../rules/played.ts";

const E = Stepper.E;

const other = actorRef(StepperMachine, "other");

// A cut without the stepper fails the test.
const field = (cut: Cut, ref = quantity) => {
  const snapshot = cut.read(ref);
  assert.ok(snapshot !== undefined, "the stepper has no snapshot at this cut");

  return snapshot.memory;
};

const published = (run: StoryRun) => publishedOf(run, quantity).map((p) => p.memory);

const stateOf = (cut: Cut) => cut.read(quantity)?.state;

const denials = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Denied" ? [`${e.event} ${e.reasons.join(",")}`] : []));

const configured = (id: string, settings: Partial<typeof defaults>) =>
  numberStory(id)
    .ensure(quantity)
    .send(quantity, E.Configure({ settings: { ...defaults, ...settings } }));

describe("number input: ported cases", () => {
  it("NUMBER-1: a + at its bound is denied AtBound, a disabled field's + is denied Disabled, and − at the bound still steps (Turn R2, R12)", async () => {
    const atMax = await played(
      configured("NUMBER-1/at-max", { max: 10 })
        .send(quantity, E.Set({ value: 10 }))
        .send(quantity, E.Press({ direction: 1, size: "step" }))
        .checkpoint("refused")
        .send(quantity, E.Press({ direction: -1, size: "step" }))
        .send(quantity, E.Release())
        .checkpoint("down"),
    );

    expect(denials(atMax)).toEqual(["Press AtBound"]);
    expect(field(atMax.checkpoints.refused).value).toBe(10);
    expect(field(atMax.checkpoints.down).value).toBe(9);

    const disabled = await played(
      configured("NUMBER-1/disabled", { max: 10, disabled: true })
        .send(quantity, E.Set({ value: 5 }))
        .send(quantity, E.Press({ direction: 1, size: "step" }))
        .checkpoint("refused"),
    );

    expect(denials(disabled)).toEqual(["Press Disabled"]);
    expect(field(disabled.checkpoints.refused).value).toBe(5);
  });

  it("NUMBER-2: End goes to the highest value on the step grid, + is then at its bound, and a small step still moves (Turn R2)", async () => {
    const run = await played(
      configured("NUMBER-2", { min: 0, max: 10, step: 3 })
        .send(quantity, E.Set({ value: 3 }))
        .send(quantity, E.Key({ key: "End" }))
        .checkpoint("end")
        .send(quantity, E.Press({ direction: 1, size: "step" }))
        .send(quantity, E.Press({ direction: 1, size: "small" }))
        .send(quantity, E.Release())
        .checkpoint("small"),
    );

    expect(field(run.checkpoints.end).value).toBe(9);
    expect(denials(run)).toEqual(["Press AtBound"]);
    expect(field(run.checkpoints.small).value).toBe(9.3);
  });

  it("NUMBER-3: typing follows the value only while it is a number within the bounds, and leaving clamps and commits it", async () => {
    const run = await played(
      configured("NUMBER-3", { min: 1, max: 10 })
        .send(quantity, E.Set({ value: 5 }))
        .checkpoint("set")
        .send(quantity, E.Typed({ text: "7" }))
        .send(quantity, E.Typed({ text: "70" }))
        .checkpoint("typed")
        .send(quantity, E.Blur())
        .checkpoint("left"),
    );

    const after = published(run).slice(published(run).findLastIndex((m) => m.value === 5) + 1);
    const values = after.map((m) => m.value).filter((v, i, all) => i === 0 || v !== all[i - 1]);

    expect(field(run.checkpoints.typed)).toEqual(
      expect.objectContaining({ value: 7, draft: "70", lastCommit: { seq: 0, value: null } }),
    );
    expect(values).toEqual([7, 10]);
    expect(field(run.checkpoints.left)).toEqual(
      expect.objectContaining({ value: 10, draft: null, lastCommit: { seq: 1, value: 10 } }),
    );
  });

  it("NUMBER-4: a percent without a step keeps a typed percent and steps by one percent, ten for a large step (value only; the shown text is the view's)", async () => {
    const run = await played(
      configured("NUMBER-4", { percent: true })
        .send(quantity, E.Typed({ text: "25%" }))
        .send(quantity, E.Blur())
        .checkpoint("typed")
        .send(quantity, E.Press({ direction: 1, size: "step" }))
        .send(quantity, E.Release())
        .checkpoint("up")
        .send(quantity, E.StepBy({ direction: -1, size: "step" }))
        .send(quantity, E.StepBy({ direction: -1, size: "step" }))
        .checkpoint("down")
        .send(quantity, E.Press({ direction: 1, size: "large" }))
        .send(quantity, E.Release())
        .checkpoint("large"),
    );

    expect(field(run.checkpoints.typed).value).toBe(0.25);
    expect(field(run.checkpoints.up).value).toBe(0.26);
    expect(field(run.checkpoints.down).value).toBe(0.24);
    expect(field(run.checkpoints.large).value).toBe(0.34);
  });

  it("NUMBER-5: a percent showing two fraction digits keeps a typed 3.75%; with none it snaps to whole percents (value only)", async () => {
    const fine = await played(
      configured("NUMBER-5/fine", { percent: true, fractionDigits: 2 })
        .send(quantity, E.Typed({ text: "3.75%" }))
        .send(quantity, E.Blur())
        .checkpoint("left"),
    );

    const whole = await played(
      configured("NUMBER-5/whole", { percent: true })
        .send(quantity, E.Typed({ text: "3.75%" }))
        .send(quantity, E.Blur())
        .checkpoint("left"),
    );

    expect(field(fine.checkpoints.left).value).toBe(0.0375);
    expect(field(whole.checkpoints.left).value).toBe(0.04);
  });

  it("NUMBER-6: steps from empty start at 0, within the bounds", async () => {
    const run = await played(
      configured("NUMBER-6", { min: 5 })
        .send(quantity, E.StepBy({ direction: 1, size: "step" }))
        .ensure(other)
        .send(other, E.StepBy({ direction: -1, size: "step" }))
        .checkpoint("stepped"),
    );

    expect(field(run.checkpoints.stepped).value).toBe(5);
    expect(field(run.checkpoints.stepped, other).value).toBe(-1);
  });

  it("NUMBER-7: a commit after a value set from outside reports the user's change back to an earlier value", async () => {
    const run = await played(
      configured("NUMBER-7", {})
        .send(quantity, E.Set({ value: 4 }))
        .send(quantity, E.Typed({ text: "6" }))
        .send(quantity, E.Blur())
        .checkpoint("first")
        .send(quantity, E.Set({ value: 4 }))
        .send(quantity, E.Typed({ text: "6" }))
        .send(quantity, E.Blur())
        .checkpoint("second"),
    );

    expect(field(run.checkpoints.first).lastCommit).toEqual({ seq: 1, value: 6 });
    expect(field(run.checkpoints.second).lastCommit).toEqual({ seq: 2, value: 6 });
  });

  it("NUMBER-8: a controller step leaves nothing for the next blur to commit", async () => {
    const run = await played(
      configured("NUMBER-8", {})
        .send(quantity, E.Set({ value: 1 }))
        .send(quantity, E.StepBy({ direction: 1, size: "step" }))
        .send(quantity, E.Blur())
        .checkpoint("left"),
    );

    expect(field(run.checkpoints.left)).toEqual(
      expect.objectContaining({ value: 2, lastCommit: { seq: 0, value: null } }),
    );
  });
});

describe("number input: timers", () => {
  it("NUMBER-9: a held + steps at once, at 400 ms, then every 60 ms, and its release commits once (Turn R14, R15)", async () => {
    const run = await played(usual);
    const { held, released, wheeling, wheeled, typed, end } = run.checkpoints;

    expect(stateOf(held)).toBe("HOLD_REPEAT");
    expect(field(held)).toEqual(
      expect.objectContaining({ value: 17, lastCommit: { seq: 0, value: null } }),
    );
    expect(stateOf(released)).toBe("IDLE");
    expect(field(released).lastCommit).toEqual({ seq: 1, value: 17 });
    expect(stateOf(wheeling)).toBe("WHEELING");
    expect(field(wheeling)).toEqual(
      expect.objectContaining({ value: 14, lastCommit: { seq: 1, value: 17 } }),
    );
    expect(stateOf(wheeled)).toBe("IDLE");
    expect(field(wheeled).lastCommit).toEqual({ seq: 2, value: 14 });
    expect(field(typed).lastCommit).toEqual({ seq: 3, value: 12 });
    expect(field(end).lastCommit).toEqual({ seq: 4, value: 12 });
  });

  it("NUMBER-10: a hold that reaches the bound stops repeating at the next tick and commits once, on release (Turn R14)", async () => {
    const run = await played(
      configured("NUMBER-10", { max: 20 })
        .send(quantity, E.Set({ value: 18 }))
        .send(quantity, E.Press({ direction: 1, size: "step" }))
        .advance("399 millis")
        .checkpoint("399")
        .advance("1 millis")
        .checkpoint("400")
        .advance("59 millis")
        .checkpoint("459")
        .advance("1 millis")
        .checkpoint("460")
        .advance("1 second")
        .checkpoint("stopped")
        .send(quantity, E.Release())
        .checkpoint("later"),
    );

    const { stopped, later } = run.checkpoints;

    expect([stateOf(run.checkpoints["399"]), field(run.checkpoints["399"]).value]).toEqual([
      "HOLD_DELAY",
      19,
    ]);
    expect([stateOf(run.checkpoints["400"]), field(run.checkpoints["400"]).value]).toEqual([
      "HOLD_REPEAT",
      20,
    ]);
    expect(stateOf(run.checkpoints["459"])).toBe("HOLD_REPEAT");
    expect(stateOf(run.checkpoints["460"])).toBe("HOLD_STOPPED");
    expect(field(stopped)).toEqual(
      expect.objectContaining({ value: 20, lastCommit: { seq: 0, value: null } }),
    );
    expect(stateOf(later)).toBe("IDLE");
    expect(field(later).lastCommit).toEqual({ seq: 1, value: 20 });
  });

  it("NUMBER-11: leaving the field mid-wheel commits at once, and the wheel's timer dies with its state (Turn R14)", async () => {
    const run = await played(
      configured("NUMBER-11", bounded)
        .send(quantity, E.Set({ value: 5 }))
        .send(quantity, E.Wheel({ direction: 1 }))
        .advance("100 millis")
        .send(quantity, E.Blur())
        .checkpoint("left")
        .advance("1 second")
        .checkpoint("later"),
    );

    expect(stateOf(run.checkpoints.left)).toBe("IDLE");
    expect(field(run.checkpoints.left).lastCommit).toEqual({ seq: 1, value: 6 });
    expect(
      run.evidence.filter(
        (e) => (e._tag === "Turn" || e._tag === "Unhandled") && e.event === "WheelDue",
      ),
    ).toEqual([]);
    expect(field(run.checkpoints.later).lastCommit).toEqual({ seq: 1, value: 6 });
  });
});
