// Paying: machine Stories over the checkout, app Stories for reloads and tabs, and the challenge alone in the
// stand-in host. The world is the Stripe fake: the shop's real `ShopHttp` adapter over `Fake.fetch`, and a
// Stripe.js stand-in whose `handleNextAction` waits on the `nextAction` endpoint. Transcripts; pay.test.ts reads
// them. Module checkpoints (COVERAGE.md section 6, "CK"): `challenge`, `challengeTimingOut`, `paid`, `payUnsure`,
// `reconciled`, `voidedOnLeave`, `reloadMidCharge`. A Story and its checkpoint cannot share a name where a test
// destructures them (2.10.1), so the Stories carry other names.
import { Fake, Story } from "flow-state/testing";
import { shopSetup } from "../../app/setup.js";
import { Stripe, StripeFake } from "../../testing/stripe.fake.js";
import { ShopperRef } from "../Shopper/shopper.ref.js";
import { Shopper } from "../Shopper/shopper.definition.js";
import { AddressStep } from "./address.subroutine.js";
import { Pay } from "./pay.definition.js";
import { PayMachine } from "./pay.machine.js";
import { payRef } from "./pay.ref.js";
import { ThreeDS } from "./three-ds.subroutine.js";

const { E } = Pay;

export const CART_1 = { cartId: "cart-1", intentId: "pi_1" };

export const VISA = "pm_card_visa";

const home = {
  name: "Ada Lovelace",
  line1: "12 Canal St",
  postcode: "N1 9GU",
  email: "ada@example.com",
};

export const signedIn = { signedIn: true, savedAddress: home };

const guest = { signedIn: false, savedAddress: null };

// A signed-in customer goes straight to the card with the saved address; the summary quotes its postcode (F22).
const checkout = (
  id: string,
  world: ReadonlyArray<Story.Step> = [],
  context: typeof signedIn | typeof guest = signedIn,
) =>
  Story.machine(PayMachine, { id, context, fixtures: [StripeFake], world }).send(E.Start(CART_1));

const pay = E.summary.PayPressed({ paymentMethodId: VISA });

// --- the path ------------------------------------------------------------------------------------------------

export const paidFirstTime = checkout("pay/paid").checkpoint("card").send(pay).checkpoint("paid");

// A guest fills the address. Help and back return to the exact field (`.history`), the postcode quotes shipping
// as it is typed (`cancel`: the quote for "N1" is interrupted by the one for "N1 9GU", O8).
export const guestAddress = checkout(
  "pay/guest-address",
  [Stripe.reserveShipping.hold({ at: "response" })],
  guest,
)
  .checkpoint("address")
  .send(
    E.ADDRESS.Changed({ address: { ...home, line1: "", postcode: "" } }),
    E.ADDRESS.Next(),
    E.ADDRESS.Next(),
  )
  .send(E.ADDRESS.Changed({ address: { ...home, postcode: "N1" } }))
  .send(E.ADDRESS.Changed({ address: home }))
  .checkpoint("quoteReplaced")
  .send(E.ADDRESS.Help())
  .checkpoint("postcodeHelp")
  .send(E.ADDRESS.CloseHelp())
  .checkpoint("backAtPostcode")
  .world(Stripe.reserveShipping.release())
  .send(E.ADDRESS.Confirm())
  .checkpoint("card");

// Leaving mid-address hands the draft back; starting again resumes it (MD 3.5, F14).
export const resumeAddress = checkout("pay/address-resumed", [], guest)
  .send(E.ADDRESS.Changed({ address: { ...home, postcode: "" } }))
  .send(E.Leave())
  .checkpoint("leftMidAddress")
  .send(E.Start(CART_1))
  .checkpoint("addressResumed");

