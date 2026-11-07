// Shape 5: calls on the definition. `definition({ ..., calls: { pay: Stripe.confirm } })`; select and outcomes bound in the body.
//   5  = `calls: { pay: confirm }`                 the handle cannot know which event fields its select reads
//   5b = `calls: { pay: decl<PayNeed>()(confirm) }` the event fields move onto the definition
import { type Snapshot, decl, definition, each, machine5, trait5 } from "./lib.ts"
import { Setter, confirm, payOutcomes, save, type CheckoutEv, type PayNeed, type SetterEv } from "./def.ts"

const SetterD = definition<SetterEv>()({ id: "Setter5", memory: { value: "" }, calls: { set: decl<{ readonly value: string }>()(save) } })
export const SetterRow = trait5(SetterD, ({ calls, E }) => ({
  bind: {
    set: { select: ({ event }) => ({ value: event.value }), outcomes: { success: E.Saved, failure: { Rejected: E.SaveFailed }, unknown: E.SaveUnsure } },
  },
  initial: "IDLE",
  states: { IDLE: { on: { Set: { guard: [calls.set.idle], actions: [calls.set] } } } },
}))
void Setter

const D5 = definition<CheckoutEv>()({
  id: "Checkout5", memory: { intentId: "", paymentMethodId: "", busyTries: 0 },
  calls: { pay: confirm }, traits: { rows: each(SetterRow) },
})
const D5b = definition<CheckoutEv>()({
  id: "Checkout5b", memory: { intentId: "", paymentMethodId: "", busyTries: 0 },
  calls: { pay: decl<PayNeed>()(confirm) }, traits: { rows: each(SetterRow) },
})

// 5: the select cannot read the event (the handle's Need is unknown), so the compile-time check on `event` is gone
export const checkout5 = machine5(D5, ({ calls, E }) => ({
  bind: {
    pay: {
      select: ({ memory }) => ({ intentId: memory.intentId, paymentMethodId: memory.paymentMethodId }),   // memory only
      outcomes: payOutcomes(E),
    },
  },
  initial: "CARD",
  states: { CARD: { on: { Pay: { guard: [calls.pay.idle], actions: [calls.pay] } } } },
}))
declare const s5: Snapshot<typeof checkout5>
export const pending5: boolean = s5.calls.pay.pending                      // (g)
// @ts-expect-error (g)
void s5.calls.charge
export const rowPending5: boolean = s5.traits.rows[0]!.calls.set.pending   // (h)
// @ts-expect-error (h)
void s5.traits.rows[0]!.calls.save

// (b) with a plain declaration, reading the event in the select is an error ...
export const b5a = machine5(D5, ({ calls, E }) => ({
  bind: {
    pay: {
      // @ts-expect-error (b): 'event' is of type 'unknown'
      select: ({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }),
      outcomes: payOutcomes(E),
    },
  },
  initial: "A",
  states: { A: { on: { Pay: { actions: [calls.pay] } } } },
}))
// ... and a handle with unknown Need can be listed under ANY event: the per-transition check is lost.
export const b5b = machine5(D5, ({ calls, E }) => ({
  bind: { pay: { select: ({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), outcomes: payOutcomes(E) } },
  initial: "A",
  states: { A: { on: { Other: { actions: [calls.pay] } } } },   // compiles
}))
// 5b: the definition declares the event fields; both checks come back
export const checkout5b = machine5(D5b, ({ calls, E }) => ({
  bind: {
    pay: {
      select: ({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }),
      outcomes: payOutcomes(E),
    },
  },
  initial: "CARD",
  states: { CARD: { on: { Pay: { guard: [calls.pay.idle], actions: [calls.pay] } } } },
}))
export const b5c = machine5(D5b, ({ calls, E }) => ({
  bind: { pay: { select: ({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }), outcomes: payOutcomes(E) } },
  initial: "A",
  // @ts-expect-error (b): Other has no paymentMethodId
  states: { A: { on: { Other: { actions: [calls.pay] } } } },
}))
// (c) exhaustive failure tags, at bind
export const c5 = machine5(D5b, ({ E }) => ({
  bind: {
    pay: {
      select: ({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }),
      outcomes: {
        success: E.Paid.from((v: { readonly chargeId: string }) => ({ chargeId: v.chargeId })),   // v needs an annotation here: see RESULTS
        // @ts-expect-error (c)
        failure: { CardDeclined: E.TryLater, Busy: E.TryLater },
        unknown: E.Unsure,
      },
    },
  },
  initial: "A",
  states: {},
}))
// (d)/(e) typo, or a call the definition does not declare: handles exist only for declared calls
export const d5 = machine5(D5b, ({ calls, E }) => ({
  bind: { pay: { select: ({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), outcomes: payOutcomes(E) } },
  initial: "A",
  // @ts-expect-error (d)/(e)
  states: { A: { on: { Pay: { actions: [calls.pya] } } } },
}))
// a declared call that is never bound is an error (the one thing 5 makes exhaustive)
export const unbound5 = machine5(D5b, ({ calls }) => ({
  // @ts-expect-error: Property 'pay' is missing in type '{}'
  bind: {},
  initial: "A",
  states: { A: { on: { Pay: { actions: [calls.pay] } } } },
}))
// (f) declared and bound, never used: compiles
export const f5 = machine5(D5b, ({ E }) => ({
  bind: { pay: { select: ({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), outcomes: payOutcomes(E) } },
  initial: "A",
  states: {},
}))
// (j) excess properties
export const j5 = machine5(D5b, ({ calls, E }) => ({
  bind: { pay: { select: ({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), outcomes: payOutcomes(E) } },
  initial: "A",
  states: {
    // @ts-expect-error (j)
    A: { on: { Pay: { target: "A", actoins: [calls.pay] } } },
  },
}))
// an extra key in `bind` (no such declared call): compiles, because a callback's returned literal gets no excess-property check
export const extra5 = machine5(D5b, ({ E }) => ({
  bind: {
    pay: { select: ({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), outcomes: payOutcomes(E) },
    ghost: { select: () => 1, outcomes: 1 },
  },
  initial: "A",
  states: {},
}))
