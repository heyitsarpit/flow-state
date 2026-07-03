import type { AnyFlowMachine, FlowStory, FlowStoriesDescriptor } from "../api/types.js";
import type { FlowBehaviorBuildTarget, FlowBehaviorMachine } from "./behavior-contract.js";

import { buildBehaviorContract, sliceBehaviorContract } from "./behavior-contract.js";
import {
  formatNoTransitionSummary,
  graphOf,
  inspectTransition,
  whyNoTransition,
} from "./inspect.js";

export type FlowBehaviorCoverageRenderOptions = Readonly<{
  moduleId?: string;
}>;

type MachineCoverageSummary = Readonly<{
  machine: FlowBehaviorMachine;
  coveredStateIds: ReadonlyArray<string>;
  uncoveredStateIds: ReadonlyArray<string>;
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
type MachineCoverageCore = Omit<MachineCoverageSummary, "machine">;
type GuardPassEvidence = Readonly<{
  transitionId: string;
  storyId: string;
}>;

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

function describeState(state: FlowBehaviorMachine["states"][number]): string {
  return state.terminal ? `${state.id} (final)` : state.id;
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

function summarizeStoryCoverage<Machine extends AnyFlowMachine>(
  descriptor: FlowStoriesDescriptor<Machine>,
): MachineCoverageCore {
  const graph = graphOf(descriptor.machine);
  const coverage = graph.storyCoverage(descriptor);
  const coveredStories = coverage.stories.filter((story) => story.status === "covered");
  const guardPassEvidence = coveredStories.flatMap((story) =>
    collectGuardPassEvidence(descriptor.machine, story.story),
  );

  return Object.freeze({
    coveredStateIds: Object.freeze(coverage.coveredStates.map((state) => state.id)),
    uncoveredStateIds: Object.freeze(coverage.uncoveredStates.map((state) => state.id)),
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

function renderMachineCoverageSection(
  title: string,
  machines: ReadonlyArray<MachineCoverageSummary>,
  renderLine: (coverage: MachineCoverageSummary) => string,
): Array<string> {
  return [title, "", ...(machines.length === 0 ? ["(no machines)"] : machines.map(renderLine)), ""];
}

export function renderBehaviorCoverage(
  target: FlowBehaviorBuildTarget,
  options: FlowBehaviorCoverageRenderOptions = {},
): string {
  const contract = buildBehaviorContract(target);
  const selected =
    options.moduleId === undefined ? contract : sliceBehaviorContract(contract, options.moduleId);
  const storyDescriptors = mergeStoryDescriptors(target);
  const machineCoverage = selected.machines.map((machine) => {
    const descriptor = storyDescriptors.get(machine.id);
    const summary =
      descriptor === undefined
        ? {
            coveredStateIds: Object.freeze([]),
            uncoveredStateIds: Object.freeze(machine.states.map((state) => state.id)),
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

    return Object.freeze({
      machine,
      ...summary,
    });
  });
  const blockedStories = machineCoverage.flatMap((coverage) => coverage.blockedStories);
  const mismatchStories = machineCoverage.flatMap((coverage) => coverage.mismatchStories);
  const coveredIssueKinds = uniqueOrdered(
    machineCoverage.flatMap((coverage) => coverage.coveredIssueKinds),
  );
  const coveredReceiptTypes = uniqueOrdered(
    machineCoverage.flatMap((coverage) => coverage.coveredReceiptTypes),
  );
  const coveredRelatedIds = uniqueOrdered(
    machineCoverage.flatMap((coverage) => coverage.coveredRelatedIds),
  );
  const coveredIssueSources = uniqueOrdered(
    machineCoverage.flatMap((coverage) => coverage.coveredIssueSources),
  );
  const coveredOutcomeKinds = uniqueOrdered(
    machineCoverage.flatMap((coverage) => coverage.coveredOutcomeKinds),
  );
  const coveredOutcomeSources = uniqueOrdered(
    machineCoverage.flatMap((coverage) => coverage.coveredOutcomeSources),
  );
  const title =
    options.moduleId === undefined
      ? `# ${contract.app.id} Coverage`
      : `# ${contract.app.id} Coverage (module slice: ${options.moduleId})`;
  const scope =
    options.moduleId === undefined
      ? `Scope: app ${contract.app.id}.`
      : `Scope: module ${options.moduleId} within app ${contract.app.id}.`;

  return [
    title,
    "",
    "## Coverage Scope Note",
    "",
    `- ${scope}`,
    "- Coverage basis: live gateway stories plus `graph.storyCoverage(...)`; the canonical JSON remains the only committed artifact.",
    "- Honesty note: this is story coverage over curated stories, not proof of full behavioral coverage.",
    "- Covered issue and outcome lanes below come from fully covered stories only; blocked and mismatch stories remain listed as holes.",
    `- Covered-story receipt types: ${commaList(coveredReceiptTypes)}`,
    `- Covered-story related ids: ${commaList(coveredRelatedIds)}`,
    "",
    ...renderMachineCoverageSection("## Covered States By Machine", machineCoverage, (coverage) => {
      const states = coverage.machine.states
        .filter((state) => coverage.coveredStateIds.includes(state.id))
        .map(describeState);
      return `- ${coverage.machine.id}: ${commaList(states)}`;
    }),
    ...renderMachineCoverageSection(
      "## Uncovered States By Machine",
      machineCoverage,
      (coverage) => {
        const states = coverage.machine.states
          .filter((state) => coverage.uncoveredStateIds.includes(state.id))
          .map(describeState);
        return `- ${coverage.machine.id}: ${commaList(states)}`;
      },
    ),
    ...renderMachineCoverageSection(
      "## Covered Transitions By Machine",
      machineCoverage,
      (coverage) => `- ${coverage.machine.id}: ${commaList(coverage.coveredTransitions)}`,
    ),
    ...renderMachineCoverageSection(
      "## Uncovered Transitions By Machine",
      machineCoverage,
      (coverage) => `- ${coverage.machine.id}: ${commaList(coverage.uncoveredTransitions)}`,
    ),
    "## Covered Issue Lanes",
    "",
    `- Kinds: ${commaList(coveredIssueKinds)}`,
    `- Sources: ${commaList(coveredIssueSources)}`,
    "",
    "## Covered Outcome Lanes",
    "",
    `- Kinds: ${commaList(coveredOutcomeKinds)}`,
    `- Sources: ${commaList(coveredOutcomeSources)}`,
    "",
    "## Blocked Stories",
    "",
    ...(blockedStories.length === 0 ? ["(none)"] : blockedStories.map((story) => `- ${story}`)),
    "",
    "## Mismatch Stories",
    "",
    ...(mismatchStories.length === 0 ? ["(none)"] : mismatchStories.map((story) => `- ${story}`)),
  ].join("\n");
}
