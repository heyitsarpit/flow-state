import { machine, timer } from "../src/c.ts";
import { SignIn } from "../src/fixture.ts";
import { tokens } from "../src/core.ts";
const { E } = tokens(SignIn);
const cooldown = timer("30 seconds", E.CooldownOver);
const settle = timer("400 millis", E.Settled);
machine(SignIn, ({ S }) => ({ default: S.PASSWORD, states: { PASSWORD: {}, TWO_FACTOR: { on: { Resend: { target: "self", arm: [cooldwn] } } }, SIGNED_IN: {} } }));
machine(SignIn, ({ S }) => ({ default: S.PASSWORD, states: { PASSWORD: {}, TWO_FACTOR: { schedules: { cooldown }, on: { Changed: { target: "self", arm: [settle] } } }, SIGNED_IN: {} } }));
machine(SignIn, ({ S }) => ({ default: S.PASSWORD, states: { PASSWORD: { on: { Resend: { target: "self", arm: [cooldown] } } }, TWO_FACTOR: { schedules: { cooldown } }, SIGNED_IN: {} } }));
