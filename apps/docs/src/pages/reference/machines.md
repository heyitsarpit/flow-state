# Machines

Machines model what the app is doing.

Use `machine(...)` for legal process state, guarded transitions, local updates,
state-owned work, and child workflow supervision.

## Authoring Shape

```ts
import { after, can, child, ensure, machine, observe, run, stream } from "flow-state";

const workspace = machine({
  id: "launch-workspace",
  initial: "ready",
  context: createInitialContext,
  states: {
    ready: {
      invoke: [
        ensure(projectResource.ref(fixtureProjectId)),
        observe(readinessResource.ref(fixtureProjectId)),
      ],
      on: {
        EDIT_PROJECT: { update: editLaunchProject },
        SAVE_PROJECT: { target: "saving", guard: canSaveProject },
        RUN_ASSISTANT: { target: "runningAssistant" },
      },
    },
    saving: {
      invoke: run(saveProjectTransaction),
      on: {
        PROJECT_SAVED: { target: "ready", update: applySavedProject },
        PROJECT_SAVE_FAILED: { target: "saveConflict", update: recordSaveFailure },
      },
    },
  },
});
```

## What Belongs In Context

Good machine context holds process-owned state:

- local drafts
- selected tabs
- pending choices
- save conflict info
- connection mode

Bad machine context holds canonical shared data:

- project records
- permissions
- approval payloads
- readiness data
- asset lists

Those belong in resources.

## Transition Parts

| Part      | Rule                                          |
| --------- | --------------------------------------------- |
| `guard`   | Pure predicate over current runtime facts.    |
| `update`  | Pure context reducer.                         |
| `actions` | Synchronous transition-side work or receipts. |
| `invoke`  | State-owned runtime work.                     |

Use `can(snapshot, event)` anywhere you need the same legal-event check the
runtime uses.

Transition definitions can also use `submit` for event-owned writes:

```ts
SAVE_PROJECT: {
  target: "saving",
  guard: canSaveProject,
  submit: saveProjectTransaction,
}
```

Use `submit` when the event should immediately launch the transaction. Use
`invoke: run(...)` when the entered state owns that work.

## State-Owned Work

| API          | Use for                                  |
| ------------ | ---------------------------------------- |
| `ensure`     | Resource prerequisite for a state.       |
| `observe`    | Active subscription to resource changes. |
| `refresh`    | Explicit resource refresh while active.  |
| `run`        | Transaction execution.                   |
| `patch`      | Resource patch command.                  |
| `invalidate` | Resource invalidation command.           |
| `stream`     | Ongoing state-scoped values.             |
| `after`      | One-shot delayed transitions.            |
| `child`      | Parent-owned child actors.               |

## Supported Machine Subset

The current machine semantics are intentionally narrower than general-purpose
statechart frameworks.

The proved surface includes:

- flat state transitions
- guards, updates, and actions
- bounded `always` microsteps
- child actors
- state-owned streams
- one-shot delayed transitions
- child-final success

Not currently part of the broad supported surface:

- parallel states
- history states
- root `onDone`
- initial eventless resolution
- raised-event cascades
- broad nested eventless graphs

Document your app against that real subset.

## Child Actors

Use `child(...)` when one workflow owns another workflow's lifecycle.

```ts
const assistantChild = child({
  id: "Assistant.task",
  machine: assistantTaskMachine,
  supervision: "stop-on-failure",
});
```

The current runtime proves child start, stop, failure, retry-only-failed-child,
and child-final success. Automatic restart policies are still future work.
