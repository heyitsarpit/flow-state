import { Story } from "../../src/host/testing/index.ts";
import { actorRef, app } from "../../src/index.ts";
import { PayMachine } from "./machine.ts";
import { shopServer } from "./server.ts";

/**
 * The checkout app: Pay alone.
 */
export const shop = app({ id: "shop", machines: { pay: PayMachine } });

/**
 * The checkout the stories use.
 */
export const checkout = actorRef(PayMachine, "checkout-1");

/**
 * A `confirm` reaches the shop and its answer is lost; the commit's 60-second deadline passes; the
 * page reloads; then time moves on.
 */
export const lostConfirm = Story.app(
  { app: shop, scope: "story", persistence: { captureMs: 0 } },
  [shopServer],
  [
    Story.attach(checkout),
    Story.send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" }),
    shopServer.hold("confirm"),
    Story.send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" }),
    shopServer.dropResponse("confirm"),
    Story.advance("59999 millis"),
    Story.checkpoint("before deadline"),
    Story.advance("1001 millis"),
    Story.checkpoint("late"),
    Story.reload(),
    Story.checkpoint("reloaded"),
    Story.advance("10 seconds"),
    Story.checkpoint("after"),
  ],
);

/**
 * Every Story of the fixture, by name.
 */
export const stories = { lostConfirm };
