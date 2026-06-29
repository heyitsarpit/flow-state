import { Cause, Effect, Exit, Layer, Option, Redacted } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createKey, createRuntime, flow, selectView } from "@flow-state/core";
import type { FlowEvent } from "@flow-state/core";
import { flowTest } from "@flow-state/core/testing";
import { createControlledEffect, createControlledStream } from "@flow-state/core/testing";

import {
  ApprovalDenied,
  ProjectConflict,
  fixtureApproval,
  fixtureProject,
  projectDraftFrom,
} from "./domain";
import type { SaveProjectParams } from "./domain";
import {
  LaunchWorkspaceApp,
  LaunchWorkspaceAppLayer,
  LaunchWorkspaceModule,
  LaunchWorkspaceTestAppLayer,
  Assistant,
  Checklist,
  Launch,
  Project,
  Readiness,
  Trace,
  projectResource,
  approvalResource,
  assistantChild,
  assistantProgressStream,
  canRequestApproval,
  canSaveProject,
  chatLifecycleView,
  contractOnlyRuntimeQuestions,
  createChatComposer,
  createInitialContext,
  launchApiCoverage,
  launchCoveredApiIds,
  launchApiSurfaceStatus,
  launchRuntimeFacts,
  launchStatusNotes,
  launchWorkspaceDescriptor,
  launchWorkspaceDebugView,
  launchWorkspaceGraph,
  launchWorkspaceMachine,
  launchWorkspaceModel,
  launchWorkspaceReplay,
  launchWorkspaceSeed,
  launchWorkspaceStories,
  launchWorkspaceTrace,
  launchWorkspaceView,
  createLaunchWorkspaceBrowserRuntime,
  createLaunchWorkspaceTestRuntime,
  permissionsResource,
  readinessResource,
  requestApprovalTransaction,
  saveProjectTransaction,
} from "./launchWorkspace";
import type { ChatEvent, ChatContext } from "./launchWorkspace";
import type { ChatToken } from "./domain";
import { launchWorkspaceFutureScenarios } from "./launchWorkspace.future";
import { ApprovalApi, LaunchWorkspaceTestServices, ProjectApi, saveProject } from "./services";

