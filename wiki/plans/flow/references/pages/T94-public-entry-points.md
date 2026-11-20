---
page T94-public-entry-points
---
# Public entry points: what an app author notices (T94, 2026-11-19)

**Bottom line:** almost every wrong call into Flow now comes back as a `FlowError`, not a raw `TypeError`, and a
host hook that throws stops the Runtime instead of leaving it half-run. Closed with nine known gaps parked by the
user in @task.V3.T98.

## What you notice

| Case                                                                                | What happens                                                                              |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A Flow function called with a wrong value (`app(null)`, a throwing getter, a Proxy) | It refuses with a `FlowError`; an Effect-returning one (`ready`, `dispose`) fails with it |
| A bug inside Flow that a check missed                                               | It surfaces as a `FlowError` with code `Defect`, carrying the cause                       |
| `runtimeSetup(config)` with a bad config                                            | It refuses at the call with `InvalidConfiguration`, not later at `construct`              |
| The admit hook throws                                                               | The Runtime stops; the caller gets the throw, and `dispose` fails with it                 |
| A step's work throws while running                                                  | The Runtime stops quietly, as a step defect does; `dispose` fails with it                 |
| The Runtime's driver, inspector hook or a handle's link                             | No longer reachable from any public value                                                 |

No new refusal codes.

## Builders

These store their arguments and never throw; the definition or machine that uses them checks the values:
`Flow.initial`, `Flow.input`, `Flow.private`, `Flow.uncertain`, `deny`, `Outcome.success`, `Outcome.failure`,
`Outcome.unknown`, `Provider.select`, `E.X.from`, and an operation's `commit`, `lookup`, `retry`, `cancel`, `idle`
and `retryable`.

## Known gaps (parked in @task.V3.T98)

Shown by inverted Diagnostics R1 tests:

- a bound contract's `textOfKey(null)`, and `make` on an operation built by `commit` or `retryable`, still throw raw;
- the testing route is not covered: `defineConfig(null)` throws raw;
- a wrong value passed to a builder (`retryable(5)`) is accepted, and authoring mistakes found at construction come
  back as `Defect` rather than `WrongKind` at their path.
