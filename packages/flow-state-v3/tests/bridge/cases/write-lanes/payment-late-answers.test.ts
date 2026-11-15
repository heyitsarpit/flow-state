import { describe, it } from "vite-plus/test";
import { type Case, play } from "../../harness/case.ts";
import { Pay } from "../../harness/fixture.ts";
import {
  CAPTURABLE,
  lastReason,
  onWire,
  pay,
  REREAD_MS,
  sent,
  shopper,
  start,
} from "../../harness/pay.ts";
import { Answer } from "../../harness/world/network.ts";

const appliedTwice = (c: Case, operation: string) => {
  const keys = c.landedKeys(operation);

  return [...new Set(keys)].filter((key) => keys.filter((k) => k === key).length > 1).length;
};

const serverIntent = (c: Case) =>
  Answer.Ok({
    value: { status: c.landed("pay") > 0 ? "requires_capture" : "requires_payment_method" },
  });

it("PAY-18 (WriteAhead R13, WriteAhead R14)", () =>
  play([Pay], (c) => {
    const s = shopper(c);
    s.ensure();
    start(s);
    pay(s);
    c.answerStorage("landNoAck");
    c.advance(10_000);
    s.state("PAYING");
    c.eq("never told", s.memory().notice.includes("haven't been charged"), false);
    c.eq("no send before an acknowledgement is heard", sent(c, "pay"), 0);
    c.reload();
    s.state("UNSURE");
    c.eq("reason", lastReason(c, "pay"), "Restored");
  }));

describe("PAY-19 (Turn R20, Turn R21)", () => {
  it("PAY-19/void-answers-first", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer("pay", CAPTURABLE);
      c.ack();
      s.send("Leave", {});
      c.ack();
      c.answer("void", Answer.Ok({ value: {} }));
      c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
      s.state("PAID");
      c.eq("both", [c.landed("place"), c.landed("void")], [1, 1]);
    }));

  it("PAY-19/place-answers-first", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer("pay", CAPTURABLE);
      c.ack();
      s.send("Leave", {});
      c.ack();
      c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
      s.state("LEFT");
      c.answer("void", Answer.Ok({ value: {} }));
      s.state("LEFT");
      c.eq("both", [c.landed("place"), c.landed("void")], [1, 1]);
      c.eq("no receipt", s.memory().receipt, null);
    }));
});

describe("PAY-20 (WriteLanes R2, WriteLanes R5)", () => {
  it("PAY-20/a-500-that-landed-is-unknown-and-pay-reads-the-intent", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer("pay", Answer.FailButLanded({ tag: "ServerError", fields: {} }));
      s.state("UNSURE");
      c.eq("an unknown", c.endings("pay").at(-1)?.channel, "unknown");
      c.eq("charges", c.landed("pay"), 1);
      c.advance(REREAD_MS);
      c.answer("order", Answer.Ok({ value: null }));
      c.answer("intent", serverIntent(c));
      s.state("PLACING");
      c.eq("no second pay", sent(c, "pay"), 1);
      c.eq("once at the server", appliedTwice(c, "pay"), 0);
    }));

  it("PAY-20/a-pruned-key-does-not-charge-twice-since-pay-reads-first", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer(
        "pay",
        Answer.LostButLanded({ value: { status: "requires_capture", clientSecret: "" } }),
      );
      c.advance(REREAD_MS);
      c.answer("order", Answer.Ok({ value: null }));
      c.answer("intent", serverIntent(c));
      s.state("PLACING");
      c.eq("no second pay", sent(c, "pay"), 1);
      c.eq("once at the server", appliedTwice(c, "pay"), 0);
    }));
});
