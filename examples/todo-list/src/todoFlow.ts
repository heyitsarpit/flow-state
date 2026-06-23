import { flow } from "@flow-state/core";
import type { FlowEvent, FlowSnapshot, FlowTransitionArgs } from "@flow-state/core";

export type TodoFilter = "all" | "active" | "completed";
export type TodoState = "empty" | "list";

export interface TodoItem {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface TodoContext {
  readonly todos: readonly TodoItem[];
  readonly filter: TodoFilter;
  readonly nextId: number;
  readonly draft: string;
  readonly editingId: number | null;
  readonly editingTitle: string;
}

export type TodoEvent =
  | ({ readonly type: "DRAFT_CHANGED"; readonly title: string } & FlowEvent)
  | ({ readonly type: "ADD_TODO" } & FlowEvent)
  | ({ readonly type: "BEGIN_EDIT"; readonly id: number } & FlowEvent)
  | ({ readonly type: "EDIT_TITLE_CHANGED"; readonly title: string } & FlowEvent)
  | ({ readonly type: "SAVE_EDIT" } & FlowEvent)
  | ({ readonly type: "CANCEL_EDIT" } & FlowEvent)
  | ({ readonly type: "TOGGLE_TODO"; readonly id: number } & FlowEvent)
  | ({ readonly type: "SET_FILTER"; readonly filter: TodoFilter } & FlowEvent)
  | ({ readonly type: "CLEAR_COMPLETED" } & FlowEvent);

export type TodoSnapshot = FlowSnapshot<TodoContext, TodoState>;
type TodoTransitionArgs = FlowTransitionArgs<TodoContext, TodoEvent, TodoState>;

export const todoMachine = flow.machine<TodoContext, TodoEvent, TodoState>({
  id: "example-0-todo-list",
  initial: "empty",
  context: () => ({
    todos: [],
    filter: "all",
    nextId: 1,
    draft: "",
    editingId: null,
    editingTitle: "",
  }),
  states: {
    empty: {
      on: {
        DRAFT_CHANGED: {
          update: setDraft,
        },
        ADD_TODO: {
          target: "list",
          guard: hasDraftTitle,
          update: addTodoFromDraft,
        },
        SET_FILTER: {
          update: setFilter,
        },
      },
    },
    list: {
      on: {
        DRAFT_CHANGED: {
          update: setDraft,
        },
        ADD_TODO: {
          guard: hasDraftTitle,
          update: addTodoFromDraft,
        },
        BEGIN_EDIT: {
          update: beginEdit,
        },
        EDIT_TITLE_CHANGED: {
          update: setEditingTitle,
        },
        SAVE_EDIT: {
          guard: canSaveEdit,
          update: saveEdit,
        },
        CANCEL_EDIT: {
          update: cancelEdit,
        },
        TOGGLE_TODO: {
          update: toggleTodo,
        },
        SET_FILTER: {
          update: setFilter,
        },
        CLEAR_COMPLETED: [
          {
            target: "empty",
            guard: clearLeavesNoTodos,
            update: clearCompleted,
          },
          {
            target: "list",
            guard: clearLeavesSomeTodos,
            update: clearCompleted,
          },
        ],
      },
    },
  },
});

export interface TodoStats {
  readonly total: number;
  readonly active: number;
  readonly completed: number;
  readonly visible: number;
}

export function selectVisibleTodos(context: TodoContext): readonly TodoItem[] {
  if (context.filter === "active") {
    return context.todos.filter((todo) => !todo.completed);
  }

  if (context.filter === "completed") {
    return context.todos.filter((todo) => todo.completed);
  }

  return context.todos;
}

export function selectTodoStats(context: TodoContext): TodoStats {
  const completed = context.todos.filter((todo) => todo.completed).length;

  return {
    total: context.todos.length,
    active: context.todos.length - completed,
    completed,
    visible: selectVisibleTodos(context).length,
  };
}

export function emptyMessage(snapshot: TodoSnapshot): string {
  return flow.match(snapshot, {
    empty: () => "Capture the first task to start the list.",
    list: ({ context }) => {
      if (context.filter === "active") {
        return "No active tasks in this view.";
      }

      if (context.filter === "completed") {
        return "No completed tasks yet.";
      }

      return "Nothing matches this view.";
    },
    _: () => "Nothing here yet.",
  });
}

function hasDraftTitle({ context }: TodoTransitionArgs): boolean {
  return normalizeTitle(context.draft).length > 0;
}

function canSaveEdit({ context }: TodoTransitionArgs): boolean {
  return context.editingId !== null && normalizeTitle(context.editingTitle).length > 0;
}

function clearLeavesNoTodos({ context }: TodoTransitionArgs): boolean {
  return context.todos.every((todo) => todo.completed);
}

function clearLeavesSomeTodos({ context }: TodoTransitionArgs): boolean {
  return (
    context.todos.some((todo) => todo.completed) && context.todos.some((todo) => !todo.completed)
  );
}

function setDraft({ context, event }: TodoTransitionArgs): Partial<TodoContext> | TodoContext {
  if (event.type !== "DRAFT_CHANGED") {
    return context;
  }

  return { draft: event.title };
}

function addTodoFromDraft({ context }: TodoTransitionArgs): Partial<TodoContext> {
  const title = normalizeTitle(context.draft);
  const now = Date.now();

  return {
    todos: [
      ...context.todos,
      {
        id: context.nextId,
        title,
        completed: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    draft: "",
    nextId: context.nextId + 1,
  };
}

function beginEdit({ context, event }: TodoTransitionArgs): Partial<TodoContext> | TodoContext {
  if (event.type !== "BEGIN_EDIT") {
    return context;
  }

  const todo = context.todos.find((item) => item.id === event.id);
  if (todo === undefined) {
    return context;
  }

  return {
    editingId: todo.id,
    editingTitle: todo.title,
  };
}

function setEditingTitle({
  context,
  event,
}: TodoTransitionArgs): Partial<TodoContext> | TodoContext {
  if (event.type !== "EDIT_TITLE_CHANGED") {
    return context;
  }

  return { editingTitle: event.title };
}

function saveEdit({ context }: TodoTransitionArgs): Partial<TodoContext> {
  const title = normalizeTitle(context.editingTitle);
  const now = Date.now();

  return {
    todos: context.todos.map((todo) =>
      todo.id === context.editingId ? { ...todo, title, updatedAt: now } : todo,
    ),
    editingId: null,
    editingTitle: "",
  };
}

function cancelEdit(): Partial<TodoContext> {
  return {
    editingId: null,
    editingTitle: "",
  };
}

function toggleTodo({ context, event }: TodoTransitionArgs): Partial<TodoContext> | TodoContext {
  if (event.type !== "TOGGLE_TODO") {
    return context;
  }

  const now = Date.now();

  return {
    todos: context.todos.map((todo) =>
      todo.id === event.id ? { ...todo, completed: !todo.completed, updatedAt: now } : todo,
    ),
  };
}

function setFilter({ context, event }: TodoTransitionArgs): Partial<TodoContext> | TodoContext {
  if (event.type !== "SET_FILTER") {
    return context;
  }

  return { filter: event.filter };
}

function clearCompleted({ context }: TodoTransitionArgs): Partial<TodoContext> {
  return {
    todos: context.todos.filter((todo) => !todo.completed),
    editingId: null,
    editingTitle: "",
  };
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}
