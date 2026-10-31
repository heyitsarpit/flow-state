// The merchant's refunds. Transcripts; refunds.test.ts reads them. Module checkpoint (COVERAGE.md section 6, "CK"):
// `refunds-queued`.
import { Story } from "flow-state/testing";
import { shopSetup } from "../../app/setup.js";
import { Stripe, StripeFake } from "../../testing/stripe.fake.js";
import { Refunds } from "./refunds.definition.js";
import { RefundsMachine } from "./refunds.machine.js";
import { refundsRef } from "./refunds.ref.js";

const { E } = Refunds;

const o9 = (amountCents: number) =>
  E.RefundAsked({ orderId: "o-9", chargeId: "ch_9", amountCents });

const page = (id: string, world: ReadonlyArray<unknown> = []) =>
  Story.make(RefundsMachine, { id, fixtures: [StripeFake], world });

// Three refunds on one $90 charge, asked quickly: queued in order (`serialize`), the order's refunded amount
// predicted at once from the record beneath, then each sent after the one before. The third asks for more than is
// left and is refused definitely; its prediction goes without a repair (O7, E14).
export const refundsQueued = page("refunds/queued", [Stripe.refund.hold({ at: "response" })])
  .send(o9(4_000), o9(3_000), o9(5_000))
  .checkpoint("refunds-queued")
  .world(Stripe.refund.release(), Stripe.refund.release(), Stripe.refund.release())
  .checkpoint("refunds-settled");

// A lost answer holds the charge's lane: the next refund waits behind it until the re-send answers (rule 29).
export const unsureHoldsTheCharge = page("refunds/unsure-holds", [
  Stripe.refund.drop({ at: "response", times: 1 }),
])
  .send(o9(1_000), o9(1_000))
  .checkpoint("second-waits")
  .advance("1 second")
  .checkpoint("both-refunded");

// A reload mid-refund (E18): the lane and the predicted key are stored together, so the reopened page shows the
// order marked uncertain until the restored lane is re-sent and the list repairs it.
export const reloadMidRefund = Story.make(shopSetup("merchant-1"), {
  id: "refunds/reload-mid-refund",
  fixtures: [StripeFake],
  world: [Stripe.refund.hold({ at: "response" })],
})
  .ensure(refundsRef)
  .send(refundsRef, o9(2_000))
  .reload()
  .checkpoint("reloaded-mid-refund")
  .world(Stripe.refund.release())
  .advance("1 second")
  .checkpoint("repaired");

// The 65th refund queued on one charge is `NotSent { Overloaded }` (rule 35).
export const overloaded = page("refunds/overloaded", [Stripe.refund.hold({ at: "request" })])
  .send(...Array.from({ length: 65 }, () => o9(1)))
  .checkpoint("overloaded");
