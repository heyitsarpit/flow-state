// booking (F1), rewritten with calls-next in the in-machine-calls syntax. booking.operations.ts is unchanged except
// `attempt.idempotencyKey` (rule 7). The remaining `!` are on memory set on entry to HELD (`holdId`, `expiresAt`)
// or in the charge's success turn (`paymentId`): v4 has no state-scoped memory. None is on an Attempt.
// ───────────────────────────────────────────────── booking.definition.ts
import { definition, deny, Flow, machine } from "flow-state"
import { Duration, Schema } from "effect"
import { Booking } from "./booking.operations"

export const BookingFlow = definition({
  id: "Tickets/Booking",
  states: [
    "IDLE", "HOLDING", "HOLD_WAIT",
    { HELD: ["CARD", "PAYING", "PAY_UNSURE", "CONFIRMING", "CONFIRM_WAIT"] },   // the countdown runs on HELD
    "REFUNDING", "REFUND_WAIT",                                                 // compensation: money taken, seats not ours
    "SETTLING", "SETTLE_WAIT",                                                  // left with an unknown charge: find out
    "BOOKED", "EXPIRED", "RELEASED", "REFUNDED", "UNAVAILABLE", "NEEDS_HELP", "LEFT",
  ],
  events: { Reserve: {}, Pay: { paymentMethodId: Schema.String }, CheckPayment: {}, Leave: {} },
  internalEvents: {
    Held: { holdId: Schema.String, expiresAt: Schema.Number }, SeatsTaken: {}, HoldUnsure: Flow.uncertain({}),
    Paid: { paymentId: Schema.String }, ChargeDeclined: { code: Schema.String }, ChargeUnsure: Flow.uncertain({}),
    Booked: { bookingId: Schema.String }, ConfirmFailed: {}, ConfirmBusy: { retryAfterMs: Schema.optional(Schema.Number) }, ConfirmUnsure: Flow.uncertain({}),
    Refunded: {}, RefundRejected: { code: Schema.String }, RefundBusy: { retryAfterMs: Schema.optional(Schema.Number) }, RefundUnsure: Flow.uncertain({}),
    Released: {}, ReleaseUnsure: Flow.uncertain({}),
    Refused: {},
    HoldAgain: {}, PayTick: {}, SettleTick: {}, ConfirmRetryNow: {}, RefundRetryNow: {}, Expired: {},
  },
  memory: {
    eventId: Flow.input(Schema.String),
    seats: Flow.input(Schema.Array(Schema.String)),
    amountCents: Flow.input(Schema.Int),
    holdId: Flow.initial(Schema.NullOr(Schema.String), null),
    expiresAt: Flow.initial(Schema.NullOr(Schema.Number), null),
    holdExpired: Flow.initial(Schema.Boolean, false),
    paymentId: Flow.initial(Schema.NullOr(Schema.String), null),
    bookingId: Flow.initial(Schema.NullOr(Schema.String), null),
    declines: Flow.initial(Schema.Int, 0),
    error: Flow.initial(Schema.NullOr(Schema.String), null),
    retryInMs: Flow.initial(Schema.Int, 0),
  },
  operations: { Booking },
})

// ───────────────────────────────────────────────── booking.machine.ts
const MAX_DECLINES = 3
const backoff = (sends: number) => 1000 * 2 ** sends

