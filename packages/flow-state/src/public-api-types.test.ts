import { Context, Duration, Effect, Layer, Stream } from "effect";
import type { Effect as EffectType } from "effect";
import { createElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import * as flowState from "./index.js";
import type {
  FlowChildDefinition,
  FlowActionDefinition,
  FlowAfterDefinition,
  FlowIssue,
  FlowIssueSummary,
  FlowReceipt,
  FlowReceiptFacts,
  FlowRehydratedTestHarness,
  FlowRuntimeCoreServices,
  FlowRuntimeDefaultServices,
  FlowRuntimeDisposeOptions,
  FlowRuntimeHostServices,
  FlowStreamConfig,
  FlowTransactionConfig,
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
    expectType<Promise<void>>(
      runtime.dispose({
        signal: new AbortController().signal,
      }),
    );
    expectType<FlowRuntimeDisposeOptions>({
      signal: new AbortController().signal,
    });

    type _DefaultRuntimeServices = Expect<
      Equal<
        import("effect").ManagedRuntime.ManagedRuntime.Services<typeof runtime.managedRuntime>,
        FlowRuntimeDefaultServices
      >
    >;
    type _RuntimeCoreServices = Expect<
      Equal<FlowRuntimeCoreServices, ResourceStore | OrchestratorSystem | InspectionLog>
    >;
    type _RuntimeHostServices = Expect<
      Equal<FlowRuntimeHostServices, NotificationScheduler | HostSignals | TraceLog>
    >;
    void [
      true as _DefaultRuntimeServices,
      true as _RuntimeCoreServices,
      true as _RuntimeHostServices,
    ];

    const expectDefaultRuntimeRejectsUnknownService = () => {
      // @ts-expect-error flow.runtime() should not pretend that arbitrary services are installed
      return runtime.runPromise(Effect.flatMap(ProjectAnalytics, (analytics) => analytics.label));
    };
    const expectDisposeRejectsInvalidSignal = () => {
      // @ts-expect-error runtime.dispose only accepts a caller-owned AbortSignal
      return runtime.dispose({ signal: "deadline" });
    };
    void expectDefaultRuntimeRejectsUnknownService;
    void expectDisposeRejectsInvalidSignal;
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

  it("keeps runtime layer acquisition errors and requirements visible", () => {
    const analyticsLayer = Layer.effect(
      ProjectAnalytics,
      Effect.flatMap(ProjectConfig, () => Effect.fail("analytics-acquire-failed" as const)),
    );
    const appLayer = flow.app({ modules: [] }).layer<readonly [typeof analyticsLayer]>({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [analyticsLayer],
    });

    type _AppLayerError = Expect<Equal<Layer.Error<typeof appLayer>, "analytics-acquire-failed">>;
    type _AppLayerRequirement = Expect<Equal<Layer.Services<typeof appLayer>, ProjectConfig>>;
    void [true as _AppLayerError, true as _AppLayerRequirement];

    const expectRuntimeRequiresProvidedProjectConfig = () => {
      // @ts-expect-error unprovided ProjectConfig must remain visible at the host boundary
      flow.runtime(appLayer);
    };
    void expectRuntimeRequiresProvidedProjectConfig;

    const providedLayer = appLayer.pipe(
      Layer.provide(Layer.succeed(ProjectConfig, ProjectConfig.of({ projectId: "typed" }))),
    );
    const runtime = flow.runtime(providedLayer);

    expectType<Promise<import("effect").Exit.Exit<void, "analytics-acquire-failed">>>(
      runtime.runPromiseExit(Effect.void),
    );
  });

  it("removes sibling-provided layer requirements exactly when app services compose", async () => {
    const configLayer = Layer.succeed(
      ProjectConfig,
      ProjectConfig.of({
        projectId: "atlas",
      }),
    );
    const analyticsLayer = Layer.effect(
      ProjectAnalytics,
      Effect.map(ProjectConfig, (config) =>
        ProjectAnalytics.of({
          label: Effect.succeed(config.projectId),
        }),
      ),
    );
    const appLayer = flow
      .app({ modules: [] })
      .layer<readonly [typeof configLayer, typeof analyticsLayer]>({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [configLayer, analyticsLayer],
      });

    type _AppLayerRequirement = Expect<Equal<Layer.Services<typeof appLayer>, never>>;
    type _AppLayerError = Expect<Equal<Layer.Error<typeof appLayer>, never>>;
    void [true as _AppLayerRequirement, true as _AppLayerError];

    expect(
      await flowServer.withRequestRuntime(appLayer, (runtime) =>
        runtime.runPromise(Effect.flatMap(ProjectAnalytics, (analytics) => analytics.label)),
      ),
    ).toBe("atlas");
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

  it("keeps compact input-first semantic sentinels exact", () => {
    type SentinelProjectId = `project-${number}`;
    type SentinelProject = Readonly<{
      readonly id: SentinelProjectId;
      readonly name: string;
    }>;
    type SentinelContext = Readonly<{
      readonly activeProjectId: SentinelProjectId;
      readonly revision: number;
    }>;
    type SentinelEvent =
      | Readonly<{ readonly type: "OPEN"; readonly id: SentinelProjectId }>
      | Readonly<{ readonly type: "LOADED"; readonly project: SentinelProject }>
      | Readonly<{ readonly type: "FAILED"; readonly error: "missing" }>;
    type SentinelSaveParams = Readonly<{
      readonly id: SentinelProjectId;
      readonly revision: number;
    }>;

    const loadProject = (
      id: SentinelProjectId,
    ): EffectType.Effect<SentinelProject, "missing", ProjectConfig> =>
      Effect.map(
        ProjectConfig,
        (config): SentinelProject => ({
          id,
          name: config.projectId,
        }),
      );

    const projectResource = flow.resource<
      [id: SentinelProjectId],
      SentinelProject,
      "missing",
      ReturnType<typeof loadProject>,
      "Sentinel.project"
    >({
      id: "Sentinel.project",
      key: (id: SentinelProjectId) => createKey("sentinel", id),
      lookup: loadProject,
    });
    const projectRef = projectResource.ref("project-1");

    expectType<"Sentinel.project">(projectResource.id);
    expectType<[SentinelProjectId]>(projectRef.params);
    expectType<EffectType.Effect<SentinelProject, "missing", ProjectConfig>>(
      projectResource.config.lookup("project-1"),
    );
    // @ts-expect-error resource refs preserve the input-first Params tuple
    projectResource.ref("workspace-1");

    const saveProject = flow.transaction({
      id: "Sentinel.save",
      params: ({ context }: { readonly context: SentinelContext }) => ({
        id: context.activeProjectId,
        revision: context.revision,
      }),
      commit: (params: SentinelSaveParams) =>
        Effect.succeed({
          id: params.id,
          name: `saved-${params.revision}`,
        }),
      routes: flow.outcomes<SentinelProject, never, SentinelEvent>({
        success: ({ value }) => ({ type: "LOADED", project: value }),
      }),
    });

    expectType<"Sentinel.save">(saveProject.id);
    expectType<EffectType.Effect<SentinelProject>>(
      saveProject.config.commit({ id: "project-1", revision: 1 }),
    );
    // @ts-expect-error transaction commit params preserve the input-first selector result
    saveProject.config.commit({ id: "workspace-1", revision: 1 });

    const impossibleFailureRoutes = flow.outcomes<SentinelProject, never, SentinelEvent>({
      success: ({ value }) => ({ type: "LOADED", project: value }),
      // @ts-expect-error transactions with never typed failure cannot declare failure routes
      failure: ({ error }) => ({ type: "FAILED", error }),
    });
    void impossibleFailureRoutes;

    const impossibleSuccessRoutes = flow.outcomes<never, "missing", SentinelEvent>({
      failure: ({ error }) => ({ type: "FAILED", error }),
      // @ts-expect-error transactions with never success cannot declare success routes
      success: ({ value }) => ({ type: "LOADED", project: value }),
    });
    void impossibleSuccessRoutes;

    const narrowSuccessRoutes = flow.outcomes<SentinelProject, "missing", SentinelEvent>({
      // @ts-expect-error success routes must accept the full authored transaction value
      success: ({
        value,
      }: {
        readonly value: Readonly<{ readonly id: "project-1"; readonly name: string }>;
      }) => ({ type: "LOADED", project: value }),
    });
    void narrowSuccessRoutes;

    type SentinelRouteError = "missing" | "denied";
    type SentinelFailureEvent =
      | SentinelEvent
      | Readonly<{ readonly type: "FAILED_ROUTE"; readonly error: SentinelRouteError }>;
    type SentinelOutcomeEvent =
      | SentinelFailureEvent
      | Readonly<{ readonly type: "DEFECTED"; readonly cause: unknown }>
      | Readonly<{ readonly type: "INTERRUPTED"; readonly reason?: unknown }>;

    const narrowFailureRoutes = flow.outcomes<
      SentinelProject,
      SentinelRouteError,
      SentinelFailureEvent
    >({
      // @ts-expect-error failure routes must accept the full authored transaction error
      failure: ({ error }: { readonly error: "missing" }) => ({
        type: "FAILED_ROUTE",
        error,
      }),
    });
    void narrowFailureRoutes;

    const narrowDefectRoutes = flow.outcomes<
      SentinelProject,
      SentinelRouteError,
      SentinelOutcomeEvent
    >({
      // @ts-expect-error defect routes must accept the full unknown defect cause
      defect: ({ cause }: { readonly cause: Error }) => ({
        type: "DEFECTED",
        cause,
      }),
    });
    void narrowDefectRoutes;

    const narrowInterruptRoutes = flow.outcomes<
      SentinelProject,
      SentinelRouteError,
      SentinelOutcomeEvent
    >({
      // @ts-expect-error interrupt routes must accept the full optional unknown interrupt reason
      interrupt: ({ reason }: { readonly reason: "stop" }) => ({
        type: "INTERRUPTED",
        reason,
      }),
    });
    void narrowInterruptRoutes;

    const narrowCommitConfig: FlowTransactionConfig<string, SentinelSaveParams, SentinelProject> = {
      id: "Sentinel.narrow.commit",
      // @ts-expect-error narrower commit callbacks must not back-infer transaction params
      commit: (params: { readonly id: SentinelProjectId; readonly revision: 1 }) =>
        Effect.succeed({
          id: params.id,
          name: `saved-${params.revision}`,
        }),
    };
    void narrowCommitConfig;

    const narrowPreviewConfig: FlowTransactionConfig<string, SentinelSaveParams, SentinelProject> =
      {
        id: "Sentinel.narrow.preview",
        preview: {
          // @ts-expect-error preview callbacks must accept the established transaction params
          apply: ({
            params,
          }: {
            readonly params: { readonly id: SentinelProjectId; readonly revision: 1 };
          }) => [
            {
              ref: projectResource.ref(params.id),
              replace: {
                id: params.id,
                name: `saved-${params.revision}`,
              },
            },
          ],
        },
        commit: (params: SentinelSaveParams) =>
          Effect.succeed({
            id: params.id,
            name: `saved-${params.revision}`,
          }),
      };
    void narrowPreviewConfig;

    const narrowInvalidatesConfig: FlowTransactionConfig<
      string,
      SentinelSaveParams,
      SentinelProject
    > = {
      id: "Sentinel.narrow.invalidates",
      // @ts-expect-error invalidation callbacks must accept the established transaction params
      invalidates: ({
        params,
      }: {
        readonly params: { readonly id: SentinelProjectId; readonly revision: 1 };
      }) => [projectResource.ref(params.id)],
      commit: (params: SentinelSaveParams) =>
        Effect.succeed({
          id: params.id,
          name: `saved-${params.revision}`,
        }),
    };
    void narrowInvalidatesConfig;

    // @ts-expect-error exported machine actions must accept the full authored context family
    const narrowMachineAction: FlowActionDefinition<SentinelContext, SentinelEvent, "idle"> = ({
      context,
    }: {
      readonly context: { readonly activeProjectId: "project-1" };
    }) => ({
      type: "machine:narrow-action",
      id: context.activeProjectId,
    });
    void narrowMachineAction;

    const narrowPackedAfterConfig: FlowAfterDefinition<
      "idle",
      SentinelContext,
      SentinelEvent
    >["config"] = {
      id: "Sentinel.narrow.packed-after",
      delay: "1 second",
      // @ts-expect-error carried timer guards must accept the full authored context family
      guard: ({ context }: { readonly context: { readonly activeProjectId: "project-1" } }) =>
        context.activeProjectId === "project-1",
    };
    void narrowPackedAfterConfig;

    const narrowExportedStream: FlowStreamConfig<
      string,
      SentinelContext,
      SentinelStreamOutcomeEvent,
      SentinelProjectId,
      SentinelProject,
      SentinelStreamError,
      ProjectConfig
    > = {
      id: "Sentinel.narrow.exported.stream",
      // @ts-expect-error exported stream subscriptions must accept the full authored params
      subscribe: ({ params }: { readonly params: "project-1" }) =>
        Stream.fromEffect(loadProject(params)),
      routes: {
        // @ts-expect-error exported stream defect routes must accept unknown causes
        defect: (cause: Error) => ({ type: "STREAM_DEFECT", cause }),
      },
    };
    void narrowExportedStream;

    const projectStream = flow.stream<
      SentinelContext,
      SentinelEvent,
      SentinelProjectId,
      SentinelProject,
      "missing",
      ProjectConfig,
      "Sentinel.projectStream"
    >({
      id: "Sentinel.projectStream",
      params: ({ context }: { readonly context: SentinelContext }) => context.activeProjectId,
      subscribe: ({ params }) => Stream.fromEffect(loadProject(params)),
      routes: {
        value: (project) => ({ type: "LOADED", project }),
        failure: (error) => ({ type: "FAILED", error }),
      },
    });

    expectType<Stream.Stream<SentinelProject, "missing", ProjectConfig>>(
      projectStream.config.subscribe({ params: "project-1" }),
    );
    // @ts-expect-error stream subscribe params preserve the state-owned selector result
    projectStream.config.subscribe({ params: "workspace-1" });
    type CarriedProjectStreamRoutes = NonNullable<typeof projectStream.config.routes>;
    type _CarriedProjectStreamValueRouteArg = Expect<
      Equal<Parameters<NonNullable<CarriedProjectStreamRoutes["value"]>>[0], SentinelProject>
    >;
    const narrowCarriedProjectStreamRoutes: CarriedProjectStreamRoutes = {
      // @ts-expect-error carried stream definition value routes must accept the full authored stream value
      value: (project: Readonly<{ readonly id: "project-1"; readonly name: string }>) => ({
        type: "LOADED",
        project,
      }),
      failure: (error) => ({ type: "FAILED", error }),
    };
    void [true as _CarriedProjectStreamValueRouteArg];
    void narrowCarriedProjectStreamRoutes;

    const narrowStreamParams = flow.stream<
      SentinelContext,
      SentinelEvent,
      SentinelProjectId,
      SentinelProject,
      "missing",
      ProjectConfig,
      "Sentinel.narrowStreamParams"
    >({
      id: "Sentinel.narrowStreamParams",
      // @ts-expect-error stream params callbacks must accept the full state-owned binding context family
      params: ({
        context,
      }: {
        readonly context: { readonly activeProjectId: "project-1"; readonly revision: 1 };
      }) => context.activeProjectId,
      subscribe: ({ params }) => Stream.fromEffect(loadProject(params)),
      routes: {
        value: (project) => ({ type: "LOADED", project }),
        failure: (error) => ({ type: "FAILED", error }),
      },
    });
    void narrowStreamParams;

    const narrowStreamSubscribe = flow.stream<
      SentinelContext,
      SentinelEvent,
      SentinelProjectId,
      SentinelProject,
      "missing",
      ProjectConfig,
      "Sentinel.narrowStreamSubscribe"
    >({
      id: "Sentinel.narrowStreamSubscribe",
      params: ({ context }: { readonly context: SentinelContext }) => context.activeProjectId,
      // @ts-expect-error stream subscribe callbacks must accept the full state-owned params result
      subscribe: ({ params }: { readonly params: "project-1" }) =>
        Stream.fromEffect(loadProject(params)),
      routes: {
        value: (project) => ({ type: "LOADED", project }),
        failure: (error) => ({ type: "FAILED", error }),
      },
    });
    void narrowStreamSubscribe;

    const narrowStreamValueRoute = flow.stream<
      SentinelContext,
      SentinelEvent,
      SentinelProjectId,
      SentinelProject,
      "missing",
      ProjectConfig,
      "Sentinel.narrowStreamValueRoute"
    >({
      id: "Sentinel.narrowStreamValueRoute",
      params: ({ context }: { readonly context: SentinelContext }) => context.activeProjectId,
      subscribe: ({ params }) => Stream.fromEffect(loadProject(params)),
      routes: {
        // @ts-expect-error stream value routes must accept the full authored stream value
        value: (project: Readonly<{ readonly id: "project-1"; readonly name: string }>) => ({
          type: "LOADED",
          project,
        }),
        failure: (error) => ({ type: "FAILED", error }),
      },
    });
    void narrowStreamValueRoute;

    type SentinelStreamError = "missing" | "offline";
    type SentinelStreamFailureEvent =
      | SentinelEvent
      | Readonly<{ readonly type: "STREAM_FAILED"; readonly error: SentinelStreamError }>;
    type SentinelStreamOutcomeEvent =
      | SentinelStreamFailureEvent
      | Readonly<{ readonly type: "STREAM_DEFECT"; readonly cause: unknown }>;

    const narrowStreamFailureRoute = flow.stream<
      SentinelContext,
      SentinelStreamFailureEvent,
      SentinelProjectId,
      SentinelProject,
      SentinelStreamError,
      ProjectConfig,
      "Sentinel.narrowStreamFailureRoute"
    >({
      id: "Sentinel.narrowStreamFailureRoute",
      params: ({ context }: { readonly context: SentinelContext }) => context.activeProjectId,
      subscribe: ({ params }) => Stream.fail(params === "project-1" ? "missing" : "offline"),
      routes: {
        // @ts-expect-error stream failure routes must accept the full authored stream error
        failure: (error: "missing") => ({ type: "STREAM_FAILED", error }),
      },
    });
    void narrowStreamFailureRoute;

    const narrowStreamDefectRoute = flow.stream<
      SentinelContext,
      SentinelStreamOutcomeEvent,
      SentinelProjectId,
      SentinelProject,
      SentinelStreamError,
      ProjectConfig,
      "Sentinel.narrowStreamDefectRoute"
    >({
      id: "Sentinel.narrowStreamDefectRoute",
      params: ({ context }: { readonly context: SentinelContext }) => context.activeProjectId,
      subscribe: ({ params }) => Stream.fromEffect(loadProject(params)),
      routes: {
        value: (project) => ({ type: "LOADED", project }),
        // @ts-expect-error stream defect routes must accept the full unknown defect cause
        defect: (cause: Error) => ({ type: "STREAM_DEFECT", cause }),
      },
    });
    void narrowStreamDefectRoute;

    const narrowStreamPressureKey = flow.stream<
      SentinelContext,
      SentinelEvent,
      SentinelProjectId,
      SentinelProject,
      "missing",
      ProjectConfig,
      "Sentinel.narrowStreamPressureKey"
    >({
      id: "Sentinel.narrowStreamPressureKey",
      params: ({ context }: { readonly context: SentinelContext }) => context.activeProjectId,
      subscribe: ({ params }) => Stream.fromEffect(loadProject(params)),
      pressure: {
        strategy: "coalesce-latest",
        limit: 4,
        // @ts-expect-error coalesced pressure keys must accept the full authored stream value
        key: (project: Readonly<{ readonly id: "project-1"; readonly name: string }>) => project.id,
      },
      routes: {
        value: (project) => ({ type: "LOADED", project }),
        failure: (error) => ({ type: "FAILED", error }),
      },
    });
    void narrowStreamPressureKey;
    type CarriedCoalescedPressure = Extract<
      NonNullable<typeof narrowStreamPressureKey.config.pressure>,
      { readonly strategy: "coalesce-latest" }
    >;
    type _CarriedCoalescedPressureKeyArg = Expect<
      Equal<Parameters<CarriedCoalescedPressure["key"]>[0], SentinelProject>
    >;
    const narrowCarriedPressureKey: CarriedCoalescedPressure = {
      strategy: "coalesce-latest",
      limit: 4,
      // @ts-expect-error carried stream definition pressure keys must accept the full authored stream value
      key: (project: Readonly<{ readonly id: "project-1"; readonly name: string }>) => project.id,
    };
    void narrowCarriedPressureKey;
    const exportedCoalescedStream: flowState.FlowStreamDefinition<
      SentinelProject,
      "missing",
      SentinelProjectId,
      SentinelEvent,
      SentinelContext,
      "Sentinel.narrowStreamPressureKey",
      ProjectConfig
    > = narrowStreamPressureKey;
    type ExportedCoalescedPressure = Extract<
      NonNullable<typeof exportedCoalescedStream.config.pressure>,
      { readonly strategy: "coalesce-latest" }
    >;
    type _ExportedCoalescedPressureKeyArg = Expect<
      Equal<Parameters<ExportedCoalescedPressure["key"]>[0], SentinelProject>
    >;
    void [true as _CarriedCoalescedPressureKeyArg, true as _ExportedCoalescedPressureKeyArg];

    const missingQueuePressureLimit = () =>
      flow.stream<
        SentinelContext,
        SentinelEvent,
        SentinelProjectId,
        SentinelProject,
        "missing",
        ProjectConfig,
        "Sentinel.missingQueuePressureLimit"
      >({
        id: "Sentinel.missingQueuePressureLimit",
        params: ({ context }: { readonly context: SentinelContext }) => context.activeProjectId,
        subscribe: ({ params }) => Stream.fromEffect(loadProject(params)),
        // @ts-expect-error queue pressure must declare an explicit bounded limit
        pressure: {
          strategy: "queue",
        },
        routes: {
          value: (project) => ({ type: "LOADED", project }),
          failure: (error) => ({ type: "FAILED", error }),
        },
      });
    void missingQueuePressureLimit;

    const impossibleStreamFailureRoute = flow.stream<
      SentinelContext,
      SentinelEvent,
      SentinelProjectId,
      SentinelProject,
      never,
      ProjectConfig,
      "Sentinel.impossibleStreamFailureRoute"
    >({
      id: "Sentinel.impossibleStreamFailureRoute",
      params: ({ context }: { readonly context: SentinelContext }) => context.activeProjectId,
      subscribe: ({ params }) =>
        Stream.fromEffect(
          Effect.map(
            ProjectConfig,
            (config): SentinelProject => ({
              id: params,
              name: config.projectId,
            }),
          ),
        ),
      routes: {
        value: (project) => ({ type: "LOADED", project }),
        // @ts-expect-error streams with never typed failure cannot declare failure routes
        failure: (error) => ({ type: "FAILED", error }),
      },
    });
    void impossibleStreamFailureRoute;

    const impossibleStreamValueRoute = flow.stream<
      SentinelContext,
      SentinelEvent,
      SentinelProjectId,
      never,
      "missing",
      ProjectConfig,
      "Sentinel.impossibleStreamValueRoute"
    >({
      id: "Sentinel.impossibleStreamValueRoute",
      params: ({ context }: { readonly context: SentinelContext }) => context.activeProjectId,
      subscribe: ({ params }) => Stream.fail(params === "project-1" ? "missing" : "missing"),
      routes: {
        // @ts-expect-error streams with never output cannot declare value routes
        value: (project) => ({ type: "LOADED", project }),
        failure: (error) => ({ type: "FAILED", error }),
      },
    });
    void impossibleStreamValueRoute;

    const successOnlyStream = flow.stream<
      SentinelContext,
      SentinelEvent,
      void,
      SentinelProject,
      never,
      never,
      "Sentinel.successOnlyStream"
    >({
      id: "Sentinel.successOnlyStream",
      subscribe: () =>
        Stream.succeed({
          id: "project-1",
          name: "Atlas",
        } satisfies SentinelProject),
      routes: {
        value: (project) => ({ type: "LOADED", project }),
      },
    });
    type SuccessOnlyStreamRoutes = NonNullable<typeof successOnlyStream.config.routes>;
    const impossibleFailureDefinitionRoutes: SuccessOnlyStreamRoutes = {
      value: (project) => ({ type: "LOADED", project }),
      // @ts-expect-error carried stream definition routes with never typed failure cannot declare failure routes
      failure: (error) => ({ type: "FAILED", error }),
    };
    void impossibleFailureDefinitionRoutes;

    const projectMachine = flow.machine<
      SentinelContext,
      SentinelEvent,
      "idle" | "loaded",
      "idle",
      "Sentinel.machine"
    >({
      id: "Sentinel.machine",
      initial: "idle",
      context: () => ({ activeProjectId: "project-1", revision: 1 }),
      states: {
        idle: {
          invoke: projectStream,
          on: {
            OPEN: "loaded",
            LOADED: {
              target: "loaded",
              update: ({ event }) => ({
                activeProjectId: event.project.id,
              }),
            },
          },
        },
        loaded: {},
      },
    });

    expectType<"Sentinel.machine">(projectMachine.id);
    expectType<SentinelContext>(projectMachine.getInitialSnapshot().context);
    flow.machine<SentinelContext, SentinelEvent, "idle" | "loaded", "idle">({
      id: "Sentinel.invalidTarget",
      initial: "idle",
      context: () => ({ activeProjectId: "project-1", revision: 1 }),
      states: {
        idle: {
          on: {
            // @ts-expect-error machine targets must remain inside the declared state union
            OPEN: {
              target: "missing",
            },
          },
        },
        loaded: {},
      },
    });

    const sentinelModule = flow.module("Sentinel", {
      resources: { project: projectResource },
      transactions: { save: saveProject },
      streams: { project: projectStream },
      machines: { project: projectMachine },
    });
    const sentinelApp = flow.app({
      modules: [sentinelModule],
    });
    const analyticsLayer = Layer.effect(
      ProjectAnalytics,
      Effect.map(ProjectConfig, (config) =>
        ProjectAnalytics.of({
          label: Effect.succeed(config.projectId),
        }),
      ),
    );
    const sentinelLayer = sentinelApp.layer<readonly [typeof analyticsLayer]>({
      store: flow.store.memory(),
      orchestrators: flow.orchestrators.test(),
      services: [analyticsLayer],
    });

    type _SentinelModuleTuple = Expect<
      Equal<typeof sentinelApp.modules, readonly [typeof sentinelModule]>
    >;
    type _SentinelLayerRequirement = Expect<
      Equal<Layer.Services<typeof sentinelLayer>, ProjectConfig>
    >;
    void [true as _SentinelModuleTuple, true as _SentinelLayerRequirement];

    const expectUnprovidedLayerRequirementVisible = () => {
      // @ts-expect-error app layers with remaining requirements are not runtime-ready
      void flowServer.withRequestRuntime(sentinelLayer, async () => "unreachable");
    };
    void expectUnprovidedLayerRequirementVisible;
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
    const childMachine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "COMPLETE" }>,
      "running" | "done"
    >({
      id: "Project.child",
      initial: "running",
      context: () => ({ count: 0 }),
      states: {
        running: {
          on: {
            COMPLETE: "done",
          },
        },
        done: {
          type: "final",
        },
      },
    });
    const childProject: flowState.FlowChildDefinition<typeof childMachine> = flow.child({
      id: "Project.child.binding",
      machine: childMachine,
      supervision: "stop-on-failure",
    });
    expectType<"ensure">(ensureProject.kind);
    expectType<"observe">(observeProject.kind);
    expectType<"refresh">(refreshProject.kind);
    expectType<"patch">(patchProject.kind);
    expectType<"invalidate">(invalidateProject.kind);
    expectType<"run">(runSaveProject.kind);
    expectType<typeof resourceRef>(refreshProject.ref);
    expectType<typeof projectTag>(invalidateProject.target);
    expectType<typeof saveProject>(runSaveProject.transaction);
    expectType<"child">(childProject.kind);
    expectType<typeof childMachine>(childProject.config.machine);
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

  it("keeps resource callback params directional and lookup A/E/R exact", () => {
    const projectSchema = { kind: "directional-project-schema" } as const;
    const projectTag = createTag("directional.project");
    const projectResource = flow.resource({
      id: "Directional.project",
      key: (projectId: "project-1") => createKey("directional", projectId),
      lookup: (projectId: "project-1") =>
        Effect.succeed({
          id: projectId,
          name: "Atlas",
        }) as EffectType.Effect<ProjectRecord, "missing", ProjectRepo>,
      schema: projectSchema,
      tags: (projectId: "project-1") => {
        expectType<"project-1">(projectId);
        return [projectTag];
      },
      placeholder: (projectId: "project-1") => {
        expectType<"project-1">(projectId);
        return { id: projectId, name: "Loading" };
      },
    });
    const ref = projectResource.ref("project-1");

    expectType<[projectId: "project-1"]>(ref.params);
    expectType<EffectType.Effect<ProjectRecord, "missing", ProjectRepo>>(
      projectResource.config.lookup("project-1"),
    );
    expectType<typeof projectSchema | undefined>(projectResource.config.schema);
    // @ts-expect-error refs preserve the declared callback params
    projectResource.ref("project-2");

    const expectWrongLookupParams = () => {
      flow.resource({
        id: "Directional.wrongLookupParams",
        key: (projectId: string) => createKey("directional", projectId),
        // @ts-expect-error lookup params must match the key/ref params locally
        lookup: (projectId: number) =>
          Effect.succeed({
            id: String(projectId),
            name: "Atlas",
          }),
      });
    };
    const expectWrongTagsParams = () => {
      flow.resource({
        id: "Directional.wrongTagsParams",
        key: (projectId: string) => createKey("directional", projectId),
        lookup: (projectId: string) => Effect.succeed({ id: projectId, name: "Atlas" }),
        // @ts-expect-error tag callback params must match the key/ref params locally
        tags: (projectId: number) => [createTag(`directional.${projectId}`)],
      });
    };
    const expectWrongPlaceholderParams = () => {
      flow.resource({
        id: "Directional.wrongPlaceholderParams",
        key: (projectId: string) => createKey("directional", projectId),
        lookup: (projectId: string) => Effect.succeed({ id: projectId, name: "Atlas" }),
        // @ts-expect-error placeholder params must match the key/ref params locally
        placeholder: (projectId: number) => ({ id: String(projectId), name: "Loading" }),
      });
    };
    const expectWrongValue = () => {
      flow.resource<
        [projectId: string],
        ProjectRecord,
        never,
        EffectType.Effect<ProjectRecord, never, never>
      >({
        id: "Directional.wrongValue",
        key: (projectId: string) => createKey("directional", projectId),
        // @ts-expect-error lookup success must match the declared resource value
        lookup: (projectId: string) => Effect.succeed({ id: projectId, title: "Atlas" }),
      });
    };
    const expectWrongSchema = () => {
      flow.resource<
        [projectId: string],
        ProjectRecord,
        never,
        EffectType.Effect<ProjectRecord, never, never>,
        "Directional.wrongSchema",
        typeof projectSchema
      >({
        id: "Directional.wrongSchema",
        key: (projectId: string) => createKey("directional", projectId),
        lookup: (projectId: string) => Effect.succeed({ id: projectId, name: "Atlas" }),
        // @ts-expect-error schema must match the declared resource schema source
        schema: { kind: "other-schema" },
      });
    };
    void [
      expectWrongLookupParams,
      expectWrongTagsParams,
      expectWrongPlaceholderParams,
      expectWrongValue,
      expectWrongSchema,
    ];

    const undefinedResource = flow.resource<
      [projectId: string],
      ProjectRecord | undefined,
      never,
      EffectType.Effect<ProjectRecord | undefined, never, never>
    >({
      id: "Directional.presentUndefined",
      key: (projectId: string) => createKey("directional", "undefined", projectId),
      lookup: () => Effect.succeed(undefined),
      placeholder: () => undefined,
    });
    const undefinedRef = undefinedResource.ref("project-1");
    const seededUndefined: flowState.FlowSeededResource<typeof undefinedRef> = {
      ref: undefinedRef,
      value: undefined,
    };
    expectType<ProjectRecord | undefined>(seededUndefined.value);

    const presentUndefinedSnapshot: flowState.FlowResourceSnapshot<
      ProjectRecord | undefined,
      "missing"
    > = {
      id: "Directional.presentUndefined",
      status: "success",
      availability: "value",
      activity: "idle",
      freshness: "fresh",
      value: undefined,
      isPlaceholderData: false,
    };
    expectType<ProjectRecord | undefined>(presentUndefinedSnapshot.value);

    // @ts-expect-error empty resource snapshots cannot carry a present value
    const contradictorySnapshot: flowState.FlowResourceSnapshot<ProjectRecord, "missing"> = {
      id: "Directional.contradictory",
      status: "idle",
      availability: "empty",
      activity: "idle",
      freshness: "fresh",
      value: { id: "project-1", name: "Atlas" },
      isPlaceholderData: false,
    };
    void contradictorySnapshot;

    const successfulTransaction: flowState.FlowTransactionSnapshot<ProjectRecord, "conflict"> = {
      id: "Directional.transaction.success",
      status: "success",
      value: { id: "project-1", name: "Atlas" },
    };
    expectType<ProjectRecord>(successfulTransaction.value);

    const failedTransaction: flowState.FlowTransactionSnapshot<ProjectRecord, "conflict"> = {
      id: "Directional.transaction.failure",
      status: "failure",
      error: "conflict",
    };
    expectType<"conflict">(failedTransaction.error);

    const defectTransaction: flowState.FlowTransactionSnapshot<ProjectRecord, "conflict"> = {
      id: "Directional.transaction.defect",
      status: "defect",
    };
    void defectTransaction;

    const contradictoryTransactionSuccess = {
      id: "Directional.transaction.contradictory-success",
      status: "success",
      value: { id: "project-1", name: "Atlas" },
      // @ts-expect-error successful transaction snapshots cannot also carry an error
      error: "conflict",
    } satisfies flowState.FlowTransactionSnapshot<ProjectRecord, "conflict">;
    void contradictoryTransactionSuccess;

    // @ts-expect-error failed transaction snapshots cannot also carry a value
    const contradictoryTransactionFailure: flowState.FlowTransactionSnapshot<
      ProjectRecord,
      "conflict"
    > = {
      id: "Directional.transaction.contradictory-failure",
      status: "failure",
      value: { id: "project-1", name: "Atlas" },
      error: "conflict",
    };
    void contradictoryTransactionFailure;

    // @ts-expect-error pending transaction snapshots cannot carry terminal payloads
    const contradictoryPendingTransaction: flowState.FlowTransactionSnapshot<
      ProjectRecord,
      "conflict"
    > = {
      id: "Directional.transaction.contradictory-pending",
      status: "pending",
      value: { id: "project-1", name: "Atlas" },
    };
    void contradictoryPendingTransaction;

    const contradictoryDefectTransaction: flowState.FlowTransactionSnapshot<
      ProjectRecord,
      "conflict"
    > = {
      id: "Directional.transaction.contradictory-defect",
      status: "defect",
      // @ts-expect-error defect transaction snapshots cannot masquerade as typed failures
      error: "conflict",
    };
    void contradictoryDefectTransaction;

    const successfulStream: flowState.FlowStreamSnapshot<ProjectRecord, "offline"> = {
      id: "Directional.stream.success",
      status: "success",
      hasValue: true,
      value: { id: "project-1", name: "Atlas" },
    };
    expectType<ProjectRecord | undefined>(successfulStream.value);

    const failedStream: flowState.FlowStreamSnapshot<ProjectRecord, "offline"> = {
      id: "Directional.stream.failure",
      status: "failure",
      hasValue: true,
      value: { id: "project-1", name: "Atlas" },
      error: "offline",
    };
    expectType<"offline">(failedStream.error);

    const defectStream: flowState.FlowStreamSnapshot<ProjectRecord, "offline"> = {
      id: "Directional.stream.defect",
      status: "defect",
      hasValue: true,
      value: { id: "project-1", name: "Atlas" },
    };
    void defectStream;

    const contradictorySuccessfulStream = {
      id: "Directional.stream.contradictory-success",
      status: "success",
      value: { id: "project-1", name: "Atlas" },
      // @ts-expect-error successful stream snapshots cannot also carry a typed failure
      error: "offline",
    } satisfies flowState.FlowStreamSnapshot<ProjectRecord, "offline">;
    void contradictorySuccessfulStream;

    // @ts-expect-error failed stream snapshots must carry the typed failure
    const contradictoryFailedStream: flowState.FlowStreamSnapshot<ProjectRecord, "offline"> = {
      id: "Directional.stream.contradictory-failure",
      status: "failure",
      value: { id: "project-1", name: "Atlas" },
    };
    void contradictoryFailedStream;

    const contradictoryDefectStream = {
      id: "Directional.stream.contradictory-defect",
      status: "defect",
      value: { id: "project-1", name: "Atlas" },
      // @ts-expect-error defect stream snapshots cannot masquerade as typed failures
      error: "offline",
    } satisfies flowState.FlowStreamSnapshot<ProjectRecord, "offline">;
    void contradictoryDefectStream;
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
    expectType<string>(app.label);
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
        machines: {
          story: machine,
        },
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
      graph.simplePaths({ maxDepth: 2, resolveSyncSuccessRoutes: true }),
    );
    expectType<
      | Readonly<{ readonly state: Readonly<{ readonly value: "start" | "idle" | "done" }> }>
      | undefined
    >(
      graph.pathFromEvents([{ type: "NEXT" }, { type: "ALLOW" }, { type: "PROCEED" }], {
        resolveSyncSuccessRoutes: true,
      }),
    );
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

  it("accepts compatible submit bindings from authored transaction definitions", () => {
    type MachineEvent =
      | Readonly<{ readonly type: "SUBMIT" }>
      | Readonly<{ readonly type: "SAVED"; readonly value: ProjectRecord }>
      | Readonly<{ readonly type: "FAILED"; readonly error: SaveError }>;

    const saveProject = flow.transaction<
      { readonly id: string },
      ProjectRecord,
      SaveError,
      ProjectRepo,
      MachineEvent,
      "Bindings.save"
    >({
      id: "Bindings.save",
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
    const machineConfig = {
      id: "Bindings.machine",
      initial: "editing",
      context: () => ({ count: 0 }),
      states: {
        editing: {
          on: {
            SUBMIT: {
              target: "saving",
              submit: saveProject,
            },
          },
        },
        saving: {
          invoke: flow.run(saveProject),
        },
      },
    } satisfies flowState.FlowMachineConfig<
      "Bindings.machine",
      { readonly count: number },
      MachineEvent,
      "editing" | "saving",
      "editing"
    >;

    expectType<typeof saveProject>(machineConfig.states.editing.on.SUBMIT.submit);
    expectType<typeof saveProject>(machineConfig.states.saving.invoke.transaction);
    expectType<"Bindings.save">(machineConfig.states.editing.on.SUBMIT.submit.id);
    expectType<"Bindings.save">(machineConfig.states.saving.invoke.id);

    const machine = flow.machine(machineConfig);
    expectType<"Bindings.machine">(machine.id);
  });

  it("preserves child invoke definitions from authored machine configs", () => {
    const childMachine = flow.machine<
      { readonly complete: boolean },
      Readonly<{ readonly type: "COMPLETE" }>,
      "running" | "done"
    >({
      id: "Bindings.child-machine",
      initial: "running",
      context: () => ({ complete: false }),
      states: {
        running: {
          on: {
            COMPLETE: "done",
          },
        },
        done: {
          type: "final",
        },
      },
    });
    const childBinding = flow.child({
      id: "Bindings.child",
      machine: childMachine,
      supervision: "continue-on-failure",
    });

    const machineConfig = {
      id: "Bindings.child-parent",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          invoke: childBinding,
        },
        done: {
          type: "final",
        },
      },
    } satisfies flowState.FlowMachineConfig<
      "Bindings.child-parent",
      { readonly count: number },
      Readonly<{ readonly type: "NEXT" }>,
      "idle" | "done",
      "idle"
    >;

    expectType<typeof childBinding>(machineConfig.states.idle.invoke);
    expectType<typeof childMachine>(machineConfig.states.idle.invoke.config.machine);
    expectType<string>(machineConfig.states.idle.invoke.id);
    expectType<string>(machineConfig.states.idle.invoke.config.machine.id);

    const machine = flow.machine(machineConfig);
    expectType<"Bindings.child-parent">(machine.id);
    expectType<typeof childBinding>(machine.config.states.idle.invoke);
    expectType<typeof childMachine>(machine.config.states.idle.invoke.config.machine);
  });

  it("preserves mixed invoke-array precision from authored and copied machine configs", () => {
    type MachineEvent =
      | Readonly<{ readonly type: "SAVED"; readonly value: ProjectRecord }>
      | Readonly<{ readonly type: "FAILED"; readonly error: SaveError }>
      | Readonly<{ readonly type: "NEXT" }>;

    const saveProject = flow.transaction<
      { readonly id: string },
      ProjectRecord,
      SaveError,
      ProjectRepo,
      MachineEvent,
      "Bindings.mixed.save"
    >({
      id: "Bindings.mixed.save",
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
    const childMachine = flow.machine<
      { readonly complete: boolean },
      Readonly<{ readonly type: "COMPLETE" }>,
      "running" | "done"
    >({
      id: "Bindings.mixed.child-machine",
      initial: "running",
      context: () => ({ complete: false }),
      states: {
        running: {
          on: {
            COMPLETE: "done",
          },
        },
        done: {
          type: "final",
        },
      },
    });
    const runBinding = flow.run(saveProject);
    const childBinding = flow.child({
      id: "Bindings.mixed.child",
      machine: childMachine,
      supervision: "continue-on-failure",
    });

    const machineConfig = {
      id: "Bindings.mixed-parent",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          invoke: [runBinding, childBinding],
        },
        done: {
          type: "final",
        },
      },
    } satisfies flowState.FlowMachineConfig<
      "Bindings.mixed-parent",
      { readonly count: number },
      MachineEvent,
      "idle" | "done",
      "idle"
    >;

    expectType<readonly [typeof runBinding, typeof childBinding]>(machineConfig.states.idle.invoke);
    expectType<typeof saveProject>(machineConfig.states.idle.invoke[0].transaction);
    expectType<typeof childMachine>(machineConfig.states.idle.invoke[1].config.machine);

    const machine = flow.machine(machineConfig);
    expectType<"Bindings.mixed-parent">(machine.id);
    expectType<readonly [typeof runBinding, typeof childBinding]>(
      machine.config.states.idle.invoke,
    );
    expectType<typeof saveProject>(machine.config.states.idle.invoke[0].transaction);
    expectType<typeof childMachine>(machine.config.states.idle.invoke[1].config.machine);
  });

  it("types flowTesting story helpers for selector-backed submit and run bindings", () => {
    type MachineEvent =
      | Readonly<{ readonly type: "SUBMIT" }>
      | Readonly<{ readonly type: "SAVED"; readonly value: ProjectRecord }>
      | Readonly<{ readonly type: "FAILED"; readonly error: SaveError }>;

    const saveProject = flow.transaction<
      { readonly id: string },
      ProjectRecord,
      SaveError,
      ProjectRepo,
      MachineEvent,
      "StoryBindings.save"
    >({
      id: "StoryBindings.save",
      params: ({ context }: { readonly context: { readonly projectId: string } }) => ({
        id: context.projectId,
      }),
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

    const machine = flow.machine<
      { readonly projectId: string },
      MachineEvent,
      "editing" | "saving",
      "editing",
      "StoryBindings.machine"
    >({
      id: "StoryBindings.machine",
      initial: "editing",
      context: () => ({ projectId: "project-1" }),
      states: {
        editing: {
          on: {
            SUBMIT: {
              target: "saving",
              submit: saveProject,
            },
          },
        },
        saving: {
          invoke: flow.run(saveProject),
          on: {
            SAVED: {
              target: "editing",
            },
            FAILED: {
              target: "editing",
            },
          },
        },
      },
    });

    const stories = flowInspect.flowStories(machine, [
      {
        id: "submit-project",
        title: "Submit project",
        description: "Persist the seeded Atlas workspace project.",
        events: [{ type: "SUBMIT" }],
        expectedState: "editing",
        tags: ["docs"],
      },
    ]);
    const storyRun = flowTesting.runFlowStory(machine, stories.stories[0]!);
    const storyRunWithDiagnostics = flowTesting.runFlowStoryWithDiagnostics(
      machine,
      stories.stories[0]!,
    );
    const storyTest = storyRun.then((outcome) => flowTesting.storyToTest(outcome));

    expectType<flowInspect.FlowStoriesDescriptor<typeof machine>>(stories);
    expectType<Promise<flowTesting.FlowStoryRunOutcome<typeof machine>>>(storyRun);
    expectType<Promise<flowTesting.FlowStoryTestReport<typeof machine>>>(storyTest);
    void storyRunWithDiagnostics.then((execution) => {
      expectType<flowTesting.FlowStoryRunOutcome<typeof machine>>(execution.outcome);
      expectType<number | undefined>(execution.pendingWork?.activeFibers);
    });
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
    expectType<number | undefined>(actor.getSnapshot().truncatedBeforeReceiptCount);
    expectType<flowState.FlowActorSnapshotTree>(actor.serialize());
    expectType<number | undefined>(actor.serialize().truncatedBeforeReceiptCount);
    expectType<ReturnType<typeof actor.getSnapshot>>(actor.snapshot());
    type _ActorReadAliasesMatch = Expect<
      Equal<ReturnType<typeof actor.getSnapshot>, ReturnType<typeof actor.snapshot>>
    >;
    void [true as _ActorReadAliasesMatch];

    const restored = runtime.createActor(machine, {
      id: "Trace.actor-restore.runtime",
      snapshot: actor.serialize(),
    });
    const expectUnsupportedActorPolicy = () => {
      runtime.createActor(machine, {
        // @ts-expect-error unsupported actor start policies must fail before runtime registration
        policy: "forever",
      });
    };
    void expectUnsupportedActorPolicy;

    expectType<number>(restored.snapshot().context.count);

    const boot = runtime.dehydrateBoot({
      actors: [actor],
    });
    expectType<flowState.FlowActorSnapshotTree | undefined>(
      runtime.hydrateBoot(boot).actorSnapshot(actor.id),
    );
    expectType<number | undefined>(
      runtime.hydrateBoot(boot).actorSnapshot(actor.id)?.truncatedBeforeReceiptCount,
    );
  });

  it("types actor retryChild on the current child contract without widening child ids", () => {
    const childMachine = flow.machine<
      { readonly complete: boolean },
      Readonly<{ readonly type: "COMPLETE" }>,
      "running" | "done"
    >({
      id: "Trace.retry-child.machine",
      initial: "running",
      context: () => ({ complete: false }),
      states: {
        running: {
          on: {
            COMPLETE: "done",
          },
        },
        done: {
          type: "final",
        },
      },
    });
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "NEXT" }>,
      "idle" | "done"
    >({
      id: "Trace.retry-child.parent",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          invoke: flow.child({
            id: "Trace.retry-child.binding",
            machine: childMachine,
            supervision: "continue-on-failure",
          }),
        },
        done: {
          type: "final",
        },
      },
    });
    const runtime = createTestRuntimeWithInstallers();

    const actor = runtime.createActor(machine);
    const startedActor = runtime.orchestrators.start(machine, {
      id: "Trace.retry-child.parent.started",
    });
    expectType<boolean>(actor.retryChild("Trace.retry-child.binding"));
    expectType<boolean>(startedActor.retryChild("Trace.retry-child.binding"));
    const expectInvalidRetryChildId = () => {
      // @ts-expect-error retryChild stays on the current string id contract
      actor.retryChild(1);
    };
    const expectInvalidStartedRetryChildId = () => {
      // @ts-expect-error started actor retryChild stays on the current string id contract
      startedActor.retryChild(1);
    };
    void [expectInvalidRetryChildId, expectInvalidStartedRetryChildId];
  });

  it("types runtime.orchestrators.attach lease actor retryChild on the current child contract without widening child ids", async () => {
    const childMachine = flow.machine<
      { readonly complete: boolean },
      Readonly<{ readonly type: "COMPLETE" }>,
      "running" | "done"
    >({
      id: "Trace.attach-retry-child.machine",
      initial: "running",
      context: () => ({ complete: false }),
      states: {
        running: {
          on: {
            COMPLETE: "done",
          },
        },
        done: {
          type: "final",
        },
      },
    });
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "NEXT" }>,
      "idle" | "done"
    >({
      id: "Trace.attach-retry-child.parent",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          invoke: flow.child({
            id: "Trace.attach-retry-child.binding",
            machine: childMachine,
            supervision: "continue-on-failure",
          }),
        },
        done: {
          type: "final",
        },
      },
    });
    const runtime = createTestRuntimeWithInstallers();
    const lease = await runtime.orchestrators.attach(machine, {
      id: "Trace.attach-retry-child.actor",
      policy: "keep-alive",
    });

    try {
      expectType<boolean>(lease.actor.retryChild("Trace.attach-retry-child.binding"));
      type _AttachedActorRetryChildParams = Expect<
        Equal<Parameters<typeof lease.actor.retryChild>, [id: string]>
      >;
      type _AttachedActorRetryChildResult = Expect<
        Equal<ReturnType<typeof lease.actor.retryChild>, boolean>
      >;
      const expectInvalidRetryChildId = () => {
        // @ts-expect-error attached lease actor retryChild stays on the current string id contract
        lease.actor.retryChild(1);
      };
      void [true as _AttachedActorRetryChildParams, true as _AttachedActorRetryChildResult];
      void expectInvalidRetryChildId;
    } finally {
      await lease.release();
    }
  });

  it("types actor child snapshot read surface on the current child contract", () => {
    const childMachine = flow.machine<
      { readonly complete: boolean },
      Readonly<{ readonly type: "COMPLETE" }>,
      "running" | "done"
    >({
      id: "Trace.child-read.machine",
      initial: "running",
      context: () => ({ complete: false }),
      states: {
        running: {
          on: {
            COMPLETE: "done",
          },
        },
        done: {
          type: "final",
        },
      },
    });
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "NEXT" }>,
      "idle" | "done"
    >({
      id: "Trace.child-read.parent",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          invoke: flow.child({
            id: "Trace.child-read.binding",
            machine: childMachine,
            supervision: "continue-on-failure",
          }),
        },
        done: {
          type: "final",
        },
      },
    });
    const runtime = createTestRuntimeWithInstallers();

    const actor = runtime.createActor(machine);
    expectType<Readonly<Record<string, flowState.FlowChildSnapshot>>>(actor.children());
    expectType<flowState.FlowChildSnapshot | undefined>(
      actor.children()["Trace.child-read.binding"],
    );
    expectType<flowState.FlowChildSnapshot["status"] | undefined>(
      actor.children()["Trace.child-read.binding"]?.status,
    );
    expectType<flowState.FlowChildSnapshot["supervision"] | undefined>(
      actor.children()["Trace.child-read.binding"]?.supervision,
    );
    expectType<flowState.FlowActorSnapshotTree | undefined>(
      actor.children()["Trace.child-read.binding"]?.snapshot,
    );
    type _ActorChildrenReadAliasesMatch = Expect<
      Equal<ReturnType<typeof actor.children>, ReturnType<typeof actor.getSnapshot>["children"]>
    >;
    void [true as _ActorChildrenReadAliasesMatch];
  });

  it("types runtime.orchestrators.start child snapshot read surface on the current child contract", () => {
    const childMachine = flow.machine<
      { readonly complete: boolean },
      Readonly<{ readonly type: "COMPLETE" }>,
      "running" | "done"
    >({
      id: "Trace.start-child-read.machine",
      initial: "running",
      context: () => ({ complete: false }),
      states: {
        running: {
          on: {
            COMPLETE: "done",
          },
        },
        done: {
          type: "final",
        },
      },
    });
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "NEXT" }>,
      "idle" | "done"
    >({
      id: "Trace.start-child-read.parent",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          invoke: flow.child({
            id: "Trace.start-child-read.binding",
            machine: childMachine,
            supervision: "continue-on-failure",
          }),
        },
        done: {
          type: "final",
        },
      },
    });
    const runtime = createTestRuntimeWithInstallers();

    const actor = runtime.orchestrators.start(machine, {
      id: "Trace.start-child-read.actor",
    });
    expectType<Readonly<Record<string, flowState.FlowChildSnapshot>>>(actor.children());
    expectType<flowState.FlowChildSnapshot | undefined>(
      actor.children()["Trace.start-child-read.binding"],
    );
    expectType<flowState.FlowChildSnapshot["status"] | undefined>(
      actor.children()["Trace.start-child-read.binding"]?.status,
    );
    expectType<flowState.FlowChildSnapshot["supervision"] | undefined>(
      actor.children()["Trace.start-child-read.binding"]?.supervision,
    );
    expectType<flowState.FlowActorSnapshotTree | undefined>(
      actor.children()["Trace.start-child-read.binding"]?.snapshot,
    );
    type _StartedActorChildrenReadAliasesMatch = Expect<
      Equal<ReturnType<typeof actor.children>, ReturnType<typeof actor.getSnapshot>["children"]>
    >;
    void [true as _StartedActorChildrenReadAliasesMatch];
  });

  it("types runtime.orchestrators.attach child snapshot read surface on the current child contract", async () => {
    const childMachine = flow.machine<
      { readonly complete: boolean },
      Readonly<{ readonly type: "COMPLETE" }>,
      "running" | "done"
    >({
      id: "Trace.attach-child-read.machine",
      initial: "running",
      context: () => ({ complete: false }),
      states: {
        running: {
          on: {
            COMPLETE: "done",
          },
        },
        done: {
          type: "final",
        },
      },
    });
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "NEXT" }>,
      "idle" | "done"
    >({
      id: "Trace.attach-child-read.parent",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          invoke: flow.child({
            id: "Trace.attach-child-read.binding",
            machine: childMachine,
            supervision: "continue-on-failure",
          }),
        },
        done: {
          type: "final",
        },
      },
    });
    const runtime = createTestRuntimeWithInstallers();
    const lease = await runtime.orchestrators.attach(machine, {
      id: "Trace.attach-child-read.actor",
      policy: "keep-alive",
    });

    try {
      expectType<Readonly<Record<string, flowState.FlowChildSnapshot>>>(lease.actor.children());
      expectType<flowState.FlowChildSnapshot | undefined>(
        lease.actor.children()["Trace.attach-child-read.binding"],
      );
      expectType<flowState.FlowChildSnapshot["status"] | undefined>(
        lease.actor.children()["Trace.attach-child-read.binding"]?.status,
      );
      expectType<flowState.FlowChildSnapshot["supervision"] | undefined>(
        lease.actor.children()["Trace.attach-child-read.binding"]?.supervision,
      );
      expectType<flowState.FlowActorSnapshotTree | undefined>(
        lease.actor.children()["Trace.attach-child-read.binding"]?.snapshot,
      );
      type _AttachedActorReleaseResult = Expect<
        Equal<ReturnType<typeof lease.release>, Promise<void>>
      >;
      type _AttachedActorChildrenReadAliasesMatch = Expect<
        Equal<
          ReturnType<typeof lease.actor.children>,
          ReturnType<typeof lease.actor.getSnapshot>["children"]
        >
      >;
      void [true as _AttachedActorReleaseResult, true as _AttachedActorChildrenReadAliasesMatch];
    } finally {
      await lease.release();
    }
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
    expectType<number | undefined>(inspectionSnapshot.truncatedBeforeSequence);
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
    const previewReplaceRef = resource.ref("project-1");

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

    flow.transaction<{ readonly id: string }, { readonly ok: boolean }>({
      id: "legacy.input",
      // @ts-expect-error transaction.input was removed from the public contract
      input: () => ({ id: "project-1" }),
      commit: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
    });

    flow.transaction<{ readonly id: string }, { readonly ok: boolean }>({
      id: "legacy.effect",
      // @ts-expect-error transaction.effect was removed from the public contract
      effect: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
      commit: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
    });

    flow.transaction<{ readonly id: string }, { readonly ok: boolean }>({
      id: "legacy.optimistic",
      // @ts-expect-error transaction.optimistic was removed from the public contract
      optimistic: { apply: () => [] },
      commit: (_params: { readonly id: string }) => Effect.succeed({ ok: true }),
    });

    const previewReplaceMismatchConfig: FlowTransactionConfig<
      "preview.replace-mismatch",
      { readonly id: string },
      typeof previewReplaceRef,
      never,
      never,
      SaveEvent,
      readonly [
        Readonly<{
          readonly ref: typeof previewReplaceRef;
          readonly replace: ProjectRecord;
        }>,
      ]
    > = {
      id: "preview.replace-mismatch",
      preview: {
        apply: () => [
          {
            ref: previewReplaceRef,
            // @ts-expect-error preview replace values must match the resource value type
            replace: { id: 123, name: "Atlas v2" },
          },
        ],
      },
      commit: (_params: { readonly id: string }) => Effect.succeed(previewReplaceRef),
    };
    void previewReplaceMismatchConfig;
  });

  it("accepts the current child contract and rejects richer legacy fields", () => {
    const childMachine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "COMPLETE" }>,
      "running" | "done"
    >({
      id: "Child.contract.machine",
      initial: "running",
      context: () => ({ count: 0 }),
      states: {
        running: {
          on: {
            COMPLETE: "done",
          },
        },
        done: {
          type: "final",
        },
      },
    });

    const child = flow.child({
      id: "Child.contract.binding",
      machine: childMachine,
      supervision: "continue-on-failure",
    });

    expect(child.kind).toBe("child");
    expect(child.id).toBe("Child.contract.binding");
    expectType<FlowChildDefinition<typeof childMachine>>(child);
    expectType<FlowChildDefinition<typeof childMachine>["config"]>(child.config);
    expectType<typeof childMachine>(child.config.machine);
    expectType<"stop-on-failure" | "continue-on-failure" | undefined>(child.config.supervision);

    flow.child({
      id: "legacy.child.input",
      machine: childMachine,
      // @ts-expect-error child input selectors are not part of the current public contract
      input: () => ({ count: 1 }),
    });

    flow.child({
      id: "legacy.child.routes",
      machine: childMachine,
      // @ts-expect-error child outcome routes are not part of the current public contract
      routes: {
        success: () => ({ type: "COMPLETE" as const }),
      },
    });

    flow.child({
      id: "legacy.child.restart-budget",
      machine: childMachine,
      supervision: "stop-on-failure",
      // @ts-expect-error automatic child restart budgets are not part of the current public contract
      restartBudget: {
        maxAttempts: 3,
      },
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
      id: "Project.editor.unsupported-history-kind",
      initial: "idle",
      context: () => ({ selectedId: null as string | null }),
      states: {
        idle: {},
        historyKind: {
          // @ts-expect-error Flow State does not expose XState history state nodes
          type: "history",
        },
      },
    });

    flow.machine({
      id: "Project.editor.unsupported-history-config",
      initial: "idle",
      context: () => ({ selectedId: null as string | null }),
      states: {
        idle: {},
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

  it("types controlled stream fixtures and the flowTest stream read surface", () => {
    type Token = Readonly<{
      readonly index: number;
      readonly text: string;
    }>;

    type StreamEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "TOKEN"; readonly token: Token }>
      | Readonly<{ readonly type: "TOKEN_FAILED"; readonly error: "offline" }>
      | Readonly<{ readonly type: "TOKENS_DONE" }>;

    const tokens = flowTesting.createControlledStream<Token, "offline">("FlowTest.typed.tokens");
    expectType<Stream.Stream<Token, "offline">>(tokens.stream());
    expectType<ReadonlyArray<Readonly<{ readonly type: string }>>>(tokens.events());
    expectType<boolean>(tokens.cancelled());
    tokens.emit({ index: 0, text: "Ready" });
    tokens.fail("offline");
    tokens.end();
    // @ts-expect-error controlled stream fixtures reject the wrong emitted value type
    tokens.emit({ index: "0", text: "Ready" });
    // @ts-expect-error controlled stream fixtures reject the wrong typed failure
    tokens.fail("missing");

    const machine = flow.machine<{ readonly started: boolean }, StreamEvent, "idle" | "streaming">({
      id: "FlowTest.typed.stream-machine",
      initial: "idle",
      context: () => ({ started: false }),
      states: {
        idle: {
          on: {
            START: {
              target: "streaming",
              update: () => ({ started: true }),
            },
          },
        },
        streaming: {
          invoke: flow.stream<
            { readonly started: boolean },
            StreamEvent,
            void,
            Token,
            "offline",
            never,
            "FlowTest.typed.tokens"
          >({
            id: "FlowTest.typed.tokens",
            subscribe: () => tokens.stream(),
            routes: {
              value: (token) => ({ type: "TOKEN", token }),
              failure: (error) => ({ type: "TOKEN_FAILED", error }),
              done: () => ({ type: "TOKENS_DONE" }),
            },
          }),
        },
      },
    });

    const harness = flowTest(machine).start();
    harness.send({ type: "START" });

    expectType<boolean>(harness.context().started);
    expectType<"idle" | "streaming">(harness.state());
    expectType<ReadonlyArray<string>>(harness.pendingWork().streams);
    expectType<number>(harness.pendingWork().activeFibers);
    expectType<FlowReceipt | undefined>(harness.streams().events("FlowTest.typed.tokens")[0]);
    expectType<string | undefined>(harness.streams().running("FlowTest.typed.tokens")?.status);
    expectType<number | undefined>(harness.streams().running("FlowTest.typed.tokens")?.emitted);
    expectType<number | undefined>(
      harness.streams().cancelled("FlowTest.typed.tokens")?.generation,
    );
    expectType<string | undefined>(harness.snapshot().streams["FlowTest.typed.tokens"]?.status);
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

  it("types canonical transaction and resource receipts as discriminated facts", () => {
    type PreviewPatchReceipt = Extract<
      FlowReceipt,
      Readonly<{ readonly type: "transaction:preview-patch" }>
    >;
    type ResourceInvalidationReceipt = Extract<
      FlowReceipt,
      Readonly<{ readonly type: "resource:invalidate" }>
    >;

    const previewPatchReceipt = {
      type: "transaction:preview-patch",
      id: "Project.save",
      generation: 2,
      queueKey: "Project.save",
      refId: "Project.byId",
      previewIndex: 1,
      previewCount: 1,
      parentState: "saving",
    } satisfies PreviewPatchReceipt;
    expectType<number>(previewPatchReceipt.previewIndex);
    expectType<number>(previewPatchReceipt.previewCount);
    expectType<string>(previewPatchReceipt.refId);

    const resourceInvalidationReceipt = {
      type: "resource:invalidate",
      id: "Project.byId",
      count: 2,
      reason: "transaction",
      parentState: "saving",
    } satisfies ResourceInvalidationReceipt;
    expectType<number>(resourceInvalidationReceipt.count);
    expectType<"command" | "transaction">(resourceInvalidationReceipt.reason);

    expectType<string>(previewPatchReceipt.type);

    // @ts-expect-error canonical transaction receipts require generation-owned preview facts
    const invalidPreviewPatchReceipt: PreviewPatchReceipt = {
      type: "transaction:preview-patch",
      id: "Project.save",
      queueKey: "Project.save",
      parentState: "saving",
    };
    void invalidPreviewPatchReceipt;
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
    expectType<number>(restored.pendingWork().activeFibers);
    expectType<string | undefined>(restored.pendingWork().mailboxes[0]?.id);
    expectType<number | undefined>(restored.timers().get("Counter.dismiss")?.generation);
    expectType<string | undefined>(restored.receiptSummary().receiptTypes[0]);
    expectType<ReadonlyArray<FlowIssueSummary>>(restored.issueSummary());
    expectType<boolean>(restored.retryTransaction("Counter.save"));
    expectType<boolean>(restored.resetTransaction("Counter.save"));
    expectType<() => { readonly kind: "trace" }>(restored.captureTrace);
    expectType<(duration: import("effect/Duration").Input) => Promise<void>>(restored.advance);
    expectType<() => Promise<boolean>>(restored.advanceToNextTimer);
    expectType<
      (
        bounds?: Readonly<{ readonly maxTicks: number; readonly maxFibers: number }>,
      ) => Promise<void>
    >(restored.advanceUntilIdle);
    expectType<
      (
        target:
          | "idle"
          | ((state: "idle", snapshot: ReturnType<typeof restored.snapshot>) => boolean),
        bounds?: Readonly<{ readonly maxTicks: number; readonly maxFibers: number }>,
      ) => Promise<void>
    >(restored.untilState);
    expectType<() => Promise<void>>(restored.dispose);

    const fixtureResource = flow.resource<[projectId: string], ProjectRecord>({
      id: "RehydrateFixture.project",
      key: (projectId) => createKey("rehydrate-fixture-module", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: `Fixture ${projectId}` }),
    });
    const fixtureModule = flow.module(
      "RehydrateFixture",
      {
        resources: {
          project: fixtureResource,
        },
        machines: {
          counter: machine,
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
      resolveSyncSuccessRoutes: true,
    })[0]!;
    const harness = model.replay(path);
    const flushedHarness = model.replayFlushed(path);

    expectType<ReadonlyArray<FlowIssue>>(path.issues);
    expectType<string | undefined>(path.issues[0]?.id);
    expectType<ReadonlyArray<FlowIssueSummary>>(path.issueSummary);
    expectType<string | undefined>(path.issueSummary[0]?.id);
    expectType<number>(harness.context().count);
    expectType<"editing" | "submitted">(harness.state());
    expectType<string | undefined>(harness.receipts()[0]?.type);
    expectType<Promise<ReturnType<typeof model.replay>>>(flushedHarness);
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
