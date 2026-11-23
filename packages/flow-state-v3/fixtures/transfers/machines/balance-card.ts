import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { available } from "../operations/reads.ts";
import { cardPayment } from "../operations/writes.ts";
import { Customer } from "./customer.ts";

/**
 * The balance card: the customer's account's available cents, the last account's while a new one
 * loads, and a notice.
 */
export const BalanceCard = definition({
  id: "Bank/BalanceCard",
  states: ["SHOWN"],
  events: { Pay: { paymentId: Schema.String, account: Schema.String, cents: Schema.Number } },
  internalEvents: {
    Read: { cents: Schema.Number, placeholder: Schema.Boolean },
    Unread: {},
    Paid: { account: Schema.String },
    Refresh: {},
    PayUnsure: Flow.uncertain({}),
  },
  memory: {
    cents: Flow.initial(Schema.Number, 0),
    placeholder: Flow.initial(Schema.Boolean, false),
    notice: Flow.initial(Schema.String, ""),
  },
  context: { account: Flow.context(Customer.M.account) },
  operations: ({ E }) => ({
    available: available.outcomes({
      value: E.Read.from((v, { placeholder }) => ({ cents: v.cents, placeholder })),
      failure: { NoAnswer: E.Unread, Defect: E.Unread, Interrupted: E.Unread },
    }),
    cardPayment: cardPayment.outcomes({
      success: E.Paid.from((_, { input }) => ({ account: input.account })),
      failure: {},
      unknown: E.PayUnsure,
    }),
  }),
  schedules: { refresh: {} },
});

/**
 * The card places the customer's account's balance, showing the last account's while a new
 * account has none yet; a payment that lands marks the balance stale, so it is read again.
 */
export const BalanceCardMachine = machine(BalanceCard, ({ S, E, O }) => ({
  default: S.SHOWN,
  states: {
    SHOWN: {
      activities: [
        // An account can be chosen from a deep link, whose id is percent-encoded; a garbled one
        // throws, as `decodeURIComponent` does.
        O.available.subscribe(
          ({ context }) => ({ account: decodeURIComponent(context.account ?? "") }),
          { placeholder: ({ previous }) => previous?.data },
        ),
      ],
      on: {
        Read: {
          updateMemory: ({ event }) => ({ cents: event.cents, placeholder: event.placeholder }),
        },
        Unread: { updateMemory: () => ({ notice: "balance unavailable" }) },
        Pay: {
          actions: [
            O.cardPayment.commit(({ event }) => ({
              paymentId: event.paymentId,
              account: event.account,
              cents: event.cents,
            })),
          ],
        },
        Paid: { actions: [O.available.invalidate(({ event }) => ({ account: event.account }))] },
        Refresh: { actions: [O.available.refetch] },
        PayUnsure: { updateMemory: () => ({ notice: "checking the payment" }) },
      },
      // Time passing starts no read: the card refreshes its balance on a schedule.
      schedules: { refresh: { schedule: "10 seconds", send: E.Refresh, armOn: [Flow.entry] } },
    },
  },
}));
