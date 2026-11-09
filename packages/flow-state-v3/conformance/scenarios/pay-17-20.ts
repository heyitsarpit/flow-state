import { Effect, Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import { Case, type Scenario, variants } from "../dsl/case.ts";
import { Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";

const CART = { cartId: "c1", intentId: "pi1" };
const CAPTURABLE = Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } });

type Shopper = Actor<typeof Pay>;

const shopper = Case.useSync((c) => ({ c, shopper: c.actor(Pay, "shopper-1") }));

const pay = (s: Shopper) => s.send("PayRequested", { paymentMethodId: "visa" });

const start = (s: Shopper) => s.send("Start", CART);

const onWire = Effect.gen(function* () {
  const { c, shopper: s } = yield* shopper;
  yield* s.ensure;
  yield* start(s);
  yield* pay(s);
  yield* c.ack;
});

const lastReason = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.endings(operation), (endings) => endings.at(-1)?.reason);

const sent = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.requests(operation), (requests) => requests.length);

const appliedTwice = (c: typeof Case.Service, operation: string) =>
  Effect.map(
    c.landedKeys(operation),
    (keys) => [...new Set(keys)].filter((key) => keys.filter((k) => k === key).length > 1).length,
  );

const serverIntent = (c: typeof Case.Service) =>
  Effect.map(c.landed("pay"), (landed) =>
    Answer.Ok({
      value: { status: landed > 0 ? "requires_capture" : "requires_payment_method" },
    }),
  );

/**
 * The Pay cases `PAY-18` to `PAY-20`, with the prototype suite's steps and expectations.
 *
 * **Details**
 *
 * - `PAY-17` is not here: its five variants (`hook-throws-on-sent`, `hook-throws-on-timer`,
 *   `hook-throws-on-acked`, `hook-throws-on-turn`, `core-throw-is-fatal`) throw inside runtime
 *   modules or the core, which no Port part reaches.
 * - `PAY-19` pins the Pay fixture's own late handlers (Turn R20, R21 route them late; `LEFT` and
 *   no receipt are the fixture's design). Both orders keep one order and one void at the server.
 * - `PAY-20`'s "no second pay" and "once at the server" are Pay's read-first rule (it reads the
 *   intent before any re-send), not a Flow guarantee. The fake server never dedupes by key, so the
 *   pruned-key variant needs no pruning fault.
 */
export const pay1720Scenarios: ReadonlyArray<Scenario> = [
  {
    id: "PAY-18",
    cites: ["WriteAhead R13", "WriteAhead R14"],
    fixtures: [Pay],
    run: Effect.gen(function* () {
      const { c, shopper: s } = yield* shopper;
      yield* s.ensure;
      yield* start(s);
      yield* pay(s);
      yield* c.answerStorage("landNoAck", Option.none());
      yield* c.advance(10_000);
      yield* s.state("PAYING");
      yield* c.eq("never told", (yield* s.memory).notice.includes("haven't been charged"), false);
      yield* c.eq("no send before an acknowledgement is heard", yield* sent(c, "pay"), 0);
      yield* c.reload;
      yield* s.state("UNSURE");
      yield* c.eq("reason", yield* lastReason(c, "pay"), "Restored");
    }),
  },
  ...variants(
    {
      id: "PAY-19",
      cites: ["Turn R20", "Turn R21"],
      fixtures: [Pay],
    },
    {
      "void-answers-first": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", CAPTURABLE);
        yield* c.ack;
        yield* s.send("Leave", {});
        yield* c.ack;
        yield* c.answer("void", Answer.Ok({ value: {} }));
        yield* c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
        yield* s.state("PAID");
        yield* c.eq("both", [yield* c.landed("place"), yield* c.landed("void")], [1, 1]);
      }),
      "place-answers-first": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", CAPTURABLE);
        yield* c.ack;
        yield* s.send("Leave", {});
        yield* c.ack;
        yield* c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
        yield* s.state("LEFT");
        yield* c.answer("void", Answer.Ok({ value: {} }));
        yield* s.state("LEFT");
        yield* c.eq("both", [yield* c.landed("place"), yield* c.landed("void")], [1, 1]);
        yield* c.eq("no receipt", (yield* s.memory).receipt, null);
      }),
    },
  ),
  ...variants(
    {
      id: "PAY-20",
      cites: ["WriteLanes R2", "WriteLanes R5"],
      fixtures: [Pay],
    },
    {
      "a-500-that-landed-is-unknown-and-pay-reads-the-intent": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", Answer.FailButLanded({ tag: "ServerError", fields: {} }));
        yield* s.state("UNSURE");
        yield* c.eq("an unknown", (yield* c.endings("pay")).at(-1)?.channel, "unknown");
        yield* c.eq("charges", yield* c.landed("pay"), 1);
        yield* c.advance(3000);
        yield* c.answer("order", Answer.Ok({ value: null }));
        yield* c.answer("intent", yield* serverIntent(c));
        yield* s.state("PLACING");
        yield* c.eq("no second pay", yield* sent(c, "pay"), 1);
        yield* c.eq("once at the server", yield* appliedTwice(c, "pay"), 0);
      }),
      "a-pruned-key-does-not-charge-twice-since-pay-reads-first": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.answer(
          "pay",
          Answer.LostButLanded({ value: { status: "requires_capture", clientSecret: "" } }),
        );
        yield* c.advance(3000);
        yield* c.answer("order", Answer.Ok({ value: null }));
        yield* c.answer("intent", yield* serverIntent(c));
        yield* s.state("PLACING");
        yield* c.eq("no second pay", yield* sent(c, "pay"), 1);
        yield* c.eq("once at the server", yield* appliedTwice(c, "pay"), 0);
      }),
    },
  ),
];
