import { Cause, Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import { createKey, createTag } from "./index.js";
import { ResourceStore } from "./core/runtime/services/resource-store.js";
import * as flow from "./index.js";

type ProjectRecord = Readonly<{
  readonly id: string;
  readonly name: string;
}>;

function expectResourceCallbackDiagnostic(
  thunk: () => unknown,
  callback: "lookup" | "tags" | "placeholder" | "key",
): FlowDiagnostic & { readonly cause?: unknown } {
  try {
    thunk();
  } catch (error) {
    expect(error instanceof FlowDiagnostic).toBe(true);
    if (!(error instanceof FlowDiagnostic)) {
      throw error;
    }

    expect(error).toMatchObject({
      code: "FLOW-STORE-002",
      title: `Resource callback '${callback}' threw for 'Project.byId'`,
      debug: {
        callback,
        cause: expect.objectContaining({
          message: `${callback} exploded`,
          name: "Error",
          stack: expect.any(String),
        }),
        resourceId: "Project.byId",
      },
    });
    expect(
      (error.debug.cause as Readonly<{ readonly stack?: string }> | undefined)?.stack,
    ).toContain(`${callback} exploded`);

    return error as FlowDiagnostic & { readonly cause?: unknown };
  }

  throw new Error("expected resource callback to throw a FlowDiagnostic");
}

describe("resource callback resolution", () => {
  it("constructs refs from keys without eagerly resolving lookup, tags, or placeholders", () => {
    const calls: Array<"key" | "lookup" | "tags" | "placeholder"> = [];
    const resource = flow.resource<[projectId: string], ProjectRecord>({
      id: "Project.byId",
      key: (projectId) => {
        calls.push("key");
        return createKey("project", projectId);
      },
      lookup: (projectId) => {
        calls.push("lookup");
        return Effect.succeed({
          id: projectId,
          name: "Atlas",
        });
      },
      tags: () => {
        calls.push("tags");
        return [createTag("project")];
      },
      placeholder: (projectId) => {
        calls.push("placeholder");
        return {
          id: projectId,
          name: "Loading project",
        };
      },
    });

    const ref = resource.ref("project-1");

    expect(Object.getOwnPropertyDescriptor(ref, "__runtime")).toBeUndefined();
    expect(ref).toEqual({
      kind: "resourceRef",
      id: "Project.byId",
      params: ["project-1"],
      key: createKey("project", "project-1"),
    });
    expect(calls).toEqual(["key"]);
  });

  it("freezes ref params so later caller mutation cannot change owner callbacks", async () => {
    const resource = flow.resource<[projectId: string], ProjectRecord>({
      id: "Project.byId",
      key: (projectId) => createKey("project", projectId),
      lookup: (projectId) =>
        Effect.succeed({
          id: projectId,
          name: `Project ${projectId}`,
        }),
    });
    const ref = resource.ref("project-1");
    const app = flow.app({
      modules: [
        flow.module("Project", {
          resources: {
            project: resource,
          },
        }),
      ],
    });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    try {
      try {
        (ref.params as unknown as Array<string>)[0] = "project-2";
      } catch (error) {
        expect(error instanceof TypeError).toBe(true);
      }

      expect(Object.isFrozen(ref.params)).toBe(true);
      expect(ref.params).toEqual(["project-1"]);
      await expect(
        runtime.runPromise(Effect.flatMap(ResourceStore, (store) => store.ensure(ref))),
      ).resolves.toEqual({
        id: "project-1",
        name: "Project project-1",
      });
    } finally {
      await runtime.dispose();
    }
  });

  it("creating a resource definition does not execute callbacks", () => {
    const calls: Array<"key" | "lookup" | "tags" | "placeholder"> = [];

    flow.resource<[projectId: string], ProjectRecord>({
      id: "Project.byId",
      key: (projectId) => {
        calls.push("key");
        return createKey("project", projectId);
      },
      lookup: (projectId) => {
        calls.push("lookup");
        return Effect.succeed({
          id: projectId,
          name: "Atlas",
        });
      },
      tags: () => {
        calls.push("tags");
        return [createTag("project")];
      },
      placeholder: (projectId) => {
        calls.push("placeholder");
        return {
          id: projectId,
          name: "Loading project",
        };
      },
    });

    expect(calls).toEqual([]);
  });

  it("compiling an app with resources does not execute callbacks", () => {
    const calls: Array<"key" | "lookup" | "tags" | "placeholder"> = [];
    const resource = flow.resource<[projectId: string], ProjectRecord>({
      id: "Project.byId",
      key: (projectId) => {
        calls.push("key");
        return createKey("project", projectId);
      },
      lookup: (projectId) => {
        calls.push("lookup");
        return Effect.succeed({
          id: projectId,
          name: "Atlas",
        });
      },
      tags: () => {
        calls.push("tags");
        return [createTag("project")];
      },
      placeholder: (projectId) => {
        calls.push("placeholder");
        return {
          id: projectId,
          name: "Loading project",
        };
      },
    });

    flow.app({
      modules: [
        flow.module("Project", {
          resources: {
            project: resource,
          },
        }),
      ],
    });

    expect(calls).toEqual([]);
  });

  it("runs lookup, tags, and placeholder callbacks from the store owner", async () => {
    const calls: Array<"key" | "lookup" | "tags" | "placeholder"> = [];
    const resource = flow.resource<[projectId: string], ProjectRecord>({
      id: "Project.byId",
      key: (projectId) => {
        calls.push("key");
        return createKey("project", projectId);
      },
      lookup: (projectId) => {
        calls.push("lookup");
        return Effect.succeed({
          id: projectId,
          name: "Atlas",
        });
      },
      tags: () => {
        calls.push("tags");
        return [createTag("project")];
      },
      placeholder: (projectId) => {
        calls.push("placeholder");
        return {
          id: projectId,
          name: "Loading project",
        };
      },
    });

    const ref = resource.ref("project-1");
    const app = flow.app({
      modules: [
        flow.module("Project", {
          resources: {
            project: resource,
          },
        }),
      ],
    });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    expect(calls).toEqual(["key"]);

    const snapshot = runtime.resources.get(ref);
    expect(calls).toContain("tags");
    expect(calls).toContain("placeholder");
    expect(calls).not.toContain("lookup");

    const ensured = await runtime.runPromise(
      Effect.flatMap(ResourceStore, (store) => store.ensure(ref)),
    );

    expect(snapshot).toMatchObject({
      value: {
        id: "project-1",
        name: "Loading project",
      },
      placeholder: {
        id: "project-1",
        name: "Loading project",
      },
    });
    expect(ensured).toEqual({
      id: "project-1",
      name: "Atlas",
    });
    expect(calls).toContain("lookup");

    await runtime.dispose();
  });

  it("preserves callback diagnostics while moving executable callbacks behind store ownership", async () => {
    const lookupCause = new Error("lookup exploded");
    const tagsCause = new Error("tags exploded");
    const placeholderCause = new Error("placeholder exploded");
    const keyCause = new Error("key exploded");

    const throwingLookup = flow.resource<[projectId: string], ProjectRecord>({
      id: "Project.byId",
      key: (projectId) => createKey("project", projectId),
      lookup: () => {
        throw lookupCause;
      },
    });
    const throwingTags = flow.resource<[projectId: string], ProjectRecord>({
      id: "Project.byId",
      key: (projectId) => createKey("project", projectId),
      lookup: (projectId) =>
        Effect.succeed({
          id: projectId,
          name: "Atlas",
        }),
      tags: () => {
        throw tagsCause;
      },
    });
    const throwingPlaceholder = flow.resource<[projectId: string], ProjectRecord>({
      id: "Project.byId",
      key: (projectId) => createKey("project", projectId),
      lookup: (projectId) =>
        Effect.succeed({
          id: projectId,
          name: "Atlas",
        }),
      placeholder: () => {
        throw placeholderCause;
      },
    });
    const throwingKey = flow.resource<[projectId: string], ProjectRecord>({
      id: "Project.byId",
      key: () => {
        throw keyCause;
      },
      lookup: (projectId) =>
        Effect.succeed({
          id: projectId,
          name: "Atlas",
        }),
    });

    const lookupRef = throwingLookup.ref("project-1");
    const tagsRef = throwingTags.ref("project-1");
    const placeholderRef = throwingPlaceholder.ref("project-1");

    const runtimeFor = (resource: typeof throwingLookup) =>
      flow.runtime(
        flow
          .app({
            modules: [
              flow.module("Project", {
                resources: {
                  project: resource,
                },
              }),
            ],
          })
          .layer({
            store: flow.store.test(),
            orchestrators: flow.orchestrators.test(),
          }),
      );

    const lookupRuntime = runtimeFor(throwingLookup);
    const tagsRuntime = runtimeFor(throwingTags);
    const placeholderRuntime = runtimeFor(throwingPlaceholder);

    const lookupExit = await lookupRuntime.runPromiseExit(
      Effect.flatMap(ResourceStore, (store) => store.ensure(lookupRef)),
    );
    const tagsExit = await tagsRuntime.runPromiseExit(
      Effect.flatMap(ResourceStore, (store) => store.get(tagsRef)),
    );
    const placeholderExit = await placeholderRuntime.runPromiseExit(
      Effect.flatMap(ResourceStore, (store) => store.get(placeholderRef)),
    );
    const keyError = expectResourceCallbackDiagnostic(() => throwingKey.ref("project-1"), "key");

    expect(lookupExit._tag).toBe("Failure");
    expect(tagsExit._tag).toBe("Failure");
    expect(placeholderExit._tag).toBe("Failure");
    if (
      lookupExit._tag !== "Failure" ||
      tagsExit._tag !== "Failure" ||
      placeholderExit._tag !== "Failure"
    ) {
      throw new Error("expected resource callbacks to fail");
    }

    expect((Cause.squash(lookupExit.cause) as FlowDiagnostic).cause).toBe(lookupCause);
    expect((Cause.squash(tagsExit.cause) as FlowDiagnostic).cause).toBe(tagsCause);
    expect((Cause.squash(placeholderExit.cause) as FlowDiagnostic).cause).toBe(placeholderCause);
    expect(keyError.cause).toBe(keyCause);

    await lookupRuntime.dispose();
    await tagsRuntime.dispose();
    await placeholderRuntime.dispose();
  });
});
