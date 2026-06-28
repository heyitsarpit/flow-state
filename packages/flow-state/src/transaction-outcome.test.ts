import { describe, expect, it } from "vite-plus/test";

import { flow } from "./index.js";
import { resolveTransactionOutcomeEvent } from "./transaction-outcome.js";

type SaveEvent =
  | Readonly<{ readonly type: "SAVED"; readonly projectId: string }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>
  | Readonly<{ readonly type: "SAVE_DEFECT"; readonly cause: unknown }>
  | Readonly<{ readonly type: "SAVE_INTERRUPTED"; readonly reason?: unknown }>;

describe("transaction outcome routing", () => {
  it("resolves tuple and function routes by lane", () => {
    const routes = flow.outcomes<string, "conflict", SaveEvent>({
      success: ({ value }) => ({ type: "SAVED", projectId: value }),
      failure: ["SAVE_FAILED", "error"],
      defect: ["SAVE_DEFECT", "cause"],
      interrupt: ["SAVE_INTERRUPTED", "reason"],
    });

    expect(resolveTransactionOutcomeEvent(routes, "success", { value: "project-1" })).toEqual({
      type: "SAVED",
      projectId: "project-1",
    });
    expect(
      resolveTransactionOutcomeEvent(routes, "failure", {
        error: "conflict",
      }),
    ).toEqual({
      type: "SAVE_FAILED",
      error: "conflict",
    });
    expect(
      resolveTransactionOutcomeEvent(routes, "defect", {
        cause: "boom",
      }),
    ).toEqual({
      type: "SAVE_DEFECT",
      cause: "boom",
    });
    expect(resolveTransactionOutcomeEvent(routes, "interrupt", {})).toEqual({
      type: "SAVE_INTERRUPTED",
      reason: undefined,
    });
  });

  it("rejects mismatched payloads for a selected outcome lane at type-check time", () => {
    const routes = flow.outcomes<string, "conflict", SaveEvent>({
      success: ({ value }) => ({ type: "SAVED", projectId: value }),
      failure: ["SAVE_FAILED", "error"],
      defect: ["SAVE_DEFECT", "cause"],
      interrupt: ["SAVE_INTERRUPTED", "reason"],
    });

    // @ts-expect-error failure routes require an error payload
    resolveTransactionOutcomeEvent(routes, "failure", { value: "project-1" });
    // @ts-expect-error success routes require a value payload
    resolveTransactionOutcomeEvent(routes, "success", { error: "conflict" });
    // @ts-expect-error defect routes require a cause payload
    resolveTransactionOutcomeEvent(routes, "defect", { reason: "stopped" });
    // @ts-expect-error interrupt routes do not accept success payloads
    resolveTransactionOutcomeEvent(routes, "interrupt", { value: "project-1" });
  });
});
