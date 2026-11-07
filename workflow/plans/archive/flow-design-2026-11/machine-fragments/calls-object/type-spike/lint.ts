// lint.ts: what a type cannot say, `flow check` can. Run: node lint.ts   (Node 24 strips the types)
// (e) a call used in states but not in `calls`, and (f) a call declared but never used, both found by object identity.
import { lintCalls, machine, machineO } from "./lib.ts"
import { Checkout, payOutcomes } from "./def.ts"

const sel = ({ memory }: { memory: { intentId: string } }) => ({ intentId: memory.intentId, paymentMethodId: "" })

const forgot = machine(Checkout, ({ O, E }) => {
  const pay = O.Stripe.confirm.commit(sel, { outcomes: payOutcomes(E) })
  const forgotten = O.Stripe.confirm.commit(sel, { outcomes: payOutcomes(E) })
  return { calls: { pay }, initial: "A", states: { A: { on: { Pay: { actions: [pay, forgotten] } } } } }
})
const unused = machineO(Checkout, {
  calls: ({ O, E }) => ({ pay: O.Stripe.confirm.commit(sel, { outcomes: payOutcomes(E) }), spare: O.Stripe.confirm.commit(sel, { outcomes: payOutcomes(E) }) }),
  initial: "A",
  states: ({ calls }) => ({ A: { on: { Pay: { guard: [calls.pay.idle], actions: [calls.pay] } } } }),
})
const clean = machineO(Checkout, {
  calls: ({ O, E }) => ({ pay: O.Stripe.confirm.commit(sel, { outcomes: payOutcomes(E) }) }),
  initial: "A",
  states: ({ calls }) => ({ A: { on: { Pay: { actions: [calls.pay], }, RetryNow: { actions: [calls.pay.retry] } } } }),
})
console.log("forgotten in calls (shape 2):", lintCalls(forgot))   // { unused: [], undeclared: 1 }
console.log("declared, unused  (shape 3b):", lintCalls(unused))    // { unused: ["spare"], undeclared: 0 }
console.log("clean:", lintCalls(clean))                             // { unused: [], undeclared: 0 }
