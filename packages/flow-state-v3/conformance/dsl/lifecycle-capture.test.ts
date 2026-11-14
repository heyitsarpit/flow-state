import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { rolledBack, wrote } from "./lifecycle-capture.ts";
import { apply } from "./lifecycle-fold.ts";
import { type Life, LifeMove } from "./lifecycle-model.ts";
import { CL, ending, named, OW, PK } from "./lifecycle-lives.traces.ts";
import { build } from "./lifecycle-trace.ts";

const { model } = build;

const restored = (life: Life) => rolledBack(wrote(model([], { endings: [ending(life)] }), "flush"));

const livesOf = (life: Life) => restored(life).endings.map((e) => e.life._tag);

describe("a row's fate in the step whose batch landed is exact (WriteAhead I21, I22)", () => {
  it("a kill restores each row as the batch the step wrote holds it, never a bound", () => {
    assert.deepEqual(livesOf(CL), ["Closed"]);
    assert.deepEqual(livesOf(OW), ["Owed"]);
    assert.deepEqual(livesOf(PK), ["Parked"]);
  });

  it("a doubled delivery of a row the landed batch holds as heard is refused", () => {
    const [, refusals] = apply(restored(CL), LifeMove.Delivered({ ending: named }));

    assert.deepEqual(
      refusals.map((r) => r.invariant),
      ["WriteLanes I15"],
    );
  });

  it("a row the landed batch holds as owed is still owed, so dropping it is a lost delivery", () => {
    const [, refusals] = apply(restored(PK), LifeMove.Delivered({ ending: named }));

    assert.deepEqual(refusals, []);
    assert.ok(restored(PK).endings.every((e) => e.life._tag !== "Maybe"));
  });
});
