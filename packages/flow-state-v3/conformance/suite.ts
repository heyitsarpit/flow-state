import { productionMutants } from "./adapters/production.mutants.ts";
import { disposalMutants } from "./actors/disposal.mutants.ts";
import { actorsRemainders } from "./actors/remainders.ts";
import { disposal } from "./actors/disposal.ts";
import { laneKeepingScenarios } from "./actors/lane-keeping.scenarios.ts";
import { runtimeDisposalScenarios } from "./actors/runtime-disposal.scenarios.ts";
import { constructionMutants } from "./compile/construction.mutants.ts";
import {
  constructionCases,
  constructionCovered,
  constructionRemainders,
} from "./compile/construction.cases.ts";
import { type CaseChecks, coveredBy, type Remainder } from "./coverage.ts";
import type { Scenario } from "./dsl/case.ts";
import type { StaticCase } from "./dsl/static-case.ts";
import type { Guarantee, Mutant, Probe } from "./dsl/oracle.ts";
import { cliMutants } from "./static-cli/cli.mutants.ts";
import {
  cliCases,
  cliCompileRemainders,
  cliCovered,
  cliRemainders,
} from "./static-cli/cli.cases.ts";
import { graphNames } from "./static-cli/graph-names.ts";
import { graphNamesMutants } from "./static-cli/graph-names.mutants.ts";
import { activationsScenarios } from "./turn/activations.scenarios.ts";
import { partsMutants } from "./turn/parts.mutants.ts";
import { partsCovered, partsScenarios } from "./turn/parts.scenarios.ts";
import { refusalMutants, replayMutants } from "./turn/refusal.mutants.ts";
import { refusalCovered, refusalScenarios } from "./turn/refusal.scenarios.ts";
import { refusal } from "./turn/refusal.ts";
import { turnRemainders } from "./turn/remainders.ts";
import { writeLanesRemainders } from "./write-lanes/remainders.ts";
import { schedulesCaseMutants, schedulesMutants } from "./turn/schedules.mutants.ts";
import { schedulesScenarios } from "./turn/schedules.scenarios.ts";
import { schedules } from "./turn/schedules.ts";
import { publicationMutants } from "./turn/publication.mutants.ts";
import { publication } from "./turn/publication.ts";
import { headerLaneMutants, selectionMutants } from "./turn/selection.mutants.ts";
import { selection } from "./turn/selection.ts";
import {
  carriedDeliveredOnceMutants,
  carriedDisposalMutants,
  reportLieMutants,
} from "./write-lanes/carried.mutants.ts";
import { attemptIdentityMutants } from "./write-lanes/attempt-identity.mutants.ts";
import { attemptIdentity } from "./write-lanes/attempt-identity.ts";
import { deliveredOnceMutants } from "./write-lanes/delivered-once.mutants.ts";
import { deliveredOnce } from "./write-lanes/delivered-once.ts";
import { endingChannelsMutants } from "./write-lanes/ending-channels.mutants.ts";
import { endingChannels } from "./write-lanes/ending-channels.ts";
import { endingDeliveryScenarios } from "./write-lanes/ending-delivery.scenarios.ts";
import { laneKeysMutants } from "./write-lanes/lane-keys.mutants.ts";
import { laneKeysCovered, laneKeysScenarios } from "./write-lanes/lane-keys.scenarios.ts";
import { lanePoliciesScenarios } from "./write-lanes/lane-policies.scenarios.ts";
import { laneQueueMutants, laneQueueProbes } from "./write-lanes/lane-queue.mutants.ts";
import { resendMutants } from "./write-lanes/resend.mutants.ts";
import { laneQueue } from "./write-lanes/lane-queue.ts";
import { paymentEndingsScenarios } from "./write-lanes/payment-endings.scenarios.ts";
import { paymentFaultsScenarios } from "./write-lanes/payment-faults.scenarios.ts";
import { laneAnchorScenarios } from "./write-lanes/lane-anchors.scenarios.ts";
import { paymentHeldScenarios } from "./write-lanes/payment-held.scenarios.ts";
import { paymentLateAnswersScenarios } from "./write-lanes/payment-late-answers.scenarios.ts";
import { paymentLeaveAndReloadScenarios } from "./write-lanes/payment-leave-and-reload.scenarios.ts";
import { evidenceKindsMutants } from "./write-lanes/evidence-kinds.mutants.ts";
import { evidenceKinds } from "./write-lanes/evidence-kinds.ts";
import { idleGuardMutants } from "./write-lanes/idle-guard.mutants.ts";
import { idleGuard } from "./write-lanes/idle-guard.ts";
import { lateResultsMutants } from "./write-lanes/late-results.mutants.ts";
import { lateResults } from "./write-lanes/late-results.ts";
import { retryCountMutants } from "./write-lanes/retry-count.mutants.ts";
import { retryCount } from "./write-lanes/retry-count.ts";
import {
  paymentRetryCovered,
  paymentRetryScenarios,
} from "./write-lanes/payment-retry.scenarios.ts";

