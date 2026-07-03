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
    const contractRuntimeSource = requireSource("./runtime/contract-runtime.ts");

    expect(providerSource).not.toContain("FlowRuntime<any, any>");
    expect(contractRuntimeSource).not.toContain("Layer.Layer<any, any, never>");
    expect(contractRuntimeSource).not.toContain("FlowRuntime<any, any>");
  });

  it("keeps machine invoke and submit contracts free of explicit any-erased transactions", () => {
    const machineCoreTypesSource = requireSource("./core/api/machine-core-types.ts");
    const machineInvokeTypesSource = requireSource("./core/api/machine-invoke-types.ts");
    const machineViewStreamTypesSource = requireSource("./core/api/machine-view-stream-types.ts");

    expect(machineCoreTypesSource).not.toContain("FlowTransactionDefinition<string, any");
    expect(machineInvokeTypesSource).not.toContain("FlowTransactionDefinition<string, any");
    expect(machineViewStreamTypesSource).not.toContain("FlowStreamDefinition<any");
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
    expect(rootSource).not.toContain("  flow,");
    expect(rootSource).not.toContain("flowExperimental");
    expect(rootSource).not.toContain("withRequestRuntime");
  });

  it("keeps server, inspect, and testing types off the root entrypoint", () => {
    const rootSource = requireSource("./index.ts");
    const serverSource = requireSource("./server.ts");
    const inspectSource = requireSource("./inspect.ts");
    const testingSource = requireSource("./testing.ts");
    const appTypesSource = requireSource("./core/api/app-types.ts");
    const dataTypesSource = requireSource("./core/api/data-types.ts");
    const coreInspectTypesSource = requireSource("./core/api/inspect-types.ts");
    const coreTestingTypesSource = requireSource("./core/api/testing-types.ts");
    const coreTypesSource = requireSource("./core/api/types.ts");
    const machineCoreTypesSource = requireSource("./core/api/machine-core-types.ts");
    const machineInvokeTypesSource = requireSource("./core/api/machine-invoke-types.ts");
    const machineTypesSource = requireSource("./core/api/machine-types.ts");
    const machineViewStreamTypesSource = requireSource("./core/api/machine-view-stream-types.ts");
    const runtimeTypesSource = requireSource("./core/api/runtime-types.ts");
    const storyTypesSource = requireSource("./core/api/story-types.ts");

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
    expect(sourceModules["./public/app-types.ts"]).toBeUndefined();
    expect(sourceModules["./public/inspect-types.ts"]).toBeUndefined();
    expect(sourceModules["./public/testing-types.ts"]).toBeUndefined();
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
    expect(appTypesSource).toContain('export * from "./app-descriptor-types.js"');
    expect(appTypesSource).toContain('export * from "./runtime-types.js"');
    expect(appTypesSource).toContain('export * from "./story-types.js"');
    expect(dataTypesSource).toContain('export * from "./receipt-types.js"');
    expect(dataTypesSource).toContain('export * from "./inspection-event-types.js"');
    expect(dataTypesSource).toContain('export * from "./snapshot-types.js"');
    expect(dataTypesSource).toContain('export * from "./resource-transaction-types.js"');
    expect(coreInspectTypesSource).toContain('from "./app-descriptor-types.js"');
    expect(coreInspectTypesSource).toContain('from "./receipt-types.js"');
    expect(coreInspectTypesSource).toContain('from "./snapshot-types.js"');
    expect(coreInspectTypesSource).toContain('from "./resource-transaction-types.js"');
    expect(coreInspectTypesSource).toContain('from "./story-types.js"');
    expect(coreInspectTypesSource).toContain('from "./testing-types.js"');
    expect(coreTestingTypesSource).toContain('from "./app-descriptor-types.js"');
    expect(coreTestingTypesSource).toContain('from "./receipt-types.js"');
    expect(coreTestingTypesSource).toContain('from "./snapshot-types.js"');
    expect(coreTestingTypesSource).toContain('from "./runtime-types.js"');
    expect(coreTestingTypesSource).toContain('from "./resource-transaction-types.js"');
    expect(coreTestingTypesSource).toContain('from "./story-types.js"');
    expect(coreTestingTypesSource).toContain('from "./inspect-types.js"');
    expect(machineCoreTypesSource).toContain('from "./receipt-types.js"');
    expect(machineCoreTypesSource).toContain('from "./snapshot-types.js"');
    expect(machineCoreTypesSource).toContain('from "./resource-transaction-types.js"');
    expect(machineCoreTypesSource).toContain('from "./machine-invoke-types.js"');
    expect(machineCoreTypesSource).toContain('from "./machine-view-stream-types.js"');
    expect(machineInvokeTypesSource).toContain('from "./resource-transaction-types.js"');
    expect(machineInvokeTypesSource).toContain('from "./machine-core-types.js"');
    expect(machineInvokeTypesSource).toContain('from "./machine-view-stream-types.js"');
    expect(machineTypesSource).toContain('export * from "./machine-core-types.js"');
    expect(machineTypesSource).toContain('export * from "./machine-view-stream-types.js"');
    expect(machineTypesSource).toContain('export * from "./machine-invoke-types.js"');
    expect(machineViewStreamTypesSource).toContain('from "./receipt-types.js"');
    expect(machineViewStreamTypesSource).toContain('from "./snapshot-types.js"');
    expect(machineViewStreamTypesSource).toContain('from "./resource-transaction-types.js"');
    expect(machineViewStreamTypesSource).toContain('from "./machine-core-types.js"');
    expect(runtimeTypesSource).toContain('from "./receipt-types.js"');
    expect(runtimeTypesSource).toContain('from "./snapshot-types.js"');
    expect(runtimeTypesSource).toContain('from "./resource-transaction-types.js"');
    expect(runtimeTypesSource).toContain('from "./machine-core-types.js"');
    expect(storyTypesSource).toContain('from "./machine-core-types.js"');
    expect(coreTestingTypesSource).toContain('from "./machine-core-types.js"');
    expect(coreInspectTypesSource).toContain('from "./machine-core-types.js"');
    expect(coreInspectTypesSource).toContain('from "./machine-invoke-types.js"');
    expect(coreInspectTypesSource).toContain('from "./machine-view-stream-types.js"');
    expect(coreTypesSource).toContain('export * from "./app-types.js"');
    expect(coreTypesSource).toContain('export * from "./inspect-types.js"');
    expect(coreTypesSource).toContain('export * from "./testing-types.js"');
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

    expect(rootSource).toContain("FlowActionDefinition");
    expect(rootSource).toContain("FlowEventTransitions");
    expect(rootSource).toContain("FlowInvokeDescriptor");
    expect(rootSource).toContain("FlowInvalidationTarget");
    expect(rootSource).toContain("FlowPreviewPatch");
    expect(rootSource).toContain("FlowModuleInventory");

    for (const helperType of [
      "HostSignals",
      "InspectionLog",
      "NotificationScheduler",
      "OrchestratorSystem",
      "ResourceStore",
      "TraceLog",
    ]) {
      expect(rootSource).toContain(helperType);
    }

    expect(serverSource).toContain("FlowRuntimeBootActorSnapshot");
    expect(serverSource).toContain("FlowRuntimeBootOptions");
    expect(serverSource).toContain("FlowRuntimeBootPayload");
    expect(serverSource).toContain("FlowRuntimeHydratedBoot");
  });

  it("keeps the react entrypoint owning the provider-backed hook surface", () => {
    const reactEntrySource = requireSource("./react-entry.ts");

    expect(reactEntrySource).not.toContain('from "./react/flow.js"');
    expect(reactEntrySource).toContain('from "./react/provider.js"');
  });

  it("keeps root implementation helpers out of src/ and under their machine owner", () => {
    const inspectionEventsSource = requireSource("./core/inspection/inspection-events.ts");
    const inspectionMachineTransitionSource = requireSource(
      "./core/inspection/machine-transition-inspection.ts",
    );
    const inspectionObserverSource = requireSource("./core/inspection/inspection-observer.ts");
    const inspectionRetentionSource = requireSource("./core/inspection/inspection-retention.ts");
    const inspectionSinkSource = requireSource("./core/inspection/inspection-sink.ts");
    const orchestratorChildLifecycleFactsSource = requireSource(
      "./core/orchestrator/child-lifecycle-inspection-facts.ts",
    );
    const orchestratorSystemSource = requireSource("./core/orchestrator/orchestrator-system.ts");
    const orchestratorStreamTimerFactsSource = requireSource(
      "./core/orchestrator/stream-timer-inspection-facts.ts",
    );
    const orchestratorStreamsTimersSource = requireSource(
      "./core/orchestrator/orchestrator-streams-timers.ts",
    );
    const orchestratorTransactionFactsSource = requireSource(
      "./core/orchestrator/transaction-inspection-facts.ts",
    );
    const orchestratorTransactionCompletionSource = requireSource(
      "./core/orchestrator/orchestrator-transaction-completion.ts",
    );
    const orchestratorTransactionPreviewSource = requireSource(
      "./core/orchestrator/orchestrator-transaction-preview.ts",
    );
    const orchestratorTransactionRecoverySource = requireSource(
      "./core/orchestrator/orchestrator-transaction-recovery.ts",
    );
    const orchestratorTransactionStartSource = requireSource(
      "./core/orchestrator/orchestrator-transaction-start.ts",
    );
    const orchestratorTransactionTypesSource = requireSource(
      "./core/orchestrator/orchestrator-transaction-types.ts",
    );
    const inspectionStoryCoverageSource = requireSource("./core/inspection/story-coverage.ts");
    const inspectionStoryDocSource = requireSource("./core/inspection/story-doc.ts");
    const inspectionSubscriptionSource = requireSource(
      "./core/inspection/inspection-subscription.ts",
    );
    const inspectionTraceDiffSource = requireSource("./core/inspection/trace-diff.ts");
    const inspectionTraceActorHierarchySource = requireSource(
      "./core/inspection/trace-actor-hierarchy.ts",
    );
    const inspectionTraceCorrelationDetailsSource = requireSource(
      "./core/inspection/trace-correlation-details.ts",
    );
    const inspectionTraceDescriptorSource = requireSource("./core/inspection/trace-descriptor.ts");
    const inspectionTraceIncidentSummarySource = requireSource(
      "./core/inspection/trace-incident-summary.ts",
    );
    const inspectionTraceArtifactSource = requireSource("./core/inspection/trace-artifact.ts");
    const graphDescriptorSource = requireSource("./core/inspection/graph-descriptor.ts");
    const inspectionFormatSource = requireSource("./core/inspection/inspection-format.ts");
    const inspectionInspectSource = requireSource("./core/inspection/inspect.ts");
    const inspectionLocalProofSource = requireSource("./core/inspection/inspection-local-proof.ts");
    const inspectionTraceReportSource = requireSource("./core/inspection/trace-report.ts");
    const flowTestSource = requireSource("./testing/flow-test.ts");
    const flowModelSource = requireSource("./testing/flow-model.ts");

    expect(sourceModules["./child-lifecycle-inspection-facts.ts"]).toBeUndefined();
    expect(sourceModules["./flow-paths.ts"]).toBeUndefined();
    expect(sourceModules["./graph-descriptor.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-events.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-format.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-local-proof.ts"]).toBeUndefined();
    expect(sourceModules["./machine-transition-inspection.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-observer.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-retention.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-sink.ts"]).toBeUndefined();
    expect(sourceModules["./stream-timer-inspection-facts.ts"]).toBeUndefined();
    expect(sourceModules["./story-coverage.ts"]).toBeUndefined();
    expect(sourceModules["./story-doc.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-subscription.ts"]).toBeUndefined();
    expect(sourceModules["./inspection-semantic-summary.ts"]).toBeUndefined();
    expect(sourceModules["./trace-actor-hierarchy.ts"]).toBeUndefined();
    expect(sourceModules["./trace-artifact.ts"]).toBeUndefined();
    expect(sourceModules["./trace-correlation-details.ts"]).toBeUndefined();
    expect(sourceModules["./trace-descriptor.ts"]).toBeUndefined();
    expect(sourceModules["./trace-diff.ts"]).toBeUndefined();
    expect(sourceModules["./trace-incident-summary.ts"]).toBeUndefined();
    expect(sourceModules["./transaction-inspection-facts.ts"]).toBeUndefined();
    expect(inspectionEventsSource).toContain('from "../api/types.js"');
    expect(inspectionMachineTransitionSource).toContain('from "../machines/machine-transition.js"');
    expect(inspectionObserverSource).toContain('from "../api/types.js"');
    expect(inspectionRetentionSource).toContain('from "./inspection-events.js"');
    expect(inspectionSinkSource).toContain('from "./inspection-observer.js"');
    expect(inspectionSinkSource).toContain('from "./inspection-subscription.js"');
    expect(inspectionSinkSource).toContain('from "./inspection-events.js"');
    expect(orchestratorChildLifecycleFactsSource).toContain('from "../api/data-types.js"');
    expect(orchestratorChildLifecycleFactsSource).toContain(
      'from "../api/machine-invoke-types.js"',
    );
    expect(orchestratorSystemSource).toContain('from "./orchestrator-actor-lifecycle.js"');
    expect(orchestratorSystemSource).toContain('from "./orchestrator-inspection.js"');
    expect(orchestratorStreamTimerFactsSource).toContain('from "../api/types.js"');
    expect(orchestratorStreamsTimersSource).toContain('from "./orchestrator-stream-ownership.js"');
    expect(orchestratorTransactionFactsSource).toContain('from "../api/types.js"');
    expect(orchestratorTransactionCompletionSource).toContain(
      'from "./transaction-inspection-facts.js"',
    );
    expect(orchestratorTransactionPreviewSource).toContain(
      'from "./transaction-inspection-facts.js"',
    );
    expect(orchestratorTransactionRecoverySource).toContain(
      'from "./transaction-inspection-facts.js"',
    );
    expect(orchestratorTransactionStartSource).toContain(
      'from "./transaction-inspection-facts.js"',
    );
    expect(orchestratorTransactionTypesSource).toContain(
      'from "./transaction-inspection-facts.js"',
    );
    expect(inspectionStoryCoverageSource).toContain('from "../api/types.js"');
    expect(inspectionStoryDocSource).toContain('from "../api/types.js"');
    expect(inspectionSubscriptionSource).toContain('from "../api/types.js"');
    expect(inspectionTraceActorHierarchySource).toContain('from "../api/types.js"');
    expect(inspectionTraceArtifactSource).toContain('from "./trace-descriptor.js"');
    expect(inspectionTraceCorrelationDetailsSource).toContain('from "../api/types.js"');
    expect(inspectionTraceCorrelationDetailsSource).toContain('from "./receipt-summary.js"');
    expect(inspectionTraceDescriptorSource).toContain('from "./trace-actor-hierarchy.js"');
    expect(inspectionTraceDescriptorSource).toContain('from "./trace-report.js"');
    expect(inspectionTraceDiffSource).toContain('from "../api/types.js"');
    expect(inspectionTraceIncidentSummarySource).toContain('from "../api/types.js"');
    expect(graphDescriptorSource).toContain('from "../machines/flow-paths.js"');
    expect(graphDescriptorSource).toContain('from "./story-coverage.js"');
    expect(inspectionInspectSource).toContain('from "./inspection-format.js"');
    expect(inspectionInspectSource).toContain('from "./inspection-local-proof.js"');
    expect(inspectionInspectSource).toContain('from "./machine-transition-inspection.js"');
    expect(inspectionInspectSource).toContain('from "./inspection-sink.js"');
    expect(inspectionInspectSource).toContain('from "./inspection-semantic-summary.js"');
    expect(inspectionInspectSource).toContain('from "./story-doc.js"');
    expect(inspectionInspectSource).toContain('from "./trace-artifact.js"');
    expect(inspectionInspectSource).toContain('from "./trace-descriptor.js"');
    expect(inspectionInspectSource).toContain('from "./trace-diff.js"');
    expect(inspectionInspectSource).toContain('from "./trace-incident-summary.js"');
    expect(inspectionLocalProofSource).toContain('from "./inspection-format.js"');
    expect(inspectionLocalProofSource).toContain('from "./trace-artifact.js"');
    expect(inspectionFormatSource).toContain('from "./trace-incident-summary.js"');
    expect(inspectionTraceReportSource).toContain('from "./trace-correlation-details.js"');
    expect(flowTestSource).toContain(
      'from "../core/orchestrator/child-lifecycle-inspection-facts.js"',
    );
    expect(flowTestSource).toContain('from "./flow-test-stream-ownership.js"');
    expect(flowTestSource).toContain('from "./flow-test-after-timer-ownership.js"');
    expect(flowTestSource).toContain('from "./flow-test-transaction-bookkeeping.js"');
    expect(flowModelSource).toContain('from "../core/machines/flow-paths.js"');
  });

  it("keeps machine transition application under a dedicated machine seam", () => {
    const machineTransitionSource = requireSource("./core/machines/machine-transition.ts");
    const machineTransitionApplicationSource = requireSource(
      "./core/machines/machine-transition-application.ts",
    );

    expect(machineTransitionSource).toContain('from "./machine-transition-application.js"');
    expect(machineTransitionSource).not.toContain("function runTransitionCallback");
    expect(machineTransitionSource).not.toContain("function stateActionsForPhase");
    expect(machineTransitionSource).not.toContain('type: "machine:action"');
    expect(machineTransitionApplicationSource).toContain("function runTransitionCallback");
    expect(machineTransitionApplicationSource).toContain("function stateActionsForPhase");
    expect(machineTransitionApplicationSource).toContain('type: "machine:action"');
    expect(machineTransitionApplicationSource).not.toContain("FlowSnapshot<any, any, any>");
  });

  it("keeps machine transition config readers under a dedicated machine seam", () => {
    const machineTransitionSource = requireSource("./core/machines/machine-transition.ts");
    const machineTransitionConfigSource = requireSource(
      "./core/machines/machine-transition-config.ts",
    );

    expect(machineTransitionSource).toContain('from "./machine-transition-config.js"');
    expect(machineTransitionSource).not.toContain("function normalizeTransitionDefinitions");
    expect(machineTransitionSource).not.toContain("function normalizeAfterDefinitions");
    expect(machineTransitionSource).not.toContain(
      "snapshot.machine.config.states[snapshot.value]?.on",
    );
    expect(machineTransitionConfigSource).toContain("function normalizeTransitionDefinitions");
    expect(machineTransitionConfigSource).toContain("function normalizeAfterDefinitions");
    expect(machineTransitionConfigSource).toContain(
      "snapshot.machine.config.states[snapshot.value]?.on?.[eventType]",
    );
    expect(machineTransitionConfigSource).not.toContain("FlowSnapshot<any, any, any>");
  });

  it("keeps machine transition receipt helpers under a dedicated machine seam", () => {
    const machineTransitionSource = requireSource("./core/machines/machine-transition.ts");
    const machineTransitionReceiptsSource = requireSource(
      "./core/machines/machine-transition-receipts.ts",
    );

    expect(machineTransitionSource).toContain('from "./machine-transition-receipts.js"');
    expect(machineTransitionSource).not.toContain("function transitionArgs");
    expect(machineTransitionSource).not.toContain("function guardPassed");
    expect(machineTransitionSource).not.toContain("function transitionCandidateFor");
    expect(machineTransitionReceiptsSource).toContain("function transitionArgs");
    expect(machineTransitionReceiptsSource).toContain("function guardPassed");
    expect(machineTransitionReceiptsSource).toContain("function transitionCandidateFor");
    expect(machineTransitionReceiptsSource).toContain('type: "machine:guard"');
    expect(machineTransitionReceiptsSource).not.toContain("FlowSnapshot<any, any, any>");
  });

  it("keeps machine transition microstep runtime under a dedicated machine seam", () => {
    const machineTransitionSource = requireSource("./core/machines/machine-transition.ts");
    const machineTransitionRuntimeSource = requireSource(
      "./core/machines/machine-transition-runtime.ts",
    );

    expect(machineTransitionSource).toContain('from "./machine-transition-runtime.js"');
    expect(machineTransitionSource).not.toContain("function resolveAlwaysMicrosteps");
    expect(machineTransitionSource).not.toContain(
      "const transitions = alwaysTransitionsFor(snapshot)",
    );
    expect(machineTransitionSource).not.toContain('type: "machine:microstep-limit"');
    expect(machineTransitionRuntimeSource).toContain("function resolveAlwaysMicrosteps");
    expect(machineTransitionRuntimeSource).toContain(
      "const transitions = alwaysTransitionsFor(snapshot)",
    );
    expect(machineTransitionRuntimeSource).toContain('type: "machine:microstep-limit"');
    expect(machineTransitionRuntimeSource).not.toContain("FlowSnapshot<any, any, any>");
  });

  it("keeps flow-test stream ownership under a dedicated testing seam", () => {
    const flowTestSource = requireSource("./testing/flow-test.ts");
    const flowTestStreamOwnershipSource = requireSource("./testing/flow-test-stream-ownership.ts");

    expect(flowTestSource).toContain('from "./flow-test-stream-ownership.js"');
    expect(flowTestStreamOwnershipSource).toContain('from "../core/streams/stream-callbacks.js"');
    expect(flowTestStreamOwnershipSource).toContain(
      'from "../core/streams/controlled-stream-source.js"',
    );
    expect(flowTestStreamOwnershipSource).toContain(
      'from "../core/orchestrator/orchestrator-issues.js"',
    );
    expect(flowTestStreamOwnershipSource).not.toContain("FlowSnapshot<any, any, any>");
  });

  it("keeps flow-test timer ownership under a dedicated testing seam", () => {
    const flowTestSource = requireSource("./testing/flow-test.ts");
    const flowTestAfterTimerOwnershipSource = requireSource(
      "./testing/flow-test-after-timer-ownership.ts",
    );

    expect(flowTestSource).toContain('from "./flow-test-after-timer-ownership.js"');
    expect(flowTestSource).not.toContain("const activeAfters = new Map");
    expect(flowTestSource).not.toContain("const startStateOwnedAfters =");
    expect(flowTestSource).not.toContain("createDelayedWorkPlan");
    expect(flowTestSource).not.toContain("timer:fire");
    expect(flowTestAfterTimerOwnershipSource).toContain("const activeAfters = new Map");
    expect(flowTestAfterTimerOwnershipSource).toContain("const startStateOwnedAfters =");
    expect(flowTestAfterTimerOwnershipSource).toContain("createDelayedWorkPlan");
    expect(flowTestAfterTimerOwnershipSource).toContain("timer:interrupt");
    expect(flowTestAfterTimerOwnershipSource).not.toContain("FlowSnapshot<any, any, any>");
  });

  it("keeps flow-test progress controls under a dedicated testing seam", () => {
    const flowTestSource = requireSource("./testing/flow-test.ts");
    const flowTestProgressControlsSource = requireSource(
      "./testing/flow-test-progress-controls.ts",
    );

    expect(flowTestSource).toContain('from "./flow-test-progress-controls.js"');
    expect(flowTestSource).not.toContain("const pendingWorkSnapshot =");
    expect(flowTestSource).not.toContain("const waitForProgress =");
    expect(flowTestSource).not.toContain("readyWorkPendingCount(");
    expect(flowTestSource).not.toContain("createSettleBoundsError(");
    expect(flowTestProgressControlsSource).toContain("const pendingWorkSnapshot =");
    expect(flowTestProgressControlsSource).toContain("const waitForProgress =");
    expect(flowTestProgressControlsSource).toContain("readyWorkPendingCount(");
    expect(flowTestProgressControlsSource).toContain("createSettleBoundsError(");
    expect(flowTestProgressControlsSource).not.toContain("FlowSnapshot<any, any, any>");
  });

  it("keeps flow-test read-only helpers under a dedicated testing seam", () => {
    const flowTestSource = requireSource("./testing/flow-test.ts");
    const flowTestReadSurfaceSource = requireSource("./testing/flow-test-read-surface.ts");

    expect(flowTestSource).toContain('from "./flow-test-read-surface.js"');
    expect(flowTestSource).not.toContain("const streamInspector =");
    expect(flowTestSource).not.toContain("const timerInspector =");
    expect(flowTestSource).not.toContain("const transactionInspector =");
    expect(flowTestSource).not.toContain("const traceForCorrelation =");
    expect(flowTestSource).not.toContain("const summarizeIssue =");
    expect(flowTestReadSurfaceSource).toContain("const traceForCorrelation");
    expect(flowTestReadSurfaceSource).toContain("const summarizeIssue");
    expect(flowTestReadSurfaceSource).toContain("receiptSummary: () => summarizeReceipts");
    expect(flowTestReadSurfaceSource).toContain('receipt.type.startsWith("transaction:")');
    expect(flowTestReadSurfaceSource).not.toContain("FlowSnapshot<any, any, any>");
  });

  it("keeps flow-test transaction bookkeeping under a dedicated testing seam", () => {
    const flowTestSource = requireSource("./testing/flow-test.ts");
    const flowTestTransactionBookkeepingSource = requireSource(
      "./testing/flow-test-transaction-bookkeeping.ts",
    );

    expect(flowTestSource).toContain('from "./flow-test-transaction-bookkeeping.js"');
    expect(flowTestSource).not.toContain("const activeTransactions = new Map");
    expect(flowTestSource).not.toContain("const applyTransactionPreviewPatches =");
    expect(flowTestSource).not.toContain("const startResolvedTransaction =");
    expect(flowTestSource).not.toContain("rejectedWhileRunningTransactionDiagnostic(");
    expect(flowTestTransactionBookkeepingSource).toContain("const activeTransactions = new Map");
    expect(flowTestTransactionBookkeepingSource).toContain(
      "const applyTransactionPreviewPatches =",
    );
    expect(flowTestTransactionBookkeepingSource).toContain("const startResolvedTransaction =");
    expect(flowTestTransactionBookkeepingSource).toContain(
      "rejectedWhileRunningTransactionDiagnostic(",
    );
    expect(flowTestTransactionBookkeepingSource).not.toContain("FlowSnapshot<any, any, any>");
  });

  it("keeps flow-test runtime boot under a dedicated testing seam", () => {
    const flowTestSource = requireSource("./testing/flow-test.ts");
    const flowTestRuntimeBootSource = requireSource("./testing/flow-test-runtime-boot.ts");

    expect(flowTestSource).toContain('from "./flow-test-runtime-boot.js"');
    expect(flowTestSource).not.toContain("let providedLayers: ReadonlyArray<Layer.Any> = []");
    expect(flowTestSource).not.toContain("let customClock = false");
    expect(flowTestSource).not.toContain("const runtimeApp = app ?? createAppDefinition");
    expect(flowTestSource).not.toContain("TestClock.layer()");
    expect(flowTestSource).not.toContain("Clock.currentTimeMillis");
    expect(flowTestRuntimeBootSource).toContain(
      "let providedLayers: ReadonlyArray<Layer.Any> = []",
    );
    expect(flowTestRuntimeBootSource).toContain("let customClock = false");
    expect(flowTestRuntimeBootSource).toContain("const runtimeApp = app ?? createAppDefinition");
    expect(flowTestRuntimeBootSource).toContain("TestClock.layer()");
    expect(flowTestRuntimeBootSource).toContain("Clock.currentTimeMillis");
    expect(flowTestRuntimeBootSource).not.toContain("FlowSnapshot<any, any, any>");
  });

  it("keeps flow-test builder wiring under a dedicated testing seam", () => {
    const flowTestSource = requireSource("./testing/flow-test.ts");
    const flowTestBuilderSource = requireSource("./testing/flow-test-builder.ts");

    expect(flowTestSource).toContain('from "./flow-test-builder.js"');
    expect(flowTestSource).not.toContain("type BuilderState");
    expect(flowTestSource).not.toContain("fixtureResourcesForApp(");
    expect(flowTestSource).not.toContain("seedModuleFixtures: (fixture: string)");
    expect(flowTestSource).not.toContain("state.fixtures.flatMap");
    expect(flowTestSource).not.toContain("createFlowModel(machine");
    expect(flowTestBuilderSource).toContain("type BuilderState");
    expect(flowTestBuilderSource).toContain("fixtureResourcesForApp(");
    expect(flowTestBuilderSource).toContain("seedModuleFixtures: (fixture: string)");
    expect(flowTestBuilderSource).toContain("state.fixtures.flatMap");
    expect(flowTestBuilderSource).toContain("deps.createModel()(machine");
    expect(flowTestBuilderSource).not.toContain("FlowSnapshot<any, any, any>");
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
    expect(testingSource).toContain('from "./core/api/testing-types.js"');
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
    const appTypesSource = requireSource("./core/api/app-types.ts");
    const appDescriptorSource = requireSource("./descriptors/app.ts");

    expect(appTypesSource).not.toContain("namespace: string");
    expect(appTypesSource).not.toContain("options: Readonly<Record<string, unknown>>");
    expect(sourceModules["./react/flow.ts"]).toBeUndefined();
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
