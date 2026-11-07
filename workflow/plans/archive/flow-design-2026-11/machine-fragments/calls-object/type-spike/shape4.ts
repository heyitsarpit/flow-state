// Shape 4: a two-step builder. machineB(Def).calls(({ O }) => ({ pay })).body(({ calls, E }) => ({ states }))
import { type Snapshot, definition, each, machineB, traitB } from "./lib.ts"
import { Setter, confirm, payOutcomes, type CheckoutEv, type PayNeed } from "./def.ts"

export const SetterRow = traitB(Setter)
  .calls(({ O, E }) => ({
    set: O.Api.save.commit<{ readonly value: string }>(({ event }) => ({ value: event.value }), {
      outcomes: { success: E.Saved, failure: { Rejected: E.SaveFailed }, unknown: E.SaveUnsure },
    }),
  }))
  .body(({ calls }) => ({ initial: "IDLE", states: { IDLE: { on: { Set: { guard: [calls.set.idle], actions: [calls.set] } } } } }))
const WithRows = definition<CheckoutEv>()({
  id: "Checkout4", memory: { intentId: "", paymentMethodId: "", busyTries: 0 },
  operations: { Stripe: { confirm } }, traits: { rows: each(SetterRow) },
})

export const checkout4 = machineB(WithRows)
  .calls(({ O, E }) => ({
    pay: O.Stripe.confirm.commit<PayNeed>(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }), {
      outcomes: {
        success: E.Paid.from((v) => ({ chargeId: v.chargeId })),
        failure: { CardDeclined: E.Declined.from((r) => ({ code: r.declineCode })), Busy: E.TryLater, Rejected: E.TryLater },
        unknown: E.Unsure,
      },
    }),
  }))
  .body(({ calls }) => ({
    initial: "CARD",
    states: {
      CARD: { on: { Pay: { target: "PAYING", guard: [calls.pay.idle], updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId }), actions: [calls.pay] } } },
      PAYING: { on: { RetryNow: { actions: [calls.pay.retry] }, TryLater: { target: "CARD" } } },
    },
  }))
declare const s4: Snapshot<typeof checkout4>
export const pending4: boolean = s4.calls.pay.pending                      // (g)
// @ts-expect-error (g)
void s4.calls.charge
export const rowPending4: boolean = s4.traits.rows[0]!.calls.set.pending   // (h)
// @ts-expect-error (h)
void s4.traits.rows[0]!.calls.save

const payCall = machineB(WithRows).calls(({ O, E }) => ({
  pay: O.Stripe.confirm.commit<PayNeed>(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }), { outcomes: payOutcomes(E) }),
}))
// (a) typo in a member
export const a4 = payCall.body(({ calls }) => ({
  initial: "A",
  // @ts-expect-error (a): Property 'nope' does not exist
  states: { A: { on: { Pay: { guard: [calls.pay.nope] } } } },
}))
// (b) listed under an event without the field. Expression-bodied, so the error is on the `states` property
export const b4 = payCall.body(({ calls }) => ({
  initial: "A",
  // @ts-expect-error (b)
  states: { A: { on: { Other: { actions: [calls.pay] } } } },
}))
// (c) exhaustive failure tags
export const c4 = machineB(WithRows).calls(({ O, E }) => ({
  pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), {
    outcomes: {
      success: E.Paid.from((v) => ({ chargeId: v.chargeId })),
      // @ts-expect-error (c)
      failure: { CardDeclined: E.TryLater, Busy: E.TryLater },
      unknown: E.Unsure,
    },
  }),
}))
// (d)/(e) typo or undeclared
export const d4 = payCall.body(({ calls }) => ({
  initial: "A",
  // @ts-expect-error (d)/(e): Property 'pya' does not exist
  states: { A: { on: { Pay: { actions: [calls.pya] } } } },
}))
// (e) the body callback sees only `calls`, `E`: there is nothing else to use. A const made outside is the only escape hatch.
// (f) declared, never used: compiles
export const f4 = machineB(WithRows)
  .calls(({ O, E }) => ({
    pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }),
    unusedCall: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }),
  }))
  .body(({ calls }) => ({ initial: "A", states: { A: { on: { Pay: { actions: [calls.pay] } } } } }))
// (j) excess properties
export const j4a = payCall.body(() => ({
  initial: "A",
  // @ts-expect-error (j)
  states: { A: { on: { Pay: { target: "A", actoins: [] } } } },
}))
export const j4b = payCall.body(() => ({
  initial: "A",
  states: {
    A: {
      on: {
        Pay: {},
        // @ts-expect-error (j): Teapot is not an event
        Teapot: {},
      },
    },
  },
}))
