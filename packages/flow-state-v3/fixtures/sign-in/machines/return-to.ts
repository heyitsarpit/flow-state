import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { AuthSession } from "./session.ts";

/**
 * Where to return after signing in, kept across the auth redirect: the route and the draft typed
 * there before it.
 */
export const ReturnTo = definition({
  id: "Auth/ReturnTo",
  persist: true,
  states: ["IDLE", "WAITING", "RETURNED"],
  events: { Save: { route: Schema.String, draft: Schema.String }, Submit: {} },
  internalEvents: { SessionReady: { ready: Schema.Boolean } },
  memory: { route: Flow.initial(Schema.String, ""), draft: Flow.initial(Schema.String, "") },
  context: { session: AuthSession.Provider.select(Schema.Boolean, (s) => s.state === "SIGNED_IN") },
});

/**
 * The return: saved before the redirect, it returns once its session is signed in with nothing
 * held, and a submit there clears the draft.
 */
export const ReturnToMachine = machine(ReturnTo, ({ S, E }) => ({
  default: S.IDLE,
  onContext: [
    {
      select: ({ context }) => context.session,
      event: E.SessionReady.from((ready: boolean) => ({ ready })),
    },
  ],
  on: {
    Save: {
      target: S.WAITING,
      updateMemory: ({ event }) => ({ route: event.route, draft: event.draft }),
    },
    SessionReady: {},
  },
  states: {
    WAITING: {
      on: {
        SessionReady: [
          { target: S.RETURNED, guard: [({ event }) => event.ready || deny("NotReady")] },
          {},
        ],
      },
    },
    RETURNED: { on: { Submit: { updateMemory: () => ({ draft: "" }) } } },
  },
}));
