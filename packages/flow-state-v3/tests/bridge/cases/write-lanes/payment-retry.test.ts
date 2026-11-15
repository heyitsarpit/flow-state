import { describe, it } from "vite-plus/test";
import { type Case, play } from "../../harness/case.ts";
import { Pay } from "../../harness/fixture.ts";
import {
  CAPTURABLE,
  CART,
  lastReason,
  onWire,
  pay,
  PAY_TIMEOUT_MS,
  REREAD_MS,
  row,
  sent,
  shopper,
  toResend,
} from "../../harness/pay.ts";
import { Snapshot } from "../../harness/reports.ts";
import { Answer, RequestPhase } from "../../harness/world/network.ts";

const stateOf = (c: Case) => {
  const at = c.snapshot({ machine: Pay.machine, id: "shopper-1" });

  return Snapshot.$is("Live")(at) ? at.state : "(absent)";
};

describe("PAY-16 (WriteLanes R2, WriteLanes R3, WriteLanes R5, WriteLanes R8, Restore R3, Turn I12)", () => {
  it("PAY-16/restore-keeps-mayHaveApplied", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.reload();
      s.state("UNSURE");
      c.advance(REREAD_MS);
      c.answer("order", Answer.Ok({ value: null }));
      c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
      s.state("PAYING");
      c.ack();
      c.answer("pay", Answer.Fail({ tag: "CardDeclined", fields: { code: "x" } }));
      c.eq("reason", lastReason(c, "pay"), "StillUnknown");
      s.state("UNSURE");
    }));

  it("PAY-16/timeout-per-send", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      toResend(c);
      c.answer("pay", Answer.Never());
      c.advance(59_999);
      s.state("PAYING");
      c.advance(1);
      s.state("UNSURE");
      c.eq(
        "an unknown, per send",
        [c.endings("pay").at(-1)?.channel, c.endings("pay").length],
        ["unknown", 2],
      );
    }));

  it("PAY-16/resend-refused-capture", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer("pay", Answer.Lost());
      c.advance(REREAD_MS);
      c.answer("order", Answer.Ok({ value: null }));
      c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
      s.state("PAYING");
      c.answerStorage("refuse");
      s.state("UNSURE");
      c.eq("reason", lastReason(c, "pay"), "StorageRefused");
      c.eq("held", row(s)?.uncertain, true);
      c.eq("no budget used", row(s)?.retryCount, 0);
      c.advance(REREAD_MS);
      c.answer("order", Answer.Ok({ value: null }));
      c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
      s.state("PAYING");
      c.ack();
      c.eq("sent again", sent(c, "pay"), 2);
      c.eq("same id", c.keys("pay").length, 1);
      c.answer("pay", CAPTURABLE);
      s.state("PLACING");
    }));

  it("PAY-16/retry-count-persists", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      toResend(c);
      c.answer("pay", Answer.Lost());
      c.eq("retryCount", row(s)?.retryCount, 1);
      c.reload();
      s.state("UNSURE");
      c.eq("kept", row(s)?.retryCount, 1);
    }));

  it("PAY-16/stale-send-fenced", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      s.ensure();
      c.uninterruptible("pay");
      s.send("Start", CART);
      pay(s);
      c.ack();
      c.advance(PAY_TIMEOUT_MS);
      s.state("UNSURE");
      c.advance(REREAD_MS);
      c.answer("order", Answer.Ok({ value: null }));
      c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
      c.ack();
      c.eq("re-sent", sent(c, "pay"), 2);
      c.answerLate("pay", CAPTURABLE);
      s.state("PAYING");
      c.eq("the re-send still pending", row(s)?.pending, true);
    }));

  it("PAY-16/schedule-reads-after-memory", () =>
    play([Pay], (c) => {
      const s = shopper(c);
      onWire(c);
      c.answer("pay", Answer.Fail({ tag: "Busy", fields: { retryAfterMs: 500 } }));
      s.state("WAITING");
      c.advance(499);
      c.expect(
        "Turn I12",
        "WAITING's retry delay is read from the After memory (500 ms), not the pre-turn one",
        stateOf(c),
        "WAITING",
      );
      c.advance(1);
      s.state("PAYING");
    }));

  it("PAY-16/read-defect-issue", () =>
    play([Pay], (c) => {
      onWire(c);
      c.answer("pay", Answer.Lost());
      c.advance(REREAD_MS);
      c.answer("intent", Answer.Die({ message: "boom" }));
      c.eq("issue", c.issues(), ["Defect"]);
      c.eq("failure", lastReason(c, "intent"), "Defect");
    }));

  it("PAY-16/superseded-read", () =>
    play([Pay], (c) => {
      onWire(c);
      c.answer("pay", Answer.Lost());
      c.advance(REREAD_MS);
      c.eq("first", sent(c, "intent"), 1);
      c.advance(REREAD_MS);
      c.eq("second", sent(c, "intent"), 2);
      c.eq(
        "older was interrupted",
        c.requests("intent").filter((r) => RequestPhase.$is("Open")(r.phase)).length,
        1,
      );
      c.eq("superseded evidence", c.evidence("Superseded") > 0, true);
    }));
});
