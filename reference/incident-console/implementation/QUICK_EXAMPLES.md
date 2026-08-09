# Quick target examples

Status: illustrative vNext recipes; not evidence that the live package implements them

These examples show how the vNext contracts solve familiar XState, TanStack Query, and Zustand
workflows without copying their APIs. The machine owns behavior and work authorization, a view
owns React selection, and Effect owns asynchronous execution and lifetime. The broader feature
delivery checklist is in [`USER_WORKFLOW_COVERAGE.md`](./USER_WORKFLOW_COVERAGE.md).

## Local state, actions, derived reads, and React

Zustand would commonly put data and action functions in one store. Flow keeps one typed event
boundary so every change is a machine turn and every component reads an authored projection.

```tsx
import * as flow from "flow-state";
import { useActor, useView } from "flow-state/react";

const Todos = flow.definition({
  id: "Todos/List",
  states: ["READY"],
  events: {
    DraftChanged: (draft: string) => ({ draft }),
    TodoAdded: null,
  },
  memory: () => ({ draft: "", addedCount: 0 }),
});

const todosMachine = flow.machine(Todos, ({ S }) => ({
  initial: S.READY,
  states: {
    READY: {
      on: {
        DraftChanged: {
          target: S.READY,
          updateMemory: ({ event }) => ({ draft: event.draft }),
        },
        TodoAdded: {
          target: S.READY,
          guard: ({ memory }) => memory.draft.trim().length > 0,
          updateMemory: ({ memory }) => ({ addedCount: memory.addedCount + 1 }),
        },
      },
    },
  },
}));

const todosView = flow.view(todosMachine, {
  id: "todos.list.view",
  select: (snapshot) => ({
    draft: snapshot.memory.draft,
    addedCount: snapshot.memory.addedCount,
    canAdd: flow.can(snapshot, Todos.E.TodoAdded()),
  }),
});

function TodoEditor() {
  const actor = useActor(todosMachine); // command lookup; it does not subscribe
  const model = useView(todosView); // the one reactive read

  return (
    <>
      <input
        value={model.draft}
        onChange={(event) => actor.send(Todos.E.DraftChanged(event.target.value))}
      />
      <button disabled={!model.canAdd} onClick={() => actor.send(Todos.E.TodoAdded())}>
        Add
      </button>
    </>
  );
}
```

The runtime is constructed once by the browser bootstrap and passed to `<FlowProvider
runtime={runtime}>`; neither the component nor either hook owns startup or disposal.

## Exact transition, redirect, timer, and activity causes

Callbacks do not share one vague context. Event transitions receive the narrowed event, redirects
never receive it, timers receive their own fact, and activity selectors can distinguish why
reconciliation ran:

```ts
const checkoutMachine = flow.machine(Checkout, ({ S, E, activity }) => ({
  initial: S.REVIEW,
  states: {
    REVIEW: {
      redirect: [
        { when: ({ memory }) => memory.items.length === 0, target: S.EMPTY },
        { target: S.READY }, // an absent when is the ordered fallback
      ],
    },
    READY: {
      on: {
        SubmitRequested: {
          target: S.READY,
          guard: ({ event, memory }) => event.confirmed && memory.items.length > 0,
          updateMemory: ({ event }) => ({ lastRequestId: event.requestId }),
        },
      },
      timers: {
        expire: {
          delay: "30 seconds", // fixed, converted once to safe integer milliseconds
          guard: ({ timer, memory }) => timer.dueAt >= memory.createdAt,
          target: S.EXPIRED,
        },
      },
      activities: [
        activity.ensure(cartResource.ref(), {
          outcomes: {
            success: (cart) => E.CartLoaded(cart),
            failure: (error) => E.CartFailed(error),
            defect: () => E.CartDefected(),
            interrupt: () => E.CartInterrupted(),
          },
        }),
      ],
    },
    EMPTY: { type: "final" },
    EXPIRED: { type: "final" },
  },
}));
```

Fresh actors stabilize redirects before their first snapshot. Hydration restores the persisted
stable state without rerunning them. A timer fires once even when its guard rejects the transition;
an unrelated same-state turn does not reschedule it.

## Imperative dialog or host-owned instances

React does not create Flow actors. An imperative dialog manager or another awaitable host may
acquire a dynamic actor, pass it to the component, and await disposal at that same boundary:

