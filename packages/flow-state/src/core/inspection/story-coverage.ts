import type {
  AnyFlowMachine,
  FlowGraphDescriptor,
  FlowStoriesDescriptor,
  FlowStory,
  FlowStoryCoverageDescriptor,
  FlowStoryCoverageStory,
  FlowIssueSummary,
  FlowTraceOutcomeKind,
  FlowTraceOutcomeSource,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";

type StoryState<Machine extends AnyFlowMachine> = InferMachineState<Machine>;

function isStoriesDescriptor<Machine extends AnyFlowMachine>(
  value: FlowStoriesDescriptor<Machine> | ReadonlyArray<FlowStory<Machine>>,
): value is FlowStoriesDescriptor<Machine> {
  return !Array.isArray(value);
}

function normalizeStories<Machine extends AnyFlowMachine>(
  stories: FlowStoriesDescriptor<Machine> | ReadonlyArray<FlowStory<Machine>>,
): ReadonlyArray<FlowStory<Machine>> {
  if (isStoriesDescriptor(stories)) {
    return stories.stories;
  }

  return stories;
}

function uniqueValues<Value>(values: ReadonlyArray<Value>): ReadonlyArray<Value> {
  const seen = new Set<Value>();
  const ordered: Array<Value> = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    ordered.push(value);
  }

  return Object.freeze(ordered);
}

function hasDynamicSelection<Machine extends AnyFlowMachine>(
  graph: FlowGraphDescriptor<Machine>,
  state: StoryState<Machine>,
  eventType: string,
): boolean {
  const node = graph.machine.config.states[state];
  const configured = node?.on?.[eventType as InferMachineEvent<Machine>["type"]];
  const transitions =
    configured === undefined ? [] : Array.isArray(configured) ? configured : [configured];
  return transitions.some(
    (transition) =>
      typeof transition !== "string" && transition !== undefined && transition.guard !== undefined,
  );
}

function hasEventlessSelection<Machine extends AnyFlowMachine>(
  graph: FlowGraphDescriptor<Machine>,
  state: StoryState<Machine>,
): boolean {
  return graph.machine.config.states[state]?.always !== undefined;
}

function lanesForStory<Machine extends AnyFlowMachine>(story: FlowStory<Machine>) {
  return Object.freeze({
    issueKinds: Object.freeze([...(story.expectedFacts?.issueKinds ?? [])]),
    issueSources: Object.freeze([...(story.expectedFacts?.issueSources ?? [])]),
    outcomeKinds: Object.freeze([...(story.expectedFacts?.outcomeKinds ?? [])]),
    outcomeSources: Object.freeze([...(story.expectedFacts?.outcomeSources ?? [])]),
  });
}

function describeStoryCoverage<Machine extends AnyFlowMachine>(
  graph: FlowGraphDescriptor<Machine>,
  story: FlowStory<Machine>,
): FlowStoryCoverageStory<Machine> {
  const lanes = lanesForStory(story);

  if (story.start?.kind === "setup") {
    return Object.freeze({
      story,
      status: "blocked" as const,
      stateIds: Object.freeze([]),
      transitionIds: Object.freeze([]),
      ...lanes,
      reason: "setup-description" as const,
    });
  }

  const startState =
    story.start?.kind === "snapshot"
      ? (story.start.snapshot.value as StoryState<Machine>)
      : (graph.initial as StoryState<Machine>);
  let currentState = startState;
  const stateIds: Array<StoryState<Machine>> = [startState];
  const transitionIds: Array<string> = [];

  for (const event of story.events) {
    const candidates = graph.edges.filter(
      (edge) => edge.source === currentState && edge.eventType === event.type,
    );
    if (candidates.length === 0) {
      return Object.freeze({
        story,
        status: "blocked" as const,
        startState,
        stateIds: Object.freeze([]),
        transitionIds: Object.freeze([]),
        ...lanes,
        reason: "path-not-found" as const,
      });
    }
    if (hasDynamicSelection(graph, currentState, event.type)) {
      return Object.freeze({
        story,
        status: "blocked" as const,
        startState,
        stateIds: Object.freeze([]),
        transitionIds: Object.freeze([]),
        ...lanes,
        reason: "dynamic-transition" as const,
      });
    }
    const chosen = candidates[0];
    if (chosen === undefined) {
      throw new Error("Flow graph edge selection invariant failed");
    }
    currentState = chosen.target as StoryState<Machine>;
    transitionIds.push(chosen.id);
    stateIds.push(currentState);
    if (hasEventlessSelection(graph, currentState)) {
      return Object.freeze({
        story,
        status: "blocked" as const,
        startState,
        stateIds: Object.freeze([]),
        transitionIds: Object.freeze([]),
        ...lanes,
        reason: "dynamic-transition" as const,
      });
    }
  }

  const base = Object.freeze({
    story,
    startState,
    finalState: currentState,
    stateIds: uniqueValues(stateIds),
    transitionIds: uniqueValues(transitionIds),
  });
  const mismatch = story.expectedState !== undefined && currentState !== story.expectedState;

  if (mismatch) {
    return Object.freeze({
      ...base,
      status: "mismatch" as const,
      ...lanes,
      reason: "expected-state-mismatch" as const,
    });
  }

  return Object.freeze({
    ...base,
    status: "covered" as const,
    ...lanes,
  });
}

