import { Effect, Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import { Case, type Scenario } from "../dsl/case.ts";
import { Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";

const KEY = { intentId: "pi1" };
const CART = { cartId: "c1", intentId: "pi1" };
const CAPTURABLE = Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } });

type Shopper = Actor<typeof Pay>;

const shopper = Case.useSync((c) => ({ c, shopper: c.actor(Pay, "shopper-1") }));

const pay = (s: Shopper) => s.send("PayRequested", { paymentMethodId: "visa" });

const onWire = Effect.gen(function* () {
  const { c, shopper: s } = yield* shopper;
  yield* s.ensure;
  yield* s.send("Start", CART);
  yield* pay(s);
  yield* c.ack;
});

const row = (s: Shopper) => Effect.map(s.row("pay", KEY), Option.getOrUndefined);

const lastReason = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.endings(operation), (endings) => endings.at(-1)?.reason);

const sent = (c: typeof Case.Service, operation: string) =>
  Effect.map(c.requests(operation), (requests) => requests.length);

const toResend = Effect.gen(function* () {
  const { c, shopper: s } = yield* shopper;
  yield* onWire;
  yield* c.answer("pay", Answer.Lost());
  yield* s.state("UNSURE");
  yield* c.eq("charges", yield* c.landed("pay"), 0);
  yield* c.advance(3000);
  yield* c.answer("order", Answer.Ok({ value: null }));
  yield* c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
  yield* s.state("PAYING");
  yield* c.eq("not sent before capture", yield* sent(c, "pay"), 1);
  yield* c.ack;
  yield* c.eq("re-sent after capture", yield* sent(c, "pay"), 2);
  yield* c.eq("same id", (yield* c.keys("pay")).length, 1);
});

/**
 * The Pay cases of the first slice, ported from the prototype suite's `PAY-01` to `PAY-05` with
 * the same steps and expectations.
 */
export const payScenarios: ReadonlyArray<Scenario> = [
  {
    id: "PAY-01",
    cites: ["WriteLanes R2", "WriteLanes R5", "WriteLanes R8", "WriteAhead R4"],
    fixtures: [Pay],
    run: Effect.gen(function* () {
      const { c, shopper: s } = yield* shopper;
      yield* s.ensure;
      yield* s.send("Start", CART);
      yield* s.state("CARD");
      yield* pay(s);
      yield* s.state("PAYING");
      yield* c.eq("pending", (yield* row(s))?.pending, true);
      yield* c.eq("no send before ack", yield* sent(c, "pay"), 0);
      yield* c.ack;
      yield* c.eq("sent", yield* sent(c, "pay"), 1);
      yield* c.answer("pay", CAPTURABLE);
      yield* s.state("PLACING");
      yield* c.eq("lane gone", yield* row(s), undefined);
      yield* c.eq("place waits", yield* sent(c, "place"), 0);
      yield* c.ack;
      yield* c.eq("place sent", yield* sent(c, "place"), 1);
      yield* c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
      yield* s.state("PAID");
      yield* c.eq("receipt", (yield* s.memory).receipt, {
        orderId: "o1",
        afterUnsure: false,
        alreadyPlaced: false,
      });
      yield* c.eq("charges", yield* c.landed("pay"), 1);
    }),
  },
  {
    id: "PAY-02",
    cites: ["WriteLanes R7", "WriteLanes R3"],
    fixtures: [Pay],
    run: Effect.gen(function* () {
      const { c, shopper: s } = yield* shopper;
      yield* onWire;
      yield* pay(s);
      yield* s.state("PAYING");
      yield* c.eq("requests", yield* sent(c, "pay"), 1);
      yield* c.eq("notice", (yield* s.memory).notice, "");
      yield* c.eq("decline ending", yield* lastReason(c, "pay"), "Rejected");
    }),
  },
  {
    id: "PAY-03",
    cites: ["WriteLanes R14", "WriteLanes R8"],
    fixtures: [Pay],
    run: Effect.gen(function* () {
      const { c, shopper: s } = yield* shopper;
      yield* onWire;
      yield* c.answer(
        "pay",
        Answer.LostButLanded({ value: { status: "requires_capture", clientSecret: "" } }),
      );
      yield* s.state("UNSURE");
      yield* c.eq("uncertain", (yield* row(s))?.uncertain, true);
      yield* c.eq("afterUnsure", (yield* s.memory).afterUnsure, true);
      yield* c.eq("charges", yield* c.landed("pay"), 1);
      yield* c.advance(3000);
      yield* c.eq("intent read", yield* sent(c, "intent"), 1);
      yield* c.eq("order read", yield* sent(c, "order"), 1);
      yield* c.answer("intent", Answer.Ok({ value: { status: "requires_capture" } }));
      yield* s.state("PLACING");
      yield* c.eq("released", yield* row(s), undefined);
      yield* c.eq("evidence", yield* c.evidence("Released"), 1);
      yield* c.eq("no re-send", yield* sent(c, "pay"), 1);
      yield* c.answer("order", Answer.Ok({ value: null }));
      yield* s.state("PLACING");
      yield* c.ack;
      yield* c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
      yield* s.state("PAID");
      yield* c.eq("afterUnsure receipt", (yield* s.memory).receipt, {
        orderId: "o1",
        afterUnsure: true,
        alreadyPlaced: false,
      });
      yield* c.eq("charges", yield* c.landed("pay"), 1);
    }),
  },
  {
    id: "PAY-04",
    cites: ["WriteLanes R8", "WriteLanes R5"],
    fixtures: [Pay],
    run: Effect.gen(function* () {
      const { c, shopper: s } = yield* shopper;
      yield* toResend;
      yield* c.eq("retryCount", (yield* row(s))?.retryCount, 1);
      yield* c.answer("pay", CAPTURABLE);
      yield* s.state("PLACING");
      yield* c.eq("charges", yield* c.landed("pay"), 1);
      yield* c.eq("distinct keys", (yield* c.keys("pay")).length, 1);
      yield* c.eq("afterUnsure", (yield* s.memory).afterUnsure, true);
    }),
  },
  {
    id: "PAY-05",
    cites: ["WriteLanes R2"],
    fixtures: [Pay],
    run: Effect.gen(function* () {
      const { c, shopper: s } = yield* shopper;
      yield* toResend;
      const notice = (yield* s.memory).notice;
      yield* c.answer(
        "pay",
        Answer.Fail({ tag: "CardDeclined", fields: { code: "card_declined" } }),
      );
      yield* s.state("UNSURE");
      yield* c.eq("uncertain", (yield* row(s))?.uncertain, true);
      yield* c.eq("reason", yield* lastReason(c, "pay"), "StillUnknown");
      yield* c.eq("notice unchanged", (yield* s.memory).notice, notice);
    }),
  },
];
