// checkout (E1-E3), rewritten with calls-next. checkout.operations.ts is unchanged except that each commit sends
// `attempt.idempotencyKey` instead of `attempt.id` (rule 7).
// ───────────────────────────────────────────────── checkout.definition.ts
import { definition, deny, Flow, machine } from "flow-state"
import { Duration, Schedule, Schema } from "effect"
import { Stripe } from "./checkout.operations"

export const Checkout = definition({
  id: "Shop/Checkout",
  states: ["CARD", "PAYING", "WAITING", "CHALLENGING", "READING", "UNSURE", "STUCK", "DONE", "LEFT"],
  events: {
    Pay: { paymentMethodId: Schema.String },
    EditCart: { amountCents: Schema.Int },      // handled in CARD only: that is the cart lock
    CheckNow: {},                               // "check my payment status"
    Leave: {},
  },
  internalEvents: { Slow: {}, TookTooLong: {}, RetryNow: {}, ChallengeTimedOut: {}, CheckTick: {}, PollTick: { n: Schema.Int } },
  calls: { pay: Stripe.confirm, challenge: Stripe.handleNextAction, read: Stripe.intent },   // ← NEW: the endings are derived events
  memory: {
    intentId: Flow.input(Schema.String),
    amountCents: Flow.input(Schema.Int),
    error: Flow.initial(Schema.NullOr(Schema.String), null),
    slow: Flow.initial(Schema.Boolean, false),
    declines: Flow.initial(Schema.Int, 0),
    blockedPaymentMethodId: Flow.initial(Schema.NullOr(Schema.String), null),
    retryInMs: Flow.initial(Schema.Int, 0),
    chargeId: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: { Stripe },
})

// ───────────────────────────────────────────────── checkout.machine.ts
const MAX_DECLINES = 5
const MAX_CHECKS = 6
const MAX_POLLS = 10
const RETRYABLE_CODES = new Set(["try_again_later", "processing_error"])
const MESSAGES: Record<string, string> = { insufficient_funds: "Insufficient funds", expired_card: "Card expired" }
const declineMessage = (code: string) => `Your card was declined (${MESSAGES[code] ?? "declined"})`

export const CheckoutMachine = machine(Checkout, ({ S, E, C }) => {
  const key = ({ memory }) => ({ intentId: memory.intentId })
  const toCard = (error: string) => ({ target: S.CARD, updateMemory: () => ({ error }) })
  const toRead = { target: S.READING, actions: [C.read.fetch(key)] }
  // Every success here carries an Intent; its status says whether the payment is done (E2).
  const paid = { target: S.DONE, guard: ({ event }) => event.value.status === "succeeded" || deny("NotSucceeded"), updateMemory: ({ event }) => ({ chargeId: event.value.chargeId ?? null }) }
  const paidAfterLeaving = [{ ...paid, guard: [S.LEFT, paid.guard] }, { target: "self" }]
  const checkAgain = [
    { target: S.STUCK, guard: ({ calls, memory }) => calls.pay.at(key({ memory })).sends >= MAX_CHECKS || deny("ChecksLeft") },
    { target: S.PAYING, updateMemory: () => ({ slow: false, error: null }), actions: [C.pay.resend(key)] },   // same Attempt
    { target: "self" },                                                                            // rule 8: a tick is total
  ]

  return {
    default: S.CARD,

    on: {
      Leave: {
        target: S.LEFT,
        guard: [
          ({ state }) => !(S.DONE.is(state) || S.LEFT.is(state)) || deny("NothingToLeave"),
          ({ state }) => !S.UNSURE.is(state) || deny("StillChecking"),     // never walk away from an unknown charge
        ],
      },
      // Late endings (rule 2): PAYING, CHALLENGING or READING was left. A landed charge pays the order; an unknown is read.
      "pay.success": paidAfterLeaving,
      "challenge.success": paidAfterLeaving,
      "read.success": paidAfterLeaving,
      "pay.unknown": { target: "self", actions: [C.read.fetch(key)] },
      "challenge.unknown": { target: "self", actions: [C.read.fetch(key)] },
    },

    states: {
      CARD: {
        on: {
          EditCart: { target: "self", updateMemory: ({ event }) => ({ amountCents: event.amountCents }) },
          Pay: {
            target: S.PAYING,
            guard: [
              ({ memory }) => memory.declines < MAX_DECLINES || deny("TooManyDeclines"),
              ({ memory, event }) => event.paymentMethodId !== memory.blockedPaymentMethodId || deny("SameCardDeclined"),
            ],
            updateMemory: () => ({ error: null, slow: false }),
            actions: [C.pay.start(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }))],   // a new card: a new Attempt
          },
        },
      },

      PAYING: {
        schedules: { slow: { schedule: "10 seconds", send: E.Slow }, giveUp: { schedule: "60 seconds", send: E.TookTooLong } },
        on: {
          Slow: { target: "self", updateMemory: () => ({ slow: true }) },
          TookTooLong: { target: "self", actions: [C.pay.cancel(key)] },   // pending until its ending's turn; a settled ending wins (rule 13)
          "pay.success": [paid, { target: S.CHALLENGING, guard: ({ event }) => event.value.status === "requires_action" || deny("NoActionNeeded"), actions: [C.challenge.start(key)] }, toRead],
          "pay.CardDeclined": {
            target: S.CARD,
            updateMemory: ({ event, memory }) => ({
              error: declineMessage(event.error.declineCode),
              blockedPaymentMethodId: RETRYABLE_CODES.has(event.error.declineCode) ? null : event.input.paymentMethodId,
              declines: memory.declines + 1,
            }),
          },
          "pay.Busy": [
            { target: S.WAITING, guard: ({ event }) => event.attempt.sends < 4 || deny("GaveUp"), updateMemory: ({ event }) => ({ retryInMs: event.error.retryAfterMs ?? 1000 * 2 ** event.attempt.sends }) },
            toCard("Stripe is busy. Try again shortly."),                  // true: after an unknown send, Busy arrives as pay.unknown (rule 6)
          ],
          "pay.TooManyAttempts": toCard("Too many attempts. Wait a moment and try again."),
          "pay.Rejected": toCard("We couldn't process this payment."),
          "pay.NotSent": toCard("We couldn't reach the payment service. You were not charged."),   // required: this machine cancels
          "pay.unknown": S.UNSURE,
        },
      },

      WAITING: {
        schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RetryNow } },
        on: { RetryNow: [{ target: S.PAYING, actions: [C.pay.resend(key)] }, { target: "self" }] },
      },

      CHALLENGING: {
        schedules: { expire: { schedule: "5 minutes", send: E.ChallengeTimedOut } },
        on: {
          ChallengeTimedOut: { target: "self", actions: [C.challenge.cancel(key)] },
          "challenge.success": [paid, toRead],
          "challenge.AuthFailed": toCard("Authentication failed. Use another payment method."),
          "challenge.ChallengeDismissed": toCard("Verification was cancelled. Try again or use another card."),
          "challenge.Rejected": toCard("We couldn't verify this payment."),
          "challenge.NotSent": toCard("We couldn't reach the payment service. You were not charged."),
          "challenge.unknown": toRead,                                     // read the PaymentIntent, do not re-open the bank
        },
      },

      READING: {
        schedules: { poll: { schedule: Schedule.spaced("2 seconds"), send: E.PollTick.from((m) => ({ n: m.attempt })) } },
        on: {
          PollTick: [{ target: S.STUCK, guard: ({ event }) => event.n >= MAX_POLLS || deny("PollsLeft") }, { target: "self", actions: [C.read.fetch(key)] }],
          "read.success": [
            paid,
            { ...toCard("The payment did not go through. Try again."), guard: ({ event }) => ["requires_payment_method", "requires_action", "canceled"].includes(event.value.status) || deny("StillProcessing") },
            { target: "self" },                                            // processing: the next tick reads again
          ],
          "read.ReadFailed": { target: "self" },
        },
      },

      UNSURE: {
        schedules: { check: { schedule: "3 seconds", send: E.CheckTick } },   // entry-armed: re-entering UNSURE re-arms it
        on: { CheckTick: checkAgain, CheckNow: checkAgain },
      },

      STUCK: { on: { CheckNow: toRead } },                                 // a read is always safe; never pay again
      DONE: {},
      LEFT: {},
    },
  }
})
