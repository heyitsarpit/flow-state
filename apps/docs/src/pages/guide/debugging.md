# Debugging

Flow State gives you more runtime facts than a plain component-state app. Use
them to inspect ownership and lifecycle, not to invent a second product state
model.

## First Places To Look

When something is wrong, inspect the smallest surface that can explain it:

| Symptom                      | First place to inspect                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Button disabled unexpectedly | `flow.can(snapshot, event)` and the resource snapshots the guard reads                    |
| Save looks stuck             | `transactions()`, `issues()`, and transaction receipts                                    |
| Data does not refresh        | Resource snapshot plus actor receipts for `ensure`, `observe`, `refresh`, or `invalidate` |
| Stream stopped or duplicated | `streams()`, `issues()`, and stream receipts                                              |
| Timer never fired            | `timers()`, `advance(...)`, `settle(...)`, and timer receipts                             |
| Child workflow failed        | `children()`, `issues()`, and child receipts                                              |
| Hydration mismatch           | boot payload version, `hydrateBoot(...)`, and restored actor snapshot                     |

## Inspection Helpers

Import inspection helpers from `@flow-state/inspect`.

```ts
import { analyzeTrace, captureTrace, graphOf } from "@flow-state/inspect";

const graph = graphOf(workspaceMachine);
const trace = captureTrace(actor.snapshot());
const analysis = analyzeTrace(workspaceMachine, trace);
```

Use them for graph descriptors, trace reports, and analysis artifacts. They are
inspection tools, not runtime control surfaces.

`analyzeTrace(...)` is receipt analysis paired with the machine graph, not
behavioral time travel.

## Runtime Inspection Stream

The runtime also exposes an inspection log subscription:

```ts
const unsubscribe = runtime.inspection.subscribe((event) => {
  console.log(event);
});
```

Use this for devtools, logging panels, or external debugging surfaces that
should follow runtime events live.

## Stuck Test Checklist

If a test does not make progress:

1. Check whether the work is ready now. If yes, `flush()`.
2. Check whether a timer boundary has not been crossed yet. If yes,
   `advance(duration)`.
3. Check whether you want bounded quiescence across multiple steps. If yes,
   `settle(bounds)`.
4. Check `pendingWork()` before assuming the runtime is deadlocked.

`flush()` is intentionally narrow. It does not advance time or wait forever for
future work.

## Warnings

- Do not parse receipts as command state. Route events and snapshots should own
  product behavior.
- Do not assume a missing receipt means nothing happened. Look at the current
  snapshot and issues too.
- Do not debug SSR problems by widening the server boundary in app code. Check
  whether the current supported boot/hydration contract actually covers the
  scenario first.
- Do not forget runtime disposal when you create runtimes manually outside
  `withRequestRuntime(...)`.
