import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { AuthSession } from "./session.ts";

/**
 * A device the account trusts, named by its id and kept across reloads: the date its trust ends,
 * typed as an ISO date and held as a `Date`; when it was last seen, `null` until it is seen or
 * while the device hides it; and its optional label. A trusted device is fresh, or due to be
 * confirmed again.
 */
export const TrustedDevice = definition({
  id: "Auth/TrustedDevice",
  persist: true,
  states: ["UNTRUSTED", { TRUSTED: ["FRESH", "DUE"] }],
  events: {
    Trust: { until: Schema.DateFromString, label: Schema.optional(Schema.String) },
    Seen: { at: Schema.NullOr(Schema.DateFromString) },
    Revoke: {},
  },
  internalEvents: { SessionReady: { ready: Schema.Boolean }, Reverify: {} },
  memory: {
    device: Flow.input(Schema.String),
    until: Flow.initial(Schema.NullOr(Schema.DateFromString), null),
    lastSeen: Flow.initial(Schema.NullOr(Schema.DateFromString), null),
    label: Schema.optional(Schema.String),
    signedIn: Flow.initial(Schema.Boolean, false),
  },
  context: { session: Flow.context(AuthSession.S.SIGNED_IN) },
});

/**
 * The device: it may be trusted, until a date, only while its session is signed in, and stays
 * trusted after a sign-out until it is revoked; a week after it is trusted it is due to be
 * confirmed again; it records when it was last seen.
 */
export const TrustedDeviceMachine = machine<typeof TrustedDevice>(TrustedDevice, ({ S, E, C }) => ({
  default: S.UNTRUSTED,
  onContext: [C.session.change({ event: E.SessionReady.from((ready) => ({ ready })) })],
  on: {
    SessionReady: { updateMemory: ({ event }) => ({ signedIn: event.ready }) },
    Seen: { updateMemory: ({ event }) => ({ lastSeen: event.at }) },
    Trust: {
      target: S.TRUSTED.FRESH,
      guard: [({ memory }) => memory.signedIn || deny("SignedOut")],
      updateMemory: ({ event }) => ({ until: event.until, label: event.label }),
    },
  },
  states: {
    TRUSTED: {
      default: S.TRUSTED.FRESH,
      on: { Revoke: { target: S.UNTRUSTED, updateMemory: () => ({ until: null }) } },
      states: {
        FRESH: {
          on: { Reverify: S.TRUSTED.DUE },
          schedules: { reverify: { schedule: "7 days", send: E.Reverify } },
        },
      },
    },
  },
}));
