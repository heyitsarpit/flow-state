import { Effect, Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import { Case, type Scenario, variants } from "../dsl/case.ts";
import { Cells, Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";

const KEY = { intentId: "pi1" };
const CART = { cartId: "c1", intentId: "pi1" };
const CAPTURABLE = Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } });

type Shopper = Actor<typeof Pay>;

const shopper = Case.useSync((c) => ({ c, shopper: c.actor(Pay, "shopper-1") }));
const cellsShopper = Case.useSync((c) => ({ c, shopper: c.actor(Cells, "shopper-1") }));

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
 * The Pay cases `PAY-14` and `PAY-15`, ported from the prototype suite with the same steps and
 * expectations.
 *
 * **Details**
 *
 * - `PAY-14` drops the boot-frame, replay and evidence reads, which the Port does not expose.
 * - `PAY-15` runs on the `pay` fixture, which the prototype's `cells` fixture extends only with an
 *   `AbortPay` handler; its `cancel-idle` and `cancel-on-wire` variants run on `cells`. Its
 *   `dispose-held` variant is in `disposal.ts`.
 */
export const pay1415Scenarios: ReadonlyArray<Scenario> = [
  {
    id: "PAY-14",
    cites: ["Restore R3", "WriteLanes R10"],
    fixtures: [Pay],
    run: reloadOnWire,
  },
  ...variants(
    {
      id: "PAY-15",
      cites: ["WriteLanes R2", "WriteLanes R5", "WriteLanes R7", "WriteLanes R8", "Restore R3"],
      fixtures: [Pay],
    },
    {
      "press-pay-while-held": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", Answer.Lost());
        yield* pay(s);
        yield* s.state("PAYING");
        yield* c.eq("declined", yield* lastReason(c, "pay"), "Rejected");
        yield* c.eq("still held", (yield* row(s))?.uncertain, true);
        yield* c.eq("nothing sent", yield* sent(c, "pay"), 1);
      }),
      "busy-then-new-write": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", Answer.Fail({ tag: "Busy", fields: { retryAfterMs: 500 } }));
        yield* s.state("WAITING");
        yield* c.eq("resolved", yield* row(s), undefined);
        yield* c.advance(500);
        yield* s.state("PAYING");
        yield* c.ack;
        yield* c.eq("rule 19: a new id after a definite failure", (yield* c.keys("pay")).length, 2);
      }),
      "reload-holds-exactly-once": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", Answer.Lost());
        yield* c.reload;
        yield* s.state("UNSURE");
        yield* c.eq("uncertain", (yield* row(s))?.uncertain, true);
        yield* c.eq(
          "delivered once",
          (yield* c.endings("pay")).filter((e) => e.reason === "Restored").length,
          1,
        );
      }),
      "dead-activation-timer": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.advance(1000);
        yield* c.answer("pay", Answer.Lost());
        yield* s.state("UNSURE");
        yield* c.advance(7500);
        yield* c.eq("two ticks by 8500", yield* sent(c, "intent"), 2);
      }),
      "retry-budget": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", Answer.Lost());

        for (let i = 1; i <= 3; i++) {
          yield* c.advance(3000);
          yield* c.answer("order", Answer.Ok({ value: null }));
          yield* c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
          yield* s.state("PAYING");
          yield* c.ack;
          yield* c.eq("retryCount", (yield* row(s))?.retryCount, i);
          yield* c.answer("pay", Answer.Lost());
          yield* s.state("UNSURE");
        }

        yield* c.advance(3000);
        yield* c.answer("order", Answer.Ok({ value: null }));
        yield* c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        yield* s.state("UNSURE");
        yield* c.eq(
          "four sends, one id",
          [yield* sent(c, "pay"), (yield* c.keys("pay")).length],
          [4, 1],
        );
      }),
    },
  ),
  ...variants(
    {
      id: "PAY-15",
      cites: ["WriteLanes R14"],
      fixtures: [Cells],
    },
    {
      "cancel-idle": Effect.gen(function* () {
        const { c, shopper: s } = yield* cellsShopper;
        yield* s.ensure;
        yield* s.send("Start", CART);
        yield* s.send("AbortPay", {});
        yield* s.state("CARD");
        yield* c.eq("nothing", yield* c.evidence("Released"), 0);
        yield* c.eq(
          "no evidence either: the cell is nothing",
          yield* c.evidence("NothingToResend"),
          0,
        );
      }),
      "cancel-on-wire": Effect.gen(function* () {
        const { c, shopper: s } = yield* cellsShopper;
        yield* s.ensure;
        yield* s.send("Start", CART);
        yield* s.send("PayRequested", { paymentMethodId: "visa" });
        yield* c.ack;
        yield* s.send("AbortPay", {});
        yield* s.state("UNSURE");
      }),
    },
  ),
];
