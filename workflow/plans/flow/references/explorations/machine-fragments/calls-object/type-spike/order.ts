// order.ts: does 3b depend on property order? `states` written before `calls`.
import { definition, machineO } from "./lib.ts"
import { confirm, payOutcomes, type CheckoutEv } from "./def.ts"
const D = definition<CheckoutEv>()({ id: "Order", memory: { intentId: "", paymentMethodId: "", busyTries: 0 }, operations: { Stripe: { confirm } } })
export const swapped = machineO(D, {
  initial: "A",
  states: ({ calls }) => ({ A: { on: { Pay: { actions: [calls.pay] } } } }),
  // @ts-expect-error 3b is order-sensitive: `states` before `calls` collapses C, caught only by the Inferred guard
  calls: ({ O, E }) => ({ pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }) }),
})
