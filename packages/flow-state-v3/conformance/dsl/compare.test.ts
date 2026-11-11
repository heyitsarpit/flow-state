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

const known: Known = { reference: referenceFor([Pay]), rows: rowsFor([Pay]) };

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
