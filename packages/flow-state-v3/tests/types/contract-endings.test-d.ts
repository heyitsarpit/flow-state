import { describe, expectTypeOf, it } from "vite-plus/test";
import { Effect, Schema } from "effect";
import { definition, Flow, transaction } from "../../src/index.ts";

class Declined extends Schema.TaggedError<Declined>()("Declined", {}) {}

const order = {
  id: "types/order",
  input: { orderId: Schema.String, cents: Schema.Number },
  key: ["orderId"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.fail(new Declined()),
} as const;

const place = transaction(order);

describe("Operations O1, V1, WriteLanes R4: a contract and its endings", () => {
  it("each wrong line fails to compile beside its exact right one", () => {
    expectTypeOf(
      definition({
        id: "types/Orders",
        states: ["READY"],
        events: {},
        internalEvents: { Placed: {}, Refused: {}, Unsure: Flow.uncertain({}) },
        memory: {},
        operations: ({ E }) => ({
          place: place.outcomes({
            success: E.Placed,
            failure: { Declined: E.Refused },
            unknown: E.Unsure,
          }),
        }),
      }).operations.place["~definition"],
    ).toEqualTypeOf<"types/Orders" | undefined>();

    void definition({
      id: "types/Orders",
      states: ["READY"],
      events: {},
      internalEvents: { Placed: {}, Refused: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      operations: ({ E }) => ({
        place: place.outcomes({
          success: E.Placed,
          failure: {
            Declined: E.Refused,
            // @ts-expect-error a failure key that is not one of the commit's tags (Operations V1)
            Expired: E.Refused,
          },
          unknown: E.Unsure,
        }),
      }),
    });

    // Endings split by origin: Flow's NotSent has its own optional key and is never a failure tag
    // (WriteLanes R4, T16).
    expectTypeOf(
      definition({
        id: "types/Orders",
        states: ["READY"],
        events: {},
        internalEvents: { Placed: {}, Refused: {}, Unsent: {}, Unsure: Flow.uncertain({}) },
        memory: {},
        operations: ({ E }) => ({
          place: place.outcomes({
            success: E.Placed,
            failure: { Declined: E.Refused },
            notSent: E.Unsent,
            unknown: E.Unsure,
          }),
        }),
      }).operations.place["~definition"],
    ).toEqualTypeOf<"types/Orders" | undefined>();

    void definition({
      id: "types/Orders",
      states: ["READY"],
      events: {},
      internalEvents: { Placed: {}, Refused: {}, Unsent: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      operations: ({ E }) => ({
        place: place.outcomes({
          success: E.Placed,
          failure: {
            Declined: E.Refused,
            // @ts-expect-error Flow's NotSent is mapped under notSent, never as a failure tag (WriteLanes R4, T16)
            NotSent: E.Unsent,
          },
          unknown: E.Unsure,
        }),
      }),
    });

    void definition({
      id: "types/Orders",
      states: ["READY"],
      events: {},
      internalEvents: { Placed: {}, Unsure: Flow.uncertain({}) },
      memory: {},
      operations: ({ E }) => ({
        place: place.outcomes({
          success: E.Placed,
          // @ts-expect-error a commit failure tag left unmapped (WriteLanes R4, T16)
          failure: {},
          unknown: E.Unsure,
        }),
      }),
    });

    expectTypeOf(transaction({ ...order, concurrency: "serialize" }).concurrency).toEqualTypeOf<
      "serialize" | "cancel" | "latest" | "reject"
    >();

    void transaction({
      ...order,
      // @ts-expect-error an unknown concurrency (Operations O1, V1)
      concurrency: "queue",
    });

    expectTypeOf(transaction({ ...order, key: ["orderId", "cents"] }).key).toEqualTypeOf<
      readonly ["orderId", "cents"]
    >();

    void transaction({
      ...order,
      // @ts-expect-error a key field that is not an input field (Operations O1, V1)
      key: ["customerId"],
    });

    void transaction({
      id: order.id,
      input: order.input,
      key: order.key,
      concurrency: order.concurrency,
      services: [],
      commit: order.commit,
    });

    // @ts-expect-error a contract with no services (Operations O1, V1)
    void transaction({
      id: order.id,
      input: order.input,
      key: order.key,
      concurrency: order.concurrency,
      commit: order.commit,
    });
  });
});
