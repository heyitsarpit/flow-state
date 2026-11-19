import { Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import {
  type ActorRef,
  actorRef,
  definition,
  Flow,
  type Machine,
  machine,
  type Snapshot,
} from "../../src/index.ts";

// Inverted: each line marked `wrong` compiles today. When context slots are built the line fails
// the check: put `@ts-expect-error` on it, naming the rule. Each assertion marked `today` asserts
// today's wide type and then fails too: make it the narrow type its comment names. Beside each
// wrong line, the correct use of the same parameter is asserted exactly.

const Cart = definition({
  id: "types/context/Cart",
  states: ["OPEN", { CHECKOUT: ["ADDRESS", "PAY"] }],
  events: {},
  memory: {
    items: Flow.initial(Schema.Array(Schema.String), []),
    coupon: Flow.initial(Schema.String, ""),
    secret: Flow.private(Flow.initial(Schema.String, "")),
  },
});

const Shopper = definition({
  id: "types/context/Shopper",
  states: ["GUEST"],
  events: {},
  memory: { name: Flow.initial(Schema.String, "") },
});

const items = Flow.context(Cart.M.items);
const inCheckout = Flow.context(Cart.S.CHECKOUT);
const step = Flow.context(Cart.state);

const count = Flow.context(Schema.Number, {
  reads: { lines: Cart.M.items, coupon: Cart.M.coupon },
  select: ({ lines, coupon }) => (coupon === "" ? lines.length : lines.length + 1),
});

const slots = { items, inCheckout, step, count };

const Badge = definition({
  id: "types/context/Badge",
  states: ["SHOWN"],
  events: {},
  internalEvents: { Bumped: { count: Schema.Number }, Seen: {} },
  memory: { limit: Flow.initial(Schema.Number, 10) },
  context: slots,
});

// A snapshot's context: each slot's value, absent while the actor rests.
type Slots = Snapshot<typeof Badge>["context"];

describe("Compile R4, R19: each form's slot has the type its reads give", () => {
  it("a pass-through takes its field's type; a state token is a boolean; X.state is a leaf path", () => {
    expectTypeOf<Slots["items"]>().toEqualTypeOf<ReadonlyArray<string> | undefined>();
    expectTypeOf<Slots["inCheckout"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<Slots["step"]>().toEqualTypeOf<
      "OPEN" | "CHECKOUT.ADDRESS" | "CHECKOUT.PAY" | undefined
    >();
    expectTypeOf<Slots["count"]>().toEqualTypeOf<number | undefined>();
  });

  it("a derived select receives each read by its name", () => {
    Flow.context(Schema.Number, {
      reads: { lines: Cart.M.items, coupon: Cart.M.coupon, open: Cart.S.OPEN, at: Cart.state },
      select: ({ lines, coupon, open, at }) => {
        expectTypeOf(lines).toEqualTypeOf<ReadonlyArray<string>>();
        expectTypeOf(coupon).toEqualTypeOf<string>();
        expectTypeOf(open).toEqualTypeOf<boolean>();
        expectTypeOf(at).toEqualTypeOf<"OPEN" | "CHECKOUT.ADDRESS" | "CHECKOUT.PAY">();

        return lines.length;
      },
    });
  });
});

describe("Compile R19: a slot reads one provider", () => {
  it("reads from two definitions", () => {
    Flow.context(Schema.Number, {
      reads: { lines: Cart.M.items, name: Shopper.M.name }, // wrong: Compile R19, two providers
      select: ({ lines }) => lines.length,
    });
    Flow.context(Schema.Number, {
      reads: { lines: Cart.M.items, guest: Shopper.S.GUEST }, // wrong: Compile R19, a state token of a second provider
      select: ({ lines }) => lines.length,
    });

    expectTypeOf(
      Flow.context(Schema.Number, {
        reads: { lines: Cart.M.items, coupon: Cart.M.coupon },
        select: ({ lines }) => lines.length,
      }),
    ).toEqualTypeOf(count);
  });
});

describe("Compile R19: a Flow.private field has no M token", () => {
  it("a read of the private field", () => {
    void Cart.M.secret; // wrong: Compile R19, `secret` is Flow.private

    // today: the narrow type is "items" | "coupon".
    expectTypeOf<keyof typeof Cart.M>().toEqualTypeOf<"items" | "coupon" | "secret">();
  });
});

describe("Compile R4, R19: a derived select returns its Schema's type", () => {
  it("a select returning a string for a number slot", () => {
    Flow.context(Schema.Number, {
      reads: { lines: Cart.M.items },
      select: ({ lines }) => lines.join(","), // wrong: Compile R4, a string for Schema.Number
    });

    expectTypeOf(
      Flow.context(Schema.Number, {
        reads: { lines: Cart.M.items },
        select: ({ lines }) => lines.length,
      }),
    ).toEqualTypeOf(
      Flow.context(Schema.Number, { reads: { lines: Cart.M.items }, select: () => 0 }),
    );
  });
});

describe("Turn R22: .change's when and payload read the slot's type", () => {
  it("when and the payload mapper", () => {
    machine(Badge, ({ S, E, C }) => ({
      default: S.SHOWN,
      onContext: [
        C.count.change({
          when: (current, previous, { memory }) => {
            // today: the narrow type is number.
            expectTypeOf(current).toEqualTypeOf<never>();
            // today: the narrow type is number.
            expectTypeOf(previous).toEqualTypeOf<never>();
            expectTypeOf(memory).toEqualTypeOf<{ readonly limit: number }>();

            return current > memory.limit;
          },
          event: E.Bumped.from((value) => {
            // today: the narrow type is number.
            expectTypeOf(value).toEqualTypeOf<never>();

            return { count: value };
          }),
        }),
      ],
      on: { Bumped: {} },
    }));
  });

  it("a when or a payload mapper written for another type", () => {
    machine(Badge, ({ S, E, C }) => {
      const wrongWhen = C.count.change({
        when: (current: string) => current === "",
        event: E.Seen,
      }); // wrong: Turn R22, a string for a number slot

      const wrongPayload = C.count.change({
        event: E.Bumped.from((value: string) => ({ count: value.length })),
      }); // wrong: Turn R22, a string for a number slot

      // today: the narrow type reads `current` and `previous` as number.
      expectTypeOf<NonNullable<Parameters<typeof C.count.change>[0]["when"]>>().toEqualTypeOf<
        (
          current: never,
          previous: never,
          extra: { readonly memory: { readonly limit: number } },
        ) => boolean
      >();

      return {
        default: S.SHOWN,
        onContext: [wrongWhen, wrongPayload],
        on: { Bumped: {}, Seen: {} },
      };
    });
  });

  it("a .change on a slot the definition does not declare", () => {
    machine(Badge, ({ S, E, C }) => {
      expectTypeOf<keyof typeof C>().toEqualTypeOf<"items" | "inCheckout" | "step" | "count">();

      // @ts-expect-error Compile R19: Badge declares no slot `missing`
      void C.missing;

      return {
        default: S.SHOWN,
        onContext: [C.count.change({ event: E.Seen })],
        on: { Seen: {} },
      };
    });
  });
});

describe("Compile R19: Provider.select and a reaction's own select are gone", () => {
  it("the old forms", () => {
    void Cart.Provider; // wrong: Compile R19, Provider.select is gone

    const legacy = machine(Badge, ({ S, E }) => ({
      default: S.SHOWN,
      onContext: [{ select: ({ context }) => context.count, event: E.Seen }],
      on: { Seen: {} },
    })); // wrong: Compile R19, a reaction's own select is gone

    expectTypeOf(
      machine(Badge, ({ S, E, C }) => ({
        default: S.SHOWN,
        onContext: [C.count.change({ event: E.Seen })],
        on: { Seen: {} },
      })),
    ).toEqualTypeOf<Machine<typeof Badge>>();
    expectTypeOf(legacy).toEqualTypeOf<Machine<typeof Badge>>();

    // today: the narrow type has no `Provider` key.
    expectTypeOf<"Provider" extends keyof typeof Cart ? true : false>().toEqualTypeOf<true>();
  });
});

// Definitions made by one factory share one id type, a union of literals or `string`, so the type
// cannot tell two of them apart: a slot reading one of them compiles, and so does a slot reading
// two, which construction then refuses (Compile R19's second ban).
const listOf = <const Name extends string>(name: Name) =>
  definition({
    id: `types/context/List/${name}`,
    states: ["READY"],
    events: {},
    memory: { size: Flow.initial(Schema.Number, 0) },
  });

const Todo = listOf("todo");
const Done = listOf("done");

describe("Compile R19: factory-made definitions keep a literal id each", () => {
  it("each factory definition's id is its own literal, so the type ban covers them", () => {
    expectTypeOf(Todo.id).toEqualTypeOf<"types/context/List/todo">();
    expectTypeOf(Done.id).toEqualTypeOf<"types/context/List/done">();

    Flow.context(Schema.Number, {
      reads: { todo: Todo.M.size, done: Done.M.size }, // wrong: Compile R19, two providers of one factory
      select: ({ todo, done }) => todo + done,
    });

    expectTypeOf(
      Flow.context(Schema.Number, { reads: { todo: Todo.M.size }, select: ({ todo }) => todo }),
    ).toEqualTypeOf(Flow.context(Schema.Number, { reads: { todo: Todo.M.size }, select: () => 0 }));
  });
});

// A factory whose id is not a literal: every list it makes has the id type
// `types/context/Any/${string}`, so the type cannot tell two apart and construction refuses a slot
// that reads two.
const anyListOf = (name: string) =>
  definition({
    id: `types/context/Any/${name}`,
    states: ["READY"],
    events: {},
    memory: { size: Flow.initial(Schema.Number, 0) },
  });

describe("Compile R19: an id the type cannot tell apart leaves the ban to construction", () => {
  it("two lists of a non-literal factory compile as one provider", () => {
    const first = anyListOf("first");
    const second = anyListOf("second");

    expectTypeOf(first.id).toEqualTypeOf<`types/context/Any/${string}`>();
    Flow.context(Schema.Number, {
      reads: { a: first.M.size, b: second.M.size },
      select: ({ a, b }) => a + b,
    });
  });
});

const CartMachine = machine(Cart, ({ S }) => ({ default: S.OPEN }));
const ShopperMachine = machine(Shopper, ({ S }) => ({ default: S.GUEST }));
const BadgeMachine = machine(Badge, ({ S }) => ({ default: S.SHOWN }));
const cartRef = actorRef(CartMachine, "cart");
const shopperRef = actorRef(ShopperMachine, "shopper");

describe("Compile R18, R19: a slot is wired to an actor of its provider", () => {
  it("a state-token slot wired to another definition's actor", () => {
    actorRef(BadgeMachine, "wrong", { context: { inCheckout: shopperRef } }); // wrong: Compile R18, the Shopper is not the slot's provider

    expectTypeOf(
      actorRef(BadgeMachine, "badge", { context: { inCheckout: cartRef, items: cartRef } }),
    ).toEqualTypeOf<ActorRef<typeof Badge>>();
  });
});
