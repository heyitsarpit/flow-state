import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import { createKey } from "./index.js";
import * as flow from "./index.js";
import {
  resolveTransactionCommitEffect,
  resolveTransactionInvalidationTargets,
  resolveTransactionParams,
  resolveTransactionPreviewPatches,
} from "./core/transactions/transaction-callbacks.js";

type ProjectRecord = Readonly<{
  readonly id: string;
  readonly name: string;
}>;

type SaveEvent =
  | Readonly<{ readonly type: "SAVED"; readonly value: ProjectRecord }>
  | Readonly<{ readonly type: "FAILED"; readonly error: "conflict" }>;

function expectType<Type>(_value: Type): void {
  void _value;
}

function expectTransactionCallbackDiagnostic(
  thunk: () => unknown,
  callback: "params" | "preview.apply" | "invalidates" | "commit",
): FlowDiagnostic & { readonly cause?: unknown } {
  try {
    thunk();
  } catch (error) {
    expect(error instanceof FlowDiagnostic).toBe(true);
    if (!(error instanceof FlowDiagnostic)) {
      throw error;
    }

    expect(error).toMatchObject({
      code: "FLOW-TXN-002",
      title: `Transaction callback '${callback}' threw for 'Project.save'`,
      debug: {
        callback,
        cause: expect.objectContaining({
          message: `${callback} exploded`,
          name: "Error",
          stack: expect.any(String),
        }),
        transactionId: "Project.save",
      },
    });
    expect(
      (error.debug.cause as Readonly<{ readonly stack?: string }> | undefined)?.stack,
    ).toContain(`${callback} exploded`);

    return error as FlowDiagnostic & { readonly cause?: unknown };
  }

  throw new Error("expected transaction callback to throw a FlowDiagnostic");
}

