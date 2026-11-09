import { Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import { type Case, type Scenario, variants } from "../dsl/case.ts";
import { Cells, Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";

const KEY = { intentId: "pi1" };
const CART = { cartId: "c1", intentId: "pi1" };
const CAPTURABLE = Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } });

type Shopper = Actor<typeof Pay>;

const shopper = (c: Case) => c.actor(Pay, "shopper-1");
const cellsShopper = (c: Case) => c.actor(Cells, "shopper-1");

const pay = (s: Shopper) => s.send("PayRequested", { paymentMethodId: "visa" });

const onWire = (c: Case) => {
  const s = shopper(c);
  s.ensure();
  s.send("Start", CART);
  pay(s);
  c.ack();
};

const row = (s: Shopper) => Option.getOrUndefined(s.row("pay", KEY));

const lastReason = (c: Case, operation: string) => c.endings(operation).at(-1)?.reason;

const sent = (c: Case, operation: string) => c.requests(operation).length;

const reloadOnWire = (c: Case) => {
  const s = shopper(c);
  onWire(c);
  c.reload();
  s.state("UNSURE");
  c.eq("uncertain", row(s)?.uncertain, true);
  c.eq("reason", lastReason(c, "pay"), "Restored");
  c.eq("requests", sent(c, "pay"), 1);
  c.answerLate("pay", CAPTURABLE);
  c.advance(3000);
  c.answer("order", Answer.Ok({ value: null }));
  c.answer("intent", Answer.Ok({ value: { status: "requires_capture" } }));
  s.state("PLACING");
  c.ack();
  c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
  s.state("PAID");
  c.eq("charges", c.landed("pay"), 1);
};

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
      "press-pay-while-held": (c) => {
        const s = shopper(c);
        onWire(c);
        c.answer("pay", Answer.Lost());
        pay(s);
        s.state("PAYING");
        c.eq("declined", lastReason(c, "pay"), "Rejected");
        c.eq("still held", row(s)?.uncertain, true);
        c.eq("nothing sent", sent(c, "pay"), 1);
      },
      "busy-then-new-write": (c) => {
        const s = shopper(c);
        onWire(c);
        c.answer("pay", Answer.Fail({ tag: "Busy", fields: { retryAfterMs: 500 } }));
        s.state("WAITING");
        c.eq("resolved", row(s), undefined);
        c.advance(500);
        s.state("PAYING");
        c.ack();
        c.eq("rule 19: a new id after a definite failure", c.keys("pay").length, 2);
      },
      "reload-holds-exactly-once": (c) => {
        const s = shopper(c);
        onWire(c);
        c.answer("pay", Answer.Lost());
        c.reload();
        s.state("UNSURE");
        c.eq("uncertain", row(s)?.uncertain, true);
        c.eq("delivered once", c.endings("pay").filter((e) => e.reason === "Restored").length, 1);
      },
      "dead-activation-timer": (c) => {
        const s = shopper(c);
        onWire(c);
        c.advance(1000);
        c.answer("pay", Answer.Lost());
        s.state("UNSURE");
        c.advance(7500);
        c.eq("two ticks by 8500", sent(c, "intent"), 2);
      },
      "retry-budget": (c) => {
        const s = shopper(c);
        onWire(c);
        c.answer("pay", Answer.Lost());

        for (let i = 1; i <= 3; i++) {
          c.advance(3000);
          c.answer("order", Answer.Ok({ value: null }));
          c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
          s.state("PAYING");
          c.ack();
          c.eq("retryCount", row(s)?.retryCount, i);
          c.answer("pay", Answer.Lost());
          s.state("UNSURE");
        }

        c.advance(3000);
        c.answer("order", Answer.Ok({ value: null }));
        c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        s.state("UNSURE");
        c.eq("four sends, one id", [sent(c, "pay"), c.keys("pay").length], [4, 1]);
      },
    },
  ),
  ...variants(
    {
      id: "PAY-15",
      cites: ["WriteLanes R14"],
      fixtures: [Cells],
    },
    {
      "cancel-idle": (c) => {
        const s = cellsShopper(c);
        s.ensure();
        s.send("Start", CART);
        s.send("AbortPay", {});
        s.state("CARD");
        c.eq("nothing", c.evidence("Released"), 0);
        c.eq("no evidence either: the cell is nothing", c.evidence("NothingToResend"), 0);
      },
      "cancel-on-wire": (c) => {
        const s = cellsShopper(c);
        s.ensure();
        s.send("Start", CART);
        s.send("PayRequested", { paymentMethodId: "visa" });
        c.ack();
        s.send("AbortPay", {});
        s.state("UNSURE");
      },
    },
  ),
];
