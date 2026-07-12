import type {
  AnyFlowMachine,
  FlowGraphChildSpec,
  FlowResourceRef,
  FlowStreamPressure,
  FlowStory,
  FlowStoriesDescriptor,
  FlowTransactionDefinition,
} from "../api/types.js";
import type {
  FlowBehaviorBuildTarget,
  FlowBehaviorMachine,
  FlowBehaviorView,
} from "./behavior-contract.js";

import { buildBehaviorContract, sliceBehaviorContract } from "./behavior-contract.js";
import {
  formatNoTransitionSummary,
  graphOf,
  inspectTransition,
  whyNoTransition,
} from "./inspect.js";
import {
  queryInvokesForState,
  streamInvokesForState,
} from "../orchestrator/orchestrator-helpers.js";
import { resolveTransactionOutcomeEvent } from "../transactions/transaction-outcome-callbacks.js";

export type FlowBehaviorCoverageRenderOptions = Readonly<{
  moduleId?: string;
}>;

type MachineCoverageSummary = Readonly<{
  machine: FlowBehaviorMachine;
  coveredStateIds: ReadonlyArray<string>;
  uncoveredStateIds: ReadonlyArray<string>;
  coveredStoryTargetStateIds: ReadonlyArray<string>;
  unprovedStoryTargetStateIds: ReadonlyArray<string>;
  coveredErrorPathStateIds: ReadonlyArray<string>;
  unprovedErrorPathStateIds: ReadonlyArray<string>;
  coveredTransactionOutcomeIds: ReadonlyArray<string>;
  unprovedTransactionOutcomeIds: ReadonlyArray<string>;
  coveredChildSupervisionIds: ReadonlyArray<string>;
  unprovedChildSupervisionIds: ReadonlyArray<string>;
  coveredResourceQueryLifecycleIds: ReadonlyArray<string>;
  unprovedResourceQueryLifecycleIds: ReadonlyArray<string>;
  coveredStreamLifecycleIds: ReadonlyArray<string>;
  unprovedStreamLifecycleIds: ReadonlyArray<string>;
  coveredTransitions: ReadonlyArray<string>;
  uncoveredTransitions: ReadonlyArray<string>;
  coveredReceiptTypes: ReadonlyArray<string>;
  coveredRelatedIds: ReadonlyArray<string>;
  coveredIssueKinds: ReadonlyArray<string>;
  coveredIssueSources: ReadonlyArray<string>;
  coveredOutcomeKinds: ReadonlyArray<string>;
  coveredOutcomeSources: ReadonlyArray<string>;
  blockedStories: ReadonlyArray<string>;
  mismatchStories: ReadonlyArray<string>;
}>;

type StoryDescriptor = NonNullable<FlowBehaviorBuildTarget["stories"]>[number];
type MachineCoverageCore = Omit<
  MachineCoverageSummary,
  | "machine"
  | "coveredErrorPathStateIds"
  | "unprovedErrorPathStateIds"
  | "coveredTransactionOutcomeIds"
  | "unprovedTransactionOutcomeIds"
  | "coveredChildSupervisionIds"
  | "unprovedChildSupervisionIds"
  | "coveredResourceQueryLifecycleIds"
  | "unprovedResourceQueryLifecycleIds"
  | "coveredStreamLifecycleIds"
  | "unprovedStreamLifecycleIds"
>;
type GuardPassEvidence = Readonly<{
  transitionId: string;
  storyId: string;
}>;
type NonSuccessOutcomeLane = "failure" | "defect" | "interrupt";
type ViewSourceKind = FlowBehaviorView["sources"][number];
const nonSuccessOutcomeLanes = [
  "failure",
  "defect",
  "interrupt",
] as const satisfies ReadonlyArray<NonSuccessOutcomeLane>;
const transactionOutcomeKinds = ["success", "failure", "defect", "interrupt"] as const;
const orderedStreamRouteKinds = ["value", "done", "failure", "defect", "interrupt"] as const;

function uniqueOrdered(values: ReadonlyArray<string>): ReadonlyArray<string> {
  const seen = new Set<string>();
  const ordered: Array<string> = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    ordered.push(value);
  }

  return Object.freeze(ordered);
}

function commaList(values: ReadonlyArray<string>, empty = "none"): string {
  return values.length === 0 ? empty : values.join(", ");
}