// A guest over the limit: the Pay button's `check()` says why, with the annotation's text (F15, F19, F21).
export const guestOverLimit = checkout(
  "pay/over-guest-limit",
  [Stripe.changePrice({ productId: "lamp", priceCents: 60_000 })],
  guest,
)
  .send(
    E.ADDRESS.Changed({ address: home }),
    E.ADDRESS.Next(),
    E.ADDRESS.Next(),
    E.ADDRESS.Confirm(),
  )
  .checkpoint("overGuestLimit");

// --- what a payment can meet --------------------------------------------------------------------------------

// A double click: the second confirm is refused before anything is sent (`reject`, O3).
export const doubleClicked = checkout("pay/double-click", [Stripe.confirm.hold({ at: "response" })])
  .send(pay, pay)
  .checkpoint("doubleClick")
  .world(Stripe.confirm.release())
  .checkpoint("paidOnce");

// A proxy re-sends the confirm on its own (the wire duplicates the request, Y4): Stripe answers both from its
// idempotency record. One charge.
export const proxyRetried = checkout("pay/proxy-retried", [Stripe.confirm.duplicate()])
  .send(pay)
  .checkpoint("paid");

// Busy is definite: nothing happened. WAITING pauses as Stripe asked, then sends a NEW write (rule 19).
export const busyThenPaid = checkout("pay/busy-then-paid", [Stripe.busy({ times: 1 })])
  .send(pay)
  .checkpoint("waitingBusy")
  .advance("2 seconds")
  .checkpoint("paidAfterBusy");

export const cardDeclined = checkout("pay/declined", [
  Stripe.decline({ code: "insufficient_funds" }),
])
  .send(pay)
  .checkpoint("declined");

// The bank's challenge. The timer starts when the bank's frame is shown, not on entry (`armOn`, S3).
export const challenged = checkout("pay/challenged", [
  Stripe.challenge({ on: true }),
  Stripe.nextAction.hold(),
])
  .send(pay)
  .checkpoint("challengeLoading")
  .send(E.CHALLENGE.BankShown())
  .checkpoint("challenge")
  .world(Stripe.completeChallenge({ passed: true }), Stripe.nextAction.release())
  .checkpoint("challengePassed");

// The help overlay freezes the countdown (it sits on OPEN, `.resumable()`), but its deadline is KEPT: four minutes
// in help still count, and the overdue timer fires once on return (F12, rule 1).
export const helpKeepsDeadline = checkout("pay/help-frozen", [
  Stripe.challenge({ on: true }),
  Stripe.nextAction.hold(),
])
  .send(pay, E.CHALLENGE.BankShown())
  .advance("2 minutes")
  .send(E.CHALLENGE.Help())
  .advance("4 minutes")
  .checkpoint("helpFrozen")
  .send(E.CHALLENGE.CloseHelp())
  .checkpoint("challengeTimingOut")
  .advance("2 seconds")
  .checkpoint("timedOut");

// The customer finishes the challenge after the checkout stopped waiting (F11). Stripe.js cannot be aborted, so the
// answer comes, late: CARD owns no call, so the late handler places the order (O10).
export const lateChallenge = checkout("pay/late-challenge", [
  Stripe.challenge({ on: true }),
  Stripe.nextAction.hold(),
])
  .send(pay, E.CHALLENGE.BankShown())
  .advance("5 minutes")
  .checkpoint("challengeTimingOut")
  .advance("2 seconds")
  .checkpoint("timedOut")
  .world(Stripe.completeChallenge({ passed: true }), Stripe.nextAction.release())
  .checkpoint("paidAfterTimeout");

// The same late answer while the customer is paying again: PAYING owns that confirm, so the late ending may not
// leave it (`LateMayNotLeave` is the finding a handler without the `S.CARD` guard would get).
export const lateWhilePaying = checkout("pay/late-while-paying", [
  Stripe.challenge({ on: true }),
  Stripe.nextAction.hold(),
])
  .send(pay, E.CHALLENGE.BankShown())
  .advance("5 minutes")
  .advance("2 seconds")
  .world(Stripe.confirm.hold({ at: "response" }))
  .send(pay)
  .world(Stripe.completeChallenge({ passed: true }), Stripe.nextAction.release())
  .checkpoint("lateStaysPaying");

