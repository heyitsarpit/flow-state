import { Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { definition, Flow, transaction } from "../../src/index.ts";
import { refusal } from "../refusals.ts";

// Builds every definition inside its test: a check that refused every unknown: target alike would
// otherwise fail this file's loading, never one of its tests.

const save = transaction({
  id: "Compile/save",
  input: { id: Schema.String },
  key: ["id"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.void,
});

describe("operations declared once (Compile R9, I10, I11, T3)", () => {
  it("an unknown: target that is not Flow.uncertain is UnknownNotUncertain; two writes of one contract are SharedContract", () => {
    expect(
      refusal(() =>
        definition({
          id: "Compile/Ops",
          states: ["A"],
          events: {},
          internalEvents: { Saved: {}, Unsure: Flow.uncertain({}) },
          operations: ({ E }) => ({
            // @ts-expect-error Compile R9: a certain event is no unknown target; the run-time refusal is checked below
            first: save.outcomes({ success: E.Saved, failure: {}, unknown: E.Saved }),
            second: save.outcomes({ success: E.Saved, failure: {}, unknown: E.Unsure }),
          }),
        }),
      ),
    ).toEqual([
      ["UnknownNotUncertain", "operations.first.unknown"],
      ["SharedContract", "operations.second"],
    ]);
  });

  it("Compile R9: a Flow.uncertain unknown: target is accepted", () => {
    expect(
      refusal(() =>
        definition({
          id: "Compile/Uncertain",
          states: ["A"],
          events: {},
          internalEvents: { Saved: {}, Unsure: Flow.uncertain({}) },
          operations: ({ E }) => ({
            save: save.outcomes({ success: E.Saved, failure: {}, unknown: E.Unsure }),
          }),
        }),
      ),
    ).toEqual([]);
  });
});
