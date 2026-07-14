import { Option } from "effect";

import * as flow from "flow-state";

import type {
  CancellableTodoContext,
  TodoEditorContext,
  TodoEditorEvent,
  TodoEditorState,
} from "./machine-types";
import { todoResource, todoTag } from "./resources";
import {
  addTodoTransaction,
  cancellableAddTodoTransaction,
  overlappingAddTodoTransaction,
} from "./transaction";

const nextRequest = ({ context }: { readonly context: TodoEditorContext }) => ({
  nextRequest: context.nextRequest + 1,
});

export const todoEditorMachine = flow.machine<TodoEditorContext, TodoEditorEvent, TodoEditorState>({
  id: "todos.editor",
  initial: "editing",
  context: () => ({ nextRequest: 0, lastTodo: Option.none(), lastError: Option.none() }),
  states: {
    editing: {
      invoke: [flow.ensure(todoResource.ref())],
      on: {
        EDIT_EXAMPLE: "draft-example",
        REFRESH: "invalidating",
        SUBMIT: { submit: addTodoTransaction, update: nextRequest },
        ADD_SUCCEEDED: {
          target: "success",
          update: ({ event }) =>
            event.type === "ADD_SUCCEEDED"
              ? { lastTodo: Option.some(event.todo), lastError: Option.none() }
              : {},
        },
        ADD_FAILED: {
          target: "failure",
          update: ({ event }) =>
            event.type === "ADD_FAILED"
              ? { lastError: Option.some(event.error), lastTodo: Option.none() }
              : {},
        },
      },
    },
    "draft-example": {
      invoke: [flow.patch(todoResource.ref(), { draft: "Write deterministic tests" })],
      on: {
        SUBMIT: { submit: addTodoTransaction, update: nextRequest },
        ADD_SUCCEEDED: {
          target: "success",
          update: ({ event }) =>
            event.type === "ADD_SUCCEEDED"
              ? { lastTodo: Option.some(event.todo), lastError: Option.none() }
              : {},
        },
        ADD_FAILED: {
          target: "failure",
          update: ({ event }) =>
            event.type === "ADD_FAILED"
              ? { lastError: Option.some(event.error), lastTodo: Option.none() }
              : {},
        },
      },
    },
    invalidating: {
      invoke: [flow.invalidate(todoTag), flow.refresh(todoResource.ref())],
      after: flow.after({ id: "todos.refresh.return", delay: "1 millis", target: "editing" }),
    },
    success: {
      invoke: [flow.refresh(todoResource.ref())],
      after: flow.after({ id: "todos.feedback.dismiss", delay: "2 seconds", target: "editing" }),
      on: { DISMISS: "editing" },
    },
    failure: {
      invoke: [flow.refresh(todoResource.ref())],
      after: flow.after({ id: "todos.feedback.dismiss", delay: "2 seconds", target: "editing" }),
      on: { DISMISS: "editing" },
    },
  },
});

export const cancellableTodoMachine = flow.machine<
  CancellableTodoContext,
  TodoEditorEvent,
  "idle" | "submitting" | "done"
>({
  id: "todos.cancellable",
  initial: "idle",
  context: () => ({
    nextRequest: 1,
    pendingText: "",
    lastTodo: Option.none(),
    lastError: Option.none(),
  }),
  states: {
    idle: {
      on: {
        START: {
          target: "submitting",
          update: ({ event }) => (event.type === "START" ? { pendingText: event.text } : {}),
        },
      },
    },
    submitting: {
      invoke: [flow.run(cancellableAddTodoTransaction)],
      on: {
        CANCEL: "idle",
        ADD_SUCCEEDED: "done",
        ADD_FAILED: "idle",
      },
    },
    done: {},
  },
});

export const overlappingTodoMachine = flow.machine<TodoEditorContext, TodoEditorEvent, "ready">({
  id: "todos.overlapping",
  initial: "ready",
  context: () => ({ nextRequest: 0, lastTodo: Option.none(), lastError: Option.none() }),
  states: {
    ready: {
      invoke: [flow.ensure(todoResource.ref())],
      on: {
        SUBMIT: { submit: overlappingAddTodoTransaction, update: nextRequest },
      },
    },
  },
});
