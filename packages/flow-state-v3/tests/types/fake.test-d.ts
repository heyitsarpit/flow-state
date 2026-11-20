import { Effect, Exit, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import {
  type ControlWord,
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
      // @ts-expect-error Stories R8: `bump` is the endpoint's name, and the control would replace it
      controls: { bump: clash },
      lost: () => new Error("lost"),
    });

    void clashing;
    expectTypeOf(Counter.bump).toEqualTypeOf<EndpointHandle<{ readonly n: number }>>();
    expectTypeOf(
      Fake.server("types/fake/Fine", {
        truth: Truth,
        initial: { count: 0 },
        endpoints: { bump },
        controls: { reset: clash },
        lost: () => new Error("lost"),
      }).reset({}),
    ).toEqualTypeOf<ControlWord>();
    expectTypeOf(Counter.reset).toEqualTypeOf<(input: { readonly n: number }) => ControlWord>();
  });
});

// A sample's failures are the world words a generated run injects: control words, and the damaged
// records `Fake.storage.put` writes, which three fixtures inject as failures. The set stays open.
describe("Stories R8: a sample's failures are world words", () => {
  it("a control word and a damaged record are both failures", () => {
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

    const failures = [Counter.reset({ n: 0 }), Fake.storage.put("actor/x", "{}")];

    expectTypeOf(
      samplesOf({ ...common, id: "types/fake/failures", failures }).failures,
    ).toEqualTypeOf<ReadonlyArray<WorldWord>>();
  });
});

describe("Stories R8, R9: an endpoint's port names every failure a caller can see", () => {
  it("a cleanup failure is raised only in an interrupted call, which no caller awaits", () => {
    const served = Effect.flatMap(Counter, (service) => service.bump({ n: 1 }));

    expectTypeOf<Effect.Error<typeof served>>().toEqualTypeOf<Error>();
    expectTypeOf<Effect.Error<typeof served>>().not.toEqualTypeOf<Error | FakeCleanupFailed>();
  });
});
