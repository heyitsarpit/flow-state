import * as flow from "flow-state";

import type { TodoEditorContext, TodoEditorState } from "./machine-types";

export const todoEditorView = flow.view<
  TodoEditorContext,
  TodoEditorState,
  { readonly feedback: "idle" | "success" | "failure"; readonly pending: boolean }
>({
  id: "todos.editor.view",
  sources: ["transactions"],
  select: ({ value, transactions }) => ({
    feedback: value === "success" ? "success" : value === "failure" ? "failure" : "idle",
    pending: transactions[addTodoTransactionId]?.status === "pending",
  }),
});

const addTodoTransactionId = "todos.add";
