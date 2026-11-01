// Shape 2: local consts, then a `calls` record. `actions: [pay]` uses the const; `calls: { pay }` publishes it.
// 2  = plain consts          (a forgotten const is NOT a type error; flow check must catch it: see lint.ts)
// 2c = consts wrapped in `named("pay", ...)`  (a forgotten const IS a type error, at the cost of writing each name twice)
import { type Snapshot, definition, each, machine, machineN, named, trait } from "./lib.ts"
import { Setter, confirm, payOutcomes, type CheckoutEv, type PayNeed } from "./def.ts"

export const SetterRow = trait(Setter, ({ O, E }) => {
  const set = O.Api.save.commit<{ readonly value: string }>(({ event }) => ({ value: event.value }), {
    outcomes: { success: E.Saved, failure: { Rejected: E.SaveFailed }, unknown: E.SaveUnsure },
  })
  return { calls: { set }, initial: "IDLE", states: { IDLE: { on: { Set: { guard: [set.idle], actions: [set] } } } } }
})
const WithRows = definition<CheckoutEv>()({
  id: "Checkout2", memory: { intentId: "", paymentMethodId: "", busyTries: 0 },
  operations: { Stripe: { confirm } }, traits: { rows: each(SetterRow) },
})

// ── positives ────────────────────────────────────────────────────────────────────────────────────────
export const checkout2 = machine(WithRows, ({ O, E }) => {
  const pay = O.Stripe.confirm.commit<PayNeed>(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }), {
    outcomes: {
      success: E.Paid.from((v) => ({ chargeId: v.chargeId })),            // v is inferred from the operation
      failure: { CardDeclined: E.Declined.from((r) => ({ code: r.declineCode })), Busy: E.TryLater, Rejected: E.TryLater },
      unknown: E.Unsure,
    },
  })
  return {
    calls: { pay },
    initial: "CARD",
    states: {
      CARD: { on: { Pay: { target: "PAYING", guard: [pay.idle], updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId }), actions: [pay] } } },
      PAYING: { on: { RetryNow: { actions: [pay.retry] }, TryLater: { target: "CARD" } } },
    },
  }
})
declare const s: Snapshot<typeof checkout2>
export const pending: boolean = s.calls.pay.pending                      // (g)
// @ts-expect-error (g): an undeclared call is not on the snapshot
void s.calls.charge
export const rowPending: boolean = s.traits.rows[0]!.calls.set.pending   // (h)
// @ts-expect-error (h): the trait has no `save` call
void s.traits.rows[0]!.calls.save

// ── negatives, one machine each so no error hides another ────────────────────────────────────────────
// (b) listed under an event without the field. NOTE: block-bodied callback, so TS cannot elaborate: the error is on the callback head.
// @ts-expect-error (b)
export const b2 = machine(WithRows, ({ O, E }) => {
  const pay = O.Stripe.confirm.commit<PayNeed>(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }), { outcomes: payOutcomes(E) })
  return { calls: { pay }, initial: "A", states: { A: { on: { Other: { actions: [pay] } } } } }
})
// (b') the select reads `event` but the call never declared what it needs: `event` is unknown, caught at the select itself
export const b2b = machine(WithRows, ({ O, E }) => {
  const pay = O.Stripe.confirm.commit(({ memory, event }) => ({
    intentId: memory.intentId,
    // @ts-expect-error (b'): 'event' is of type 'unknown'
    paymentMethodId: event.paymentMethodId,
  }), { outcomes: payOutcomes(E) })
  return { calls: { pay }, initial: "A", states: { A: { on: { Pay: { actions: [pay] } } } } }
})
// (c) exhaustive failure tags: precise, at the `failure` property
export const c2 = machine(WithRows, ({ O, E }) => {
  const pay = O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), {
    outcomes: {
      success: E.Paid.from((v) => ({ chargeId: v.chargeId })),
      // @ts-expect-error (c): Rejected is not mapped
      failure: { CardDeclined: E.TryLater, Busy: E.TryLater },
      unknown: E.Unsure,
    },
  })
  return { calls: { pay }, initial: "A", states: { A: {} } }
})
// (d) typo: precise
export const d2 = machine(WithRows, ({ O, E }) => {
  const pay = O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) })
  return {
    calls: { pay }, initial: "A",
    states: {
      // @ts-expect-error (d): Cannot find name 'pya'
      A: { on: { Pay: { actions: [pya] } } },
    },
  }
})
// (e) a const used in `actions` but missing from `calls`: NOT an error for plain consts.
export const e2 = machine(WithRows, ({ O, E }) => {
  const pay = O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) })
  const forgotten = O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) })
  return { calls: { pay }, initial: "A", states: { A: { on: { RetryNow: { actions: [pay, forgotten] } } } } }   // compiles. Its lane would have no snapshot entry.
})
// (g) the snapshot for e2 has no `forgotten`, so a view cannot read it: the bug shows up late
declare const se: Snapshot<typeof e2>
// @ts-expect-error (g)
void se.calls.forgotten
// (a) a member typo is precise
export const a2 = machine(WithRows, ({ O, E }) => {
  const pay = O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) })
  // @ts-expect-error (a): Property 'nope' does not exist on type 'Call<...>'
  return { calls: { pay }, initial: "A", states: { A: { on: { Pay: { guard: [pay.nope] } } } } }
})
// (j) excess properties are caught, but the error is on the callback head (block body), one per machine
// @ts-expect-error (j): `actoins` is not a handler property (mixed with a valid one)
export const j2a = machine(WithRows, ({ O, E }) => {
  const pay = O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) })
  return { calls: { pay }, initial: "A", states: { B: { on: { Pay: { target: "A", actoins: [pay] } } } } }
})
// @ts-expect-error (j): Teapot is not an event
export const j2b = machine(WithRows, ({ O, E }) => {
  const pay = O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) })
  return { calls: { pay }, initial: "A", states: { C: { on: { Teapot: {}, Pay: { actions: [pay] } } } } }
})
// @ts-expect-error (j): `onn` is not a state property
export const j2c = machine(WithRows, ({ O, E }) => {
  const pay = O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) })
  return { calls: { pay }, initial: "A", states: { D: { onn: {} } } }
})

// ── 2c: named calls ──────────────────────────────────────────────────────────────────────────────────
export const checkout2c = machineN(WithRows, ({ O, E }) => {
  const pay = named("pay", O.Stripe.confirm.commit<PayNeed>(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }), { outcomes: payOutcomes(E) }))
  return { calls: { pay }, initial: "CARD", states: { CARD: { on: { Pay: { guard: [pay.idle], actions: [pay] } } } } }
})
// @ts-expect-error (e): `forgotten` is used in states but not declared in calls
export const e2c = machineN(WithRows, ({ O, E }) => {
  const pay = named("pay", O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }))
  const forgotten = named("forgotten", O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }))
  return { calls: { pay }, initial: "A", states: { A: { on: { RetryNow: { actions: [pay, forgotten] } } } } }
})
// the guard counts as a use too
// @ts-expect-error (e): only `forgotten.idle` is used, still reported
export const e2d = machineN(WithRows, ({ O, E }) => {
  const forgotten = named("forgotten", O.Stripe.confirm.commit(({ memory }) => ({ intentId: memory.intentId, paymentMethodId: "" }), { outcomes: payOutcomes(E) }))
  return { calls: {}, initial: "A", states: { A: { on: { Pay: { guard: [forgotten.idle] } } } } }
})
