import { Context, Effect } from "effect";

import type { AddTodoParams, AddTodoRejected, Todo } from "../domain/todos";

export interface TodoServiceShape {
  readonly read: Effect.Effect<Todo>;
  readonly add: (params: AddTodoParams) => Effect.Effect<Todo, AddTodoRejected>;
}

export class TodoService extends Context.Service<TodoService, TodoServiceShape>()(
  "optimistic-transactions/TodoService",
) {}
