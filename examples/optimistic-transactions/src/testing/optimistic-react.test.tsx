// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { FlowProvider } from "flow-state/react";

import { createOptimisticTestRuntime } from "../app/runtime";
import { todoEditorMachine } from "../features/todos/machine";
import { todoResource } from "../features/todos/resources";
import { TodoEditor } from "../ui/TodoEditor";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TodoEditor", () => {
  it("renders the resource and sends the explicit patch event through the actor", async () => {
    const runtime = createOptimisticTestRuntime();
    runtime.resources.seedResources([
      {
        ref: todoResource.ref(),
        value: { id: "todo-1", text: "Initial todo", draft: "", revision: 0 },
      },
    ]);
    const container = document.createElement("div");
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <FlowProvider runtime={runtime}>
            <TodoEditor />
          </FlowProvider>,
        );
      });
      expect(container.textContent).toContain("Initial todo");
      const edit = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Apply example draft",
      );
      await act(async () => edit?.click());
      expect(container.textContent).toContain("Write deterministic tests");
    } finally {
      await act(async () => root.unmount());
      await runtime.dispose();
    }
  });

  it("keeps feedback-state input text when the machine rejects submit", async () => {
    const runtime = createOptimisticTestRuntime();
    runtime.resources.seedResources([
      {
        ref: todoResource.ref(),
        value: { id: "todo-1", text: "Initial todo", draft: "", revision: 0 },
      },
    ]);
    const actor = runtime.orchestrators.start(todoEditorMachine, { id: "todos.editor" });
    actor.send({
      type: "ADD_SUCCEEDED",
      todo: { id: "todo-1", text: "Saved", draft: "", revision: 1 },
    });
    const container = document.createElement("div");
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <FlowProvider runtime={runtime}>
            <TodoEditor />
          </FlowProvider>,
        );
      });
      const input = container.querySelector<HTMLInputElement>('input[aria-label="Todo text"]')!;
      await act(async () => {
        input.value = "retain me";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(input.value).toBe("retain me");
      expect(
        container.querySelector<HTMLButtonElement>('button[type="submit"], form button')?.disabled,
      ).toBe(true);
      await act(async () => input.form?.requestSubmit());
      expect(input.value).toBe("retain me");
    } finally {
      await act(async () => root.unmount());
      await runtime.dispose();
    }
  });
});

