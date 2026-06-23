import { describe, expect, it } from "vite-plus/test";

import { flow, flowTest } from "@flow-state/core";

import { emptyMessage, selectTodoStats, selectVisibleTodos, todoMachine } from "./todoFlow";

function createTodoHarness() {
  return flowTest(todoMachine);
}

type TodoHarness = ReturnType<typeof createTodoHarness>;

function addTodo(harness: TodoHarness, title: string): TodoHarness {
  return harness.send({ type: "DRAFT_CHANGED", title }).send({ type: "ADD_TODO" });
}

function completeTodo(harness: TodoHarness, id: number): TodoHarness {
  return harness.send({ type: "TOGGLE_TODO", id });
}

describe("Example 0 Todo List flow", () => {
  it("supports builder-style scenario tests against the whole app flow", () => {
    createTodoHarness()
      .start()
      .expectState("empty")
      .expectCan({ type: "ADD_TODO" }, false)
      .expectContext({
        todos: [],
        filter: "all",
        draft: "",
        editingId: null,
        editingTitle: "",
      })
      .send({ type: "DRAFT_CHANGED", title: "  Write builder spec  " })
      .expectContext({ draft: "  Write builder spec  " })
      .expectCan({ type: "ADD_TODO" })
      .send({ type: "ADD_TODO" })
      .flush()
      .expectState("list")
      .expectSnapshot(({ context, event }) => {
        expect(event).toEqual({ type: "ADD_TODO" });
        expect(context).toMatchObject({
          draft: "",
          nextId: 2,
        });
        expect(context.todos).toMatchObject([
          {
            id: 1,
            title: "Write builder spec",
            completed: false,
          },
        ]);
      })
      .send({ type: "TOGGLE_TODO", id: 1 })
      .expectContext(({ todos }) => {
        expect(todos[0]?.completed).toBe(true);
      });
  });

  it("starts with every visible UI field owned by machine context", () => {
    const harness = createTodoHarness();

    expect(harness.snapshot()).toMatchObject({
      value: "empty",
      context: {
        todos: [],
        filter: "all",
        nextId: 1,
        draft: "",
        editingId: null,
        editingTitle: "",
      },
      status: "active",
      changed: false,
      event: null,
    });
    expect(harness.snapshot().matches("empty")).toBe(true);
    expect(harness.can({ type: "ADD_TODO" })).toBe(false);
    expect(harness.can({ type: "SET_FILTER", filter: "completed" })).toBe(true);
    expect(selectTodoStats(harness.context())).toEqual({
      total: 0,
      active: 0,
      completed: 0,
      visible: 0,
    });
    expect(emptyMessage(harness.snapshot())).toBe("Capture the first task to start the list.");
  });

  it("adds a normalized todo, clears the draft, advances ids, and enters list state", () => {
    const harness = addTodo(createTodoHarness(), "  Draft   launch   notes  ");
    const firstTodo = harness.context().todos[0];

    expect(harness.state()).toBe("list");
    expect(harness.context()).toMatchObject({
      draft: "",
      nextId: 2,
    });
    expect(firstTodo).toMatchObject({
      id: 1,
      title: "Draft launch notes",
      completed: false,
    });
    expect(typeof firstTodo?.createdAt).toBe("number");
    expect(firstTodo?.updatedAt).toBe(firstTodo?.createdAt);

    addTodo(harness, "Second task");
    expect(harness.context().todos.map((todo) => [todo.id, todo.title])).toEqual([
      [1, "Draft launch notes"],
      [2, "Second task"],
    ]);
    expect(harness.context().nextId).toBe(3);
  });

  it("blocks empty adds without mutating the previous snapshot", () => {
    const harness = createTodoHarness().send({ type: "DRAFT_CHANGED", title: "   " });
    const before = harness.snapshot();

    expect(harness.can({ type: "ADD_TODO" })).toBe(false);
    harness.send({ type: "ADD_TODO" });

    expect(harness.snapshot()).toBe(before);
    expect(harness.context()).toMatchObject({
      todos: [],
      draft: "   ",
      nextId: 1,
    });
  });

  it("adds, edits, and toggles todos through only machine events", () => {
    const harness = addTodo(createTodoHarness(), "  Draft launch notes  ")
      .send({ type: "BEGIN_EDIT", id: 1 })
      .send({ type: "EDIT_TITLE_CHANGED", title: "Draft tidy launch notes" })
      .send({ type: "SAVE_EDIT" })
      .send({ type: "TOGGLE_TODO", id: 1 });

    expect(harness.state()).toBe("list");
    expect(harness.context()).toMatchObject({
      editingId: null,
      editingTitle: "",
    });
    expect(harness.context().todos).toMatchObject([
      {
        id: 1,
        title: "Draft tidy launch notes",
        completed: true,
      },
    ]);
  });

  it("loads edit fields from the selected todo and cancels without changing the item", () => {
    const harness = addTodo(createTodoHarness(), "Original title").send({
      type: "BEGIN_EDIT",
      id: 1,
    });

    expect(harness.context()).toMatchObject({
      editingId: 1,
      editingTitle: "Original title",
    });

    harness
      .send({ type: "EDIT_TITLE_CHANGED", title: "Temporary title" })
      .send({ type: "CANCEL_EDIT" });

    expect(harness.context()).toMatchObject({
      editingId: null,
      editingTitle: "",
    });
    expect(harness.context().todos[0]?.title).toBe("Original title");
  });

  it("ignores missing edit targets and blocks invalid edit saves", () => {
    const harness = addTodo(createTodoHarness(), "Keep the title").send({
      type: "BEGIN_EDIT",
      id: 99,
    });

    expect(harness.context()).toMatchObject({
      editingId: null,
      editingTitle: "",
    });
    expect(harness.can({ type: "SAVE_EDIT" })).toBe(false);

    harness.send({ type: "BEGIN_EDIT", id: 1 }).send({ type: "EDIT_TITLE_CHANGED", title: " " });
    const beforeSave = harness.snapshot();

    expect(harness.can({ type: "SAVE_EDIT" })).toBe(false);
    harness.send({ type: "SAVE_EDIT" });

    expect(harness.snapshot()).toBe(beforeSave);
    expect(harness.context().todos[0]?.title).toBe("Keep the title");
    expect(harness.context()).toMatchObject({
      editingId: 1,
      editingTitle: " ",
    });
  });

  it("normalizes saved edit titles and updates the edited todo timestamp", () => {
    const harness = addTodo(createTodoHarness(), "Old title");
    const createdAt = harness.context().todos[0]?.createdAt ?? 0;

    harness
      .send({ type: "BEGIN_EDIT", id: 1 })
      .send({ type: "EDIT_TITLE_CHANGED", title: "  Better    title  " })
      .send({ type: "SAVE_EDIT" });

    const todo = harness.context().todos[0];
    expect(todo).toMatchObject({
      id: 1,
      title: "Better title",
      completed: false,
    });
    expect(todo?.updatedAt).toBeGreaterThanOrEqual(createdAt);
    expect(harness.context()).toMatchObject({
      editingId: null,
      editingTitle: "",
    });
  });

  it("toggles completion both ways and leaves unknown ids unchanged", () => {
    const harness = addTodo(createTodoHarness(), "Toggle me");
    const initialTodo = harness.context().todos[0];

    completeTodo(harness, 1);
    expect(harness.context().todos[0]).toMatchObject({
      id: 1,
      title: "Toggle me",
      completed: true,
    });
    expect(harness.context().todos[0]?.updatedAt).toBeGreaterThanOrEqual(
      initialTodo?.updatedAt ?? 0,
    );

    completeTodo(harness, 1);
    expect(harness.context().todos[0]?.completed).toBe(false);

    const beforeMissingToggle = harness.context().todos;
    completeTodo(harness, 42);
    expect(harness.context().todos).toEqual(beforeMissingToggle);
  });

  it("filters all, active, and completed views with derived stats", () => {
    const harness = addTodo(createTodoHarness(), "Active task");
    addTodo(harness, "Completed task");
    completeTodo(harness, 2);

    expect(selectTodoStats(harness.context())).toEqual({
      total: 2,
      active: 1,
      completed: 1,
      visible: 2,
    });

    harness.send({ type: "SET_FILTER", filter: "active" });
    expect(selectVisibleTodos(harness.context()).map((todo) => todo.title)).toEqual([
      "Active task",
    ]);
    expect(selectTodoStats(harness.context()).visible).toBe(1);

    harness.send({ type: "SET_FILTER", filter: "completed" });
    expect(selectVisibleTodos(harness.context()).map((todo) => todo.title)).toEqual([
      "Completed task",
    ]);
    expect(selectTodoStats(harness.context()).visible).toBe(1);

    harness.send({ type: "SET_FILTER", filter: "all" });
    expect(selectVisibleTodos(harness.context()).map((todo) => todo.title)).toEqual([
      "Active task",
      "Completed task",
    ]);
  });

  it("keeps empty view messages tied to state and filter", () => {
    const emptyHarness = createTodoHarness();
    expect(emptyMessage(emptyHarness.snapshot())).toBe("Capture the first task to start the list.");

    const listHarness = addTodo(createTodoHarness(), "Only task");

    listHarness.send({ type: "SET_FILTER", filter: "completed" });
    expect(selectVisibleTodos(listHarness.context())).toEqual([]);
    expect(emptyMessage(listHarness.snapshot())).toBe("No completed tasks yet.");

    completeTodo(listHarness, 1);
    listHarness.send({ type: "SET_FILTER", filter: "active" });
    expect(selectVisibleTodos(listHarness.context())).toEqual([]);
    expect(emptyMessage(listHarness.snapshot())).toBe("No active tasks in this view.");

    listHarness.send({ type: "SET_FILTER", filter: "all" });
    expect(emptyMessage(listHarness.snapshot())).toBe("Nothing matches this view.");
  });

  it("reports enabled commands with can and clears completed todos only when possible", () => {
    const harness = addTodo(createTodoHarness(), "One");

    expect(harness.can({ type: "CLEAR_COMPLETED" })).toBe(false);
    expect(harness.snapshot().can({ type: "CLEAR_COMPLETED" })).toBe(false);
    expect(flow.can(harness.snapshot(), { type: "CLEAR_COMPLETED" })).toBe(false);

    const beforeClear = harness.snapshot();
    harness.send({ type: "CLEAR_COMPLETED" });
    expect(harness.snapshot()).toBe(beforeClear);

    completeTodo(harness, 1);
    expect(flow.can(harness.snapshot(), { type: "CLEAR_COMPLETED" })).toBe(true);

    harness.send({ type: "CLEAR_COMPLETED" });
    expect(harness.state()).toBe("empty");
    expect(harness.context().todos).toEqual([]);
  });

  it("clears only completed todos when active work remains", () => {
    const harness = addTodo(createTodoHarness(), "Keep me");
    addTodo(harness, "Clear me");
    completeTodo(harness, 2);

    harness
      .send({ type: "BEGIN_EDIT", id: 1 })
      .send({ type: "EDIT_TITLE_CHANGED", title: "Unsaved edit" });
    expect(harness.can({ type: "CLEAR_COMPLETED" })).toBe(true);

    harness.send({ type: "CLEAR_COMPLETED" });
    expect(harness.state()).toBe("list");
    expect(harness.context()).toMatchObject({
      editingId: null,
      editingTitle: "",
    });
    expect(harness.context().todos).toMatchObject([
      {
        id: 1,
        title: "Keep me",
        completed: false,
      },
    ]);
  });

  it("preserves filter while clearing all completed todos into the empty state", () => {
    const harness = addTodo(createTodoHarness(), "Clear me")
      .send({ type: "SET_FILTER", filter: "completed" })
      .send({ type: "TOGGLE_TODO", id: 1 })
      .send({ type: "CLEAR_COMPLETED" });

    expect(harness.state()).toBe("empty");
    expect(harness.context()).toMatchObject({
      todos: [],
      filter: "completed",
    });
    expect(emptyMessage(harness.snapshot())).toBe("Capture the first task to start the list.");
  });

  it("supports partial context overrides for focused scenario tests", () => {
    const harness = createTodoHarness().start({
      context: {
        filter: "completed",
        nextId: 4,
      },
    });

    const flushed = harness.flush();

    expect(flushed).toBe(harness);
    expect(harness.snapshot()).toMatchObject({
      value: "empty",
      context: {
        todos: [],
        filter: "completed",
        nextId: 4,
        draft: "",
        editingId: null,
        editingTitle: "",
      },
      status: "active",
      changed: false,
      event: null,
    });
  });

  it("tracks changed snapshots and the last accepted event", () => {
    const harness = createTodoHarness();
    const initialSnapshot = harness.snapshot();

    harness.send({ type: "ADD_TODO" });
    expect(harness.snapshot()).toBe(initialSnapshot);
    expect(harness.snapshot()).toMatchObject({
      changed: false,
      event: null,
    });

    harness.send({ type: "DRAFT_CHANGED", title: "Tracked task" });
    expect(harness.snapshot()).not.toBe(initialSnapshot);
    expect(harness.snapshot()).toMatchObject({
      changed: true,
      event: { type: "DRAFT_CHANGED", title: "Tracked task" },
    });
  });

  it("chains the test harness so specs read like user flows", () => {
    const harness = createTodoHarness();

    expect(addTodo(harness, "Chainable task")).toBe(harness);
    expect(harness.send({ type: "SET_FILTER", filter: "active" })).toBe(harness);
    expect(harness.flush()).toBe(harness);
    expect(selectVisibleTodos(harness.context()).map((todo) => todo.title)).toEqual([
      "Chainable task",
    ]);
  });
});
