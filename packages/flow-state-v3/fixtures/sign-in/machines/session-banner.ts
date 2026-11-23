import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { AuthSession } from "./session.ts";

/**
 * The account bar's banner: whether its session is signed in and the step it is at, both read as
 * context; the step it last showed, how many steps it has shown and how many welcomes.
 */
export const SessionBanner = definition({
  id: "Auth/SessionBanner",
  persist: false,
  states: ["SHOWN"],
  events: {},
  internalEvents: { StepShown: { step: Schema.String }, Welcomed: {} },
  memory: {
    step: Flow.initial(Schema.String, ""),
    steps: Flow.initial(Schema.Number, 0),
    welcomes: Flow.initial(Schema.Number, 0),
  },
  context: {
    signedIn: Flow.context(AuthSession.S.SIGNED_IN),
    phase: Flow.context(AuthSession.state),
  },
});

/**
 * The banner: each step change is shown; signing in welcomes the account once.
 */
export const SessionBannerMachine = machine(SessionBanner, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [
    C.phase.change({ event: E.StepShown.from((step) => ({ step })) }),
    C.signedIn.change({ when: (current) => current, event: E.Welcomed }),
  ],
  on: {
    StepShown: {
      updateMemory: ({ memory, event }) => ({ step: event.step, steps: memory.steps + 1 }),
    },
    Welcomed: { updateMemory: ({ memory }) => ({ welcomes: memory.welcomes + 1 }) },
  },
}));
