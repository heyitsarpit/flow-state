import { describe, expect, it } from "vite-plus/test";

import { flow, flowTest } from "@flow-state/core";

import {
  loadProjectEffect,
  projectEditorApiSketch,
  projectKeys,
  projectServiceTestLayer,
  projectTags,
  saveProjectEffect,
} from "./projectApi";
import {
  projectEditorMachine,
  selectCanSave,
  selectIsDirty,
  selectProjectKey,
} from "./projectFlow";
import type { Project, ProjectConflict, ProjectEditorEvent, ProjectNotFound } from "./projectFlow";

function createProjectHarness() {
  return flowTest(projectEditorMachine).provide(projectServiceTestLayer.layer);
}

type ProjectHarness = ReturnType<typeof createProjectHarness>;

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    title: "Launch board",
    summary: "Draft the public launch plan.",
    version: 1,
    updatedAt: 1_000,
    ...overrides,
  };
}

async function openAndLoad(item: Project = project()): Promise<ProjectHarness> {
  const harness = createProjectHarness().send({ type: "OPEN_PROJECT", projectId: item.id });
  expect(harness.effects().running("project.load")).toMatchObject({
    id: "project.load",
    status: "loading",
    requestId: 1,
  });
  loadProjectEffect.succeed(item);
  await harness.flush();
  return harness;
}

describe("Example 1 Project Editor API pressure", () => {
  it("records the intended Effect service, query, mutation, key, tag, and routes", () => {
    const key = projectKeys.detail("project-1");

    expect(key).toMatchObject({
      kind: "key",
      parts: ["project", "project-1"],
      hash: selectProjectKey("project-1"),
    });
    expect(projectTags.project).toEqual({ kind: "tag", name: "project" });
    expect(projectEditorApiSketch.loadProject.kind).toBe("query");
    expect(projectEditorApiSketch.loadProject.config).toMatchObject({
      id: "project.load",
      routes: {
        success: expect.any(Function),
        failure: expect.any(Function),
        defect: expect.any(Function),
        interrupt: expect.any(Function),
      },
    });
    expect(projectEditorApiSketch.saveProject.kind).toBe("mutation");
    expect(projectEditorApiSketch.saveProject.config).toMatchObject({
      id: "project.save",
      scope: "project-save",
      concurrency: "reject-while-running",
      routes: {
        success: expect.any(Function),
        failure: expect.any(Function),
        defect: expect.any(Function),
        interrupt: expect.any(Function),
      },
    });
    expect(projectServiceTestLayer.kind).toBe("testLayer");
    expect(projectServiceTestLayer.layer).toBeDefined();
  });

  it("starts load query work when the loading state is entered", async () => {
    const harness = createProjectHarness().send({ type: "OPEN_PROJECT", projectId: "project-1" });

    expect(harness.state()).toBe("loading");
    expect(harness.context()).toEqual({
      projectId: "project-1",
      project: null,
      draft: {
        title: "",
        summary: "",
      },
      currentIssue: null,
    });
    expect(harness.resources()).toMatchObject({
      "project.load": {
        id: "project.load",
        key: selectProjectKey("project-1"),
        status: "loading",
        fetchStatus: "fetching",
        requestId: 1,
      },
    });
    expect(harness.receipts()).toContainEqual({
      type: "query:start",
      id: "project.load",
      requestId: 1,
      key: selectProjectKey("project-1"),
    });

    loadProjectEffect.cancel();
    await harness.flush();
  });

  it("routes successful load outcomes through the machine", async () => {
    const item = project();
    const harness = createProjectHarness().send({ type: "OPEN_PROJECT", projectId: item.id });

    loadProjectEffect.succeed(item);
    await harness.flush();

    expect(harness.state()).toBe("editing");
    expect(harness.context()).toMatchObject({
      projectId: item.id,
      project: item,
      draft: {
        title: item.title,
        summary: item.summary,
      },
      currentIssue: null,
    });
    expect(harness.resources()["project.load"]).toMatchObject({
      status: "success",
      fetchStatus: "idle",
      requestId: null,
      value: item,
    });
    expect(harness.receipts()).toContainEqual({
      type: "query:success",
      id: "project.load",
      requestId: 1,
      key: selectProjectKey(item.id),
    });
  });

  it("routes typed load failures separately from defects and keeps runtime issues", async () => {
    const error: ProjectNotFound = { _tag: "ProjectNotFound", projectId: "project-1" };
    const harness = createProjectHarness().send({
      type: "OPEN_PROJECT",
      projectId: "project-1",
    });

    loadProjectEffect.fail(error);
    await harness.flush();

    expect(harness.state()).toBe("loadFailure");
    expect(harness.context().currentIssue).toEqual({
      kind: "failure",
      source: "query",
      requestId: 1,
      error,
      handled: true,
    });
    expect(harness.resources()["project.load"]).toMatchObject({
      status: "failure",
      failureCount: 1,
      error,
    });
    expect(harness.issues()).toContainEqual({
      kind: "failure",
      source: "query",
      id: "project.load",
      requestId: 1,
      key: selectProjectKey("project-1"),
      error,
      handled: true,
    });

    harness.send({ type: "RETRY_LOAD" });
    expect(harness.state()).toBe("loading");
    expect(harness.resources()["project.load"]).toMatchObject({
      status: "loading",
      requestId: 2,
    });

    loadProjectEffect.cancel();
    await harness.flush();
  });

  it("routes load defects without pretending they are typed failures", async () => {
    const defect = new Error("decoder exploded");
    const harness = createProjectHarness().send({
      type: "OPEN_PROJECT",
      projectId: "project-1",
    });

    loadProjectEffect.die(defect);
    await harness.flush();

    expect(harness.state()).toBe("defect");
    expect(harness.context().currentIssue).toEqual({
      kind: "defect",
      source: "query",
      requestId: 1,
      defect,
      handled: false,
    });
    expect(harness.issues()).toContainEqual({
      kind: "defect",
      source: "query",
      id: "project.load",
      requestId: 1,
      key: selectProjectKey("project-1"),
      defect,
      handled: false,
    });
  });
});