```tsx
const TodoApp = flow.app({
  id: "todos",
  persistenceVersion: "1",
  modules: [TodosModule],
  dynamicMachines: [todoEditorMachine],
});

async function withTodoEditor<A>(
  input: flow.InputOf<typeof todoEditorMachine>,
  use: (actor: flow.DynamicActor<typeof todoEditorMachine>) => Promise<A>,
) {
  const actor = todoRuntime.createActor(todoEditorMachine, { input });
  try {
    return await use(actor);
  } finally {
    await actor.dispose();
  }
}

function TodoEditorRoute({ actor }: { actor: flow.DynamicActor<typeof todoEditorMachine> }) {
  const model = useView(actor, todoEditorView);
  return <EditorForm model={model} onEvent={(event) => actor.send(event)} />;
}
```

This bracket must never run from React render. Most routers do not expose an awaitable render
lifetime, so Phase 8 must publish the proof-backed route acquisition/replacement recipe. A stable ID can
make a dynamic actor eligible for boot restoration, and lookup-only
`runtime.actor(todoEditorMachine, { id })` retrieves that exact durable instance without creating
or adopting one. `dynamicMachines` admits the actor family and its requirements without creating
an actor or making it a root. Runtime-sized managed child collections are excluded; use host-owned
dynamic actors when each member needs independent command and lifetime ownership.

## Cached remote data without a query hook

A resource descriptor owns global identity and cache policy. A machine activity decides when
that resource should exist, and a view reads its exact ref without starting work.

```ts
const todosTag = flow.tag("todos");

const todoList = flow.resource({
  id: "todos.list",
  lookup: () => TodoApi.list(),
  tags: () => [todosTag],
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  placeholder: () => [] as ReadonlyArray<Todo>,
});

const todosMachine = flow.machine(Todos, ({ S, activity }) => ({
  initial: S.READY,
  states: {
    READY: {
      activities: [activity.observe(todoList.ref())],
    },
  },
}));

const selectTodos = (snapshot: flow.ActorSnapshot<typeof todosMachine>) => {
  const list = snapshot.resources.get(todoList.ref());
  return {
    state: snapshot.value,
    list,
    todos: list.availability === "empty" ? [] : list.value,
  };
};

const todosView = flow.view(todosMachine, {
  id: "todos.list.view",
  select: selectTodos,
});
```

The component renders the discriminated resource snapshot instead of asking Flow for generic
machine-wide flags:

```tsx
const model = useView(todosView);

if (model.list.status === "loading") return <TodoSkeleton rows={model.todos} />;
if (model.list.status === "failure") return <ErrorPanel error={model.list.error} />;

return (
  <TodoTable
    rows={model.todos}
    refreshing={model.list.activity === "fetching"}
    stale={model.list.freshness !== "fresh"}
  />
);
```

`activity.observe` authorizes initial work and stale focus/reconnect refresh while its state is
active. `useView`, mounting another component, and reading the same ref do not change resource
lifetime. On activation the observer emits the current canonical value once when one exists,
then emits only changed canonical value revisions; invalidation, freshness, overlays, and an
`Object.is`-equal refresh do not manufacture another value event. Flow records each materialized
mapped event durably with that emission cursor before queueing it, so a boot captured between the
projection and event turn restores the event exactly once without rerunning the mapper.

When the affected refs come from current memory or the causal event, invalidation remains a
finite machine binding rather than an imperative cache call:

```ts
activity.invalidate({
  targets: ({ memory }) =>
    memory.selectedTodoId === null ? null : [todoDetail.ref(memory.selectedTodoId), todosTag],
});
```

Flow materializes and deduplicates that vector during planning, then invalidates all matched
bases in one store revision. It never retains a predicate that can enumerate the cache later.

## Dependent and fixed parallel reads

TanStack Query uses `enabled` for dependencies and adjacent hooks for fixed parallel queries.
Flow expresses both in the machine configuration: returning `null` means the binding is absent,
while several declared activities may run concurrently.

```ts
DETAIL: {
  activities: [
    activity.observe(project, {
      params: ({ memory }) =>
        memory.projectId === null ? null : [memory.projectId],
    }),
    activity.observe(projectMembers, {
      params: ({ memory }) =>
        memory.projectId === null ? null : [memory.projectId],
    }),
    activity.ensure(memberPermissions, {
      params: ({ memory }) =>
        memory.selectedMemberId === null ? null : [memory.selectedMemberId],
    }),
  ],
}
```

A runtime-sized set of simultaneously leased refs is excluded from vNext. Code should not fake it
with React loops or `gcTime: Infinity`; represent the set as one application aggregate or use
host-owned actors when members need independent lifetimes.

