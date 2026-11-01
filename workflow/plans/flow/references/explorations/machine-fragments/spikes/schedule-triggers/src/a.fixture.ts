import { machine, machineWide } from "./a.ts";
import { SignIn } from "./fixture.ts";

export const m = machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: {
      default: S.TWO_FACTOR.ENTERING,
      schedules: {
        cooldown: { schedule: "30 seconds", send: E.CooldownOver },
        settle: { schedule: "400 millis", send: E.Settled },
      },
      on: {
        Resend: { target: "self", arm: ["cooldown"] },
        Changed: { target: "self", arm: ["settle"] },
        Cancel: { target: "self", disarm: ["cooldown"] },
        Verified: { target: S.SIGNED_IN },
      },
      states: {
        ENTERING: { on: { Resend: { target: "self", arm: ["cooldown"] } } },
        VERIFYING: {},
      },
    },
    SIGNED_IN: {},
  },
}));

// 5. view
const c: { dueAt: number } | undefined = m.snapshot.schedules.cooldown;
const s: { dueAt: number } | undefined = m.snapshot.schedules.settle;
// @ts-expect-error dueAt may be undefined
m.snapshot.schedules.cooldown.dueAt;
// @ts-expect-error unknown timer
m.snapshot.schedules.nope;
export { c, s };

// 1. typo in arm
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: {
      schedules: { cooldown: { schedule: "30 seconds", send: E.CooldownOver } },
      // @ts-expect-error typo
      on: { Resend: { target: "self", arm: ["cooldwn"] } },
    },
    SIGNED_IN: {},
  },
}));

// 2. unknown disarm
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: {
      schedules: { cooldown: { schedule: "30 seconds", send: E.CooldownOver } },
      // @ts-expect-error unknown
      on: { Cancel: { target: "self", disarm: ["nope"] } },
    },
    SIGNED_IN: {},
  },
}));

// 3b. sibling/unrelated node's timer rejected (scoped variant)
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    // @ts-expect-error sibling timer not in scope
    PASSWORD: { on: { Resend: { target: "self", arm: ["cooldown"] } } },
    TWO_FACTOR: {
      schedules: { cooldown: { schedule: "30 seconds", send: E.CooldownOver } },
    },
    SIGNED_IN: {},
  },
}));
// ...but machine-wide variant accepts it
machineWide(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: { on: { Resend: { target: "self", arm: ["cooldown"] } } },
    TWO_FACTOR: {
      schedules: { cooldown: { schedule: "30 seconds", send: E.CooldownOver } },
    },
    SIGNED_IN: {},
  },
}));

// 7. other fields still checked
machine(SignIn, ({ S }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {
      // @ts-expect-error bad event name
      on: { Nope: { target: "self" } },
    },
    SIGNED_IN: {},
  },
}));
machine(SignIn, ({ S }) => ({
  default: S.PASSWORD,
  states: {
    // @ts-expect-error bad state name
    NOPE: {},
  },
}));
