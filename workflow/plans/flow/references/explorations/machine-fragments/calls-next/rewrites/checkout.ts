// checkout (E1-E3), rewritten with calls-next in the in-machine-calls syntax. checkout.operations.ts is unchanged
// except that each commit puts `attempt.id` on the wire (rule 7, unchanged from the builds).
// ───────────────────────────────────────────────── checkout.definition.ts
import { definition, deny, Flow, machine } from "flow-state"
import { Duration, Schedule, Schema } from "effect"
import { IntentStatus, Stripe } from "./checkout.operations"

const Done = { status: IntentStatus, chargeId: Schema.optionalKey(Schema.String) }

export const Checkout = definition({
  id: "Shop/Checkout",
  states: ["CARD", "PAYING", "WAITING", "CHALLENGING", "READING", "UNSURE", "STUCK", "DONE", "LEFT"],
  events: {
    Pay: { paymentMethodId: Schema.String },
    EditCart: { amountCents: Schema.Int },      // handled in CARD only: that is the cart lock
    CheckNow: {},                               // "check my payment status"
    Leave: {},
  },
  internalEvents: {
    Intent: Done,                               // confirm, challenge and read all end with an Intent: one event (several endings, one event)
    Declined: { code: Schema.String, paymentMethodId: Schema.String },
    Busy: { retryAfterMs: Schema.optional(Schema.Number) },   // no attempt field: Flow keeps the Attempt
    TooManyAttempts: {}, Refused: {}, TryLater: {},
    AuthFailed: {}, Dismissed: {}, ReadFailed: {},
    Unsure: Flow.uncertain({}), ChallengeUnsure: Flow.uncertain({}),
    Slow: {}, TookTooLong: {}, RetryNow: {}, ChallengeTimedOut: {}, CheckTick: {}, PollTick: { n: Schema.Int },
  },
  memory: {
    intentId: Flow.input(Schema.String),
    amountCents: Flow.input(Schema.Int),
    error: Flow.initial(Schema.NullOr(Schema.String), null),
    slow: Flow.initial(Schema.Boolean, false),
    declines: Flow.initial(Schema.Int, 0),
    blockedPaymentMethodId: Flow.initial(Schema.NullOr(Schema.String), null),
    retryInMs: Flow.initial(Schema.Int, 0),
    busyTries: Flow.initial(Schema.Int, 0),     // Busy is definite: tried again as new writes, so its budget is memory (rule 7)
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

export const CheckoutMachine = machine(Checkout, ({ S, E, O }) => {
  const key = ({ memory }) => ({ intentId: memory.intentId })
  const intent = E.Intent.from((i) => ({ status: i.status, chargeId: i.chargeId }))
  // A new card: a new commit start, so a new Attempt. The commit value is the handle for retry, cancel and its record.
  const pay = O.Stripe.confirm.commit(({ memory, event }) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId }), {
    outcomes: {
      success: intent,
      failure: {
        CardDeclined: E.Declined.from((r, { input }) => ({ code: r.declineCode, paymentMethodId: input.paymentMethodId })),
        Busy: E.Busy.from((r) => ({ retryAfterMs: r.retryAfterMs })),
        TooManyAttempts: E.TooManyAttempts,
        Rejected: E.Refused,
        NotSent: E.TryLater,                                       // required: reject, and this machine cancels and retries (rule 8)
      },
      unknown: E.Unsure,                                           // StillUnknown arrives here too (rule 6)
    },
  })
  const challenge = O.Stripe.handleNextAction.commit(key, {
    outcomes: {
      success: intent,
      failure: { AuthFailed: E.AuthFailed, ChallengeDismissed: E.Dismissed, Rejected: E.Refused, NotSent: E.TryLater },
      unknown: E.ChallengeUnsure,
    },
  })
  const read = O.Stripe.intent.lookup(key, { outcomes: { success: intent, failure: E.ReadFailed } })   // a read: no unknown

  const toCard = (error: string) => ({ target: S.CARD, updateMemory: () => ({ error }) })
  const toRead = { target: S.READING, actions: [read.fetch(key)] }
  const paid = { target: S.DONE, guard: ({ event }) => event.status === "succeeded" || deny("NotSucceeded"), updateMemory: ({ event }) => ({ chargeId: event.chargeId ?? null }) }
  const checkAgain = [   // after an unknown: the same write (pay.retry), budgeted by retryCount
    { target: S.STUCK, guard: (g) => pay.retryCount(g, key(g)) >= MAX_CHECKS || deny("ChecksLeft") },
    { target: S.PAYING, updateMemory: () => ({ slow: false, error: null }), actions: [pay.retry(key)] },   // same Attempt
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
      Intent: [{ ...paid, guard: [S.LEFT, paid.guard] }, { target: "self" }],
      Unsure: { target: "self", actions: [read.fetch(key)] },
      ChallengeUnsure: { target: "self", actions: [read.fetch(key)] },
      Declined: { target: "self" }, Busy: { target: "self" }, TooManyAttempts: { target: "self" }, Refused: { target: "self" }, TryLater: { target: "self" },   // late failures: explicit ignores (rule 8, D13)
      AuthFailed: { target: "self" }, Dismissed: { target: "self" }, ReadFailed: { target: "self" },
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
              pay.idle(key),                                          // a second press is refused, not declined (rule 4)
            ],
            updateMemory: () => ({ error: null, slow: false, busyTries: 0 }),
            actions: [pay],
          },
        },
      },

      PAYING: {
        schedules: { slow: { schedule: "10 seconds", send: E.Slow }, giveUp: { schedule: "60 seconds", send: E.TookTooLong } },
        on: {
          Slow: { target: "self", updateMemory: () => ({ slow: true }) },
          TookTooLong: { target: "self", actions: [pay.cancel(key)] },     // pending until its ending's turn; a settled ending wins (rule 12)
          Intent: [paid, { target: S.CHALLENGING, guard: ({ event }) => event.status === "requires_action" || deny("NoActionNeeded"), actions: [challenge] }, toRead],
          Declined: {
            target: S.CARD,
            updateMemory: ({ event, memory }) => ({
              error: declineMessage(event.code),
              blockedPaymentMethodId: RETRYABLE_CODES.has(event.code) ? null : event.paymentMethodId,
              declines: memory.declines + 1,
            }),
          },
          Busy: [
            { target: S.WAITING, guard: ({ memory }) => memory.busyTries < 3 || deny("GaveUp"), updateMemory: ({ memory, event }) => ({ busyTries: memory.busyTries + 1, retryInMs: event.retryAfterMs ?? 1000 * 2 ** memory.busyTries }) },
            toCard("Stripe is busy. Try again shortly."),                  // true: after an unknown send, Busy arrives as Unsure (rule 6)
          ],
          TooManyAttempts: toCard("Too many attempts. Wait a moment and try again."),
          Refused: toCard("We couldn't process this payment."),
          TryLater: toCard("We couldn't reach the payment service. You were not charged."),
          Unsure: S.UNSURE,
        },
      },

      WAITING: {
        schedules: { retry: { schedule: ({ memory }) => Duration.millis(memory.retryInMs), send: E.RetryNow } },
        on: { RetryNow: [{ target: S.PAYING, guard: [pay.idle(key)], actions: [pay] }, { target: "self" }] },   // Busy is definite: a new write, a new id
      },

      CHALLENGING: {
        schedules: { expire: { schedule: "5 minutes", send: E.ChallengeTimedOut } },
        on: {
          ChallengeTimedOut: { target: "self", actions: [challenge.cancel(key)] },
          Intent: [paid, toRead],
          AuthFailed: toCard("Authentication failed. Use another payment method."),
          Dismissed: toCard("Verification was cancelled. Try again or use another card."),
          Refused: toCard("We couldn't verify this payment."),
          TryLater: toCard("We couldn't reach the payment service. You were not charged."),
          ChallengeUnsure: toRead,                                         // read the PaymentIntent, do not re-open the bank
        },
      },

      READING: {
        schedules: { poll: { schedule: Schedule.spaced("2 seconds"), send: E.PollTick.from((m) => ({ n: m.attempt })) } },
        on: {
          PollTick: [{ target: S.STUCK, guard: ({ event }) => event.n >= MAX_POLLS || deny("PollsLeft") }, { target: "self", actions: [read.fetch(key)] }],
          Intent: [
            paid,
            { ...toCard("The payment did not go through. Try again."), guard: ({ event }) => ["requires_payment_method", "requires_action", "canceled"].includes(event.status) || deny("StillProcessing") },
            { target: "self" },                                            // processing: the next tick reads again
          ],
          ReadFailed: { target: "self" },
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
