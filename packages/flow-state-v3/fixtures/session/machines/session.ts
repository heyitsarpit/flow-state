import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { signIn } from "../operations/writes.ts";
import type { Refused } from "../services.ts";
import { Org } from "./org.ts";

export const Session = definition({
  id: "Workspace/Session",
  persist: true,
  states: ["SIGNED_OUT", "SIGNING_IN", "SIGNED_IN"],
  events: { SignIn: { user: Schema.String }, SignOut: {}, Retry: {}, GiveUp: {} },
  internalEvents: {
    SignedIn: { user: Schema.String, displayName: Schema.String },
    Refused: { reason: Schema.String },
    NotSent: { why: Schema.String },
    Unsure: Flow.uncertain({}),
  },
  memory: {
    user: Flow.initial(Schema.String, ""),
    displayName: Flow.initial(Schema.String, ""),
    notice: Flow.initial(Schema.String, ""),
  },
  context: { org: Org.Provider.select(Schema.String, (o) => o.memory.name) },
  operations: ({ E }) => ({
    signIn: signIn.outcomes({
      success: E.SignedIn.from((p: { readonly user: string; readonly displayName: string }) => ({
        user: p.user,
        displayName: p.displayName,
      })),
      failure: { Refused: E.Refused.from((e: Refused) => ({ reason: e.reason })) },
      notSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
});

/**
 * Who is signed in, as the identity provider answered: a consumer of its organisation and the
 * provider every team reads its user from. An unsure sign-in is retried or given up by the user.
 */
export const SessionMachine = machine(Session, ({ S, O }) => ({
  default: S.SIGNED_OUT,
  on: {
    SignIn: { target: S.SIGNING_IN, actions: [O.signIn.commit(({ event }) => event)] },
    SignedIn: {
      target: S.SIGNED_IN,
      updateMemory: ({ event }) => ({
        user: event.user,
        displayName: event.displayName,
        notice: "",
      }),
    },
    Refused: { target: S.SIGNED_OUT, updateMemory: ({ event }) => ({ notice: event.reason }) },
    NotSent: { target: S.SIGNED_OUT, updateMemory: ({ event }) => ({ notice: event.why }) },
    Unsure: { target: S.SIGNED_OUT, updateMemory: () => ({ notice: "try again" }) },
    Retry: { target: S.SIGNING_IN, actions: [O.signIn.retry(() => ({}))] },
    GiveUp: { updateMemory: () => ({ notice: "" }), actions: [O.signIn.cancel(() => ({}))] },
    SignOut: { target: S.SIGNED_OUT, updateMemory: () => ({ user: "", displayName: "" }) },
  },
}));
