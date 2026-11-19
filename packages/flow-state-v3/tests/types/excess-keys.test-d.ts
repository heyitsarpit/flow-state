import { Context, Effect, Exit, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { type EndpointHandle, Fake } from "../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  machine,
  type Machine,
  runtimeSetup,
  type Transaction,
} from "../../src/index.ts";
import { transaction } from "../../src/index.ts";

// Inverted: each line marked `wrong` compiles today. When its carrier lands the line fails the
// check: put `@ts-expect-error` on it, naming the rule. Each assertion of today's wide type (the
// `.not` of the narrow type, or the wide type itself) then fails too: make it the exact narrow
// type. Beside each wrong line, the correct use of the same parameter compiles and is asserted
// exactly, so a wrong line that fails because the type became `never` fails that assertion too.

const Pay = definition({
  id: "types/ExcessPay",
  states: ["IDLE", "ON"],
  events: { go: {}, Ping: {} },
  memory: { who: Flow.input(Schema.String), count: Flow.initial(Schema.Number, 0) },
});

const PayMachine = machine(Pay, ({ S }) => ({ default: S.IDLE }));

class CartApi extends Context.Service<CartApi, { readonly hi: () => number }>()("types/CartApi") {}

class OtherApi extends Context.Service<OtherApi, { readonly yo: () => number }>()(
  "types/OtherApi",
) {}

describe("Compile R7, R14, T6: a returned memory write is exact", () => {
  it("an input field written beside a writable one", () => {
    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      on: {
        go: {
          updateMemory: ({ memory }) => {
            expectTypeOf(memory).toEqualTypeOf<{ readonly who: string; readonly count: number }>();

            return { count: memory.count + 1, who: "x" }; // wrong: `who` is an input field
          },
        },
      },
    }));
  });

  it("a misspelt field beside a writable one", () => {
    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      on: { go: { updateMemory: () => ({ count: 1, cuont: 2 }) } }, // wrong: `cuont`
    }));
  });

  it("the writable field alone compiles; the input field or the typo alone is refused today", () => {
    const counted = machine(Pay, ({ S }) => ({
      default: S.IDLE,
      on: { go: { updateMemory: () => ({ count: 1 }) } },
    }));

    expectTypeOf(counted).toEqualTypeOf<Machine<typeof Pay>>();

    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Compile R7: `who` is no writable field
      on: { go: { updateMemory: () => ({ who: "x" }) } },
    }));
  });
});

describe("Compile R4, R14: a machine body is exact", () => {
  it("a misspelt body key", () => {
    machine(Pay, ({ S }) => ({ default: S.IDLE, onn: {} })); // wrong: `onn`
  });

  it("a misspelt alternative key", () => {
    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      on: { go: { target: S.ON, updateMemry: () => ({}) } }, // wrong: `updateMemry`
    }));
  });

  it("an unknown key in a handler list", () => {
    machine(Pay, ({ S }) => ({ default: S.IDLE, on: { go: [{ target: S.ON, bogus: 1 }] } })); // wrong
  });

  it("the same body spelt right compiles", () => {
    const right = machine(Pay, ({ S }) => ({
      default: S.IDLE,
      on: { go: [{ target: S.ON, updateMemory: () => ({ count: 1 }) }] },
    }));

    expectTypeOf(right).toEqualTypeOf<Machine<typeof Pay>>();
  });

  it("a nested state's unknown key is refused today", () => {
    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Compile R4: `onn` is no state key
      states: { ON: { onn: {} } },
    }));
  });
});

describe("Runtime O1: an app entry and the setup's options are exact", () => {
  const ref = actorRef(PayMachine, { who: "a" });

  it("a misspelt entry key, and a ref given as an entry", () => {
    // @ts-expect-error Runtime O1: contxt is no entry key
    app({ id: "types/a", machines: { c: { machine: PayMachine, contxt: { x: ref } } } });
    // @ts-expect-error Runtime O1: a ref is no machine
    app({ id: "types/b", machines: { c: ref } });

    const right = app({ id: "types/c", machines: { c: { machine: PayMachine, context: {} } } });

    expectTypeOf(right.machines.c.machine).toEqualTypeOf<Machine<typeof Pay>>();
  });

  it("persistence and scope only together", () => {
    const shop = app({ id: "types/d", machines: { c: PayMachine } });

    runtimeSetup({ app: shop, persistence: { captureMs: 0 } }); // wrong: no scope, never saves
    runtimeSetup({ app: shop, scope: "s" }); // wrong: a scope with nothing to save

    expectTypeOf(
      runtimeSetup({ app: shop, scope: "s", persistence: { captureMs: 0 } }).construct,
    ).toEqualTypeOf(runtimeSetup({ app: shop }).construct);
  });
});