function createRouteProbe(): Readonly<Record<string, unknown>> {
  let probe: Readonly<Record<string, unknown>>;

  probe = new Proxy(Object.freeze({}), {
    get: () => probe,
    has: () => true,
    ownKeys: () => [],
    getOwnPropertyDescriptor: () => ({
      configurable: true,
      enumerable: true,
    }),
  });

  return probe;
}

function readOutcomeRouteEventType(
  transaction: FlowTransactionDefinition,
  lane: NonSuccessOutcomeLane,
): string | undefined {
  try {
    const probe = createRouteProbe();
    const event =
      lane === "failure"
        ? resolveTransactionOutcomeEvent(transaction.config.routes, "failure", { error: probe })
        : lane === "defect"
          ? resolveTransactionOutcomeEvent(transaction.config.routes, "defect", { cause: probe })
          : resolveTransactionOutcomeEvent(transaction.config.routes, "interrupt", {
              reason: probe,
            });

    return event?.type;
  } catch {
    return undefined;
  }
}

function collectModuleTransactions(
  target: FlowBehaviorBuildTarget,
  moduleId: string | null,
): ReadonlyArray<FlowTransactionDefinition> {
  if (moduleId === null) {
    return Object.freeze([]);
  }

  const module = target.app.modules.find((candidate) => candidate.id === moduleId);

  if (module === undefined) {
    return Object.freeze([]);
  }

  return Object.freeze(
    Object.values(
      ((module as Readonly<Record<string, unknown>>).transactions ?? {}) as Readonly<
        Record<string, FlowTransactionDefinition>
      >,
    ),
  );
}

function deriveErrorPathStateIds(
  target: FlowBehaviorBuildTarget,
  machine: FlowBehaviorMachine,
): ReadonlyArray<string> {
  const eventTypes = uniqueOrdered(
    collectModuleTransactions(target, machine.moduleId).flatMap((transaction) =>
      nonSuccessOutcomeLanes.flatMap((lane) => {
        const eventType = readOutcomeRouteEventType(transaction, lane);
        return eventType === undefined ? ([] as ReadonlyArray<string>) : [eventType];
      }),
    ),
  );

  return uniqueOrdered(
    machine.transitions
      .filter((transition) => eventTypes.includes(transition.eventType))
      .map((transition) => transition.target),
  );
}

function describeTransactionOutcome(transactionId: string, outcomeKind: string): string {
  return `${transactionId} -> ${outcomeKind}`;
}

function transactionOutcomeObligationIds(
  transactions: ReadonlyArray<FlowTransactionDefinition>,
): ReadonlyArray<string> {
  return uniqueOrdered(
    transactions.flatMap((transaction) =>
      transactionOutcomeKinds.flatMap((outcomeKind) => {
        if (outcomeKind === "success") {
          return [describeTransactionOutcome(transaction.id, outcomeKind)];
        }

        return transaction.config.routes?.[outcomeKind] === undefined
          ? ([] as ReadonlyArray<string>)
          : [describeTransactionOutcome(transaction.id, outcomeKind)];
      }),
    ),
  );
}

function collectAppMachines(target: FlowBehaviorBuildTarget): ReadonlyMap<string, AnyFlowMachine> {
  return new Map(
    target.app.modules.flatMap((module) =>
      Object.values(
        ((module as Readonly<Record<string, unknown>>).machines ?? {}) as Readonly<
          Record<string, AnyFlowMachine>
        >,
      ).map((machine) => [machine.id, machine] as const),
    ),
  );
}

function describeChildSupervision(stateId: string, child: FlowGraphChildSpec): string {
  return `${stateId} -> ${child.id} (${child.supervision ?? "unspecified"})`;
}

function childSupervisionCoverageIds(
  machine: AnyFlowMachine | undefined,
  coveredStateIds: ReadonlyArray<string>,
  uncoveredStateIds: ReadonlyArray<string>,
): Readonly<{
  coveredChildSupervisionIds: ReadonlyArray<string>;
  unprovedChildSupervisionIds: ReadonlyArray<string>;
}> {
  if (machine === undefined) {
    return Object.freeze({
      coveredChildSupervisionIds: Object.freeze([]),
      unprovedChildSupervisionIds: Object.freeze([]),
    });
  }

  const graph = graphOf(machine);
  const childSpecsByState = graph.nodes.flatMap((node) =>
    node.childSpecs.map((child) =>
      Object.freeze({
        stateId: node.id,
        child,
      }),
    ),
  );

  return Object.freeze({
    coveredChildSupervisionIds: uniqueOrdered(
      childSpecsByState
        .filter((entry) => coveredStateIds.includes(entry.stateId))
        .map((entry) => describeChildSupervision(entry.stateId, entry.child)),
    ),
    unprovedChildSupervisionIds: uniqueOrdered(
      childSpecsByState
        .filter((entry) => uncoveredStateIds.includes(entry.stateId))
        .map((entry) => describeChildSupervision(entry.stateId, entry.child)),
    ),
  });
}