describe("Example 1 Project Editor state machine", () => {
  it("starts with no product state and no runtime work", () => {
    const harness = createProjectHarness();

    expect(harness.state()).toBe("idle");
    expect(harness.can({ type: "SAVE_PROJECT" })).toBe(false);
    expect(harness.snapshot()).toMatchObject({
      value: "idle",
      changed: false,
      event: null,
      resources: {},
      mutations: {},
      receipts: [],
      issues: [],
    });
    expect(harness.context()).toEqual({
      projectId: null,
      project: null,
      draft: {
        title: "",
        summary: "",
      },
      currentIssue: null,
    });
  });

  it("edits draft fields and enables save only when the draft is valid and dirty", async () => {
    const harness = await openAndLoad();

    harness
      .send({ type: "EDIT_TITLE", title: "  Launch plan v2  " })
      .send({ type: "EDIT_SUMMARY", summary: "Sharper launch narrative." });

    expect(harness.state()).toBe("editing");
    expect(harness.context().draft).toEqual({
      title: "  Launch plan v2  ",
      summary: "Sharper launch narrative.",
    });
    expect(selectIsDirty(harness.context())).toBe(true);
    expect(harness.can({ type: "SAVE_PROJECT" })).toBe(true);

    harness.send({ type: "EDIT_TITLE", title: "   " });
    expect(selectCanSave(harness.context())).toBe(false);
    expect(harness.can({ type: "SAVE_PROJECT" })).toBe(false);
    expect(flow.can(projectEditorMachine.getInitialSnapshot(), { type: "SAVE_PROJECT" })).toBe(
      false,
    );
  });

  it("submits a save mutation with normalized variables and rejects overlapping saves", async () => {
    const harness = await openAndLoad();

    harness.send({ type: "EDIT_TITLE", title: "  Launch     plan v2  " });
    harness.send({ type: "SAVE_PROJECT" });
    const savingSnapshot = harness.snapshot();

    expect(harness.state()).toBe("saving");
    expect(harness.can({ type: "SAVE_PROJECT" })).toBe(false);
    expect(harness.mutations()["project.save"]).toMatchObject({
      id: "project.save",
      status: "running",
      requestId: 2,
      variables: {
        projectId: "project-1",
        draft: {
          title: "Launch plan v2",
          summary: "Draft the public launch plan.",
        },
        baseVersion: 1,
      },
    });

    harness.send({ type: "SAVE_PROJECT" });
    expect(harness.snapshot()).toBe(savingSnapshot);

    saveProjectEffect.cancel();
    await harness.flush();
  });

  it("saves successfully, marks the draft clean, and records invalidation receipts", async () => {
    const saved = project({
      title: "Launch plan v2",
      summary: "Draft the public launch plan.",
      version: 2,
      updatedAt: 2_000,
    });
    const harness = await openAndLoad();

    harness.send({ type: "EDIT_TITLE", title: "Launch plan v2" }).send({ type: "SAVE_PROJECT" });
    saveProjectEffect.succeed(saved);
    await harness.flush();

    expect(harness.state()).toBe("editing");
    expect(harness.can({ type: "SAVE_PROJECT" })).toBe(false);
    expect(harness.context()).toMatchObject({
      project: saved,
      draft: {
        title: "Launch plan v2",
        summary: "Draft the public launch plan.",
      },
      currentIssue: null,
    });
    expect(harness.mutations()["project.save"]).toMatchObject({
      status: "success",
      requestId: null,
      value: saved,
    });
    expect(harness.cache().invalidations()).toContainEqual(
      expect.objectContaining({
        type: "cache:invalidate",
        id: "project.save",
        requestId: 2,
        key: "tag:project",
        target: "tag:project",
      }),
    );
    expect(selectIsDirty(harness.context())).toBe(false);
  });

  it("keeps typed save failures editable and retryable without losing the draft", async () => {
    const conflictProject = project({
      title: "Server title",
      version: 3,
      updatedAt: 3_000,
    });
    const error = {
      _tag: "ProjectConflict",
      serverVersion: 3,
      serverProject: conflictProject,
    } satisfies ProjectConflict;
    const harness = await openAndLoad();

    harness.send({ type: "EDIT_TITLE", title: "Local title" }).send({ type: "SAVE_PROJECT" });
    saveProjectEffect.fail(error);
    await harness.flush();

    expect(harness.state()).toBe("saveFailure");
    expect(harness.context()).toMatchObject({
      project: conflictProject,
      draft: {
        title: "Local title",
        summary: "Draft the public launch plan.",
      },
      currentIssue: {
        kind: "failure",
        source: "mutation",
        requestId: 2,
        error,
        handled: true,
      },
    });
    expect(harness.issues()).toContainEqual({
      kind: "failure",
      source: "mutation",
      id: "project.save",
      requestId: 2,
      error,
      handled: true,
    });
    expect(harness.can({ type: "SAVE_PROJECT" })).toBe(true);

    harness.send({ type: "SAVE_PROJECT" });
    expect(harness.state()).toBe("saving");
    expect(harness.mutations()["project.save"]).toMatchObject({
      status: "running",
      requestId: 3,
      variables: {
        projectId: "project-1",
        baseVersion: 3,
      },
    });

    saveProjectEffect.cancel();
    await harness.flush();
  });

  it("routes save defects separately from typed save failures", async () => {
    const defect = new Error("transport crashed");
    const harness = await openAndLoad();

    harness.send({ type: "EDIT_TITLE", title: "Launch plan v2" }).send({ type: "SAVE_PROJECT" });
    saveProjectEffect.die(defect);
    await harness.flush();

    expect(harness.state()).toBe("defect");
    expect(harness.context().currentIssue).toEqual({
      kind: "defect",
      source: "mutation",
      requestId: 2,
      defect,
      handled: false,
    });
    expect(harness.mutations()["project.save"]).toMatchObject({
      status: "failure",
      requestId: null,
      error: defect,
      failureCount: 1,
    });
  });

  it("ignores late query completions from inactive generations", async () => {
    const harness = createProjectHarness()
      .send({ type: "OPEN_PROJECT", projectId: "project-1" })
      .send({ type: "OPEN_PROJECT", projectId: "project-2" });
    const currentLoading = harness.snapshot();

    loadProjectEffect.succeed(project({ id: "project-1" }));
    await harness.flush();

    expect(harness.snapshot()).toBe(currentLoading);
    expect(harness.resources()["project.load"]).toMatchObject({
      key: selectProjectKey("project-2"),
      requestId: 2,
      status: "loading",
    });

    loadProjectEffect.cancel();
    await harness.flush();
  });

  it("records cancellation receipts when a new project replaces active work", async () => {
    const harness = createProjectHarness()
      .send({ type: "OPEN_PROJECT", projectId: "project-1" })
      .send({ type: "OPEN_PROJECT", projectId: "project-2" });

    expect(harness.state()).toBe("loading");
    expect(harness.receipts()).toEqual([
      {
        type: "query:start",
        id: "project.load",
        requestId: 1,
        key: selectProjectKey("project-1"),
      },
      {
        type: "query:cancel",
        id: "project.load",
        requestId: 1,
        key: selectProjectKey("project-1"),
      },
      {
        type: "query:start",
        id: "project.load",
        requestId: 2,
        key: selectProjectKey("project-2"),
      },
    ]);

    loadProjectEffect.cancel();
    loadProjectEffect.cancel();
    await harness.flush();
  });

  it("keeps scenario tests readable as state -> event -> expectation transcripts", async () => {
    const events: ProjectEditorEvent[] = [
      { type: "OPEN_PROJECT", projectId: "project-1" },
      { type: "EDIT_SUMMARY", summary: "Ignored while loading" },
    ];

    const harness = createProjectHarness();
    for (const event of events) {
      harness.send(event);
    }
    loadProjectEffect.succeed(project());
    await harness.flush();
    harness.send({ type: "EDIT_SUMMARY", summary: "Updated summary" }).send({
      type: "DISCARD_CHANGES",
    });

    expect(harness.state()).toBe("editing");
    expect(harness.can({ type: "SAVE_PROJECT" })).toBe(false);
    expect(harness.context()).toMatchObject({
      draft: {
        title: "Launch board",
        summary: "Draft the public launch plan.",
      },
    });
  });
});
