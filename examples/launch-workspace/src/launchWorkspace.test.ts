import { Cause, Effect, Exit, Layer, Option, Redacted } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  createControlledEffect,
  createControlledStream,
  flow,
  flowTest,
  selectView,
} from "@flow-state/core";

import { ProjectConflict, fixtureApproval, fixtureProject, projectDraftFrom } from "./domain";
import {
  LaunchWorkspaceApp,
  LaunchWorkspaceAppLayer,
  LaunchWorkspaceModule,
  LaunchWorkspaceTestAppLayer,
  projectResource,
  approvalResource,
  assistantChild,
  assistantProgressStream,
  canRequestApproval,
  canSaveProject,
  contractOnlyRuntimeQuestions,
  createInitialContext,
  launchApiCoverage,
  launchRuntime,
  launchWorkspaceDescriptor,
  launchWorkspaceGraph,
  launchWorkspaceMachine,
  launchWorkspaceModel,
  launchWorkspaceReplay,
  launchWorkspaceSeed,
  launchWorkspaceStories,
  launchWorkspaceTrace,
  launchWorkspaceView,
  permissionsResource,
  readinessResource,
  requestApprovalTransaction,
  saveProjectTransaction,
} from "./launchWorkspace";
import { LaunchWorkspaceTestServices, ProjectApi, saveProject } from "./services";

describe("Launch Workspace vNext API proof", () => {
  it("assigns every final public API to the flagship example", () => {
    const covered = new Set(launchApiCoverage.map(([api]) => api));

    expect(covered).toEqual(
      new Set([
        "flow.module",
        "flow.resource",
        "flow.transaction",
        "flow.mutation",
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
      "Transaction params and commit are target names; runtime configs still adapt through input and effect.",
    );
  });

  it("wires module, app, layer, runtime, resource, transaction, stream, and child descriptors", () => {
    expect(LaunchWorkspaceModule.kind).toBe("module");
    expect(LaunchWorkspaceApp.kind).toBe("app");
    expect(LaunchWorkspaceAppLayer).toBeDefined();
    expect(LaunchWorkspaceTestAppLayer).toBeDefined();
    expect(launchRuntime.managedRuntime).toBeDefined();

    expect(launchWorkspaceDescriptor.resourceRefs.project).toMatchObject({
      kind: "resourceRef",
      id: "launch.project",
    });
    expect(saveProjectTransaction.kind).toBe("mutation");
    expect(requestApprovalTransaction.kind).toBe("mutation");
    expect(assistantProgressStream.kind).toBe("stream");
    expect(assistantChild.kind).toBe("child");
    expect(launchWorkspaceDescriptor.commitSaveProject.kind).toBe("run");
    expect(launchWorkspaceDescriptor.ensureProject.kind).toBe("ensure");
    expect(launchWorkspaceDescriptor.observeReadiness.kind).toBe("observe");
    expect(launchWorkspaceDescriptor.refreshReadiness.kind).toBe("refresh");
    expect(launchWorkspaceDescriptor.patchProject.kind).toBe("patch");
    expect(launchWorkspaceDescriptor.invalidateProject.kind).toBe("invalidate");
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
      traceLabel: "ready",
    });
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

    expect(harness.state()).toBe("ready");
    expect(harness.transactions().rollbacks("launch.save-project")).toHaveLength(1);
    expect(harness.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "mutation",
        id: "launch.save-project",
        handled: true,
      }),
    ]);
  });

  it("uses Effect Stream descriptors for upload, assistant, and chat pressure points", () => {
    expect(assistantProgressStream.config.stream.name).toBe("subscribeAssistantProgress");
    expect(assistantProgressStream.config.stream).toBeTypeOf("function");
    expect(launchWorkspaceDescriptor.streams.upload.config.stream).toBeTypeOf("function");
    expect(launchWorkspaceDescriptor.streams.chat.config.stream).toBeTypeOf("function");
    expect(launchWorkspaceDescriptor.streams.upload.config.pressure).toMatchObject({
      strategy: "coalesce-latest",
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
            context: { draft: { ...context.draft, name: " " } },
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

  it("keeps controlled helper coverage explicit while the app harness is contract-only", () => {
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
    expect(launchWorkspaceStories.kind).toBe("stories");
  });
});
