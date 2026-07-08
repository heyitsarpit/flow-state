import { Context, Duration, Effect, Layer, Stream } from "effect";
import type { Effect as EffectType } from "effect";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import * as flowState from "./index.js";
import type {
  FlowIssue,
  FlowIssueSummary,
  FlowReceipt,
  FlowReceiptFacts,
  FlowRehydratedTestHarness,
  FlowTestChildSummary,
  FlowTestChildTree,
} from "./index.js";
import * as flowInspect from "./inspect.js";
import * as flowReact from "./react-entry.js";
import * as flowServer from "./server.js";
import * as flowTesting from "./testing.js";
import { app, createKey, createTag, machine, resource, transaction } from "./index.js";
import * as flow from "./index.js";
import { test } from "./testing.js";
import { flowTest } from "./testing.js";
import { createTestRuntimeWithInstallers } from "./testing/fixtures/runtime-test-fixtures.js";
import { HostSignals } from "./core/runtime/services/host-signals.js";
import { InspectionLog } from "./core/runtime/services/inspection.js";
import { NotificationScheduler } from "./core/runtime/services/notification-scheduler.js";
import { OrchestratorSystem } from "./core/orchestrator/orchestrator-system.js";
import { ResourceStore } from "./core/runtime/services/resource-store.js";
import { TraceLog } from "./core/runtime/services/trace.js";
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Type extends true> = Type;
type RootExports = typeof import("./index.js");
type ReactRouteExports = typeof import("./react-entry.js");
type ServerRouteExports = typeof import("./server.js");
type TestingRouteExports = typeof import("./testing.js");
type InspectRouteExports = typeof import("./inspect.js");

// @ts-expect-error root route should not publish a named flow export
type _RootFlowNamespace = RootExports["flow"];
// @ts-expect-error react route should not publish a package-owned flow namespace
type _ReactFlowNamespace = ReactRouteExports["flow"];
// @ts-expect-error react route should not publish core builders as named exports
type _ReactMachine = ReactRouteExports["machine"];
// @ts-expect-error react route should not publish core builders as named exports
type _ReactTransaction = ReactRouteExports["transaction"];
// @ts-expect-error react route should not publish core builders as named exports
type _ReactResource = ReactRouteExports["resource"];
// @ts-expect-error server route should not re-export core builders
type _ServerCreateKey = ServerRouteExports["createKey"];
// @ts-expect-error server route should not re-export the core flow namespace
type _ServerFlowNamespace = ServerRouteExports["flow"];
// @ts-expect-error server route should not re-export view selectors
type _ServerSelectView = ServerRouteExports["selectView"];
// @ts-expect-error server route should not publish core builders as named exports
type _ServerMachine = ServerRouteExports["machine"];
// @ts-expect-error server route should not publish core builders as named exports
type _ServerTransaction = ServerRouteExports["transaction"];
// @ts-expect-error server route should not publish core builders as named exports
type _ServerResource = ServerRouteExports["resource"];
// @ts-expect-error testing route should not publish the core flow namespace
type _TestingFlowNamespace = TestingRouteExports["flow"];
// @ts-expect-error testing route should not publish core builders as named exports
type _TestingMachine = TestingRouteExports["machine"];
// @ts-expect-error testing route should not publish core builders as named exports
type _TestingTransaction = TestingRouteExports["transaction"];
// @ts-expect-error testing route should not publish core builders as named exports
type _TestingResource = TestingRouteExports["resource"];
// @ts-expect-error inspect route should not publish the core flow namespace
type _InspectFlowNamespace = InspectRouteExports["flow"];
// @ts-expect-error inspect route should not publish core builders as named exports
type _InspectMachine = InspectRouteExports["machine"];
// @ts-expect-error inspect route should not publish core builders as named exports
type _InspectTransaction = InspectRouteExports["transaction"];
// @ts-expect-error inspect route should not publish core builders as named exports
type _InspectResource = InspectRouteExports["resource"];

const expectedTopLevelExports = new Set([
  "after",
  "app",
  "can",
  "child",
  "createKey",
  "createTag",
  "ensure",
  "invalidate",
  "machine",
  "module",
  "observe",
  "orchestrators",
  "outcomes",
  "patch",
  "refresh",
  "resource",
  "run",
  "runtime",
  "selectView",
  "store",
  "stream",
  "transaction",
  "view",
]);
const expectedInspectExports = new Set([
  "analyzeTrace",
  "attachInspectionSink",
  "buildBehaviorContract",
  "captureTrace",
  "compressTraceArtifact",
  "createLocalInspectionProof",
  "createInspectionBufferSink",
  "diffBehaviorContracts",
  "decompressTraceArtifact",
  "diffTrace",
  "exportTraceArtifact",
  "formatInspectionEvent",
  "formatInspectionEventPretty",
  "formatInspectionTimeline",
  "formatInspectionTimelinePretty",
  "formatNoTransitionSummary",
  "formatRehydrationSummary",
  "formatResourceFreshnessReport",
  "formatTrace",
  "formatTracePretty",
  "formatTransactionOverlapSummary",
  "flowStories",
  "graphOf",
  "importTraceArtifact",
  "inspectActions",
  "inspectMicrosteps",
  "inspectTransition",
  "renderBehaviorContract",
  "renderBehaviorCoverage",
  "renderBehaviorDiff",
  "sliceBehaviorContract",
  "storyToDoc",
  "summarizeTrace",
  "whyNoTransition",
]);
const expectedReactExports = new Set(["FlowProvider", "use", "useResource", "useView"]);
const expectedServerExports = new Set(["withRequestRuntime"]);
const expectedTestingExports = new Set([
  "createControlledStream",
  "formatHarnessTracePretty",
  "formatPendingWorkPretty",
  "formatScenarioTranscript",
  "formatTransactionEventsPretty",
  "runFlowStory",
  "runFlowStoryWithDiagnostics",
  "storyToTest",
  "test",
  "flowTest",
]);
const forbiddenNonCoreBuilderExports = [
  "machine",
  "transaction",
  "resource",
  "createKey",
  "createTag",
  "selectView",
] as const;

type ProjectRecord = Readonly<{
  readonly id: string;
  readonly name: string;
}>;

interface ProjectRepo {
  readonly _tag: "ProjectRepo";
}

class ProjectConfig extends Context.Service<ProjectConfig, { readonly projectId: string }>()(
  "@test/ProjectConfig",
) {}

class ProjectAnalytics extends Context.Service<
  ProjectAnalytics,
  { readonly label: EffectType.Effect<string, never, never> }
>()("@test/ProjectAnalytics") {}

type SaveError = "save-failed";
type SaveEvent =
  | Readonly<{ readonly type: "SAVED"; readonly value: ProjectRecord }>
  | Readonly<{ readonly type: "FAILED"; readonly error: SaveError }>;

function expectType<Type>(_value: Type): void {
  void _value;
}

