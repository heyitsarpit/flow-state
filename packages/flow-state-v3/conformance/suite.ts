import { productionCaseMutants, productionMutants } from "./adapters/production.mutants.ts";
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
  carriedRecordProbes,
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
  { oracle: disposal, mutants: disposalMutants },
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
 * Behavioural mutants whose wrong act no world read can see, each with why: what they change
 * reaches only the runtime's reports (advisor Q1, "report truth only"). The liar gate leaves them
 * out; the reports' own oracles still catch them.
 */
const reportTruth = {
  "prod.state-move-copies-memory": "a published memory's identity",
  "prod.refused-turn-reported": "an extra turn report",
  "prod.kept-redelivered": "a refused try rolls back; only the Delivered count differs",
  "prod.bound-forgets-the-wire": "the unknown's reason; the lane is Held either way",
  "mutant.ending-without-id": "an evidence record's Attempt id",
  "mutant.sent-under-another-operation": "the invoked note's operation",
  "mutant.replaced-delivered": "an evidence-only note renamed delivered",
  "mutant.success-then-failure": "an extra evidence note, with no mail",
  "1b.cancel-all-queue-reversed": "the Attempt ids on equal NotSent endings",
  "turn.record-renames-alternative": "the turn note's alternative name",
  "turn.from-misreported": "the turn note's from",
  "turn.part-turn-moves-header": "the turn note's to",
  "refusal.reports-kept": "a refused turn's evidence",
  "pub.move-copies-memory": "a published memory's identity",
  "pub.turn-not-published": "the published note; reads see the committed world",
  "1b.r8-third-try": "a refused try rolls back; only the Delivered count differs",
  "mutant.kept-retried-without-boot": "a refused try rolls back; only the Delivered count differs",
  "turn.memory-takes-a-random-nonce": "an undeclared memory key; every read decodes by the schema",
} satisfies Readonly<Record<string, string>>;

/**
 * Mutants that lie about reports only, with the runtime acting correctly: the liar gate leaves
 * them out, since a correct runtime's reports make them correct.
 */
export const reportOnly: ReadonlySet<string> = new Set([
  ...reportLieMutants.map((m) => m.name),
  ...Object.values(productionMutants)
    .flat()
    .filter((m) => m.edits.every((e) => e.file.startsWith("conformance/adapters/")))
    .map((m) => m.name),
  ...Object.keys(reportTruth),
]);

/**
 * Every probe falsify runs beside the mutants ({@link Probe}).
 */
export const probes: ReadonlyArray<Probe> = [...laneQueueProbes, ...carriedRecordProbes];

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
    ...productionCaseMutants,
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
