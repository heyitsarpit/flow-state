// @effect-diagnostics missingEffectContext:off -- the wrong lines that a contract's services list refuses also miss a service in Effect's own check
import { Context, Effect, Exit, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { type ControlWord, type EndpointHandle, Fake } from "../../src/host/testing/index.ts";
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
import { layerIndexedDb } from "../../src/host/persistence.ts";

// Each `@ts-expect-error` names the rule its line breaks; beside it the correct use of the same
// parameter is asserted exactly. Construction still refuses a body, alternative or list key the
// types did not see, and the turn refuses a returned key whole.

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
    expectTypeOf(
      machine(Pay, ({ S }) => ({
        default: S.IDLE,
        on: { go: { updateMemory: ({ memory }) => ({ count: memory.count + 1 }) } },
      })),
    ).toEqualTypeOf<Machine<typeof Pay>>();

    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      on: {
        go: {
          // @ts-expect-error Compile R7: `who` is an input field, which names the actor
          updateMemory: ({ memory }) => {
            expectTypeOf(memory).toEqualTypeOf<{ readonly who: string; readonly count: number }>();

            return { count: memory.count + 1, who: "x" };
          },
        },
      },
    }));
  });

  // A body function's result is no fresh literal, so TypeScript runs no excess-key check on it:
  // machine captures the body as written and marks each key its slot lacks, here in a record
  // updateMemory returns.
  it("Types R2: a misspelt field beside a writable one is refused on the returned record", () => {
    expectTypeOf(
      machine(Pay, ({ S }) => ({
        default: S.IDLE,
        on: { go: { target: S.ON, updateMemory: () => ({ count: 1 }) } },
      })),
    ).toEqualTypeOf<Machine<typeof Pay>>();

    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Types R2: `cuont` is no field of Pay's memory
      on: { go: { updateMemory: () => ({ count: 1, cuont: 2 }) } },
    }));
  });

  it("the writable field alone compiles; the input field alone is refused", () => {
    expectTypeOf(
      machine(Pay, ({ S }) => ({
        default: S.IDLE,
        on: { go: { updateMemory: () => ({ count: 1 }) } },
      })),
    ).toEqualTypeOf<Machine<typeof Pay>>();

    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Compile R7: `who` is no writable field
      on: { go: { updateMemory: () => ({ who: "x" }) } },
    }));
  });
});

// Each misspelt key is a type error on that key, beside a correctly spelt sibling, so the weak-type
// check TypeScript would otherwise rely on never hides it; construction refuses the same keys
// UnknownField at load (tests/compile/construction.test.ts, Compile R4).
const Wizard = definition({
  id: "types/ExcessWizard",
  states: ["IDLE", "ON", { MORE: ["A", "B"] }],
  events: { go: {} },
  internalEvents: { Tick: {} },
  memory: { count: Flow.initial(Schema.Number, 0) },
  schedules: { tick: { pausedBy: ["Away"] } },
});