describe("public API builders and descriptor contracts", () => {
  it("exposes the top-level entrypoints and removes the legacy mutation surface", () => {
    expect(new Set(Object.keys(flowState))).toEqual(expectedTopLevelExports);
    expect(new Set(Object.keys(flowInspect))).toEqual(expectedInspectExports);
    expect(new Set(Object.keys(flowReact))).toEqual(expectedReactExports);
    expect(new Set(Object.keys(flowServer))).toEqual(expectedServerExports);
    expect(new Set(Object.keys(flowTesting))).toEqual(expectedTestingExports);
    expect(resource).toBe(flow.resource);
    expect(transaction).toBe(flow.transaction);
    expect(machine).toBe(flow.machine);
    expect(app).toBe(flow.app);
    expect("mutation" in flow).toBe(false);
    expect("flow" in flowState).toBe(false);
    expect("FlowProvider" in flowState).toBe(false);
    expect("createControlledEffect" in flowState).toBe(false);
    expect("createControlledStream" in flowState).toBe(false);
    expect("createRuntime" in flowState).toBe(false);
    expect("createRuntime" in flowServer).toBe(false);
    expect("permission" in flow).toBe(false);
    expect("persist" in flow).toBe(false);
    expect("flowExperimental" in flowInspect).toBe(false);
    expect("flowExperimental" in flowState).toBe(false);
    expect("flowTest" in flowState).toBe(false);
    expect("createControlledEffect" in flowTesting).toBe(false);
    expect("flow" in flowReact).toBe(false);
    expect("flow" in flowServer).toBe(false);
    expect("flow" in flowTesting).toBe(false);
    expect("flow" in flowInspect).toBe(false);
    for (const forbiddenName of forbiddenNonCoreBuilderExports) {
      expect(forbiddenName in flowReact).toBe(false);
      expect(forbiddenName in flowServer).toBe(false);
      expect(forbiddenName in flowTesting).toBe(false);
      expect(forbiddenName in flowInspect).toBe(false);
    }
    expect("withRequestRuntime" in flowState).toBe(false);
  });

  it("requires FlowProvider callers to pass a runtime", () => {
    const runtime = createTestRuntimeWithInstallers();

    expectType<React.ReactElement>(
      createElement(flowReact.FlowProvider, {
        runtime,
        children: null,
      }),
    );

    const runtimeTransport = {
      kind: "runtime" as const,
      resources: runtime.resources,
      orchestrators: runtime.orchestrators,
      createActor: runtime.createActor,
      dispose: runtime.dispose,
    };

    // @ts-expect-error FlowProvider requires an explicit runtime prop
    createElement(flowReact.FlowProvider, {
      children: null,
    });

    createElement(flowReact.FlowProvider, {
      // @ts-expect-error FlowProvider requires a full runtime, not a transport subset
      runtime: runtimeTransport,
      children: null,
    });
  });

  it("keeps flow.runtime honest about app-layer services and error channels", () => {
    const runtime = createTestRuntimeWithInstallers();

    expectType<typeof flow.resource>(resource);
    expectType<typeof flow.transaction>(transaction);
    expectType<typeof flow.machine>(machine);
    expectType<typeof flow.app>(app);
    expectType<Promise<void>>(runtime.runPromise(Effect.void));
    expectType<Promise<import("effect").Exit.Exit<never, "boom">>>(
      runtime.runPromiseExit(Effect.fail("boom" as const)),
    );

    type _DefaultRuntimeServices = Expect<
      Equal<
        import("effect").ManagedRuntime.ManagedRuntime.Services<typeof runtime.managedRuntime>,
        | NotificationScheduler
        | ResourceStore
        | OrchestratorSystem
        | HostSignals
        | InspectionLog
        | TraceLog
      >
    >;
    void [true as _DefaultRuntimeServices];

    const expectDefaultRuntimeRejectsUnknownService = () => {
      // @ts-expect-error flow.runtime() should not pretend that arbitrary services are installed
      return runtime.runPromise(Effect.flatMap(ProjectAnalytics, (analytics) => analytics.label));
    };
    void expectDefaultRuntimeRejectsUnknownService;
  });

  it("keeps withRequestRuntime honest about app-layer services and return types", async () => {
    const analyticsLayer = Layer.succeed(
      ProjectAnalytics,
      ProjectAnalytics.of({
        label: Effect.succeed("analytics"),
      }),
    );
    const appLayer = flow.app({ modules: [] }).layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [analyticsLayer],
    });

    const result = flowServer.withRequestRuntime(appLayer, (runtime) =>
      runtime.runPromise(Effect.flatMap(ProjectAnalytics, (analytics) => analytics.label)),
    );

    expectType<Promise<string>>(result);
    expect(await result).toBe("analytics");
  });

  it("accepts only the honest app-layer descriptor surface", () => {
    const memoryStore = flow.store.memory();
    const testStore = flow.store.test();
    const liveOrchestrators = flow.orchestrators.live();
    const testOrchestrators = flow.orchestrators.test();

    expect(memoryStore).toEqual({
      kind: "store",
      mode: "memory",
    });
    expect(testStore).toEqual({
      kind: "store",
      mode: "test",
    });
    expect(liveOrchestrators).toEqual({
      kind: "orchestrators",
      mode: "live",
    });
    expect(testOrchestrators).toEqual({
      kind: "orchestrators",
      mode: "test",
    });
    expectType<"memory">(memoryStore.mode);
    expectType<"test">(testStore.mode);
    expectType<"live">(liveOrchestrators.mode);
    expectType<"test">(testOrchestrators.mode);

    const appLayer = flow.app({ modules: [] }).layer({
      store: testStore,
      orchestrators: testOrchestrators,
      services: [],
    });
    expect(appLayer).toBeDefined();
    expectType<Layer.Layer<never>>(appLayer);

    // @ts-expect-error legacy namespace config is removed until it is runtime-real
    flow.store.memory({ namespace: "legacy" });
    // @ts-expect-error legacy namespace config is removed until it is runtime-real
    flow.store.test({ namespace: "legacy-test" });
    // @ts-expect-error legacy orchestrator options are removed until they are runtime-real
    flow.orchestrators.live({ mode: "browser" });
    // @ts-expect-error legacy orchestrator options are removed until they are runtime-real
    flow.orchestrators.test({ deterministic: true });
  });

  it("preserves exact module tuples through object-form app assembly", () => {
    const SessionModule = flow.module(
      "Session",
      {
        resources: {},
      },
      {
        screens: ["Session"],
      },
    );
    const ProjectModule = flow.module(
      "Project",
      {
        resources: {},
      },
      {
        screens: ["Project"],
      },
    );

    const app = flow.app({
      modules: [SessionModule, ProjectModule] as const,
    });
    const expectRestArgAppAssemblyRemoved = () => {
      // @ts-expect-error rest-arg app assembly was removed; use flow.app({ modules }) instead
      flow.app(SessionModule, ProjectModule);
    };
    void expectRestArgAppAssemblyRemoved;

    expect(app.modules).toEqual([SessionModule, ProjectModule]);
    expectType<readonly [typeof SessionModule, typeof ProjectModule]>(app.modules);
  });

  it("preserves specific flow.run descriptor types", () => {
    const saveProject = flow.transaction<
      { readonly id: string },
      ProjectRecord,
      SaveError,
      ProjectRepo,
      SaveEvent,
      "Project.save"
    >({
      id: "Project.save",
      params: ({ id }: { readonly id?: string }) => ({ id: id ?? "project-1" }),
      commit: ({ id }) =>
        Effect.succeed({
          id,
          name: "Atlas",
        }) as EffectType.Effect<ProjectRecord, SaveError, ProjectRepo>,
      routes: {
        success: ({ value }) => ({ type: "SAVED", value }),
        failure: ({ error }) => ({ type: "FAILED", error }),
      },
    });

    const runDescriptor = flow.run(saveProject);

    expectType<typeof saveProject>(runDescriptor.transaction);
    expectType<"Project.save">(runDescriptor.id);
  });

  it("exposes named invoke descriptor result types for stricter declaration modes", () => {
    const projectTag = createTag("project");
    const resource = flow.resource({
      id: "Project.byId",
      key: (projectId: string) => createKey("project", projectId),
      lookup: (projectId: string) =>
        Effect.succeed({
          id: projectId,
          name: "Atlas",
        }),
      tags: () => [projectTag],
    });
    const resourceRef = resource.ref("project-1");
    const saveProject = flow.transaction({
      id: "Project.save",
      commit: ({ id }: { readonly id: string }) =>
        Effect.succeed({
          id,
          name: "Atlas",
        }),
    });

    const ensureProject: flowState.FlowEnsureDefinition<typeof resourceRef> =
      flow.ensure(resourceRef);
    const observeProject: flowState.FlowObserveDefinition<typeof resourceRef> =
      flow.observe(resourceRef);
    const refreshProject: flowState.FlowRefreshDefinition<typeof resourceRef> =
      flow.refresh(resourceRef);
    const patchProject: flowState.FlowPatchDefinition<
      typeof resourceRef,
      Readonly<{ readonly name: string }>
    > = flow.patch(resourceRef, {
      name: "Atlas v2",
    });
    const invalidateProject: flowState.FlowInvalidateDefinition<typeof projectTag> =
      flow.invalidate(projectTag);
    const runSaveProject: flowState.FlowRunDefinition<typeof saveProject> = flow.run(saveProject);

    expectType<"ensure">(ensureProject.kind);
    expectType<"observe">(observeProject.kind);
    expectType<"refresh">(refreshProject.kind);
    expectType<"patch">(patchProject.kind);
    expectType<"invalidate">(invalidateProject.kind);
    expectType<"run">(runSaveProject.kind);
    expectType<typeof resourceRef>(refreshProject.ref);
    expectType<typeof projectTag>(invalidateProject.target);
    expectType<typeof saveProject>(runSaveProject.transaction);
  });

  it("preserves resource ids, refs, key builders, schema, and lookup effect shape", () => {
    const projectSchema = { kind: "project-schema" } as const;
    const lookupProject = (
      projectId: string,
    ): EffectType.Effect<ProjectRecord, "missing", ProjectRepo> =>
      Effect.succeed({
        id: projectId,
        name: "Atlas",
      }) as EffectType.Effect<ProjectRecord, "missing", ProjectRepo>;

    const resource = flow.resource<
      [projectId: string],
      ProjectRecord,
      "missing",
      ReturnType<typeof lookupProject>,
      "Project.byId",
      typeof projectSchema
    >({
      id: "Project.byId",
      key: (projectId: string) => createKey("project", projectId),
      lookup: lookupProject,
      schema: projectSchema,
      tags: () => [createTag("project")],
    });

    const ref = resource.ref("project-1");

    expect(resource.kind).toBe("resource");
    expect(resource.id).toBe("Project.byId");
    expect(resource.config.schema).toEqual(projectSchema);
    expect(ref).toEqual({
      kind: "resourceRef",
      id: "Project.byId",
      params: ["project-1"],
      key: createKey("project", "project-1"),
    });

    expectType<"Project.byId">(resource.id);
    expectType<"Project.byId">(ref.id);
    expectType<typeof projectSchema | undefined>(resource.config.schema);
    expectType<EffectType.Effect<ProjectRecord, "missing", ProjectRepo>>(
      resource.config.lookup("project-1"),
    );
    const seeded: flowState.FlowSeededResource<typeof ref> = {
      ref,
      value: { id: "project-1", name: "Atlas" },
    };
    expectType<ProjectRecord>(seeded.value);

    type _ResourceShape = Expect<Equal<typeof ref.params, [string]>>;
    void [true as _ResourceShape];
  });

  it("types correlated trace reports from the final inspect surface", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "NEXT" }>,
      "idle"
    >({
      id: "Trace.types",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });

    const snapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      receipts: [
        {
          type: "machine:event",
          id: machine.id,
          eventType: "NEXT",
          correlationId: "Trace.types:event:1",
          targetActorId: machine.id,
        },
      ],
    });
    const trace = flowInspect.captureTrace(snapshot, { includeSnapshots: true as const });
    const analysis = flowInspect.analyzeTrace(machine, trace);
    const artifact = flowInspect.exportTraceArtifact(trace);
    const diff = flowInspect.diffTrace(trace, trace);
    const imported = flowInspect.importTraceArtifact(artifact);
    const compressed = flowInspect.compressTraceArtifact(trace);
    const summary = flowInspect.summarizeTrace(trace);
    const stories = flowInspect.flowStories(machine, [
      {
        id: "trace-story",
        title: "Trace story",
        start: {
          kind: "snapshot" as const,
          snapshot,
        },
        events: [{ type: "NEXT" as const }],
        expectedState: "idle" as const,
        expectedFacts: {
          receiptTypes: ["machine:event"],
          outcomeKinds: ["success"],
        },
        tags: ["docs"],
      },
    ]);
    const storyRun = flowTesting.runFlowStory(machine, stories.stories[0]!);
    const storyRunWithDiagnostics = flowTesting.runFlowStoryWithDiagnostics(
      machine,
      stories.stories[0]!,
    );
    const storyDoc = flowInspect.storyToDoc(stories.stories[0]!);
    const storyTest = storyRun.then((outcome) => flowTesting.storyToTest(outcome));
    void storyRunWithDiagnostics.then((execution) => {
      expectType<"story-run" | "story-run-blocked">(execution.outcome.kind);
      expectType<number | undefined>(execution.pendingWork?.activeFibers);
    });

    expectType<string | undefined>(trace.report.correlations[0]?.correlationId);
    expectType<number | undefined>(trace.report.correlations[0]?.index);
    expectType<string | undefined>(trace.report.correlations[0]?.event.type);
    expectType<string | undefined>(trace.report.correlations[0]?.stateBefore);
    expectType<string | undefined>(trace.report.correlations[0]?.stateAfter);
    expectType<ReadonlyArray<string>>(trace.report.summary.receiptTypes);
    expectType<ReadonlyArray<string>>(trace.report.summary.relatedIds);
    expectType<ReadonlyArray<(typeof trace.report.correlations)[number]>>(trace.report.timeline);
    expectType<ReadonlyArray<FlowIssueSummary>>(trace.report.issues);
    expectType<ReadonlyArray<flowInspect.FlowTraceOutcome>>(trace.report.outcomes);
    expectType<ReadonlyArray<FlowIssueSummary>>(trace.report.correlations[0]?.issues ?? []);
    expectType<ReadonlyArray<flowInspect.FlowTraceOutcome>>(
      trace.report.correlations[0]?.outcomes ?? [],
    );
    expectType<flowInspect.FlowTraceCorrelationDetails | undefined>(
      trace.report.correlations[0]?.details,
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceResourceDetail>>(
      trace.report.correlations[0]?.details.resources ?? [],
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceResourceFetchOutcome>>(
      trace.report.correlations[0]?.details.resources[0]?.fetchOutcomes ?? [],
    );
    expectType<boolean | undefined>(
      trace.report.correlations[0]?.details.resources[0]?.usedPlaceholder,
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceResourceFreshnessChange>>(
      trace.report.correlations[0]?.details.resources[0]?.freshnessChanges ?? [],
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceResourceInvalidationReason>>(
      trace.report.correlations[0]?.details.resources[0]?.invalidationReasons ?? [],
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceTransactionDetail>>(
      trace.report.correlations[0]?.details.transactions ?? [],
    );
    expectType<string | undefined>(trace.report.correlations[0]?.details.transactions[0]?.queueKey);
    expectType<ReadonlyArray<flowInspect.FlowTraceTransactionOverlapCause>>(
      trace.report.correlations[0]?.details.transactions[0]?.overlapCauses ?? [],
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceTransactionAttemptTiming>>(
      trace.report.correlations[0]?.details.transactions[0]?.attemptTimings ?? [],
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceTransactionPreviewSummary>>(
      trace.report.correlations[0]?.details.transactions[0]?.previews ?? [],
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceTransactionRollbackSummary>>(
      trace.report.correlations[0]?.details.transactions[0]?.rollbacks ?? [],
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceTransactionRoutedEvent>>(
      trace.report.correlations[0]?.details.transactions[0]?.routedEvents ?? [],
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceStreamDetail>>(
      trace.report.correlations[0]?.details.streams ?? [],
    );
    expectType<boolean | undefined>(trace.report.correlations[0]?.details.streams[0]?.restored);
    expectType<boolean | undefined>(
      trace.report.correlations[0]?.details.streams[0]?.lastValueAvailable,
    );
    expectType<flowInspect.FlowTraceStreamInterruptReason | undefined>(
      trace.report.correlations[0]?.details.streams[0]?.interruptReason,
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceTimerDetail>>(
      trace.report.correlations[0]?.details.timers ?? [],
    );
    expectType<boolean | undefined>(trace.report.correlations[0]?.details.timers[0]?.restored);
    expectType<flowInspect.FlowTraceTimerInterruptReason | undefined>(
      trace.report.correlations[0]?.details.timers[0]?.interruptReason,
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceChildDetail>>(
      trace.report.correlations[0]?.details.children ?? [],
    );
    expectType<string | undefined>(trace.report.correlations[0]?.details.children[0]?.ownerPath);
    expectType<string | undefined>(trace.report.correlations[0]?.details.children[0]?.stateAfter);
    expectType<ReadonlyArray<flowInspect.FlowTraceChildSpawnReason>>(
      trace.report.correlations[0]?.details.children[0]?.spawnReasons ?? [],
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceChildStopReason>>(
      trace.report.correlations[0]?.details.children[0]?.stopReasons ?? [],
    );
    expectType<ReadonlyArray<flowInspect.FlowTraceChildRetryCause>>(
      trace.report.correlations[0]?.details.children[0]?.retryCauses ?? [],
    );
    expectType<flowInspect.FlowTraceAnalysisDescriptor<typeof machine, typeof trace>>(analysis);
    expectType<flowInspect.FlowGraphDescriptor<typeof machine>>(analysis.graph);
    expectType<(typeof trace)["report"]>(analysis.report);
    expectType<(typeof trace)["receipts"]>(analysis.receipts);
    expectType<flowInspect.FlowTraceDiffDescriptor<typeof trace, typeof trace>>(diff);
    expectType<ReadonlyArray<FlowReceipt>>(diff.eventSequence.left);
    expectType<ReadonlyArray<flowInspect.FlowTraceStateChange>>(diff.stateChanges.left);
    expectType<ReadonlyArray<FlowIssueSummary>>(diff.issues.right);
    expectType<ReadonlyArray<flowInspect.FlowTraceResourceDetail>>(diff.resourceFreshness.left);
    expectType<ReadonlyArray<flowInspect.FlowTraceOutcome>>(diff.transactionOutcomes.left);
    expectType<ReadonlyArray<flowInspect.FlowTraceStreamDetail>>(diff.streamOutcomes.left);
    expectType<ReadonlyArray<flowInspect.FlowTraceChildDetail>>(diff.childOutcomes.left);
    expectType<ReadonlyArray<flowInspect.FlowTraceTimerDetail>>(diff.timerBehavior.left);
    expectType<flowInspect.FlowTraceArtifact>(artifact);
    expectType<Promise<Uint8Array | undefined>>(compressed);
    expectType<ReturnType<typeof flowInspect.importTraceArtifact>>(imported);
    expectType<flowInspect.FlowLocalInspectionProof>(flowInspect.createLocalInspectionProof(trace));
    expectType<flowInspect.FlowTraceIncidentSummary>(summary);
    expectType<string>(flowInspect.formatTrace(trace));
    expectType<string>(flowInspect.formatTracePretty(trace));
    expectType<string>(flowInspect.formatResourceFreshnessReport(trace));
    expectType<string>(flowInspect.formatTransactionOverlapSummary(trace));
    expectType<string>(flowInspect.formatRehydrationSummary(trace));
    expectType<string>(
      flowInspect.formatInspectionEvent({
        type: "actor:start",
        id: "Trace.types:event:0",
        actorId: "Trace.types:event:0",
        rootActorId: "Trace.types:event:0",
        timestamp: 0,
        sequence: 0,
      }),
    );
    expectType<string>(
      flowInspect.formatInspectionEventPretty({
        type: "actor:snapshot",
        id: "Trace.types:event:1",
        actorId: "Trace.types:event:1",
        rootActorId: "Trace.types:event:1",
        timestamp: 1,
        sequence: 1,
        snapshot: {
          value: "idle",
          context: {},
          resources: {},
          transactions: {},
          streams: {},
          timers: {},
          children: {},
          receipts: [],
        },
      }),
    );
    expectType<string>(
      flowInspect.formatInspectionTimeline([
        {
          type: "actor:start",
          id: "Trace.types:event:2",
          actorId: "Trace.types:event:2",
          rootActorId: "Trace.types:event:2",
          timestamp: 2,
          sequence: 2,
        },
      ]),
    );
    expectType<string>(
      flowInspect.formatInspectionTimelinePretty([
        {
          type: "actor:start",
          id: "Trace.types:event:3",
          actorId: "Trace.types:event:3",
          rootActorId: "Trace.types:event:3",
          timestamp: 3,
          sequence: 3,
        },
      ]),
    );
    expectType<flowInspect.FlowStoriesDescriptor<typeof machine>>(stories);
    expectType<flowInspect.FlowStory<typeof machine>>(stories.stories[0]!);
    expectType<flowInspect.FlowStoryDocDescriptor<typeof machine>>(storyDoc);
    expectType<Promise<flowTesting.FlowStoryRunOutcome<typeof machine>>>(storyRun);
    expectType<Promise<flowTesting.FlowStoryTestReport<typeof machine>>>(storyTest);
    expectType<flowInspect.FlowTraceActorNode>(trace.actorHierarchy);
    expectType<string | undefined>(trace.actorHierarchy.state);
    expectType<Readonly<Record<string, flowInspect.FlowTraceActorNode>>>(
      trace.actorHierarchy.children,
    );
    expectType<string | undefined>(trace.report.correlations[0]?.summary.eventType);
    expectType<ReadonlyArray<Readonly<{ readonly type: string }>>>(
      trace.report.correlations[0]?.receipts ?? [],
    );
    expectType<ReadonlyArray<Readonly<{ readonly type: string }>>>(
      trace.report.correlations[0]?.transactions ?? [],
    );
    expectType<ReadonlyArray<string>>(trace.report.correlations[0]?.summary.relatedIds ?? []);
    expectType<ReadonlyArray<string>>(trace.report.correlations[0]?.summary.receiptTypes ?? []);
    expectType<true | undefined>(trace.options?.includeSnapshots);
  });

  it("types graph descriptors from the inspect surface", () => {
    const machine = flow.machine<
      { readonly name: string },
      | Readonly<{ readonly type: "SET_NAME"; readonly name: string }>
      | Readonly<{ readonly type: "REVIEW" }>
      | Readonly<{ readonly type: "REOPEN" }>
      | Readonly<{ readonly type: "PUBLISH" }>,
      "draft" | "review" | "published",
      "draft"
    >({
      id: "Graph.types",
      initial: "draft",
      context: () => ({ name: "" }),
      states: {
        draft: {
          on: {
            SET_NAME: {
              update: ({ event }) => (event.type === "SET_NAME" ? { name: event.name } : {}),
            },
            REVIEW: "review",
          },
        },
        review: {
          on: {
            REOPEN: "draft",
            PUBLISH: "published",
          },
        },
        published: {
          type: "final",
        },
      },
    });

    const graph = flowInspect.graphOf(machine);

    expectType<"graph">(graph.kind);
    expectType<typeof machine>(graph.machine);
    expectType<"draft">(graph.initial);
    expectType<"draft" | "review" | "published" | undefined>(graph.nodes[0]?.id);
    expectType<"draft" | "review" | "published" | undefined>(graph.edges[0]?.source);
    expectType<"draft" | "review" | "published" | undefined>(graph.edges[0]?.target);
    expectType<"SET_NAME" | "REVIEW" | "REOPEN" | "PUBLISH" | undefined>(graph.edges[0]?.eventType);
    expectType<"SET_NAME" | "REVIEW" | "REOPEN" | "PUBLISH" | undefined>(graph.edges[0]?.label);
  });

  it("types behavior-contract builders from the inspect surface", () => {
    const machine = flow.machine<{}, Readonly<{ readonly type: "START" }>, "idle" | "done", "idle">(
      {
        id: "Behavior.types.machine",
        initial: "idle",
        context: () => ({}),
        states: {
          idle: {
            on: {
              START: "done",
            },
          },
          done: {
            type: "final",
          },
        },
      },
    );
    const module = flow.module(
      "BehaviorTypes",
      {
        machines: {
          machine,
        },
      },
      {
        screens: ["Overview"],
      },
    );
    const app = flow.app({
      modules: [module],
    });
    const stories = flowInspect.flowStories(machine, [
      {
        id: "start",
        title: "Start",
        events: [{ type: "START" }],
        expectedState: "done",
      },
    ]);
    const target: flowInspect.FlowBehaviorBuildTarget = {
      app,
      stories: [stories],
    };
    const gateway: flowInspect.FlowBehaviorGateway = target;
    const contract = flowInspect.buildBehaviorContract(gateway);
    const renderOptions: flowInspect.FlowBehaviorRenderOptions = {
      moduleId: "BehaviorTypes",
    };
    const coverageOptions: flowInspect.FlowBehaviorCoverageRenderOptions = {
      moduleId: "BehaviorTypes",
    };
    const diffOptions: flowInspect.FlowBehaviorDiffOptions = {
      moduleId: "BehaviorTypes",
    };
    const slice = flowInspect.sliceBehaviorContract(contract, "BehaviorTypes");
    const brief = flowInspect.renderBehaviorContract(contract, renderOptions);
    const coverage = flowInspect.renderBehaviorCoverage(target, coverageOptions);
    const diff = flowInspect.diffBehaviorContracts(contract, contract, diffOptions);
    const diffRender = flowInspect.renderBehaviorDiff(diff);

    expectType<flowInspect.FlowBehaviorContract>(contract);
    expectType<string>(contract.app.id);
    expectType<ReadonlyArray<flowInspect.FlowBehaviorModule>>(contract.modules);
    expectType<ReadonlyArray<flowInspect.FlowBehaviorMachine>>(contract.machines);
    expectType<"default" | "snapshot" | "setup" | undefined>(contract.stories[0]?.start);
    expectType<string>(brief);
    expectType<string>(coverage);
    expectType<flowInspect.FlowBehaviorDiffDescriptor>(diff);
    expectType<string>(diffRender);
    expectType<flowInspect.FlowBehaviorContract>(slice);
  });

  it("types story seeds across inspect and testing helpers", () => {
    const fixtureResource = flow.resource<[projectId: string], ProjectRecord>({
      id: "StorySeed.types.project",
      key: (projectId) => createKey("story-seed-types", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: `Project ${projectId}` }),
    });
    const machine = flow.machine<{}, never, "idle">({
      id: "StorySeed.types.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const fixtureModule = flow.module(
      "StorySeedFixture",
      {
        resources: {
          project: fixtureResource,
        },
        fixtures: {
          inventorySeed: [
            {
              ref: fixtureResource.ref("project-1"),
              value: { id: "project-1", name: "Seeded project" },
            },
          ],
        },
      },
      {
        fixtures: ["inventorySeed"] as const,
      },
    );
    const fixtureApp = flow.app({
      modules: [fixtureModule],
    });
    const boot = {
      version: "flow-state/runtime-boot.v1",
      resources: [],
      actors: [],
    } satisfies flowServer.FlowRuntimeBootPayload;

    const seededStories = flowInspect.flowStories(machine, [
      {
        id: "seeded-story",
        title: "Seeded story",
        start: {
          kind: "setup" as const,
          description: "Restore and seed before the story runs.",
        },
        seed: {
          resources: [
            {
              ref: fixtureResource.ref("project-1"),
              value: { id: "project-1", name: "Seeded project" },
            },
          ],
          boot,
          actorId: "story.actor",
        },
        events: [],
      },
    ]);
    const fixtureStories = flowInspect.flowStories(machine, [
      {
        id: "fixture-story",
        title: "Fixture story",
        start: {
          kind: "setup" as const,
          description: "Seed fixtures before the story runs.",
        },
        seed: {
          fixtures: ["inventorySeed"],
        },
        events: [],
      },
    ]);
    const storyDoc = flowInspect.storyToDoc(fixtureStories.stories[0]!);
    const rehydrated = test.rehydrate(machine, {
      snapshot: machine.getInitialSnapshot(),
      boot,
    });
    const appRehydrated = test.app(fixtureApp).rehydrate(machine, {
      snapshot: machine.getInitialSnapshot(),
      boot,
      fixtures: ["inventorySeed"],
    });

    expectType<flowInspect.FlowStorySeed>(seededStories.stories[0]!.seed!);
    expectType<ReadonlyArray<flowState.FlowSeededResource>>(
      seededStories.stories[0]!.seed?.resources ?? [],
    );
    expectType<flowInspect.FlowStoriesDescriptor<typeof machine, "inventorySeed">>(fixtureStories);
    expectType<ReadonlyArray<"inventorySeed">>(fixtureStories.stories[0]!.seed?.fixtures ?? []);
    expectType<flowInspect.FlowStoryDocSeed<"inventorySeed"> | undefined>(storyDoc.seed);
    expectType<ReadonlyArray<"inventorySeed">>(storyDoc.seed?.fixtures ?? []);
    expectType<Promise<flowTesting.FlowStoryRunOutcome<typeof machine>>>(
      flowTesting.runFlowStory(machine, seededStories.stories[0]!),
    );
    expectType<Promise<flowTesting.FlowStoryRunOutcome<typeof machine>>>(
      flowTesting.runFlowStory(fixtureApp, machine, fixtureStories.stories[0]!),
    );
    expectType<FlowRehydratedTestHarness<{}, never, "idle">>(rehydrated);
    expectType<FlowRehydratedTestHarness<{}, never, "idle">>(appRehydrated);
  });

  it("types graph node metadata from the inspect surface", () => {
    const childMachine = flow.machine<{}, never, "idle">({
      id: "Graph.types.child",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "START" }>,
      "draft" | "review" | "timedOut",
      "draft"
    >({
      id: "Graph.types.metadata",
      initial: "draft",
      context: () => ({}),
      states: {
        draft: {
          invoke: flow.child({
            id: "autosave",
            machine: childMachine,
            supervision: "continue-on-failure",
          }),
          after: flow.after({
            id: "graph.types.timeout",
            delay: "1 second",
            target: "timedOut",
          }),
          always: {
            target: "review",
          },
        },
        review: {},
        timedOut: {
          type: "final",
        },
      },
    });

    const graph = flowInspect.graphOf(machine);

    expectType<boolean | undefined>(graph.nodes[0]?.terminal);
    expectType<string | undefined>(graph.nodes[0]?.childSpecs[0]?.id);
    expectType<string | undefined>(graph.nodes[0]?.childSpecs[0]?.machineId);
    expectType<"stop-on-failure" | "continue-on-failure" | undefined>(
      graph.nodes[0]?.childSpecs[0]?.supervision,
    );
    expectType<Duration.Input | undefined>(graph.nodes[0]?.timedTransitions[0]?.delay);
    expectType<"draft" | "review" | "timedOut" | undefined>(
      graph.nodes[0]?.timedTransitions[0]?.target,
    );
    expectType<string | undefined>(graph.nodes[0]?.eventlessTransitions[0]?.id);
    expectType<"draft" | "review" | "timedOut" | undefined>(
      graph.nodes[0]?.eventlessTransitions[0]?.target,
    );
  });

  it("types graph queries from the inspect surface", () => {
    const machine = flow.machine<
      { readonly name: string },
      | Readonly<{ readonly type: "SET_NAME"; readonly name: string }>
      | Readonly<{ readonly type: "REVIEW" }>
      | Readonly<{ readonly type: "REOPEN" }>
      | Readonly<{ readonly type: "PUBLISH" }>,
      "draft" | "review" | "published",
      "draft"
    >({
      id: "Graph.types.queries",
      initial: "draft",
      context: () => ({ name: "" }),
      states: {
        draft: {
          on: {
            SET_NAME: {
              update: ({ event }) => (event.type === "SET_NAME" ? { name: event.name } : {}),
            },
            REVIEW: "review",
          },
        },
        review: {
          on: {
            REOPEN: "draft",
            PUBLISH: "published",
          },
        },
        published: {
          type: "final",
        },
      },
    });

    const graph = flowInspect.graphOf(machine);

    expectType<Readonly<{ readonly id: "draft" | "review" | "published" }> | undefined>(
      graph.findState("review"),
    );
    expectType<
      ReadonlyArray<
        Readonly<{
          readonly source: "draft" | "review" | "published";
          readonly target: "draft" | "review" | "published";
          readonly eventType: "SET_NAME" | "REVIEW" | "REOPEN" | "PUBLISH";
        }>
      >
    >(graph.incomingEdges("published"));
    expectType<ReadonlyArray<"SET_NAME" | "REVIEW" | "REOPEN" | "PUBLISH">>(
      graph.outgoingEvents("draft"),
    );
    expectType<ReadonlyArray<Readonly<{ readonly id: "draft" | "review" | "published" }>>>(
      graph.reachableStates(),
    );
  });

  it("types graph path utilities from the inspect surface", () => {
    const machine = flow.machine<
      { readonly allowed: boolean },
      | Readonly<{ readonly type: "NEXT" }>
      | Readonly<{ readonly type: "ALLOW" }>
      | Readonly<{ readonly type: "PROCEED" }>,
      "start" | "idle" | "done",
      "start"
    >({
      id: "Graph.types.paths",
      initial: "start",
      context: () => ({ allowed: false }),
      states: {
        start: {
          on: {
            NEXT: {
              target: "idle",
            },
          },
        },
        idle: {
          on: {
            ALLOW: {
              update: () => ({ allowed: true }),
            },
            PROCEED: {
              target: "done",
              guard: ({ context }) => context.allowed,
            },
          },
        },
        done: {
          type: "final",
        },
      },
    });

    const graph = flowInspect.graphOf(machine);
    const stories = flowInspect.flowStories(machine, [
      {
        id: "done-path",
        title: "Done path",
        events: [{ type: "NEXT" }, { type: "ALLOW" }, { type: "PROCEED" }],
        expectedState: "done",
        expectedFacts: {
          outcomeKinds: ["success"],
        },
      },
    ]);
    const coverage = graph.storyCoverage(stories);

    expectType<ReadonlyArray<Readonly<{ readonly description: string }>>>(graph.shortestPaths());
    expectType<ReadonlyArray<Readonly<{ readonly weight: number }>>>(
      graph.simplePaths({ maxDepth: 2 }),
    );
    expectType<
      | Readonly<{ readonly state: Readonly<{ readonly value: "start" | "idle" | "done" }> }>
      | undefined
    >(graph.pathFromEvents([{ type: "NEXT" }, { type: "ALLOW" }, { type: "PROCEED" }]));
    expectType<
      ReadonlyArray<
        Readonly<{ readonly event: Readonly<{ readonly type: "NEXT" | "ALLOW" | "PROCEED" }> }>
      >
    >(graph.shortestPaths()[0]?.steps ?? []);
    expectType<flowInspect.FlowStoryCoverageDescriptor<typeof machine>>(coverage);
    expectType<"covered" | "mismatch" | "blocked" | undefined>(coverage.stories[0]?.status);
  });

  it("types graph JSON exports from the inspect surface", () => {
    const machine = flow.machine<
      { readonly name: string },
      | Readonly<{ readonly type: "SET_NAME"; readonly name: string }>
      | Readonly<{ readonly type: "REVIEW" }>
      | Readonly<{ readonly type: "PUBLISH" }>,
      "draft" | "review" | "published",
      "draft"
    >({
      id: "Graph.types.json",
      initial: "draft",
      context: () => ({ name: "" }),
      states: {
        draft: {
          on: {
            SET_NAME: {
              update: ({ event }) => (event.type === "SET_NAME" ? { name: event.name } : {}),
            },
            REVIEW: "review",
          },
        },
        review: {
          on: {
            PUBLISH: "published",
          },
        },
        published: {
          type: "final",
        },
      },
    });

    const projectModule = flow.module(
      "Project",
      {
        machines: {
          editorFlow: machine,
        },
      },
      {
        screens: ["editor"],
        tags: ["project"],
      },
    );
    const app = flow.app({
      modules: [projectModule],
    });
    const graph = flowInspect.graphOf(machine);
    const exported = graph.toJSON();
    const moduleExport = graph.toJSON({
      source: projectModule,
    });
    const appExport = graph.toJSON({
      source: app,
    });
    const options: flowInspect.FlowGraphJsonOptions = {
      source: projectModule,
    };
    void options;

    expectType<"graph">(exported.kind);
    expectType<string>(exported.machineId);
    expectType<"draft">(exported.initial);
    expectType<ReadonlyArray<Readonly<{ readonly id: "draft" | "review" | "published" }>>>(
      exported.nodes,
    );
    expectType<
      ReadonlyArray<
        Readonly<{
          readonly source: "draft" | "review" | "published";
          readonly target: "draft" | "review" | "published";
          readonly eventType: "SET_NAME" | "REVIEW" | "PUBLISH";
        }>
      >
    >(exported.edges);
    expectType<flowInspect.FlowGraphOwnershipOverlay | undefined>(moduleExport.ownership);
    expectType<flowInspect.FlowGraphOwnershipOverlay | undefined>(appExport.ownership);
    expectType<string | undefined>(moduleExport.ownership?.appId);
    expectType<string>(moduleExport.ownership?.moduleId ?? "");
    expectType<ReadonlyArray<string> | undefined>(moduleExport.ownership?.screens);
    expectType<ReadonlyArray<string> | undefined>(moduleExport.ownership?.tags);
  });

  it("types pure transition inspection from the inspect surface", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }> | Readonly<{ readonly type: "UNKNOWN" }>,
      "idle" | "ready"
    >({
      id: "Inspect.transition.types",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
        ready: {},
      },
    });

    const inspection = flowInspect.inspectTransition(machine, machine.getInitialSnapshot(), {
      type: "ADVANCE",
    });

    expectType<"transition-inspection">(inspection.kind);
    expectType<boolean>(inspection.matched);
    expectType<"idle" | "ready" | undefined>(inspection.target);
    expectType<
      ReadonlyArray<
        Readonly<{
          readonly index: number;
          readonly target: "idle" | "ready";
          readonly guard: "pass" | "fail" | "not-applicable" | "skipped";
          readonly hasUpdate: boolean;
          readonly actionCounts: Readonly<{
            readonly exit: number;
            readonly transition: number;
            readonly entry: number;
          }>;
        }>
      >
    >(inspection.candidates);
    expectType<
      | Readonly<{
          readonly index: number;
          readonly target: "idle" | "ready";
        }>
      | undefined
    >(inspection.chosen);
    expectType<
      flowState.FlowSnapshot<
        { readonly count: number },
        "idle" | "ready",
        { readonly type: "ADVANCE" } | { readonly type: "UNKNOWN" }
      >
    >(inspection.nextSnapshot);
    expectType<ReadonlyArray<FlowReceipt>>(inspection.receipts);
  });

  it("types pure microstep inspection from the inspect surface", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }> | Readonly<{ readonly type: "UNKNOWN" }>,
      "idle" | "ready"
    >({
      id: "Inspect.microsteps.types",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
        ready: {},
      },
    });

    const inspection = flowInspect.inspectMicrosteps(machine, machine.getInitialSnapshot(), {
      type: "ADVANCE",
    });

    expectType<"microstep-inspection">(inspection.kind);
    expectType<boolean>(inspection.matched);
    expectType<
      ReadonlyArray<
        Readonly<{
          readonly step: number;
          readonly trigger: "event" | "always" | "after";
          readonly from: "idle" | "ready";
          readonly to: "idle" | "ready";
          readonly index: number;
          readonly reenter: boolean;
          readonly guard: "pass" | "not-applicable";
          readonly hasUpdate: boolean;
          readonly actionCounts: Readonly<{
            readonly exit: number;
            readonly transition: number;
            readonly entry: number;
          }>;
          readonly snapshot: flowState.FlowSnapshot<
            { readonly count: number },
            "idle" | "ready",
            { readonly type: "ADVANCE" } | { readonly type: "UNKNOWN" }
          >;
          readonly receipts: ReadonlyArray<FlowReceipt>;
        }>
      >
    >(inspection.steps);
    expectType<Readonly<{ readonly step: number; readonly limit: number }> | undefined>(
      inspection.limitReached,
    );
    expectType<
      flowState.FlowSnapshot<
        { readonly count: number },
        "idle" | "ready",
        { readonly type: "ADVANCE" } | { readonly type: "UNKNOWN" }
      >
    >(inspection.nextSnapshot);
    expectType<ReadonlyArray<FlowReceipt>>(inspection.receipts);
  });

  it("types pure action inspection from the inspect surface", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }> | Readonly<{ readonly type: "UNKNOWN" }>,
      "idle" | "ready"
    >({
      id: "Inspect.actions.types",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
              actions: () => ({
                type: "domain:transition",
              }),
            },
          },
        },
        ready: {},
      },
    });

    const inspection = flowInspect.inspectActions(machine, machine.getInitialSnapshot(), {
      type: "ADVANCE",
    });

    expectType<"action-inspection">(inspection.kind);
    expectType<boolean>(inspection.matched);
    expectType<
      ReadonlyArray<
        | Readonly<{
            readonly kind: "update";
            readonly step: number;
            readonly trigger: "event" | "always" | "after";
            readonly from: "idle" | "ready";
            readonly to: "idle" | "ready";
            readonly transitionIndex: number;
            readonly index: number;
            readonly snapshot: flowState.FlowSnapshot<
              { readonly count: number },
              "idle" | "ready",
              { readonly type: "ADVANCE" } | { readonly type: "UNKNOWN" }
            >;
            readonly receipt: FlowReceipt;
          }>
        | Readonly<{
            readonly kind: "action";
            readonly step: number;
            readonly trigger: "event" | "always" | "after";
            readonly from: "idle" | "ready";
            readonly to: "idle" | "ready";
            readonly transitionIndex: number;
            readonly phase: "exit" | "transition" | "entry";
            readonly index: number;
            readonly snapshot: flowState.FlowSnapshot<
              { readonly count: number },
              "idle" | "ready",
              { readonly type: "ADVANCE" } | { readonly type: "UNKNOWN" }
            >;
            readonly receipt: FlowReceipt;
            readonly emitted: ReadonlyArray<FlowReceipt>;
          }>
      >
    >(inspection.facts);
    expectType<
      ReadonlyArray<
        flowInspect.FlowPlannedEffectFact<
          { readonly count: number },
          { readonly type: "ADVANCE" } | { readonly type: "UNKNOWN" },
          "idle" | "ready"
        >
      >
    >(inspection.effects);
    expectType<
      flowState.FlowSnapshot<
        { readonly count: number },
        "idle" | "ready",
        { readonly type: "ADVANCE" } | { readonly type: "UNKNOWN" }
      >
    >(inspection.nextSnapshot);
    expectType<ReadonlyArray<FlowReceipt>>(inspection.receipts);
  });

  it("types why-no-transition explanations from the inspect surface", () => {
    const machine = flow.machine<
      { readonly count: number },
      | Readonly<{ readonly type: "ADVANCE" }>
      | Readonly<{ readonly type: "UNKNOWN" }>
      | Readonly<{ readonly type: "SAVE" }>,
      "idle" | "ready"
    >({
      id: "Inspect.why-no-transition.types",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
            },
          },
        },
        ready: {
          on: {
            SAVE: "idle",
          },
        },
      },
    });

    const explanation = flowInspect.whyNoTransition(machine, machine.getInitialSnapshot(), {
      type: "UNKNOWN",
    });

    expectType<flowInspect.FlowNoTransitionExplanation | undefined>(explanation);
    expectType<"no-transition-explanation" | undefined>(explanation?.kind);
    expectType<
      "unknown" | "ignored-in-state" | "blocked-by-guard" | "stopped-by-microstep-limit" | undefined
    >(explanation?.reason);
    expectType<string | undefined>(
      explanation === undefined ? undefined : flowInspect.formatNoTransitionSummary(explanation),
    );
    expectType<ReadonlyArray<string> | undefined>(explanation?.availableInStates);
    expectType<ReadonlyArray<number> | undefined>(explanation?.guardFailures);
    expectType<Readonly<{ readonly step: number; readonly limit: number }> | undefined>(
      explanation?.limitReached,
    );
    expectType<
      | flowState.FlowSnapshot<
          { readonly count: number },
          "idle" | "ready",
          { readonly type: "ADVANCE" } | { readonly type: "UNKNOWN" } | { readonly type: "SAVE" }
        >
      | undefined
    >(explanation?.nextSnapshot);
    expectType<ReadonlyArray<FlowReceipt> | undefined>(explanation?.receipts);
  });

  it("preserves resource value types through runtime resource reads and subscriptions", () => {
    const resource = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      EffectType.Effect<ProjectRecord, never, never>,
      "Runtime.project"
    >({
      id: "Runtime.project",
      key: (projectId: string) => createKey("runtime-project", projectId),
      lookup: (projectId: string) =>
        Effect.succeed({
          id: projectId,
          name: "Runtime project",
        } satisfies ProjectRecord),
    });
    const ref = resource.ref("project-1");
    const runtime = createTestRuntimeWithInstallers();
    expectType<ProjectRecord | undefined>(runtime.resources.get(ref)?.value);
    expectType<ReadonlyArray<flowState.FlowResourceSnapshot>>(runtime.resources.inspect());
    expectType<ReadonlyArray<flowState.FlowResourceHydrationEntry>>(runtime.resources.dehydrate());

    const unsubscribe = runtime.resources.subscribe(ref, (snapshot) => {
      expectType<ProjectRecord | undefined>(snapshot.value);
    });
    unsubscribe();

    runtime.resources.hydrate([
      {
        ref,
        snapshot: {
          value: { id: "project-1", name: "Hydrated project" },
          updatedAt: 1,
        },
      },
    ]);

    const boot = runtime.dehydrateBoot();
    expectType<ReadonlyArray<flowState.FlowResourceHydrationEntry>>(boot.resources);
    expectType<ReadonlyArray<flowServer.FlowRuntimeBootActorSnapshot>>(boot.actors);
    expectType<"flow-state/runtime-boot.v1">(boot.version);

    const restoredBoot = runtime.hydrateBoot(boot);
    expectType<flowState.FlowActorSnapshotTree | undefined>(
      restoredBoot.actorSnapshot("runtime.project.actor"),
    );
  });

  it("types serializable actor snapshots across actor restore", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "INC" }>,
      "idle"
    >({
      id: "Trace.actor-restore",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            INC: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });
    const runtime = createTestRuntimeWithInstallers();

    const actor = runtime.createActor(machine);
    expectType<flowState.FlowActorSnapshotTree>(actor.serialize());

    const restored = runtime.createActor(machine, {
      id: "Trace.actor-restore.runtime",
      snapshot: actor.serialize(),
    });

    expectType<number>(restored.snapshot().context.count);

    const boot = runtime.dehydrateBoot({
      actors: [actor],
    });
    expectType<flowState.FlowActorSnapshotTree | undefined>(
      runtime.hydrateBoot(boot).actorSnapshot(actor.id),
    );
  });

  it("types the public runtime inspection surface", () => {
    const runtime = createTestRuntimeWithInstallers();

    expectType<ReadonlyArray<flowInspect.FlowInspectionEvent>>(runtime.inspection.entries());
    expectType<ReadonlyArray<flowInspect.FlowInspectionEvent>>(runtime.inspection.export());
    const retention: flowInspect.FlowInspectionRetentionPolicy = {
      maxEvents: 10,
      maxAge: "1 second",
    };
    expectType<void>(runtime.inspection.setRetention(retention));
    expectType<flowInspect.FlowInspectionRetentionPolicy>(runtime.inspection.retention());
    const filter: flowInspect.FlowInspectionFilter = {
      family: "machine",
      afterSequence: 0,
    };
    expectType<ReadonlyArray<flowInspect.FlowInspectionEvent>>(runtime.inspection.entries(filter));
    const inspectionSnapshot = runtime.inspection.snapshot(filter);
    expectType<number>(inspectionSnapshot.capturedAt);
    expectType<number | undefined>(inspectionSnapshot.lastSequence);
    expectType<ReadonlyArray<flowInspect.FlowInspectionEvent>>(inspectionSnapshot.entries);
    expectType<ReadonlyArray<string>>(
      runtime.inspection.export({
        filter,
        redact: (event) => ({
          type: event.type,
          actorId: event.actorId,
        }),
        serialize: (event) => JSON.stringify(event),
      }),
    );
    const unsubscribe = runtime.inspection.subscribe((event) => {
      expectType<string>(event.type);
      expectType<string>(event.actorId);
      expectType<string>(event.rootActorId);
      expectType<number>(event.sequence);
      expectType<number>(event.timestamp);
      expectType<string | undefined>(event.modulePath);
      expectType<string | undefined>(event.ownerPath);
      expectType<string | undefined>(event.machineName);
      expectType<ReadonlyArray<string> | undefined>(event.screens);
      expectType<ReadonlyArray<string> | undefined>(event.tags);
      expectType<ReadonlyArray<string> | undefined>(event.dependencies);
      expectType<ReadonlyArray<string> | undefined>(event.permissions);
      if (event.type === "child:start") {
        expectType<string>(event.childActorId);
      }
      if (event.type === "actor:snapshot") {
        expectType<flowState.FlowActorSnapshotTree>(event.snapshot);
      }
    }, filter);
    const observerSubscription = runtime.inspection.subscribe({
      next: (event) => {
        expectType<string>(event.actorId);
      },
      error: (error) => {
        expectType<unknown>(error);
      },
      complete: () => {},
    });
    expectType<() => void>(unsubscribe);
    expectType<boolean>(unsubscribe.closed);
    unsubscribe();
    observerSubscription.unsubscribe();

    const issue = {} as flowState.FlowIssue;
    expectType<string | undefined>(issue.facts?.parentState);
    expectType<string | undefined>(issue.facts?.correlationId);
    expectType<ReadonlyArray<string> | undefined>(issue.facts?.receiptTypes);
    expectType<ReadonlyArray<string> | undefined>(issue.facts?.relatedIds);
  });

  it("types transport-neutral inspection sinks", () => {
    const runtime = createTestRuntimeWithInstallers();
    const stringSink = flowInspect.createInspectionBufferSink<string>();
    const eventSink = flowInspect.createInspectionBufferSink();
    const connected = flowInspect.attachInspectionSink(runtime.inspection, stringSink, {
      includeHistory: true,
      filter: {
        family: "machine",
      },
      redact: (event) => ({
        type: event.type,
        sequence: event.sequence,
      }),
      serialize: ({ type, sequence }) => `${sequence}:${type}`,
    });
    const observerConnected = flowInspect.attachInspectionSink(runtime.inspection, {
      next: (event) => {
        expectType<string>(event.type);
      },
    });

    expectType<flowInspect.FlowInspectionBufferSink<string>>(stringSink);
    expectType<ReadonlyArray<string>>(stringSink.messages());
    expectType<void>(stringSink.clear());
    expectType<flowInspect.FlowInspectionBufferSink>(eventSink);
    expectType<ReadonlyArray<flowInspect.FlowInspectionEvent>>(eventSink.messages());
    expectType<flowInspect.FlowInspectionSubscription>(connected);
    expectType<flowInspect.FlowInspectionSubscription>(observerConnected);
    connected.unsubscribe();
    observerConnected.unsubscribe();
  });

  it("accepts the final transaction contract and rejects legacy fields", () => {
    const loadProject = (projectId: string): EffectType.Effect<ProjectRecord> =>
      Effect.succeed({ id: projectId, name: "Atlas" });

    const resource = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      ReturnType<typeof loadProject>
    >({
      id: "Project.byId",
      key: (projectId: string) => createKey("project", projectId),
      lookup: loadProject,
    });
    const projectTag = createTag("project");

    const transaction = flow.transaction<
      { readonly id: string },
      ProjectRecord,
      SaveError,
      ProjectRepo,
      SaveEvent,
      "Project.save"
    >({
      id: "Project.save",
      params: () => ({ id: "project-1" }),
      preview: {
        apply: ({ params }) => [
          {
            ref: resource.ref(params.id),
            replace: {
              id: params.id,
              name: "Atlas v2",
            },
          },
        ],
      },
      commit: (params) =>
        Effect.succeed({
          id: params.id,
          name: "Atlas v2",
        }) as EffectType.Effect<ProjectRecord, SaveError, ProjectRepo>,
      invalidates: ({ params }) => [projectTag, createKey("project", params.id)],
      routes: flow.outcomes<ProjectRecord, SaveError, SaveEvent>({
        success: ({ value }) => ({ type: "SAVED", value }),
        failure: ({ error }) => ({ type: "FAILED", error }),
      }),
      scope: {
        id: "project-saves",
      },
      concurrency: "serialize",
    });

    expect(transaction.kind).toBe("transaction");
    expect(transaction.id).toBe("Project.save");
    expectType<"Project.save">(transaction.id);
    expect(transaction.config.concurrency).toBe("serialize");
    expect(transaction.config.scope).toEqual({
      id: "project-saves",
    });
    expect(transaction.config.preview?.apply({ params: { id: "project-1" } })).toEqual([
      {
        ref: resource.ref("project-1"),
        replace: {
          id: "project-1",
          name: "Atlas v2",
        },
      },
    ]);

    flow.transaction({
      id: "legacy.input",
      // @ts-expect-error transaction.input was removed from the public contract
      input: () => ({ id: "project-1" }),
      commit: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
    });

    flow.transaction({
      id: "legacy.effect",
      // @ts-expect-error transaction.effect was removed from the public contract
      effect: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
      commit: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
    });

    flow.transaction({
      id: "legacy.optimistic",
      // @ts-expect-error transaction.optimistic was removed from the public contract
      optimistic: { apply: () => [] },
      commit: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
    });

    flow.transaction({
      id: "preview.replace-mismatch",
      preview: {
        apply: () => [
          // @ts-expect-error preview replace values must match the resource value type
          {
            ref: resource.ref("project-1"),
            replace: { id: 123, name: "Atlas v2" },
          },
        ],
      },
      commit: (_params: { readonly id: string }) => Effect.succeed(resource.ref("project-1")),
    });
  });

  it("preserves machine, module, and app descriptors without triggering app-time work", () => {
    type MachineEvent =
      | Readonly<{ readonly type: "LOAD" }>
      | Readonly<{ readonly type: "READY"; readonly project: ProjectRecord }>;

    const loadProject = (projectId: string): EffectType.Effect<ProjectRecord> =>
      Effect.succeed({ id: projectId, name: "Atlas" });

    const resource = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      ReturnType<typeof loadProject>
    >({
      id: "Project.byId",
      key: (projectId: string) => createKey("project", projectId),
      lookup: loadProject,
    });

    const machineConfig = {
      id: "Project.editor",
      initial: "idle",
      context: () => ({ selectedId: null }),
      states: {
        idle: {
          exit: ({ context, event, value, snapshot }) => {
            expectType<string | null>(context.selectedId);
            expectType<MachineEvent>(event);
            expectType<"idle" | "loading" | "ready">(value);
            expectType<"idle" | "loading" | "ready">(snapshot.value);
            return { type: "machine:idle-exit" };
          },
          on: {
            LOAD: {
              target: "loading",
              actions: ({ context, event, value }) => {
                expectType<string | null>(context.selectedId);
                expectType<Extract<MachineEvent, { readonly type: "LOAD" }>>(event);
                expectType<"idle" | "loading" | "ready">(value);
                return [{ type: "machine:load-action" }];
              },
            },
          },
        },
        loading: {
          entry: ({ context, event, value, snapshot }) => {
            expectType<string | null>(context.selectedId);
            expectType<MachineEvent>(event);
            expectType<"idle" | "loading" | "ready">(value);
            expectType<"idle" | "loading" | "ready">(snapshot.value);
            return { type: "machine:loading-entry" };
          },
          invoke: flow.ensure(resource.ref("project-1")),
          on: {
            READY: {
              target: "ready",
              actions: [
                ({ event }) => {
                  expectType<Extract<MachineEvent, { readonly type: "READY" }>>(event);
                  expectType<ProjectRecord>(event.project);
                },
              ],
            },
          },
        },
        ready: {
          always: {
            guard: ({ context, event, value, snapshot }) => {
              expectType<string | null>(context.selectedId);
              expectType<MachineEvent>(event);
              expectType<"idle" | "loading" | "ready">(value);
              expectType<"idle" | "loading" | "ready">(snapshot.value);
              return event.type === "LOAD";
            },
            actions: ({ event }) => {
              expectType<MachineEvent>(event);
              return { type: "machine:ready-always" };
            },
          },
        },
      },
    } satisfies flowState.FlowMachineConfig<
      "Project.editor",
      { readonly selectedId: string | null },
      MachineEvent,
      "idle" | "loading" | "ready",
      "idle"
    >;

    const machine = flow.machine(machineConfig);
    expectType<"Project.editor">(machine.id);

    flow.machine({
      id: "Project.editor.unsupported-on-done",
      initial: "idle",
      context: () => ({ selectedId: null as string | null }),
      states: {
        idle: {
          // @ts-expect-error Flow State does not expose XState-style onDone transitions
          onDone: "ready",
        },
        ready: {},
      },
    });

    flow.machine({
      id: "Project.editor.unsupported-parallel",
      initial: "idle",
      context: () => ({ selectedId: null as string | null }),
      states: {
        idle: {
          // @ts-expect-error Flow State only supports type: "final" state nodes
          type: "parallel",
        },
        ready: {},
      },
    });

    flow.machine({
      id: "Project.editor.unsupported-history",
      initial: "idle",
      context: () => ({ selectedId: null as string | null }),
      states: {
        idle: {},
        historyKind: {
          // @ts-expect-error Flow State does not expose XState history state nodes
          type: "history",
        },
        historyConfig: {
          // @ts-expect-error Flow State does not expose XState history depth configuration
          history: "deep",
        },
      },
    });

    type IdleEvent = flowState.FlowEventForState<MachineEvent, typeof machineConfig.states, "idle">;
    type LoadingEvent = flowState.FlowEventForState<
      MachineEvent,
      typeof machineConfig.states,
      "loading"
    >;
    type ReadyEvent = flowState.FlowEventForState<
      MachineEvent,
      typeof machineConfig.states,
      "ready"
    >;
    type IdleEventType = keyof NonNullable<typeof machineConfig.states.idle.on>;
    type LoadingEventType = keyof NonNullable<typeof machineConfig.states.loading.on>;

    const idleEventType: IdleEventType = "LOAD";
    const loadingEventType: LoadingEventType = "READY";
    void idleEventType;
    void loadingEventType;

    // @ts-expect-error idle only defines LOAD
    const invalidIdleEventType: IdleEventType = "READY";
    void invalidIdleEventType;

    const idleEvent: IdleEvent = { type: "LOAD" };
    expectType<Extract<MachineEvent, { readonly type: "LOAD" }>>(idleEvent);

    const loadingEvent: LoadingEvent = {
      type: "READY",
      project: { id: "project-1", name: "Atlas" },
    };
    expectType<Extract<MachineEvent, { readonly type: "READY" }>>(loadingEvent);

    // @ts-expect-error ready has no legal events configured
    const readyEvent: ReadyEvent = { type: "LOAD" };
    void readyEvent;

    const invalidIdleEvent: IdleEvent = {
      // @ts-expect-error idle only accepts LOAD
      type: "READY",
      project: { id: "project-1", name: "Atlas" },
    };
    void invalidIdleEvent;

    const view = flow.view<
      { readonly selectedId: string | null },
      "idle" | "loading" | "ready",
      {
        readonly state: "idle" | "loading" | "ready";
        readonly selectedId: string | null;
        readonly issueCount: number;
      },
      "Project.editorView"
    >({
      id: "Project.editorView",
      sources: [
        "context",
        "resources",
        "transactions",
        "streams",
        "timers",
        "children",
        "issues",
        "receipts",
      ],
      select: ({
        context,
        value,
        resources,
        transactions,
        streams,
        timers,
        children,
        issues,
        receipts,
      }) => {
        const resourceSnapshot = resources["Project.byId"];
        const transactionSnapshot = transactions["Project.save"];
        const streamSnapshot = streams["Project.activity"];
        const timerSnapshot = timers["Project.refresh"];
        const childSnapshot = children["Project.child"];

        expectType<string | null>(context.selectedId);
        expectType<"idle" | "loading" | "ready">(value);
        expectType<number>(issues.length);
        expectType<number>(receipts.length);
        expectType<string | undefined>(resourceSnapshot?.status);
        expectType<string | undefined>(transactionSnapshot?.status);
        expectType<string | undefined>(streamSnapshot?.status);
        expectType<number | undefined>(timerSnapshot?.dueAt);
        expectType<string | undefined>(childSnapshot?.status);

        // @ts-expect-error view selectors only receive readonly context
        context.selectedId = "project-2";
        // @ts-expect-error resource projections are readonly snapshots, not definitions
        resources["Project.byId"] = undefined;
        // @ts-expect-error transaction projections do not expose commit controls
        void transactionSnapshot?.commit;
        // @ts-expect-error stream projections do not expose subscription controls
        void streamSnapshot?.subscribe;
        // @ts-expect-error timer projections do not expose cancellation controls
        void timerSnapshot?.cancel;
        // @ts-expect-error child projections are snapshots, not live actors
        childSnapshot?.send({ type: "RETRY" });
        // @ts-expect-error issues are readonly facts
        issues.push({
          kind: "failure",
          source: "transaction",
          id: "Project.save",
        });
        // @ts-expect-error receipts are readonly facts
        receipts.push({ type: "transaction:start", id: "Project.save" });

        return {
          state: value,
          selectedId: context.selectedId,
          issueCount: issues.length,
        };
      },
    });
    expectType<"Project.editorView">(view.id);

    const projectModule = flow.module(
      "Project",
      {
        byId: resource,
        editor: machine,
        editorView: view,
        resources: { byId: resource },
        machines: { editor: machine },
        views: { editorView: view },
      },
      {
        tags: ["project"],
      },
    );

    const expectModuleFactoryRemoved = () => {
      // @ts-expect-error module factories were removed; pass the inventory object directly
      flow.module("Factory", () => ({ resources: {} }));
    };
    void expectModuleFactoryRemoved;
    expect(projectModule.kind).toBe("module");
    expect(projectModule.editor.kind).toBe("machine");
    expect(projectModule.editorView.kind).toBe("view");

    const auditMachine = flow.machine<
      { readonly entries: number },
      never,
      "idle",
      "idle",
      "Audit.timeline"
    >({
      id: "Audit.timeline",
      initial: "idle",
      context: () => ({ entries: 0 }),
      states: {
        idle: {},
      },
    });

    const auditModule = flow.module("Audit", {
      timeline: auditMachine,
      machines: { timeline: auditMachine },
    });

    const app = flow.app({
      modules: [projectModule, auditModule],
    });

    expect(app.kind).toBe("app");
    expect(app.modules).toEqual([projectModule, auditModule]);
    expect(app.moduleMap.Project).toBe(projectModule);
    expect(app.moduleMap.Audit).toBe(auditModule);
    expectType<typeof projectModule>(app.moduleMap.Project);
    expectType<typeof auditModule>(app.moduleMap.Audit);
    expectType<"Project">(app.moduleMap.Project.id);
    expectType<"Audit">(app.moduleMap.Audit.id);
    expectType<"Project.editor">(app.moduleMap.Project.editor.id);
    expectType<"Project.editorView">(app.moduleMap.Project.editorView.id);
    expectType<"Audit.timeline">(app.moduleMap.Audit.timeline.id);
    expect(machine.getInitialSnapshot()).toMatchObject({
      value: "idle",
      context: { selectedId: null },
    });

    const appLayer = app.layer({
      store: flow.store.memory(),
      orchestrators: flow.orchestrators.test(),
      services: [],
    });
    expect(appLayer).toBeDefined();
    expectType<Layer.Layer<never>>(appLayer);

    const analyticsLayer = Layer.effect(
      ProjectAnalytics,
      Effect.map(ProjectConfig, (config) =>
        ProjectAnalytics.of({
          label: Effect.succeed(config.projectId),
        }),
      ),
    );

    const appLayerWithRequirement = app.layer<readonly [typeof analyticsLayer]>({
      store: flow.store.memory(),
      orchestrators: flow.orchestrators.test(),
      services: [analyticsLayer],
    });
    type AppLayerRequirements = Expect<
      Equal<Layer.Services<typeof appLayerWithRequirement>, ProjectConfig>
    >;
    const appLayerRequirements: AppLayerRequirements = true;
    expect(appLayerRequirements).toBe(true);

    expect(() =>
      flow.app({
        modules: [projectModule, flow.module("Project", { duplicate: true })],
      }),
    ).toThrow("Duplicate flow module id: Project");
  });

  it("accepts state-owned stream invokes that derive subscribe params from context", () => {
    type UploadEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "UPLOADED"; readonly assetId: string }>
      | Readonly<{ readonly type: "UPLOAD_DEFECT"; readonly cause: unknown }>;

    const uploadMachine = flow.machine<
      { readonly assets: ReadonlyArray<Readonly<{ readonly id: string }>> },
      UploadEvent,
      "idle" | "uploading",
      "idle",
      "Assets.upload"
    >({
      id: "Assets.upload",
      initial: "idle",
      context: () => ({
        assets: [{ id: "asset-1" }],
      }),
      states: {
        idle: {
          on: {
            START: "uploading",
          },
        },
        uploading: {
          invoke: flow.stream<
            { readonly assets: ReadonlyArray<Readonly<{ readonly id: string }>> },
            UploadEvent,
            ReadonlyArray<Readonly<{ readonly id: string }>>,
            Readonly<{ readonly id: string }>
          >({
            id: "Assets.uploadStream",
            params: ({
              context,
            }: {
              readonly context: {
                readonly assets: ReadonlyArray<Readonly<{ readonly id: string }>>;
              };
            }) => context.assets,
            subscribe: ({ params }) => Stream.fromIterable(params),
            routes: {
              value: (asset) => ({ type: "UPLOADED", assetId: asset.id }),
              defect: (cause) => ({ type: "UPLOAD_DEFECT", cause }),
            },
          }),
        },
      },
    });
    expectType<"Assets.upload">(uploadMachine.id);

    expect(uploadMachine.config.states.uploading.invoke).toMatchObject({
      kind: "stream",
      id: "Assets.uploadStream",
    });
  });

  it("accepts flow.after as a Duration.Input one-shot descriptor", () => {
    const after = flow.after({
      id: "Project.dismiss",
      delay: Duration.seconds(2),
      target: "done" as const,
    });

    expect(after.kind).toBe("after");
    expect(after.id).toBe("Project.dismiss");
    expect(after.config.delay).toEqual(Duration.seconds(2));
  });

  it("preserves the started-builder shape for flowTest(machine)", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "INC" }>,
      "idle"
    >({
      id: "Counter.test",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            INC: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });

    const harness = flowTest(machine).start();
    expect("start" in flowTest).toBe(false);
    expect("app" in flowTest).toBe(false);
    expect("model" in flowTest).toBe(false);
    harness.send({ type: "INC" });

    expectType<number>(harness.context().count);
    expectType<"idle">(harness.state());
    expectType<() => Promise<boolean>>(harness.advanceToNextTimer);
    expectType<
      (
        bounds?: Readonly<{ readonly maxTicks: number; readonly maxFibers: number }>,
      ) => Promise<void>
    >(harness.advanceUntilIdle);
    expectType<
      (
        predicate: (current: typeof harness) => boolean,
        bounds?: Readonly<{ readonly maxTicks: number; readonly maxFibers: number }>,
      ) => Promise<void>
    >(harness.until);
    expectType<
      (
        target:
          | "idle"
          | ((state: "idle", snapshot: ReturnType<typeof harness.snapshot>) => boolean),
        bounds?: Readonly<{ readonly maxTicks: number; readonly maxFibers: number }>,
      ) => Promise<void>
    >(harness.untilState);
    expectType<
      (
        predicate: (receipt: FlowReceipt, receipts: ReadonlyArray<FlowReceipt>) => boolean,
        bounds?: Readonly<{ readonly maxTicks: number; readonly maxFibers: number }>,
      ) => Promise<void>
    >(harness.untilReceipt);
    expectType<
      (
        predicate: (issue: FlowIssue, issues: ReadonlyArray<FlowIssue>) => boolean,
        bounds?: Readonly<{ readonly maxTicks: number; readonly maxFibers: number }>,
      ) => Promise<void>
    >(harness.untilIssue);
    expectType<() => { readonly kind: "trace" }>(harness.trace);
    expectType<() => { readonly kind: "trace" }>(harness.captureTrace);
    expectType<(correlationId: string) => { readonly kind: "trace" } | undefined>(harness.traceFor);
    expectType<number | undefined>(harness.snapshot().timers["Counter.dismiss"]?.generation);
    expectType<string | undefined>(harness.receipts()[0]?.type);
    expectType<number>(harness.pendingWork().activeFibers);
    expectType<string | undefined>(harness.pendingWork().mailboxes[0]?.id);
    expectType<number | undefined>(harness.pendingWork().timers[0]?.dueAt);
    expectType<"scheduled" | "fired" | "interrupt" | undefined>(
      harness.timers().get("Counter.dismiss")?.status,
    );

    const expectLegacyFlowTestStartRemoved = () => {
      // @ts-expect-error flowTest.start(machine) was removed; use flowTest(machine).start()
      flowTest.start(machine);
    };
    void expectLegacyFlowTestStartRemoved;

    const expectLegacyFlowTestAppRemoved = () => {
      // @ts-expect-error flowTest.app(App) was removed; use test.app(App).scenario(machine)
      flowTest.app(flow.app({ modules: [] }));
    };
    void expectLegacyFlowTestAppRemoved;

    const expectLegacyFlowTestModelRemoved = () => {
      // @ts-expect-error flowTest.model(machine) was removed; use test.model(machine)
      flowTest.model(machine);
    };
    void expectLegacyFlowTestModelRemoved;
  });

  it("supports the dominant test(machine).with(...).run() builder flow", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "INC" }>,
      "idle"
    >({
      id: "Counter.test.run",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            INC: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });

    const harness = test(machine)
      .with({
        input: { count: 2 },
        provide: Layer.empty,
      })
      .run();

    harness.send({ type: "INC" });

    expectType<number>(harness.context().count);
    expectType<"idle">(harness.state());
    expectType<string | undefined>(harness.receipts()[0]?.type);
  });

  it("types scenario combinators and summary helpers", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "INC" }>,
      "idle"
    >({
      id: "Counter.test.scenario.combinators",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            INC: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });

    const builder = test(machine);
    expectType<
      (events?: ReadonlyArray<Readonly<{ readonly type: "INC" }>>) => ReturnType<typeof builder.run>
    >(builder.run);

    const harness = builder.run([{ type: "INC" }]);
    harness.sendAll([{ type: "INC" }]);

    expectType<number>(harness.context().count);
    expectType<FlowTestChildTree>(harness.childTree());
    expectType<FlowTestChildSummary>(harness.childSummary());
    expectType<FlowReceiptFacts>(harness.receiptSummary());
    expectType<string | undefined>(harness.receiptSummary().receiptTypes[0]);
    expectType<ReadonlyArray<FlowIssueSummary>>(harness.issueSummary());
    expectType<string | undefined>(harness.issueSummary()[0]?.id);
  });

  it("types rehydration helpers for focused and app-backed scenarios", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "INC" }>,
      "idle"
    >({
      id: "Counter.test.rehydrate",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            INC: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });

    const restored = test.rehydrate(machine, {
      snapshot: machine.getInitialSnapshot(),
      provide: Layer.empty,
    });

    restored.sendAll([{ type: "INC" }]);

    expectType<
      FlowRehydratedTestHarness<{ readonly count: number }, { readonly type: "INC" }, "idle">
    >(restored);
    expectType<number>(restored.context().count);
    expectType<FlowTestChildTree>(restored.childTree());
    expectType<FlowTestChildSummary>(restored.childSummary());
    expectType<(duration: import("effect/Duration").Input) => Promise<void>>(restored.advance);
    expectType<() => Promise<void>>(restored.dispose);

    const fixtureResource = flow.resource<[projectId: string], ProjectRecord>({
      id: "RehydrateFixture.project",
      key: (projectId) => createKey("rehydrate-fixture-module", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: `Fixture ${projectId}` }),
    });
    const fixtureModule = flow.module(
      "RehydrateFixture",
      {
        fixtures: {
          inventorySeed: [
            {
              ref: fixtureResource.ref("project-1"),
              value: { id: "project-1", name: "Seeded project" },
            },
          ],
        },
      },
      {
        fixtures: ["inventorySeed"] as const,
      },
    );
    const fixtureApp = flow.app({
      modules: [fixtureModule],
    });

    test.app(fixtureApp).rehydrate(machine, {
      snapshot: machine.getInitialSnapshot(),
      fixtures: ["inventorySeed"],
    });

    const expectInvalidFixture = () => {
      test.app(fixtureApp).rehydrate(machine, {
        snapshot: machine.getInitialSnapshot(),
        // @ts-expect-error fixture names must come from app metadata during rehydration too
        fixtures: ["missingSeed"],
      });
    };
    void expectInvalidFixture;
  });

  it("replays model paths back through a typed live harness", () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "INC" }> | Readonly<{ readonly type: "SUBMIT" }>,
      "editing" | "submitted"
    >({
      id: "Counter.test.model.replay",
      initial: "editing",
      context: () => ({ count: 0 }),
      states: {
        editing: {
          on: {
            INC: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
            SUBMIT: {
              target: "submitted",
              guard: ({ context }) => context.count > 0,
            },
          },
        },
        submitted: {},
      },
    });

    const model = test.model(machine, {
      input: {
        count: 1,
      },
    });
    const path = model.getShortestPaths({
      events: [{ type: "SUBMIT" }],
    })[0]!;
    const harness = model.replay(path);

    expectType<number>(harness.context().count);
    expectType<"editing" | "submitted">(harness.state());
    expectType<string | undefined>(harness.receipts()[0]?.type);
  });

  it("infers declared fixture names for test.app(App).scenario(...)", () => {
    const fixtureResource = flow.resource<[projectId: string], ProjectRecord>({
      id: "FixtureModule.project",
      key: (projectId) => createKey("fixture-module", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: `Fixture ${projectId}` }),
    });
    const machine = flow.machine<{ readonly ready: boolean }, never, "idle">({
      id: "FixtureModule.machine",
      initial: "idle",
      context: () => ({ ready: false }),
      states: {
        idle: {},
      },
    });
    const fixtureModule = flow.module(
      "FixtureModule",
      {
        fixtures: {
          inventorySeed: [
            {
              ref: fixtureResource.ref("project-1"),
              value: { id: "project-1", name: "Seeded project" },
            },
          ],
        },
      },
      {
        fixtures: ["inventorySeed"] as const,
      },
    );
    const fixtureApp = flow.app({
      modules: [fixtureModule],
    });

    test
      .app(fixtureApp)
      .scenario(machine)
      .with({
        fixtures: ["inventorySeed"],
      })
      .run();

    test
      .app(fixtureApp)
      .scenario(machine)
      .with({
        // @ts-expect-error fixture names must come from app metadata
        fixtures: ["missingSeed"],
      });
  });
});
