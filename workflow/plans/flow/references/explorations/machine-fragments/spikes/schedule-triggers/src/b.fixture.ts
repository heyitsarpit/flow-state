import { Schema } from "effect";
import { definition } from "./core.ts";
import { machine, machineScoped } from "./b.ts";

export const SignIn = definition({
  id: "SignIn",
  states: ["PASSWORD", { TWO_FACTOR: ["ENTERING", "VERIFYING"] }, "SIGNED_IN"],
  events: { Resend: {}, Changed: { value: Schema.String }, Cancel: {}, Verified: {} },
  internalEvents: { CooldownOver: {}, Settled: {} },
  schedules: { cooldown: {}, settle: {} },
});

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

const c: { dueAt: number } | undefined = m.snapshot.schedules.cooldown;
// @ts-expect-error dueAt may be undefined
m.snapshot.schedules.cooldown.dueAt;
// @ts-expect-error unknown timer
m.snapshot.schedules.nope;
export { c };

machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: {
      schedules: {
        cooldown: { schedule: "30 seconds", send: E.CooldownOver },
        settle: { schedule: "1 second", send: E.Settled },
      },
      // @ts-expect-error typo
      on: { Resend: { target: "self", arm: ["cooldwn"] } },
    },
    SIGNED_IN: {},
  },
}));
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: {
      schedules: {
        cooldown: { schedule: "30 seconds", send: E.CooldownOver },
        settle: { schedule: "1 second", send: E.Settled },
      },
      // @ts-expect-error unknown disarm
      on: { Cancel: { target: "self", disarm: ["nope"] } },
    },
    SIGNED_IN: {},
  },
}));

// declared but never filled -> error
// @ts-expect-error settle never filled
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: { schedules: { cooldown: { schedule: "30 seconds", send: E.CooldownOver } } },
    SIGNED_IN: {},
  },
}));
// schedule key not declared in definition -> error
// @ts-expect-error not declared
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: {},
    TWO_FACTOR: {
      schedules: {
        cooldown: { schedule: "30 seconds", send: E.CooldownOver },
        settle: { schedule: "1 second", send: E.Settled },
        extra: { schedule: "1 second", send: E.Settled },
      },
    },
    SIGNED_IN: {},
  },
}));

// 3. sibling timer: plain (b) accepts it (names are machine-wide)
machine(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    PASSWORD: { on: { Resend: { target: "self", arm: ["cooldown"] } } },
    TWO_FACTOR: {
      schedules: {
        cooldown: { schedule: "30 seconds", send: E.CooldownOver },
        settle: { schedule: "1 second", send: E.Settled },
      },
    },
    SIGNED_IN: {},
  },
}));
// ...scoped hybrid rejects it
machineScoped(SignIn, ({ S, E }) => ({
  default: S.PASSWORD,
  states: {
    // @ts-expect-error not in scope
    PASSWORD: { on: { Resend: { target: "self", arm: ["cooldown"] } } },
    TWO_FACTOR: {
      schedules: {
        cooldown: { schedule: "30 seconds", send: E.CooldownOver },
        settle: { schedule: "1 second", send: E.Settled },
      },
    },
    SIGNED_IN: {},
  },
}));

// 7.
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
