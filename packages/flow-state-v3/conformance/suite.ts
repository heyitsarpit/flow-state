import { disposalMutants } from "./actors/disposal.mutants.ts";
import { disposal } from "./actors/disposal.ts";
import { runtimeDisposalScenarios } from "./actors/runtime-disposal.scenarios.ts";
import type { Scenario } from "./dsl/case.ts";
import type { Guarantee } from "./dsl/oracle.ts";
import { attemptIdentityMutants } from "./write-lanes/attempt-identity.mutants.ts";
import { attemptIdentity } from "./write-lanes/attempt-identity.ts";
import { deliveredOnceMutants } from "./write-lanes/delivered-once.mutants.ts";
import { deliveredOnce } from "./write-lanes/delivered-once.ts";
import { endingChannelsMutants } from "./write-lanes/ending-channels.mutants.ts";
import { endingChannels } from "./write-lanes/ending-channels.ts";
import { endingDeliveryScenarios } from "./write-lanes/ending-delivery.scenarios.ts";
import { lanePoliciesScenarios } from "./write-lanes/lane-policies.scenarios.ts";
import { laneQueueMutants } from "./write-lanes/lane-queue.mutants.ts";
import { laneQueue } from "./write-lanes/lane-queue.ts";
import { paymentEndingsScenarios } from "./write-lanes/payment-endings.scenarios.ts";
import { paymentFaultsScenarios } from "./write-lanes/payment-faults.scenarios.ts";
import { paymentHeldScenarios } from "./write-lanes/payment-held.scenarios.ts";
import { paymentLateAnswersScenarios } from "./write-lanes/payment-late-answers.scenarios.ts";
import { paymentLeaveAndReloadScenarios } from "./write-lanes/payment-leave-and-reload.scenarios.ts";
import { paymentRetryScenarios } from "./write-lanes/payment-retry.scenarios.ts";

/**
 * Every guarantee the suite runs: each oracle with the mutants it must catch.
 */
export const guarantees: ReadonlyArray<Guarantee> = [
  { oracle: endingChannels, mutants: endingChannelsMutants },
  { oracle: attemptIdentity, mutants: attemptIdentityMutants },
  { oracle: deliveredOnce, mutants: deliveredOnceMutants },
  { oracle: laneQueue, mutants: laneQueueMutants },
  { oracle: disposal, mutants: disposalMutants },
];

/**
 * Every oracle, run after every step of every case.
 */
export const oracles = guarantees.map((g) => g.oracle);

/**
 * Every case, in run order.
 */
export const scenarios: ReadonlyArray<Scenario> = [
  ...paymentEndingsScenarios,
  ...paymentLeaveAndReloadScenarios,
  ...paymentFaultsScenarios,
  ...paymentHeldScenarios,
  ...paymentRetryScenarios,
  ...paymentLateAnswersScenarios,
  ...runtimeDisposalScenarios,
  ...lanePoliciesScenarios,
  ...endingDeliveryScenarios,
];
