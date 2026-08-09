import inventory from "./export-inventory.json" with { type: "json" };

const rootSurvivors = new Set([
  "app",
  "can",
  "child",
  "machine",
  "module",
  "resource",
  "runtime",
  "stream",
  "transaction",
  "view",
  "FlowIssue",
]);
const reactSurvivors = new Set(["FlowProvider", "FlowProviderProps", "useActor", "useView"]);
const inspectSurvivors = new Set([
  "analyzeTrace",
  "attachInspectionSink",
  "buildBehaviorContract",
  "compressTraceArtifact",
  "createInspectionBufferSink",
  "decompressTraceArtifact",
  "diffBehaviorContracts",
  "diffTrace",
  "exportTraceArtifact",
  "formatInspectionEvent",
  "formatInspectionTimeline",
  "formatNoTransitionSummary",
  "formatRehydrationSummary",
  "formatResourceFreshnessReport",
  "formatTrace",
  "formatTransactionOverlapSummary",
  "graphOf",
  "importTraceArtifact",
  "inspectMicrosteps",
  "inspectTransition",
  "renderBehaviorContract",
  "renderBehaviorCoverage",
  "renderBehaviorDiff",
  "sliceBehaviorContract",
  "summarizeTrace",
  "whyNoTransition",
]);
const serverSurvivors = new Set(["withRequestRuntime"]);
const cliDeleted = new Set([
  "behaviorDiffMode",
  "FlowCliBehaviorDiffMode",
  "FlowCliBehaviorDiffOptions",
  "contextualizedTraceSummaryProjection",
  "createStoryPathCheckEnvelope",
  "createStoryPathListEnvelope",
  "formatStoryPathCheckText",
  "formatStoryPathListText",
  "normalizeStoryPathRequest",
  "FlowCliPathSummary",
  "FlowCliStoryPathCheckEnvelope",
  "FlowCliStoryPathListEnvelope",
  "FlowCliStoryPathRequest",
  "FlowCliStoryPathStrategy",
  "FlowCliStoryDescribeEnvelope",
  "FlowCliStoryListEnvelope",
  "FlowCliStoryReadEntry",
  "FlowCliStorySeedDescriptor",
  "createMachineRegistry",
  "createStoryRegistry",
  "FlowCliStoryRegistry",
  "FlowCliStoryRegistryEntry",
  "createScenarioEnvelope",
  "formatScenarioCompact",
  "formatScenarioPretty",
  "FlowCliScenarioEnvelope",
  "FlowCliTraceDiffEnvelope",
  "FlowCliTraceDiffSectionEnvelope",
  "FlowCliNormalizedTraceInput",
  "FlowCliNormalizedTraceProofInput",
  "FlowCliTraceInputSource",
  "FlowCliProofSelectionError",
  "createBehaviorCoverageEnvelope",
  "createTraceContextualizedSummaryEnvelope",
  "formatTraceContextualizedSummaryText",
  "FlowCliBehaviorCoverageEnvelope",
  "FlowCliTraceContextualizedSummaryEnvelope",
  "FlowCliTraceProofEnvelope",
  "FlowCliTraceProofSelector",
  "FlowCliTraceSummaryEnvelope",
]);

function rows(route, exports, survivorSet) {
  return [
    ...exports.values.map((name) => ({
      route,
      kind: "value",
      name,
      disposition: survivorSet.has(name) ? "change" : "delete",
    })),
    ...exports.types.map((name) => ({
      route,
      kind: "type",
      name,
      disposition: survivorSet.has(name) ? "change" : "delete",
    })),
  ].sort((left, right) => `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`));
}

const packageRoutes = [
  ...rows(".", inventory.routes["."], rootSurvivors),
  ...rows("./react", inventory.routes["./react"], reactSurvivors),
  ...rows("./testing", inventory.routes["./testing"], new Set()),
  ...rows("./server", inventory.routes["./server"], serverSurvivors),
  ...rows("./inspect", inventory.routes["./inspect"], inspectSurvivors),
];

const cliModules = Object.entries(inventory.cliModules).flatMap(([file, exports]) => [
  ...exports.values.map((name) => ({
    file,
    kind: "value",
    name,
    disposition: cliDeleted.has(name) ? "delete" : "change",
  })),
  ...exports.types.map((name) => ({
    file,
    kind: "type",
    name,
    disposition: cliDeleted.has(name) ? "delete" : "change",
  })),
]);

const additions = {
  ".": [
    "definition",
    "decodeRuntimeBoot",
    "FlowBootDecodeError",
    "FlowDehydrateError",
    "tag",
    "Definition",
    "Machine",
    "Resource",
    "ResourceRef",
    "ResourceSnapshot",
    "Transaction",
    "TransactionRef",
    "TransactionSnapshot",
    "View",
    "Module",
    "App",
    "Runtime",
    "Actor",
    "ActorSnapshot",
    "CanonicalKeyInput",
    "Tag",
    "InvalidationTarget",
    "RuntimeBootPayload",
  ],
  "./testing": ["behavior", "control", "fixture", "model", "story", "FlowStoryExecutionError"],
  "./inspect": ["inspectActivities"],
};

process.stdout.write(`${JSON.stringify({ packageRoutes, cliModules, additions }, null, 2)}\n`);
