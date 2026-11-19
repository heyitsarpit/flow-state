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

// FLOW_STATE_ALLOW_UNKNOWN: today's erased memory and context, named so a test can state it.
type Values = Readonly<Record<string, unknown>>;

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
  context: { shopper: Shopper.Provider.select(Schema.String, (s) => s.memory.name) },
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

    expectTypeOf(snap).toEqualTypeOf<Option.Option<Snapshot>>();

    Option.map(snap, (s) => s.memory["nmae"]); // wrong: no such field
    Option.map(snap, (s) => s.state === "GONE"); // wrong: no such state
  });

  it("the outside view has no private field; a cut's inside view keeps it", () => {
    const snap = runtime.ensureActor(shopper).getSnapshot();

    expectTypeOf(inside.memory).toEqualTypeOf<{ readonly name: string; readonly secret: string }>();

    Option.map(snap, (s) => s.memory["secret"]); // wrong: the runtime strips `secret` here
  });

  it("context is partial: a resting snapshot has none", () => {
    expectTypeOf(cart.context).not.toEqualTypeOf<Partial<{ readonly shopper: string }>>();
    expectTypeOf(cart.context).toEqualTypeOf<Values>();

    void cart.context["shoper"]; // wrong: no such slot
  });

  it("an unreadable record has no memory", () => {
    const snap = runtime.ensureActor(shopper).getSnapshot();

    expectTypeOf(Option.map(snap, (s) => s.lifecycle)).toEqualTypeOf<
      Option.Option<"active" | "disposing" | "disposed" | "stopped" | "quarantined">
    >();

    // wrong: a quarantined record whose fresh start was refused hands out `{}` as its memory
    Option.map(snap, (s) => s.memory);
  });
});
