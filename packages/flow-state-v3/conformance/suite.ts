import type { Scenario } from "./dsl/case.ts";
import { attemptIdentityLies } from "./oracles/attempt-identity.lies.ts";
import { attemptIdentity } from "./oracles/attempt-identity.ts";
import { oneDeliveryLies } from "./oracles/one-delivery.lies.ts";
import { oneDelivery } from "./oracles/one-delivery.ts";
import type { Guarantee } from "./oracles/oracle.ts";
import { threeChannelsLies } from "./oracles/three-channels.lies.ts";
import { threeChannels } from "./oracles/three-channels.ts";
import { deliveryScenarios } from "./scenarios/delivery.ts";
import { payScenarios } from "./scenarios/pay.ts";

/**
 * Every guarantee the suite runs: each oracle with the lies it must catch.
 */
export const guarantees: ReadonlyArray<Guarantee> = [
  { oracle: threeChannels, lies: threeChannelsLies },
  { oracle: attemptIdentity, lies: attemptIdentityLies },
  { oracle: oneDelivery, lies: oneDeliveryLies },
];

/**
 * Every oracle, run after every step of every case.
 */
export const oracles = guarantees.map((g) => g.oracle);

/**
 * Every case, in run order.
 */
export const scenarios: ReadonlyArray<Scenario> = [...payScenarios, ...deliveryScenarios];
