import { Option } from "effect";
import { type Case, type Scenario, variants } from "../dsl/case.ts";
import { Answer, RequestPhase } from "../world/network.ts";

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
 * The Pay case `PAY-16`'s variants, ported from the prototype suite.
 */
export const pay16Scenarios: ReadonlyArray<Scenario> = [
  ...variants(
    {
      id: "PAY-16",
      cites: ["WriteLanes R2", "WriteLanes R3", "WriteLanes R5", "WriteLanes R8", "Restore R3"],
      fixtures: ["pay"],
      actor: SHOPPER,
    },
    {
      "restore-keeps-mayHaveApplied"(c) {
        onWire(c);
        c.reload();
        c.state("UNSURE");
        c.advance(3000);
        c.answer("order", Answer.Ok({ value: null }));
        c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        c.state("PAYING");
        c.ack();
        c.answer("pay", Answer.Fail({ tag: "CardDeclined", fields: { code: "x" } }));
        c.eq("reason", lastReason(c, "pay"), "StillUnknown");
        c.state("UNSURE");
      },
      "timeout-per-send"(c) {
        toResend(c);
        c.answer("pay", Answer.Never());
        c.advance(59_999);
        c.state("PAYING");
        c.advance(1);
        c.state("UNSURE");
        c.eq(
          "an unknown, per send",
          [c.endings("pay").at(-1)?.channel, c.endings("pay").length],
          ["unknown", 2],
        );
      },
      "resend-refused-capture"(c) {
        onWire(c);
        c.answer("pay", Answer.Lost());
        c.advance(3000);
        c.answer("order", Answer.Ok({ value: null }));
        c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        c.state("PAYING");
        c.answerStorage("refuse", Option.none());
        c.state("UNSURE");
        c.eq("reason", lastReason(c, "pay"), "StorageRefused");
        c.eq("held", row(c)?.uncertain, true);
        c.eq("no budget used", row(c)?.retryCount, 0);
        c.advance(3000);
        c.answer("order", Answer.Ok({ value: null }));
        c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        c.state("PAYING");
        c.ack();
        c.eq("sent again", c.requests("pay").length, 2);
        c.eq("same id", c.keys("pay").length, 1);
        c.answer("pay", CAPTURABLE);
        c.state("PLACING");
      },
      "retry-count-persists"(c) {
        toResend(c);
        c.answer("pay", Answer.Lost());
        c.eq("retryCount", row(c)?.retryCount, 1);
        c.reload();
        c.state("UNSURE");
        c.eq("kept", row(c)?.retryCount, 1);
      },
      "stale-send-fenced"(c) {
        c.ensure();
        c.uninterruptible("pay");
        start(c);
        pay(c);
        c.ack();
        c.advance(60_000);
        c.state("UNSURE");
        c.advance(3000);
        c.answer("order", Answer.Ok({ value: null }));
        c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        c.ack();
        c.eq("re-sent", c.requests("pay").length, 2);
        c.answerLate("pay", CAPTURABLE);
        c.state("PAYING");
        c.eq("the re-send still pending", row(c)?.pending, true);
      },
      "schedule-reads-after-memory"(c) {
        onWire(c);
        c.answer("pay", Answer.Fail({ tag: "Busy", fields: { retryAfterMs: 500 } }));
        c.state("WAITING");
        c.advance(499);
        c.state("WAITING");
        c.advance(1);
        c.state("PAYING");
      },
      "read-defect-issue"(c) {
        onWire(c);
        c.answer("pay", Answer.Lost());
        c.advance(3000);
        c.answer("intent", Answer.Die({ message: "boom" }));
        c.eq("issue", c.issues(), ["Defect"]);
        c.eq("failure", lastReason(c, "intent"), "Defect");
      },
      "superseded-read"(c) {
        onWire(c);
        c.answer("pay", Answer.Lost());
        c.advance(3000);
        c.eq("first", c.requests("intent").length, 1);
        c.advance(3000);
        c.eq("second", c.requests("intent").length, 2);
        c.eq(
          "older was interrupted",
          c.requests("intent").filter((r) => RequestPhase.$is("Open")(r.phase)).length,
          1,
        );
        c.eq("superseded evidence", c.evidence("Superseded") > 0, true);
      },
    },
  ),
];
