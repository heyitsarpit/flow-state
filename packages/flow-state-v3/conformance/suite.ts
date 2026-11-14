import { productionCaseMutants, productionMutants } from "./adapters/production.mutants.ts";
import { disposalMutants } from "./actors/disposal.mutants.ts";
import { disposal } from "./actors/disposal.ts";
import { laneKeepingScenarios } from "./actors/lane-keeping.scenarios.ts";
import { lifetimeScenarios } from "./actors/lifetime.scenarios.ts";
import { runtimeDisposalScenarios } from "./actors/runtime-disposal.scenarios.ts";
import { constructionMutants } from "./compile/construction.mutants.ts";
import { constructionCases, constructionCovered } from "./compile/construction.cases.ts";
import { type CaseChecks, coveredBy } from "./coverage.ts";
import type { Scenario } from "./dsl/case.ts";
import type { StaticCase } from "./dsl/static-case.ts";
import type { Guarantee, Mutant, Probe } from "./dsl/oracle.ts";
import { cliMutants } from "./static-cli/cli.mutants.ts";
import { cliCases, cliCovered } from "./static-cli/cli.cases.ts";
import { graphNames } from "./static-cli/graph-names.ts";
import { graphNamesMutants } from "./static-cli/graph-names.mutants.ts";
import { activationsScenarios } from "./turn/activations.scenarios.ts";
import { partsMutants } from "./turn/parts.mutants.ts";
import { partsCovered, partsScenarios } from "./turn/parts.scenarios.ts";
import { refusalMutants, replayMutants } from "./turn/refusal.mutants.ts";
import { refusalCovered, refusalScenarios } from "./turn/refusal.scenarios.ts";
import { refusal } from "./turn/refusal.ts";
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
  anchorLieMutants,
  incarnationLieMutants,
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
  {
    oracle: endingChannels,
    mutants: [
      ...endingChannelsMutants,
      ...anchorLieMutants.filter((m) => m.expects === "WriteLanes I3"),
    ],
  },
  {
    oracle: attemptIdentity,
    mutants: [
      ...attemptIdentityMutants,
      ...anchorLieMutants.filter((m) => m.expects === "WriteLanes I6"),
    ],
  },
  {
    oracle: deliveredOnce,
    mutants: [
      ...deliveredOnceMutants,
      ...carriedDeliveredOnceMutants,
      ...reportLieMutants,
      ...anchorLieMutants.filter((m) => m.expects === "WriteLanes I15"),
    ],
  },
  { oracle: laneQueue, mutants: [...laneQueueMutants, ...resendMutants, ...headerLaneMutants] },
  { oracle: disposal, mutants: [...disposalMutants, ...incarnationLieMutants] },
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
 * Behavioural mutants the liar gate turns green because no fixture can show their act yet, each
 * with why: a fixture gap, not a report-only act (coordinator 36e55d53). The liar gate leaves
 * them out and fails when there are more than {@link FIXTURE_GAP_CAP}; falsify still catches them.
 */
export const fixtureGaps = {
  "mutant.unsent-ends-unknown":
    "no fixture's No, Unsure or NotSent handler changes the leaf or memory, so a queued commit's unknown instead of NotSent at the disposal reaches no world read; @task.V3.T47's fixtures on production own catching it (coordinator 36e55d53)",
  "a2.deliv-fail-samemail":
    "no fixture's No, Unsure or NotSent handler changes the leaf or memory, so an ending consumed with no turn changes no request, row or snapshot; @task.V3.T47's fixtures on production own catching it (coordinator 36e55d53)",
  "d154.moved-fail-released":
    "no fixture's No, Unsure or NotSent handler changes the leaf or memory, so an ending released as evidence with no turn changes no request, row or snapshot; @task.V3.T47's fixtures on production own catching it (coordinator 36e55d53)",
  "1b.cancel-all-wire-held-at-once":
    "no fixture's No, Unsure or NotSent handler changes the leaf or memory, so a cancelled wire head's lost Unsure changes no request or snapshot; @task.V3.T47's fixtures on production own catching it (coordinator 36e55d53)",
  "p1h.cancel-all-idle-declines":
    "no fixture's No, Unsure or NotSent handler changes the leaf or memory, so an extra NotSent Cancelled on an idle lane changes no request or snapshot; @task.V3.T47's fixtures on production own catching it (coordinator 36e55d53)",
  "mutant.disposal-hold-first":
    "no fixture's No, Unsure or NotSent handler changes the leaf or memory, so the order of a disposal's parked endings reaches no world read; @task.V3.T47's fixtures on production own catching it (coordinator 36e55d53)",
  "lane.superseded-delivered":
    "no fixture's No, Unsure or NotSent handler changes the leaf or memory, so a superseded commit's extra NotSent Overloaded changes no request or snapshot; @task.V3.T47's fixtures on production own catching it (coordinator 36e55d53)",
  "lane.unencodable-refuses-turn":
    "no fixture's No, Unsure or NotSent handler changes the leaf or memory, so a refused turn instead of a decline changes no request or snapshot; @task.V3.T47's fixtures on production own catching it (coordinator 36e55d53)",
  "mutant.members-reversed":
    "no fixture declares the order of a turn's requests, so reversed members reach the server in an order no check compares; @task.V3.T47's fixtures on production own catching it (coordinator 36e55d53)",
} satisfies Readonly<Record<string, string>>;

/**
 * Mutants that lie about reports only, with the runtime acting correctly: the liar gate leaves
 * them out, since a correct runtime's reports make them correct.
 */
export const reportOnly: ReadonlySet<string> = new Set([
  ...reportLieMutants.map((m) => m.name),
  ...incarnationLieMutants.map((m) => m.name),
  ...anchorLieMutants.map((m) => m.name),
  ...Object.values(productionMutants)
    .flat()
    .filter((m) => m.edits.every((e) => e.file.startsWith("conformance/adapters/")))
    .map((m) => m.name),
  ...Object.keys(reportTruth),
  ...Object.keys(fixtureGaps),
]);

/**
 * The most fixture gaps the liar gate allows (the phase-out's cap of 9 liar greens).
 */
export const FIXTURE_GAP_CAP = 9;

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
  ...lifetimeScenarios,
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
