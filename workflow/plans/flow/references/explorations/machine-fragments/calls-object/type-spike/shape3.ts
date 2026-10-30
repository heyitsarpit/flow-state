// Shape 3: states as a function of calls. Three spellings, because only two of them infer.
//   3a  machine(Def, ({ O }) => ({ calls, states: ({ calls }) => ... }))                 intra-expression inference FAILS
//   3b  machineO(Def, { calls: ({ O }) => ({...}), states: ({ calls }) => ({...}) })       works
//   3c  machineD(Def, ({ O, define }) => define({ calls, states: ({ calls }) => ... }))    works
import { type Snapshot, definition, each, machine, machineD, machineO, traitO } from "./lib.ts"
import { Setter, confirm, payOutcomes, type CheckoutEv, type PayNeed } from "./def.ts"

const Plain = definition<CheckoutEv>()({ id: "A3", memory: { intentId: "", paymentMethodId: "", busyTries: 0 }, operations: { Stripe: { confirm } } })

// ── 3a: the owner's worry is real here ───────────────────────────────────────────────────────────────
export const a3 = machine(Plain, ({ O, E }) => ({
  // @ts-expect-error 3a: C collapsed to the Record<string, Call> constraint (the `Inferred` guard turns that into an error)
  calls: { pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }) },
  initial: "A",
  states: ({ calls }) => ({ A: { on: { Pay: { actions: [calls.pay] } } } }),
}))

// ── 3b: object of two functions ──────────────────────────────────────────────────────────────────────
export const SetterRow = traitO(Setter, {
  calls: ({ O, E }) => ({
    set: O.Api.save.commit<{ readonly value: string }>(({ event }) => ({ value: event.value }), {
      outcomes: { success: E.Saved, failure: { Rejected: E.SaveFailed }, unknown: E.SaveUnsure },
    }),
  }),
  initial: "IDLE",
  states: ({ calls }) => ({ IDLE: { on: { Set: { guard: [calls.set.idle], actions: [calls.set] } } } }),
})
const WithRows = definition<CheckoutEv>()({
  id: "Checkout3", memory: { intentId: "", paymentMethodId: "", busyTries: 0 },
  operations: { Stripe: { confirm } }, traits: { rows: each(SetterRow) },
})

export const checkout3b = machineO(WithRows, {
  calls: ({ O, E }) => ({
    pay: O.Stripe.confirm.commit<PayNeed>(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }), {
      outcomes: {
        success: E.Paid.from((v) => ({ chargeId: v.chargeId })),
        failure: { CardDeclined: E.Declined.from((r) => ({ code: r.declineCode })), Busy: E.TryLater, Rejected: E.TryLater },
        unknown: E.Unsure,
      },
    }),
  }),
  initial: "CARD",
  states: ({ calls }) => ({
    CARD: { on: { Pay: { target: "PAYING", guard: [calls.pay.idle], updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId }), actions: [calls.pay] } } },
    PAYING: { on: { RetryNow: { actions: [calls.pay.retry] }, TryLater: { target: "CARD" } } },
  }),
})
declare const s3b: Snapshot<typeof checkout3b>
export const pending3b: boolean = s3b.calls.pay.pending                      // (g)
// @ts-expect-error (g)
void s3b.calls.charge
export const rowPending3b: boolean = s3b.traits.rows[0]!.calls.set.pending   // (h)
// @ts-expect-error (h)
void s3b.traits.rows[0]!.calls.save