## Search, debounce, stale cancellation, and previous results

The machine owns debounce and request eligibility. Every committed term receives an exact ref,
so replacement rejects stale completion and the view can deliberately retain the prior ref
without making it canonical data for the new term.

```ts
const searchResults = flow.resource({
  id: "catalog.search",
  lookup: (term: string) => CatalogApi.search(term),
  staleTime: "30 seconds",
});

const Search = flow.definition({
  id: "Catalog/Search",
  states: ["IDLE", "DEBOUNCING", "RESULTS"],
  events: { TermChanged: (term: string) => ({ term }) },
  memory: () => ({ term: "", activeTerm: "", previousTerm: "" }),
});

const searchMachine = flow.machine(Search, ({ S, activity }) => ({
  initial: S.IDLE,
  states: {
    IDLE: {
      on: {
        TermChanged: {
          target: S.DEBOUNCING,
          updateMemory: ({ event }) => ({ term: event.term }),
        },
      },
    },
    DEBOUNCING: {
      redirect: {
        when: ({ memory }) => memory.term.trim() === "",
        target: S.IDLE,
      },
      on: {
        TermChanged: {
          target: S.DEBOUNCING,
          reenter: true,
          updateMemory: ({ event }) => ({ term: event.term }),
        },
      },
      timers: {
        commitSearch: {
          delay: "250 millis",
          target: S.RESULTS,
          updateMemory: ({ memory }) => ({
            previousTerm: memory.activeTerm,
            activeTerm: memory.term.trim(),
          }),
        },
      },
    },
    RESULTS: {
      activities: [
        activity.observe(searchResults, {
          params: ({ memory }) => [memory.activeTerm],
        }),
      ],
      on: {
        TermChanged: {
          target: S.DEBOUNCING,
          updateMemory: ({ event }) => ({ term: event.term }),
        },
      },
    },
  },
}));

const searchView = flow.view(searchMachine, {
  id: "catalog.search.view",
  select: (snapshot) => {
    if (snapshot.memory.term.trim() === "") {
      return { term: snapshot.memory.term, active: null, rows: [] };
    }

    const active =
      snapshot.memory.activeTerm === ""
        ? null
        : snapshot.resources.get(searchResults.ref(snapshot.memory.activeTerm));
    const previous =
      snapshot.memory.previousTerm === ""
        ? null
        : snapshot.resources.get(searchResults.ref(snapshot.memory.previousTerm));

    return {
      term: snapshot.memory.term,
      active,
      rows:
        active !== null && active.availability !== "empty"
          ? active.value
          : previous !== null && previous.availability !== "empty"
            ? previous.value
            : [],
    };
  },
});
```

There is no `enabled`, `keepPreviousData`, debounce hook, or imperative cancellation option. The
feature expresses those product choices once in its machine and view.

## Retry and streaming remain ordinary Effect composition

Operational retries belong inside the lookup Effect because they do not change application
behavior. A retry that the user can observe or trigger belongs in machine state and events.

```ts
import { Effect, Stream } from "effect";

const project = flow.resource({
  id: "projects.by-id",
  lookup: (projectId: string) => ProjectApi.get(projectId).pipe(Effect.retry({ times: 2 })),
});
```

A push subscription is continuing work, so it is modeled as a scoped stream rather than a hook
interval:

```ts
const projectUpdates = flow.stream({
  id: "projects.updates",
  subscribe: (projectId: string) =>
    ProjectApi.updates(projectId).pipe(
      Stream.buffer({ capacity: 64, strategy: "sliding" }),
    ),
});

WATCHING: {
  activities: [
    activity.stream(projectUpdates, {
      params: ({ memory }) => [memory.projectId],
      key: ([projectId]) => ({ projectId }),
      outcomes: {
        value: (project) => E.ProjectChanged(project),
        failure: (error) => E.ProjectWatchFailed(error),
      },
    }),
  ],
}
```

If this binding is captured while running, Flow persists its concrete canonical params and
starts one new scoped subscription after hydrated publication and readiness. It never serializes
or resumes the old fiber, cursor, buffer, or transport session.

Leaving `WATCHING`, replacing its key, or disposing the actor interrupts the stream Scope and
rejects late generations. A true poller uses the same activity boundary with a stream whose
service repeats a finite read under an Effect Schedule; a user-visible retry cadence instead
belongs in machine states and timers.

Buffering is authored inside the application Stream because it changes which domain values reach
the machine. Flow owns the subscription Scope and generation check; it does not add a second
`pressure` policy that could disagree with Effect Stream.