export const BookingMachine = machine(BookingFlow, ({ S, E, O }) => {
  const holdKey = ({ memory }) => ({ eventId: memory.eventId })
  const chargeKey = ({ memory }) => ({ holdId: memory.holdId! })
  const refundKey = ({ memory }) => ({ paymentId: memory.paymentId! })

  const hold = O.Booking.hold.commit(({ memory }) => ({ eventId: memory.eventId, seats: memory.seats }), {
    outcomes: { success: E.Held.from((v) => ({ holdId: v.holdId, expiresAt: v.expiresAt })), failure: { SeatsTaken: E.SeatsTaken, Rejected: E.Refused }, unknown: E.HoldUnsure },
  })
  const charge = O.Booking.charge.commit(({ memory, event }) => ({ holdId: memory.holdId!, amountCents: memory.amountCents, paymentMethodId: event.paymentMethodId }), {
    outcomes: { success: E.Paid.from((v) => ({ paymentId: v.paymentId })), failure: { CardDeclined: E.ChargeDeclined.from((r) => ({ code: r.code })), Rejected: E.Refused }, unknown: E.ChargeUnsure },
  })
  const confirm = O.Booking.confirm.commit(chargeKey, {   // started in Paid's turn: holdId is set
    outcomes: {
      success: E.Booked.from((v) => ({ bookingId: v.bookingId })),
      failure: { HoldExpired: E.ConfirmFailed, SeatsReassigned: E.ConfirmFailed, Rejected: E.ConfirmFailed, Busy: E.ConfirmBusy.from((r) => ({ retryAfterMs: r.retryAfterMs })) },
      unknown: E.ConfirmUnsure,
    },
  })
  // One commit value per write, so `retry` always finds the record: a late turn writes the id first (rule 10 reads it).
  const refund = O.Booking.refund.commit(refundKey, {
    outcomes: {
      success: E.Refunded,
      failure: { Busy: E.RefundBusy.from((r) => ({ retryAfterMs: r.retryAfterMs })), RefundRejected: E.RefundRejected.from((r) => ({ code: r.code })) },
      unknown: E.RefundUnsure,
    },
  })
  const release = O.Booking.release.commit(({ memory }) => ({ holdId: memory.holdId! }), { outcomes: { success: E.Released, unknown: E.ReleaseUnsure } })

  const toRefund = { target: S.REFUNDING, actions: [refund] }
  const needsHelp = (error: string) => ({ target: S.NEEDS_HELP, updateMemory: () => ({ error }) })
  const toUnavailable = (error: string) => ({ target: S.UNAVAILABLE, updateMemory: () => ({ error }) })
  const underBudget = (call, key, max: number) => (g) => call.at(g, key(g)).sends < max || deny("GaveUp")
  const waitBusy = (target, call, key, max: number) => ({ target, guard: underBudget(call, key, max), updateMemory: (g) => ({ retryInMs: g.event.retryAfterMs ?? backoff(call.at(g, key(g)).sends) }) })
  const waitUnsure = (target, call, key, max: number) => ({ target, guard: underBudget(call, key, max), updateMemory: (g) => ({ retryInMs: backoff(call.at(g, key(g)).sends) }) })
  const checkPayment = [
    { ...needsHelp("We couldn't confirm your payment. Please don't pay again; we'll email you."), guard: (g) => charge.at(g, chargeKey(g)).sends >= 6 || deny("ChecksLeft") },
    { target: S.HELD.PAYING, actions: [charge.retry(chargeKey)] },
    { target: "self" },
  ]

  return {
    default: S.IDLE,

    // Late endings (rule 2), routed from the root because their state was left. LEFT holds no call, so they may move it.
    on: {
      Held: [{ target: "self", guard: [S.LEFT], updateMemory: ({ event }) => ({ holdId: event.holdId }), actions: [release] }, { target: "self" }],
      HoldUnsure: [{ target: "self", guard: underBudget(hold, holdKey, 4), actions: [hold.retry(holdKey)] }, { target: "self" }],
      Paid: [{ target: S.REFUNDING, guard: [S.LEFT], updateMemory: ({ event }) => ({ paymentId: event.paymentId }), actions: [refund] }, { target: "self" }],
      ChargeUnsure: [{ target: S.SETTLING, guard: [S.LEFT], actions: [charge.retry(chargeKey)] }, { target: "self" }],
      Released: { target: "self" },                                     // the release's own endings: LEFT never moves
      ReleaseUnsure: { target: "self" },
    },

    states: {
      IDLE: { on: { Reserve: { target: S.HOLDING, actions: [hold] } } },

      HOLDING: {
        on: {
          Held: { target: S.HELD, updateMemory: ({ event }) => ({ holdId: event.holdId, expiresAt: event.expiresAt }) },
          SeatsTaken: toUnavailable("Those seats were just taken."),
          Refused: toUnavailable("We couldn't reserve your seats."),
          HoldUnsure: [waitUnsure(S.HOLD_WAIT, hold, holdKey, 4), toUnavailable("We couldn't reserve your seats. Try again.")],
          Leave: S.LEFT,                                               // if the hold lands later, the root releases it
        },
      },
      HOLD_WAIT: {
        schedules: { again: { schedule: "1 second", send: E.HoldAgain } },
        on: {
          HoldAgain: [{ target: S.HOLDING, actions: [hold.retry(holdKey)] }, { target: "self" }],
          Leave: { target: S.LEFT, actions: [hold.retry(holdKey)] },   // find out, so a landed hold is released
        },
      },

      HELD: {
        default: S.HELD.CARD,
        schedules: { expiry: { schedule: ({ memory, now }) => Duration.millis(Math.max(0, memory.expiresAt! - now)), send: E.Expired } },
        on: {
          Expired: [
            { target: S.EXPIRED, guard: [S.HELD.CARD], updateMemory: () => ({ error: "Your seats were released." }) },
            { target: "self", updateMemory: () => ({ holdExpired: true }) },   // a call is in flight: the server decides
          ],
        },
        states: {
          CARD: {
            on: {
              Pay: { target: S.HELD.PAYING, guard: ({ memory }) => memory.declines < MAX_DECLINES || deny("TooManyDeclines"), updateMemory: () => ({ error: null }), actions: [charge] },
              Leave: { target: S.LEFT, actions: [release] },
            },
          },
          PAYING: {
            on: {
              Paid: { target: S.HELD.CONFIRMING, updateMemory: ({ event }) => ({ paymentId: event.paymentId }), actions: [confirm] },
              ChargeDeclined: [
                { target: S.EXPIRED, guard: ({ memory }) => memory.holdExpired || deny("HoldStillLive"), updateMemory: () => ({ error: "Your seats were released." }) },
                { target: S.RELEASED, guard: ({ memory }) => memory.declines + 1 >= MAX_DECLINES || deny("TriesLeft"), updateMemory: ({ memory }) => ({ declines: memory.declines + 1, error: "Payment failed. Your seats were released." }), actions: [release] },
                { target: S.HELD.CARD, updateMemory: ({ memory, event }) => ({ declines: memory.declines + 1, error: `Card declined (${event.code})` }) },
              ],
              Refused: { target: S.HELD.CARD, updateMemory: () => ({ error: "We couldn't process this payment." }) },
              ChargeUnsure: S.HELD.PAY_UNSURE,
              Leave: { target: S.LEFT, actions: [release] },               // the charge's ending arrives late, at the root
            },
          },
          PAY_UNSURE: {
            schedules: { check: { schedule: "3 seconds", send: E.PayTick } },
            on: { PayTick: checkPayment, CheckPayment: checkPayment, Leave: { target: "self", guard: () => deny("CheckingPayment") } },
          },
          CONFIRMING: {
            on: {
              Booked: { target: S.BOOKED, updateMemory: ({ event }) => ({ bookingId: event.bookingId }) },
              ConfirmFailed: toRefund,
              ConfirmBusy: [waitBusy(S.HELD.CONFIRM_WAIT, confirm, chargeKey, 5), toRefund],    // definite: no earlier send may have applied (rule 6)
              ConfirmUnsure: [waitUnsure(S.HELD.CONFIRM_WAIT, confirm, chargeKey, 5), needsHelp("We couldn't confirm your booking. You've been charged; we'll resolve it and email you.")],
              Leave: { target: "self", guard: () => deny("Finishing") },
            },
          },
          CONFIRM_WAIT: {
            schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.ConfirmRetryNow } },
            on: { ConfirmRetryNow: [{ target: S.HELD.CONFIRMING, actions: [confirm.retry(chargeKey)] }, { target: "self" }], Leave: { target: "self", guard: () => deny("Finishing") } },
          },
        },
      },

      // Started from CONFIRMING or from a late turn: REFUNDING owns the refund, so its endings are current here (rule 3).
      REFUNDING: {
        on: {
          Refunded: S.REFUNDED,
          RefundRejected: needsHelp("The refund was refused. We'll refund you manually."),
          RefundBusy: [waitBusy(S.REFUND_WAIT, refund, refundKey, 8), needsHelp("Your refund is delayed. We'll complete it and email you.")],
          RefundUnsure: [waitUnsure(S.REFUND_WAIT, refund, refundKey, 8), needsHelp("Your refund is delayed. We'll complete it and email you.")],
        },
      },
      REFUND_WAIT: {
        schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RefundRetryNow } },
        on: { RefundRetryNow: [{ target: S.REFUNDING, actions: [refund.retry(refundKey)] }, { target: "self" }] },
      },

      SETTLING: {
        on: {
          Paid: { ...toRefund, updateMemory: ({ event }) => ({ paymentId: event.paymentId }) },
          ChargeUnsure: [{ target: S.SETTLE_WAIT, guard: underBudget(charge, chargeKey, 6) }, needsHelp("A payment may have been taken. We'll refund it if so.")],
          ChargeDeclined: S.LEFT, Refused: S.LEFT,
        },
      },
      SETTLE_WAIT: {
        schedules: { check: { schedule: "3 seconds", send: E.SettleTick } },
        on: { SettleTick: [{ target: S.SETTLING, actions: [charge.retry(chargeKey)] }, { target: "self" }] },
      },

      BOOKED: {}, EXPIRED: {}, RELEASED: {}, REFUNDED: {}, UNAVAILABLE: {}, NEEDS_HELP: {}, LEFT: {},
    },
  }
})
