import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import { flow } from "./index.js";
import { resolveTransactionOutcomeEventWithDiagnostics } from "./core/transactions/transaction-outcome-callbacks.js";

type SaveEvent =
  | Readonly<{ readonly type: "SAVED"; readonly projectId: string }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>
  | Readonly<{ readonly type: "SAVE_DEFECT"; readonly cause: unknown }>
  | Readonly<{ readonly type: "SAVE_INTERRUPTED"; readonly reason?: unknown }>;

function expectTransactionOutcomeCallbackDiagnostic(
  thunk: () => unknown,
  callback: "routes.success" | "routes.failure" | "routes.defect" | "routes.interrupt",
): FlowDiagnostic & { readonly cause?: unknown } {
  try {
    thunk();
  } catch (error) {
    expect(error instanceof FlowDiagnostic).toBe(true);
    if (!(error instanceof FlowDiagnostic)) {
      throw error;
    }

    expect(error).toMatchObject({
      code: "FLOW-TXN-003",
      title: `Transaction outcome callback '${callback}' threw for 'Project.save'`,
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

  throw new Error("expected transaction outcome callback to throw a FlowDiagnostic");
}

describe("transaction outcome callback resolution", () => {
  it("resolves tuple and function routes by outcome lane", () => {
    const transaction = flow.transaction<
      { readonly id: string },
      string,
      "conflict",
      never,
      SaveEvent,
      "Project.save"
    >({
      id: "Project.save",
      commit: () => Effect.succeed("project-1"),
      routes: flow.outcomes<string, "conflict", SaveEvent>({
        success: ({ value }) => ({ type: "SAVED", projectId: value }),
        failure: ["SAVE_FAILED", "error"],
        defect: ["SAVE_DEFECT", "cause"],
        interrupt: ["SAVE_INTERRUPTED", "reason"],
      }),
    });

    expect(
      resolveTransactionOutcomeEventWithDiagnostics(transaction, "success", { value: "project-1" }),
    ).toEqual({
      type: "SAVED",
      projectId: "project-1",
    });
    expect(
      resolveTransactionOutcomeEventWithDiagnostics(transaction, "failure", {
        error: "conflict",
      }),
    ).toEqual({
      type: "SAVE_FAILED",
      error: "conflict",
    });
    expect(
      resolveTransactionOutcomeEventWithDiagnostics(transaction, "defect", {
        cause: "boom",
      }),
    ).toEqual({
      type: "SAVE_DEFECT",
      cause: "boom",
    });
    expect(resolveTransactionOutcomeEventWithDiagnostics(transaction, "interrupt", {})).toEqual({
      type: "SAVE_INTERRUPTED",
      reason: undefined,
    });
  });

  it("wraps synchronous transaction outcome callback throws in tagged diagnostics with preserved causes", () => {
    const successCause = new Error("routes.success exploded");
    const failureCause = new Error("routes.failure exploded");
    const defectCause = new Error("routes.defect exploded");
    const interruptCause = new Error("routes.interrupt exploded");

    const throwingRoutes = flow.transaction<
      { readonly id: string },
      string,
      "conflict",
      never,
      SaveEvent,
      "Project.save"
    >({
      id: "Project.save",
      commit: () => Effect.succeed("project-1"),
      routes: flow.outcomes<string, "conflict", SaveEvent>({
        success: () => {
          throw successCause;
        },
        failure: () => {
          throw failureCause;
        },
        defect: () => {
          throw defectCause;
        },
        interrupt: () => {
          throw interruptCause;
        },
      }),
    });

    const successError = expectTransactionOutcomeCallbackDiagnostic(
      () =>
        resolveTransactionOutcomeEventWithDiagnostics(throwingRoutes, "success", {
          value: "project-1",
        }),
      "routes.success",
    );
    const failureError = expectTransactionOutcomeCallbackDiagnostic(
      () =>
        resolveTransactionOutcomeEventWithDiagnostics(throwingRoutes, "failure", {
          error: "conflict",
        }),
      "routes.failure",
    );
    const defectError = expectTransactionOutcomeCallbackDiagnostic(
      () =>
        resolveTransactionOutcomeEventWithDiagnostics(throwingRoutes, "defect", {
          cause: "boom",
        }),
      "routes.defect",
    );
    const interruptError = expectTransactionOutcomeCallbackDiagnostic(
      () => resolveTransactionOutcomeEventWithDiagnostics(throwingRoutes, "interrupt", {}),
      "routes.interrupt",
    );

    expect(successError.cause).toBe(successCause);
    expect(failureError.cause).toBe(failureCause);
    expect(defectError.cause).toBe(defectCause);
    expect(interruptError.cause).toBe(interruptCause);
  });
});