describe("Compile R14: an event's payload is exact", () => {
  it("a field given to an empty payload", () => {
    Pay.E.Ping({ extra: 1 }); // wrong: Ping has no fields

    expectTypeOf(Pay.E.Ping({})._tag).toEqualTypeOf<"Ping">();
    expectTypeOf<keyof Parameters<typeof Pay.E.Ping>[0]>().toEqualTypeOf<never>();
  });
});

describe("Reads R1, Compile R14: a contract's services are its commit's requirements", () => {
  it("services that omit or misname what the commit needs", () => {
    transaction({
      id: "types/needs",
      input: { id: Schema.String },
      key: ["id"],
      concurrency: "reject",
      services: [], // wrong: the commit needs CartApi
      commit: () => CartApi.use((api) => Effect.succeed(api.hi())),
    });

    transaction({
      id: "types/needs2",
      input: { id: Schema.String },
      key: ["id"],
      concurrency: "reject",
      services: [OtherApi], // wrong: the commit needs CartApi, not OtherApi
      commit: () => CartApi.use((api) => Effect.succeed(api.hi())),
    });

    const right = transaction({
      id: "types/needs3",
      input: { id: Schema.String },
      key: ["id"],
      concurrency: "reject",
      services: [CartApi],
      commit: () => CartApi.use((api) => Effect.succeed(api.hi())),
    });

    expectTypeOf(right).toEqualTypeOf<
      Transaction<{ readonly id: typeof Schema.String }, number, never, CartApi, readonly ["id"]>
    >();
  });
});

describe("Compile R4, R14: a definition's literals are kept", () => {
  it("a hoisted states list widens the tree to text", () => {
    const states = ["IDLE", "ON"];
    const Hoisted = definition({ id: "types/Hoisted", states, events: { go: {} } }); // wrong

    const Literal = definition({ id: "types/Literal", states: ["IDLE", "ON"], events: {} });

    // FLOW_STATE_ALLOW_UNKNOWN: today's token of a widened tree, stated so its fix trips the test.
    expectTypeOf(Hoisted.S["IDLE"]).toEqualTypeOf<unknown>();
    expectTypeOf(Literal.S.IDLE["~path"]).toEqualTypeOf<"IDLE">();
  });

  it("a duplicate state, an empty compound and an empty id", () => {
    definition({ id: "types/Dup", states: ["A", "A"], events: {} }); // wrong: duplicate state
    definition({ id: "types/Empty", states: [{ P: [] }], events: {} }); // wrong: empty compound
    definition({ id: "", states: ["A"], events: {} }); // wrong: empty id

    const right = definition({ id: "types/Right", states: ["A", { P: ["B"] }], events: {} });

    expectTypeOf(right.S.P.B["~path"]).toEqualTypeOf<"P.B">();
  });
});

describe("Stories R8: a fake's handler reads the server's truth", () => {
  const Truth = Schema.Struct({ count: Schema.Number });

  it("a handler annotated with a truth the server does not hold", () => {
    const lying = Fake.call({
      request: { n: Schema.Number },
      success: Schema.Number,
      failure: Schema.Never,
      handle: (truth: { readonly count: number; readonly extra: number }, request) => ({
        truth: { count: truth.count + request.n, extra: truth.extra },
        exit: Exit.succeed(truth.extra),
      }),
    });

    const fib = Fake.control(
      { n: Schema.Number },
      (truth: { readonly count: number; readonly extra: number }, input) => ({
        count: truth.count + input.n,
        extra: truth.extra,
      }),
    );

    const honest = Fake.call({
      request: { n: Schema.Number },
      success: Schema.Number,
      failure: Schema.Never,
      handle: (truth: { readonly count: number }, request) => ({
        truth: { count: truth.count + request.n },
        exit: Exit.succeed(truth.count),
      }),
    });

    const lyingServer = Fake.server("types/S", {
      truth: Truth,
      initial: { count: 0 },
      endpoints: { lying }, // wrong: `lying` reads `extra`, which the truth lacks
      controls: { fib }, // wrong: `fib` reads `extra` too
      lost: () => new Error("lost"),
    });

    const honestServer = Fake.server("types/H", {
      truth: Truth,
      initial: { count: 0 },
      endpoints: { honest },
      lost: () => new Error("lost"),
    });

    expectTypeOf(lyingServer.lying).toEqualTypeOf<EndpointHandle<{ readonly n: number }>>();
    expectTypeOf(honestServer.honest).toEqualTypeOf<EndpointHandle<{ readonly n: number }>>();
  });
});