type CoverageResourceQueryDefinition = Readonly<{
  kind: "ensure" | "observe" | "refresh";
  ref: FlowResourceRef;
}>;

function describeResourceQueryLifecycle(
  stateId: string,
  definition: CoverageResourceQueryDefinition,
): string {
  return `${stateId} -> ${definition.kind} ${definition.ref.id}`;
}

function resourceQueryLifecycleCoverageIds(
  machine: AnyFlowMachine | undefined,
  coveredStateIds: ReadonlyArray<string>,
  uncoveredStateIds: ReadonlyArray<string>,
): Readonly<{
  coveredResourceQueryLifecycleIds: ReadonlyArray<string>;
  unprovedResourceQueryLifecycleIds: ReadonlyArray<string>;
}> {
  if (machine === undefined) {
    return Object.freeze({
      coveredResourceQueryLifecycleIds: Object.freeze([]),
      unprovedResourceQueryLifecycleIds: Object.freeze([]),
    });
  }

  const initialSnapshot = machine.getInitialSnapshot();
  const resourceQueriesByState = graphOf(machine).nodes.flatMap((node) =>
    queryInvokesForState(initialSnapshot, node.id).map((definition) =>
      Object.freeze({
        stateId: node.id,
        definition,
      }),
    ),
  );

  return Object.freeze({
    coveredResourceQueryLifecycleIds: uniqueOrdered(
      resourceQueriesByState
        .filter((entry) => coveredStateIds.includes(entry.stateId))
        .map((entry) => describeResourceQueryLifecycle(entry.stateId, entry.definition)),
    ),
    unprovedResourceQueryLifecycleIds: uniqueOrdered(
      resourceQueriesByState
        .filter((entry) => uncoveredStateIds.includes(entry.stateId))
        .map((entry) => describeResourceQueryLifecycle(entry.stateId, entry.definition)),
    ),
  });
}

type CoverageStreamDefinition = Readonly<{
  id: string;
  config: Readonly<{
    pressure?: FlowStreamPressure;
    routes?: Readonly<Record<string, unknown>>;
  }>;
}>;

function describeStreamPressure(definition: CoverageStreamDefinition): string {
  const pressure = definition.config.pressure;

  if (pressure === undefined) {
    return "no pressure";
  }

  if (pressure.strategy === "queue") {
    return pressure.limit === undefined
      ? "pressure queue"
      : `pressure queue limit=${pressure.limit}`;
  }

  return "pressure coalesce-latest";
}

function describeStreamLifecycle(stateId: string, definition: CoverageStreamDefinition): string {
  const routes = definition.config.routes ?? Object.freeze({});
  const routeKinds = orderedStreamRouteKinds.filter((routeKind) => routeKind in routes);
  return `${stateId} -> ${definition.id} (state-owned lifecycle; ${describeStreamPressure(definition)}; routes ${commaList(routeKinds)})`;
}

function streamLifecycleCoverageIds(
  machine: AnyFlowMachine | undefined,
  coveredStateIds: ReadonlyArray<string>,
  uncoveredStateIds: ReadonlyArray<string>,
): Readonly<{
  coveredStreamLifecycleIds: ReadonlyArray<string>;
  unprovedStreamLifecycleIds: ReadonlyArray<string>;
}> {
  if (machine === undefined) {
    return Object.freeze({
      coveredStreamLifecycleIds: Object.freeze([]),
      unprovedStreamLifecycleIds: Object.freeze([]),
    });
  }

  const initialSnapshot = machine.getInitialSnapshot();
  const streamInvokesByState = graphOf(machine).nodes.flatMap((node) =>
    streamInvokesForState(initialSnapshot, node.id).map((definition) =>
      Object.freeze({
        stateId: node.id,
        definition,
      }),
    ),
  );

  return Object.freeze({
    coveredStreamLifecycleIds: uniqueOrdered(
      streamInvokesByState
        .filter((entry) => coveredStateIds.includes(entry.stateId))
        .map((entry) => describeStreamLifecycle(entry.stateId, entry.definition)),
    ),
    unprovedStreamLifecycleIds: uniqueOrdered(
      streamInvokesByState
        .filter((entry) => uncoveredStateIds.includes(entry.stateId))
        .map((entry) => describeStreamLifecycle(entry.stateId, entry.definition)),
    ),
  });
}

