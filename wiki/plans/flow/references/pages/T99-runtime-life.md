---
page T99-runtime-life
---
# Runtime life: what an app author notices (T99, 2026-11-19)

**Bottom line:** disposing a Runtime or an actor now always tells you when cleanup went wrong, never reports success
over a failure, and never hangs on work that can't be interrupted. Built on one design: every piece of background work
belongs to an owner, and closing the owners in order is disposal.

## New

```ts
const unsettled = runtime.unsettledWrites()            // NEW: writes still in flight or held, by actor
// warn "you have unsaved changes" before the tab closes

const result = await runtime.runPromise(effect, { signal })   // NEW: run an Effect in the Runtime's services
// refuses RuntimeNotReady before ready and RuntimeDisposed once disposing; a failing effect rejects as a FlowError
// RunFailed carrying the whole cause; the signal or disposal interrupts it
```

## What you notice at disposal

| Case                                                     | What happens                                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A cleanup fails (dies, or fails with an error Flow sees) | `dispose()` rejects `CleanupFailed` with the whole cause; every caller of `dispose()` gets the same answer           |
| A cleanup is still running when the bound runs out       | It counts as failed (`CleanupOverdue`, inside `CleanupFailed`); a failure that lands later goes to the host's report |
| An actor's cleanup failed                                | Its ref is quarantined: each later ensure reports that failure, until `disposeActor` of the ref                      |
| A failure nobody has heard yet                           | Never lost: it goes into `dispose()`'s `CleanupFailed`, or the host's report                                         |
| Queued events at `disposeActor`                          | Dropped; they never reach a new actor of the same name                                                               |
| Order                                                    | Work stops before services are released; consumers end before providers                                              |
| A saved write held when its operation was removed        | `forget` drops it with `HoldForgotten` evidence                                                                      |
| A write's record with no actor (unbound)                 | Listed by `unsettledWrites()` and reported `UnboundLane` at each boot                                                |

## One rule to know

Flow reports every cleanup failure that reaches the effect it runs. Inside your own error handling (`catch*`,
`mapError`, `tapError`, `retry`, `catchCause`) a cleanup that fails with a typed error follows Effect's rules and may
not reach Flow; a cleanup that dies is always reported. If a cleanup failure must be reported, let it die
(`Effect.orDie`) or keep it outside your error mapping.

## Known gaps

A dying cleanup inside a commit's own deadline race (`timeoutOrElse`) is still lost, and a failed close in a rare
host-hook case is not yet hardened; both are owned by @task.V3.T100.
