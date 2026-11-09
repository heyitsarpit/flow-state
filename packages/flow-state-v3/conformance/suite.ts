import type { Scenario } from "./dsl/case.ts";
import { attemptIdentityLies } from "./oracles/attempt-identity.lies.ts";
import { attemptIdentity } from "./oracles/attempt-identity.ts";
import type { Lie, Oracle } from "./oracles/oracle.ts";
import { threeChannelsLies } from "./oracles/three-channels.lies.ts";
import { threeChannels } from "./oracles/three-channels.ts";
import { payScenarios } from "./scenarios/pay.ts";

/**
 * Every oracle, run after every step of every case.
 */
export const oracles: ReadonlyArray<Oracle> = [threeChannels, attemptIdentity];

/**
 * Every lie, each beside the oracle that must catch it.
 */
export const lies: ReadonlyArray<Lie> = [...threeChannelsLies, ...attemptIdentityLies];

/**
 * Every case, in run order.
 */
export const scenarios: ReadonlyArray<Scenario> = [...payScenarios];