function nodesForIds<Machine extends AnyFlowMachine>(
  nodes: FlowGraphDescriptor<Machine>["nodes"],
  ids: ReadonlyArray<FlowGraphDescriptor<Machine>["nodes"][number]["id"]>,
): ReadonlyArray<FlowGraphDescriptor<Machine>["nodes"][number]> {
  const covered = new Set(ids);
  return Object.freeze(nodes.filter((node) => covered.has(node.id)));
}

function edgesForIds<Machine extends AnyFlowMachine>(
  edges: FlowGraphDescriptor<Machine>["edges"],
  ids: ReadonlyArray<string>,
): ReadonlyArray<FlowGraphDescriptor<Machine>["edges"][number]> {
  const covered = new Set(ids);
  return Object.freeze(edges.filter((edge) => covered.has(edge.id)));
}

function countStories<Machine extends AnyFlowMachine>(
  stories: ReadonlyArray<FlowStoryCoverageStory<Machine>>,
  status: FlowStoryCoverageStory<Machine>["status"],
): number {
  return stories.filter((story) => story.status === status).length;
}

export function createStoryCoverage<Machine extends AnyFlowMachine>(
  graph: FlowGraphDescriptor<Machine>,
  storiesInput: FlowStoriesDescriptor<Machine> | ReadonlyArray<FlowStory<Machine>>,
): FlowStoryCoverageDescriptor<Machine> {
  const stories = Object.freeze(
    normalizeStories(storiesInput).map((story) => describeStoryCoverage(graph, story)),
  );
  const coveredStateIds = uniqueValues(
    stories.flatMap((story) => (story.status === "blocked" ? [] : story.stateIds)),
  );
  const coveredTransitionIds = uniqueValues(
    stories.flatMap((story) => (story.status === "blocked" ? [] : story.transitionIds)),
  );
  const coveredStates = nodesForIds(graph.nodes, coveredStateIds);
  const coveredTransitions = edgesForIds(graph.edges, coveredTransitionIds);
  const uncoveredStates = Object.freeze(
    graph.nodes.filter((node) => !coveredStateIds.includes(node.id)),
  );
  const uncoveredTransitions = Object.freeze(
    graph.edges.filter((edge) => !coveredTransitionIds.includes(edge.id)),
  );
  const coveredIssueKinds = uniqueValues(stories.flatMap((story) => story.issueKinds));
  const coveredIssueSources = uniqueValues(stories.flatMap((story) => story.issueSources));
  const coveredOutcomeKinds = uniqueValues(
    stories.flatMap((story) => story.outcomeKinds) as ReadonlyArray<FlowTraceOutcomeKind>,
  );
  const coveredOutcomeSources = uniqueValues(
    stories.flatMap((story) => story.outcomeSources) as ReadonlyArray<FlowTraceOutcomeSource>,
  );

  return Object.freeze({
    kind: "story-coverage" as const,
    graph,
    stories,
    coveredStates,
    uncoveredStates,
    coveredTransitions,
    uncoveredTransitions,
    coveredIssueKinds: coveredIssueKinds as ReadonlyArray<FlowIssueSummary["kind"]>,
    coveredIssueSources: coveredIssueSources as ReadonlyArray<FlowIssueSummary["source"]>,
    coveredOutcomeKinds,
    coveredOutcomeSources,
    summary: Object.freeze({
      totalStories: stories.length,
      coveredStories: countStories(stories, "covered"),
      mismatchStories: countStories(stories, "mismatch"),
      blockedStories: countStories(stories, "blocked"),
      coveredStateCount: coveredStates.length,
      uncoveredStateCount: uncoveredStates.length,
      coveredTransitionCount: coveredTransitions.length,
      uncoveredTransitionCount: uncoveredTransitions.length,
    }),
  });
}
