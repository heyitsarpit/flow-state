import { machine } from "../src/b.ts";
import { SignIn } from "../src/b.fixture.ts";
const sc = (E: any) => ({ cooldown: { schedule: "30 seconds", send: E.CooldownOver }, settle: { schedule: "1 second", send: E.Settled } }) as const;
// P1 typo
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: { PASSWORD: {}, TWO_FACTOR: { schedules: sc(E), on: { Resend: { target: "self", arm: ["cooldwn"] } } }, SIGNED_IN: {} },
}));
// P2 disarm
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: { PASSWORD: {}, TWO_FACTOR: { schedules: sc(E), on: { Cancel: { target: "self", disarm: ["nope"] } } }, SIGNED_IN: {} },
}));
// P4 proxy
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: { PASSWORD: {}, TWO_FACTOR: { schedules: sc(E), on: { Resend: { target: "self", arm: [0] } } }, SIGNED_IN: {} },
}));
// P6 unfilled
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: { PASSWORD: {}, TWO_FACTOR: { schedules: { cooldown: { schedule: "30 seconds", send: E.CooldownOver } } }, SIGNED_IN: {} },
}));
// P7 undeclared
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: { PASSWORD: {}, TWO_FACTOR: { schedules: { ...sc(E), extra: { schedule: "1 second", send: E.Settled } } }, SIGNED_IN: {} },
}));
