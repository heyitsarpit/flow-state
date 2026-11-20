// The cart: machine Stories over the cart page, and app Stories with the header's mini-cart on the same cart. The
// world is the Stripe fake (the shop's real `ShopHttp` adapter over `Fake.fetch`). Transcripts; cart.test.ts reads
// them. Module checkpoints (COVERAGE.md section 6, "CK"): `cart`, `quantityCoalesced`, `couponPredicted`.
import { Story } from "flow-state/testing";
import { CheckoutSetup } from "../../app/setup.js";
import { Stripe, StripeFake } from "../../testing/stripe.fake.js";
import { CartPage } from "./cart.definition.js";
import { CartMachine } from "./cart.machine.js";
import { cartRef, miniCartRef } from "./cart.ref.js";
import { MiniCart } from "./mini-cart.machine.js";

const { E } = CartPage;

export const CART = { cartId: "cart-1" };

const cart = (id: string, world: ReadonlyArray<Story.Step> = []) =>
  Story.machine(CartMachine, { id, input: CART, fixtures: [StripeFake], world }).checkpoint("cart");

// The lamp, and two packs of bulbs: two steppers, one per confirmed line (F4).
export const opened = cart("cart/opened");

// Five quick taps on the bulbs. `latest` per line: the first tap is sent, the next three replace each other in the
// queue behind it (`Superseded`), and the last goes when the first answers. Two requests for five taps, and the
// server ends with 7 (O4). The line's total is predicted at once from the price beneath (E14).
export const fiveTaps = cart("cart/quantity-coalesced", [
  Stripe.setQuantity.hold({ at: "response" }),
])
  .send(...Array.from({ length: 5 }, () => E.steppers.key("l2").Increment()))
  .checkpoint("quantityCoalesced")
  .world(Stripe.setQuantity.release())
  .checkpoint("quantitySaved");

// Two lines are two lanes: a tap on the lamp never waits for the bulbs.
export const linesIndependent = cart("cart/lines-independent", [
  Stripe.setQuantity.hold({ at: "response" }),
])
  .send(E.steppers.key("l1").Increment(), E.steppers.key("l2").Increment())
  .checkpoint("bothSent");

// A tap behind an unsure change (O5): the first answer is lost, so the lane holds it and re-sends once (the same
// Attempt, deduped by the shop); the next tap waits (`waiting`), then goes.
export const waitsBehindUnsure = cart("cart/waits-behind-unsure", [
  Stripe.setQuantity.drop({ at: "response", times: 1 }), // the first answer is lost
  Stripe.setQuantity.hold({ at: "response" }), // the re-send's answer is held
])
  .send(E.steppers.key("l2").Increment())
  .checkpoint("lineUnsure")
  .send(E.steppers.key("l2").Increment())
  .checkpoint("waitingBehindUnsure")
  .world(Stripe.setQuantity.release()) // the held answer to the re-send arrives
  .checkpoint("caughtUp");

// "−" at one asks first (F8): the dialog's exit carries the line, and the host removes exactly that line.
export const removeAsked = cart("cart/remove-asked")
  .send(E.steppers.key("l1").Decrement())
  .checkpoint("asking")
  .send(E.REMOVING.Yes())
  .checkpoint("removed");

// The coupon: one per cart (an unkeyed lane, O18), a plain write whose guess at the total is this page's memory
// (O21) beside the line totals the store predicts (E16). A second code while one is on its way is refused.
export const couponOnTheWire = cart("cart/coupon-predicted", [
  Stripe.applyCoupon.hold({ at: "response" }),
])
  .send(E.ApplyCoupon({ code: "SAVE10" }))
  .checkpoint("couponPredicted")
  .send(E.ApplyCoupon({ code: "WELCOME5" }))
  .checkpoint("secondCodeRefused")
  .world(Stripe.applyCoupon.release())
  .checkpoint("couponApplied");

export const badCoupon = cart("cart/coupon-rejected")
  .send(E.ApplyCoupon({ code: "EXPIRED" }))
  .checkpoint("couponRejected");

// --- two screens, one cart (app Stories) ---------------------------------------------------------------------

const Page = cartRef(CART.cartId);

const Header = miniCartRef(CART.cartId);

const shop = (id: string, world: ReadonlyArray<Story.Step>) =>
  Story.app(CheckoutSetup, { id, fixtures: [StripeFake], world })
    .ensure(Page, { input: CART })
    .ensure(Header, { input: CART });

// One line, two actors' writes (E7, E12): the page's quantity change on the lamp is on the wire when the header
// removes the lamp. The record queue orders them: the removal waits behind the change, and both screens show the
// line as the queue predicts (hidden at once).
export const pageAndHeader = shop("cart/page-and-header", [
  Stripe.setQuantity.hold({ at: "response" }),
])
  .checkpoint("shown")
  .send(Page, E.steppers.key("l1").Increment())
  .send(Header, MiniCart.E.Remove({ lineId: "l1" }))
  .checkpoint("queuedOnOneLine")
  .world(Stripe.setQuantity.release())
  .checkpoint("bothSettled");

// A re-price under a pending change (E11): the bulbs' quantity is on its way when the lamp's price changes on the
// server, and the header's removal of the bulbs brings the new lamp price back. The lamp's predicted total is a
// field function over the record beneath, so it replays over the new base; `checkReplays` (on in Stories) checks
// that the replay is the same function of the same input.
export const repricedUnderPending = shop("cart/repriced-under-pending", [
  Stripe.setQuantity.hold({ at: "response" }),
])
  .send(Page, E.steppers.key("l1").Increment())
  .world(Stripe.changePrice({ productId: "lamp", priceCents: 5_000 }))
  .send(Header, MiniCart.E.Remove({ lineId: "l2" }))
  .checkpoint("replayedOverNewPrice")
  .world(Stripe.setQuantity.release())
  .checkpoint("repriced");

// --- the cart page rendered on the server (P7, 2.10.11) ------------------------------------------------------

// The server render presses nothing, but this one renders a cart whose coupon is applied by a server action in the
// same request. A source sets no `world` (W29), so the hold that keeps the coupon on the wire at the capture deadline
// is the destination's: `cartHydrated` below. Run alone, this source's coupon is answered and nothing is in flight.
export const cartPage = Story.app(CheckoutSetup, {
  id: "cart/ssr-server",
  fixtures: [StripeFake],
})
  .ensure(Page, { input: CART })
  .send(Page, E.ApplyCoupon({ code: "SAVE10" }))
  .dehydrate("cart", { within: "800 millis" });

// The destination's world holds the coupon's answer, and the source runs in it (2.10.11). The payload carries a
// `DehydrateCommitInFlight` record naming the coupon's lane; no client lane is made from it.
// design gap: that the destination's standing wire rule covers a request made by the `"server"` tab is implied by
// "one world" (W29) but not stated; see findings-checkout.md.
export const cartHydrated = Story.app(CheckoutSetup, {
  id: "cart/ssr-browser",
  fixtures: [StripeFake],
  world: [Stripe.applyCoupon.hold({ at: "response" })],
})
  .hydrate(cartPage, "cart")
  .checkpoint("hydratedWithoutCoupon");
