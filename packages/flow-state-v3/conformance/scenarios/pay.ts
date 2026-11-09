import { Option } from "effect";
import type { Case, Scenario } from "../dsl/case.ts";
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

const row = (c: Case, operation = "pay", key: unknown = KEY) =>
  Option.getOrUndefined(c.row(operation, key));

const lastReason = (c: Case, operation: string) => c.endings(operation).at(-1)?.reason;

const toResend = (c: Case) => {
  onWire(c);
  c.answer("pay", Answer.Lost());
  c.state("UNSURE");
  c.eq("charges", c.landed("pay"), 0);
  c.advance(3000);
  c.answer("order", Answer.Ok({ value: null }));
  c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
  c.state("PAYING");
  c.eq("not sent before capture", c.requests("pay").length, 1);
  c.ack();
  c.eq("re-sent after capture", c.requests("pay").length, 2);
  c.eq("same id", c.keys("pay").length, 1);
};

/**
 * The Pay cases of the first slice, ported from the prototype suite's `PAY-01` to `PAY-05` with
 * the same steps and expectations.
 */
export const payScenarios: ReadonlyArray<Scenario> = [
  {
    id: "PAY-01",
    cites: ["WriteLanes R2", "WriteLanes R5", "WriteLanes R8", "WriteAhead R4"],
    fixtures: ["pay"],
    actor: SHOPPER,
    run: (c) => {
      c.ensure();
      start(c);
      c.state("CARD");
      pay(c);
      c.state("PAYING");
      c.eq("pending", row(c)?.pending, true);
      c.eq("no send before ack", c.requests("pay").length, 0);
      c.ack();
      c.eq("sent", c.requests("pay").length, 1);
      c.answer("pay", CAPTURABLE);
      c.state("PLACING");
      c.eq("lane gone", row(c), undefined);
      c.eq("place waits", c.requests("place").length, 0);
      c.ack();
      c.eq("place sent", c.requests("place").length, 1);
      c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
      c.state("PAID");
      c.eq("receipt", c.memory()["receipt"], {
        orderId: "o1",
        afterUnsure: false,
        alreadyPlaced: false,
      });
      c.eq("charges", c.landed("pay"), 1);
    },
  },
  {
    id: "PAY-02",
    cites: ["WriteLanes R7", "WriteLanes R3"],
    fixtures: ["pay"],
    actor: SHOPPER,
    run: (c) => {
      onWire(c);
      pay(c);
      c.state("PAYING");
      c.eq("requests", c.requests("pay").length, 1);
      c.eq("notice", c.memory()["notice"], "");
      c.eq("decline ending", lastReason(c, "pay"), "Rejected");
    },
  },
  {
    id: "PAY-03",
    cites: ["WriteLanes R14", "WriteLanes R8"],
    fixtures: ["pay"],
    actor: SHOPPER,
    run: (c) => {
      onWire(c);
      c.answer(
        "pay",
        Answer.LostButLanded({ value: { status: "requires_capture", clientSecret: "" } }),
      );
      c.state("UNSURE");
      c.eq("uncertain", row(c)?.uncertain, true);
      c.eq("afterUnsure", c.memory()["afterUnsure"], true);
      c.eq("charges", c.landed("pay"), 1);
      c.advance(3000);
      c.eq("intent read", c.requests("intent").length, 1);
      c.eq("order read", c.requests("order").length, 1);
      c.answer("intent", Answer.Ok({ value: { status: "requires_capture" } }));
      c.state("PLACING");
      c.eq("released", row(c), undefined);
      c.eq("evidence", c.evidence("Released"), 1);
      c.eq("no re-send", c.requests("pay").length, 1);
      c.answer("order", Answer.Ok({ value: null }));
      c.state("PLACING");
      c.ack();
      c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
      c.state("PAID");
      c.eq("afterUnsure receipt", c.memory()["receipt"], {
        orderId: "o1",
        afterUnsure: true,
        alreadyPlaced: false,
      });
      c.eq("charges", c.landed("pay"), 1);
    },
  },
  {
    id: "PAY-04",
    cites: ["WriteLanes R8", "WriteLanes R5"],
    fixtures: ["pay"],
    actor: SHOPPER,
    run: (c) => {
      toResend(c);
      c.eq("retryCount", row(c)?.retryCount, 1);
      c.answer("pay", CAPTURABLE);
      c.state("PLACING");
      c.eq("charges", c.landed("pay"), 1);
      c.eq("distinct keys", c.keys("pay").length, 1);
      c.eq("afterUnsure", c.memory()["afterUnsure"], true);
    },
  },
  {
    id: "PAY-05",
    cites: ["WriteLanes R2"],
    fixtures: ["pay"],
    actor: SHOPPER,
    run: (c) => {
      toResend(c);
      const notice = c.memory()["notice"];
      c.answer("pay", Answer.Fail({ tag: "CardDeclined", fields: { code: "card_declined" } }));
      c.state("UNSURE");
      c.eq("uncertain", row(c)?.uncertain, true);
      c.eq("reason", lastReason(c, "pay"), "StillUnknown");
      c.eq("notice unchanged", c.memory()["notice"], notice);
    },
  },
];
