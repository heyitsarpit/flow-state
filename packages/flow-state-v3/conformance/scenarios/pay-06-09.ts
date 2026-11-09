import { Effect, Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import { Case, type Scenario, variants } from "../dsl/case.ts";
import { Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";

const KEY = { intentId: "pi1" };
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

const row = (s: Shopper) => Effect.map(s.row("pay", KEY), Option.getOrUndefined);

const lastReason = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.endings(operation), (endings) => endings.at(-1)?.reason);

const sent = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.requests(operation), (requests) => requests.length);

const reloadOnWire = Effect.gen(function* () {
  const { c, shopper: s } = yield* shopper;
  yield* onWire;
  yield* c.reload;
  yield* s.state("UNSURE");
  yield* c.eq("uncertain", (yield* row(s))?.uncertain, true);
  yield* c.eq("reason", yield* lastReason(c, "pay"), "Restored");
  yield* c.eq("requests", yield* sent(c, "pay"), 1);
  yield* c.answerLate("pay", CAPTURABLE);
  yield* c.advance(3000);
  yield* c.answer("order", Answer.Ok({ value: null }));
  yield* c.answer("intent", Answer.Ok({ value: { status: "requires_capture" } }));
  yield* s.state("PLACING");
  yield* c.ack;
  yield* c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
  yield* s.state("PAID");
  yield* c.eq("charges", yield* c.landed("pay"), 1);
});

/**
 * The Pay cases `PAY-06` to `PAY-09`, ported from the prototype suite with the same steps and
 * expectations.
 */
export const pay0609Scenarios: ReadonlyArray<Scenario> = [
  ...variants(
    {
      id: "PAY-06",
      cites: ["WriteLanes R2", "WriteLanes R8", "WriteLanes R10"],
      fixtures: [Pay],
    },
    {
      interruptible: Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", Answer.Never());
        yield* c.advance(8000);
        yield* s.state("PAYING");
        yield* c.eq("notice", (yield* s.memory).notice, "Still confirming with your bank…");
        yield* c.eq("pending", (yield* row(s))?.pending, true);
        yield* c.advance(52000);
        yield* s.state("UNSURE");
        yield* c.eq("uncertain", (yield* row(s))?.uncertain, true);
        yield* c.eq("an unknown", (yield* c.endings("pay")).at(-1)?.channel, "unknown");
        yield* c.answerLate("pay", CAPTURABLE);
        yield* s.state("UNSURE");
        yield* c.eq("uncertain", (yield* row(s))?.uncertain, true);
        yield* c.eq("charges", yield* c.landed("pay"), 1);
        yield* c.eq("one ending", (yield* c.endings("pay")).length, 1);
      }),
      uninterruptible: Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* s.ensure;
        yield* c.uninterruptible("pay");
        yield* start(s);
        yield* pay(s);
        yield* c.ack;
        yield* c.advance(60000);
        yield* s.state("UNSURE");
        yield* c.answerLate("pay", CAPTURABLE);
        yield* s.state("UNSURE");
        yield* c.eq("one ending", (yield* c.endings("pay")).length, 1);
      }),
    },
  ),
  ...variants(
    {
      id: "PAY-07",
      cites: ["WriteLanes R16", "WriteLanes R7"],
      fixtures: [Pay],
    },
    {
      leaveMidCharge: Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* s.send("Leave", {});
        yield* s.state("LEFT");
        yield* c.eq("still pending", (yield* row(s))?.pending, true);
        yield* c.answer("pay", CAPTURABLE);
        yield* s.state("LEFT");
        yield* c.ack;
        yield* c.eq("void sent", yield* sent(c, "void"), 1);
        yield* c.answer("void", Answer.Ok({ value: {} }));
        yield* s.state("LEFT");
        yield* c.eq("notice", (yield* s.memory).notice, "The hold on your card was released.");
        yield* c.eq("authorized", (yield* s.memory).authorized, false);
      }),
      "late-in-a-new-PAYING": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* s.send("Leave", {});
        yield* start(s);
        yield* pay(s);
        yield* s.state("PAYING");
        yield* c.answer("pay", CAPTURABLE);
        yield* s.state("PAYING");
        yield* c.eq("lane gone", yield* row(s), undefined);
        yield* c.eq("charges", yield* c.landed("pay"), 1);
      }),
      "late-may-not-leave": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", CAPTURABLE);
        yield* c.ack;
        yield* s.send("Leave", {});
        yield* start(s);
        yield* pay(s);
        yield* c.ack;
        yield* c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
        yield* s.state("PAYING");
        yield* c.eq("denied", (yield* c.denials).at(-1), ["LateMayNotLeave"]);
      }),
    },
  ),
  ...variants(
    {
      id: "PAY-08",
      cites: ["Restore R1", "Restore R2", "WriteLanes R8"],
      fixtures: [Pay],
    },
    {
      reloadDuringCharge: reloadOnWire,
      "reload-while-reconciling": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", Answer.Lost());
        yield* c.advance(1000);
        yield* c.reload;
        yield* s.state("UNSURE");
        yield* c.eq("uncertain", (yield* row(s))?.uncertain, true);
        yield* c.advance(1999);
        yield* c.eq("not yet", yield* sent(c, "intent"), 0);
        yield* c.advance(1);
        yield* c.eq("the saved timer fired at its saved time", yield* sent(c, "intent"), 1);
      }),
    },
  ),
  ...variants(
    {
      id: "PAY-09",
      cites: ["WriteAhead R10", "Restore R1"],
      fixtures: [Pay],
    },
    {
      "ack-not-stored": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* s.ensure;
        yield* start(s);
        yield* pay(s);
        yield* c.reload;
        yield* c.eq("requests", yield* sent(c, "pay"), 0);
        yield* s.state("CARD");
        yield* c.eq("no notice: the click is gone with its process", (yield* s.memory).notice, "");
        yield* c.eq("charges", yield* c.landed("pay"), 0);
        yield* c.eq("row", yield* row(s), undefined);
      }),
      "ack-stored-confirmation-lost": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* s.ensure;
        yield* start(s);
        yield* pay(s);
        yield* c.answerStorage("landNoAck", Option.none());
        yield* c.reload;
        yield* c.eq("requests", yield* sent(c, "pay"), 0);
        yield* s.state("UNSURE");
        yield* c.eq("reason", yield* lastReason(c, "pay"), "Restored");
        yield* c.eq("uncertain", (yield* row(s))?.uncertain, true);
      }),
    },
  ),
];
