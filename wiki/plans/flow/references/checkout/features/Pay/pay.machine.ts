// The checkout's behaviour. Read it from PAYING down: each state owns the call it started, so its endings are
// current there; the root handles the same endings late (the shopper moved on) and adopted (a new incarnation
// after a reload), and its handlers never move the checkout out of a state that owns another pending call
// (rule 15: their guards name the states they may leave).
import { deny, Flow, machine } from "flow-state";
import { OrderSummary } from "./order-summary.trait.js";
import { emptyAddress, Pay } from "./pay.definition.js";

type Memory = typeof Pay.Memory.Type;

type G = { memory: Memory };

const intent = ({ memory }: G) => ({ intentId: memory.intentId });

const cart = ({ memory }: G) => ({ cartId: memory.cartId, intentId: memory.intentId });

const withCard = ({ memory, payload }: G & { payload: { paymentMethodId: string } }) => ({
  intentId: memory.intentId,
  paymentMethodId: payload.paymentMethodId,
});

const GUEST_LIMIT_CENTS = 50_000;

const MAX_BUSY_TRIES = 3;

// Stripe's word for "the card is authorized": `requires_capture` (we capture when the parcel ships), or `succeeded`.
const capturable = ({ event }: { event: { status: string } }) =>
  event.status === "requires_capture" || event.status === "succeeded" || deny("NotAuthorized");

