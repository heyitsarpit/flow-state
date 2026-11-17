import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

/**
 * Who is shopping: a guest, or a signed-in shopper by name. It provides the name to every cart and
 * checkout bound to it.
 */
export const Shopper = definition({
  id: "Shop/Shopper",
  persist: true,
  states: ["GUEST", "SIGNED_IN"],
  events: { SignIn: { name: Schema.String }, SignOut: {} },
  memory: { name: Flow.initial(Schema.String, "") },
});

/**
 * The shopper: signing in names them; signing out makes them a guest again.
 */
export const ShopperMachine = machine(Shopper, ({ S }) => ({
  default: S.GUEST,
  states: {
    GUEST: {
      on: { SignIn: { target: S.SIGNED_IN, updateMemory: ({ event }) => ({ name: event.name }) } },
    },
    SIGNED_IN: { on: { SignOut: { target: S.GUEST, updateMemory: () => ({ name: "" }) } } },
  },
}));
