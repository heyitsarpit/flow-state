import { describe, expectTypeOf, it } from "vite-plus/test";
import { definition, deny, machine, type Snapshot } from "../../src/index.ts";

// Each `@ts-expect-error` names the rule its line breaks; beside it the correct use of the same
// parameter is asserted exactly, so a wrong line cannot fail because the type became `never`.

const D = definition({
  id: "types/state-reads/D",
  states: ["IDLE", { ON: ["A", "B"] }],
  events: { go: {} },
});

declare const read: Snapshot<typeof D>;

describe("Compile R14, Turn R23: a state read takes and returns the definition's paths", () => {
  it("is and child on a state token", () => {
    expectTypeOf(D.S.ON.child(read)).toEqualTypeOf<"A" | "B" | undefined>();
    expectTypeOf(D.S.ON.is(read)).toEqualTypeOf<boolean>();
    expectTypeOf(D.S.ON.is("ON.A")).toEqualTypeOf<boolean>();

    // @ts-expect-error Turn R23: NOPE is no leaf of D
    D.S.ON.is("NOPE");
    // @ts-expect-error Turn R23: ON's children are A and B
    void (D.S.ON.child(read) === "C");
  });

  it("child on the root token, and a leaf has no child", () => {
    expectTypeOf(D.S.root.child(read)).toEqualTypeOf<"IDLE" | "ON" | undefined>();
    expectTypeOf(D.S.IDLE.child(read)).toEqualTypeOf<undefined>();
    expectTypeOf<Parameters<typeof D.S.ON.is>[0]>().toEqualTypeOf<
      "IDLE" | "ON.A" | "ON.B" | { readonly state: "IDLE" | "ON.A" | "ON.B" }
    >();

    // @ts-expect-error Turn R23: the root's children are IDLE and ON
    void (D.S.root.child(read) === "NOPE");
  });
});

describe("Turn R12: a guard reads the leaf it runs in", () => {
  it("a guard's state", () => {
    machine(D, ({ S }) => ({
      default: S.IDLE,
      on: {
        go: {
          guard: ({ state }) => {
            expectTypeOf(state).toEqualTypeOf<"IDLE" | "ON.A" | "ON.B">();

            // @ts-expect-error Turn R12: ONN is no leaf, so the guard would always pass
            return state !== "ONN" ? true : deny("Never");
          },
          target: S.ON.A,
        },
      },
    }));

    machine(D, ({ S }) => ({
      default: S.IDLE,
      on: { go: { guard: ({ state }) => (state !== "ON.A" ? true : deny("InA")), target: S.ON.A } },
    }));
  });
});
