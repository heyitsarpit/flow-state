import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { balance } from "../operations/reads.ts";
import { Customer } from "./customer.ts";

/**
 * A standing order, named by its id: the date of its first payment, typed as an ISO date and held
 * as a `Date`; its amount and memo; the date it is paused until, or `null` while paused with no end;
 * the account it pays from, as its customer provides it.
 */
export const StandingOrder = definition({
  id: "Bank/StandingOrder",
  persist: true,
  states: ["DRAFT", "CHECKING", "SCHEDULED", "PAUSED"],
  events: {
    Plan: {
      first: Schema.DateFromString,
      cents: Schema.Number,
      memo: Schema.optional(Schema.String),
    },
    Pause: { until: Schema.NullOr(Schema.DateFromString) },
    Resume: {},
  },
  internalEvents: {
    AccountChanged: { account: Schema.String },
    BalanceRead: { cents: Schema.Number },
    BalanceFailed: {},
  },
  memory: {
    order: Flow.input(Schema.String),
    account: Flow.initial(Schema.String, ""),
    first: Flow.initial(Schema.NullOr(Schema.DateFromString), null),
    cents: Flow.initial(Schema.Number, 0),
    memo: Schema.optional(Schema.String),
    pausedUntil: Flow.initial(Schema.NullOr(Schema.DateFromString), null),
    notice: Flow.initial(Schema.String, ""),
  },
  context: { customer: Flow.context(Customer.M.account) },
  operations: ({ E }) => ({
    balance: balance.outcomes({
      success: E.BalanceRead.from((v: { readonly cents: number }) => ({ cents: v.cents })),
      failure: {
        NoAnswer: E.BalanceFailed,
        Defect: E.BalanceFailed,
        Interrupted: E.BalanceFailed,
      },
    }),
  }),
});

/**
 * A balance lookup's input: the account the order pays from.
 */
export const fromAccount = ({ memory }: { readonly memory: { readonly account: string } }) => ({
  account: memory.account,
});

/**
 * The order: a plan reads the account's balance and is scheduled when the amount fits it; a
 * scheduled order pauses until a date, or with no end, and resumes.
 */
export const StandingOrderMachine = machine(StandingOrder, ({ S, E, O, C }) => ({
  default: S.DRAFT,
  onContext: [C.customer.change({ event: E.AccountChanged.from((account) => ({ account })) })],
  on: {
    AccountChanged: { updateMemory: ({ event }) => ({ account: event.account }) },
    Plan: {
      target: S.CHECKING,
      guard: [({ memory }) => memory.account !== "" || deny("NoAccount")],
      updateMemory: ({ event }) => ({
        first: event.first,
        cents: event.cents,
        memo: event.memo,
        pausedUntil: null,
      }),
      actions: [O.balance.lookup(fromAccount)],
    },
  },
  states: {
    CHECKING: {
      on: {
        BalanceRead: [
          {
            target: S.SCHEDULED,
            guard: [({ memory, event }) => memory.cents <= event.cents || deny("OverBalance")],
            updateMemory: () => ({ notice: "" }),
          },
          { target: S.DRAFT, updateMemory: () => ({ notice: "more than your balance" }) },
        ],
        BalanceFailed: {
          target: S.DRAFT,
          updateMemory: () => ({ notice: "balance unavailable" }),
        },
      },
    },
    SCHEDULED: {
      on: {
        Pause: { target: S.PAUSED, updateMemory: ({ event }) => ({ pausedUntil: event.until }) },
      },
    },
    PAUSED: {
      on: { Resume: { target: S.SCHEDULED, updateMemory: () => ({ pausedUntil: null }) } },
    },
  },
}));
