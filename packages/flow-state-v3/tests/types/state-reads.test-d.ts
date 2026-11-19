import { describe, expectTypeOf, it } from "vite-plus/test";
import { definition, deny, machine, type Snapshot } from "../../src/index.ts";

// Inverted: each line marked `wrong` compiles today. When its carrier lands the line fails the
// check: put `@ts-expect-error` on it, naming the rule. Each assertion of today's wide type (the
// `.not` of the narrow type, or the wide type itself) then fails too: make it the exact narrow
// type. A positive assertion that holds today stays as it is.

const D = definition({
  id: "types/state-reads/D",
  states: ["IDLE", { ON: ["A", "B"] }],
  events: { go: {} },
});

declare const read: Snapshot<typeof D>;

describe("Compile R14, Turn R23: a state read takes and returns the definition's paths", () => {
  it("is and child on a state token", () => {
    expectTypeOf(D.S.ON.child(read)).not.toEqualTypeOf<"A" | "B" | undefined>();
    expectTypeOf(D.S.ON.child(read)).toEqualTypeOf<string | undefined>();

    D.S.ON.is("NOPE"); // wrong: no such leaf
    void (D.S.ON.child(read) === "C"); // wrong: ON's children are A and B
    D.S.ON.is(read);
  });

  it("child on the root token", () => {
    expectTypeOf(D.S.root.child(read)).not.toEqualTypeOf<"IDLE" | "ON" | undefined>();
    expectTypeOf(D.S.ON.is)
      .parameter(0)
      .not.toEqualTypeOf<"IDLE" | "ON.A" | "ON.B" | { readonly state: "IDLE" | "ON.A" | "ON.B" }>();

    void (D.S.root.child(read) === "NOPE"); // wrong: the root's children are IDLE and ON
  });
});

describe("Turn R12: a guard reads the leaf it runs in", () => {
  it("a guard's state", () => {
    machine(D, ({ S }) => ({
      default: S.IDLE,
      on: {
        go: {
          guard: ({ state }) => {
            expectTypeOf(state).not.toEqualTypeOf<"IDLE" | "ON.A" | "ON.B">();
            expectTypeOf(state).toEqualTypeOf<string>();

            return state !== "ONN" ? true : deny("Never"); // wrong: no such leaf, so it always passes
          },
          target: S.ON.A,
        },
      },
    }));
  });
});
