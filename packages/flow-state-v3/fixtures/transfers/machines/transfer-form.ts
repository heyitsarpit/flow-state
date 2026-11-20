import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { balance } from "../operations/reads.ts";
import { Customer } from "./customer.ts";

/**
 * A transfer form: the amount typed, the account it sends from as its customer provides it, and
 * that account's balance as last read.
 */
export const TransferForm = definition({
  id: "Bank/TransferForm",
  persist: false,
  states: ["EDITING", "CHECKING", "READY"],
  events: { Amount: { cents: Schema.Number }, Check: {} },
  internalEvents: {
    AccountChanged: { account: Schema.String },
    BalanceRead: { cents: Schema.Number },
    BalanceFailed: {},
  },
  memory: {
    form: Flow.input(Schema.String),
    account: Flow.initial(Schema.String, ""),
    cents: Flow.initial(Schema.Number, 0),
    balance: Flow.initial(Schema.Number, 0),
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

const fromAccount = ({ memory }: { readonly memory: { readonly account: string } }) => ({
  account: memory.account,
});

/**
 * The form: Check reads the customer's account through its context, keeps it as the account it
 * checked and reads that account's balance, ready when the amount fits it; a change of account
 * returns it to editing.
 */
export const TransferFormMachine = machine(TransferForm, ({ S, E, O, C }) => ({
  default: S.EDITING,
  onContext: [C.customer.change({ event: E.AccountChanged.from((account) => ({ account })) })],
  on: {
    AccountChanged: S.EDITING,
    Amount: { target: S.EDITING, updateMemory: ({ event }) => ({ cents: event.cents }) },
  },
  states: {
    EDITING: {
      on: {
        Check: {
          target: S.CHECKING,
          guard: [({ context }) => (context.customer ?? "") !== "" || deny("NoAccount")],
          updateMemory: ({ context }) => ({ account: context.customer ?? "" }),
          actions: [O.balance.lookup(fromAccount)],
        },
      },
    },
    CHECKING: {
      on: {
        BalanceRead: [
          {
            target: S.READY,
            guard: [({ memory, event }) => memory.cents <= event.cents || deny("OverBalance")],
            updateMemory: ({ event }) => ({ balance: event.cents, notice: "" }),
          },
          {
            target: S.EDITING,
            updateMemory: ({ event }) => ({
              balance: event.cents,
              notice: "more than your balance",
            }),
          },
        ],
        BalanceFailed: {
          target: S.EDITING,
          updateMemory: () => ({ notice: "balance unavailable" }),
        },
      },
    },
    READY: {},
  },
}));
