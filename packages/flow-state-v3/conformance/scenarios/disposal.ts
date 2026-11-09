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

/**
 * The Pay cases that dispose the Runtime: `PAY-13`, `PAY-15/dispose-held` and the disposal
 * variants of `PAY-16`, with the prototype suite's steps.
 *
 * **Details**
 *
 * - The Port shows no abandoned fiber, stored lane or parked count; those assertions are not here.
 *   A parked ending shows as the ending the next boot delivers in its place (WriteAhead R14).
 * - `waiting-flushed` asserts the disposal ended once the pending write was answered (Actors R23:
 *   disposal waits for the final write), not at once as the prototype case did.
 * - `PAY-16/parked-success-is-delivered` is not here: it needs a yield fault the Port lacks.
 * - `PAY-15/dispose-held` runs on `cells`; the `PAY-16` variants on `pay`, whose steps do not use
 *   `cells`' `AbortPay`.
 */
export const disposalScenarios: ReadonlyArray<Scenario> = [
  ...variants(
    {
      id: "PAY-13",
      cites: ["Actors R22", "Actors R23", "Actors I29", "Actors I30", "WriteAhead R14"],
      fixtures: ["pay"],
      actor: SHOPPER,
    },
    {
      "hung-commit"(c) {
        c.ensure();
        c.uninterruptible("pay");
        start(c);
        pay(c);
        c.ack();
        c.disposeRuntime();
        c.eq("not yet", c.runtimeDisposals(), 0);
        c.advance(5000);
        c.eq("disposed", c.runtimeDisposals(), 1);
        c.reload();
        c.state("UNSURE");
        c.eq("reason", lastReason(c, "pay"), "Disposed");
      },
      "waiting-flushed"(c) {
        c.ensure();
        start(c);
        pay(c);
        c.disposeRuntime();
        c.ack();
        c.eq("disposed once the last write is answered", c.runtimeDisposals(), 1);
        c.eq("requests", c.requests("pay").length, 0);
        c.reload();
        c.state("CARD");
        c.eq("reason", lastReason(c, "pay"), "Disposed");
        c.eq("no send after boot", c.requests("pay").length, 0);
      },
      "waiting-flush-lost"(c) {
        c.ensure();
        start(c);
        pay(c);
        c.disposeRuntime();
        c.reload();
        c.state("CARD");
        c.eq("nothing on disk, so no Restored after it", lastReason(c, "pay"), "Disposed");
        c.eq("no send after boot", c.requests("pay").length, 0);
      },
    },
  ),
  {
    id: "PAY-15/dispose-held",
    cites: ["Actors R22", "Actors I29"],
    fixtures: ["cells"],
    actor: SHOPPER,
    run(c) {
      onWire(c);
      c.answer("pay", Answer.Lost());
      c.disposeRuntime();
      c.eq("disposed", c.runtimeDisposals(), 1);
      c.reload();
      c.state("UNSURE");
      c.eq("uncertain", row(c)?.uncertain, true);
    },
  },
  ...variants(
    {
      id: "PAY-16",
      cites: ["Actors R22", "Actors I29", "Actors I30", "Actors I31", "WriteAhead R14"],
      fixtures: ["pay"],
      actor: SHOPPER,
    },
    {
      "settled-during-disposal-parked"(c) {
        onWire(c);
        c.disposeRuntime();
        c.eq("not yet: the commit may settle", c.runtimeDisposals(), 0);
        c.answer("pay", CAPTURABLE);
        c.eq("disposed once the wire is empty", c.runtimeDisposals(), 1);
        c.eq("its own ending", c.endings("pay").at(-1)?.channel, "success");
        c.reload();
        c.state("PLACING");
        c.eq(
          "no Restored: the parked ending is delivered",
          c.endings("pay").some((e) => e.reason === "Restored"),
          false,
        );
      },
      "on-the-wire-at-the-bound-ends-unknown-disposed"(c) {
        onWire(c);
        c.disposeRuntime();
        c.advance(4_999);
        c.eq("within the bound", c.runtimeDisposals(), 0);
        c.advance(1);
        c.eq("the bound ends it", c.runtimeDisposals(), 1);
        c.eq(
          "unknown { Disposed }",
          [c.endings("pay").at(-1)?.channel, lastReason(c, "pay")],
          ["unknown", "Disposed"],
        );
        c.reload();
        c.state("UNSURE");
        c.eq(
          "no Restored: the parked ending is delivered",
          c.endings("pay").some((e) => e.reason === "Restored"),
          false,
        );
      },
      "dispose-waiting-resend"(c) {
        onWire(c);
        c.answer("pay", Answer.Lost());
        c.advance(3000);
        c.answer("order", Answer.Ok({ value: null }));
        c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
        c.disposeRuntime();
        c.eq(
          "no Disposed ending",
          c.endings("pay").some((e) => e.reason === "Disposed"),
          false,
        );
      },
      "disposal-ends-with-the-last-fiber"(c) {
        c.ensure();
        c.uninterruptible("pay");
        start(c);
        pay(c);
        c.ack();
        c.disposeRuntime();
        c.eq("not yet", c.runtimeDisposals(), 0);
        c.answerLate("pay", CAPTURABLE);
        c.eq("finished when it ended", c.runtimeDisposals(), 1);
      },
    },
  ),
];
