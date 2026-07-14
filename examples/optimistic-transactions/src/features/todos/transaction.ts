import { Effect } from "effect";

import * as flow from "flow-state";

import type { AddTodoParams, AddTodoRejected, Todo } from "../../domain/todos";
import { TodoService } from "../../services/todo-service";
import type { CancellableTodoContext, TodoEditorContext, TodoEditorEvent } from "./machine-types";
import { todoResource, todoTag } from "./resources";

const previewTodo = {
  apply: ({ params }: { readonly params: AddTodoParams }) => [
    {
      ref: todoResource.ref(),
      replace: {
        id: "todo-1",
        text: params.text,
        draft: "",
        revision: Number(params.requestId.replace("request-", "")),
      },
    },
  ],
};

const commitTodo = (params: AddTodoParams) =>
  Effect.flatMap(TodoService, (service) => service.add(params));

export const addTodoTransaction = flow.transaction<
  AddTodoParams,
  Todo,
  AddTodoRejected,
  TodoService,
  TodoEditorEvent
>({
  id: "todos.add",
  params: ({
    context,
    event,
  }: {
    readonly context: TodoEditorContext;
    readonly event: TodoEditorEvent;
  }) =>
    event.type === "SUBMIT" || event.type === "START"
      ? { requestId: `request-${context.nextRequest}`, text: event.text }
      : null,
  preview: previewTodo,
  commit: commitTodo,
  invalidates: [todoTag],
  routes: flow.outcomes<Todo, AddTodoRejected, TodoEditorEvent>({
    success: ({ value }) => ({ type: "ADD_SUCCEEDED", todo: value }),
    failure: ["ADD_FAILED", "error"],
  }),
  concurrency: "allow",
});

export const cancellableAddTodoTransaction = flow.transaction<
  AddTodoParams,
  Todo,
  AddTodoRejected,
  TodoService,
  TodoEditorEvent
>({
  id: "todos.add-cancellable",
  params: ({ context }: { readonly context: CancellableTodoContext }) => ({
    requestId: `request-${context.nextRequest}`,
    text: context.pendingText,
  }),
  preview: previewTodo,
  commit: commitTodo,
  invalidates: [todoTag],
  routes: flow.outcomes<Todo, AddTodoRejected, TodoEditorEvent>({
    success: ({ value }) => ({ type: "ADD_SUCCEEDED", todo: value }),
    failure: ["ADD_FAILED", "error"],
  }),
  concurrency: "allow",
});

export const overlappingAddTodoTransaction = flow.transaction<
  AddTodoParams,
  Todo,
  AddTodoRejected,
  TodoService,
  TodoEditorEvent
>({
  id: "todos.add-overlap",
  params: ({
    context,
    event,
  }: {
    readonly context: TodoEditorContext;
    readonly event: TodoEditorEvent;
  }) =>
    event.type === "SUBMIT"
      ? { requestId: `request-${context.nextRequest}`, text: event.text }
      : null,
  preview: previewTodo,
  commit: commitTodo,
  invalidates: [todoTag],
  concurrency: "allow",
});