function describeTransition(
  transition: Pick<
    FlowBehaviorMachine["transitions"][number],
    "id" | "source" | "target" | "eventType"
  >,
): string {
  return `${transition.source} --${transition.eventType}--> ${transition.target} [${transition.id}]`;
}

function mergeStoryDescriptors(
  target: FlowBehaviorBuildTarget,
): ReadonlyMap<string, StoryDescriptor> {
  const descriptors = new Map<string, StoryDescriptor>();

  for (const descriptor of target.stories ?? []) {
    const existing = descriptors.get(descriptor.machine.id);

    if (existing === undefined) {
      descriptors.set(descriptor.machine.id, descriptor);
      continue;
    }

    descriptors.set(
      descriptor.machine.id,
      Object.freeze({
        kind: "stories" as const,
        machine: existing.machine,
        stories: Object.freeze([...existing.stories, ...descriptor.stories]),
      }),
    );
  }

  return descriptors;
}

function coveredStoryTransactionOutcomeIds<Machine extends AnyFlowMachine>(
  descriptor: FlowStoriesDescriptor<Machine>,
): ReadonlyArray<string> {
  const coverage = graphOf(descriptor.machine).storyCoverage(descriptor);
  return uniqueOrdered(
    coverage.stories
      .filter((story) => story.status === "covered")
      .flatMap((story) =>
        (story.story.expectedFacts?.relatedIds ?? []).flatMap((relatedId) =>
          (story.story.expectedFacts?.outcomeKinds ?? []).map((outcomeKind) =>
            describeTransactionOutcome(relatedId, outcomeKind),
          ),
        ),
      ),
  );
}

function summarizeStoryCoverage<Machine extends AnyFlowMachine>(
  descriptor: FlowStoriesDescriptor<Machine>,
): MachineCoverageCore {
  const graph = graphOf(descriptor.machine);
  const coverage = graph.storyCoverage(descriptor);
  const coveredStories = coverage.stories.filter((story) => story.status === "covered");
  const declaredStoryTargetStateIds = uniqueOrdered(
    descriptor.stories.flatMap((story) =>
      story.expectedState === undefined ? ([] as ReadonlyArray<string>) : [story.expectedState],
    ),
  );
  const coveredStoryTargetStateIds = uniqueOrdered(
    coveredStories.flatMap((story) =>
      story.story.expectedState === undefined
        ? ([] as ReadonlyArray<string>)
        : [story.story.expectedState],
    ),
  );
  const guardPassEvidence = coveredStories.flatMap((story) =>
    collectGuardPassEvidence(descriptor.machine, story.story),
  );

  return Object.freeze({
    coveredStateIds: Object.freeze(coverage.coveredStates.map((state) => state.id)),
    uncoveredStateIds: Object.freeze(coverage.uncoveredStates.map((state) => state.id)),
    coveredStoryTargetStateIds,
    unprovedStoryTargetStateIds: Object.freeze(
      declaredStoryTargetStateIds.filter(
        (stateId) => !coveredStoryTargetStateIds.includes(stateId),
      ),
    ),
    coveredTransitions: Object.freeze(
      coverage.coveredTransitions.map((transition) =>
        describeCoveredTransition(transition, guardPassEvidence),
      ),
    ),
    uncoveredTransitions: Object.freeze(coverage.uncoveredTransitions.map(describeTransition)),
    coveredReceiptTypes: uniqueOrdered(
      coveredStories.flatMap(
        (story) => story.story.expectedFacts?.receiptTypes ?? ([] as ReadonlyArray<string>),
      ),
    ),
    coveredRelatedIds: uniqueOrdered(
      coveredStories.flatMap(
        (story) => story.story.expectedFacts?.relatedIds ?? ([] as ReadonlyArray<string>),
      ),
    ),
    coveredIssueKinds: uniqueOrdered(
      coveredStories.flatMap((story) => story.issueKinds as ReadonlyArray<string>),
    ),
    coveredIssueSources: uniqueOrdered(
      coveredStories.flatMap((story) => story.issueSources as ReadonlyArray<string>),
    ),
    coveredOutcomeKinds: uniqueOrdered(
      coveredStories.flatMap((story) => story.outcomeKinds as ReadonlyArray<string>),
    ),
    coveredOutcomeSources: uniqueOrdered(
      coveredStories.flatMap((story) => story.outcomeSources as ReadonlyArray<string>),
    ),
    blockedStories: Object.freeze(
      coverage.stories
        .filter((story) => story.status === "blocked")
        .map(
          (story) =>
            `${story.story.id} (${descriptor.machine.id}): ${story.reason ?? "blocked"}${formatStoryLaneSummary(descriptor.machine, story.story)}; expected receipts ${commaList(story.story.expectedFacts?.receiptTypes ?? [])}; related ids ${commaList(story.story.expectedFacts?.relatedIds ?? [])}; outcomes ${commaList(story.story.expectedFacts?.outcomeKinds ?? [])}`,
        ),
    ),
    mismatchStories: Object.freeze(
      coverage.stories
        .filter((story) => story.status === "mismatch")
        .map(
          (story) =>
            `${story.story.id} (${descriptor.machine.id}): ${story.reason ?? "mismatch"}; expected final state ${story.story.expectedState ?? "none"}; expected receipts ${commaList(story.story.expectedFacts?.receiptTypes ?? [])}; related ids ${commaList(story.story.expectedFacts?.relatedIds ?? [])}; outcomes ${commaList(story.story.expectedFacts?.outcomeKinds ?? [])}`,
        ),
    ),
  });
}