describe("Types R2: a machine body is exact, at every depth", () => {
  it("a misspelt body key", () => {
    expectTypeOf(
      machine(Pay, ({ S }) => ({
        default: S.IDLE,
        on: { go: { target: S.ON, updateMemory: () => ({ count: 1 }) } },
      })),
    ).toEqualTypeOf<Machine<typeof Pay>>();

    // @ts-expect-error Types R2: `onn` is no body key
    machine(Pay, ({ S }) => ({ default: S.IDLE, onn: {} }));
  });

  it("a misspelt target beside the target", () => {
    expectTypeOf(
      machine(Wizard, ({ S }) => ({
        default: S.IDLE,
        on: { go: { target: S.ON, guard: [], actions: [] } },
        states: { ON: {} },
      })),
    ).toEqualTypeOf<Machine<typeof Wizard>>();

    machine(Wizard, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Types R2: `taget` is no alternative key
      on: { go: { taget: S.ON, target: S.ON } },
    }));
  });

  it("a misspelt updateMemory beside a target", () => {
    expectTypeOf(
      machine(Pay, ({ S }) => ({
        default: S.IDLE,
        on: { go: { target: S.ON, updateMemory: () => ({ count: 1 }) } },
      })),
    ).toEqualTypeOf<Machine<typeof Pay>>();

    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Types R2: `updateMemry` is no alternative key
      on: { go: { target: S.ON, updateMemry: () => ({}) } },
    }));
  });

  it("a misspelt event name under on, beside a declared one", () => {
    expectTypeOf(
      machine(Pay, ({ S }) => ({
        default: S.IDLE,
        on: { go: { target: S.ON }, Ping: {} },
      })),
    ).toEqualTypeOf<Machine<typeof Pay>>();

    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Types R2: `Pnig` is no event of Pay
      on: { go: { target: S.ON }, Pnig: {} },
    }));
  });

  it("a misspelt schedule name, beside a declared one", () => {
    expectTypeOf(
      machine(Wizard, ({ S, E }) => ({
        default: S.IDLE,
        states: {
          ON: {
            schedules: { tick: { schedule: 1000, send: E.Tick, paused: { Away: () => false } } },
          },
        },
      })),
    ).toEqualTypeOf<Machine<typeof Wizard>>();

    machine(Wizard, ({ S, E }) => ({
      default: S.IDLE,
      states: {
        ON: {
          // oxlint-disable-next-line flow-state/no-undeclared-schedule -- the undeclared name this test shows refused
          schedules: {
            tick: { schedule: 1000, send: E.Tick, paused: { Away: () => false } },
            // @ts-expect-error Types R2: `tikc` is no schedule of Wizard
            tikc: { schedule: 1000, send: E.Tick },
          },
        },
      },
    }));
  });

  it("a misspelt guard beside a target", () => {
    expectTypeOf(
      machine(Wizard, ({ S }) => ({
        default: S.IDLE,
        on: { go: { target: S.ON, guard: [], actions: [] } },
        states: { ON: {} },
      })),
    ).toEqualTypeOf<Machine<typeof Wizard>>();

    machine(Wizard, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Types R2: `gaurd` is no alternative key
      on: { go: { target: S.ON, gaurd: [] } },
    }));
  });

  it("a misspelt actions beside a target", () => {
    expectTypeOf(
      machine(Wizard, ({ S }) => ({
        default: S.IDLE,
        on: { go: { target: S.ON, guard: [], actions: [] } },
        states: { ON: {} },
      })),
    ).toEqualTypeOf<Machine<typeof Wizard>>();

    machine(Wizard, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Types R2: `actionss` is no alternative key
      on: { go: { target: S.ON, actionss: [] } },
    }));
  });

  it("an unknown key in a handler list", () => {
    expectTypeOf(
      machine(Pay, ({ S }) => ({
        default: S.IDLE,
        on: { go: { target: S.ON, updateMemory: () => ({ count: 1 }) } },
      })),
    ).toEqualTypeOf<Machine<typeof Pay>>();

    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Types R2: `bogus` is no alternative key
      on: { go: [{ target: S.ON, bogus: 1 }] },
    }));
  });

  it("a misspelt state beside a declared one, and a misspelt key in a nested state", () => {
    expectTypeOf(
      machine(Wizard, ({ S }) => ({
        default: S.IDLE,
        on: { go: { target: S.ON, guard: [], actions: [] } },
        states: { ON: {} },
      })),
    ).toEqualTypeOf<Machine<typeof Wizard>>();

    machine(Wizard, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Types R2: `Zed` is no state of Wizard
      states: { ON: {}, Zed: {} },
    }));

    machine(Wizard, ({ S }) => ({
      default: S.IDLE,
      states: {
        MORE: {
          default: S.MORE.A,
          // @ts-expect-error Types R2: `taget` is no alternative key, at depth 3
          states: { A: { on: { go: { target: S.MORE.B, taget: S.IDLE } } } },
        },
      },
    }));
  });

  it("a misspelt key in a schedule's placement, and a pause reason with no callback", () => {
    expectTypeOf(
      machine(Wizard, ({ S, E }) => ({
        default: S.IDLE,
        states: {
          ON: {
            schedules: { tick: { schedule: 1000, send: E.Tick, paused: { Away: () => false } } },
          },
        },
      })),
    ).toEqualTypeOf<Machine<typeof Wizard>>();

    machine(Wizard, ({ S, E }) => ({
      default: S.IDLE,
      states: {
        ON: {
          schedules: {
            tick: {
              schedule: 1000,
              send: E.Tick,
              // @ts-expect-error Types R2: `sned` is no placement key
              sned: E.Tick,
              paused: { Away: () => false },
            },
          },
        },
      },
    }));

    machine(Wizard, ({ S, E }) => ({
      default: S.IDLE,
      states: {
        ON: {
          schedules: {
            // @ts-expect-error Types R8: a declared reason needs its callback, never undefined
            tick: { schedule: 1000, send: E.Tick, paused: { Away: undefined } },
          },
        },
      },
    }));
  });

  it("the same bodies spelt right compile", () => {
    expectTypeOf(
      machine(Wizard, ({ S, E }) => ({
        default: S.IDLE,
        on: { go: [{ target: S.ON, guard: [], actions: [], updateMemory: () => ({ count: 1 }) }] },
        states: {
          ON: {
            schedules: {
              tick: { schedule: 1000, send: E.Tick, paused: { Away: () => false } },
            },
          },
          MORE: {
            default: S.MORE.A,
            states: { A: { on: { go: { target: S.MORE.B } } } },
          },
        },
      })),
    ).toEqualTypeOf<Machine<typeof Wizard>>();

    expectTypeOf(
      machine(Pay, ({ S }) => ({ default: S.IDLE, states: { ON: { on: { go: S.IDLE } } } })),
    ).toEqualTypeOf<Machine<typeof Pay>>();

    machine(Pay, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Types R2: `onn` is no state key
      states: { ON: { onn: {} } },
    }));
  });
});

