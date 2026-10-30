// Shape 1: one object literal. `({ O }) => ({ calls: { pay: ... }, states: { ... actions: [calls.pay] ... } })`
// An object literal does not put its own properties in scope, so `calls` is not a name inside `states`.
import { machine, type CallRecord, type Machine, type States } from "./lib.ts"
import { Checkout, payOutcomes, type CheckoutEv } from "./def.ts"

// 1a. bare `calls`: not in scope.
export const m1a = machine(Checkout, ({ O, E }) => ({
  calls: { pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }) },
  initial: "A",
  states: {
    // @ts-expect-error 1a: Cannot find name 'calls'
    A: { on: { Pay: { actions: [calls.pay] } } },
  },
}))

// 1b. `this.calls`: in an arrow function, `this` is the module's, not the object's.
export const m1b = machine(Checkout, ({ O, E }) => ({
  calls: { pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }) },
  initial: "A",
  states: {
    // @ts-expect-error 1b: 'this' implicitly has type 'any' / is the module, not the object
    A: { on: { Pay: { actions: [this.calls.pay] } } },
  },
}))

// 1c. A self reference: `const self = { calls, states: self.calls.pay }` is circular.
export const m1c = machine(Checkout, ({ O, E }) => {
  // @ts-expect-error 1c: 'self' implicitly has type 'any' because it ... is referenced directly or indirectly in its own initializer
  const self = {
    calls: { pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }) },
    initial: "A",
    // @ts-expect-error 1c: Block-scoped variable 'self' used before its declaration
    states: { A: { on: { Pay: { actions: [self.calls.pay] } } } },
  }
  return self
})

// 1d. A method-style `states(this: { calls })` reads the sibling through `this`. It infers (a `this` parameter is
// a contextually typed parameter) but only when the whole body is a direct argument, and `this` is the author-facing syntax.
declare function withThis<C extends CallRecord>(b: { readonly calls: C; readonly initial: string; states(this: { readonly calls: C }): States<CheckoutEv, any> }): C
export const m1d = withThis({
  calls: {} as { pay: import("./lib.ts").Call<unknown, any> },
  initial: "A",
  states() { return { A: { on: { Pay: { actions: [this.calls.pay] } } } } },
})
export const m1e = withThis({
  calls: {} as { pay: import("./lib.ts").Call<unknown, any> },
  initial: "A",
  states() {
    // @ts-expect-error 1d: the typo is caught through `this`
    return { A: { on: { Pay: { actions: [this.calls.pya] } } } }
  },
})
void ({} as Machine<CheckoutEv, unknown, unknown, unknown>)
