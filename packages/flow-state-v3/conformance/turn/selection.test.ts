import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { parts } from "../../fixtures/index.ts";
import { partFixture } from "../parts/reference.ts";
import { Fact } from "../dsl/oracle.ts";
import { Observation } from "../port.ts";
import { actorIn } from "./anchor.ts";
import { anchorAt, judgedStep } from "./selection.ts";

const pay = parts.find((p) => p.name === "pay");

assert.ok(pay !== undefined);

const actor = { machine: pay.machine.compiled.id, id: "shopper-1" };
const machines = { [actor.machine]: partFixture(pay).handlers };

const turn = (event: string, from: string, to: string, at: string) => [
  Fact.Drove({ actor, event, to: { _tag: "Root" }, labels: {} }),
  Fact.Reported({
    observation: Observation.Turn({
      actor,
      event,
      from,
      to,
      parts: [{ part: [], definition: actor.machine, at, node: "root", target: to }],
      members: [],
    }),
  }),
];

const flushed = [Fact.Wrote({ bytes: 1 }), Fact.Purposed({ purpose: "flush" })];
const held = [Fact.Wrote({ bytes: 1 }), Fact.Purposed({ purpose: "capture" })];

const after = (steps: ReadonlyArray<ReadonlyArray<Fact>>) =>
  steps.reduce(
    (state, step) => judgedStep(state, step).state,
    anchorAt(machines, actor, "IDLE", []),
  );

describe("the leaves a kill may restore (Turn I2; WriteAhead R10, I10)", () => {
  it("a use of a disposed actor does not pin its record: the removal may not have landed", () => {
    const state = after([
      [...turn("Leave", "IDLE", "LEFT", "on.Leave[1]"), ...flushed],
      [Fact.Disposed({ actor })],
      [Fact.Ensured({ actor, use: "story" })],
      [...turn("Start", "IDLE", "CARD", "states.IDLE.on.Start[0]"), ...held],
      [Fact.Reloaded({ release: 1 })],
    ]);

    assert.deepEqual(actorIn(state, actor).allowed.toSorted(), ["CARD", "IDLE", "LEFT"]);
  });

  it("a second kill with no turn between keeps the leaves the first left uncertain", () => {
    const state = after([
      [...turn("Leave", "IDLE", "LEFT", "on.Leave[1]"), ...flushed],
      [...turn("Start", "LEFT", "CARD", "states.LEFT.on.Start[0]"), ...held],
      [Fact.Reloaded({ release: 1 })],
      [Fact.Reloaded({ release: 2 })],
    ]);

    assert.deepEqual(actorIn(state, actor).allowed.toSorted(), ["CARD", "LEFT"]);
  });

  it("the first turn after a kill pins the leaf it was restored at", () => {
    const state = after([
      [...turn("Leave", "IDLE", "LEFT", "on.Leave[1]"), ...flushed],
      [...turn("Start", "LEFT", "CARD", "states.LEFT.on.Start[0]"), ...held],
      [Fact.Reloaded({ release: 1 })],
      [...turn("PayRequested", "CARD", "PAYING", "on.PayRequested[1]"), ...held],
      [Fact.Reloaded({ release: 2 })],
    ]);

    assert.deepEqual(actorIn(state, actor).allowed.toSorted(), ["CARD", "PAYING"]);
  });
});
