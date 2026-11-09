import { Option } from "effect";
import { type Case, type Scenario, variants } from "../dsl/case.ts";
import { Answer } from "../world/network.ts";

const SHOPPER = { machine: "Checkout/Pay", id: "shopper-1" };
const KEY = { intentId: "pi1" };
const CART = { cartId: "c1", intentId: "pi1" };
const CAPTURABLE = Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } });

const pay = (c: Case) => c.send("PayRequested", { paymentMethodId: "visa" });
const start = (c: Case) => c.send("Start", CART);

const onWire = (c: Case) => {
  c.ensure();
  start(c);
  pay(c);
  c.ack();
};

const row = (c: Case) => Option.getOrUndefined(c.row("pay", KEY));

const lastReason = (c: Case, operation: string) => c.endings(operation).at(-1)?.reason;

const reloadOnWire = (c: Case) => {
  onWire(c);
  c.reload();
  c.state("UNSURE");
  c.eq("uncertain", row(c)?.uncertain, true);
  c.eq("reason", lastReason(c, "pay"), "Restored");
  c.eq("requests", c.requests("pay").length, 1);
  c.answerLate("pay", CAPTURABLE);
  c.advance(3000);
  c.answer("order", Answer.Ok({ value: null }));
  c.answer("intent", Answer.Ok({ value: { status: "requires_capture" } }));
  c.state("PLACING");
  c.ack();
  c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
  c.state("PAID");
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
 *   `AbortPay` handler. Its `cancel-idle`, `cancel-on-wire` and `dispose-held` variants are not
 *   ported: they need that handler or a raw runtime dispose, which the Port does not expose.
 */
export const pay1415Scenarios: ReadonlyArray<Scenario> = [
  {
    id: "PAY-14",
    cites: ["Restore R3", "WriteLanes R10"],
    fixtures: ["pay"],
    actor: SHOPPER,
    run: (c) => reloadOnWire(c),
  },
  ...variants(
    {
      id: "PAY-15",
      cites: ["WriteLanes R2", "WriteLanes R5", "WriteLanes R7", "WriteLanes R8", "Restore R3"],
      fixtures: ["pay"],
      actor: SHOPPER,
    },
    {
      "press-pay-while-held"(c) {
        onWire(c);
        c.answer("pay", Answer.Lost());
        pay(c);
        c.state("PAYING");
        c.eq("declined", lastReason(c, "pay"), "Rejected");
        c.eq("still held", row(c)?.uncertain, true);
        c.eq("nothing sent", c.requests("pay").length, 1);
      },
      "busy-then-new-write"(c) {
        onWire(c);
        c.answer("pay", Answer.Fail({ tag: "Busy", fields: { retryAfterMs: 500 } }));
        c.state("WAITING");
        c.eq("resolved", row(c), undefined);
        c.advance(500);
        c.state("PAYING");
        c.ack();
        c.eq("rule 19: a new id after a definite failure", c.keys("pay").length, 2);
      },
      "reload-holds-exactly-once"(c) {
        onWire(c);
        c.answer("pay", Answer.Lost());
        c.reload();
        c.state("UNSURE");
        c.eq("uncertain", row(c)?.uncertain, true);
        c.eq("delivered once", c.endings("pay").filter((e) => e.reason === "Restored").length, 1);
      },
      "dead-activation-timer"(c) {
        onWire(c);
        c.advance(1000);
        c.answer("pay", Answer.Lost());
        c.state("UNSURE");
        c.advance(7500);
        c.eq("two ticks by 8500", c.requests("intent").length, 2);
      },
      "retry-budget"(c) {
        onWire(c);
        c.answer("pay", Answer.Lost());

        for (let i = 1; i <= 3; i++) {
          c.advance(3000);
          c.answer("order", Answer.Ok({ value: null }));
          c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
          c.state("PAYING");
          c.ack();
          c.eq("retryCount", row(c)?.retryCount, i);
          c.answer("pay", Answer.Lost());
          c.state("UNSURE");
        }

        c.advance(3000);
        c.answer("order", Answer.Ok({ value: null }));
        c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        c.state("UNSURE");
        c.eq("four sends, one id", [c.requests("pay").length, c.keys("pay").length], [4, 1]);
      },
    },
  ),
  ...variants(
    {
      id: "PAY-15",
      cites: ["WriteLanes R14"],
      fixtures: ["cells"],
      actor: SHOPPER,
    },
    {
      "cancel-idle"(c) {
        c.ensure();
        start(c);
        c.send("AbortPay", {});
        c.state("CARD");
        c.eq("nothing", c.evidence("Released"), 0);
        c.eq("no evidence either: the cell is nothing", c.evidence("NothingToResend"), 0);
      },
      "cancel-on-wire"(c) {
        onWire(c);
        c.send("AbortPay", {});
        c.state("UNSURE");
      },
    },
  ),
];
