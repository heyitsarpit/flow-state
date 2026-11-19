import { Effect, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { definition, Flow, machine, type Machine, transaction } from "../../src/index.ts";

// Inverted: each line marked `wrong` compiles today. When its carrier lands the line fails the
// check: put `@ts-expect-error` on it, naming the rule. Each assertion of today's wide type (the
// `.not` of the narrow type, or the wide type itself) then fails too: make it the exact narrow
// type. A positive assertion that holds today stays as it is.

const add = transaction({
  id: "types/tokens/add",
  input: { id: Schema.String },
  key: ["id"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.succeed(1),
});

const internalEvents = { Ok: {}, Bad: {}, Unsure: Flow.uncertain({}) };

const Pay = definition({
  id: "types/tokens/Pay",
  states: ["IDLE", "ON"],
  events: { go: {} },
  internalEvents,
});

const Other = definition({
  id: "types/tokens/Other",
  states: ["IDLE", "ON"],
  events: { go: {} },
  internalEvents,
});

const Cart = definition({
  id: "types/tokens/Cart",
  states: ["A"],
  events: { go: {} },
  internalEvents,
  operations: ({ E }) => ({
    add: add.outcomes({ success: E.Ok, failure: {}, unknown: E.Unsure }),
  }),
});

describe("Compile R12, R14, T6: a definition's id is a type, and its tokens carry it", () => {
  it("the id keeps its literal", () => {
    expectTypeOf(Pay.id).not.toEqualTypeOf<"types/tokens/Pay">();
    expectTypeOf(Pay.id).toEqualTypeOf<string>();
  });

  it("another definition's state token of the same path", () => {
    machine(Pay, () => ({ default: Other.S.IDLE })); // wrong: Other's IDLE
    machine(Pay, ({ S }) => ({ default: S.IDLE, on: { go: { target: Other.S.ON } } })); // wrong
    machine(Pay, ({ S }) => ({ default: S.IDLE, on: { go: Other.S.ON } })); // wrong: as a handler
    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      on: { go: { guard: [Other.S.ON], target: S.ON } }, // wrong: as a guard
    }));

    expectTypeOf(
      machine(Pay, ({ S }) => ({ default: S.IDLE, on: { go: { guard: [S.ON], target: S.ON } } })),
    ).toEqualTypeOf<Machine<typeof Pay>>();
  });

  it("another definition's operation handle", () => {
    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      on: { go: { actions: [Cart.O.add.cancel] } }, // wrong: Cart's operation
    }));

    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      on: { go: { actions: [Cart.O.add.commit(() => ({ id: "1" }))] } }, // wrong
    }));

    expectTypeOf(
      machine(Cart, ({ S, O }) => ({
        default: S.A,
        on: { go: { actions: [O.add.cancel, O.add.commit(() => ({ id: "1" }))] } },
      })),
    ).toEqualTypeOf<Machine<typeof Cart>>();
  });

  it("another definition's event of the same name as an ending or a reaction", () => {
    definition({
      id: "types/tokens/Mine",
      states: ["A"],
      events: { go: {} },
      internalEvents,
      operations: ({ E }) => ({
        add: add.outcomes({
          success: Other.E.Ok, // wrong: Other's Ok
          failure: {},
          unknown: Other.E.Unsure, // wrong: Other's Unsure
        }),
        own: add.outcomes({ success: E.Ok, failure: {}, unknown: E.Unsure }),
      }),
    });

    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      onContext: [{ select: () => 1, event: Other.E.Ok }], // wrong: Other's Ok
    }));

    expectTypeOf(
      machine(Pay, ({ S, E }) => ({
        default: S.IDLE,
        onContext: [{ select: () => 1, event: E.Ok }],
      })),
    ).toEqualTypeOf<Machine<typeof Pay>>();
    // Today one type; once branded, two (make this `.not`).
    expectTypeOf(Other.E.Ok).toEqualTypeOf(Pay.E.Ok);
  });

  it("a path neither definition has is refused today", () => {
    // @ts-expect-error Compile R12: NOPE is no state of Other
    machine(Pay, () => ({ default: Other.S.NOPE }));
  });
});
