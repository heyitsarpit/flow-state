import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import { flow, selectView } from "./index.js";

function expectViewCallbackDiagnostic(
  thunk: () => unknown,
): FlowDiagnostic & { readonly cause?: unknown } {
  try {
    thunk();
  } catch (error) {
    expect(error instanceof FlowDiagnostic).toBe(true);
    if (!(error instanceof FlowDiagnostic)) {
      throw error;
    }

    expect(error).toMatchObject({
      code: "FLOW-VIEW-001",
      title: "View callback 'select' threw for 'Views.project'",
      debug: {
        callback: "select",
        cause: expect.objectContaining({
          message: "select exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        viewId: "Views.project",
      },
    });
    expect(
      (error.debug.cause as Readonly<{ readonly stack?: string }> | undefined)?.stack,
    ).toContain("select exploded");

    return error as FlowDiagnostic & { readonly cause?: unknown };
  }

  throw new Error("expected view callback to throw a FlowDiagnostic");
}

describe("view callback resolution", () => {
  it("resolves a view selection from the snapshot and issue surfaces", () => {
    const machine = flow.machine<
      { readonly selectedId: string | null },
      { readonly type: "NOOP" },
      "active"
    >({
      id: "views.machine",
      initial: "active",
      context: () => ({ selectedId: "project-1" }),
      states: {
        active: {},
      },
    });
    const view = flow.view<
      { readonly selectedId: string | null },
      "active",
      { readonly selectedId: string | null; readonly issueCount: number },
      "Views.project"
    >({
      id: "Views.project",
      sources: ["context", "issues"],
      select: ({ context, issues }) => ({
        selectedId: context.selectedId,
        issueCount: issues.length,
      }),
    });

    expect(
      selectView(machine.getInitialSnapshot(), view, {
        issues: [{ kind: "failure", source: "resource", id: "Project.byId", error: "offline" }],
      }),
    ).toEqual({
      selectedId: "project-1",
      issueCount: 1,
    });
  });

  it("wraps synchronous view select throws in tagged diagnostics with preserved causes", () => {
    const selectCause = new Error("select exploded");
    const machine = flow.machine<
      { readonly selectedId: string | null },
      { readonly type: "NOOP" },
      "active"
    >({
      id: "views.machine",
      initial: "active",
      context: () => ({ selectedId: "project-1" }),
      states: {
        active: {},
      },
    });
    const throwingView = flow.view<
      { readonly selectedId: string | null },
      "active",
      { readonly selectedId: string | null },
      "Views.project"
    >({
      id: "Views.project",
      sources: ["context"],
      select: () => {
        throw selectCause;
      },
    });

    const error = expectViewCallbackDiagnostic(() =>
      selectView(machine.getInitialSnapshot(), throwingView),
    );

    expect(error.cause).toBe(selectCause);
  });
});
