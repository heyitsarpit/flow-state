import { Effect, Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import { Case, type Scenario, variants } from "../dsl/case.ts";
import { Pay } from "../fixtures/pay.ts";
import { Answer, RequestPhase } from "../world/network.ts";

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
 * The Pay case `PAY-16`'s variants, ported from the prototype suite.
 */
export const pay16Scenarios: ReadonlyArray<Scenario> = [
  ...variants(
    {
      id: "PAY-16",
      cites: ["WriteLanes R2", "WriteLanes R3", "WriteLanes R5", "WriteLanes R8", "Restore R3"],
      fixtures: [Pay],
    },
    {
      "restore-keeps-mayHaveApplied": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.reload;
        yield* s.state("UNSURE");
        yield* c.advance(3000);
        yield* c.answer("order", Answer.Ok({ value: null }));
        yield* c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        yield* s.state("PAYING");
        yield* c.ack;
        yield* c.answer("pay", Answer.Fail({ tag: "CardDeclined", fields: { code: "x" } }));
        yield* c.eq("reason", yield* lastReason(c, "pay"), "StillUnknown");
        yield* s.state("UNSURE");
      }),
      "timeout-per-send": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* toResend;
        yield* c.answer("pay", Answer.Never());
        yield* c.advance(59_999);
        yield* s.state("PAYING");
        yield* c.advance(1);
        yield* s.state("UNSURE");
        yield* c.eq(
          "an unknown, per send",
          [(yield* c.endings("pay")).at(-1)?.channel, (yield* c.endings("pay")).length],
          ["unknown", 2],
        );
      }),
      "resend-refused-capture": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", Answer.Lost());
        yield* c.advance(3000);
        yield* c.answer("order", Answer.Ok({ value: null }));
        yield* c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        yield* s.state("PAYING");
        yield* c.answerStorage("refuse", Option.none());
        yield* s.state("UNSURE");
        yield* c.eq("reason", yield* lastReason(c, "pay"), "StorageRefused");
        yield* c.eq("held", (yield* row(s))?.uncertain, true);
        yield* c.eq("no budget used", (yield* row(s))?.retryCount, 0);
        yield* c.advance(3000);
        yield* c.answer("order", Answer.Ok({ value: null }));
        yield* c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        yield* s.state("PAYING");
        yield* c.ack;
        yield* c.eq("sent again", yield* sent(c, "pay"), 2);
        yield* c.eq("same id", (yield* c.keys("pay")).length, 1);
        yield* c.answer("pay", CAPTURABLE);
        yield* s.state("PLACING");
      }),
      "retry-count-persists": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* toResend;
        yield* c.answer("pay", Answer.Lost());
        yield* c.eq("retryCount", (yield* row(s))?.retryCount, 1);
        yield* c.reload;
        yield* s.state("UNSURE");
        yield* c.eq("kept", (yield* row(s))?.retryCount, 1);
      }),
      "stale-send-fenced": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* s.ensure;
        yield* c.uninterruptible("pay");
        yield* s.send("Start", CART);
        yield* pay(s);
        yield* c.ack;
        yield* c.advance(60_000);
        yield* s.state("UNSURE");
        yield* c.advance(3000);
        yield* c.answer("order", Answer.Ok({ value: null }));
        yield* c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        yield* c.ack;
        yield* c.eq("re-sent", yield* sent(c, "pay"), 2);
        yield* c.answerLate("pay", CAPTURABLE);
        yield* s.state("PAYING");
        yield* c.eq("the re-send still pending", (yield* row(s))?.pending, true);
      }),
      "schedule-reads-after-memory": Effect.gen(function* () {
        const { c, shopper: s } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", Answer.Fail({ tag: "Busy", fields: { retryAfterMs: 500 } }));
        yield* s.state("WAITING");
        yield* c.advance(499);
        yield* s.state("WAITING");
        yield* c.advance(1);
        yield* s.state("PAYING");
      }),
      "read-defect-issue": Effect.gen(function* () {
        const { c } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", Answer.Lost());
        yield* c.advance(3000);
        yield* c.answer("intent", Answer.Die({ message: "boom" }));
        yield* c.eq("issue", yield* c.issues, ["Defect"]);
        yield* c.eq("failure", yield* lastReason(c, "intent"), "Defect");
      }),
      "superseded-read": Effect.gen(function* () {
        const { c } = yield* shopper;
        yield* onWire;
        yield* c.answer("pay", Answer.Lost());
        yield* c.advance(3000);
        yield* c.eq("first", yield* sent(c, "intent"), 1);
        yield* c.advance(3000);
        yield* c.eq("second", yield* sent(c, "intent"), 2);
        yield* c.eq(
          "older was interrupted",
          (yield* c.requests("intent")).filter((r) => RequestPhase.$is("Open")(r.phase)).length,
          1,
        );
        yield* c.eq("superseded evidence", (yield* c.evidence("Superseded")) > 0, true);
      }),
    },
  ),
];
