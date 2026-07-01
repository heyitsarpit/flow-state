import type {
  FlowGraphDescriptor,
  FlowGraphPath,
  FlowMachine,
  FlowStoriesDescriptor,
  FlowStory,
  FlowStoryCoverageDescriptor,
  FlowStoryCoverageStory,
  FlowIssueSummary,
  FlowTraceOutcomeKind,
  FlowTraceOutcomeSource,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "./public/types.js";

type StoryState<Machine extends FlowMachine> = InferMachineState<Machine>;
type StoryPath<Machine extends FlowMachine> = FlowGraphPath<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>
>;
type StorySnapshot<Machine extends FlowMachine> = StoryPath<Machine>["state"];

function isStoriesDescriptor<Machine extends FlowMachine>(
  value: FlowStoriesDescriptor<Machine> | ReadonlyArray<FlowStory<Machine>>,
): value is FlowStoriesDescriptor<Machine> {
  return !Array.isArray(value);
}

function normalizeStories<Machine extends FlowMachine>(
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

function transitionIdsForStory<Machine extends FlowMachine>(
  graph: FlowGraphDescriptor<Machine>,
  storyCoverage: Pick<FlowStoryCoverageStory<Machine>, "path" | "startState" | "status">,
): ReadonlyArray<string> {
  if (
    storyCoverage.path === undefined ||
    storyCoverage.startState === undefined ||
    storyCoverage.status === "blocked"
  ) {
    return Object.freeze([]);
  }

  const ids: Array<string> = [];
  let currentState = storyCoverage.startState;

  for (const step of storyCoverage.path.steps) {
    const edge = graph.edges.find(
      (candidate) =>
        candidate.source === currentState &&
        candidate.target === step.state.value &&
        candidate.eventType === step.event.type,
    );

    if (edge !== undefined) {
      ids.push(edge.id);
    }

    currentState = step.state.value;
  }

  return Object.freeze(ids);
}

function stateIdsForStory<Machine extends FlowMachine>(
  storyCoverage: Pick<FlowStoryCoverageStory<Machine>, "path" | "startState" | "status">,
): ReadonlyArray<FlowStoryCoverageStory<Machine>["stateIds"][number]> {
  if (
    storyCoverage.path === undefined ||
    storyCoverage.startState === undefined ||
    storyCoverage.status === "blocked"
  ) {
    return Object.freeze([]);
  }

  return uniqueValues(
    Object.freeze([
      storyCoverage.startState,
      ...storyCoverage.path.steps.map((step) => step.state.value as StoryState<Machine>),
    ]),
  );
}

function lanesForStory<Machine extends FlowMachine>(story: FlowStory<Machine>) {
  return Object.freeze({
    issueKinds: Object.freeze([...(story.expectedFacts?.issueKinds ?? [])]),
    issueSources: Object.freeze([...(story.expectedFacts?.issueSources ?? [])]),
    outcomeKinds: Object.freeze([...(story.expectedFacts?.outcomeKinds ?? [])]),
    outcomeSources: Object.freeze([...(story.expectedFacts?.outcomeSources ?? [])]),
  });
}

function describeStoryCoverage<Machine extends FlowMachine>(
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
  const snapshotStart =
    story.start?.kind === "snapshot" ? (story.start.snapshot as StorySnapshot<Machine>) : undefined;
  const path =
    snapshotStart !== undefined
      ? graph.pathFromEvents(story.events, {
          fromState: snapshotStart,
        })
      : graph.pathFromEvents(story.events);

  if (path === undefined) {
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

  const base = Object.freeze({
    story,
    startState,
    finalState: path.state.value as StoryState<Machine>,
    path: path as StoryPath<Machine>,
  });
  const mismatch = story.expectedState !== undefined && path.state.value !== story.expectedState;

  if (mismatch) {
    return Object.freeze({
      ...base,
      status: "mismatch" as const,
      stateIds: stateIdsForStory({
        ...base,
        status: "mismatch",
      }),
      transitionIds: transitionIdsForStory(graph, {
        ...base,
        status: "mismatch",
      }),
      ...lanes,
      reason: "expected-state-mismatch" as const,
    });
  }

  return Object.freeze({
    ...base,
    status: "covered" as const,
    stateIds: stateIdsForStory({
      ...base,
      status: "covered",
    }),
    transitionIds: transitionIdsForStory(graph, {
      ...base,
      status: "covered",
    }),
    ...lanes,
  });
}

function nodesForIds<Machine extends FlowMachine>(
  nodes: FlowGraphDescriptor<Machine>["nodes"],
  ids: ReadonlyArray<FlowGraphDescriptor<Machine>["nodes"][number]["id"]>,
): ReadonlyArray<FlowGraphDescriptor<Machine>["nodes"][number]> {
  const covered = new Set(ids);
  return Object.freeze(nodes.filter((node) => covered.has(node.id)));
}

function edgesForIds<Machine extends FlowMachine>(
  edges: FlowGraphDescriptor<Machine>["edges"],
  ids: ReadonlyArray<string>,
): ReadonlyArray<FlowGraphDescriptor<Machine>["edges"][number]> {
  const covered = new Set(ids);
  return Object.freeze(edges.filter((edge) => covered.has(edge.id)));
}

function countStories<Machine extends FlowMachine>(
  stories: ReadonlyArray<FlowStoryCoverageStory<Machine>>,
  status: FlowStoryCoverageStory<Machine>["status"],
): number {
  return stories.filter((story) => story.status === status).length;
}

export function createStoryCoverage<Machine extends FlowMachine>(
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
