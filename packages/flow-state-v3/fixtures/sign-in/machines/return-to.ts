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
  context: { session: Flow.context(AuthSession.S.SIGNED_IN) },
});

/**
 * The return: saved, it returns at once when its session, read through its context, is signed in,
 * and otherwise once it is; a submit there clears the draft.
 */
export const ReturnToMachine = machine(ReturnTo, ({ S, E, C }) => ({
  default: S.IDLE,
  onContext: [C.session.change({ event: E.SessionReady.from((ready) => ({ ready })) })],
  on: {
    Save: [
      {
        target: S.RETURNED,
        guard: [({ context }) => context.session === true || deny("NotReady")],
        updateMemory: ({ event }) => ({ route: event.route, draft: event.draft }),
      },
      {
        target: S.WAITING,
        updateMemory: ({ event }) => ({ route: event.route, draft: event.draft }),
      },
    ],
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
