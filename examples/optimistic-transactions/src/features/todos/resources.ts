import { Effect } from "effect";

import { createKey, createTag } from "flow-state";
import * as flow from "flow-state";

import type { Todo } from "../../domain/todos";
import { TodoService } from "../../services/todo-service";

export const todoTag = createTag("todos:entity");

export const todoResource = flow.resource<
  [],
  Todo,
  never,
  Effect.Effect<Todo, never, TodoService>,
  "todos.entity"
>({
  id: "todos.entity",
  key: () => createKey("todos", "entity"),
  lookup: () => Effect.flatMap(TodoService, (service) => service.read),
  tags: () => [todoTag],
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});