// (a) typo in a member: precise
export const a3b = machineO(WithRows, {
  calls: ({ O, E }) => ({ pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }) }),
  initial: "A",
  // @ts-expect-error (a): Property 'nope' does not exist on type 'Call<...>'
  states: ({ calls }) => ({ A: { on: { Pay: { guard: [calls.pay.nope] } } } }),
})
// (b) listed under an event without the field: on the `states` return, not on the offending line
export const b3b = machineO(WithRows, {
  calls: ({ O, E }) => ({ pay: O.Stripe.confirm.commit<PayNeed>(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }), { outcomes: payOutcomes(E) }) }),
  initial: "A",
  // @ts-expect-error (b): Other has no paymentMethodId
  states: ({ calls }) => ({ A: { on: { Other: { actions: [calls.pay] } } } }),
})
// (c) exhaustive failure tags
export const c3b = machineO(WithRows, {
  calls: ({ O, E }) => ({
    pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), {
      outcomes: {
        success: E.Paid.from((v) => ({ chargeId: v.chargeId })),
        // @ts-expect-error (c): Rejected is not mapped
        failure: { CardDeclined: E.TryLater, Busy: E.TryLater },
        unknown: E.Unsure,
      },
    }),
  }),
  initial: "A",
  states: () => ({ A: {} }),
})
// (d)/(e) typo, or a call that was never declared: the same error, `calls` holds exactly what `calls` returned
export const d3b = machineO(WithRows, {
  calls: ({ O, E }) => ({ pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }) }),
  initial: "A",
  // @ts-expect-error (d)/(e): Property 'pya' does not exist on type '{ pay: Call<...> }'
  states: ({ calls }) => ({ A: { on: { Pay: { actions: [calls.pya] } } } }),
})
// (e) there is no other scope for a call: a const made outside `calls` cannot be reached from `states` unless the author closes over it by hand
export const e3b = machineO(WithRows, {
  calls: ({ O, E }) => ({ pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }) }),
  initial: "A",
  states: ({ calls }) => ({ A: { on: { Pay: { actions: [calls.pay] } } } }),   // OK; (f) `calls` could hold a never-listed call and still compile
})
// (f) declared, never used: compiles
export const f3b = machineO(WithRows, {
  calls: ({ O, E }) => ({
    pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }),
    unusedCall: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }),
  }),
  initial: "A",
  states: ({ calls }) => ({ A: { on: { Pay: { actions: [calls.pay] } } } }),
})
// (j) excess properties: precise, on the offending property
export const j3b = machineO(WithRows, {
  calls: () => ({}),
  initial: "A",
  states: () => ({
    // @ts-expect-error (j): Type '[]' is not assignable to type 'never' (`actoins`)
    A: { on: { Pay: { target: "A", actoins: [] } } },
  }),
})
export const j3c = machineO(WithRows, {
  calls: () => ({}),
  initial: "A",
  states: () => ({
    A: {
      on: {
        Pay: {},
        // @ts-expect-error (j): Teapot is not an event
        Teapot: {},
      },
    },
  }),
})
export const j3d = machineO(WithRows, {
  calls: () => ({}),
  initial: "A",
  states: () => ({
    // @ts-expect-error (j): `onn` is not a state property
    A: { onn: {} },
  }),
})

// ── 3c: `define` ─────────────────────────────────────────────────────────────────────────────────────
export const checkout3c = machineD(WithRows, ({ O, E, define }) => define({
  calls: { pay: O.Stripe.confirm.commit<PayNeed>(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }), { outcomes: payOutcomes(E) }) },
  initial: "CARD",
  states: ({ calls }) => ({
    CARD: { on: { Pay: { target: "PAYING", guard: [calls.pay.idle], actions: [calls.pay] } } },
    PAYING: { on: { RetryNow: { actions: [calls.pay.retry] } } },
  }),
}))
declare const s3c: Snapshot<typeof checkout3c>
export const pending3c: boolean = s3c.calls.pay.pending
// @ts-expect-error (g)
void s3c.calls.charge

export const b3c = machineD(WithRows, ({ O, E, define }) => define({
  calls: { pay: O.Stripe.confirm.commit<PayNeed>(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }), { outcomes: payOutcomes(E) }) },
  initial: "A",
  // @ts-expect-error (b)
  states: ({ calls }) => ({ A: { on: { Other: { actions: [calls.pay] } } } }),
}))
export const d3c = machineD(WithRows, ({ O, E, define }) => define({
  calls: { pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }) },
  initial: "A",
  // @ts-expect-error (d)
  states: ({ calls }) => ({ A: { on: { Pay: { actions: [calls.pya] } } } }),
}))
// 3c also allows locals before `define`, which is shape 2 again: a forgotten local is possible
export const e3c = machineD(WithRows, ({ O, E, define }) => {
  const forgotten = O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) })
  return define({
    calls: { pay: O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }) },
    initial: "A",
    states: ({ calls }) => ({ A: { on: { Pay: { actions: [calls.pay, forgotten] } } } }),   // compiles
  })
})