describe("transaction callback resolution", () => {
  it("resolves params, preview patches, invalidations, and commit effects from one transaction definition", () => {
    const resource = flow.resource<[projectId: string], ProjectRecord>({
      id: "Project.byId",
      key: (projectId) => createKey("project", projectId),
      lookup: (projectId) =>
        Effect.succeed({
          id: projectId,
          name: "Atlas",
        }),
    });

    const transaction = flow.transaction<
      { readonly id: string; readonly name: string },
      ProjectRecord,
      "conflict",
      never,
      SaveEvent,
      "Project.save"
    >({
      id: "Project.save",
      params: (args) => ({
        id: String(args.projectId),
        name: String(args.name),
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: resource.ref(params.id),
            replace: {
              id: params.id,
              name: params.name,
            },
          },
        ],
      },
      invalidates: ({ params }) => [createKey("project", params.id)],
      commit: (params) =>
        Effect.succeed({
          id: params.id,
          name: params.name,
        }),
      routes: flow.outcomes<ProjectRecord, "conflict", SaveEvent>({
        success: ({ value }) => ({ type: "SAVED", value }),
        failure: ({ error }) => ({ type: "FAILED", error }),
      }),
    });

    const params = resolveTransactionParams(transaction, {
      projectId: "project-1",
      name: "Atlas v2",
    });

    expectType<{ readonly id: string; readonly name: string } | null | undefined>(params);
    expect(params).toEqual({
      id: "project-1",
      name: "Atlas v2",
    });

    if (params === undefined || params === null) {
      throw new Error("expected transaction params");
    }

    expect(resolveTransactionPreviewPatches(transaction, params)).toEqual([
      {
        ref: resource.ref("project-1"),
        replace: {
          id: "project-1",
          name: "Atlas v2",
        },
      },
    ]);
    expect(resolveTransactionInvalidationTargets(transaction, params)).toEqual([
      createKey("project", "project-1"),
    ]);
    expect(Effect.runSync(resolveTransactionCommitEffect(transaction, params))).toEqual({
      id: "project-1",
      name: "Atlas v2",
    });
  });

  it("falls back cleanly when optional callbacks are not configured", () => {
    const transaction = flow.transaction<void, "ok">({
      id: "Ping.commit",
      commit: () => Effect.succeed("ok" as const),
    });

    expect(resolveTransactionParams(transaction, {})).toBeUndefined();
    expect(resolveTransactionPreviewPatches(transaction, undefined)).toEqual([]);
    expect(resolveTransactionInvalidationTargets(transaction, undefined)).toEqual([]);
    expect(Effect.runSync(resolveTransactionCommitEffect(transaction, undefined))).toBe("ok");
  });

  it("rejects mismatched params at type-check time", () => {
    flow.transaction<
      { readonly id: string; readonly name: string },
      ProjectRecord,
      "conflict",
      never,
      SaveEvent,
      "Project.missing-selector"
      // @ts-expect-error non-void transaction params require a selector
    >({
      id: "Project.missing-selector",
      commit: (params) => Effect.succeed({ id: params.id, name: params.name }),
    });

    const transaction = flow.transaction<
      { readonly id: string; readonly name: string },
      ProjectRecord,
      "conflict",
      never,
      SaveEvent,
      "Project.save"
    >({
      id: "Project.save",
      params: () => ({ id: "project-1", name: "Atlas" }),
      commit: (params) =>
        Effect.succeed({
          id: params.id,
          name: params.name,
        }),
    });

    // @ts-expect-error preview resolution requires the transaction param shape
    resolveTransactionPreviewPatches(transaction, { projectId: "project-1", name: "Atlas v2" });
    // @ts-expect-error invalidation resolution requires the transaction param shape
    resolveTransactionInvalidationTargets(transaction, { slug: "project-1", name: "Atlas v2" });
    // @ts-expect-error commit resolution requires the transaction param shape
    resolveTransactionCommitEffect(transaction, { id: 123, name: "Atlas v2" });
  });

  it("wraps synchronous transaction callback throws in tagged diagnostics with preserved causes", () => {
    const paramsCause = new Error("params exploded");
    const previewCause = new Error("preview.apply exploded");
    const invalidatesCause = new Error("invalidates exploded");
    const commitCause = new Error("commit exploded");

    const throwingParams = flow.transaction<
      { readonly id: string },
      ProjectRecord,
      never,
      never,
      SaveEvent,
      "Project.save"
    >({
      id: "Project.save",
      params: () => {
        throw paramsCause;
      },
      commit: () => Effect.succeed({ id: "project-1", name: "Atlas" }),
    });
    const throwingPreview = flow.transaction<
      { readonly id: string },
      ProjectRecord,
      never,
      never,
      SaveEvent,
      "Project.save"
    >({
      id: "Project.save",
      params: () => ({ id: "project-1" }),
      preview: {
        apply: () => {
          throw previewCause;
        },
      },
      commit: () => Effect.succeed({ id: "project-1", name: "Atlas" }),
    });
    const throwingInvalidates = flow.transaction<
      { readonly id: string },
      ProjectRecord,
      never,
      never,
      SaveEvent,
      "Project.save"
    >({
      id: "Project.save",
      params: () => ({ id: "project-1" }),
      invalidates: () => {
        throw invalidatesCause;
      },
      commit: () => Effect.succeed({ id: "project-1", name: "Atlas" }),
    });
    const throwingCommit = flow.transaction<
      { readonly id: string },
      ProjectRecord,
      never,
      never,
      SaveEvent,
      "Project.save"
    >({
      id: "Project.save",
      params: () => ({ id: "project-1" }),
      commit: () => {
        throw commitCause;
      },
    });

    const paramsError = expectTransactionCallbackDiagnostic(
      () => resolveTransactionParams(throwingParams, { id: "project-1" }),
      "params",
    );
    const previewError = expectTransactionCallbackDiagnostic(
      () => resolveTransactionPreviewPatches(throwingPreview, { id: "project-1" }),
      "preview.apply",
    );
    const invalidatesError = expectTransactionCallbackDiagnostic(
      () => resolveTransactionInvalidationTargets(throwingInvalidates, { id: "project-1" }),
      "invalidates",
    );
    const commitError = expectTransactionCallbackDiagnostic(
      () => resolveTransactionCommitEffect(throwingCommit, { id: "project-1" }),
      "commit",
    );

    expect(paramsError.cause).toBe(paramsCause);
    expect(previewError.cause).toBe(previewCause);
    expect(invalidatesError.cause).toBe(invalidatesCause);
    expect(commitError.cause).toBe(commitCause);
  });
});
