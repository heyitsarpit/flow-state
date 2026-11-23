import { Effect, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { definition, Flow, transaction } from "../../src/index.ts";

const ping = transaction({
  id: "types/doors/ping",
  input: { id: Schema.String },
  key: ["id"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.succeed({}),
});

const Lamp = definition({
  id: "types/doors/Lamp",
  states: ["OFF"],
  events: {},
  internalEvents: { Pinged: {}, Unsure: Flow.uncertain({}) },
  operations: ({ E }) => ({
    ping: ping.outcomes({ success: E.Pinged, failure: {}, unknown: E.Unsure }),
  }),
});

const pingBound = ping.outcomes({ success: Lamp.E.Pinged, failure: {}, unknown: Lamp.E.Unsure });

describe("what the core calls on a made value is off its type (Operations R10, I19)", () => {
  it("Operations R10: a bound contract's textOfKey and call, and an operation token's make, are not on their public types", () => {
    expectTypeOf(pingBound).not.toHaveProperty("textOfKey");
    expectTypeOf(pingBound).not.toHaveProperty("call");
    expectTypeOf(Lamp.O.ping.commit(() => ({ id: "x" }))).not.toHaveProperty("make");
    expectTypeOf(pingBound).toHaveProperty("contract");
    expectTypeOf(Lamp.O.ping.commit(() => ({ id: "x" }))).toHaveProperty("operation");
  });
});
