// What Inspection says about the checkout (flow-state/inspect). Observation never starts work.
import { inspect, render } from "flow-state/inspect";
import { CheckoutApp } from "../app/app.js";
import type { CheckoutSetup } from "../app/setup.js";
import { pay } from "../features/Pay/pay.contracts.js";

export async function describeCheckout() {
  const model = await inspect(CheckoutApp);

  return { text: render(model, "text"), mermaid: render(model, "mermaid") };
}

// An unknown charge's lane (I1): `Held`, its Attempt and retry count, bound to the checkout or unbound after the
// tab closed. This is what a support engineer reads before telling a customer "you were not charged": never, while
// this lane exists.
// design gap: a lane entry's field names follow 2.10.7's list, as in the desk's tools/inspection.ts.
export function unknownCharges(runtime: ReturnType<typeof CheckoutSetup.construct>) {
  return inspect(runtime)
    .lanes.filter((lane) => lane.contract === pay.id && lane.state === "Held")
    .map((lane) => ({
      actor: lane.actor, // "checkout"
      key: lane.key, // { intentId }
      attempt: lane.attempt.id, // the Idempotency-Key Stripe saw
      retryCount: lane.attempt.retryCount,
      binding: lane.binding, // "bound" | "unbound"
    }));
}

// The record queues of the cart domain (E12): one cart line, the page's quantity change ahead of the header's
// removal.
export function cartQueues(runtime: ReturnType<typeof CheckoutSetup.construct>) {
  return inspect(runtime).domains.cart.queues;
}
