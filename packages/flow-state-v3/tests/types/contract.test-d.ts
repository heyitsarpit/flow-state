import { Effect, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  resource,
  type Snapshot,
  transaction,
} from "../../src/index.ts";

// Inverted: each line marked `wrong` compiles today. When its carrier lands the line fails the
// check: put `@ts-expect-error` on it, naming the rule. Each assertion of today's wide type (the
// `.not` of the narrow type, or the wide type itself) then fails too: make it the exact narrow
// type. A positive assertion that holds today stays as it is.

type PayInput = { readonly id: string; readonly cents: number };

type PayKey = { readonly id: string };

type Row = {
  readonly pending: boolean;
  readonly uncertain: boolean;
  readonly waiting: boolean;
  readonly retryCount: number;
};

const pay = transaction({
  id: "types/pay",
  input: { id: Schema.String, cents: Schema.Number },
  key: ["id"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.succeed(1),
});

const find = resource({
  id: "types/find",
  input: { id: Schema.String },
  key: ["id"],
  services: [],
  staleTime: 0,
  gcTime: 0,
  lookup: () => Effect.succeed(1),
});

const Shopper = definition({
  id: "types/Shopper",
  states: ["IDLE"],
  events: {},
  memory: { name: Flow.initial(Schema.String, "") },
});

const Stranger = definition({
  id: "types/Stranger",
  states: ["IDLE"],
  events: {},
  memory: { alias: Flow.initial(Schema.String, "") },
});

const Cart = definition({
  id: "types/Cart",
  states: ["OPEN"],
  events: { Pay: { id: Schema.String, cents: Schema.Number }, Reset: {} },
  internalEvents: { Paid: {}, Found: {}, Unsure: Flow.uncertain({}) },
  memory: { cents: Flow.initial(Schema.Number, 0) },
  context: { shopper: Shopper.Provider.select(Schema.String, (s) => s.memory.name) },
  operations: ({ E }) => ({
    pay: pay.outcomes({ success: E.Paid, failure: {}, unknown: E.Unsure }),
    find: find.outcomes({ success: E.Found, failure: {} }),
  }),
});

const O = Cart.O;

declare const snap: Snapshot<typeof Cart>;

describe("Compile R14, Reads R1: an operation handle takes its contract's input and key", () => {
  it("commit and lookup select the contract's input", () => {
    expectTypeOf(O.pay.commit<Record<never, never>>)
      .parameter(0)
      .returns.toEqualTypeOf<PayInput>();
    expectTypeOf(O.find.lookup<Record<never, never>>)
      .parameter(0)
      .returns.toEqualTypeOf<PayKey>();

    // @ts-expect-error Reads R1: amnt is no input field, and id and cents are missing
    O.pay.commit(({ memory }) => ({ amnt: memory.cents }));
    // @ts-expect-error Reads R1: id and cents are missing
    O.pay.commit(() => ({}));
    // @ts-expect-error Reads R1: id is text and cents a number
    O.pay.commit(() => ({ id: 1, cents: "x" }));
    // @ts-expect-error Reads R1: idd is no input field
    O.find.lookup(() => ({ idd: "x" }));
    O.pay.commit(() => ({ id: "a", cents: 1 }));
  });

  it("retry, cancel, idle, retryable and get take the contract's key", () => {
    expectTypeOf(O.pay.idle<Record<never, never>>)
      .parameter(0)
      .returns.toEqualTypeOf<PayKey>();
    expectTypeOf(O.pay.get).parameter(1).toEqualTypeOf<PayKey>();
    expectTypeOf(O.pay.cancel<Record<never, never>>)
      .parameter(0)
      .returns.toEqualTypeOf<PayKey>();

    // @ts-expect-error Reads R1: the key is { id }
    O.pay.retry(() => ({ nope: 1 }));
    // @ts-expect-error Reads R1: the key is { id }
    O.pay.cancel(() => ({ nope: 1 }));
    // @ts-expect-error Reads R1: the key is { id }
    O.pay.idle(() => ({ nope: 1 }));
    // @ts-expect-error Reads R1: the key is { id }
    O.pay.retryable(() => ({ nope: 1 }), { times: 2 });
    // @ts-expect-error Reads R1: the key is { id }
    O.pay.get(new Map(), { nope: 1 });
    O.pay.retry(() => ({ id: "a" }));
    O.pay.retryable(() => ({ id: "a" }), { times: 2 });
  });

  it("a selector's event is its handler's event", () => {
    machine(Cart, ({ S, O: H }) => ({
      default: S.OPEN,
      on: {
        Pay: {
          actions: [
            H.pay.commit(({ event }) => {
              expectTypeOf(event).toEqualTypeOf<{
                readonly id: string;
                readonly cents: number;
              }>();

              return { id: event.id, cents: event.cents };
            }),
          ],
        },
        Reset: {
          // @ts-expect-error Reads R1: Reset carries no id, so its event is no key
          guard: [H.pay.idle(({ event }) => event)],
          // @ts-expect-error Reads R1: Reset carries no id or cents, so its event is no input
          actions: [H.pay.commit(({ event }) => event)],
        },
      },
    }));
  });
});

describe("Reads R1, Compile R9: a key names required input fields, kept as a tuple", () => {
  it("an optional field as the key", () => {
    transaction({
      id: "types/optionalKey",
      input: { a: Schema.String, b: Schema.optionalKey(Schema.String) },
      // @ts-expect-error Reads R1: b is optional, so it names no key
      key: ["b"],
      concurrency: "reject",
      services: [],
      commit: () => Effect.succeed(1),
    });

    const keyed = transaction({
      id: "types/requiredKey",
      input: { a: Schema.String, b: Schema.optionalKey(Schema.String) },
      key: ["a"],
      concurrency: "reject",
      services: [],
      commit: () => Effect.succeed(1),
    });

    expectTypeOf(keyed.key).toEqualTypeOf<readonly ["a"]>();

    transaction({
      id: "types/typoKey",
      input: { a: Schema.String },
      // @ts-expect-error Reads R1: "zz" is no input field
      key: ["zz"],
      concurrency: "reject",
      services: [],
      commit: () => Effect.succeed(1),
    });
  });

  it("an attempt carries the contract's input and key", () => {
    transaction({
      id: "types/attempt",
      input: { a: Schema.String, n: Schema.Number },
      key: ["a"],
      concurrency: "reject",
      services: [],
      commit: (_input, { attempt }) => {
        expectTypeOf(attempt.input).toEqualTypeOf<{ readonly a: string; readonly n: number }>();
        expectTypeOf(attempt.key).toEqualTypeOf<{ readonly a: string }>();

        // @ts-expect-error Reads R1: nope is no input field
        void attempt.input["nope"];
        // @ts-expect-error Reads R1: n is no key field
        void attempt.key["n"];

        return Effect.succeed(1);
      },
    });
  });
});

describe("Turn R23: a snapshot's operations are keyed by the definition's operation names", () => {
  it("a misspelt operation name", () => {
    expectTypeOf(snap.operations).not.toEqualTypeOf<
      ReadonlyMap<"pay" | "find", ReadonlyMap<string, Row>>
    >();
    expectTypeOf(snap.operations).toEqualTypeOf<ReadonlyMap<string, ReadonlyMap<string, Row>>>();

    snap.operations.get("typo"); // wrong: no such operation
    snap.operations.get("pay");
  });
});

describe("Compile R18: a context slot keeps its provider, and wiring is typed by it", () => {
  const CartMachine = machine(Cart, ({ S }) => ({ default: S.OPEN }));
  const ShopperMachine = machine(Shopper, ({ S }) => ({ default: S.IDLE }));
  const StrangerMachine = machine(Stranger, ({ S }) => ({ default: S.IDLE }));
  const shopper = actorRef(ShopperMachine, "s");
  const stranger = actorRef(StrangerMachine, "x");

  it("a ref of another provider, or a misspelt slot, in actorRef", () => {
    // @ts-expect-error Compile R18: a Stranger is no Shopper
    actorRef(CartMachine, "c", { context: { shopper: stranger } });
    // @ts-expect-error Compile R18: shoper is no slot of Cart
    actorRef(CartMachine, "c", { context: { shoper: shopper } });
    expectTypeOf(actorRef(CartMachine, "c", { context: { shopper } })).toEqualTypeOf(
      actorRef(CartMachine, "c"),
    );

    actorRef(
      CartMachine,
      "c",
      // @ts-expect-error Compile R18: a wiring value is an actor ref
      { context: { shopper: 5 } },
    );
  });

  it("a ref of another provider, or a misspelt slot, in an app entry", () => {
    app({
      id: "types/wiring",
      machines: {
        // @ts-expect-error Compile R18: a Stranger is no Shopper
        cart: { machine: CartMachine, context: { shopper: stranger } },
        // @ts-expect-error Compile R18: shoper is no slot of Cart
        other: { machine: CartMachine, context: { shoper: shopper } },
        shopper: ShopperMachine,
        stranger: StrangerMachine,
      },
    });

    const right = app({
      id: "types/wired",
      machines: { cart: { machine: CartMachine, context: { shopper } }, shopper: ShopperMachine },
    });

    expectTypeOf(right.machines.cart.context.shopper).toEqualTypeOf(shopper);
  });
});
