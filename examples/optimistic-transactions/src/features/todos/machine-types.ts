import type { Option } from "effect";

import type { AddTodoRejected, Todo } from "../../domain/todos";

export interface TodoEditorContext {
  readonly nextRequest: number;
  readonly lastTodo: Option.Option<Todo>;
  readonly lastError: Option.Option<AddTodoRejected>;
}

export interface CancellableTodoContext extends TodoEditorContext {
  readonly pendingText: string;
}

export type TodoEditorEvent =
  | { readonly type: "EDIT_EXAMPLE" }
  | { readonly type: "SUBMIT"; readonly text: string }
  | { readonly type: "START"; readonly text: string }
  | { readonly type: "CANCEL" }
  | { readonly type: "REFRESH" }
  | { readonly type: "ADD_SUCCEEDED"; readonly todo: Todo }
  | { readonly type: "ADD_FAILED"; readonly error: AddTodoRejected }
  | { readonly type: "DISMISS" };

export type TodoEditorState = "editing" | "draft-example" | "invalidating" | "success" | "failure";
