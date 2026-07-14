import { Deferred, Effect, Layer, Option } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "flow-state";
import {
  formatTransactionEventsPretty,
  runFlowScenario,
  scenarioToReport,
  test,
} from "flow-state/testing";

import { OptimisticApp } from "../app/app";
import { optimisticStories } from "../app/behavior";
import { createOptimisticTestRuntime } from "../app/runtime";
import { AddTodoRejected } from "../domain/todos";
import type { Todo } from "../domain/todos";
import {
  cancellableTodoMachine,
  overlappingTodoMachine,
  todoEditorMachine,
} from "../features/todos/machine";
import { todoResource } from "../features/todos/resources";
import { TodoService } from "../services/todo-service";
import type { TodoServiceShape } from "../services/todo-service";

const initialTodo: Todo = {
  id: "todo-1",
  text: "Initial todo",
  draft: "",
  revision: 0,
};

function runtimeWith(service: TodoServiceShape) {
  const serviceLayer = Layer.succeed(TodoService, TodoService.of(service));
  return flow.runtime(
    OptimisticApp.layer<readonly [typeof serviceLayer]>({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [serviceLayer],
    }),
  );
}

function seed(runtime: flow.FlowRuntime): void {
  runtime.resources.seedResources([{ ref: todoResource.ref(), value: initialTodo }]);
}

