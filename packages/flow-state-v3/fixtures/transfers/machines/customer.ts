import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

/**
 * The signed-in bank customer: the account they send from, none until chosen, which they provide
 * to every form.
 */
export const Customer = definition({
  id: "Bank/Customer",
  persist: true,
  states: ["ACTIVE"],
  events: { Choose: { account: Schema.String } },
  memory: { account: Flow.initial(Schema.String, "") },
});

/**
 * The customer: choosing an account makes it the one their forms send from.
 */
export const CustomerMachine = machine(Customer, ({ S }) => ({
  default: S.ACTIVE,
  on: { Choose: { updateMemory: ({ event }) => ({ account: event.account }) } },
}));