## Optimistic writes and authoritative refresh

A transaction owns one write policy and exact instance identity. Its optimistic preview is an
overlay; successful server completion removes that overlay and invalidates canonical data
rather than promoting speculative output to server truth.

```ts
type RenameTodo = Readonly<{
  todoId: string;
  title: string;
  optimistic: Todo;
}>;

const renameTodo = flow.transaction({
  id: "todos.rename",
  key: ({ todoId }: RenameTodo) => ({ todoId }),
  preview: {
    apply: ({ params }) => [
      {
        ref: todoDetail.ref(params.todoId),
        replace: params.optimistic,
      },
    ],
  },
  commit: ({ todoId, title }: RenameTodo) => TodoApi.rename(todoId, title),
  invalidates: ({ params }) => [todoDetail.ref(params.todoId), todosTag],
  concurrency: "serialize",
});

RENAMING: {
  activities: [
    activity.run(renameTodo, {
      params: ({ memory, event, resources }) => {
        const todoId = memory.selectedTodoId;
        if (todoId === null || event?.type !== E.RenameRequested.id) return null;

        const current = resources.get(todoDetail.ref(todoId));
        if (current.availability !== "value") return null;

        return {
          todoId,
          title: event.title,
          optimistic: { ...current.value, title: event.title },
        };
      },
      outcomes: {
        success: () => E.RenameSucceeded(),
        failure: (error) => E.RenameFailed(error),
      },
    }),
  ],
}
```

`activity.run` is an activation-owned supervisor with event-triggered attempts. Entering
`RENAMING` may admit once if the selector returns params, and every later
`RenameRequested` event in the retained state may admit another attempt; store fanout and other
`event: null` turns admit nothing. With `serialize`, those attempts keep their admission-time
preview order and the external commits start FIFO:

```ts
const twoRenames = story({ app: TodoApp, machine: todosMachine })
  .send(Todos.E.RenameRequested("First"))
  .flush()
  .send(Todos.E.RenameRequested("Second"))
  .flush()
  .perform(renameCall(0).succeed(firstServerTodo))
  .perform(renameCall(1).succeed(secondServerTodo))
  .checkpoint("both-settled");
```

Changing `concurrency` to `reject`, `cancel`, or `allow` changes admission of the second exact-ref
attempt; it does not require a state reentry or let a null-cause reconciliation duplicate work.

The view can read both facts without exposing transaction internals to React ownership:

```ts
const todoId = snapshot.memory.selectedTodoId;
const todo = todoId === null ? null : snapshot.resources.get(todoDetail.ref(todoId));
const rename = todoId === null ? null : snapshot.transactions.get(renameTodo.ref({ todoId }));

return { state: snapshot.value, todo, rename };
```

## Non-React observation and transient consumers

Zustand's vanilla/transient subscription workflow maps to the actor's Effect stream. Reuse the
same pure selector as the view, then let the host own the stream lifetime.

```ts
import { Effect, Stream } from "effect";

const actor = appRuntime.actor(todosMachine);

const updateTitle = actor.snapshots.pipe(
  Stream.map(selectTodos),
  Stream.map((model) => `${model.todos.length} todos`),
  Stream.changes,
  Stream.runForEach((title) =>
    Effect.sync(() => {
      document.title = title;
    }),
  ),
);

const observationExit = appRuntime.runPromiseExit(updateTitle);

// At the host's actual shutdown boundary:
await appRuntime.dispose();
handleObserverExit(await observationExit); // preserve normal completion or failure truth
```

This does not need another store, comparator hook, or transient React API.

## Server preload, hydration, and host persistence

Server prefetch enters through the same root event as application behavior, so the captured
boot payload represents machine and resource state from one runtime rather than a fabricated
cache snapshot.

```ts
import { Stream } from "effect";
import * as flow from "flow-state";
import { withRequestRuntime } from "flow-state/server";

const boot = await withRequestRuntime({ app: TodoApp, layer: TodoLive }, async (requestRuntime) => {
  // This root starts in IDLE; only successful preload reaches PREPARED.
  const actor = requestRuntime.actor(todoServerMachine);
  actor.send(TodoServer.E.PrefetchRequested());

  await requestRuntime.runPromise(
    actor.snapshots.pipe(
      Stream.filter((snapshot) => snapshot.value === TodoServer.S.PREPARED),
      Stream.take(1),
      Stream.runDrain,
    ),
  );

  return requestRuntime.dehydrate();
});

const html = await withRequestRuntime(
  { app: TodoApp, layer: TodoLive, boot, mode: "render" },
  async (renderRuntime) => renderServerApp(renderRuntime),
);

const browserRuntime = flow.runtime({ app: TodoApp, layer: TodoLive, boot });
```

