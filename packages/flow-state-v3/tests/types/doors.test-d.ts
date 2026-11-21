import { Effect, Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { definition, Flow, transaction } from "../../src/index.ts";

// Inverted pins: each `today` assertion states today's type and fails once the doors land: make
// it the type its comment names.

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

describe("what the core calls on a made value is off its type (Operations R10, I19)", () => {
  it("Operations R10: a bound contract's textOfKey and call, and an operation token's make, are not on their public types", () => {
    // today: each is on the public type. Once internals sit under the internals symbol, flip each
    // to `.not.toHaveProperty`.
    expectTypeOf(Lamp.operations.ping).toHaveProperty("textOfKey");
    expectTypeOf(Lamp.operations.ping).toHaveProperty("call");
    expectTypeOf(Lamp.O.ping.commit(() => ({ id: "x" }))).toHaveProperty("make");
  });
});
