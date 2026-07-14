import * as flow from "flow-state";

import { cancellableTodoMachine, overlappingTodoMachine, todoEditorMachine } from "./machine";
import { todoResource } from "./resources";
import {
  addTodoTransaction,
  cancellableAddTodoTransaction,
  overlappingAddTodoTransaction,
} from "./transaction";
import { todoEditorView } from "./view";

export const TodosModule = flow.module("Todos", {
  resources: { entity: todoResource },
  transactions: {
    add: addTodoTransaction,
    cancellable: cancellableAddTodoTransaction,
    overlapping: overlappingAddTodoTransaction,
  },
  machines: {
    editor: todoEditorMachine,
    cancellable: cancellableTodoMachine,
    overlapping: overlappingTodoMachine,
  },
  views: { editor: todoEditorView },
});
