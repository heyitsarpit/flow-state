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

// FLOW_STATE_ALLOW_UNKNOWN: today's erased input and key, named so a test can state it.
type Values = Readonly<Record<string, unknown>>;

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
  memory: { name: Flow.initial(Schema.String, "") },
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
    expectTypeOf<Parameters<typeof O.pay.commit>[0]>().returns.not.toEqualTypeOf<PayInput>();
    expectTypeOf<Parameters<typeof O.pay.commit>[0]>().returns.toEqualTypeOf<Values>();
    expectTypeOf<Parameters<typeof O.find.lookup>[0]>().returns.not.toEqualTypeOf<PayKey>();

    O.pay.commit(({ memory }) => ({ amnt: memory.cents })); // wrong: no such input field
    O.pay.commit(() => ({})); // wrong: id and cents are missing
    O.pay.commit(() => ({ id: 1, cents: "x" })); // wrong: wrong field types
    O.find.lookup(() => ({ idd: "x" })); // wrong: no such input field
    O.pay.commit(() => ({ id: "a", cents: 1 }));
  });

  it("retry, cancel, idle, retryable and get take the contract's key", () => {
    expectTypeOf<Parameters<typeof O.pay.idle>[0]>().returns.not.toEqualTypeOf<PayKey>();
    expectTypeOf<Parameters<typeof O.pay.get>[1]>().not.toEqualTypeOf<PayKey>();

    O.pay.retry(() => ({ nope: 1 })); // wrong: the key is { id }
    O.pay.cancel(() => ({ nope: 1 })); // wrong
    O.pay.idle(() => ({ nope: 1 })); // wrong
    O.pay.retryable(() => ({ nope: 1 }), { times: 2 }); // wrong
    O.pay.get(new Map(), { nope: 1 }); // wrong
    O.pay.retry(() => ({ id: "a" }));
  });

  it("a selector's event is its handler's event", () => {
    machine(Cart, ({ S, O: H }) => ({
      default: S.OPEN,
      on: {
        Pay: {
          actions: [
            H.pay.commit(({ event }) => {
              expectTypeOf(event).not.toEqualTypeOf<{
                readonly id: string;
                readonly cents: number;
              }>();
              expectTypeOf(event).toBeNever();

              return { id: "a", cents: 1 };
            }),
          ],
        },
        Reset: {
          guard: [H.pay.idle(({ event }) => event)], // wrong: Reset carries no id
          actions: [H.pay.commit(({ event }) => event)], // wrong: Reset is no input
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
      key: ["b"], // wrong: b is optional
      concurrency: "reject",
      services: [],
      commit: () => Effect.succeed(1),
    });

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
        expectTypeOf(attempt.input).not.toEqualTypeOf<{ readonly a: string; readonly n: number }>();
        expectTypeOf(attempt.key).not.toEqualTypeOf<{ readonly a: string }>();
        expectTypeOf(attempt.input).toEqualTypeOf<Values>();

        void attempt.input["nope"]; // wrong: no such input field
        void attempt.key["n"]; // wrong: n is no key field

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
    actorRef(CartMachine, "c", { context: { shopper: stranger } }); // wrong: not a Shopper
    actorRef(CartMachine, "c", { context: { shoper: shopper } }); // wrong: no such slot
    actorRef(CartMachine, "c", { context: { shopper } });

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
        cart: { machine: CartMachine, context: { shopper: stranger } }, // wrong: not a Shopper
        other: { machine: CartMachine, context: { shoper: shopper } }, // wrong: no such slot
        shopper: ShopperMachine,
        stranger: StrangerMachine,
      },
    });
  });
});