describe("Launch Workspace vNext API proof", () => {
  it("assigns every final public API to the flagship example", () => {
    const covered = new Set(launchApiCoverage.map(([api]) => api));

    expect(covered).toEqual(
      new Set([
        "flow.module",
        "flow.resource",
        "flow.transaction",
        "flow.machine",
        "flow.view",
        "flow.app",
        "App.layer",
        "flow.runtime",
        "flow.ensure",
        "flow.observe",
        "flow.refresh",
        "flow.run",
        "flow.patch",
        "flow.invalidate",
        "flow.stream",
        "flow.after",
        "flow.child",
        "flow.can",
        "flow.useResource",
        "flow.use",
        "flow.useView",
        "flowTest",
        "flowTest.app",
        "createControlledEffect",
        "createControlledStream",
      ]),
    );
    expect(contractOnlyRuntimeQuestions).toContain(
      "Transaction params and commit are executable target names; params schema validation remains contract-only.",
    );
  });

  it("publishes structured status facts for docs and Launch Workspace coverage", () => {
    const coveredApiIds = new Set<string>(launchCoveredApiIds);

    expect(
      launchApiSurfaceStatus
        .filter((entry) => coveredApiIds.has(entry.api))
        .map((entry) => entry.api),
    ).toEqual(launchApiCoverage.map(([api]) => api));
    expect(launchApiSurfaceStatus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ api: "flow.ensure", executableStatus: "executable" }),
        expect.objectContaining({ api: "flow.observe", executableStatus: "executable" }),
        expect.objectContaining({ api: "flow.refresh", executableStatus: "executable" }),
        expect.objectContaining({ api: "flow.invalidate", executableStatus: "executable" }),
      ]),
    );
    expect(launchRuntimeFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fact: "Resource snapshots",
          status:
            "executable for seed/get/patch/subscribe plus actor-owned ensure/observe/refresh/invalidate",
        }),
      ]),
    );
    expect(launchStatusNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: "Package topology",
          kind: "future",
        }),
        expect.objectContaining({
          surface: "flow.transaction.params",
          kind: "contract-only",
        }),
        expect.objectContaining({
          surface: "flow.mutation",
          kind: "historical",
        }),
      ]),
    );
    expect(launchStatusNotes.find((entry) => entry.surface === "Package topology")?.note).toContain(
      "@flow-state/react",
    );
  });

  it("wires module, app, layer, runtime, resource, transaction, stream, and child descriptors", () => {
    expect(LaunchWorkspaceModule.kind).toBe("module");
    expect(LaunchWorkspaceApp.kind).toBe("app");
    expect(LaunchWorkspaceAppLayer).toBeDefined();
    expect(LaunchWorkspaceTestAppLayer).toBeDefined();

    expect(launchWorkspaceDescriptor.resourceRefs.project).toMatchObject({
      kind: "resourceRef",
      id: "launch.project",
    });
    expect(saveProjectTransaction.kind).toBe("transaction");
    expect(saveProjectTransaction.config).toMatchObject({
      id: "Project.save",
      params: expect.any(Function),
      commit: expect.any(Function),
    });
    expect(requestApprovalTransaction.kind).toBe("transaction");
    expect(requestApprovalTransaction.config).toMatchObject({
      id: "launch.request-approval",
      params: expect.any(Function),
      commit: expect.any(Function),
    });
    expect(assistantProgressStream.kind).toBe("stream");
    expect(assistantChild.kind).toBe("child");
    expect(launchWorkspaceDescriptor.commitSaveProject.kind).toBe("run");
    expect(launchWorkspaceDescriptor.ensureProject.kind).toBe("ensure");
    expect(launchWorkspaceDescriptor.observeReadiness.kind).toBe("observe");
    expect(launchWorkspaceDescriptor.refreshReadiness.kind).toBe("refresh");
    expect(launchWorkspaceDescriptor.patchProject.kind).toBe("patch");
    expect(launchWorkspaceDescriptor.invalidateProject.kind).toBe("invalidate");

    expect(Project.inventory()).toMatchObject({
      name: "Project",
      resources: ["byId", "comments"],
      transactions: ["save"],
      machines: ["editor"],
      views: [],
      dependencies: ["Session"],
      screens: ["Editor"],
    });
    expect(LaunchWorkspaceApp.inventory()).toMatchObject({
      modules: expect.arrayContaining([
        expect.objectContaining({ name: "LaunchWorkspace" }),
        expect.objectContaining({ name: "Session", resources: ["permissions"] }),
        expect.objectContaining({ name: "Project", resources: ["byId", "comments"] }),
        expect.objectContaining({ name: "Assistant", machines: ["run", "task"] }),
        expect.objectContaining({ name: "Chat", streams: ["tokenStream"] }),
      ]),
      resources: expect.arrayContaining([
        { module: "LaunchWorkspace", name: "project" },
        { module: "Session", name: "permissions" },
        { module: "Project", name: "byId" },
      ]),
      transactions: expect.arrayContaining([
        { module: "LaunchWorkspace", name: "saveProject" },
        { module: "Project", name: "save" },
      ]),
      actors: expect.arrayContaining([
        { module: "LaunchWorkspace", name: "workspace" },
        { module: "Assistant", name: "task" },
        { module: "Chat", name: "composer" },
      ]),
      views: expect.arrayContaining([
        { module: "LaunchWorkspace", name: "workspace" },
        { module: "Launch", name: "overviewView" },
        { module: "Trace", name: "timelineView" },
      ]),
      viewsByScreen: expect.arrayContaining([
        { screen: "Overview", module: "LaunchWorkspace", name: "workspace" },
        { screen: "Overview", module: "Launch", name: "overviewView" },
        { screen: "Trace", module: "Trace", name: "timelineView" },
      ]),
      fixtures: expect.arrayContaining([
        { module: "LaunchWorkspace", name: "launchWorkspaceSeed" },
        { module: "Project", name: "launchWorkspaceSeed.project" },
      ]),
    });
  });

  it("keeps service behavior in Effect with typed failures in the error channel", async () => {
    const staleInput = {
      id: fixtureProject.id,
      draft: projectDraftFrom(fixtureProject),
      baseVersion: 1,
    };
    const exit = await Effect.runPromiseExit(
      saveProject(staleInput).pipe(Effect.provide(LaunchWorkspaceTestServices)),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.findErrorOption(exit.cause);
      expect(Option.isSome(failure)).toBe(true);
      expect(Option.isSome(failure) ? failure.value._tag : "none").toBe("ProjectConflict");
    }
  });

  it("redacts sensitive approval data at the data-model boundary", () => {
    expect(JSON.stringify(fixtureApproval.customerNote)).not.toContain("Sensitive customer");
    expect(Redacted.value(fixtureApproval.customerNote)).toBe("Sensitive customer launch note");
  });

  it("runs the executable workspace flow with flowTest and normal assertions", async () => {
    const harness = flowTest
      .app(LaunchWorkspaceApp)
      .seedResources(launchWorkspaceSeed)
      .start(launchWorkspaceMachine)
      .provide(LaunchWorkspaceTestServices)
      .clock(() => 42_000)
      .start();

    expect(harness.state()).toBe("ready");
    expect(flow.can(harness.snapshot(), { type: "SAVE_PROJECT" })).toBe(true);

    harness.send({
      type: "EDIT_PROJECT",
      draft: { ...harness.context().draft, name: "Atlas v2 launch" },
    });
    expect(harness.context()).toMatchObject({
      activeTab: "editor",
    });
    expect(Option.getOrUndefined(harness.context().lastTraceEvent)).toBe("project:edit");

    harness.send({ type: "SAVE_PROJECT" });
    expect(harness.state()).toBe("saving");

    await harness.flush();

    expect(harness.state()).toBe("ready");
    expect(harness.context()).toMatchObject({
      draft: { name: "Atlas v2 launch" },
    });
    expect(Option.getOrUndefined(harness.context().lastSavedAt)).toBe(42_000);
    expect(Option.getOrUndefined(harness.context().lastTraceEvent)).toBe("project:saved");
  });

  it("routes approval and assistant scenarios without duplicating runtime state", () => {
    const harness = flowTest
      .app(LaunchWorkspaceApp)
      .seedResources(launchWorkspaceSeed)
      .start(launchWorkspaceMachine);

    expect(canRequestApproval({ snapshot: harness.snapshot() })).toBe(true);
    harness.send({ type: "REQUEST_APPROVAL" });
    expect(harness.state()).toBe("requestingApproval");

    harness.send({
      type: "APPROVAL_REQUESTED",
      approval: { ...fixtureApproval, status: "pending" },
    });
    expect(harness.state()).toBe("ready");
    expect(harness.context()).toMatchObject({
      activeTab: "approval",
    });

    harness.send({ type: "RUN_ASSISTANT" }).send({
      type: "ASSISTANT_STEP",
      title: "Draft launch checklist",
    });
    expect(harness.state()).toBe("runningAssistant");
    expect(harness.context().assistantTasks).toEqual(["Draft launch checklist"]);

    harness.send({ type: "ASSISTANT_DONE" });
    expect(harness.state()).toBe("ready");
  });

  it("commits approval requests through the transaction runner", async () => {
    const harness = flowTest
      .app(LaunchWorkspaceApp)
      .seedResources(launchWorkspaceSeed)
      .start(launchWorkspaceMachine)
      .provide(LaunchWorkspaceTestServices)
      .send({ type: "REQUEST_APPROVAL" });

    expect(harness.state()).toBe("requestingApproval");

    await harness.flush();

    expect(harness.state()).toBe("ready");
    expect(harness.context()).toMatchObject({
      activeTab: "approval",
    });
    expect(Option.getOrUndefined(harness.context().lastTraceEvent)).toBe("approval:requested");
    expect(harness.transactions().get("launch.request-approval")).toMatchObject({
      status: "success",
      value: expect.objectContaining({ status: "pending" }),
    });
    expect(harness.snapshot().receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "transaction:success",
          id: "launch.request-approval",
        }),
        expect.objectContaining({
          type: "resource:invalidate",
          count: expect.any(Number),
        }),
      ]),
    );
  });

  it("routes approval denial through the typed transaction failure lane", async () => {
    const deniedApprovalServices = Layer.mergeAll(
      LaunchWorkspaceTestServices,
      Layer.succeed(
        ApprovalApi,
        ApprovalApi.of({
          getApproval: () => Effect.succeed(fixtureApproval),
          submitApproval: () =>
            Effect.fail(new ApprovalDenied({ reason: "Budget must be positive." })),
        }),
      ),
    );

    const harness = flowTest
      .app(LaunchWorkspaceApp)
      .seedResources(launchWorkspaceSeed)
      .start(launchWorkspaceMachine)
      .provide(deniedApprovalServices)
      .send({ type: "REQUEST_APPROVAL" });

    expect(harness.state()).toBe("requestingApproval");

    await harness.flush();

    expect(harness.state()).toBe("ready");
    expect(harness.context()).toMatchObject({
      activeTab: "approval",
    });
    expect(Option.getOrUndefined(harness.context().lastTraceEvent)).toBe("approval:denied");
    expect(harness.transactions().get("launch.request-approval")).toMatchObject({
      status: "failure",
    });
    expect(harness.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "launch.request-approval",
        handled: true,
        error: expect.objectContaining({
          _tag: "ApprovalDenied",
        }),
      }),
    ]);
    expect(
      harness
        .transactions()
        .events("launch.request-approval")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:failure"]));
    expect(
      harness
        .transactions()
        .events("launch.request-approval")
        .filter((receipt) => receipt.type === "transaction:defect"),
    ).toHaveLength(0);
  });

  it("records assistant child lifecycle under the parent actor", async () => {
    const actor = createRuntime().createActor(launchWorkspaceMachine);

    actor.send({ type: "RUN_ASSISTANT" });

    expect(actor.children()).toMatchObject({
      "Assistant.task": {
        id: "Assistant.task",
        status: "active",
        parentState: "runningAssistant",
        supervision: "stop-on-failure",
      },
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "query:start", id: "launch.project" }),
        expect.objectContaining({ type: "query:start", id: "launch.permissions" }),
        expect.objectContaining({ type: "query:start", id: "launch.readiness" }),
        expect.objectContaining({ type: "query:start", id: "launch.assets" }),
        expect.objectContaining({ type: "query:start", id: "launch.approval" }),
        expect.objectContaining({ type: "stream:start", id: "Assistant.progress" }),
        expect.objectContaining({ type: "child:start", id: "Assistant.task" }),
      ]),
    );

    await actor.dispose();

    expect(actor.children()["Assistant.task"]).toMatchObject({
      status: "stopped",
      parentState: "runningAssistant",
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "child:stop", id: "Assistant.task" }),
        expect.objectContaining({ type: "actor:dispose", id: actor.id }),
      ]),
    );
  });

  it("bubbles assistant child typed failures into the parent issue lane", async () => {
    type ChildEvent = { readonly type: "TASK_FAILED" } & FlowEvent;
    const failingStep = flow.resource<[], { readonly ok: true }, "assistant child failed">({
      id: "Assistant.failedStep",
      key: () => createKey("assistant", "failed-step"),
      lookup: () => Effect.fail("assistant child failed" as const),
    });
    const failingTask = flow.machine<{}, ChildEvent, "running">({
      id: "Assistant.failedTask",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.ensure(failingStep.ref()),
        },
      },
    });
    const supervisor = flow.machine<{}, FlowEvent, "running">({
      id: "Assistant.supervisor",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.child({
            id: "Assistant.failedTask",
            machine: failingTask,
            supervision: "stop-on-failure",
          }),
        },
      },
    });
    const actor = createRuntime().createActor(supervisor);

    await actor.flush();

    expect(actor.children()["Assistant.failedTask"]).toMatchObject({
      status: "failure",
      state: "running",
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "child:failure", id: "Assistant.failedTask" }),
      ]),
    );
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "child",
        id: "Assistant.failedTask",
        error: "assistant child failed",
      }),
    ]);
  });

  it("retries only the failed assistant child actor", async () => {
    const attempts: string[] = [];
    const createTask = (id: "failed" | "healthy") => {
      const step = flow.resource<[], { readonly ok: true }, "assistant child failed">({
        id: `Assistant.${id}.step`,
        key: () => createKey("assistant", id, "step"),
        lookup: () =>
          Effect.sync(() => {
            attempts.push(id);
            return { ok: true as const };
          }).pipe(
            Effect.flatMap(() =>
              id === "failed"
                ? Effect.fail("assistant child failed" as const)
                : Effect.succeed({ ok: true as const }),
            ),
          ),
      });
      return flow.machine<{}, FlowEvent, "running">({
        id: `Assistant.${id}.task`,
        initial: "running",
        context: () => ({}),
        states: {
          running: {
            invoke: flow.ensure(step.ref()),
          },
        },
      });
    };
    const supervisor = flow.machine<{}, FlowEvent, "running">({
      id: "Assistant.retrySupervisor",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: [
            flow.child({
              id: "Assistant.failedTask",
              machine: createTask("failed"),
              supervision: "stop-on-failure",
            }),
            flow.child({
              id: "Assistant.healthyTask",
              machine: createTask("healthy"),
              supervision: "stop-on-failure",
            }),
          ],
        },
      },
    });
    const actor = createRuntime().createActor(supervisor);

    await actor.flush();
    expect(actor.children()["Assistant.failedTask"]).toMatchObject({ status: "failure" });
    expect(actor.children()["Assistant.healthyTask"]).toMatchObject({ status: "active" });
    expect(attempts).toEqual(["failed", "healthy"]);

    expect(actor.retryChild("Assistant.healthyTask")).toBe(false);
    expect(actor.retryChild("Assistant.failedTask")).toBe(true);
    await actor.flush();

    expect(attempts).toEqual(["failed", "healthy", "failed"]);
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "child:retry", id: "Assistant.failedTask" }),
      ]),
    );
    expect(
      actor
        .receipts()
        .filter(
          (receipt) => receipt.type === "child:start" && receipt.id === "Assistant.healthyTask",
        ),
    ).toHaveLength(1);
  });

  it("pauses proposed assistant tool actions behind an approval gate", () => {
    const harness = flowTest(Assistant.run).start();

    harness.send({ type: "START_ASSISTANT" });
    expect(harness.state()).toBe("running");

    harness.send({ type: "PROPOSE_ACTION" });
    expect(harness.state()).toBe("needsApproval");

    harness.send({ type: "APPROVE_ACTION" });
    expect(harness.state()).toBe("running");
  });

  it("projects UI state through flow.view instead of asking components to parse runtime internals", () => {
    const harness = flowTest
      .app(LaunchWorkspaceApp)
      .seedResources(launchWorkspaceSeed)
      .start(launchWorkspaceMachine);
    const view = selectView(harness.snapshot(), launchWorkspaceView);

    expect(view).toEqual({
      title: fixtureProject.name,
      activeTab: "overview",
      readinessScore: 84,
      openChecklist: 2,
      assetCount: 1,
      approvalStatus: "draft",
      saveStatus: "idle",
      queuedSaves: 0,
      hasSaveConflict: false,
      traceLabel: "ready",
    });
  });

  it("projects overview and trace operator summaries from live workspace state", async () => {
    const runtime = flow.runtime(LaunchWorkspaceTestAppLayer);
    try {
      runtime.resources.seedResources(launchWorkspaceSeed);
      const actor = runtime.createActor(launchWorkspaceMachine);

      await actor.flush();

      const overview = selectView(actor.getSnapshot(), Launch.overviewView, {
        issues: actor.issues(),
      });
      const trace = selectView(actor.getSnapshot(), Trace.timelineView, {
        issues: actor.issues(),
      });

      expect(overview).toMatchObject({
        projectId: fixtureProject.id,
        projectResourceStatus: "success",
        readinessResourceStatus: "success",
        assetResourceStatus: "success",
        approvalResourceStatus: "success",
        saveTransactionStatus: "idle",
        activeChildIds: [],
        streamIds: [],
        issueCount: 0,
      });
      expect(trace).toMatchObject({
        recentReceiptTypes: expect.arrayContaining(["actor:start", "query:start"]),
        streamSummaries: [],
        childSummaries: [],
        issueSummaries: [],
      });
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps trace summaries aligned with live child, stream, and issue lanes", async () => {
    const deniedApprovalServices = Layer.mergeAll(
      LaunchWorkspaceTestServices,
      Layer.succeed(
        ApprovalApi,
        ApprovalApi.of({
          getApproval: () => Effect.succeed(fixtureApproval),
          submitApproval: () =>
            Effect.fail(new ApprovalDenied({ reason: "Budget must be positive." })),
        }),
      ),
    );
    const runtime = flow.runtime(
      LaunchWorkspaceApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [deniedApprovalServices],
      }),
    );
    try {
      runtime.resources.seedResources(launchWorkspaceSeed);
      const actor = runtime.createActor(launchWorkspaceMachine);

      actor.send({ type: "RUN_ASSISTANT" });
      await actor.flush();
      const runningOverview = selectView(actor.getSnapshot(), Launch.overviewView, {
        issues: actor.issues(),
      });
      const runningTrace = selectView(actor.getSnapshot(), Trace.timelineView, {
        issues: actor.issues(),
      });

      expect(runningOverview).toMatchObject({
        activeChildIds: ["Assistant.task"],
        streamIds: ["Assistant.progress"],
      });
      expect(runningTrace).toMatchObject({
        recentReceiptTypes: expect.arrayContaining(["stream:start", "child:start"]),
        streamSummaries: [
          expect.objectContaining({
            id: "Assistant.progress",
            status: expect.any(String),
          }),
        ],
        childSummaries: [
          expect.objectContaining({
            id: "Assistant.task",
            status: "active",
            parentState: "runningAssistant",
          }),
        ],
      });

      actor.send({ type: "ASSISTANT_DONE" });
      actor.send({ type: "REQUEST_APPROVAL" });
      await actor.flush();

      const failedTrace = selectView(actor.getSnapshot(), Trace.timelineView, {
        issues: actor.issues(),
      });

      expect(failedTrace).toMatchObject({
        issueSummaries: [
          expect.objectContaining({
            id: "launch.request-approval",
            source: "transaction",
            kind: "failure",
          }),
        ],
      });
    } finally {
      await runtime.dispose();
    }
  });

  it("projects debug panel summaries from live workspace state", async () => {
    const runtime = flow.runtime(LaunchWorkspaceTestAppLayer);
    try {
      runtime.resources.seedResources(launchWorkspaceSeed);
      const actor = runtime.createActor(launchWorkspaceMachine);

      await actor.flush();

      const debug = selectView(actor.getSnapshot(), launchWorkspaceDebugView, {
        issues: actor.issues(),
      });

      expect(debug).toMatchObject({
        pendingTransactions: [],
        pendingStreams: [],
        scheduledTimers: [],
        activeChildren: [],
        activeRuntimeFacts: expect.arrayContaining([
          expect.objectContaining({ fact: "Resource snapshots" }),
          expect.objectContaining({ fact: "Receipts" }),
          expect.objectContaining({ fact: "Trace and timeline facts" }),
        ]),
        recentReceipts: expect.arrayContaining([
          expect.objectContaining({ type: "actor:start" }),
          expect.objectContaining({ type: "query:start" }),
        ]),
      });

      actor.send({ type: "RUN_ASSISTANT" });
      await actor.flush();

      const runningDebug = selectView(actor.getSnapshot(), launchWorkspaceDebugView, {
        issues: actor.issues(),
      });

      expect(runningDebug).toMatchObject({
        pendingTransactions: [],
        pendingStreams: [],
        activeChildren: [
          expect.objectContaining({
            id: "Assistant.task",
            status: "active",
            parentState: "runningAssistant",
          }),
        ],
        activeRuntimeFacts: expect.arrayContaining([
          expect.objectContaining({ fact: "Stream snapshots" }),
          expect.objectContaining({ fact: "Child actor snapshots" }),
        ]),
      });
    } finally {
      await runtime.dispose();
    }
  });

  it("surfaces pending save transactions in the debug view", async () => {
    const pendingSaveServices = Layer.mergeAll(
      LaunchWorkspaceTestServices,
      Layer.succeed(
        ProjectApi,
        ProjectApi.of({
          getProject: () => Effect.succeed(fixtureProject),
          listComments: () => Effect.succeed([]),
          saveProject: () => Effect.never,
        }),
      ),
    );
    const runtime = flow.runtime(
      LaunchWorkspaceApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [pendingSaveServices],
      }),
    );
    try {
      runtime.resources.seedResources(launchWorkspaceSeed);
      const actor = runtime.createActor(launchWorkspaceMachine);

      actor.send({
        type: "EDIT_PROJECT",
        draft: { ...projectDraftFrom(fixtureProject), name: "Atlas pending save" },
      });
      actor.send({ type: "SAVE_PROJECT" });
      await actor.flush();

      const debug = selectView(actor.getSnapshot(), launchWorkspaceDebugView, {
        issues: actor.issues(),
      });

      expect(debug).toMatchObject({
        pendingTransactions: ["launch.save-project"],
        pendingStreams: [],
        scheduledTimers: [],
        activeRuntimeFacts: expect.arrayContaining([
          expect.objectContaining({ fact: "Transaction snapshots" }),
        ]),
        recentReceipts: expect.arrayContaining([
          expect.objectContaining({
            type: "transaction:start",
            id: "launch.save-project",
          }),
        ]),
      });
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps launch-workspace views reserved for joined read models", () => {
    expect(Checklist.inventory().views).toEqual([]);
    expect(Project.inventory().views).toEqual([]);

    for (const view of [
      LaunchWorkspaceModule.view,
      Readiness.dashboardView,
      chatLifecycleView,
      Launch.overviewView,
      Trace.timelineView,
    ]) {
      expect(view.config.sources.length).toBeGreaterThan(1);
    }
  });

  it("starts the flagship app from seeded ResourceStore data instead of canonical context copies", () => {
    const harness = flowTest
      .app(LaunchWorkspaceApp)
      .seedResources(launchWorkspaceSeed)
      .start(launchWorkspaceMachine);

    expect(harness.context()).not.toHaveProperty("project");
    expect(harness.context()).not.toHaveProperty("readiness");
    expect(harness.context()).not.toHaveProperty("assets");
    expect(harness.context()).not.toHaveProperty("approval");

    expect(harness.cache().query("launch.project")).toMatchObject({
      status: "success",
      value: fixtureProject,
    });
    expect(harness.cache().query("launch.permissions")).toMatchObject({
      status: "success",
    });
    expect(selectView(harness.snapshot(), launchWorkspaceView)).toMatchObject({
      title: fixtureProject.name,
      readinessScore: 84,
      approvalStatus: "draft",
    });
  });

  it("exposes app-layer ResourceStore and OrchestratorSystem handles on a test runtime factory", async () => {
    const launchRuntime = createLaunchWorkspaceTestRuntime();
    const projectRef = projectResource.ref(fixtureProject.id);
    const seenProjectNames: string[] = [];

    try {
      const unsubscribe = launchRuntime.resources.subscribe(projectRef, (snapshot) => {
        const value = snapshot.value as { readonly name?: string } | undefined;
        if (value?.name !== undefined) {
          seenProjectNames.push(value.name);
        }
      });

      launchRuntime.resources.seedResources(launchWorkspaceSeed);
      launchRuntime.resources.patch(projectRef, (current) => ({
        ...fixtureProject,
        ...current,
        name: "Runtime Atlas",
      }));

      expect(launchRuntime.resources.get(projectRef)).toMatchObject({
        id: "launch.project",
        status: "success",
        value: expect.objectContaining({ name: "Runtime Atlas" }),
      });
      expect(seenProjectNames).toEqual([fixtureProject.name, "Runtime Atlas"]);

      unsubscribe();
      launchRuntime.resources.patch(projectRef, (current) => ({
        ...fixtureProject,
        ...current,
        name: "Runtime Atlas v2",
      }));
      expect(seenProjectNames).toHaveLength(2);

      const actor = launchRuntime.orchestrators.start(
        createChatComposer(launchWorkspaceDescriptor.streams.chat),
        {
          id: "chat:runtime-layer",
          policy: "keep-alive",
        },
      );

      expect(launchRuntime.orchestrators.get("chat:runtime-layer")).toBe(actor);
      await launchRuntime.orchestrators.stop("chat:runtime-layer");
      expect(launchRuntime.orchestrators.get("chat:runtime-layer")).toBeNull();
    } finally {
      await launchRuntime.dispose();
    }
  });

  it("keeps refresh and invalidate executable in the Launch Workspace runtime slice", async () => {
    const machine = flow.machine<{}, FlowEvent, "ready">({
      id: "launch.status.resource-runtime",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: [
            launchWorkspaceDescriptor.ensureProject,
            launchWorkspaceDescriptor.refreshReadiness,
            launchWorkspaceDescriptor.invalidateProject,
          ],
        },
      },
    });
    const runtime = flow.runtime(LaunchWorkspaceTestAppLayer);
    runtime.resources.seedResources([
      ...launchWorkspaceSeed.filter((entry) => entry.ref.id !== "launch.readiness"),
      {
        ref: readinessResource.ref(fixtureProject.id),
        value: [
          { id: "traffic", label: "Traffic", score: 12, updatedAt: 10 },
          { id: "support", label: "Support", score: 15, updatedAt: 10 },
          { id: "legal", label: "Legal", score: 18, updatedAt: 10 },
        ],
      },
    ]);

    const actor = runtime.createActor(machine);
    await actor.flush();
    await Promise.resolve();
    await actor.flush();

    expect(actor.snapshot().resources["launch.project"]).toMatchObject({
      status: "stale",
      freshness: "invalidated",
      value: expect.objectContaining({ id: fixtureProject.id }),
    });
    expect(actor.snapshot().resources["launch.readiness"]).toMatchObject({
      status: "success",
      freshness: "fresh",
      value: expect.arrayContaining([expect.objectContaining({ id: "traffic", score: 91 })]),
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "query:start",
          id: "launch.project",
          mode: "ensure",
        }),
        expect.objectContaining({
          type: "query:start",
          id: "launch.readiness",
          mode: "refresh",
        }),
        expect.objectContaining({
          type: "resource:invalidate",
          id: "launch:project",
          count: expect.any(Number),
        }),
      ]),
    );
    expect(actor.issues()).toEqual([]);

    await runtime.dispose();
  });

  it("gates launch commands from the permissions resource rather than copied context", () => {
    const deniedPermissions = {
      canEditProject: false,
      canUploadAssets: true,
      canRequestApproval: false,
      canRunAssistant: true,
    };
    const harness = flowTest
      .app(LaunchWorkspaceApp)
      .seedResources([
        ...launchWorkspaceSeed.filter((entry) => entry.ref.id !== "launch.permissions"),
        {
          ref: permissionsResource.ref(fixtureProject.id),
          value: deniedPermissions,
        },
      ])
      .start(launchWorkspaceMachine);

    expect(canSaveProject({ snapshot: harness.snapshot() })).toBe(false);
    expect(canRequestApproval({ snapshot: harness.snapshot() })).toBe(false);
    expect(harness.can({ type: "SAVE_PROJECT" })).toBe(false);
    expect(harness.can({ type: "REQUEST_APPROVAL" })).toBe(false);
  });

  it("fails closed when permission and approval resources are missing", () => {
    const harness = flowTest(launchWorkspaceMachine).start();

    expect(canSaveProject({ snapshot: harness.snapshot() })).toBe(false);
    expect(canRequestApproval({ snapshot: harness.snapshot() })).toBe(false);
    expect(harness.can({ type: "SAVE_PROJECT" })).toBe(false);
    expect(harness.can({ type: "REQUEST_APPROVAL" })).toBe(false);
  });

  it("runs project save as a preview transaction with rollback on typed failure", async () => {
    const conflictServices = Layer.mergeAll(
      LaunchWorkspaceTestServices,
      Layer.succeed(
        ProjectApi,
        ProjectApi.of({
          getProject: () => Effect.succeed(fixtureProject),
          listComments: () => Effect.succeed([]),
          saveProject: () =>
            Effect.fail(
              new ProjectConflict({
                serverVersion: fixtureProject.version,
                serverProject: fixtureProject,
              }),
            ),
        }),
      ),
    );
    const harness = flowTest
      .app(LaunchWorkspaceApp)
      .seedResources(launchWorkspaceSeed)
      .start(launchWorkspaceMachine)
      .provide(conflictServices)
      .send({
        type: "EDIT_PROJECT",
        draft: { ...projectDraftFrom(fixtureProject), name: "Atlas v2 launch" },
      })
      .send({ type: "SAVE_PROJECT" });

    expect(harness.state()).toBe("saving");
    expect(harness.cache().query("launch.project")).toMatchObject({
      value: expect.objectContaining({ name: "Atlas v2 launch" }),
    });
    expect(harness.transactions().previewPatches("launch.save-project")).toHaveLength(1);

    await harness.flush();

    expect(harness.state()).toBe("saveConflict");
    expect(harness.transactions().rollbacks("launch.save-project")).toHaveLength(1);
    expect(selectView(harness.snapshot(), launchWorkspaceView)).toMatchObject({
      saveStatus: "failure",
      queuedSaves: 0,
      hasSaveConflict: true,
    });
    expect(harness.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "launch.save-project",
        handled: true,
      }),
    ]);
  });

  it("fails closed for offline save requests while queue semantics are parked", () => {
    const saveCalls: SaveProjectParams[] = [];
    const queueParkedServices = Layer.mergeAll(
      LaunchWorkspaceTestServices,
      Layer.succeed(
        ProjectApi,
        ProjectApi.of({
          getProject: () => Effect.succeed(fixtureProject),
          listComments: () => Effect.succeed([]),
          saveProject: (params) =>
            Effect.sync(() => {
              saveCalls.push(params);
              return { ...fixtureProject, ...params.draft, version: params.baseVersion + 1 };
            }),
        }),
      ),
    );

    const offlineDraft = { ...projectDraftFrom(fixtureProject), name: "Offline Atlas" };
    const harness = flowTest
      .app(LaunchWorkspaceApp)
      .seedResources(launchWorkspaceSeed)
      .start(launchWorkspaceMachine)
      .provide(queueParkedServices)
      .send({ type: "GO_OFFLINE" })
      .send({ type: "EDIT_PROJECT", draft: offlineDraft });

    expect(harness.can({ type: "SAVE_PROJECT" })).toBe(false);

    harness.send({ type: "SAVE_PROJECT" });

    expect(saveCalls).toHaveLength(0);
    expect(harness.state()).toBe("ready");
    expect(harness.transactions().get("launch.save-project")).toBeUndefined();
    expect(selectView(harness.snapshot(), launchWorkspaceView)).toMatchObject({
      saveStatus: "idle",
      queuedSaves: 0,
      hasSaveConflict: false,
    });
  });

  it("keeps parked offline transaction scenarios as explicit future markers", () => {
    expect(launchWorkspaceFutureScenarios).toEqual([
      expect.objectContaining({
        id: "offline-save-undo",
      }),
      expect.objectContaining({
        id: "offline-reconnect-conflict",
      }),
    ]);
  });

  it("uses Effect Stream descriptors for upload, assistant, and chat pressure points", () => {
    const assistantSubscribe = assistantProgressStream.config.subscribe;
    const uploadSubscribe = launchWorkspaceDescriptor.streams.upload.config.subscribe;
    const chatSubscribe = launchWorkspaceDescriptor.streams.chat.config.subscribe;
    expect(assistantSubscribe).toBeTypeOf("function");
    expect(uploadSubscribe).toBeTypeOf("function");
    expect(chatSubscribe).toBeTypeOf("function");
    if (assistantSubscribe === undefined) {
      throw new Error("expected assistant stream to expose subscribe");
    }
    expect(assistantSubscribe.name).toBe("subscribeAssistantProgress");
    expect(launchWorkspaceDescriptor.streams.upload.config.pressure).toMatchObject({
      strategy: "coalesce-latest",
    });
  });

  it("keeps chat generation alive across route detach and disposes cleanup explicitly", async () => {
    const tokens = createControlledStream<ChatToken, never>("launch.chat.tokens");
    const controlledTokenStream = flow.stream<ChatContext, ChatEvent, void, ChatToken>({
      id: "Chat.tokenStream",
      subscribe: () => tokens.stream(),
      routes: {
        value: (token) => ({ type: "CHAT_TOKEN", token }),
      },
    });
    const runtime = createRuntime();
    const actor = runtime.orchestrators.start(createChatComposer(controlledTokenStream), {
      id: "chat:launch-1",
      policy: "keep-alive",
    });

    actor.send({ type: "TYPE_PROMPT", prompt: "Draft launch summary" });
    actor.send({ type: "SUBMIT_PROMPT" });
    const unsubscribe = actor.subscribe(() => undefined);

    tokens.emit({ index: 0, text: "Ready" });
    await actor.flush();
    expect(selectView(actor.snapshot(), chatLifecycleView)).toMatchObject({
      partialText: "Ready",
      streamStatus: "running",
      cleanupStatus: "subscribed",
    });

    unsubscribe();
    tokens.emit({ index: 1, text: " now" });
    await actor.flush();

    const reattached = runtime.orchestrators.get("chat:launch-1");
    expect(reattached).toBe(actor);
    expect(selectView(actor.snapshot(), chatLifecycleView)).toMatchObject({
      partialText: "Ready now",
      cleanupStatus: "unsubscribed",
    });

    await runtime.orchestrators.stop("chat:launch-1");
    await actor.flush();

    expect(tokens.cancelled()).toBe(true);
    expect(selectView(actor.snapshot(), chatLifecycleView)).toMatchObject({
      streamStatus: "interrupt",
      cleanupStatus: "disposed",
    });
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "interrupt",
        source: "stream",
        id: "Chat.tokenStream",
      }),
    ]);
  });

  it("stops chat generation as an interrupt and ignores stale tokens from the old generation", async () => {
    const firstTokens = createControlledStream<ChatToken, never>("launch.chat.tokens.first");
    const secondTokens = createControlledStream<ChatToken, never>("launch.chat.tokens.second");
    let streamStarts = 0;
    const controlledTokenStream = flow.stream<ChatContext, ChatEvent, void, ChatToken>({
      id: "Chat.tokenStream",
      subscribe: () => {
        if (streamStarts === 0) {
          streamStarts += 1;
          return firstTokens.stream();
        }
        if (streamStarts === 1) {
          streamStarts += 1;
          return secondTokens.stream();
        }
        throw new Error("Unexpected extra chat token stream generation.");
      },
      routes: {
        value: (token) => ({ type: "CHAT_TOKEN", token }),
      },
    });
    const harness = flowTest(createChatComposer(controlledTokenStream)).start();

    harness
      .send({ type: "TYPE_PROMPT", prompt: "Draft launch summary" })
      .send({ type: "SUBMIT_PROMPT" });
    const firstGeneration = harness.streams().running("Chat.tokenStream")?.generation;
    expect(firstGeneration).toBe(1);

    firstTokens.emit({ index: 0, text: "Ready" });
    await harness.flush();
    expect(harness.context().partial).toBe("Ready");

    harness.send({ type: "STOP_GENERATION" });
    await harness.flush();

    expect(firstTokens.cancelled()).toBe(true);
    expect(harness.state()).toBe("idle");
    expect(harness.streams().cancelled("Chat.tokenStream")).toMatchObject({
      status: "interrupt",
      generation: firstGeneration,
    });
    expect(
      harness
        .streams()
        .events("Chat.tokenStream")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["stream:interrupt"]));
    expect(
      harness
        .streams()
        .events("Chat.tokenStream")
        .map((receipt) => receipt.type),
    ).not.toEqual(expect.arrayContaining(["stream:failure", "stream:defect"]));
    expect(harness.issues()).toEqual([
      expect.objectContaining({
        kind: "interrupt",
        source: "stream",
        id: "Chat.tokenStream",
      }),
    ]);

    firstTokens.emit({ index: 1, text: " stale" });
    harness
      .send({ type: "TYPE_PROMPT", prompt: "Regenerate launch summary" })
      .send({ type: "SUBMIT_PROMPT" });
    const secondGeneration = harness.streams().running("Chat.tokenStream")?.generation;
    expect(secondGeneration).toBeGreaterThan(firstGeneration ?? 0);

    secondTokens.emit({ index: 0, text: "Fresh" });
    await harness.flush();

    expect(harness.context().partial).toBe("Fresh");
    expect(harness.streams().running("Chat.tokenStream")).toMatchObject({
      generation: secondGeneration,
      emitted: 1,
    });
  });

  it("keeps guards pure and data-owned by the context/resource boundary", () => {
    const harness = flowTest
      .app(LaunchWorkspaceApp)
      .seedResources(launchWorkspaceSeed)
      .start(launchWorkspaceMachine);
    const context = createInitialContext();

    expect(canSaveProject({ snapshot: harness.snapshot() })).toBe(true);
    expect(
      canSaveProject({
        snapshot: flowTest
          .app(LaunchWorkspaceApp)
          .seedResources(launchWorkspaceSeed)
          .start(launchWorkspaceMachine, {
            input: { draft: { ...context.draft, name: " " } },
          })
          .snapshot(),
      }),
    ).toBe(false);
    expect(readinessResource.ref(fixtureProject.id)).toMatchObject({
      kind: "resourceRef",
      id: "launch.readiness",
    });
    expect(projectResource.ref(fixtureProject.id)).toMatchObject({
      kind: "resourceRef",
      id: "launch.project",
    });
    expect(approvalResource.ref(fixtureProject.id)).toMatchObject({
      kind: "resourceRef",
      id: "launch.approval",
    });
  });

  it("seeds Launch Workspace module fixtures without hand-wiring resource refs", () => {
    const harness = flowTest
      .app(LaunchWorkspaceApp)
      .seedModuleFixtures("launchWorkspaceSeed")
      .start(launchWorkspaceMachine);

    expect(harness.cache().query("launch.project")).toMatchObject({
      id: "launch.project",
      status: "success",
      value: fixtureProject,
    });
    expect(selectView(harness.snapshot(), launchWorkspaceView)).toMatchObject({
      title: fixtureProject.name,
      readinessScore: 84,
      approvalStatus: fixtureApproval.status,
    });
  });

  it("keeps controlled helper coverage explicit alongside app harness scenarios", () => {
    const controlledSave = createControlledEffect<string, Error>("launch.save");
    controlledSave.succeed("ok");

    expect(controlledSave.state()).toMatchObject({
      status: "success",
      value: "ok",
    });

    const controlledStream = createControlledStream<string, Error>("launch.stream");
    controlledStream.emit("token");
    controlledStream.end();

    expect(controlledStream.events().map((event) => event.type)).toEqual(["value", "done"]);
  });

  it("produces graph, trace, replay, model, and story descriptors for review tooling", () => {
    expect(launchWorkspaceGraph.kind).toBe("graph");
    expect(launchWorkspaceTrace.kind).toBe("trace");
    expect(launchWorkspaceReplay.kind).toBe("replay");
    expect(launchWorkspaceModel.kind).toBe("model");
    expect(
      launchWorkspaceModel
        .getSimplePaths({
          events: [
            { type: "GO_OFFLINE" },
            { type: "RECONNECT" },
            { type: "SAVE_PROJECT" },
            { type: "REQUEST_APPROVAL" },
            { type: "RUN_ASSISTANT" },
          ],
        })
        .map((path) => ({
          state: path.state.value,
          events: path.steps.map((step) => step.event.type),
        })),
    ).toEqual(
      expect.arrayContaining([
        { state: "saving", events: ["SAVE_PROJECT"] },
        { state: "requestingApproval", events: ["REQUEST_APPROVAL"] },
        { state: "runningAssistant", events: ["RUN_ASSISTANT"] },
      ]),
    );
    expect(launchWorkspaceStories.kind).toBe("stories");
  });

  it("creates fresh browser and test runtimes from the launch workspace app layers", async () => {
    const browserRuntimeA = createLaunchWorkspaceBrowserRuntime();
    const browserRuntimeB = createLaunchWorkspaceBrowserRuntime();
    const testRuntimeA = createLaunchWorkspaceTestRuntime();
    const testRuntimeB = createLaunchWorkspaceTestRuntime();

    try {
      expect(browserRuntimeA).not.toBe(browserRuntimeB);
      expect(testRuntimeA).not.toBe(testRuntimeB);
      expect(browserRuntimeA.managedRuntime).toBeDefined();
      expect(testRuntimeA.managedRuntime).toBeDefined();
    } finally {
      await browserRuntimeA.dispose();
      await browserRuntimeB.dispose();
      await testRuntimeA.dispose();
      await testRuntimeB.dispose();
    }
  });
});
