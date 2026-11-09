import { Option } from "effect";
import { type Case, type Scenario, variants } from "../dsl/case.ts";
import { Answer } from "../world/network.ts";

const SHOPPER = { machine: "Checkout/Pay", id: "shopper-1" };
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

const lastReason = (c: Case, operation: string) => c.endings(operation).at(-1)?.reason;

const appliedTwice = (c: Case, operation: string) => {
  const keys = c.world.network
    .landed()
    .filter((r) => r.operation === operation)
    .flatMap((r) => Option.toArray(r.key));

  return [...new Set(keys)].filter((key) => keys.filter((k) => k === key).length > 1).length;
};

const serverIntent = (c: Case) =>
  Answer.Ok({
    value: { status: c.landed("pay") > 0 ? "requires_capture" : "requires_payment_method" },
  });

/**
 * The Pay cases `PAY-18` to `PAY-20`, with the prototype suite's steps and expectations.
 *
 * **Details**
 *
 * - `PAY-17` is not here: its five variants (`hook-throws-on-sent`, `hook-throws-on-timer`,
 *   `hook-throws-on-acked`, `hook-throws-on-turn`, `core-throw-is-fatal`) throw inside runtime
 *   modules or the core, which no Port part reaches.
 * - `PAY-19` pins the Pay fixture's own late handlers (Turn R20, R21 route them late; `LEFT` and
 *   no receipt are the fixture's design). Both orders keep one order and one void at the server.
 * - `PAY-20`'s "no second pay" and "once at the server" are Pay's read-first rule (it reads the
 *   intent before any re-send), not a Flow guarantee. The fake server never dedupes by key, so the
 *   pruned-key variant needs no pruning fault.
 */
export const pay1720Scenarios: ReadonlyArray<Scenario> = [
  {
    id: "PAY-18",
    cites: ["WriteAhead R13", "WriteAhead R14"],
    fixtures: ["pay"],
    actor: SHOPPER,
    run(c) {
      c.ensure();
      start(c);
      pay(c);
      c.answerStorage("landNoAck", Option.none());
      c.advance(10_000);
      c.state("PAYING");
      c.eq("never told", String(c.memory()["notice"]).includes("haven't been charged"), false);
      c.eq("no send before an acknowledgement is heard", c.requests("pay").length, 0);
      c.reload();
      c.state("UNSURE");
      c.eq("reason", lastReason(c, "pay"), "Restored");
    },
  },
  ...variants(
    {
      id: "PAY-19",
      cites: ["Turn R20", "Turn R21"],
      fixtures: ["pay"],
      actor: SHOPPER,
    },
    {
      "void-answers-first"(c) {
        onWire(c);
        c.answer("pay", CAPTURABLE);
        c.ack();
        c.send("Leave", {});
        c.ack();
        c.answer("void", Answer.Ok({ value: {} }));
        c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
        c.state("PAID");
        c.eq("both", [c.landed("place"), c.landed("void")], [1, 1]);
      },
      "place-answers-first"(c) {
        onWire(c);
        c.answer("pay", CAPTURABLE);
        c.ack();
        c.send("Leave", {});
        c.ack();
        c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
        c.state("LEFT");
        c.answer("void", Answer.Ok({ value: {} }));
        c.state("LEFT");
        c.eq("both", [c.landed("place"), c.landed("void")], [1, 1]);
        c.eq("no receipt", c.memory()["receipt"], null);
      },
    },
  ),
  ...variants(
    {
      id: "PAY-20",
      cites: ["WriteLanes R2", "WriteLanes R5"],
      fixtures: ["pay"],
      actor: SHOPPER,
    },
    {
      "a-500-that-landed-is-unknown-and-pay-reads-the-intent"(c) {
        onWire(c);
        c.answer("pay", Answer.FailButLanded({ tag: "ServerError", fields: {} }));
        c.state("UNSURE");
        c.eq("an unknown", c.endings("pay").at(-1)?.channel, "unknown");
        c.eq("charges", c.landed("pay"), 1);
        c.advance(3000);
        c.answer("order", Answer.Ok({ value: null }));
        c.answer("intent", serverIntent(c));
        c.state("PLACING");
        c.eq("no second pay", c.requests("pay").length, 1);
        c.eq("once at the server", appliedTwice(c, "pay"), 0);
      },
      "a-pruned-key-does-not-charge-twice-since-pay-reads-first"(c) {
        onWire(c);
        c.answer(
          "pay",
          Answer.LostButLanded({ value: { status: "requires_capture", clientSecret: "" } }),
        );
        c.advance(3000);
        c.answer("order", Answer.Ok({ value: null }));
        c.answer("intent", serverIntent(c));
        c.state("PLACING");
        c.eq("no second pay", c.requests("pay").length, 1);
        c.eq("once at the server", appliedTwice(c, "pay"), 0);
      },
    },
  ),
];
