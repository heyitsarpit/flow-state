// booking (F1), rewritten with calls-next. booking.operations.ts is unchanged except `attempt.idempotencyKey` (rule 7).
// The remaining `!` are on memory set on entry to HELD (`holdId`, `expiresAt`) and in the charge's success turn
// (`paymentId`): v4 has no state-scoped memory. None is on an Attempt.
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
  internalEvents: { HoldAgain: {}, PayTick: {}, SettleTick: {}, ConfirmRetryNow: {}, RefundRetryNow: {}, Expired: {} },
  calls: { hold: Booking.hold, charge: Booking.charge, confirm: Booking.confirm, refund: Booking.refund, release: Booking.release },  // ← NEW
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

export const BookingMachine = machine(BookingFlow, ({ S, E, C }) => {
  const holdKey = ({ memory }) => ({ eventId: memory.eventId })
  const chargeKey = ({ memory }) => ({ holdId: memory.holdId! })
  const confirmKey = chargeKey
  const refundKey = ({ memory }) => ({ paymentId: memory.paymentId! })
  const release = C.release.start(({ memory }) => ({ holdId: memory.holdId! }))   // best effort; the TTL is the backstop
  const toRefund = { target: S.REFUNDING, actions: [C.refund.start(refundKey)] }
  const needsHelp = (error: string) => ({ target: S.NEEDS_HELP, updateMemory: () => ({ error }) })
  const toUnavailable = (error: string) => ({ target: S.UNAVAILABLE, updateMemory: () => ({ error }) })
  const underBudget = (max: number) => ({ event }) => event.attempt.sends < max || deny("GaveUp")
  const waitBusy = (target, max: number) => ({ target, guard: underBudget(max), updateMemory: ({ event }) => ({ retryInMs: event.error.retryAfterMs ?? backoff(event.attempt.sends) }) })
  const waitUnsure = (target, max: number) => ({ target, guard: underBudget(max), updateMemory: ({ event }) => ({ retryInMs: backoff(event.attempt.sends) }) })
  const checkPayment = [
    { ...needsHelp("We couldn't confirm your payment. Please don't pay again; we'll email you."), guard: ({ calls, memory }) => calls.charge.at(chargeKey({ memory })).sends >= 6 || deny("ChecksLeft") },
    { target: S.HELD.PAYING, actions: [C.charge.resend(chargeKey)] },
    { target: "self" },
  ]

  return {
    default: S.IDLE,

    // Late endings (rule 2), routed from the root because their state was left. LEFT holds no call, so they may move it.
    on: {
      "hold.success": [{ target: "self", guard: [S.LEFT], actions: [C.release.start(({ event }) => ({ holdId: event.value.holdId }))] }, { target: "self" }],
      "hold.unknown": [{ target: "self", guard: ({ event }) => event.attempt.sends < 4 || deny("GaveUp"), actions: [C.hold.resend(({ event }) => event.attempt.key)] }, { target: "self" }],
      "charge.success": [{ ...toRefund, guard: [S.LEFT], updateMemory: ({ event }) => ({ paymentId: event.value.paymentId }), actions: [C.refund.start(({ event }) => ({ paymentId: event.value.paymentId }))] }, { target: "self" }],
      "charge.unknown": [{ target: S.SETTLING, guard: [S.LEFT], actions: [C.charge.resend(({ event }) => event.attempt.key)] }, { target: "self" }],
      "release.success": { target: "self" },                           // the release's own endings: LEFT never moves
      "release.unknown": { target: "self" },
    },

    states: {
      IDLE: { on: { Reserve: { target: S.HOLDING, actions: [C.hold.start(({ memory }) => ({ eventId: memory.eventId, seats: memory.seats }))] } } },

      HOLDING: {
        on: {
          "hold.success": { target: S.HELD, updateMemory: ({ event }) => ({ holdId: event.value.holdId, expiresAt: event.value.expiresAt }) },
          "hold.SeatsTaken": toUnavailable("Those seats were just taken."),
          "hold.Rejected": toUnavailable("We couldn't reserve your seats."),
          "hold.unknown": [waitUnsure(S.HOLD_WAIT, 4), toUnavailable("We couldn't reserve your seats. Try again.")],
          Leave: S.LEFT,                                               // if the hold lands later, the root releases it
        },
      },
      HOLD_WAIT: {
        schedules: { again: { schedule: "1 second", send: E.HoldAgain } },
        on: {
          HoldAgain: [{ target: S.HOLDING, actions: [C.hold.resend(holdKey)] }, { target: "self" }],
          Leave: { target: S.LEFT, actions: [C.hold.resend(holdKey)] },  // find out, so a landed hold is released
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
              Pay: {
                target: S.HELD.PAYING,
                guard: ({ memory }) => memory.declines < MAX_DECLINES || deny("TooManyDeclines"),
                updateMemory: () => ({ error: null }),
                actions: [C.charge.start(({ memory, event }) => ({ holdId: memory.holdId!, amountCents: memory.amountCents, paymentMethodId: event.paymentMethodId }))],
              },
              Leave: { target: S.LEFT, actions: [release] },
            },
          },
          PAYING: {
            on: {
              "charge.success": { target: S.HELD.CONFIRMING, updateMemory: ({ event }) => ({ paymentId: event.value.paymentId }), actions: [C.confirm.start(({ event }) => ({ holdId: event.input.holdId }))] },
              "charge.CardDeclined": [
                { target: S.EXPIRED, guard: ({ memory }) => memory.holdExpired || deny("HoldStillLive"), updateMemory: () => ({ error: "Your seats were released." }) },
                { target: S.RELEASED, guard: ({ memory }) => memory.declines + 1 >= MAX_DECLINES || deny("TriesLeft"), updateMemory: ({ memory }) => ({ declines: memory.declines + 1, error: "Payment failed. Your seats were released." }), actions: [release] },
                { target: S.HELD.CARD, updateMemory: ({ memory, event }) => ({ declines: memory.declines + 1, error: `Card declined (${event.error.code})` }) },
              ],
              "charge.Rejected": { target: S.HELD.CARD, updateMemory: () => ({ error: "We couldn't process this payment." }) },
              "charge.unknown": S.HELD.PAY_UNSURE,
              Leave: { target: S.LEFT, actions: [release] },               // the charge's ending arrives late, at the root
            },
          },
          PAY_UNSURE: {
            schedules: { check: { schedule: "3 seconds", send: E.PayTick } },
            on: { PayTick: checkPayment, CheckPayment: checkPayment, Leave: { target: "self", guard: () => deny("CheckingPayment") } },
          },
          CONFIRMING: {
            on: {
              "confirm.success": { target: S.BOOKED, updateMemory: ({ event }) => ({ bookingId: event.value.bookingId }) },
              "confirm.HoldExpired": toRefund, "confirm.SeatsReassigned": toRefund, "confirm.Rejected": toRefund,
              "confirm.Busy": [waitBusy(S.HELD.CONFIRM_WAIT, 5), toRefund],     // definite: no earlier send may have applied (rule 6)
              "confirm.unknown": [waitUnsure(S.HELD.CONFIRM_WAIT, 5), needsHelp("We couldn't confirm your booking. You've been charged; we'll resolve it and email you.")],
              Leave: { target: "self", guard: () => deny("Finishing") },
            },
          },
          CONFIRM_WAIT: {
            schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.ConfirmRetryNow } },
            on: { ConfirmRetryNow: [{ target: S.HELD.CONFIRMING, actions: [C.confirm.resend(confirmKey)] }, { target: "self" }], Leave: { target: "self", guard: () => deny("Finishing") } },
          },
        },
      },

      // Started from CONFIRMING or from a late turn: REFUNDING owns the refund, so its endings are current here (rule 3).
      REFUNDING: {
        on: {
          "refund.success": S.REFUNDED,
          "refund.RefundRejected": needsHelp("The refund was refused. We'll refund you manually."),
          "refund.Busy": [waitBusy(S.REFUND_WAIT, 8), needsHelp("Your refund is delayed. We'll complete it and email you.")],
          "refund.unknown": [waitUnsure(S.REFUND_WAIT, 8), needsHelp("Your refund is delayed. We'll complete it and email you.")],
        },
      },
      REFUND_WAIT: {
        schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RefundRetryNow } },
        on: { RefundRetryNow: [{ target: S.REFUNDING, actions: [C.refund.resend(refundKey)] }, { target: "self" }] },
      },

      SETTLING: {
        on: {
          "charge.success": { ...toRefund, updateMemory: ({ event }) => ({ paymentId: event.value.paymentId }), actions: [C.refund.start(({ event }) => ({ paymentId: event.value.paymentId }))] },
          "charge.unknown": [{ target: S.SETTLE_WAIT, guard: underBudget(6) }, needsHelp("A payment may have been taken. We'll refund it if so.")],
          "charge.CardDeclined": S.LEFT, "charge.Rejected": S.LEFT,
        },
      },
      SETTLE_WAIT: {
        schedules: { check: { schedule: "3 seconds", send: E.SettleTick } },
        on: { SettleTick: [{ target: S.SETTLING, actions: [C.charge.resend(chargeKey)] }, { target: "self" }] },
      },

      BOOKED: {}, EXPIRED: {}, RELEASED: {}, REFUNDED: {}, UNAVAILABLE: {}, NEEDS_HELP: {}, LEFT: {},
    },
  }
})
