import { machine, timer } from "../src/c.ts";
import { SignIn } from "../src/fixture.ts";
import { tokens } from "../src/core.ts";
const { E } = tokens(SignIn);
const cooldown = timer("30 seconds", E.CooldownOver);
machine(SignIn, ({ S }) => ({ default: S.PASSWORD, states: { PASSWORD: {}, TWO_FACTOR: { schedules: { cooldown }, on: { Resend: { target: "self", arm: [coo/*|*/] } } }, SIGNED_IN: {} } }));