function formatStoryLaneSummary<Machine extends AnyFlowMachine>(
  machine: Machine,
  story: FlowStory<Machine>,
): string {
  if (story.start?.kind === "setup") {
    return "";
  }

  let snapshot =
    story.start?.kind === "snapshot" ? story.start.snapshot : machine.getInitialSnapshot();

  for (const event of story.events) {
    const inspection = inspectTransition(machine, snapshot, event);

    if (!inspection.matched) {
      const explanation = whyNoTransition(machine, snapshot, event);

      return explanation === undefined ? "" : `; lane ${formatNoTransitionSummary(explanation)}`;
    }

    snapshot = inspection.nextSnapshot;
  }

  return "";
}

function collectGuardPassEvidence<Machine extends AnyFlowMachine>(
  machine: Machine,
  story: FlowStory<Machine>,
): ReadonlyArray<GuardPassEvidence> {
  if (story.start?.kind === "setup") {
    return Object.freeze([]);
  }

  let snapshot =
    story.start?.kind === "snapshot" ? story.start.snapshot : machine.getInitialSnapshot();
  const evidence: Array<GuardPassEvidence> = [];

  for (const event of story.events) {
    const inspection = inspectTransition(machine, snapshot, event);
    const chosen =
      inspection.chosen === undefined
        ? undefined
        : inspection.candidates.find((candidate) => candidate.index === inspection.chosen?.index);

    if (chosen?.guard === "pass") {
      const transitionId = `${snapshot.value}:${event.type}:${chosen.index}`;

      evidence.push(
        Object.freeze({
          transitionId,
          storyId: story.id,
        }),
      );
    }

    if (!inspection.matched) {
      break;
    }

    snapshot = inspection.nextSnapshot;
  }

  return Object.freeze(evidence);
}

function describeCoveredTransition(
  transition: FlowBehaviorMachine["transitions"][number],
  guardPassEvidence: ReadonlyArray<GuardPassEvidence>,
): string {
  const demonstratedBy = uniqueOrdered(
    guardPassEvidence
      .filter((evidence) => evidence.transitionId === transition.id)
      .map((evidence) => evidence.storyId),
  );

  return demonstratedBy.length === 0
    ? describeTransition(transition)
    : `${describeTransition(transition)} guard pass via ${commaList(demonstratedBy)}`;
}

