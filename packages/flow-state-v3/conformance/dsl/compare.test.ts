import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Option } from "effect";
import { referenceFor, rowsFor } from "../fixtures/fixture.ts";
import { Pay } from "../fixtures/pay.ts";
import { type ActorRef, Observation } from "../port.ts";
import { empty } from "./lifecycle-model.ts";
import type { Known, Predicted } from "./lifecycle-owed.ts";
import { rules } from "./lifecycle-rules.ts";
import { step } from "./lifecycle-step.ts";
import { Fact } from "./oracle.ts";

const known: Known = { reference: referenceFor([Pay]), rows: rowsFor([Pay]), timed: {} };

const shopper: ActorRef = { machine: "Checkout/Pay", id: "s1" };

const KEY = { intentId: "pi1" };

const said = (observation: Observation) => Fact.Reported({ observation });

const leave = said(
  Observation.Turn({
    actor: shopper,
    event: "Leave",
    from: "CARD",
    to: "LEFT",
    parts: [],
    members: [],
  }),
);

/**
 * Selection's prediction of that `Leave`: the alternative that commits `void` ran, keyed by the
 * folded intent.
 */
const predicted: Predicted = {
  actor: shopper,
  event: "Leave",
  from: "CARD",
  to: "LEFT",
  at: Option.some("on.Leave[0]"),
  keys: { void: KEY },
  encodable: true,
};

const refusals = (facts: ReadonlyArray<Fact>, turns: ReadonlyArray<Predicted>) =>
  step(empty, known, facts, [], rules, turns).applied.flatMap((a) =>
    a.refusals.map((r) => r.invariant),
  );

describe("the compare half (Conformance R19, T38)", () => {
  it("refuses a runtime that omits an owed report: the commit the turn owes is never minted", () => {
    assert.deepStrictEqual(refusals([leave], [predicted]), ["WriteLanes I15"]);
  });

  it("refuses a runtime that adds a report the model neither owes nor allows", () => {
    const stray = said(
      Observation.Delivered({
        operation: "void",
        attempt: Option.some("v9"),
        event: "Voided",
        actor: Option.some(shopper),
      }),
    );

    assert.deepStrictEqual(refusals([stray], []), ["WriteLanes I15"]);
  });

  it("refuses a report that breaks a named cell: a mint outside any turn", () => {
    const minted = said(
      Observation.Minted({
        operation: "void",
        attempt: "v1",
        actor: Option.some(shopper),
        key: Option.some(KEY),
      }),
    );

    assert.deepStrictEqual(refusals([minted], []), ["WriteLanes I1"]);
  });

  it("accepts the report the prediction owes", () => {
    const minted = said(
      Observation.Minted({
        operation: "void",
        attempt: "v1",
        actor: Option.some(shopper),
        key: Option.some(KEY),
      }),
    );

    assert.deepStrictEqual(refusals([leave, minted], [predicted]), []);
  });
});

describe("an actor's incarnation and end, owed from the suite's facts (Actors R6, R8, I10, I37)", () => {
  const leaves = new Map([["Checkout/Pay s1", "IDLE"]]);
  const story = { actor: shopper, use: "story" as const };
  const incarnated = said(Observation.Incarnated({ actor: shopper }));
  const finished = said(Observation.Finished({ actor: shopper }));

  const walked = (steps: ReadonlyArray<ReadonlyArray<Fact>>) =>
    steps.reduce<{ readonly model: typeof empty; readonly found: ReadonlyArray<string> }>(
      (acc, facts) => {
        const life = step(acc.model, known, facts, [], rules, [], leaves);

        return {
          model: life.after,
          found: [...acc.found, ...life.applied.flatMap((a) => a.refusals.map((r) => r.invariant))],
        };
      },
      { model: empty, found: [] },
    ).found;

  it("refuses an ensure whose incarnation is never reported", () => {
    assert.deepStrictEqual(walked([[Fact.Ensured(story)]]), ["Actors I14"]);
  });

  it("owes the end of an actor free for the whole grace, and accepts it", () => {
    const opened = [Fact.Ensured(story), incarnated, Fact.Released(story)];

    assert.deepStrictEqual(walked([opened, [Fact.Advanced({ ms: 200 })]]), ["Actors I37"]);
    assert.deepStrictEqual(walked([opened, [Fact.Advanced({ ms: 200 }), finished]]), []);
  });

  it("owes no end before the grace is over, and refuses one while a use is held", () => {
    const opened = [Fact.Ensured(story), incarnated];

    assert.deepStrictEqual(
      walked([[...opened, Fact.Released(story)], [Fact.Advanced({ ms: 50 })]]),
      [],
    );
    assert.deepStrictEqual(walked([opened, [Fact.Advanced({ ms: 200 }), finished]]), [
      "Actors I10",
    ]);
  });
});