// --- the hold ----------------------------------------------------------------------------------------------

// The confirm's answer is lost: Stripe charged the card, and the page cannot know (O1). The hold keeps the Attempt;
// nothing is re-sent. The reconcile reads the intent, which says it is authorized: the hold is released and the
// order is placed. The receipt's wording says we checked (O13).
export const lostConfirm = checkout("pay/reconciled", [
  Stripe.confirm.drop({ at: "response", times: 1 }),
])
  .send(pay)
  .checkpoint("payUnsure")
  .advance("3 seconds")
  .checkpoint("reconciled");

// Lost on the way out: Stripe never saw it. The read says nothing happened, so the SAME Attempt is sent again (its
// `Idempotency-Key` unchanged, `retryCount` 1).
export const neverArrived = checkout("pay/never-arrived", [
  Stripe.confirm.drop({ at: "request", times: 1 }),
])
  .send(pay)
  .advance("3 seconds")
  .checkpoint("resentSameAttempt");

// The webhook is the second witness. Stripe delivers its event twice (Y4); the shop places the order once. The
// order read sees it first: the intent read still on the wire is cancelled (a key-less cancel of a lookup, R3).
export const webhookWins = checkout("pay/webhook-wins", [
  Stripe.confirm.drop({ at: "response", times: 1 }),
  Stripe.intent.hold(),
])
  .send(pay)
  .world(Stripe.webhookTwice({ cartId: "cart-1", intentId: "pi_1" }))
  .advance("3 seconds")
  .checkpoint("webhookConfirmed");

// --- leaving ----------------------------------------------------------------------------------------------

// The shopper leaves while the confirm is on the wire. It lands, authorized, in LEFT: the late handler voids the
// authorization (compensation, O20).
export const leaveMidCharge = checkout("pay/voided-on-leave", [
  Stripe.confirm.hold({ at: "response" }),
])
  .send(pay, E.Leave())
  .world(Stripe.confirm.release())
  .checkpoint("voidedOnLeave");

// The void's answer is lost, and the capture job wins the race. The re-sent void meets `AlreadyCaptured`, which
// after a lost send is `StillUnknown { AlreadyCaptured }` (rule 18, O12): nobody may say the hold is gone.
export const voidLostRace = checkout("pay/void-lost-race", [
  Stripe.confirm.hold({ at: "response" }),
  Stripe.voidAuthorization.drop({ at: "response", times: 1 }),
])
  .send(pay, E.Leave())
  .world(Stripe.captureElsewhere({ intentId: "pi_1" }), Stripe.confirm.release())
  .checkpoint("voidStillUnknown");

// "Buy again" while the summary's quote for the old cart is on the wire: the reset waits for it (rule 56's
// `idle` guard, F13), then the summary is fresh for cart-2.
export const buyAgain = checkout("pay/buy-again", [Stripe.reserveShipping.hold({ at: "response" })])
  .send(E.Leave())
  .send(E.Start({ cartId: "cart-2", intentId: "pi_2" }))
  .checkpoint("resetWaits")
  .world(Stripe.reserveShipping.release())
  .send(E.Start({ cartId: "cart-2", intentId: "pi_2" }))
  .checkpoint("summaryReset");

// --- reloads and tabs (app Stories over the persisted shop setup) ---------------------------------------------

const shop = (id: string, world: ReadonlyArray<Story.Step>) =>
  Story.app(shopSetup("shopper-1"), { id, fixtures: [StripeFake], world })
    .ensure(ShopperRef)
    .send(ShopperRef, Shopper.E.SignedIn({ customerId: "cus_1", address: home }))
    .ensure(payRef)
    .send(payRef, E.Start(CART_1));

