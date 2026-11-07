import { machine, machineLoose, timer } from "./c.ts";
import { SignIn } from "./fixture.ts";
import { tokens } from "./core.ts";

const { S, E } = tokens(SignIn);
const cooldown = timer("30 seconds", E.CooldownOver);
const settle = timer("400 millis", E.Settled);
const other = timer("1 second", E.CooldownOver); // same event type as cooldown -> indistinguishable

export const m = machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: {
      default: S.TWO_FACTOR.ENTERING,
      schedules: { cooldown, settle },
      on: {
        Resend: { target: "self", arm: [cooldown] },
        Changed: { target: "self", arm: [settle] },
        Cancel: { target: "self", disarm: [cooldown] },
        Verified: { target: S.SIGNED_IN },
      },
      states: {
        ENTERING: { on: { Resend: { target: "self", arm: [cooldown] } } },
        VERIFYING: {},
      },
    },
    SIGNED_IN: {},
  },
}));
void E; void S;

const c: { dueAt: number } | undefined = m.snapshot.schedules.cooldown;
// @ts-expect-error unknown timer
m.snapshot.schedules.nope;
export { c };

// typo: identifier does not exist
machine(SignIn, ({ S }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: {
      schedules: { cooldown },
      // @ts-expect-error cooldwn is not defined
      on: { Resend: { target: "self", arm: [cooldwn] } },
    },
    SIGNED_IN: {},
  },
}));

// armed but never registered with schedules
machine(SignIn, ({ S }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: {
      schedules: { cooldown },
      // @ts-expect-error settle not registered
      on: { Changed: { target: "self", arm: [settle] } },
    },
    SIGNED_IN: {},
  },
}));
// loose variant accepts it silently
machineLoose(SignIn, ({ S }) => ({
  default: S.PASSWORD,
  states: { PASSWORD: {}, TWO_FACTOR: { schedules: { cooldown }, on: { Changed: { target: "self", arm: [settle] } } }, SIGNED_IN: {} },
}));

// sibling
machine(SignIn, ({ S }) => ({
  default: S.PASSWORD,
  states: {
    // @ts-expect-error not in scope
    PASSWORD: { on: { Resend: { target: "self", arm: [cooldown] } } },
    TWO_FACTOR: { schedules: { cooldown } },
    SIGNED_IN: {},
  },
}));
// weakness: a different timer with the same event type passes the scoped check
machine(SignIn, ({ S }) => ({
  default: S.PASSWORD,
  states: { PASSWORD: {}, TWO_FACTOR: { schedules: { cooldown }, on: { Resend: { target: "self", arm: [other] } } }, SIGNED_IN: {} },
}));

machine(SignIn, ({ S }) => ({
  default: S.PASSWORD,
  states: {
    // @ts-expect-error bad event name
    PASSWORD: { on: { Nope: { target: "self" } } },
    SIGNED_IN: {},
  },
}));
