# Test API

Status: implementation guide.

This page lists the test API shape without TypeScript interface declarations. The test API should start small: harness, fake runtime, controlled Effects, controlled Streams, deterministic clock, cache probes, and trace receipts.

The goal is not to build a custom assertion framework. Vitest or another test runner should own assertions. Flow State should expose inspectable state, deterministic runtime controls, and lifecycle receipts.

Testing surfaces may be stubbed before their full runtime support exists. A stub should still define the intended input, output, receipt shape, and missing runtime dependency.

## Core Test Exports

| Function                 | Input                                   | Output                   | Key properties                              | Why we need it                               |
| ------------------------ | --------------------------------------- | ------------------------ | ------------------------------------------- | -------------------------------------------- |
| `flowTest`               | machine                                 | test builder             | provide, seed, start, restore               | Main machine test entry.                     |
| `testFlow`               | machine                                 | test builder             | alias candidate                             | Possible clearer name. Open decision.        |
| `createTestRuntime`      | layer, cache seed, clock, trace options | test runtime             | fake clock, services, effects, cache        | Deterministic runtime for tests.             |
| `createTestLayer`        | Effect service tag and implementation   | fake Layer               | typed service mock                          | Mocks must satisfy production service shape. |
| `createControlledEffect` | optional name                           | controlled Effect handle | succeed, fail, die, delay, cancel, attempts | Tests in-flight work without random waiting. |
| `createControlledStream` | optional name                           | controlled Stream handle | emit, fail, end, expect active/cancelled    | Tests subscriptions and cleanup.             |
| `runScenario`            | machine, scenario, options              | scenario report          | steps, trace, snapshots                     | Compact example/test flow runner.            |

Open decision: primary spelling is `flowTest(machine)`, `testFlow(machine)`, or `flow.test(machine)`.

## Builder Properties

| Property    | Input                               | Output/meaning             | Why we need it                      |
| ----------- | ----------------------------------- | -------------------------- | ----------------------------------- |
| `provide`   | Effect Layer                        | builder with service layer | Typed fake services.                |
| `seedQuery` | cache key, value, freshness options | seeded cache               | Cache hit/stale tests.              |
| `seedCache` | cache snapshot                      | seeded cache state         | Restore complex cache setup.        |
| `fromState` | state and context                   | starts from chosen state   | Test weird product states directly. |
| `restore`   | actor snapshot                      | restored actor             | Snapshot/replay foundation.         |
| `trace`     | trace options                       | trace-enabled builder      | Runtime receipts.                   |
| `start`     | input/options                       | harness                    | Starts machine under test.          |

## Harness Functions

| Function   | Input           | Output                                | Key properties                           | Why we need it                        |
| ---------- | --------------- | ------------------------------------- | ---------------------------------------- | ------------------------------------- |
| `state`    | none            | current state                         | state/path                               | Simple assertion target.              |
| `context`  | none            | current context                       | typed context                            | Inspect workflow data.                |
| `snapshot` | none            | current snapshot                      | state, context, resources, mutations     | Main assertion object.                |
| `send`     | event           | updated harness                       | queued event, trace receipt              | Drive the machine.                    |
| `flush`    | none            | promise of updated harness            | drains currently ready microtasks only   | Avoid arbitrary waits.                |
| `settle`   | required bounds | updated harness or diagnostic failure | quiescence attempt                       | Stronger than flush; must be bounded. |
| `advance`  | duration        | updated harness                       | TestClock time movement                  | Test delays/retry/stale/gc.           |
| `stop`     | none            | cleanup                               | actor and scopes closed                  | Leak prevention.                      |
| `cache`    | none            | cache inspector                       | query/mutation/cache probes              | Test cache behavior.                  |
| `effects`  | none            | effect inspector                      | running/completed/cancelled/attempts     | Test Effect lifecycle.                |
| `services` | none            | service call inspector                | calls and inputs                         | Test service usage.                   |
| `trace`    | none            | trace                                 | event/effect/cache/stream receipts       | Debuggability.                        |
| `receipts` | none            | lifecycle receipts                    | actors, effects, cache writes, snapshots | Fine-grained runtime proof.           |

Assertion rule:

- `flowTest` drives and exposes state. Test libraries own assertions, diffs, reporters, snapshots, and matchers.
- Examples should use `expect(harness.state())`, `expect(harness.context())`, `expect(harness.snapshot())`, and `expect(harness.can(event))`.

## Flush And Settle

| Function | Meaning                                                                                                  | Must not do                                           | Failure diagnostics                                        |
| -------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| `flush`  | Drain currently ready machine/effect/cache continuations without waiting for active work to finish.      | Wait for timers forever or consume unbounded streams. | Pending timers, running streams, running Effects.          |
| `settle` | Try to reach quiescence across queued work, retries, timers, and background work within explicit bounds. | Hide infinite loops or polling.                       | Max steps hit, active fibers, pending queues, last events. |

`settle` must require bounds such as max events, max effects, max virtual time, or max transitions.

Implementation lesson from Project Editor: `flush()` became useful only after it stopped waiting for still-running controlled Effects. The next example must preserve that distinction. When Streaming Upload Manager adds streams and timers, `flush()` should process ready emissions and completions; bounded `settle(...)` should be the only helper that attempts quiescence and reports active fibers, timers, or streams.

The test harness should expose facts, not assertions. Prefer:

```ts
expect(harness.effects().running("upload.stream")).toMatchObject({ status: "running" });
expect(harness.receipts()).toContainEqual({ type: "stream:cancel", id: "upload.stream" });
```

Do not add Flow State-owned assertion helpers such as `expectRunningStream(...)`.

## Controlled Effect

