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
 * The Pay cases `PAY-06` to `PAY-09`, ported from the prototype suite with the same steps and
 * expectations.
 */
export const pay0609Scenarios: ReadonlyArray<Scenario> = [
  ...variants(
    {
      id: "PAY-06",
      cites: ["WriteLanes R2", "WriteLanes R8", "WriteLanes R10"],
      fixtures: ["pay"],
      actor: SHOPPER,
    },
    {
      interruptible(c) {
        onWire(c);
        c.answer("pay", Answer.Never());
        c.advance(8000);
        c.state("PAYING");
        c.eq("notice", c.memory()["notice"], "Still confirming with your bank…");
        c.eq("pending", row(c)?.pending, true);
        c.advance(52000);
        c.state("UNSURE");
        c.eq("uncertain", row(c)?.uncertain, true);
        c.eq("an unknown", c.endings("pay").at(-1)?.channel, "unknown");
        c.answerLate("pay", CAPTURABLE);
        c.state("UNSURE");
        c.eq("uncertain", row(c)?.uncertain, true);
        c.eq("charges", c.landed("pay"), 1);
        c.eq("one ending", c.endings("pay").length, 1);
      },
      uninterruptible(c) {
        c.ensure();
        c.uninterruptible("pay");
        start(c);
        pay(c);
        c.ack();
        c.advance(60000);
        c.state("UNSURE");
        c.answerLate("pay", CAPTURABLE);
        c.state("UNSURE");
        c.eq("one ending", c.endings("pay").length, 1);
      },
    },
  ),
  ...variants(
    {
      id: "PAY-07",
      cites: ["WriteLanes R16", "WriteLanes R7"],
      fixtures: ["pay"],
      actor: SHOPPER,
    },
    {
      leaveMidCharge(c) {
        onWire(c);
        c.send("Leave", {});
        c.state("LEFT");
        c.eq("still pending", row(c)?.pending, true);
        c.answer("pay", CAPTURABLE);
        c.state("LEFT");
        c.ack();
        c.eq("void sent", c.requests("void").length, 1);
        c.answer("void", Answer.Ok({ value: {} }));
        c.state("LEFT");
        c.eq("notice", c.memory()["notice"], "The hold on your card was released.");
        c.eq("authorized", c.memory()["authorized"], false);
      },
      "late-in-a-new-PAYING"(c) {
        onWire(c);
        c.send("Leave", {});
        start(c);
        pay(c);
        c.state("PAYING");
        c.answer("pay", CAPTURABLE);
        c.state("PAYING");
        c.eq("lane gone", row(c), undefined);
        c.eq("charges", c.landed("pay"), 1);
      },
      "late-may-not-leave"(c) {
        onWire(c);
        c.answer("pay", CAPTURABLE);
        c.ack();
        c.send("Leave", {});
        start(c);
        pay(c);
        c.ack();
        c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
        c.state("PAYING");
        c.eq("denied", c.denials().at(-1), ["LateMayNotLeave"]);
      },
    },
  ),
  ...variants(
    {
      id: "PAY-08",
      cites: ["Restore R1", "Restore R2", "WriteLanes R8"],
      fixtures: ["pay"],
      actor: SHOPPER,
    },
    {
      reloadDuringCharge: reloadOnWire,
      "reload-while-reconciling"(c) {
        onWire(c);
        c.answer("pay", Answer.Lost());
        c.advance(1000);
        c.reload();
        c.state("UNSURE");
        c.eq("uncertain", row(c)?.uncertain, true);
        c.advance(1999);
        c.eq("not yet", c.requests("intent").length, 0);
        c.advance(1);
        c.eq("the saved timer fired at its saved time", c.requests("intent").length, 1);
      },
    },
  ),
  ...variants(
    {
      id: "PAY-09",
      cites: ["WriteAhead R10", "Restore R1"],
      fixtures: ["pay"],
      actor: SHOPPER,
    },
    {
      "ack-not-stored"(c) {
        c.ensure();
        start(c);
        pay(c);
        c.reload();
        c.eq("requests", c.requests("pay").length, 0);
        c.state("CARD");
        c.eq("no notice: the click is gone with its process", c.memory()["notice"], "");
        c.eq("charges", c.landed("pay"), 0);
        c.eq("row", row(c), undefined);
      },
      "ack-stored-confirmation-lost"(c) {
        c.ensure();
        start(c);
        pay(c);
        c.answerStorage("landNoAck", Option.none());
        c.reload();
        c.eq("requests", c.requests("pay").length, 0);
        c.state("UNSURE");
        c.eq("reason", lastReason(c, "pay"), "Restored");
        c.eq("uncertain", row(c)?.uncertain, true);
      },
    },
  ),
];
