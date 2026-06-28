# Machines

Machines model what the app is doing. Use `flow.machine` for legal process states, events, guards, updates, and state-owned work.

## Quick Example

```ts
export const launchWorkspaceMachine = flow.machine({
  id: "launch-workspace",
  initial: "ready",
  context: createInitialContext,
  states: {
    ready: {
      invoke: [
        flow.ensure(projectResource.ref(fixtureProjectId)),
        flow.observe(readinessResource.ref(fixtureProjectId)),
      ],
      on: {
        NAVIGATE: { update: navigateLaunchWorkspace },
        SAVE_PROJECT: {
          target: "saving",
          guard: canSaveProject,
        },
        RUN_ASSISTANT: { target: "runningAssistant" },
      },
    },
    saving: {
      invoke: flow.run(saveLaunchProjectTransaction),
      on: {
        PROJECT_SAVED: { target: "ready", update: saveLaunchProject },
        PROJECT_SAVE_FAILED: { target: "saveConflict", update: recordLaunchSaveFailure },
      },
    },
    runningAssistant: {
      invoke: [assistantProgressStream, assistantChild],
      on: {
        ASSISTANT_STEP: { update: recordAssistantStep },
        ASSISTANT_DONE: "ready",
      },
    },
  },
});
```

## Machine Context

Good flow context holds process-owned data:

```ts
{
  activeTab: "editor",
  draft: projectDraft,
  connection: "offline",
  saveError: Option.none(),
  lastTraceEvent: Option.some("project:edit"),
}
```

Avoid putting canonical data in flow context:

```ts
{
  project,
  permissions,
  readiness,
  assets,
  approval,
}
```

Those values belong in resources. The flow can observe or ensure them; only add a view if the UI needs a reusable projection across several runtime sources.

## Guards, Updates, And Actions

| API        | Rule                                                           |
| ---------- | -------------------------------------------------------------- |
| `guard`    | Pure predicate over context, event, snapshot, and resources.   |
| `update`   | Pure reducer that returns context changes.                     |
| `actions`  | Synchronous transition-side receipts or local side work.       |
| `flow.can` | Legal command check using the same guard/transition semantics. |

Launch Workspace permission gates read permission and approval resources, then fail closed when either is missing.

TypeScript narrows `event` inside keyed `on.EVENT` transitions. When you need a compile-time legal-event set for a specific state, declare the config with `satisfies FlowMachineConfig<...>` and read `FlowEventForState<Event, typeof config.states, "state">`.

## Always Transitions

`always` is the current internal-microstep subset:

- it runs after a matched `send(event)` transition and after each matched `always` follow-up
- guards, updates, and actions receive the triggering event from the macrostep
- the loop stops when no `always` transition matches or after 100 internal steps
- snapshots and runtime traces record `machine:microstep` and `machine:microstep-limit` receipts for inspection

`type: "final"` is currently a child-actor completion marker. A child machine that reaches a final state records `child:success` and is removed from the parent snapshot.

Machine-level final completion remains intentionally narrower than XState:

- no root or nested `onDone` transitions
- no `type: "parallel"` or `type: "history"` state nodes
- no initial eventless resolution
- no raised-event cascades
- no nested or parallel eventless graphs

Those semantics stay deferred while the core remains flat, inspectable, and explicit.

## State-Owned Work

| API               | Use for                                            |
| ----------------- | -------------------------------------------------- |
| `flow.ensure`     | Required resource before a process can continue.   |
| `flow.observe`    | Latest resource while a state is active.           |
| `flow.refresh`    | User or process-triggered resource refresh.        |
| `flow.run`        | Transaction execution from a state.                |
| `flow.patch`      | ResourceStore patch command.                       |
| `flow.invalidate` | Resource invalidation command.                     |
| `flow.stream`     | State-scoped ongoing values.                       |
| `flow.after`      | One-shot delayed transitions.                      |
| `flow.child`      | Parent-owned child actor with lifecycle snapshots. |

`ensure` is a process dependency. `observe` is a data dependency.

## Child Actors

```ts
export const assistantChild = flow.child({
  id: "Assistant.task",
  machine: assistantTaskMachine,
  supervision: "stop-on-failure",
});
```

The executable actor slice records child start, stop, failure, retry, and parent issue facts. Automatic restart policies remain tracked on [Current Status](/reference/status).
