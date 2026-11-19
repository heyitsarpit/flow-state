import { Effect, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { definition, Flow, machine, type Machine, transaction } from "../../src/index.ts";

// Each `@ts-expect-error` names the rule its line breaks; beside it the correct use of the same
// parameter is asserted exactly, so a wrong line cannot fail because the type became `never`.

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
    expectTypeOf(Pay.id).toEqualTypeOf<"types/tokens/Pay">();
    expectTypeOf(Pay.S.IDLE["~definition"]).toEqualTypeOf<"types/tokens/Pay" | undefined>();
  });

  it("another definition's state token of the same path", () => {
    // @ts-expect-error Compile R12: Other's IDLE as the default
    machine(Pay, () => ({ default: Other.S.IDLE }));
    // @ts-expect-error Compile R12: Other's ON as a target
    machine(Pay, ({ S }) => ({ default: S.IDLE, on: { go: { target: Other.S.ON } } }));
    // @ts-expect-error Compile R12: Other's ON as a handler
    machine(Pay, ({ S }) => ({ default: S.IDLE, on: { go: Other.S.ON } }));
    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Compile R12: Other's ON as a guard
      on: { go: { guard: [Other.S.ON], target: S.ON } },
    }));

    expectTypeOf(machine(Pay, ({ S }) => ({ default: S.IDLE, on: { go: S.ON } }))).toEqualTypeOf<
      Machine<typeof Pay>
    >();

    expectTypeOf(
      machine(Pay, ({ S }) => ({ default: S.IDLE, on: { go: { guard: [S.ON], target: S.ON } } })),
    ).toEqualTypeOf<Machine<typeof Pay>>();
  });

  it("another definition's operation handle", () => {
    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Compile R12: Cart's operation in Pay's body
      on: { go: { actions: [Cart.O.add.cancel] } },
    }));

    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Compile R12: Cart's operation in Pay's body
      on: { go: { actions: [Cart.O.add.commit(() => ({ id: "1" }))] } },
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
      // @ts-expect-error Compile R12: Other's Ok and Unsure are no endings of Mine
      operations: () => ({
        add: add.outcomes({ success: Other.E.Ok, failure: {}, unknown: Other.E.Unsure }),
      }),
    });

    definition({
      id: "types/tokens/Mixed",
      states: ["A"],
      events: { go: {} },
      internalEvents,
      // @ts-expect-error Compile R12: Other's Ok beside Mixed's own Unsure
      operations: ({ E }) => ({
        add: add.outcomes({ success: Other.E.Ok, failure: {}, unknown: E.Unsure }),
      }),
    });

    const Own = definition({
      id: "types/tokens/Own",
      states: ["A"],
      events: { go: {} },
      internalEvents,
      operations: ({ E }) => ({
        own: add.outcomes({ success: E.Ok, failure: {}, unknown: E.Unsure }),
      }),
    });

    expectTypeOf(Own.operations.own["~definition"]).toEqualTypeOf<"types/tokens/Own" | undefined>();

    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Compile R12: Other's Ok as Pay's reaction
      onContext: [{ select: () => 1, event: Other.E.Ok }],
    }));

    expectTypeOf(
      machine(Pay, ({ S, E }) => ({
        default: S.IDLE,
        onContext: [{ select: () => 1, event: E.Ok }],
      })),
    ).toEqualTypeOf<Machine<typeof Pay>>();
    expectTypeOf(Other.E.Ok).not.toEqualTypeOf(Pay.E.Ok);
  });

  it("a path neither definition has is refused today", () => {
    expectTypeOf(machine(Pay, ({ S }) => ({ default: S.IDLE }))).toEqualTypeOf<
      Machine<typeof Pay>
    >();
    // @ts-expect-error Compile R12: NOPE is no state of Other
    machine(Pay, () => ({ default: Other.S.NOPE }));
  });
});