/**
 * Every guarantee the suite runs: each oracle with the mutants it must catch.
 */
const pinned: ReadonlyArray<Guarantee> = [
  { oracle: endingChannels, mutants: endingChannelsMutants },
  { oracle: attemptIdentity, mutants: attemptIdentityMutants },
  {
    oracle: deliveredOnce,
    mutants: [...deliveredOnceMutants, ...carriedDeliveredOnceMutants, ...reportLieMutants],
  },
  { oracle: laneQueue, mutants: [...laneQueueMutants, ...resendMutants, ...headerLaneMutants] },
  { oracle: disposal, mutants: [...disposalMutants, ...carriedDisposalMutants] },
  { oracle: graphNames, mutants: graphNamesMutants },
  { oracle: retryCount, mutants: retryCountMutants },
  { oracle: evidenceKinds, mutants: evidenceKindsMutants },
  { oracle: idleGuard, mutants: idleGuardMutants },
  { oracle: lateResults, mutants: lateResultsMutants },
  { oracle: selection, mutants: selectionMutants },
  { oracle: publication, mutants: publicationMutants },
  { oracle: refusal, mutants: refusalMutants },
  { oracle: schedules, mutants: schedulesMutants },
];

/**
 * Every guarantee the suite runs: each oracle with the mutants it must catch, the production
 * runtime's among them (`adapters/production.mutants.ts`).
 */
const production: ReadonlyMap<string, ReadonlyArray<Mutant>> = new Map(
  Object.entries(productionMutants),
);

export const guarantees: ReadonlyArray<Guarantee> = pinned.map((g) => ({
  oracle: g.oracle,
  mutants: [...g.mutants, ...(production.get(g.oracle.name) ?? [])],
}));

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
  ...laneKeysScenarios,
  ...endingDeliveryScenarios,
  ...refusalScenarios,
  ...schedulesScenarios,
  ...activationsScenarios,
  ...partsScenarios,
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
  rows: [
    ...constructionCovered,
    ...cliCovered,
    ...coveredBy(schedulesScenarios).filter((row) => row.invariant === "Turn I22"),
    ...laneKeysCovered,
    ...paymentRetryCovered,
    ...partsCovered,
    ...refusalCovered,
  ],
  mutants: [
    ...constructionMutants,
    ...cliMutants,
    ...schedulesCaseMutants,
    ...laneKeysMutants,
    ...partsMutants,
    ...replayMutants,
  ],
  cases: [...scenarios, ...staticCases].map((c) => ({ id: c.id, cites: c.cites })),
};

/**
 * The part of each checked Invariant its checks do not judge yet, by the Task that owes it.
 */
export const remainders: ReadonlyArray<Remainder> = [
  ...constructionRemainders,
  ...cliRemainders,
  ...cliCompileRemainders,
  ...turnRemainders,
  ...actorsRemainders,
  ...writeLanesRemainders,
];
