import { describe, expect, it } from "vite-plus/test";

const entrypointSources = {
  ...(import.meta.glob("./{index,inspect,server,testing}.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("./react-entry.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

const nestedSources = import.meta.glob(
  "./{core,descriptors,public,react,runtime,services,testing}/**/*.ts",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

const sourceModules = {
  ...entrypointSources,
  ...nestedSources,
};

function requireSource(path: string): string {
  const source = sourceModules[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path} source module`);
  }

  return source;
}

describe("public typing architecture", () => {
  it("keeps provider and runtime entrypoints free of explicit any erasure", () => {
    const providerSource = requireSource("./react/provider.ts");
    const publicFlowSource = requireSource("./react/flow.ts");
    const contractRuntimeSource = requireSource("./runtime/contract-runtime.ts");

    expect(providerSource).not.toContain("FlowRuntime<any, any>");
    expect(publicFlowSource).not.toContain("Layer.Layer<any, any, never>");
    expect(publicFlowSource).not.toContain("FlowTransactionDefinition<string, any");
    expect(contractRuntimeSource).not.toContain("Layer.Layer<any, any, never>");
    expect(contractRuntimeSource).not.toContain("FlowRuntime<any, any>");
  });

  it("keeps machine invoke and submit contracts free of explicit any-erased transactions", () => {
    const machineTypesSource = requireSource("./core/api/machine-types.ts");

    expect(machineTypesSource).not.toContain("FlowTransactionDefinition<string, any");
    expect(machineTypesSource).not.toContain("FlowStreamDefinition<any");
  });

  it("keeps the server entrypoint free of testing and inspect ownership", () => {
    const serverSource = requireSource("./server.ts");

    expect(serverSource).not.toContain('from "./testing/controlled-effect.js"');
    expect(serverSource).not.toContain('from "./testing/controlled-stream.js"');
    expect(serverSource).not.toContain('from "./testing/flow-test.js"');
    expect(serverSource).not.toContain("flowExperimental");
  });

  it("keeps the root entrypoint free of react, testing, inspect, and request-runtime ownership", () => {
    const rootSource = requireSource("./index.ts");

    expect(rootSource).not.toContain('from "./react/provider.js"');
    expect(rootSource).not.toContain('from "./testing/controlled-effect.js"');
    expect(rootSource).not.toContain('from "./testing/controlled-stream.js"');
    expect(rootSource).not.toContain('from "./testing/flow-test.js"');
    expect(rootSource).not.toContain('from "./public/flow.js"');
    expect(rootSource).not.toContain("flowExperimental");
    expect(rootSource).not.toContain("withRequestRuntime");
  });

  it("keeps server, inspect, and testing types off the root entrypoint", () => {
    const rootSource = requireSource("./index.ts");
    const serverSource = requireSource("./server.ts");
    const inspectSource = requireSource("./inspect.ts");
    const testingSource = requireSource("./testing.ts");
    const appTypesSource = requireSource("./public/app-types.ts");

    expect(rootSource).not.toContain("FlowRuntimeBootActorSnapshot");
    expect(rootSource).not.toContain("FlowRuntimeBootOptions");
    expect(rootSource).not.toContain("FlowRuntimeBootPayload");
    expect(rootSource).not.toContain("FlowRuntimeHydratedBoot");
    expect(rootSource).not.toContain("FlowGraphDescriptor");
    expect(rootSource).not.toContain("FlowInspectionEvent");
    expect(rootSource).not.toContain("FlowInspectionSnapshotEvent");
    expect(rootSource).not.toContain("FlowTraceAnalysisDescriptor");
    expect(rootSource).not.toContain("FlowRuntimeInspection");
    expect(rootSource).not.toContain("FlowStoriesDescriptor");
    expect(rootSource).not.toContain("FlowTraceDescriptor");
    expect(rootSource).not.toContain("FlowTraceReport");
    expect(rootSource).not.toContain("FlowModelDescriptor");
    expect(rootSource).not.toContain("FlowModelPath");
    expect(rootSource).not.toContain("FlowModelStep");
    expect(rootSource).not.toContain("FlowModelTraversalOptions");
    expect(rootSource).not.toContain("FlowTestBuilder");
    expect(rootSource).not.toContain("FlowTestHarness");

    expect(serverSource).toContain("FlowRuntimeBootPayload");
    expect(appTypesSource).not.toContain("export type FlowRuntimeInspection");
    expect(appTypesSource).not.toContain("export type FlowRehydratedTestHarness");
    expect(appTypesSource).not.toContain("export type FlowModelPath");
    expect(appTypesSource).not.toContain("export type FlowModelDescriptor");
    expect(appTypesSource).not.toContain("export type FlowModelReplayConfig");
    expect(appTypesSource).not.toContain("export type FlowModelStep");
    expect(appTypesSource).not.toContain("export type FlowModelTraversalOptions");
    expect(appTypesSource).not.toContain("export type FlowStartedTestBuilder");
    expect(appTypesSource).not.toContain("export type FlowTestCache");
    expect(appTypesSource).not.toContain("export type FlowTestBuilder");
    expect(appTypesSource).not.toContain("export type FlowTestChildTreeNode");
    expect(appTypesSource).not.toContain("export type FlowTestChildSummary");
    expect(appTypesSource).not.toContain("export type FlowTestHarness");
    expect(appTypesSource).not.toContain("export type FlowTestPendingChild");
    expect(appTypesSource).not.toContain("export type FlowTestPendingMailbox");
    expect(appTypesSource).not.toContain("export type FlowTestPendingTimer");
    expect(appTypesSource).not.toContain("export type FlowTestPendingWork");
    expect(appTypesSource).not.toContain("export type FlowTestProgressBounds");
    expect(appTypesSource).not.toContain("export type FlowStoryRunBlocked");
    expect(appTypesSource).not.toContain("export type FlowStoryRunBlockedReason");
    expect(appTypesSource).not.toContain("export type FlowStoryRunOutcome");
    expect(appTypesSource).not.toContain("export type FlowStoryRunResult");
    expect(appTypesSource).not.toContain("export type FlowStoryTestCheck");
    expect(appTypesSource).not.toContain("export type FlowStoryTestCheckKind");
    expect(appTypesSource).not.toContain("export type FlowStoryTestReport");
    expect(appTypesSource).not.toContain("export type FlowTestTimers");
    expect(appTypesSource).not.toContain("export type FlowTestTransactions");
    expect(appTypesSource).not.toContain("export type FlowStoriesDescriptor");
    expect(appTypesSource).not.toContain("export type FlowStoryCoverageDescriptor");
    expect(appTypesSource).not.toContain("export type FlowStoryCoverageReason");
    expect(appTypesSource).not.toContain("export type FlowStoryCoverageStatus");
    expect(appTypesSource).not.toContain("export type FlowStoryCoverageStory");
    expect(appTypesSource).not.toContain("export type FlowStoryCoverageSummary");
    expect(appTypesSource).not.toContain("export type FlowStoryDocDescriptor");
    expect(appTypesSource).not.toContain("export type FlowStoryDocEvent");
    expect(appTypesSource).not.toContain("export type FlowStoryDocExpectation");
    expect(appTypesSource).not.toContain("export type FlowStoryDocSeed");
    expect(appTypesSource).not.toContain("export type FlowStoryDocStart");
    expect(appTypesSource).not.toContain("export type FlowGraphDescriptor");
    expect(appTypesSource).not.toContain("export type FlowGraphPath");
    expect(appTypesSource).not.toContain("export type FlowGraphTraversalOptions");
    expect(appTypesSource).not.toContain("export type FlowTraceDescriptor");
    expect(appTypesSource).not.toContain("export type FlowTraceReport");
    expect(appTypesSource).not.toContain("export type FlowTraceArtifact");
    expect(appTypesSource).not.toContain("export type FlowTraceDiffDescriptor");
    expect(appTypesSource).not.toContain("export type FlowTraceIncidentSummary");
    expect(appTypesSource).not.toContain("export type FlowLocalInspectionProof");
    expect(inspectSource).not.toContain("flowExperimental");
    expect(inspectSource).toContain("analyzeTrace");
    expect(inspectSource).toContain("attachInspectionSink");
    expect(inspectSource).toContain("captureTrace");
    expect(inspectSource).toContain("compressTraceArtifact");
    expect(inspectSource).toContain("createLocalInspectionProof");
    expect(inspectSource).toContain("createInspectionBufferSink");
    expect(inspectSource).toContain("decompressTraceArtifact");
    expect(inspectSource).toContain("diffTrace");
    expect(inspectSource).toContain("exportTraceArtifact");
    expect(inspectSource).toContain("formatInspectionEvent");
    expect(inspectSource).toContain("formatInspectionEventPretty");
    expect(inspectSource).toContain("formatInspectionTimeline");
    expect(inspectSource).toContain("formatInspectionTimelinePretty");
    expect(inspectSource).toContain("formatNoTransitionSummary");
    expect(inspectSource).toContain("formatRehydrationSummary");
    expect(inspectSource).toContain("formatResourceFreshnessReport");
    expect(inspectSource).toContain("formatTrace");
    expect(inspectSource).toContain("formatTracePretty");
    expect(inspectSource).toContain("formatTransactionOverlapSummary");
    expect(inspectSource).toContain("graphOf");
    expect(inspectSource).toContain("flowStories");
    expect(inspectSource).toContain("importTraceArtifact");
    expect(inspectSource).toContain("storyToDoc");
    expect(inspectSource).toContain("summarizeTrace");
    expect(inspectSource).toContain("FlowGraphDescriptor");
    expect(inspectSource).toContain("FlowStoryCoverageDescriptor");
    expect(inspectSource).toContain("FlowStoryDocDescriptor");
    expect(inspectSource).toContain("FlowStoryDocSeed");
    expect(inspectSource).toContain("FlowStorySeed");
    expect(inspectSource).toContain("FlowTraceArtifact");
    expect(inspectSource).toContain("FlowLocalInspectionProof");
    expect(inspectSource).toContain("FlowTraceAnalysisDescriptor");
    expect(inspectSource).toContain("FlowTraceDiffDescriptor");
    expect(inspectSource).toContain("FlowTraceDescriptor");
    expect(inspectSource).toContain("FlowTraceIncidentSummary");
    expect(testingSource).toContain("FlowModelDescriptor");
    expect(testingSource).toContain("FlowModelPath");
    expect(testingSource).toContain("FlowModelReplayConfig");
    expect(testingSource).toContain("FlowModelStep");
    expect(testingSource).toContain("FlowModelTraversalOptions");
    expect(testingSource).toContain("FlowStartedTestBuilder");
    expect(testingSource).toContain("storyToTest");
    expect(testingSource).toContain("FlowStoryTestReport");
    expect(testingSource).toContain("FlowTestBuilder");
    expect(testingSource).toContain("FlowTestHarness");
  });

  it("exports the helper types needed for portable inferred app and machine surfaces", () => {
    const rootSource = requireSource("./index.ts");
    const serverSource = requireSource("./server.ts");

    for (const source of [rootSource, serverSource]) {
      expect(source).toContain("FlowActionDefinition");
      expect(source).toContain("FlowEventTransitions");
      expect(source).toContain("FlowInvokeDescriptor");
      expect(source).toContain("FlowInvalidationTarget");
      expect(source).toContain("FlowPreviewPatch");
      expect(source).toContain("FlowModuleInventory");
    }

    for (const helperType of [
      "HostSignals",
      "InspectionLog",
      "NotificationScheduler",
      "OrchestratorSystem",
      "ResourceStore",
      "TraceLog",
    ]) {
      expect(rootSource).toContain(helperType);
      expect(serverSource).toContain(helperType);
    }
  });

  it("keeps the react entrypoint owning the provider-backed hook surface", () => {
    const reactEntrySource = requireSource("./react-entry.ts");

    expect(reactEntrySource).toContain('from "./react/flow.js"');
    expect(reactEntrySource).toContain('from "./react/provider.js"');
  });

  it("keeps root implementation helpers out of src/ and under their machine owner", () => {
    const inspectionEventsSource = requireSource("./core/inspection/inspection-events.ts");
    const inspectionRetentionSource = requireSource("./core/inspection/inspection-retention.ts");
    const inspectionSinkSource = requireSource("./core/inspection/inspection-sink.ts");
    const graphDescriptorSource = requireSource("./core/inspection/graph-descriptor.ts");
    const inspectionInspectSource = requireSource("./core/inspection/inspect.ts");
    const inspectionLocalProofSource = requireSource("./core/inspection/inspection-local-proof.ts");
    const flowModelSource = requireSource("./testing/flow-model.ts");

    expect(sourceModules["./flow-paths.ts"]).toBeUndefined();
    expect(sourceModules["./graph-descriptor.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-events.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-format.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-local-proof.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-retention.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-sink.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-semantic-summary.ts"]).toBeUndefined();
    expect(inspectionEventsSource).toContain('from "../api/types.js"');
    expect(inspectionRetentionSource).toContain('from "./inspection-events.js"');
    expect(inspectionSinkSource).toContain('from "./inspection-events.js"');
    expect(graphDescriptorSource).toContain('from "../machines/flow-paths.js"');
    expect(inspectionInspectSource).toContain('from "./inspection-format.js"');
    expect(inspectionInspectSource).toContain('from "./inspection-local-proof.js"');
    expect(inspectionInspectSource).toContain('from "./inspection-sink.js"');
    expect(inspectionInspectSource).toContain('from "./inspection-semantic-summary.js"');
    expect(inspectionLocalProofSource).toContain('from "./inspection-format.js"');
    expect(flowModelSource).toContain('from "../core/machines/flow-paths.js"');
  });

  it("keeps entrypoints isolated to their owned runtime boundaries", () => {
    const reactEntrySource = requireSource("./react-entry.ts");
    const inspectSource = requireSource("./inspect.ts");
    const testingSource = requireSource("./testing.ts");

    expect(reactEntrySource).not.toContain("withRequestRuntime");
    expect(reactEntrySource).not.toContain("createControlledEffect");
    expect(reactEntrySource).not.toContain("createControlledStream");
    expect(reactEntrySource).not.toContain("flowTest");
    expect(reactEntrySource).not.toContain("captureTrace");
    expect(reactEntrySource).not.toContain("graphOf");

    expect(inspectSource).not.toContain('from "./react/provider.js"');
    expect(inspectSource).not.toContain('from "./runtime/request-runtime.js"');
    expect(inspectSource).not.toContain('from "./testing/controlled-effect.js"');
    expect(inspectSource).not.toContain('from "./testing/controlled-stream.js"');
    expect(inspectSource).not.toContain('from "./testing/flow-test.js"');
    expect(inspectSource).not.toContain("FlowProvider");
    expect(inspectSource).not.toContain("flowTest");

    expect(testingSource).not.toContain('from "./react/provider.js"');
    expect(testingSource).not.toContain('from "./runtime/request-runtime.js"');
    expect(testingSource).not.toContain('from "./testing/controlled-effect.js"');
    expect(testingSource).not.toContain("FlowProvider");
    expect(testingSource).not.toContain("withRequestRuntime");
    expect(testingSource).not.toContain("captureTrace");
    expect(testingSource).not.toContain("graphOf");
    expect(testingSource).toContain('from "./public/testing-types.js"');
    expect(testingSource).toContain("FlowTestCache");
    expect(testingSource).toContain("FlowTestChildTreeNode");
    expect(testingSource).toContain("FlowTestPendingChild");
    expect(testingSource).toContain("FlowTestPendingMailbox");
    expect(testingSource).toContain("FlowTestPendingTimer");
    expect(testingSource).toContain("FlowTestPendingWork");
    expect(testingSource).toContain("FlowTestProgressBounds");
    expect(testingSource).toContain("FlowStoryRunBlocked");
    expect(testingSource).toContain("FlowStoryRunBlockedReason");
    expect(testingSource).toContain("FlowStoryRunOutcome");
    expect(testingSource).toContain("FlowStoryRunResult");
    expect(testingSource).toContain("FlowStoryTestCheck");
    expect(testingSource).toContain("FlowStoryTestCheckKind");
    expect(testingSource).toContain("FlowStoryTestReport");
    expect(testingSource).toContain("FlowTestTimers");
    expect(testingSource).toContain("FlowTestTransactions");
  });

  it("keeps app-layer descriptor helpers aligned with the executable subset", () => {
    const appTypesSource = requireSource("./public/app-types.ts");
    const publicFlowSource = requireSource("./react/flow.ts");
    const appDescriptorSource = requireSource("./descriptors/app.ts");

    expect(appTypesSource).not.toContain("namespace: string");
    expect(appTypesSource).not.toContain("options: Readonly<Record<string, unknown>>");
    expect(publicFlowSource).not.toContain("memory: ({ namespace }");
    expect(publicFlowSource).not.toContain("test: ({ namespace }");
    expect(publicFlowSource).not.toContain("live: (options: Readonly<Record<string, unknown>>)");
    expect(publicFlowSource).not.toContain("test: (options: Readonly<Record<string, unknown>>)");
    expect(appDescriptorSource).not.toContain("void layerConfig.store");
    expect(appDescriptorSource).not.toContain("void layerConfig.orchestrators");
  });

  it("keeps the remaining internal runtime and flow-test seams free of explicit any erasure", () => {
    const appDescriptorSource = requireSource("./descriptors/app.ts");
    const orchestratorSystemSource = requireSource("./core/orchestrator/orchestrator-system.ts");
    const orchestratorHelpersSource = requireSource("./core/orchestrator/orchestrator-helpers.ts");
    const flowTestSource = requireSource("./testing/flow-test.ts");

    expect(appDescriptorSource).not.toContain("Layer.Layer<never, any, any>");
    expect(orchestratorSystemSource).not.toContain("FlowActor<any, any, any>");
    expect(orchestratorSystemSource).not.toContain("Context.Context<any>");
    expect(orchestratorSystemSource).not.toContain("Effect.context<any>()");
    expect(orchestratorHelpersSource).not.toContain("FlowActor<any, any, any>");
    expect(orchestratorHelpersSource).not.toContain("FlowSnapshot<any, any, any>");
    expect(flowTestSource).not.toContain("FlowTransactionDefinition<string, any");
    expect(flowTestSource).not.toContain("FlowActor<any, any, any>");
  });
});
