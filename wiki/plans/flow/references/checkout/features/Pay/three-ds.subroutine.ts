// The bank's 3-D Secure challenge, as a subroutine: the pay screen goes INTO it and does nothing else meanwhile.
// It is left only by its exits, each with what the host needs (F10): `Passed { authId }`, `Declined { code }`,
// `TimedOut`.
//
// It owns no write. Stripe.js's `handleNextAction` is the host's `authenticate` commit, because a mapped write may
// not live under a subroutine (rule 48): the host hears Stripe.js's answer and hands it in as a host event
// (`Answered`, `Failed`). So when the customer finishes the challenge after the timer ran out, the answer reaches the
// host AFTER the `TimedOut` exit, as a late ending the host handles (F11, O10).
// design gap: F11 B names "a subroutine that owns a write"; under rule 48 the reference keeps the write in the host
// and lets its ending arrive after the exit, as the desk's Resolve wizard does.
//
// Its timer is the nested `Countdown` (F18). Private bookkeeping (how often help was opened) stays out of every
// host's and view's reach (F19).
import { Schema } from "effect";
import { Flow, subroutine } from "flow-state";
import { Countdown } from "./countdown.trait.js";

export const CHALLENGE_LENGTH = "5 minutes";

export const ThreeDS = subroutine(
  {
    id: "ThreeDS",
    states: [
      {
        OPEN: Flow.state(["BANK", "EXPIRED"], {
          traits: { countdown: Countdown({ length: CHALLENGE_LENGTH }).resumable() },
        }),
      },
      "HELP",
    ],
    default: "OPEN",
    events: { BankShown: {}, Help: {}, CloseHelp: {} },
    hostEvents: { Answered: { authId: Schema.String }, Failed: { code: Schema.String } },
    internalEvents: { GiveUp: {} },
    exits: {
      Passed: Flow.Exit({ authId: Schema.String }),
      Declined: Flow.Exit({ code: Schema.String }),
      TimedOut: Flow.Exit({}),
    },
    memory: {
      intentId: Flow.input(Schema.String),
      helpOpened: Flow.private(Flow.initial(Schema.Int, 0)),
    },
  },
  ({ S, E, exits }) => ({
    on: {
      // The host's answer, in any state: the bank's verdict wins over the help page and over the "time's up" note.
      Answered: exits.Passed.from(({ event }) => ({ authId: event.authId })),
      Failed: exits.Declined.from(({ event }) => ({ code: event.code })),
    },
    states: {
      OPEN: {
        default: S.OPEN.BANK,
        traits: {
          // A callback moves the subroutine only inside the trait's placement node (rule 6): to OPEN.EXPIRED.
          countdown: { callbacks: { onExpired: { target: S.OPEN.EXPIRED } } },
        },
        on: {
          Help: {
            target: S.HELP,
            updateMemory: ({ memory }) => ({ helpOpened: memory.helpOpened + 1 }),
          },
        },
        states: {
          BANK: { on: { BankShown: { target: "self", raise: [E.countdown.Shown] } } },
          // "Time's up" stays on screen for a moment, then the challenge is left.
          EXPIRED: {
            schedules: { leave: { schedule: "2 seconds", send: E.GiveUp } },
            on: { GiveUp: exits.TimedOut },
          },
        },
      },
      // Back to the exact place the customer was: the bank frame, or the expired note (`.history`, F9).
      HELP: { on: { CloseHelp: S.OPEN.history } },
    },
  }),
);