export const PayMachine = machine(Pay, ({ S, E, O }) => {
  // A new cart. The summary resets with the cart id (`resetOn`), so the transition that changes it waits for the
  // summary's own write first (rule 56's default: `OrderSummary.O.shipping.idle`, F13). Guests enter the address
  // step; signed-in customers go straight to the card with their saved address (F22).
  const start = [
    {
      target: S.CARD,
      guard: [
        OrderSummary.O.shipping.idle,
        ({ context }) => context.savedAddress !== null || deny("Guest"),
      ],
      updateMemory: ({ event, context }) => ({
        cartId: event.cartId,
        intentId: event.intentId,
        address: context.savedAddress ?? emptyAddress,
        receipt: null,
        authorized: false,
        afterUnsure: false,
        busyTries: 0,
        notice: "",
      }),
      raise: [
        E.summary.Quote.from(({ context }) => ({ postcode: context.savedAddress?.postcode ?? "" })),
      ],
    },
    {
      target: S.ADDRESS,
      guard: [OrderSummary.O.shipping.idle],
      updateMemory: ({ event }) => ({
        cartId: event.cartId,
        intentId: event.intentId,
        receipt: null,
        authorized: false,
        afterUnsure: false,
        busyTries: 0,
        notice: "",
      }),
    },
  ] as const;

  return {
    default: S.IDLE,
    activities: [O.cart.subscribe(({ memory }) => ({ cartId: memory.cartId }))],

    traits: {
      summary: {
        input: ({ memory }) => ({ cartId: memory.cartId }),
        resetOn: ({ memory }) => memory.cartId, // a string: a writing placement (rule 48)
        guards: {
          mayPay: ({ memory, context }) =>
            context.signedIn || memory.totalCents <= GUEST_LIMIT_CENTS || deny("GuestLimit"),
        },
        callbacks: {
          // A root trait's callback may target any state (rule 6). In PAYING it stays put ("self"): re-entering PAYING
          // would end the state that owns the confirm on the wire and make its answer late. The second commit is
          // refused before anything is sent (`reject`: NotSent { Rejected }, O3).
          onPay: [
            { target: "self", guard: [S.PAYING], actions: [O.pay.commit(withCard)] },
            {
              target: S.PAYING,
              updateMemory: ({ payload }) => ({
                paymentMethodId: payload.paymentMethodId,
                notice: "",
              }),
              actions: [O.pay.commit(withCard)],
            },
          ],
        },
      },
    },

    on: {
      CartLoaded: {
        target: "self",
        updateMemory: ({ event }) => ({ totalCents: event.totalCents }),
      },
      CardChosen: {
        target: "self",
        updateMemory: ({ event }) => ({ paymentMethodId: event.paymentMethodId }),
      },

      // Leaving. With an authorization and no order, the hold on the card is voided now (compensation, O20); with
      // a confirm still on the wire, LEFT voids it when it lands (the late `Confirmed` below).
      Leave: [
        {
          target: S.LEFT,
          guard: [
            ({ memory }) => (memory.authorized && memory.receipt === null) || deny("NothingHeld"),
          ],
          actions: [O.void.commit(intent)],
        },
        { target: S.LEFT },
      ],

      // --- late and adopted endings -------------------------------------------------------------------------
      Confirmed: [
        // The shopper left mid-payment and the card was authorized after all: give the money back (2.7.7).
        {
          target: "self",
          guard: [S.LEFT, capturable],
          updateMemory: () => ({ authorized: true }),
          actions: [O.void.commit(intent)],
        },
        // Adopted after a reload (IDLE owns nothing): the payment went through; place the order.
        {
          target: S.PLACING,
          guard: [S.IDLE, capturable],
          updateMemory: () => ({ authorized: true }),
          actions: [O.place.commit(cart)],
        },
        { target: "self" },
      ],
      PayUnsure: [
        {
          target: "self",
          guard: [S.LEFT],
          updateMemory: () => ({ notice: "Your bank may still show a pending charge." }),
        },
        { target: S.UNSURE }, // adopted, e.g. `unknown { Restored }` after a reload mid-payment (P3)
      ],
      Declined: { target: "self" },
      Busy: { target: "self" },
      PayRefused: { target: "self" },
      PayNotSent: { target: "self" },
      // The bank said yes after the challenge timed out (F11, O10). CARD owns no call, so the late ending may move it
      // to PLACING. In PAYING (the shopper already pressed Pay again) it may not: PAYING owns that confirm
      // (`LateMayNotLeave`); the guard keeps it out.
      Authenticated: [
        {
          target: S.PLACING,
          guard: [S.CARD],
          updateMemory: () => ({ authorized: true, notice: "" }),
          actions: [O.place.commit(cart)],
        },
        {
          target: "self",
          guard: [S.LEFT],
          updateMemory: () => ({ authorized: true }),
          actions: [O.void.commit(intent)],
        },
        { target: "self", updateMemory: () => ({ authorized: true }) },
      ],
      AuthFailed: { target: "self" },
      AuthUnsure: { target: "self", actions: [O.authenticate.cancel(intent)] }, // the confirm's read will tell
      IntentRead: { target: "self" },
      IntentReadFailed: { target: "self" },
      OrderSeen: { target: "self" },
      CheckTick: { target: "self" },
      Placed: {
        target: S.PAID,
        updateMemory: ({ memory, event }) => ({
          receipt: {
            orderId: event.orderId,
            afterUnsure: memory.afterUnsure,
            alreadyPlaced: event.alreadyPlaced,
          },
          authorized: false,
        }),
      },
      PlaceRefused: {
        target: "self",
        updateMemory: () => ({ notice: "We couldn't place the order. Try again." }),
      },
      PlaceUnsure: [
        { target: "self", guard: [O.place.retryable({ times: 3 })], actions: [O.place.retry] }, // deduped by key
        { target: S.STUCK },
      ],
      Voided: {
        target: "self",
        updateMemory: () => ({ authorized: false, notice: "The hold on your card was released." }),
      },
      // The capture job won the race: the card was charged. Say so; a refund is the merchant's call (Refunds page).
      VoidRefused: {
        target: "self",
        updateMemory: () => ({
          notice: "Your payment was captured before you left. We'll be in touch.",
        }),
      },
      VoidUnsure: [
        { target: "self", guard: [O.void.retryable({ times: 3 })], actions: [O.void.retry] },
        // Still unknown, or `StillUnknown { AlreadyCaptured }`: nobody can say the hold is gone (O12).
        {
          target: "self",
          updateMemory: () => ({
            notice:
              "We couldn't confirm the hold was released. Your bank releases it within 7 days.",
          }),
          actions: [O.void.cancel(intent)],
        },
      ],
    },

    states: {
      IDLE: { on: { Start: start } },

      // The address subroutine's filling. Its postcode quotes shipping through the summary's own lane; its draft
      // comes back if the shopper leaves mid-address (MD 3.5).
      ADDRESS: {
        input: ({ memory }) => ({ address: memory.addressDraft }),
        callbacks: {
          onPostcode: {
            raise: [E.summary.Quote.from(({ payload }) => ({ postcode: payload.postcode }))],
          },
          onDraft: { updateMemory: ({ payload }) => ({ addressDraft: payload.address }) },
        },
        exits: {
          Done: {
            target: S.CARD,
            updateMemory: ({ payload }) => ({
              address: payload.address,
              addressDraft: emptyAddress,
            }),
          },
        },
      },

      CARD: {},

      PAYING: {
        // Soft: tell the shopper, keep listening (2.7.6).
        schedules: { slow: { schedule: "8 seconds", send: E.CheckTick } },
        on: {
          CheckTick: {
            target: "self",
            updateMemory: () => ({ notice: "Still confirming with your bank…" }),
          },
          Confirmed: [
            // The bank wants to see the shopper: the challenge. `authenticate` is owned by CHALLENGE.
            {
              target: S.CHALLENGE,
              guard: ({ event }) => event.status === "requires_action" || deny("NoChallenge"),
              updateMemory: ({ event }) => ({ clientSecret: event.clientSecret }),
              actions: [
                O.authenticate.commit(({ memory, event }) => ({
                  intentId: memory.intentId,
                  clientSecret: event.clientSecret,
                })),
              ],
            },
            {
              target: S.PLACING,
              guard: capturable,
              updateMemory: ({ event }) => ({
                authorized: true,
                afterUnsure: event.afterUnsure,
                notice: "",
              }),
              actions: [O.place.commit(cart)],
            },
            {
              target: S.CARD,
              updateMemory: () => ({ notice: "Your bank didn't authorize the payment." }),
            },
          ],
          Declined: {
            target: S.CARD,
            updateMemory: ({ event }) => ({ notice: `Your card was declined (${event.code}).` }),
          },
          // Busy is definite: nothing happened. Trying again is a NEW write with a new id (rule 19), after a pause.
          Busy: [
            {
              target: S.WAITING,
              guard: ({ memory }) => memory.busyTries < MAX_BUSY_TRIES || deny("TooBusy"),
              updateMemory: ({ memory, event }) => ({
                busyTries: memory.busyTries + 1,
                retryInMs: event.retryAfterMs,
              }),
            },
            {
              target: S.CARD,
              updateMemory: () => ({ notice: "Payments are busy. Try again in a minute." }),
            },
          ],
          PayRefused: { target: S.CARD, updateMemory: ({ event }) => ({ notice: event.reason }) },
          // Nothing was sent. A double click is `Rejected`: the first confirm is the one on the wire, nothing to show
          // (O3). `Restored` after a reload: the confirm never left this device, so the card was not charged (P3).
          PayNotSent: [
            {
              target: "self",
              guard: ({ event }) => event.why === "Rejected" || deny("NotADoubleClick"),
            },
            {
              target: S.CARD,
              updateMemory: () => ({
                notice: "Your payment wasn't sent. You haven't been charged.",
              }),
            },
          ],
          // Lost: the card may be charged. Never re-send blindly; reconcile first.
          PayUnsure: { target: S.UNSURE, updateMemory: () => ({ afterUnsure: true }) },
        },
      },

      WAITING: {
        schedules: {
          retry: { schedule: ({ memory }) => `${memory.retryInMs} millis`, send: E.RetryNow },
        },
        on: {
          RetryNow: [
            {
              target: S.PAYING,
              guard: [O.pay.idle(intent)],
              actions: [
                O.pay.commit(({ memory }) => ({
                  intentId: memory.intentId,
                  paymentMethodId: memory.paymentMethodId ?? "",
                })),
              ],
            },
            { target: "self" },
          ],
        },
      },

      // The challenge's filling. Stripe.js's answer is the host's ending; it is handed in as a host event.
      CHALLENGE: {
        input: ({ memory }) => ({ intentId: memory.intentId }),
        on: {
          Authenticated: {
            target: "self",
            raise: [E.CHALLENGE.Answered.from(({ event }) => ({ authId: event.authId }))],
          },
          AuthFailed: {
            target: "self",
            raise: [E.CHALLENGE.Failed.from(({ event }) => ({ code: event.code }))],
          },
        },
        exits: {
          Passed: {
            target: S.PLACING,
            updateMemory: () => ({ authorized: true }),
            actions: [O.place.commit(cart)],
          },
          Declined: {
            target: S.CARD,
            updateMemory: ({ payload }) => ({
              notice: `Your bank declined the check (${payload.code}).`,
            }),
          },
          // The bank's page is still open somewhere: its answer may still come (the late `Authenticated`).
          TimedOut: {
            target: S.CARD,
            updateMemory: () => ({ notice: "The bank's check timed out. You can pay again." }),
          },
        },
      },

      // The reconcile (2.7.6): the confirm's answer was lost. Read the intent every 3 seconds; the order the webhook
      // created is a second witness. Only "nothing happened" re-sends, and then the SAME Attempt.
      UNSURE: {
        schedules: {
          check: { schedule: "3 seconds", send: E.CheckTick, armOn: [Flow.entry, E.CheckTick] },
        },
        on: {
          // Two witnesses per tick: Stripe's intent, and the order our webhook handler creates.
          CheckTick: {
            target: "self",
            actions: [
              O.intent.lookup(intent),
              O.order.lookup(({ memory }) => ({ cartId: memory.cartId })),
            ],
          },
          IntentRead: [
            // It applied. The read is the answer, so the hold is released, not re-sent (O1 B).
            {
              target: S.PLACING,
              guard: capturable,
              updateMemory: () => ({ authorized: true }),
              actions: [O.pay.cancel(intent), O.place.commit(cart)],
            },
            {
              target: S.CHALLENGE,
              guard: ({ event, memory }) =>
                (event.status === "requires_action" && memory.clientSecret !== null) ||
                deny("NoChallenge"),
              actions: [
                O.pay.cancel(intent),
                O.authenticate.commit(({ memory }) => ({
                  intentId: memory.intentId,
                  clientSecret: memory.clientSecret ?? "",
                })),
              ],
            },
            // Nothing happened on Stripe: the same Attempt again, which Stripe dedups by its id.
            {
              target: S.PAYING,
              guard: [
                ({ event }) => event.status === "requires_payment_method" || deny("Moved"),
                O.pay.retryable(intent, { times: 3 }),
              ],
              actions: [O.pay.retry(intent)],
            },
            { target: "self" }, // `processing`: ask again on the next tick
          ],
          // The webhook placed the order: stop polling (a key-less cancel of the lookup, R3) and release the hold.
          OrderSeen: [
            {
              target: S.PAID,
              guard: ({ event }) => event.orderId !== "" || deny("NoOrder"),
              updateMemory: ({ event }) => ({
                receipt: { orderId: event.orderId, afterUnsure: true, alreadyPlaced: true },
              }),
              actions: [O.intent.cancel, O.pay.cancel(intent)],
            },
            { target: "self" },
          ],
          PayUnsure: { target: "self" }, // a re-send lost again: keep reconciling
        },
      },

      PLACING: {},

      PAID: { on: { Start: start, Done: S.IDLE } },

      // Never "not charged": we don't know. "Check again" reconciles once more.
      STUCK: { on: { CheckAgain: S.UNSURE } },

      LEFT: { on: { Start: start } },
    },
  };
});
