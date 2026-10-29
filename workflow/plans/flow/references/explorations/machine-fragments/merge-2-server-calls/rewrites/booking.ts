// booking (F1), rewritten with calls-next in the in-machine-calls syntax. booking.operations.ts is unchanged except
// `attempt.id` on the wire (rule 7). The remaining `!` are on memory set on entry to HELD (`holdId`, `expiresAt`)
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
    Released: {}, ReleaseUnsure: Flow.uncertain({}), NotSent: {},   // NotSent: every reject commit's decline (rule 8), one event
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
    busyTries: Flow.initial(Schema.Int, 0),     // Busy is definite: tried again as new writes, budgeted here (rule 7)
    sameWrite: Flow.initial(Schema.Boolean, false),   // the wait after an unknown re-sends; after Busy it starts a new write
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
    outcomes: { success: E.Held.from((v) => ({ holdId: v.holdId, expiresAt: v.expiresAt })), failure: { SeatsTaken: E.SeatsTaken, Rejected: E.Refused, NotSent: E.NotSent }, unknown: E.HoldUnsure },
  })
  const charge = O.Booking.charge.commit(({ memory, event }) => ({ holdId: memory.holdId!, amountCents: memory.amountCents, paymentMethodId: event.paymentMethodId }), {
    outcomes: { success: E.Paid.from((v) => ({ paymentId: v.paymentId })), failure: { CardDeclined: E.ChargeDeclined.from((r) => ({ code: r.code })), Rejected: E.Refused, NotSent: E.NotSent }, unknown: E.ChargeUnsure },
  })
  const confirm = O.Booking.confirm.commit(chargeKey, {   // started in Paid's turn: holdId is set
    outcomes: {
      success: E.Booked.from((v) => ({ bookingId: v.bookingId })),
      failure: { HoldExpired: E.ConfirmFailed, SeatsReassigned: E.ConfirmFailed, Rejected: E.ConfirmFailed, Busy: E.ConfirmBusy.from((r) => ({ retryAfterMs: r.retryAfterMs })), NotSent: E.NotSent },
      unknown: E.ConfirmUnsure,
    },
  })
  // One commit value for both starting points: a late turn writes the id first (rule 10 reads it).
  const refund = O.Booking.refund.commit(refundKey, {
    outcomes: {
      success: E.Refunded,
      failure: { Busy: E.RefundBusy.from((r) => ({ retryAfterMs: r.retryAfterMs })), RefundRejected: E.RefundRejected.from((r) => ({ code: r.code })), NotSent: E.NotSent },
      unknown: E.RefundUnsure,
    },
  })
  const release = O.Booking.release.commit(({ memory }) => ({ holdId: memory.holdId! }), { outcomes: { success: E.Released, failure: { NotSent: E.NotSent }, unknown: E.ReleaseUnsure } })

  const toRefund = { target: S.REFUNDING, updateMemory: () => ({ busyTries: 0 }), actions: [refund] }
  const needsHelp = (error: string) => ({ target: S.NEEDS_HELP, updateMemory: () => ({ error }) })
  const toUnavailable = (error: string) => ({ target: S.UNAVAILABLE, updateMemory: () => ({ error }) })
  // after an unknown: the same write, budgeted by retryCount; after Busy (definite): a new write, budgeted in memory
  const underBudget = (call, key, max: number) => (g) => call.retryCount(g, key(g)) < max || deny("GaveUp")
  const waitUnsure = (target, call, key, max: number) => ({ target, guard: underBudget(call, key, max), updateMemory: (g) => ({ sameWrite: true, retryInMs: backoff(call.retryCount(g, key(g))) }) })
  const waitBusy = (target, max: number) => ({ target, guard: ({ memory }) => memory.busyTries < max || deny("GaveUp"), updateMemory: ({ memory, event }) => ({ sameWrite: false, busyTries: memory.busyTries + 1, retryInMs: event.retryAfterMs ?? backoff(memory.busyTries) }) })
  const again = (target, call, key) => [   // the wait's tick: re-send after an unknown, a new write after Busy
    { target, guard: ({ memory }) => memory.sameWrite || deny("NewWrite"), actions: [call.retry(key)] },
    { target, guard: [call.idle(key)], actions: [call] },
    { target: "self" },
  ]
  const checkPayment = [
    { ...needsHelp("We couldn't confirm your payment. Please don't pay again; we'll email you."), guard: (g) => charge.retryCount(g, chargeKey(g)) >= 6 || deny("ChecksLeft") },
    { target: S.HELD.PAYING, actions: [charge.retry(chargeKey)] },
    { target: "self" },
  ]

  return {
    default: S.IDLE,

    // Late endings (rule 2), routed from the root because their state was left. LEFT holds no call, so they may move it.
    on: {
      Held: [{ target: "self", guard: [S.LEFT], updateMemory: ({ event }) => ({ holdId: event.holdId }), actions: [release] }, { target: "self" }],
      HoldUnsure: [{ target: "self", guard: underBudget(hold, holdKey, 4), actions: [hold.retry(holdKey)] }, { target: "self" }],
      Paid: [{ target: S.REFUNDING, guard: [S.LEFT], updateMemory: ({ event }) => ({ paymentId: event.paymentId, busyTries: 0 }), actions: [refund] }, { target: "self" }],
      ChargeUnsure: [{ target: S.SETTLING, guard: [S.LEFT], actions: [charge.retry(chargeKey)] }, { target: "self" }],
      Released: { target: "self" },                                     // the release's own endings: LEFT never moves
      ReleaseUnsure: { target: "self" },
      // late events nobody needs to act on: explicit ignores (rule 8, D13)
      SeatsTaken: { target: "self" }, Refused: { target: "self" }, NotSent: { target: "self" }, ChargeDeclined: { target: "self" },
      Booked: { target: "self" }, ConfirmFailed: { target: "self" }, ConfirmBusy: { target: "self" }, ConfirmUnsure: { target: "self" },
      Refunded: { target: "self" }, RefundRejected: { target: "self" }, RefundBusy: { target: "self" }, RefundUnsure: { target: "self" },
    },

    states: {
      IDLE: { on: { Reserve: { target: S.HOLDING, guard: [hold.idle(holdKey)], actions: [hold] } } },

      HOLDING: {
        on: {
          Held: { target: S.HELD, updateMemory: ({ event }) => ({ holdId: event.holdId, expiresAt: event.expiresAt }) },
          SeatsTaken: toUnavailable("Those seats were just taken."),
          Refused: toUnavailable("We couldn't reserve your seats."),
          NotSent: toUnavailable("We couldn't reserve your seats. Try again."),   // a decline is an ending (rule 4)
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
              Pay: { target: S.HELD.PAYING, guard: [({ memory }) => memory.declines < MAX_DECLINES || deny("TooManyDeclines"), charge.idle(chargeKey)], updateMemory: () => ({ error: null }), actions: [charge] },
              Leave: { target: S.LEFT, actions: [release] },
            },
          },
          PAYING: {
            on: {
              Paid: { target: S.HELD.CONFIRMING, updateMemory: ({ event }) => ({ paymentId: event.paymentId, busyTries: 0 }), actions: [confirm] },
              ChargeDeclined: [
                { target: S.EXPIRED, guard: ({ memory }) => memory.holdExpired || deny("HoldStillLive"), updateMemory: () => ({ error: "Your seats were released." }) },
                { target: S.RELEASED, guard: ({ memory }) => memory.declines + 1 >= MAX_DECLINES || deny("TriesLeft"), updateMemory: ({ memory }) => ({ declines: memory.declines + 1, error: "Payment failed. Your seats were released." }), actions: [release] },
                { target: S.HELD.CARD, updateMemory: ({ memory, event }) => ({ declines: memory.declines + 1, error: `Card declined (${event.code})` }) },
              ],
              Refused: { target: S.HELD.CARD, updateMemory: () => ({ error: "We couldn't process this payment." }) },
              ChargeUnsure: S.HELD.PAY_UNSURE,
              NotSent: { target: S.HELD.CARD, updateMemory: () => ({ error: "Not sent. You were not charged." }) },
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
              NotSent: needsHelp("We couldn't confirm your booking. You've been charged; we'll resolve it and email you."),
              ConfirmBusy: [waitBusy(S.HELD.CONFIRM_WAIT, 5), toRefund],    // definite: no earlier send may have applied (rule 6)
              ConfirmUnsure: [waitUnsure(S.HELD.CONFIRM_WAIT, confirm, chargeKey, 5), needsHelp("We couldn't confirm your booking. You've been charged; we'll resolve it and email you.")],
              Leave: { target: "self", guard: () => deny("Finishing") },
            },
          },
          CONFIRM_WAIT: {
            schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.ConfirmRetryNow } },
            on: { ConfirmRetryNow: again(S.HELD.CONFIRMING, confirm, chargeKey), Leave: { target: "self", guard: () => deny("Finishing") } },
          },
        },
      },

      // Started from CONFIRMING or from a late turn: REFUNDING owns the refund, so its endings are current here (rule 3).
      REFUNDING: {
        on: {
          Refunded: S.REFUNDED,
          RefundRejected: needsHelp("The refund was refused. We'll refund you manually."),
          NotSent: needsHelp("Your refund is delayed. We'll complete it and email you."),
          RefundBusy: [waitBusy(S.REFUND_WAIT, 8), needsHelp("Your refund is delayed. We'll complete it and email you.")],
          RefundUnsure: [waitUnsure(S.REFUND_WAIT, refund, refundKey, 8), needsHelp("Your refund is delayed. We'll complete it and email you.")],
        },
      },
      REFUND_WAIT: {
        schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RefundRetryNow } },
        on: { RefundRetryNow: again(S.REFUNDING, refund, refundKey) },
      },

      SETTLING: {
        on: {
          Paid: { ...toRefund, updateMemory: ({ event }) => ({ paymentId: event.paymentId, busyTries: 0 }) },
          ChargeUnsure: [{ target: S.SETTLE_WAIT, guard: underBudget(charge, chargeKey, 6) }, needsHelp("A payment may have been taken. We'll refund it if so.")],
          ChargeDeclined: S.LEFT, Refused: S.LEFT, NotSent: needsHelp("A payment may have been taken. We'll refund it if so."),
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