// The acknowledgement of the confirm's Attempt is still being stored when the tab reloads: the confirm never left
// this device. `NotSent { Restored }`: "you haven't been charged" is true (P3, Y7).
export const reloadDuringCharge = shop("pay/reload-mid-charge", [
  Fake.storage.write.hold({ match: { purpose: "acknowledge" } }),
])
  .send(payRef, pay)
  .reload()
  .checkpoint("reloadMidCharge");

// The confirm was on the wire when the tab closed. The new tab's checkout adopts the lane as `unknown { Restored }`
// and reconciles; the receipt appears in the reopened tab (O14).
export const reloadWhileConfirming = shop("pay/receipt-after-reload", [
  Stripe.confirm.hold({ at: "response" }),
])
  .send(payRef, pay)
  .reload()
  .checkpoint("restoredUnsure")
  .world(Stripe.confirm.release()) // the old tab's request finishes on Stripe; nobody hears it
  .advance("3 seconds")
  .checkpoint("receiptAfterReload");

// Two tabs press Pay at once (Y5). Lanes are per Runtime, so the second tab's confirm is sent with its own key;
// Stripe refuses it because the intent moved on (`IntentBusy`). One charge.
// design gap: COVERAGE P4 C says "refused by the intent's `reject`"; a lane is per Runtime, so `reject` cannot see
// another tab's confirm; the refusal is Stripe's.
export const bothTabsPay = shop("pay/two-tabs", [])
  .openTab("b", { from: "main" })
  .together({ send: [payRef, pay] }, { send: [{ actor: payRef, tab: "b" }, pay] })
  .checkpoint("twoTabs");

// A lane stored by build "1", whose pay operation was named `charge`. Build "2" has no such operation, so the lane
// goes to the contract's `orphaned` handler, which re-sends the same Attempt; Stripe answers from its record (P8).
// The seed stays, where MD 2.10.4 says `Fake.storage.from(story)` is the one form an app can rely on: `from` needs a
// Story run under build "1"'s own definitions, with the operation named `charge`, and this repo has only build "2".
// design gap: a seeded lane's shape is the Persistence plan's; `version` and `operation` on it are assumed, to say
// which build stored it.
export const rebindAcrossVersions = Story.app(shopSetup("shopper-1"), {
  id: "pay/rebind-across-versions",
  fixtures: [StripeFake],
  storage: Fake.storage.seed([
    {
      kind: "lane",
      actor: payRef,
      version: "1",
      operation: "charge", // build 1's name; build 2 has `pay`
      contract: "Checkout/pay",
      key: { intentId: "pi_1" },
      attempt: {
        id: "attempt-v1",
        input: { intentId: "pi_1", paymentMethodId: VISA },
        retryCount: 0,
        acknowledged: true,
      },
    },
  ]),
})
  .ensure(ShopperRef)
  .checkpoint("orphanedResent");

// --- the challenge alone (the stand-in host, Y1) ----------------------------------------------------------------

const W = ThreeDS.E;

// `bankShown` is read before the exit: after `Passed` the subroutine is `Ended` and its memory reads absent (2.10.12).
export const challengeAlone = Story.fragment(ThreeDS, { id: "pay/three-ds-alone" })
  .enter({ intentId: "pi_1" })
  .send(W.BankShown())
  .checkpoint("bankShown")
  .send(W.Answered({ authId: "pi_1" })) // a host event, sendable to a fragment alone (2.10.12)
  .checkpoint("exited");

export const addressAlone = Story.fragment(AddressStep, { id: "pay/address-alone" })
  .enter({ address: { ...home, postcode: "" } })
  .send(AddressStep.E.Next(), AddressStep.E.Next())
  .send(AddressStep.E.Confirm())
  .checkpoint("badPostcode");

// --- the money properties' base (testing/checkout.property.test.ts) -----------------------------------------------

// Inputs only: a signed-in customer who has started the checkout. The property test appends generated steps, and a
// counterexample's `source` is chained from this variable (2.10.16).
export const payMoney = Story.machine(PayMachine, {
  id: "pay/property-money",
  context: signedIn,
  fixtures: [StripeFake],
}).send(E.Start(CART_1));
