import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";

import { begin, verify } from "../operations/writes.ts";

const MAX_TRIES = 5;

export const SignIn = definition({
  id: "Auth/SignIn",
  persist: false,
  states: ["EMAIL", "CODE", "COOLDOWN", "LOCKED", "DONE"],
  events: { Email: { email: Schema.String }, Code: { code: Schema.String }, Resend: {} },
  internalEvents: {
    Sent: {},
    Throttled: {},
    Refused: { why: Schema.String },
    Verified: {},
    Wrong: {},
    Unsure: Flow.uncertain({}),
    Cooled: {},
    Unlock: {},
  },
  memory: {
    email: Flow.initial(Schema.String, ""),
    tries: Flow.initial(Schema.Number, 0),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    begin: begin.outcomes({
      success: E.Sent,
      failure: {
        Throttled: E.Throttled,
      },
      notSent: E.Refused.from((e) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
    verify: verify.outcomes({
      success: E.Verified,
      failure: {
        WrongCode: E.Wrong,
      },
      notSent: E.Refused.from((e) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
  schedules: { cooldown: {}, unlock: {} },
});

const typed = ({ event }: { readonly event: typeof SignIn.E.Email.Type }) => ({
  email: event.email,
});

const withCode = ({
  memory,
  event,
}: {
  readonly memory: typeof SignIn.Memory.Type;
  readonly event: typeof SignIn.E.Code.Type;
}) => ({ email: memory.email, code: event.code });

/**
 * Sign-in with a one-time code: email, then a code, a resend cooldown and a lockout after five
 * wrong codes; an unknown answer lets its call go and starts over. A local actor, never persisted.
 */
export const SignInMachine = machine(SignIn, ({ S, E, O }) => ({
  default: S.EMAIL,
  on: {
    Sent: { updateMemory: () => ({ notice: "We sent you a code." }) },
    Throttled: { updateMemory: () => ({ notice: "Too many codes. Wait a minute." }) },
    Refused: { updateMemory: ({ event }) => ({ notice: event.why }) },
    Verified: { target: S.DONE },
    Wrong: { updateMemory: ({ memory }) => ({ tries: memory.tries + 1, notice: "Wrong code." }) },
    Unsure: {
      target: S.EMAIL,
      updateMemory: () => ({ notice: "Try signing in again." }),
      actions: [O.begin.cancel, O.verify.cancel],
    },
  },
  states: {
    EMAIL: {
      on: {
        Email: {
          target: S.CODE,
          updateMemory: ({ event }) => ({ email: event.email, tries: 0 }),
          actions: [O.begin.commit(typed)],
        },
      },
    },
    CODE: {
      on: {
        Code: [
          {
            guard: [({ memory }) => memory.tries < MAX_TRIES || deny("Locked")],
            actions: [O.verify.commit(withCode)],
          },
          { target: S.LOCKED },
        ],
        Resend: {
          target: S.COOLDOWN,
          actions: [O.begin.commit(({ memory }) => ({ email: memory.email }))],
        },
      },
    },
    COOLDOWN: {
      schedules: { cooldown: { schedule: "30 seconds", send: E.Cooled } },
      on: {
        Code: [
          {
            guard: [({ memory }) => memory.tries < MAX_TRIES || deny("Locked")],
            actions: [O.verify.commit(withCode)],
          },
          { target: S.LOCKED },
        ],
        Resend: { guard: [() => deny("CoolingDown")] },
        Cooled: { target: S.CODE },
      },
    },
    LOCKED: {
      schedules: {
        unlock: { schedule: ({ memory }) => 60_000 * memory.tries, send: E.Unlock },
      },
      on: { Unlock: { target: S.CODE, updateMemory: () => ({ tries: 0 }) } },
    },
    DONE: { on: { Email: { target: S.CODE, actions: [O.begin.commit(typed)] } } },
  },
}));
