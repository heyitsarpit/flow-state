import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

// The activity counter a tab broadcasts, as text such as "17"; a report the page cannot read
// throws, as a parser does.
const countOf = (report: string) => {
  if (!/^\d+$/.test(report)) throw new Error(`unreadable activity report "${report}"`);

  return Number(report);
};

/**
 * A session's idle sign-out, named by its session: the last activity report the tabs broadcast,
 * and how long the organisation's policy lets a session sit idle, in milliseconds.
 */
export const IdleSignOut = definition({
  id: "Auth/IdleSignOut",
  persist: true,
  states: ["ACTIVE", "SIGNED_OUT"],
  events: {
    Activity: { report: Schema.String },
    PolicyLoaded: { idleMs: Schema.Number },
    VideoStarted: {},
    SignOut: {},
    SignInAgain: {},
  },
  internalEvents: { TimedOut: {} },
  memory: {
    session: Flow.input(Schema.String),
    report: Flow.initial(Schema.String, "0"),
    idleMs: Flow.initial(Schema.Number, 900_000),
  },
  schedules: { idle: { restartOn: Schema.Number } },
});

/**
 * The idle sign-out: an active session is signed out once it has sat idle for the policy's time;
 * each new activity count starts the wait again. A playing video stops the wait until the user is
 * active again. A policy longer than the longest timer, or an activity report the page cannot
 * read, is the session's issue until the next policy or report.
 */
export const IdleSignOutMachine = machine(IdleSignOut, ({ S, E }) => ({
  default: S.ACTIVE,
  on: {
    Activity: { updateMemory: ({ event }) => ({ report: event.report }) },
    PolicyLoaded: { updateMemory: ({ event }) => ({ idleMs: event.idleMs }) },
  },
  states: {
    ACTIVE: {
      on: { TimedOut: S.SIGNED_OUT, SignOut: S.SIGNED_OUT },
      schedules: {
        idle: {
          schedule: ({ memory }) => memory.idleMs,
          send: E.TimedOut,
          armOn: [Flow.entry],
          restartOn: ({ memory }) => countOf(memory.report),
          disarmOn: [E.VideoStarted],
        },
      },
    },
    SIGNED_OUT: { on: { SignInAgain: S.ACTIVE } },
  },
}));
