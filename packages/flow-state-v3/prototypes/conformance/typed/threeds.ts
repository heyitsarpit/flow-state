// Real fragments, typed: references/checkout/features/Pay/{countdown.trait,three-ds.subroutine}.ts. ThreeDS places Countdown, nested and resumable.
// Round 12: in the design's spelling (2.1-2.3): `trait` and `subroutine`, an ordered state list, the child placed on its node with `Flow.state`.
import { Duration, Schema } from "effect";
import { LENGTH_MS } from "../../conformance/fixtures/pay-full.compiled.ts";
import { Flow, subroutine, trait } from "../compile/index.ts";

export const Countdown = trait(
  {
    id: "Countdown",
    hostEvents: { Shown: {} },
    internalEvents: { Expired: {} },
    callbacks: { onExpired: Flow.Callback({}) },
  },
  ({ E, callbacks }) => ({
    schedules: { expire: { schedule: Duration.millis(LENGTH_MS), send: E.Expired, armOn: ["Shown"] } },
    on: { Shown: {}, Expired: { notify: [callbacks.onExpired] } },
  }),
);
export const ThreeDS = subroutine(
  {
    id: "ThreeDS",
    states: [{ OPEN: Flow.state(["BANK", "EXPIRED"], { traits: { countdown: Countdown.resumable() } }) }, "HELP"],
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
      helpOpened: Flow.private(Flow.initial(Schema.Number, 0)),
    },
  },
  ({ S, E, exits }) => ({
    on: {
      Answered: exits.Passed.from(({ event }: { readonly event: { readonly authId: string } }) => ({ authId: event.authId })),
      Failed: exits.Declined.from(({ event }: { readonly event: { readonly code: string } }) => ({ code: event.code })),
    },
    states: {
      OPEN: {
        default: S.OPEN.BANK,
        traits: { countdown: { callbacks: { onExpired: { target: S.OPEN.EXPIRED } } } },
        on: { Help: { target: S.HELP, updateMemory: ({ memory }) => ({ helpOpened: memory.helpOpened + 1 }) } },
        states: {
          BANK: { on: { BankShown: { raise: [E.countdown.Shown] } } },
          EXPIRED: {
            schedules: { leave: { schedule: "2 seconds", send: E.GiveUp } },
            on: { GiveUp: exits.TimedOut },
          },
        },
      },
      HELP: { on: { CloseHelp: S.OPEN.history } },
    },
  }),
);
