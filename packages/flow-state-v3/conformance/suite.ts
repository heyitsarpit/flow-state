import { disposalMutants } from "./actors/disposal.mutants.ts";
import { disposal } from "./actors/disposal.ts";
import { laneKeepingScenarios } from "./actors/lane-keeping.scenarios.ts";
import { runtimeDisposalScenarios } from "./actors/runtime-disposal.scenarios.ts";
import { constructionMutants } from "./compile/construction.mutants.ts";
import {
  constructionCases,
  constructionCovered,
  constructionRemainders,
} from "./compile/construction.cases.ts";
import type { CaseChecks, Remainder } from "./coverage.ts";
import type { Scenario } from "./dsl/case.ts";
import type { StaticCase } from "./dsl/static-case.ts";
import type { Guarantee, Probe } from "./dsl/oracle.ts";
import { cliMutants } from "./static-cli/cli.mutants.ts";
import { cliCases, cliCovered, cliRemainders } from "./static-cli/cli.cases.ts";
import { graphNames } from "./static-cli/graph-names.ts";
import { graphNamesMutants } from "./static-cli/graph-names.mutants.ts";
import { headerLaneMutants, selectionMutants } from "./turn/selection.mutants.ts";
import { selection } from "./turn/selection.ts";
import {
  carriedDeliveredOnceMutants,
  carriedDisposalMutants,
} from "./write-lanes/carried.mutants.ts";
import { attemptIdentityMutants } from "./write-lanes/attempt-identity.mutants.ts";
import { attemptIdentity } from "./write-lanes/attempt-identity.ts";
import { deliveredOnceMutants } from "./write-lanes/delivered-once.mutants.ts";
import { deliveredOnce } from "./write-lanes/delivered-once.ts";
import { endingChannelsMutants } from "./write-lanes/ending-channels.mutants.ts";
import { endingChannels } from "./write-lanes/ending-channels.ts";
import { endingDeliveryScenarios } from "./write-lanes/ending-delivery.scenarios.ts";
import { lanePoliciesScenarios } from "./write-lanes/lane-policies.scenarios.ts";
import { laneQueueMutants, laneQueueProbes } from "./write-lanes/lane-queue.mutants.ts";
import { laneQueue } from "./write-lanes/lane-queue.ts";
import { paymentEndingsScenarios } from "./write-lanes/payment-endings.scenarios.ts";
import { paymentFaultsScenarios } from "./write-lanes/payment-faults.scenarios.ts";
import { laneAnchorScenarios } from "./write-lanes/lane-anchors.scenarios.ts";
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
  { oracle: deliveredOnce, mutants: [...deliveredOnceMutants, ...carriedDeliveredOnceMutants] },
  { oracle: laneQueue, mutants: [...laneQueueMutants, ...headerLaneMutants] },
  { oracle: disposal, mutants: [...disposalMutants, ...carriedDisposalMutants] },
  { oracle: graphNames, mutants: graphNamesMutants },
  { oracle: selection, mutants: selectionMutants },
];

/**
 * Every probe falsify runs beside the mutants ({@link Probe}).
 */
export const probes: ReadonlyArray<Probe> = laneQueueProbes;

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
  ...laneAnchorScenarios,
  ...runtimeDisposalScenarios,
  ...laneKeepingScenarios,
  ...lanePoliciesScenarios,
  ...endingDeliveryScenarios,
];

/**
 * Every static case (Conformance R14), in run order.
 */
export const staticCases: ReadonlyArray<StaticCase> = [...constructionCases, ...cliCases];

/**
 * Every case id, runtime then static.
 */
export const caseIds = [...scenarios.map((s) => s.id), ...staticCases.map((s) => s.id)];

/**
 * The Invariants judged by case expectations, the mutants those cases must catch, and every
 * case's citations (the coverage gate's second kind).
 */
export const caseChecks: CaseChecks = {
  rows: [...constructionCovered, ...cliCovered],
  mutants: [...constructionMutants, ...cliMutants],
  cases: [...scenarios, ...staticCases].map((c) => ({ id: c.id, cites: c.cites })),
};

/**
 * The part of each checked Invariant its checks do not judge yet, by the Task that owes it.
 */
export const remainders: ReadonlyArray<Remainder> = [...constructionRemainders, ...cliRemainders];
