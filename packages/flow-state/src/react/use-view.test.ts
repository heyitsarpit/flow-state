// @vitest-environment happy-dom

import { act, createElement } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "../diagnostics.js";
import { createRuntime } from "../runtime/contract-runtime.js";
import type { FlowActor, FlowIssue, FlowSnapshot } from "../public/types.js";
import { flow } from "./flow.js";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function createContainer(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("flow.useView", () => {
  it("throws a tagged diagnostic in React when the view projection throws", async () => {
    const selectCause = new Error("select exploded");
    const machine = flow.machine<
      { readonly selectedId: string },
      { readonly type: "SELECT"; readonly selectedId: string },
      "ready"
    >({
      id: "react.useView.throwing",
      initial: "ready",
      context: () => ({ selectedId: "project-1" }),
      states: {
        ready: {
          on: {
            SELECT: {
              update: ({ event }) =>
                event.type === "SELECT" ? { selectedId: event.selectedId } : {},
            },
          },
        },
      },
    });
    const view = flow.view<
      { readonly selectedId: string },
      "ready",
      { readonly selectedId: string }
    >({
      id: "react.useView.throwingProjection",
      sources: ["context"],
      select: () => {
        throw selectCause;
      },
    });
    const actor = createRuntime().createActor(machine);
    const container = createContainer();
    const root = createRoot(container);

    const Reader = (): ReactElement => {
      const selection = flow.useView(actor, view);
      return createElement("span", null, selection.selectedId);
    };

    let failure: unknown;
    try {
      await act(async () => {
        root.render(createElement(Reader));
      });
    } catch (error) {
      failure = error;
    } finally {
      await act(async () => {
        root.unmount();
      });
      document.body.innerHTML = "";
      await actor.dispose();
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-VIEW-001",
      title: "View callback 'select' threw for 'react.useView.throwingProjection'",
      debug: {
        callback: "select",
        cause: expect.objectContaining({
          message: "select exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        viewId: "react.useView.throwingProjection",
      },
    });
    expect(
      (failure as { debug?: { cause?: { stack?: string } } }).debug?.cause?.stack ?? "",
    ).toContain("select exploded");
    expect((failure as { cause?: unknown }).cause).toBe(selectCause);
  });

  it("projects the live actor snapshot in React", async () => {
    const machine = flow.machine<
      { readonly selectedId: string },
      { readonly type: "SELECT"; readonly selectedId: string },
      "ready"
    >({
      id: "react.useView.live",
      initial: "ready",
      context: () => ({ selectedId: "project-1" }),
      states: {
        ready: {
          on: {
            SELECT: {
              update: ({ event }) =>
                event.type === "SELECT" ? { selectedId: event.selectedId } : {},
            },
          },
        },
      },
    });
    const view = flow.view<
      { readonly selectedId: string },
      "ready",
      { readonly selectedId: string }
    >({
      id: "react.useView.project",
      sources: ["context"],
      select: ({ context }) => ({
        selectedId: context.selectedId,
      }),
    });
    const actor = createRuntime().createActor(machine);
    const container = createContainer();
    const root = createRoot(container);

    const Reader = (): ReactElement => {
      const selection = flow.useView(actor, view);
      return createElement("span", null, selection.selectedId);
    };

    try {
      await act(async () => {
        root.render(createElement(Reader));
      });

      expect(container.textContent).toBe("project-1");

      await act(async () => {
        actor.send({ type: "SELECT", selectedId: "project-2" });
        await actor.flush();
      });

      expect(container.textContent).toBe("project-2");
    } finally {
      await act(async () => {
        root.unmount();
      });
      document.body.innerHTML = "";
      await actor.dispose();
    }
  });

  it("supports selector equality to suppress rerenders when the selected view stays stable", async () => {
    const machine = flow.machine<
      { readonly selectedId: string; readonly ignored: number },
      { readonly type: "SELECT"; readonly selectedId: string } | { readonly type: "TICK" },
      "ready"
    >({
      id: "react.useView.equal",
      initial: "ready",
      context: () => ({ selectedId: "project-1", ignored: 0 }),
      states: {
        ready: {
          on: {
            SELECT: {
              update: ({ event }) =>
                event.type === "SELECT" ? { selectedId: event.selectedId } : {},
            },
            TICK: {
              update: ({ context }) => ({
                ignored: context.ignored + 1,
              }),
            },
          },
        },
      },
    });
    const view = flow.view<
      { readonly selectedId: string; readonly ignored: number },
      "ready",
      { readonly selectedId: string }
    >({
      id: "react.useView.equalProjection",
      sources: ["context"],
      select: ({ context }) => ({
        selectedId: context.selectedId,
      }),
    });
    const actor = createRuntime().createActor(machine);
    const container = createContainer();
    const root = createRoot(container);
    let renders = 0;

    const Reader = (): ReactElement => {
      renders += 1;
      const selection = flow.useView(
        actor,
        view,
        (left, right) => left.selectedId === right.selectedId,
      );
      return createElement("span", null, selection.selectedId);
    };

    try {
      await act(async () => {
        root.render(createElement(Reader));
      });

      expect(renders).toBe(1);

      await act(async () => {
        actor.send({ type: "TICK" });
        await actor.flush();
      });

      expect(container.textContent).toBe("project-1");
      expect(renders).toBe(1);

      await act(async () => {
        actor.send({ type: "SELECT", selectedId: "project-2" });
        await actor.flush();
      });

      expect(container.textContent).toBe("project-2");
      expect(renders).toBe(2);
    } finally {
      await act(async () => {
        root.unmount();
      });
      document.body.innerHTML = "";
      await actor.dispose();
    }
  });

  it("updates when actor issues change without replacing the snapshot object", async () => {
    const machine = flow.machine<{ readonly selectedId: string }, never, "ready">({
      id: "react.useView.issues",
      initial: "ready",
      context: () => ({ selectedId: "project-1" }),
      states: {
        ready: {},
      },
    });
    const view = flow.view<
      { readonly selectedId: string },
      "ready",
      {
        readonly selectedId: string;
        readonly issueCount: number;
        readonly latestIssueId: string | null;
      }
    >({
      id: "react.useView.issueProjection",
      sources: ["context", "issues"],
      select: ({ context, issues }) => ({
        selectedId: context.selectedId,
        issueCount: issues.length,
        latestIssueId: issues.at(-1)?.id ?? null,
      }),
    });

    let issues: ReadonlyArray<FlowIssue> = [];
    const listeners = new Set<() => void>();
    const snapshot = Object.freeze(machine.getInitialSnapshot()) as FlowSnapshot<
      { readonly selectedId: string },
      "ready"
    >;

    const actor: FlowActor<{ readonly selectedId: string }, never, "ready"> = {
      id: "react.useView.issue-actor",
      machine,
      send: () => actor,
      snapshot: () => snapshot,
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      flush: async () => undefined,
      children: () => snapshot.children,
      receipts: () => snapshot.receipts,
      issues: () => issues,
      serialize: () => ({
        value: snapshot.value,
        context: snapshot.context,
        resources: snapshot.resources,
        transactions: snapshot.transactions,
        streams: snapshot.streams,
        timers: snapshot.timers,
        children: snapshot.children,
        receipts: snapshot.receipts,
      }),
      retryChild: () => false,
      retryTransaction: () => false,
      resetTransaction: () => false,
      dispose: async () => undefined,
    };

    const container = createContainer();
    const root = createRoot(container);

    const Reader = (): ReactElement => {
      const selection = flow.useView(actor, view);
      return createElement(
        "span",
        null,
        `${selection.selectedId}:${selection.issueCount}:${selection.latestIssueId ?? "none"}`,
      );
    };

    try {
      await act(async () => {
        root.render(createElement(Reader));
      });

      expect(container.textContent).toBe("project-1:0:none");

      issues = [
        {
          kind: "failure",
          source: "resource",
          id: "Project.byId",
          error: "offline",
        },
      ];

      await act(async () => {
        for (const listener of Array.from(listeners)) {
          listener();
        }
      });

      expect(container.textContent).toBe("project-1:1:Project.byId");
    } finally {
      await act(async () => {
        root.unmount();
      });
      document.body.innerHTML = "";
    }
  });
});