function viewSourceEvidence(
  machineCoverage: ReadonlyArray<MachineCoverageSummary>,
): Readonly<Record<ViewSourceKind, boolean>> {
  const hasCovered = (pick: (coverage: MachineCoverageSummary) => boolean): boolean =>
    machineCoverage.some(pick);

  return Object.freeze({
    context: hasCovered((coverage) => coverage.coveredStateIds.length > 0),
    resources: hasCovered((coverage) => coverage.coveredResourceQueryLifecycleIds.length > 0),
    transactions: hasCovered((coverage) => coverage.coveredTransactionOutcomeIds.length > 0),
    streams: hasCovered((coverage) => coverage.coveredStreamLifecycleIds.length > 0),
    timers: false,
    children: hasCovered((coverage) => coverage.coveredChildSupervisionIds.length > 0),
    issues: hasCovered(
      (coverage) =>
        coverage.coveredIssueKinds.length > 0 || coverage.coveredIssueSources.length > 0,
    ),
    receipts: hasCovered((coverage) => coverage.coveredReceiptTypes.length > 0),
  });
}

export function renderBehaviorCoverage(
  target: FlowBehaviorBuildTarget,
  options: FlowBehaviorCoverageRenderOptions = {},
): string {
  const contract = buildBehaviorContract(target);
  const selected =
    options.moduleId === undefined ? contract : sliceBehaviorContract(contract, options.moduleId);
  const storyDescriptors = mergeStoryDescriptors(target);
  const appMachines = collectAppMachines(target);
  const machineCoverage = selected.machines.map((machine) => {
    const descriptor = storyDescriptors.get(machine.id);
    const summary =
      descriptor === undefined
        ? {
            coveredStateIds: Object.freeze([]),
            uncoveredStateIds: Object.freeze(machine.states.map((state) => state.id)),
            coveredStoryTargetStateIds: Object.freeze([]),
            unprovedStoryTargetStateIds: Object.freeze([]),
            coveredTransitions: Object.freeze([]),
            uncoveredTransitions: Object.freeze(machine.transitions.map(describeTransition)),
            coveredReceiptTypes: Object.freeze([]),
            coveredRelatedIds: Object.freeze([]),
            coveredIssueKinds: Object.freeze([]),
            coveredIssueSources: Object.freeze([]),
            coveredOutcomeKinds: Object.freeze([]),
            coveredOutcomeSources: Object.freeze([]),
            blockedStories: Object.freeze([]),
            mismatchStories: Object.freeze([]),
          }
        : summarizeStoryCoverage(descriptor);
    const errorPathStateIds = deriveErrorPathStateIds(target, machine);
    const transactionOutcomeIds = transactionOutcomeObligationIds(
      collectModuleTransactions(target, machine.moduleId),
    );
    const coveredTransactionOutcomeEvidence =
      descriptor === undefined ? Object.freeze([]) : coveredStoryTransactionOutcomeIds(descriptor);
    const childCoverage = childSupervisionCoverageIds(
      appMachines.get(machine.id),
      summary.coveredStateIds,
      summary.uncoveredStateIds,
    );
    const resourceQueryCoverage = resourceQueryLifecycleCoverageIds(
      appMachines.get(machine.id),
      summary.coveredStateIds,
      summary.uncoveredStateIds,
    );
    const streamCoverage = streamLifecycleCoverageIds(
      appMachines.get(machine.id),
      summary.coveredStateIds,
      summary.uncoveredStateIds,
    );

    return Object.freeze({
      machine,
      ...summary,
      coveredErrorPathStateIds: Object.freeze(
        errorPathStateIds.filter((stateId) => summary.coveredStateIds.includes(stateId)),
      ),
      unprovedErrorPathStateIds: Object.freeze(
        errorPathStateIds.filter((stateId) => summary.uncoveredStateIds.includes(stateId)),
      ),
      coveredTransactionOutcomeIds: Object.freeze(
        transactionOutcomeIds.filter((outcomeId) =>
          coveredTransactionOutcomeEvidence.includes(outcomeId),
        ),
      ),
      unprovedTransactionOutcomeIds: Object.freeze(
        transactionOutcomeIds.filter(
          (outcomeId) => !coveredTransactionOutcomeEvidence.includes(outcomeId),
        ),
      ),
      ...childCoverage,
      ...resourceQueryCoverage,
      ...streamCoverage,
    });
  });
  const blockedStories = machineCoverage.flatMap((coverage) => coverage.blockedStories);
  const mismatchStories = machineCoverage.flatMap((coverage) => coverage.mismatchStories);
  const sourceEvidence = viewSourceEvidence(machineCoverage);
  const viewCoverage = selected.views.map((view) => {
    const coveredSourceKinds = Object.freeze(
      view.sources.filter((sourceKind) => sourceEvidence[sourceKind]),
    );
    const missingSourceKinds = Object.freeze(
      view.sources.filter((sourceKind) => !sourceEvidence[sourceKind]),
    );

    return Object.freeze({
      view,
      coveredSourceKinds,
      missingSourceKinds,
    });
  });
  const nonEmpty = <Value>(values: ReadonlyArray<Value>) => values.length > 0;
  const coverageLines = machineCoverage.flatMap((coverage) => {
    const parts = [
      ...(nonEmpty(coverage.coveredStateIds)
        ? [`states=${coverage.coveredStateIds.join(",")}`]
        : []),
      ...(nonEmpty(coverage.coveredTransitions)
        ? [`transitions=${coverage.coveredTransitions.length}`]
        : []),
      ...(nonEmpty(coverage.coveredChildSupervisionIds)
        ? [`children=${coverage.coveredChildSupervisionIds.length}`]
        : []),
      ...(nonEmpty(coverage.coveredResourceQueryLifecycleIds)
        ? [`resources=${coverage.coveredResourceQueryLifecycleIds.length}`]
        : []),
      ...(nonEmpty(coverage.coveredStreamLifecycleIds)
        ? [`streams=${coverage.coveredStreamLifecycleIds.length}`]
        : []),
    ];
    return parts.length === 0 ? [] : [`  ${coverage.machine.id}: ${parts.join("; ")}`];
  });
  const gapLines = machineCoverage.flatMap((coverage) => {
    const parts = [
      ...(nonEmpty(coverage.uncoveredStateIds)
        ? [`states=${coverage.uncoveredStateIds.join(",")}`]
        : []),
      ...(nonEmpty(coverage.unprovedErrorPathStateIds)
        ? [`errorStates=${coverage.unprovedErrorPathStateIds.join(",")}`]
        : []),
      ...(nonEmpty(coverage.unprovedTransactionOutcomeIds)
        ? [`transactions=${coverage.unprovedTransactionOutcomeIds.join(",")}`]
        : []),
      ...(nonEmpty(coverage.unprovedChildSupervisionIds)
        ? [`children=${coverage.unprovedChildSupervisionIds.join(",")}`]
        : []),
      ...(nonEmpty(coverage.unprovedResourceQueryLifecycleIds)
        ? [`resources=${coverage.unprovedResourceQueryLifecycleIds.join(",")}`]
        : []),
      ...(nonEmpty(coverage.unprovedStreamLifecycleIds)
        ? [`streams=${coverage.unprovedStreamLifecycleIds.join(",")}`]
        : []),
    ];
    return parts.length === 0 ? [] : [`  ${coverage.machine.id}: ${parts.join("; ")}`];
  });
  const noCoveredStates = machineCoverage
    .filter((coverage) => coverage.coveredStateIds.length === 0)
    .map((coverage) => coverage.machine.id);
  const compact = [
    `behavior.coverage ${target.app.label} — ${contract.stories.length} stories`,
    `scope: ${options.moduleId === undefined ? "app" : `module ${options.moduleId}`}; curated story coverage, not execution proof`,
    ...(coverageLines.length === 0 ? [] : ["covered:", ...coverageLines]),
    ...(gapLines.length === 0 ? [] : ["unproved:", ...gapLines]),
    ...(noCoveredStates.length === 0
      ? []
      : [`machines with no covered states: ${noCoveredStates.join(", ")}`]),
    ...(blockedStories.length === 0
      ? []
      : [`blocked stories: ${blockedStories.map((story) => story.split(";")[0]).join("; ")}`]),
    ...(mismatchStories.length === 0
      ? []
      : [`mismatch stories: ${mismatchStories.map((story) => story.split(";")[0]).join("; ")}`]),
    ...(viewCoverage.every((coverage) => coverage.missingSourceKinds.length === 0)
      ? []
      : [
          `unproved views: ${viewCoverage
            .filter((coverage) => coverage.missingSourceKinds.length > 0)
            .map((coverage) => `${coverage.view.id}(${coverage.missingSourceKinds.join(",")})`)
            .join("; ")}`,
        ]),
  ].join("\n");

  return compact;
}