| Function/property | Input       | Output/meaning                  | Why we need it                   |
| ----------------- | ----------- | ------------------------------- | -------------------------------- |
| `effect`          | none        | Effect to inject into runtime   | Machine invokes controlled work. |
| `succeed`         | value       | completes with success          | Happy path.                      |
| `fail`            | typed error | completes with expected failure | Failure path.                    |
| `die`             | defect      | completes with defect           | Defect routing.                  |
| `delay`           | duration    | delays completion               | Loading/in-flight states.        |
| `cancel`          | none        | interrupts Effect               | Cleanup tests.                   |
| `attempts`        | none        | attempt count                   | Retry tests.                     |

## Controlled Stream

| Function/property | Input       | Output/meaning                | Why we need it                     |
| ----------------- | ----------- | ----------------------------- | ---------------------------------- |
| `stream`          | none        | Stream to inject into runtime | Machine invokes controlled stream. |
| `emit`            | value       | emits stream value            | Progress/live events.              |
| `fail`            | typed error | stream failure                | Failure path.                      |
| `end`             | none        | stream completion             | Completion path.                   |
| `active`          | none        | stream state probe            | Subscription started.              |
| `cancelled`       | none        | stream state probe            | Cleanup on state exit.             |

## Cache Inspector

| Function        | Input             | Output             | Why we need it                              |
| --------------- | ----------------- | ------------------ | ------------------------------------------- |
| `get`           | cache key         | resource state     | Inspect cached data.                        |
| `query`         | cache key         | query probe        | Fresh/stale/loading/success/failure checks. |
| `invalidations` | key/tag/predicate | invalidation probe | Mutation invalidation tests.                |
| `writes`        | key               | cache write probe  | Optimistic update tests.                    |
| `snapshot`      | none              | cache snapshot     | Restore/replay foundation.                  |

## Effect And Service Inspectors

| Function    | Input          | Output        | Why we need it               |
| ----------- | -------------- | ------------- | ---------------------------- |
| `running`   | effect name/id | effect probe  | In-flight state tests.       |
| `completed` | effect name/id | effect probe  | Completion tests.            |
| `cancelled` | effect name/id | effect probe  | Cleanup/interruption tests.  |
| `attempts`  | effect name/id | attempt count | Retry tests.                 |
| `calls`     | service method | call records  | Verify service usage.        |
| `called`    | service method | call probe    | Positive service call tests. |

## Scenario Runner

| Property | Input                        | Output/meaning    | Why we need it           |
| -------- | ---------------------------- | ----------------- | ------------------------ |
| `name`   | string                       | scenario label    | Test/report readability. |
| `given`  | harness setup                | prepared harness  | Precondition setup.      |
| `steps`  | event/time/flush/expect list | executed scenario | Product flow.            |
| `then`   | final harness check          | final assertions  | Scenario outcome.        |

## Stubbed Advanced Test Surfaces

| Feature             | Input                        | Output                | Stub behavior                                       | Runtime dependency             |
| ------------------- | ---------------------------- | --------------------- | --------------------------------------------------- | ------------------------------ |
| `flowTest.model`    | machine graph and drivers    | generated plans       | Reads graph metadata and reports unsupported nodes. | Stable graph semantics.        |
| `flowTest.failures` | failure source               | failure matrix report | Records declared failure routes.                    | Failure source metadata.       |
| `flowTest.fuzz`     | event generators             | fuzz report           | Runs bounded event sequences with diagnostics.      | Invariants and stable runtime. |
| `flowTest.replay`   | production trace             | replay report         | Validates trace shape and redaction.                | Trace/schema versioning.       |
| `renderFlow`        | React UI and harness options | rendered UI + harness | Wraps `useFlow` once React adapter exists.          | React adapter.                 |
| `playwrightFlow`    | browser page and flow config | e2e flow helpers      | Documents browser event driver shape.               | Browser adapter.               |
| `flowTest.view`     | view projection              | view harness          | Records projection inputs and selected output.      | `flow.view` semantics.         |

## Implementation Map

| Surface                                    | Status  | First implementation proof                                                                                          |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `flowTest` / `testFlow`                    | `ready` | Starts a machine with fake runtime and exposes harness.                                                             |
| `createTestRuntime`                        | `stub`  | Inline `flowTest(...).provide(layer)` exists; named runtime factory is not split out yet.                           |
| `createTestLayer`                          | `ready` | Satisfies the same service shape as production Layer.                                                               |
| `createControlledEffect`                   | `ready` | Backed by `Deferred`; tests can run an Effect and complete it with success, typed failure, defect, or cancellation. |
| `runEffectExit` / `runEffectWithLayerExit` | `ready` | Runs an Effect to a normalized success/failure/defect/interrupt outcome, optionally with a provided test Layer.     |
| `createControlledStream`                   | `stub`  | Emits controlled values and proves cancellation once stream runtime exists.                                         |
| `runScenario`                              | `stub`  | Executes named steps against harness and returns snapshots/trace.                                                   |
| `flush`                                    | `ready` | Drains ready microtasks without waiting for active controlled Effects forever.                                      |
| bounded `settle`                           | `stub`  | Alias of `flush` today; bounded diagnostics are not implemented.                                                    |
| cache/effect/service probes                | `ready` | Inspect resources, mutations, invalidations, running work, issues, and receipts. Service call probes are not ready. |
| model/fuzz/replay/render/e2e helpers       | `stub`  | Consume graph, trace, and adapter contracts as those stabilize.                                                     |

## Open Decisions

- `flowTest` vs `testFlow` vs `flow.test`.
- Whether harness methods return promises or Effects.
- Exact `flush` and `settle` bounds.
- How traces redact sensitive data.
- How fake service call records are represented.
- How type tests are organized.
