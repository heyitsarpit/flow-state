import { Option } from "effect";
import type { Actor } from "../dsl/actor.ts";
import type { Case } from "../dsl/case.ts";
import { Answer } from "../world/network.ts";
import { Cells, Pay } from "./pay.ts";

/**
 * The key of the one payment the Pay cases make (`pay`'s key, its intent).
 */
export const KEY = { intentId: "pi1" };

/**
 * The cart the Pay cases start with.
 */
export const CART = { cartId: "c1", intentId: "pi1" };

/**
 * A `pay` answer the Pay fixture takes as an authorized payment.
 */
export const CAPTURABLE = Answer.Ok({ value: { status: "requires_capture", clientSecret: "" } });

/**
 * How long UNSURE waits before it reads the order and the intent again: its `check` schedule,
 * "3 seconds" (`prototypes/conformance/typed/pay.ts`).
 */
export const REREAD_MS = 3000;

/**
 * The timeout the Pay fixture is pinned with, `timeoutMs: 60_000`
 * (`prototypes/conformance/typed/pay.ts`, D8).
 */
export const PAY_TIMEOUT_MS = 60_000;

/**
 * A Pay actor view; a `Cells` actor is one too.
 */
export type Shopper = Actor<typeof Pay>;

/**
 * The Pay case's one shopper.
 */
export const shopper = (c: Case) => c.actor(Pay, "shopper-1");

/**
 * The same shopper on `Cells`, whose `AbortPay` cancels `pay`.
 */
export const cells = (c: Case) => c.actor(Cells, "shopper-1");

/**
 * The shopper starts the cart.
 */
export const start = (s: Shopper) => s.send("Start", CART);

/**
 * The shopper presses pay.
 */
export const pay = (s: Shopper) => s.send("PayRequested", { paymentMethodId: "visa" });

/**
 * `pay`'s row for the case's intent, `undefined` when there is none.
 */
export const row = (s: Shopper) => Option.getOrUndefined(s.row("pay", KEY));

/**
 * The reason of an operation's last ending.
 */
export const lastReason = (c: Case, operation: string) => c.endings(operation).at(-1)?.reason;

/**
 * How many requests of an operation the server received.
 */
export const sent = (c: Case, operation: string) => c.requests(operation).length;

/**
 * Ensures the shopper (on `Pay`, or `Cells` with `variant`), starts the cart, presses pay and
 * answers the intent write, so `pay` is on the wire.
 */
export const onWire = (c: Case, variant: "pay" | "cells" = "pay") => {
  const s = variant === "pay" ? shopper(c) : cells(c);
  s.ensure();
  start(s);
  pay(s);
  c.ack();
};

/**
 * `pay` answered Lost, then re-read: the order is absent and the intent still needs a payment
 * method, so the same Attempt is sent again once its write is acknowledged.
 */
export const toResend = (c: Case) => {
  const s = shopper(c);
  onWire(c);
  c.answer("pay", Answer.Lost());
  s.state("UNSURE");
  c.eq("charges", c.landed("pay"), 0);
  c.advance(REREAD_MS);
  c.answer("order", Answer.Ok({ value: null }));
  c.answer("intent", Answer.Ok({ value: { status: "requires_payment_method" } }));
  s.state("PAYING");
  c.eq("not sent before capture", sent(c, "pay"), 1);
  c.ack();
  c.eq("re-sent after capture", sent(c, "pay"), 2);
  c.eq("same id", c.keys("pay").length, 1);
};

/**
 * `pay` on the wire across a reload: restored Held, then its late answer and the re-read settle
 * it, and the order is placed once.
 */
export const reloadOnWire = (c: Case) => {
  const s = shopper(c);
  onWire(c);
  c.reload();
  s.state("UNSURE");
  c.eq("uncertain", row(s)?.uncertain, true);
  c.eq("reason", lastReason(c, "pay"), "Restored");
  c.eq("requests", sent(c, "pay"), 1);
  c.answerLate("pay", CAPTURABLE);
  c.advance(REREAD_MS);
  c.answer("order", Answer.Ok({ value: null }));
  c.answer("intent", Answer.Ok({ value: { status: "requires_capture" } }));
  s.state("PLACING");
  c.ack();
  c.answer("place", Answer.Ok({ value: { orderId: "o1" } }));
  s.state("PAID");
  c.eq("charges", c.landed("pay"), 1);
};
