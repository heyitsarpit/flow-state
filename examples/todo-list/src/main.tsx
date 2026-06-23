import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { FlowProvider, createRuntime, flow, useFlow, useSelector } from "@flow-state/core";
import type { FlowActorRef } from "@flow-state/core";

import "./styles.css";
import { emptyMessage, selectTodoStats, selectVisibleTodos, todoMachine } from "./todoFlow";
import type {
  TodoContext,
  TodoEvent,
  TodoFilter,
  TodoItem,
  TodoSnapshot,
  TodoState,
} from "./todoFlow";

const runtime = createRuntime();
const filters: readonly TodoFilter[] = ["all", "active", "completed"];

function App(): React.ReactElement {
  const actor = useFlow(todoMachine);
  const snapshot = useSelector(actor, (current) => current);
  const stats = useSelector(actor, (current) => selectTodoStats(current.context), sameStats);
  const visibleTodos = useSelector(
    actor,
    (current) => selectVisibleTodos(current.context),
    sameTodoList,
  );

  const canAdd = flow.can(actor, { type: "ADD_TODO" });
  const canClearCompleted = flow.can(actor, { type: "CLEAR_COMPLETED" });
  const progress = stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100);

  function addTodo(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canAdd) {
      return;
    }

    actor.send({ type: "ADD_TODO" });
  }

  return (
    <main className="shell">
      <section className="workspace" aria-labelledby="todo-heading">
        <header className="topline">
          <div>
            <p className="eyebrow">Example 0</p>
            <h1 id="todo-heading">Todo List</h1>
          </div>
          <div className="progressBlock" aria-label={`${progress}% complete`}>
            <span>{progress}%</span>
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        </header>

        <form className="composer" onSubmit={addTodo}>
          <label className="srOnly" htmlFor="new-todo">
            New todo
          </label>
          <input
            id="new-todo"
            value={snapshot.context.draft}
            onChange={(event) =>
              actor.send({ type: "DRAFT_CHANGED", title: event.currentTarget.value })
            }
            placeholder="Add a task..."
            autoComplete="off"
          />
          <button type="submit" disabled={!canAdd}>
            Add
          </button>
        </form>

        <div className="toolbar" aria-label="Todo filters">
          <div className="segments">
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                className={snapshot.context.filter === filter ? "active" : undefined}
                aria-pressed={snapshot.context.filter === filter}
                onClick={() => actor.send({ type: "SET_FILTER", filter })}
              >
                {filter}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="clearButton"
            disabled={!canClearCompleted}
            onClick={() => actor.send({ type: "CLEAR_COMPLETED" })}
          >
            Clear completed
          </button>
        </div>

        <div className="stats" aria-label="Todo summary">
          <span>{stats.total} total</span>
          <span>{stats.active} active</span>
          <span>{stats.completed} done</span>
        </div>

        {renderTodoSurface({
          actor,
          snapshot,
          visibleTodos,
        })}
      </section>
    </main>
  );
}

interface TodoSurfaceProps {
  readonly actor: FlowActorRef<TodoContext, TodoEvent, TodoState>;
  readonly snapshot: TodoSnapshot;
  readonly visibleTodos: readonly TodoItem[];
}

function renderTodoSurface(props: TodoSurfaceProps): React.ReactElement {
  return flow.match(props.snapshot, {
    empty: (snapshot) => <EmptyState message={emptyMessage(snapshot)} />,
    list: (snapshot) =>
      props.visibleTodos.length === 0 ? (
        <EmptyState message={emptyMessage(snapshot)} />
      ) : (
        <TodoList {...props} />
      ),
    _: (snapshot) => <EmptyState message={emptyMessage(snapshot)} />,
  });
}

function TodoList(props: TodoSurfaceProps): React.ReactElement {
  return (
    <ol className="todoList">
      {props.visibleTodos.map((todo) => {
        const isEditing = props.snapshot.context.editingId === todo.id;

        return (
          <li key={todo.id} className={todo.completed ? "todoItem done" : "todoItem"}>
            <button
              type="button"
              className="check"
              aria-label={todo.completed ? "Mark active" : "Mark complete"}
              aria-pressed={todo.completed}
              onClick={() => props.actor.send({ type: "TOGGLE_TODO", id: todo.id })}
            />

            {isEditing ? (
              <input
                className="editInput"
                value={props.snapshot.context.editingTitle}
                autoFocus
                onChange={(event) =>
                  props.actor.send({
                    type: "EDIT_TITLE_CHANGED",
                    title: event.currentTarget.value,
                  })
                }
                onBlur={() => props.actor.send({ type: "SAVE_EDIT" })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    props.actor.send({ type: "SAVE_EDIT" });
                  }

                  if (event.key === "Escape") {
                    props.actor.send({ type: "CANCEL_EDIT" });
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="titleButton"
                onClick={() => props.actor.send({ type: "BEGIN_EDIT", id: todo.id })}
              >
                {todo.title}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function EmptyState(props: { readonly message: string }): React.ReactElement {
  return (
    <div className="emptyState">
      <div className="emptyRule" aria-hidden="true" />
      <p>{props.message}</p>
    </div>
  );
}

function sameStats(
  left: ReturnType<typeof selectTodoStats>,
  right: ReturnType<typeof selectTodoStats>,
): boolean {
  return (
    left.total === right.total &&
    left.active === right.active &&
    left.completed === right.completed &&
    left.visible === right.visible
  );
}

function sameTodoList(left: readonly TodoItem[], right: readonly TodoItem[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((todo, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      todo.id === other.id &&
      todo.title === other.title &&
      todo.completed === other.completed
    );
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FlowProvider runtime={runtime}>
      <App />
    </FlowProvider>
  </StrictMode>,
);
