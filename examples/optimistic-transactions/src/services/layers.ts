import { Effect, Layer } from "effect";

import type { Todo } from "../domain/todos";
import { TodoService } from "./todo-service";

export function createTodoServiceLayer() {
  let todo: Todo = { id: "todo-1", text: "Initial todo", draft: "", revision: 0 };
  return Layer.succeed(
    TodoService,
    TodoService.of({
      read: Effect.sync(() => todo),
      add: ({ requestId, text }) =>
        Effect.sync(() => {
          todo = {
            id: "todo-1",
            text: text.toUpperCase(),
            draft: "",
            revision: Number(requestId.replace("request-", "")),
          };
          return todo;
        }),
    }),
  );
}
