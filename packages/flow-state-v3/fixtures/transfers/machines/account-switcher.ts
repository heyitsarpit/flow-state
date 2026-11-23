import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { Customer } from "./customer.ts";

/**
 * How many accounts the switcher remembers.
 */
export const RECENT = 5;

/**
 * The account switcher in the bank's header: the account the customer sends from, read as context,
 * and the accounts they chose most recently, newest first, kept across reloads.
 */
export const AccountSwitcher = definition({
  id: "Bank/AccountSwitcher",
  persist: true,
  states: ["SHOWN"],
  events: {},
  internalEvents: { Remembered: { account: Schema.String } },
  memory: { recent: Flow.initial(Schema.Array(Schema.String), []) },
  context: { account: Flow.context(Customer.M.account) },
});

/**
 * The switcher: a newly chosen account it does not already list goes first, and the oldest beyond
 * RECENT goes; no account, or one it lists, changes nothing.
 */
export const AccountSwitcherMachine = machine(AccountSwitcher, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [
    C.account.change({
      when: (current, _previous, { memory }) => current !== "" && !memory.recent.includes(current),
      event: E.Remembered.from((account) => ({ account })),
    }),
  ],
  on: {
    Remembered: {
      updateMemory: ({ memory, event }) => ({
        recent: [event.account, ...memory.recent].slice(0, RECENT),
      }),
    },
  },
}));