The preload runtime is disposed before the mutation-free render runtime is constructed. The
server render and browser runtime start from the same boot, so `getServerSnapshot` stays fixed
without losing preload state.

Storage transport is host-owned. Persist one closed payload at an application lifecycle
boundary, validate same-version unknown domain data in application code, then supply the result
only while constructing the next runtime:

```ts
await storage.write(await browserRuntime.dehydrate());

const unknownBoot = await storage.read();
const validatedBoot = flow.decodeRuntimeBoot(TodoApp, unknownBoot, {
  decodeDomain(locator) {
    switch (locator.kind) {
      case "actorMemory":
        return decodeTodoMemory(locator.machineId, locator.value);
      case "resourceValue":
      case "resourceFailure":
        return decodeTodoResourceSlot(locator.descriptorId, locator.value);
      default:
        return locator.value;
    }
  },
});
const restoredRuntime = flow.runtime({
  app: TodoApp,
  layer: TodoLive,
  boot: validatedBoot,
});
```

The callback may validate or normalize opaque fields only inside the exact current app and
persistence version. A changed version, AppPlan fingerprint, or v1 envelope is rejected before the
callback; the host discards that boot and reconstructs current state through ordinary app behavior.
Production
retry narrows `FlowDehydrateError.kind`; only `ConcurrentDehydrate` is retryable. A periodic writer
still needs a proof-backed serialized stop, settle, final-capture, and disposal walkthrough before
it becomes the canonical Phase 8 recipe.

There is no mutable `rehydrate`, shallow state merge, or implicit resumption of an in-flight
transaction Effect.

## Deterministic behavior stories

XState model paths and ordinary store/query tests converge on one Flow story runner. The plan
is declarative and lazy; checkpoints capture immutable evidence, while Vitest owns assertions.

```ts
import { model, story } from "flow-state/testing";

const addTodo = story({
  app: TodoApp,
  machine: todosMachine,
  title: "adds a todo",
})
  .send(Todos.E.DraftChanged("Write contracts"))
  .checkpoint("drafted")
  .send(Todos.E.TodoAdded())
  .flush()
  .checkpoint("submitted")
  .settle()
  .checkpoint("settled");

const result = await addTodo.run();

expect(result.checkpoints.drafted.snapshot.memory.draft).toBe("Write contracts");
expect(result.checkpoints.submitted.snapshot.memory.addedCount).toBe(1);
expect(result.final.snapshot.value).toBe(Todos.S.READY);
```

Progress stays explicit when finite work is parked. A Flow-owned future deadline lets `settle`
return at the current instant, while a controlled dependency remains unresolved until `perform`:

```ts
const waiting = story({ app: TodoApp, machine: todosMachine })
  .send(Todos.E.RefreshRequested())
  .flush()
  .settle()
  .checkpoint("waiting-for-deadline")
  .advanceToNextTimer()
  .checkpoint("deadline-applied");
```

Pure model discovery compares a deliberately authored canonical state key, never a complete live
primitive snapshot:

```ts
const todoModel = model(story({ app: TodoApp, machine: todosMachine }), {
  stateKey: ({ value, memory }) => [value.id, memory.selectedTodoId],
});

const paths = todoModel.getShortestPaths({
  events: [Todos.E.TodoAdded(), Todos.E.ResetRequested()],
  maxDepth: 8,
  limit: 32,
});

for (const path of paths.paths) await path.story.run();
if (paths.truncated) throw new Error(`model stopped after ${paths.explored} states`);
```

Resource and transaction outcomes use fixture controls at their real service boundary; the
story never assigns operation status or snapshots directly.

## Where the quick recipes stop

The recipes intentionally omit hierarchy, parallel regions, history, runtime-sized keyed activity
collections, selective resource persistence, authoritative transaction/stream cache writes,
parent-to-managed-child commands, runtime AppPlan extension, and a built-in live inspector. Those
are settled vNext exclusions rather than unfinished APIs. Final-state semantics, advisory offline
behavior, live durable dynamic-actor lookup, and typed dehydration failures are contracted but remain
unshipped until their owning phase proofs pass. The required recipe work is owned explicitly by
Phase 8 and is not an open semantic decision.