// `Opaque` matches an Effect value by its callable `pipe`, so an event named `pipe`, whose handler
// is no function, keeps the typo check on for its record.
const Piped = definition({
  id: "types/ExcessPiped",
  states: ["IDLE", "ON"],
  events: { go: {}, pipe: {} },
  memory: {},
});

describe("Types R2: a field named `pipe` must not turn the typo check off", () => {
  it("a misspelt event beside `pipe` is refused, and `pipe` alone compiles", () => {
    machine(Piped, ({ S }) => ({
      default: S.IDLE,
      // @ts-expect-error Types R2: stopp is no event of Piped
      on: { pipe: S.ON, stopp: S.IDLE },
    }));

    expectTypeOf(
      machine(Piped, ({ S }) => ({ default: S.IDLE, on: { pipe: S.ON, go: S.IDLE } })),
    ).toEqualTypeOf<Machine<typeof Piped>>();
  });
});

describe("Runtime O1: an app entry and the setup's options are exact", () => {
  const ref = actorRef(PayMachine, { who: "a" });

  it("a misspelt entry key, and a ref given as an entry", () => {
    // @ts-expect-error Runtime O1: contxt is no entry key
    app({ id: "types/a", machines: { c: { machine: PayMachine, contxt: { x: ref } } } });
    // @ts-expect-error Runtime O1: a ref is no machine
    app({ id: "types/b", machines: { c: ref } });

    expectTypeOf(
      app({ id: "types/c", machines: { c: { machine: PayMachine, context: {} } } }).machines.c
        .machine,
    ).toEqualTypeOf<Machine<typeof Pay>>();
  });

  it("persistence and scope only together", () => {
    const shop = app({ id: "types/d", machines: { c: PayMachine } });

    // @ts-expect-error Runtime O1: persistence with no scope never saves
    runtimeSetup({ app: shop, persistence: { captureMs: 0 } });
    // @ts-expect-error Runtime O1: a scope with nothing to save
    runtimeSetup({ app: shop, scope: "s" });

    expectTypeOf(
      runtimeSetup({
        app: shop,
        services: layerIndexedDb(),
        scope: "s",
        persistence: { captureMs: 0 },
      }).construct,
    ).toEqualTypeOf(runtimeSetup({ app: shop }).construct);
  });
});

