import { Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import type { Case, Scenario } from "../dsl/case.ts";
import { Pay } from "../fixtures/pay.ts";
import { Answer } from "../world/network.ts";

const KEY = { intentId: "pi1" };
const CART = { cartId: "c1", intentId: "pi1" };
const CAPTURABLE = Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } });

type Shopper = Actor<typeof Pay>;

const shopper = (c: Case) => c.actor(Pay, "shopper-1");

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

const toResend = (c: Case) => {
  const s = shopper(c);
  onWire(c);
  c.answer("pay", Answer.Lost());
  s.state("UNSURE");
  c.eq("charges", c.landed("pay"), 0);
  c.advance(3000);
  c.answer("order", Answer.Ok({ value: null }));
  c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
  s.state("PAYING");
  c.eq("not sent before capture", sent(c, "pay"), 1);
  c.ack();
  c.eq("re-sent after capture", sent(c, "pay"), 2);
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
    fixtures: [Pay],
    run: (c) => {
      const s = shopper(c);
      s.ensure();
      s.send("Start", CART);
      s.state("CARD");
      pay(s);
      s.state("PAYING");
      c.eq("pending", row(s)?.pending, true);
      c.eq("no send before ack", sent(c, "pay"), 0);
      c.ack();
      c.eq("sent", sent(c, "pay"), 1);
      c.answer("pay", CAPTURABLE);
      s.state("PLACING");
      c.eq("lane gone", row(s), undefined);
      c.eq("place waits", sent(c, "place"), 0);
      c.ack();
      c.eq("place sent", sent(c, "place"), 1);
      c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
      s.state("PAID");
      c.eq("receipt", s.memory().receipt, {
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
    fixtures: [Pay],
    run: (c) => {
      const s = shopper(c);
      onWire(c);
      pay(s);
      s.state("PAYING");
      c.eq("requests", sent(c, "pay"), 1);
      c.eq("notice", s.memory().notice, "");
      c.eq("decline ending", lastReason(c, "pay"), "Rejected");
    },
  },
  {
    id: "PAY-03",
    cites: ["WriteLanes R14", "WriteLanes R8"],
    fixtures: [Pay],
    run: (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer(
        "pay",
        Answer.LostButLanded({ value: { status: "requires_capture", clientSecret: "" } }),
      );
      s.state("UNSURE");
      c.eq("uncertain", row(s)?.uncertain, true);
      c.eq("afterUnsure", s.memory().afterUnsure, true);
      c.eq("charges", c.landed("pay"), 1);
      c.advance(3000);
      c.eq("intent read", sent(c, "intent"), 1);
      c.eq("order read", sent(c, "order"), 1);
      c.answer("intent", Answer.Ok({ value: { status: "requires_capture" } }));
      s.state("PLACING");
      c.eq("released", row(s), undefined);
      c.eq("evidence", c.evidence("Released"), 1);
      c.eq("no re-send", sent(c, "pay"), 1);
      c.answer("order", Answer.Ok({ value: null }));
      s.state("PLACING");
      c.ack();
      c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
      s.state("PAID");
      c.eq("afterUnsure receipt", s.memory().receipt, {
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
    fixtures: [Pay],
    run: (c) => {
      const s = shopper(c);
      toResend(c);
      c.eq("retryCount", row(s)?.retryCount, 1);
      c.answer("pay", CAPTURABLE);
      s.state("PLACING");
      c.eq("charges", c.landed("pay"), 1);
      c.eq("distinct keys", c.keys("pay").length, 1);
      c.eq("afterUnsure", s.memory().afterUnsure, true);
    },
  },
  {
    id: "PAY-05",
    cites: ["WriteLanes R2"],
    fixtures: [Pay],
    run: (c) => {
      const s = shopper(c);
      toResend(c);
      const notice = s.memory().notice;
      c.answer("pay", Answer.Fail({ tag: "CardDeclined", fields: { code: "card_declined" } }));
      s.state("UNSURE");
      c.eq("uncertain", row(s)?.uncertain, true);
      c.eq("reason", lastReason(c, "pay"), "StillUnknown");
      c.eq("notice unchanged", s.memory().notice, notice);
    },
  },
];
