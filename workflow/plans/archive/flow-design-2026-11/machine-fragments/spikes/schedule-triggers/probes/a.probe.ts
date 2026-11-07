import { machine } from "../src/a.ts";
import { SignIn } from "../src/fixture.ts";

// P1 typo
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: {
      schedules: { cooldown: { schedule: "30 seconds", send: E.CooldownOver } },
      on: { Resend: { target: "self", arm: ["cooldwn"] } },
    },
    SIGNED_IN: {},
  },
}));
// P2 disarm
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: {
      schedules: { cooldown: { schedule: "30 seconds", send: E.CooldownOver } },
      on: { Cancel: { target: "self", disarm: ["nope"] } },
    },
    SIGNED_IN: {},
  },
}));
// P3 sibling
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: { on: { Resend: { target: "self", arm: ["cooldown"] } } },
    TWO_FACTOR: { schedules: { cooldown: { schedule: "30 seconds", send: E.CooldownOver } } },
    SIGNED_IN: {},
  },
}));
// P4 autocomplete proxy: wrong type reveals the contextual element type
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: {
      schedules: { cooldown: { schedule: "30 seconds", send: E.CooldownOver }, settle: { schedule: "1 second", send: E.Settled } },
      on: { Resend: { target: "self", arm: [0] } },
    },
    SIGNED_IN: {},
  },
}));
// P5 bad target / bad event
machine(SignIn, ({ S }) => ({
  default: S.PASSWORD,
  states: { PASSWORD: { on: { Resend: { target: S.NOPE } } }, SIGNED_IN: {} },
}));
machine(SignIn, ({ S }) => ({
  default: S.PASSWORD,
  states: { PASSWORD: { on: { Nope: { target: "self" } } }, SIGNED_IN: {} },
}));
