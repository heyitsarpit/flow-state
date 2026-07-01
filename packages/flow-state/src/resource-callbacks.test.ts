import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import { createKey, createTag, flow } from "./index.js";

type ProjectRecord = Readonly<{
  readonly id: string;
  readonly name: string;
}>;

type RuntimeResourceDetails<Value> = Readonly<{
  readonly lookup: unknown;
  readonly tags: ReadonlyArray<unknown>;
  readonly placeholder?: Value;
}>;

function runtimeDetailsOf<Value>(ref: object): RuntimeResourceDetails<Value> {
  const runtime = Object.getOwnPropertyDescriptor(ref, "__runtime")?.value as
    | RuntimeResourceDetails<Value>
    | undefined;

  expect(runtime).toBeDefined();
  if (runtime === undefined) {
    throw new Error("expected resource ref runtime details");
  }

  return runtime;
}

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
  it("resolves lookup, tags, placeholder, and key details from one resource definition", () => {
    const resource = flow.resource<[projectId: string], ProjectRecord>({
      id: "Project.byId",
      key: (projectId) => createKey("project", projectId),
      lookup: (projectId) =>
        Effect.succeed({
          id: projectId,
          name: "Atlas",
        }),
      tags: () => [createTag("project")],
      placeholder: (projectId) => ({
        id: projectId,
        name: "Loading project",
      }),
    });

    const ref = resource.ref("project-1");
    const runtime = runtimeDetailsOf<ProjectRecord>(ref);

    expect(ref).toEqual({
      kind: "resourceRef",
      id: "Project.byId",
      params: ["project-1"],
      key: createKey("project", "project-1"),
    });
    expect(Effect.runSync(runtime.lookup as Effect.Effect<ProjectRecord>)).toEqual({
      id: "project-1",
      name: "Atlas",
    });
    expect(runtime.tags).toEqual([createTag("project")]);
    expect(runtime.placeholder).toEqual({
      id: "project-1",
      name: "Loading project",
    });
  });

  it("wraps synchronous resource ref callback throws in tagged diagnostics with preserved causes", () => {
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

    const lookupError = expectResourceCallbackDiagnostic(
      () => throwingLookup.ref("project-1"),
      "lookup",
    );
    const tagsError = expectResourceCallbackDiagnostic(() => throwingTags.ref("project-1"), "tags");
    const placeholderError = expectResourceCallbackDiagnostic(
      () => throwingPlaceholder.ref("project-1"),
      "placeholder",
    );
    const keyError = expectResourceCallbackDiagnostic(() => throwingKey.ref("project-1"), "key");

    expect(lookupError.cause).toBe(lookupCause);
    expect(tagsError.cause).toBe(tagsCause);
    expect(placeholderError.cause).toBe(placeholderCause);
    expect(keyError.cause).toBe(keyCause);
  });
});
