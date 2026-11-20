import assert from "node:assert/strict";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { definition, Flow, FlowError, machine, transaction } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";

// Each diagnostic of a refused construction as [code, reason, path].
const refusal = (construct: () => unknown) => {
  try {
    construct();
  } catch (error) {
    if (error instanceof FlowError)
      return error.diagnostics.map(
        (d) => [d.code, d.details["reason"] ?? null, d.path.join(".")] as const,
      );

    throw error;
  }

  return [] as const;
};

// Untyped configuration, as a JavaScript caller would pass it.
const save = transaction({
  id: "Gaps/save",
  input: { id: Schema.String },
  key: ["id"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.void,
});

const Lamp = definition({
  id: "Gaps/Lamp",
  states: ["OFF", { ON: ["DIM", "BRIGHT"] }],
  events: { Flip: {} },
  internalEvents: { Saved: {}, Unsure: Flow.uncertain({}) },
  operations: ({ E }) => ({
    save: save.outcomes({ success: E.Saved, failure: {}, unknown: E.Unsure }),
  }),
});

describe("known gaps: invalid authoring refused, never a raw throw or a Defect (Diagnostics R1, R3, R6)", () => {
  const guarded = (guard: unknown) => () =>
    machine(Lamp, ({ S }) =>
      loose({
        default: S.OFF,
        on: { Flip: { target: S.ON, guard: [guard] } },
        states: { ON: { default: S.ON.DIM } },
      }),
    );

  it.fails("Diagnostics R1: O.save.retryable(undefined) in a guard is refused WrongKind at it, never a Defect from a raw TypeError", () => {
    expect(refusal(guarded(Lamp.O.save.retryable(loose(undefined))))).toEqual([
      ["InvalidConfiguration", "WrongKind", "on.Flip.0.guard.0"],
    ]);
  });

  it.fails("Diagnostics R1: O.save.retryable(5) in a guard is refused WrongKind at it, never accepted", () => {
    expect(refusal(guarded(Lamp.O.save.retryable(loose(5))))).toEqual([
      ["InvalidConfiguration", "WrongKind", "on.Flip.0.guard.0"],
    ]);
  });

  it.fails("Diagnostics R1: machine given a copied ~owner mark is refused WrongKind at its definition, never a Defect from a raw TypeError", () => {
    expect(refusal(() => machine(loose({ "~owner": Symbol("copied") }), () => loose({})))).toEqual([
      ["InvalidConfiguration", "WrongKind", "definition"],
    ]);
  });

  it.fails("Diagnostics R1, R3: a cyclic states list is refused as invalid configuration, never a Defect from the parser", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["A"] = [cyclic];

    const codes = refusal(() =>
      definition(loose({ id: "Compile/Cyclic", states: [cyclic], events: {} })),
    ).map(([code]) => code);

    expect(codes.length).toBeGreaterThan(0);
    expect(codes).not.toContain("Defect");
  });

  it.fails("Diagnostics R1, R6: a getter in the config that throws is one Defect carrying what it threw, never the parser's own error", () => {
    const thrown = new Error("getter");

    assert.throws(
      () =>
        definition(
          loose({
            id: "Compile/Getter",
            get states() {
              throw thrown;
            },
            events: {},
          }),
        ),
      (error) => error instanceof FlowError && error.code === "Defect" && error.cause === thrown,
    );
  });
});
