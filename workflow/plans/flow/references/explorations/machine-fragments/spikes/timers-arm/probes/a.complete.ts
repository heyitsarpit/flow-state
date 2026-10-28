import { machine } from "../src/a.ts";
import { SignIn } from "../src/fixture.ts";

machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: {
      schedules: { cooldown: { schedule: "30 seconds", send: E.CooldownOver }, settle: { schedule: "1 second", send: E.Settled } },
      on: { Resend: { target: "self", arm: ["/*|*/"] } },
    },
    SIGNED_IN: {},
  },
}));