describe("Compile R14: an event's payload is exact", () => {
  it("a field given to an empty payload", () => {
    // @ts-expect-error Compile R14: Ping has no fields
    Pay.E.Ping({ extra: 1 });

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
      services: [],
      // @ts-expect-error Reads R1: the commit needs CartApi, which services omits
      commit: () => CartApi.use((api) => Effect.succeed(api.hi())),
    });

    transaction({
      id: "types/needs2",
      input: { id: Schema.String },
      key: ["id"],
      concurrency: "reject",
      services: [OtherApi],
      // @ts-expect-error Reads R1: the commit needs CartApi, not the OtherApi services names
      commit: () => CartApi.use((api) => Effect.succeed(api.hi())),
    });

    expectTypeOf(
      transaction({
        id: "types/needs3",
        input: { id: Schema.String },
        key: ["id"],
        concurrency: "reject",
        services: [CartApi],
        commit: () => CartApi.use((api) => Effect.succeed(api.hi())),
      }),
    ).toEqualTypeOf<
      Transaction<{ readonly id: typeof Schema.String }, number, never, CartApi, readonly ["id"]>
    >();
  });
});

describe("Compile R4, R14: a definition's literals are kept", () => {
  it("a hoisted states list widens the tree to text", () => {
    const states = ["IDLE", "ON"];
    // @ts-expect-error Compile R4: a widened states list loses every path's type
    definition({ id: "types/Hoisted", states, events: { go: {} } });

    expectTypeOf(
      definition({ id: "types/Literal", states: ["IDLE", "ON"], events: {} }).S.IDLE["~state"],
    ).toEqualTypeOf<"IDLE" | undefined>();
  });

  it("a duplicate state, an empty compound and an empty id", () => {
    // @ts-expect-error Compile R4: A twice
    definition({ id: "types/Dup", states: ["A", "A"], events: {} });
    // @ts-expect-error Compile R4: a nested name twice
    definition({ id: "types/DupIn", states: [{ P: ["B", "B"] }], events: {} });
    // @ts-expect-error Compile R4: P has no children
    definition({ id: "types/Empty", states: [{ P: [] }], events: {} });
    // @ts-expect-error Compile R4: an empty id
    definition({ id: "", states: ["A"], events: {} });

    const right = {
      id: "types/Right",
      states: ["A", { P: ["B"] }, { Q: ["B"] }],
      events: {},
    } as const;

    expectTypeOf(definition(right).S.P.B["~state"]).toEqualTypeOf<"P.B" | undefined>();
    expectTypeOf(definition(right).S.Q.B["~state"]).toEqualTypeOf<"Q.B" | undefined>();
    expectTypeOf(definition(right).id).toEqualTypeOf<"types/Right">();
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

    void Fake.server("types/S", {
      truth: Truth,
      initial: { count: 0 },
      // @ts-expect-error Stories R8: `lying` reads `extra`, which the truth lacks
      endpoints: { lying },
      // @ts-expect-error Stories R8: `fib` reads `extra` too
      controls: { fib },
      lost: () => new Error("lost"),
    });

    const add = Fake.control({ n: Schema.Number }, (truth: { readonly count: number }, input) => ({
      count: truth.count + input.n,
    }));

    const honestServer = Fake.server("types/H", {
      truth: Truth,
      initial: { count: 0 },
      endpoints: { honest },
      controls: { add },
      lost: () => new Error("lost"),
    });

    expectTypeOf(
      Fake.server("types/H", {
        truth: Truth,
        initial: { count: 0 },
        endpoints: { honest },
        controls: { add },
        lost: () => new Error("lost"),
      }).honest,
    ).toEqualTypeOf<EndpointHandle<{ readonly n: number }>>();
    expectTypeOf(honestServer.add({ n: 1 })).toEqualTypeOf<ControlWord>();
  });
});