describe("optimistic transactions", () => {
  it("publishes a preview before commit and replaces it with the committed item", async () => {
    const runtime = createOptimisticTestRuntime();
    seed(runtime);
    const actor = runtime.orchestrators.start(todoEditorMachine);

    actor.send({ type: "SUBMIT", text: "learn previews" });
    expect(runtime.resources.get(todoResource.ref())?.value).toMatchObject({
      text: "learn previews",
      revision: 1,
    });
    await actor.flush();
    expect(runtime.resources.get(todoResource.ref())?.value).toMatchObject({
      id: "todo-1",
      text: "LEARN PREVIEWS",
      revision: 1,
    });
    expect(formatTransactionEventsPretty(actor.receipts())).toContain("todos.add");

    await runtime.dispose();
  });

  it("rolls a typed failure back to the exact canonical value", async () => {
    const rejection = new AddTodoRejected({ requestId: "request-1", reason: "fixture rejected" });
    const runtime = runtimeWith({
      read: Effect.succeed(initialTodo),
      add: () => Effect.fail(rejection),
    });
    seed(runtime);
    const actor = runtime.orchestrators.start(todoEditorMachine);

    actor.send({ type: "SUBMIT", text: "will fail" });
    expect(runtime.resources.get(todoResource.ref())?.value?.text).toBe("will fail");
    await actor.flush();

    expect(actor.getSnapshot().value).toBe("failure");
    expect(Option.getOrUndefined(actor.getSnapshot().context.lastError)).toBe(rejection);
    expect(runtime.resources.get(todoResource.ref())?.value).toEqual(initialTodo);
    await runtime.dispose();
  });

  it("cancels state-owned commit work and ignores its late completion", async () => {
    const gate = Effect.runSync(Deferred.make<Todo, AddTodoRejected>());
    const started = Effect.runSync(Deferred.make<void>());
    const runtime = runtimeWith({
      read: Effect.succeed(initialTodo),
      add: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(gate))),
    });
    seed(runtime);
    const actor = runtime.orchestrators.start(cancellableTodoMachine);

    actor.send({ type: "START", text: "cancel me" });
    await Effect.runPromise(Deferred.await(started));
    expect(runtime.resources.get(todoResource.ref())?.value?.text).toBe("cancel me");

    actor.send({ type: "CANCEL" });
    await actor.flush();
    expect(actor.getSnapshot().value).toBe("idle");
    expect(runtime.resources.get(todoResource.ref())?.value).toEqual(initialTodo);
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "transaction:interrupt", id: "todos.add-cancellable" }),
      ]),
    );

    Effect.runSync(Deferred.succeed(gate, { ...initialTodo, text: "LATE", revision: 1 }));
    expect(runtime.resources.get(todoResource.ref())?.value).toEqual(initialTodo);
    await runtime.dispose();
  });

  it("removes only the failed optimistic layer while an earlier write remains visible", async () => {
    const first = Effect.runSync(Deferred.make<Todo, AddTodoRejected>());
    const second = Effect.runSync(Deferred.make<Todo, AddTodoRejected>());
    const firstStarted = Effect.runSync(Deferred.make<void>());
    const secondStarted = Effect.runSync(Deferred.make<void>());
    let calls = 0;
    let canonical = initialTodo;
    const runtime = runtimeWith({
      read: Effect.sync(() => canonical),
      add: () => {
        calls += 1;
        const started = calls === 1 ? firstStarted : secondStarted;
        const gate = calls === 1 ? first : second;
        return Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Deferred.await(gate)),
          Effect.tap((todo) => Effect.sync(() => void (canonical = todo))),
        );
      },
    });
    seed(runtime);
    const actor = runtime.orchestrators.start(overlappingTodoMachine);
    await actor.flush();

    actor.send({ type: "SUBMIT", text: "first" });
    await Effect.runPromise(Deferred.await(firstStarted));
    actor.send({ type: "SUBMIT", text: "second" });
    await Effect.runPromise(Deferred.await(secondStarted));
    expect(runtime.resources.get(todoResource.ref())?.value?.text).toBe("second");

    Effect.runSync(
      Deferred.fail(
        second,
        new AddTodoRejected({ requestId: "request-2", reason: "second rejected" }),
      ),
    );
    await actor.flush();
    await actor.flush();
    expect(runtime.resources.get(todoResource.ref())?.value?.text).toBe("first");
    expect(runtime.resources.get(todoResource.ref())?.value?.revision).toBe(1);

    Effect.runSync(Deferred.succeed(first, { ...initialTodo, text: "FIRST", revision: 1 }));
    await actor.flush();
    await actor.flush();
    expect(runtime.resources.get(todoResource.ref())?.value).toEqual(initialTodo);
    await runtime.dispose();
  });

  it("rehydrates feedback during its deadline and fires the dismissal once", async () => {
    const serviceLayer = Layer.succeed(
      TodoService,
      TodoService.of({ read: Effect.succeed(initialTodo), add: () => Effect.succeed(initialTodo) }),
    );
    const source = test.app(OptimisticApp).rehydrate(todoEditorMachine, {
      snapshot: todoEditorMachine.getInitialSnapshot(),
      resources: [{ ref: todoResource.ref(), value: initialTodo }],
      provide: serviceLayer,
    });
    source.send({ type: "ADD_SUCCEEDED", todo: { ...initialTodo, text: "DONE", revision: 1 } });
    await source.advance("750 millis");
    const snapshot = source.serialize();
    await source.dispose();

    const restored = test.app(OptimisticApp).rehydrate(todoEditorMachine, {
      id: "todos.editor.restored",
      snapshot,
      provide: serviceLayer,
    });
    try {
      // Rehydration preserves the serialized monotonic deadline, so align the
      // restored TestClock with the source clock before asserting 1,250 ms remain.
      await restored.advance("750 millis");
      await restored.advance("1249 millis");
      expect(restored.state()).toBe("success");
      await restored.advance("1 millis");
      expect(restored.state()).toBe("editing");
      expect(restored.receipts().filter((receipt) => receipt.type === "timer:fire")).toHaveLength(
        1,
      );
    } finally {
      await restored.dispose();
    }
  });

  it("turns the production draft story into an executable scenario report", async () => {
    const story = optimisticStories.stories[1];
    if (story === undefined) throw new Error("expected draft story");
    const outcome = await runFlowScenario(OptimisticApp, todoEditorMachine, story);
    const report = scenarioToReport(outcome);

    expect(report.ok).toBe(true);
    if (outcome.kind !== "story-run") throw new Error("expected executable draft story");
    expect(outcome.finalSnapshot.value).toBe("draft-example");
  });
});
