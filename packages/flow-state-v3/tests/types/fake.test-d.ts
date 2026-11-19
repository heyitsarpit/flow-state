import { Effect, Exit, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import {
  type EndpointHandle,
  Fake,
  type FakeCleanupFailed,
  samplesOf,
  Story,
  type WorldWord,
} from "../../src/host/testing/index.ts";
import { app, definition, machine, runtimeSetup } from "../../src/index.ts";

// Inverted: each line marked `wrong` compiles today. When its carrier lands the line fails the
// check: put `@ts-expect-error` on it, naming the rule. Each assertion of today's wide type (the
// `.not` of the narrow type, or the wide type itself) then fails too: make it the exact narrow
// type. Beside each wrong line, the correct use of the same parameter is asserted exactly.

const Truth = Schema.Struct({ count: Schema.Number });

const bump = Fake.call({
  request: { n: Schema.Number },
  success: Schema.Number,
  failure: Schema.Never,
  handle: (truth: { readonly count: number }, request) => ({
    truth: { count: truth.count + request.n },
    exit: Exit.succeed(truth.count),
  }),
});

const reset = Fake.control({ n: Schema.Number }, (truth: { readonly count: number }, input) => ({
  count: Math.min(truth.count, input.n),
}));

const Counter = Fake.server("types/fake/Counter", {
  truth: Truth,
  initial: { count: 0 },
  endpoints: { bump },
  controls: { reset },
  lost: () => new Error("lost"),
});

const Idle = definition({ id: "types/fake/Idle", states: ["A"], events: {} });
const IdleMachine = machine(Idle, ({ S }) => ({ default: S.A }));
const setup = runtimeSetup({ app: app({ id: "types/fake", machines: { idle: IdleMachine } }) });
const story = Story.app(setup, { id: "types/fake", fixtures: [] });

describe("Stories R8: a server's endpoints and controls have distinct names", () => {
  it("a control named as an endpoint", () => {
    const clash = Fake.control({}, (truth: { readonly count: number }) => truth);

    const clashing = Fake.server("types/fake/Clash", {
      truth: Truth,
      initial: { count: 0 },
      endpoints: { bump },
      controls: { bump: clash }, // wrong: `bump` is the endpoint's name; one is lost
      lost: () => new Error("lost"),
    });

    // Today the endpoint's handle and the control's word merge into one key.
    expectTypeOf(clashing.bump).not.toEqualTypeOf(Counter.bump);
    expectTypeOf(Counter.bump).toEqualTypeOf<EndpointHandle<{ readonly n: number }>>();
    expectTypeOf(Counter.reset).toEqualTypeOf<(input: { readonly n: number }) => WorldWord>();
  });
});

describe("Stories R8: a sample's failures are control words", () => {
  it("a storage word given as a failure", () => {
    const common = {
      story,
      names: { setup: "s", fixtures: [] },
      actors: {},
      servers: {},
      landedFailures: [],
      controls: [],
      values: {},
      steps: <S>(s: S) => s,
    };

    samplesOf({ ...common, id: "types/fake/storage", failures: [Fake.storage.hold()] }); // wrong

    expectTypeOf(
      samplesOf({ ...common, id: "types/fake/control", failures: [Counter.reset({ n: 0 })] }).id,
    ).toEqualTypeOf<string>();
  });
});

describe("Stories R8, R9: an endpoint's port names every failure it can return", () => {
  it("a cleanup failure is in the port's error channel", () => {
    const served = Effect.flatMap(Counter, (service) => service.bump({ n: 1 }));

    expectTypeOf<Effect.Error<typeof served>>().not.toEqualTypeOf<Error | FakeCleanupFailed>();
    expectTypeOf<Effect.Error<typeof served>>().toEqualTypeOf<Error>();
  });
});
