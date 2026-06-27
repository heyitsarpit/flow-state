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
| `createControlledStream` | optional name and pressure diagnostics  | controlled Stream handle | emit, fail, die, end, active/cancelled      | Tests subscriptions and cleanup.             |
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
| `streams`  | none            | stream inspector                      | running/latest/done/cancelled/events     | Test stream lifecycle.                |
| `timers`   | none            | timer inspector                       | scheduled/fired/cancelled/due time       | Test delayed transitions.             |
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

`advance(duration)` is the intended virtual-time contract: it will move the runtime `Clock`, run timer fibers made ready by that move, and then drain the resulting ready queue. In the current runtime slice it throws an unsupported error instead of silently acting like `flush()`.

`settle` must require bounds such as max events, max effects, max virtual time, max stream emissions, or max transitions. In the current runtime slice it throws an unsupported error until bounded diagnostics exist.

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
| `die`             | defect      | stream defect                 | Defect path.                       |
| `end`             | none        | stream completion             | Completion path.                   |
| `active`          | none        | boolean probe                 | Subscription started.              |
| `cancelled`       | none        | boolean probe                 | Cleanup on state exit.             |
| `events`          | none        | emitted/failure/done log      | Pressure and ordering assertions.  |

Current implementation note: the controlled stream handle records the final test-handle API and its event log. Runtime delivery into invoked streams is represented by the contract below and by `snapshot.streams`; it is not implemented by the handle alone.

Final intended controlled stream usage:

```ts
const progress = createControlledStream<UploadProgress, UploadFailure>("upload.progress");
const harness = flowTest(uploadMachine)
  .provide(createUploadTestLayer({ uploadFiles: progress.stream }).layer)
  .send({ type: "CHOOSE_FILES", files })
  .send({ type: "START_UPLOAD" });

expect(progress.active()).toBe(true);
expect(harness.streams().running("upload.progress")).toMatchObject({
  id: "upload.progress",
  status: "running",
});

progress.emit({ fileId: "file-1", uploadedBytes: 50, totalBytes: 100 });
await harness.flush();

expect(harness.streams().get("upload.progress")?.latest).toMatchObject({
  fileId: "file-1",
});

harness.send({ type: "CANCEL_UPLOAD" });
await harness.flush();

expect(progress.cancelled()).toBe(true);
expect(harness.receipts()).toContainEqual({ type: "stream:cancel", id: "upload.progress" });
```

## Stream Inspector

| Function      | Input     | Output                   | Why we need it                         |
| ------------- | --------- | ------------------------ | -------------------------------------- |
| `get`         | stream id | stream snapshot or null  | Inspect latest value and lifecycle.    |
| `running`     | stream id | running stream snapshot  | Assert active subscription.            |
| `completed`   | stream id | terminal stream snapshot | Assert done/failure/interrupted state. |
| `cancelled`   | stream id | cancellation probe       | Assert state-exit cleanup.             |
| `events`      | stream id | stream receipt subset    | Assert ordering and pressure behavior. |
| `diagnostics` | stream id | pressure diagnostics     | Assert coalesced/dropped/sample facts. |

## Timer Inspector

| Function    | Input    | Output                 | Why we need it                   |
| ----------- | -------- | ---------------------- | -------------------------------- |
| `get`       | timer id | timer snapshot or null | Inspect scheduled timer.         |
| `scheduled` | timer id | scheduled timer probe  | Assert state entry scheduled it. |
| `fired`     | timer id | fired timer probe      | Assert clock advancement.        |
| `cancelled` | timer id | cancelled timer probe  | Assert state exit cleanup.       |

## Cache Inspector

| Function        | Input             | Output             | Why we need it                              |
| --------------- | ----------------- | ------------------ | ------------------------------------------- |
| `get`           | cache key         | resource state     | Inspect cached data.                        |
| `query`         | cache key         | query probe        | Fresh/stale/loading/success/failure checks. |
| `stale`         | optional key      | stale resources    | Assert invalidation fanout.                 |
| `invalidations` | key/tag/predicate | invalidation probe | Mutation invalidation tests.                |
| `writes`        | optional key      | cache write probe  | Query/cache write tests.                    |
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

## Advanced Test Surfaces

| Feature             | Input                        | Output                | Stub behavior                                       | Runtime dependency             |
| ------------------- | ---------------------------- | --------------------- | --------------------------------------------------- | ------------------------------ |
| `flowTest.model`    | machine graph and drivers    | model report          | Reads graph metadata and reports unsupported nodes. | Stable graph semantics.        |
| `flowTest.failures` | failure source               | failure matrix report | Records declared failure routes.                    | Failure source metadata.       |
| `flowTest.fuzz`     | event generators             | fuzz report           | Runs bounded event sequences with diagnostics.      | Invariants and stable runtime. |
| `flowTest.replay`   | production trace             | replay report         | Validates trace shape and redaction.                | Trace/schema versioning.       |
| `renderFlow`        | React UI and harness options | rendered UI + harness | Wraps `useFlow` once React adapter exists.          | React adapter.                 |
| `playwrightFlow`    | browser page and flow config | e2e flow helpers      | Documents browser event driver shape.               | Browser adapter.               |
| `flowTest.view`     | view projection              | view harness          | Records projection inputs and selected output.      | `flow.view` semantics.         |

## Implementation Map

| Surface                                    | Status           | Current behavior                                                                                                                             |
| ------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `flowTest` / `testFlow`                    | `runtime-proven` | Starts a machine with fake runtime and exposes harness.                                                                                      |
| `createTestRuntime`                        | `stub`           | Inline `flowTest(...).provide(layer)` exists; named runtime factory is not split out yet.                                                    |
| `createTestLayer`                          | `runtime-proven` | Satisfies the same service shape as production Layer.                                                                                        |
| `createControlledEffect`                   | `runtime-proven` | Backed by `Deferred`; tests can run an Effect and complete it with success, typed failure, defect, or cancellation.                          |
| `runEffectExit` / `runEffectWithLayerExit` | `runtime-proven` | Runs an Effect to a normalized success/failure/defect/interrupt outcome, optionally with a provided test Layer.                              |
| `createControlledStream`                   | `contract`       | Handle API and event log exist; runtime stream delivery is absent.                                                                           |
| `runScenario`                              | `stub`           | Executes named steps against harness and returns snapshots/trace.                                                                            |
| `flush`                                    | `runtime-proven` | Drains ready microtasks without waiting for active controlled Effects forever.                                                               |
| bounded `settle`                           | `contract`       | Public method exists but throws until bounded quiescence diagnostics are runtime-backed.                                                     |
| `advance` / timer probes                   | `contract`       | Public method exists but throws until virtual-time runtime support exists.                                                                   |
| stream/timer probes                        | `contract`       | Inspector names and snapshot contracts exist; runtime population is absent.                                                                  |
| cache/effect/service probes                | `runtime-proven` | Inspect resources, mutations, invalidations, stale resources, writes, running work, issues, and receipts. Service call probes are not ready. |
| model/fuzz/replay helpers                  | `contract`       | Consume graph and trace contracts through `flowTest.model`, `flowTest.fuzz`, and `flowTest.replay`.                                          |
| render/e2e helpers                         | `stub`           | Browser and React test adapters are descriptor-only beyond `flowExperimental.playwrightFlow`.                                                |

## Open Decisions

- `flowTest` vs `testFlow` vs `flow.test`.
- Whether harness methods return promises or Effects.
- Exact default `settle` bounds.
- How traces redact sensitive data.
- How fake service call records are represented.
- How type tests are organized.
