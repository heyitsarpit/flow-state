import { Option, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  runtimeSetup,
  type Snapshot,
} from "../../src/index.ts";

// Inverted: each line marked `wrong` compiles today. When its carrier lands the line fails the
// check: put `@ts-expect-error` on it, naming the rule. Each assertion of today's wide type (the
// `.not` of the narrow type, or the wide type itself) then fails too: make it the exact narrow
// type. A positive assertion that holds today stays as it is.

const Shopper = definition({
  id: "types/snapshot/Shopper",
  states: ["IN", "OUT"],
  events: { Leave: {} },
  memory: {
    name: Flow.initial(Schema.String, ""),
    secret: Flow.private(Flow.initial(Schema.String, "")),
  },
});

const Cart = definition({
  id: "types/snapshot/Cart",
  states: ["OPEN"],
  events: {},
  memory: { count: Flow.initial(Schema.Number, 0) },
  context: { shopper: Flow.context(Shopper.M.name) },
});

const ShopperMachine = machine(Shopper, ({ S }) => ({ default: S.IN, on: { Leave: S.OUT } }));
const CartMachine = machine(Cart, ({ S }) => ({ default: S.OPEN }));
const shopper = actorRef(ShopperMachine, "s1");

const runtime = runtimeSetup({
  app: app({
    id: "types/snapshot",
    machines: { shopper: ShopperMachine, cart: { machine: CartMachine, context: { shopper } } },
  }),
}).construct();

declare const inside: Snapshot<typeof Shopper>;
declare const cart: Snapshot<typeof Cart>;

describe("Turn R23, Actors R6: a handle's snapshot is its definition's outside view", () => {
  it("a handle's snapshot is typed by its definition", () => {
    const snap = runtime.ensureActor(shopper).getSnapshot();

    expectTypeOf(snap).toEqualTypeOf<Option.Option<Snapshot<typeof Shopper, "outside">>>();

    Option.map(snap, (s) => {
      expectTypeOf(s.state).toEqualTypeOf<"IN" | "OUT">();
      expectTypeOf(s.memory).toEqualTypeOf<{ readonly name: string }>();

      // @ts-expect-error Turn R23: nmae is no memory field of Shopper
      void s.memory["nmae"];
      // @ts-expect-error Turn R23: GONE is no state of Shopper
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- the wrong line the leaf union refuses
      void (s.state === "GONE");
    });
  });

  it("the outside view has no private field; a cut's inside view keeps it", () => {
    const snap = runtime.ensureActor(shopper).getSnapshot();

    expectTypeOf(inside.memory).toEqualTypeOf<{ readonly name: string; readonly secret: string }>();

    Option.map(snap, (s) => {
      expectTypeOf(s.memory).toEqualTypeOf<{ readonly name: string }>();
      // @ts-expect-error Actors R6: the runtime strips the private `secret` from a handle's snapshot
      void s.memory["secret"];
    });
  });

  it("context is partial: a resting snapshot has none", () => {
    expectTypeOf(cart.context).toEqualTypeOf<Partial<{ readonly shopper: string }>>();

    // @ts-expect-error Turn R23: shoper is no slot of Cart
    void cart.context["shoper"];
  });

  it("a snapshot is an Option whose memory is typed, a quarantined record's fresh start included", () => {
    const snap = runtime.ensureActor(shopper).getSnapshot();

    expectTypeOf(Option.map(snap, (s) => s.lifecycle)).toEqualTypeOf<
      Option.Option<"active" | "disposing" | "disposed" | "stopped" | "quarantined">
    >();
    expectTypeOf(Option.map(snap, (s) => s.memory)).toEqualTypeOf<
      Option.Option<{ readonly name: string }>
    >();
  });
});
