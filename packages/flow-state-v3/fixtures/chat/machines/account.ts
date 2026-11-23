import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

/**
 * The signed-in chat user, which every thread and the hub read as `who`; empty while signed out.
 */
export const Account = definition({
  id: "Chat/Account",
  persist: true,
  states: ["SIGNED_OUT", "SIGNED_IN"],
  events: { SignIn: { who: Schema.String }, SignOut: {} },
  memory: { who: Flow.initial(Schema.String, "") },
});

/**
 * Signing in names the user; signing out forgets the name.
 */
export const AccountMachine = machine(Account, ({ S }) => ({
  default: S.SIGNED_OUT,
  states: {
    SIGNED_OUT: {
      on: {
        SignIn: { target: S.SIGNED_IN, updateMemory: ({ event }) => ({ who: event.who }) },
      },
    },
    SIGNED_IN: { on: { SignOut: { target: S.SIGNED_OUT, updateMemory: () => ({ who: "" }) } } },
  },
}));
