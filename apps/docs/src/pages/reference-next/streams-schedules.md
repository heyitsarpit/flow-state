# Streams And Schedules

Status: vNext contract.

Streams are process/lifecycle descriptors. They are not ResourceStore entries
unless a stream is explicitly materialized into a resource by a service.

Use streams for ongoing values tied to a flow state:

- upload progress
- agent progress
- websocket room events
- polling status updates
- live command output

Use resources for canonical app data:

- project by id
- comments by project id
- current user
- permissions
- dashboard panel payload

## Design Position

Flow should not invent a small stream runtime. Effect already has one.

Use Effect for:

- `Stream.Stream<A, E, R>`
- `Schedule.Schedule<Out, In, Err, R>`
- `Duration.Input`
- `Queue` and `PubSub`
- `Scope`, `Fiber`, `Exit`, `Cause`
- `Clock` and `TestClock`

Use Flow for:

- state-bound stream lifecycle
- event routing
- stream snapshots
- stream receipts
- pressure diagnostics
- test probes

## flow.stream

`flow.stream` starts when its owning state is entered and is interrupted when
that state exits.

```ts
const uploadProgress = flow.stream({
  id: "upload.progress",
  input: ({ ctx }) => ({ files: ctx.files }),
  stream: ({ input }) => UploadApi.use((api) => api.uploadFiles(input.files)),
  pressure: {
    strategy: "sliding",
    capacity: 1,
    key: (progress) => progress.fileId,
  },
  routes: {
    value: (progress) => ({ type: "UPLOAD_PROGRESS", progress }),
    done: () => ({ type: "UPLOAD_DONE" }),
    failure: (error) => ({ type: "UPLOAD_FAILED", error }),
    defect: (defect) => ({ type: "UPLOAD_DEFECT", defect }),
    interrupt: () => ({ type: "UPLOAD_INTERRUPTED" }),
  },
});
```

Target shape:

```ts
interface StreamConfig<I, A, E, R, Event> {
  readonly id: string;
  readonly input?: (args: FlowArgs) => I;
  readonly stream: (args: { readonly input: I }) => Stream.Stream<A, E, R>;
  readonly pressure?: StreamPressure<A>;
  readonly routes?: {
    readonly value?: (value: A) => Event;
    readonly done?: () => Event;
    readonly failure?: (error: E) => Event;
    readonly defect?: (defect: unknown) => Event;
    readonly interrupt?: () => Event;
  };
  readonly issues?: IssuePolicy;
}
```

Async iterables are an adapter source:

```ts
const stream = Stream.fromAsyncIterable(
  () => sdk.watchUpload(files),
  (cause) => new UploadSdkFailure({ cause }),
);
```

The descriptor should still receive a `Stream.Stream`.

## Stream Pressure

Align pressure names with Effect where possible.

```ts
type StreamPressure<A> =
  | { readonly strategy: "suspend"; readonly capacity: number }
  | { readonly strategy: "dropping"; readonly capacity: number }
  | { readonly strategy: "sliding"; readonly capacity: number; readonly key?: (value: A) => string }
  | { readonly strategy: "unbounded"; readonly replay?: number }
  | { readonly strategy: "sample"; readonly schedule: Schedule.Schedule<unknown, A> };
```

Rules:

- `suspend`, `dropping`, and `sliding` mirror `Queue`.
- `unbounded` and `replay` mirror `PubSub`.
- `sample` is schedule-based.
- Keyed `sliding` with capacity `1` replaces most `coalesce-latest` cases.
- If Flow keeps `coalesce-latest` as sugar, document it as product semantics,
  not Effect queue semantics.

## Stream Snapshot

Stream lifecycle lives in `snapshot.streams`, not `snapshot.resources`.

```ts
interface StreamSnapshot<A = unknown, E = unknown> {
  readonly id: string;
  readonly status: "idle" | "running" | "done" | "failure" | "defect" | "interrupt";
  readonly generation: number;
  readonly latest: Option.Option<A>;
  readonly error?: E;
  readonly defect?: unknown;
  readonly emitted: number;
  readonly coalesced: number;
  readonly dropped: number;
  readonly startedAt?: number;
  readonly endedAt?: number;
  readonly cause?: SerializableCause;
}
```

Generation matters. If a state exits and re-enters, late completions from the
old generation must not route into the new state.

## Cancellation

State exit interrupts state-bound streams. Runtime disposal interrupts every
runtime-owned stream.

Required semantics:

- Start each stream in the owning state `Scope`.
- Attach cleanup through normal Effect tools such as `Stream.ensuring`,
  `Effect.acquireRelease`, or service-level finalizers.
- Interrupt the fiber on state exit, actor stop, parent supervision stop, or
  runtime disposal.
- Treat interruption separately from typed failure and defects.
- Do not route stale generation outcomes.

## Schedules

Use `Schedule` for repeated behavior:

| Behavior                | API owner                                                                |
| ----------------------- | ------------------------------------------------------------------------ |
| retry a failing Effect  | `Effect.retry(effect, schedule)`                                         |
| retry a failing Stream  | `Stream.retry(schedule)`                                                 |
| polling                 | `Stream.fromEffectSchedule(effect, schedule)` or resource refresh policy |
| resource active refresh | `resource.freshness.refresh`                                             |
| stream sampling         | `pressure.strategy = "sample"`                                           |
| bounded test settling   | `flowTest(...).settle(bounds)`                                           |

Examples:

```ts
const retryNetwork = Schedule.exponential("200 millis").pipe(
  Schedule.jittered,
  Schedule.both(Schedule.recurs(5)),
  Schedule.setInputType<NetworkFailure>(),
);

const pollRunStatus = (runId: RunId) =>
  Stream.fromEffectSchedule(
    AgentApi.use((api) => api.getRunStatus(runId)),
    Schedule.spaced("5 seconds"),
  );
```

Do not stretch `flow.after` into repeat/polling/retry.

## flow.after

`flow.after` is only for one-shot delayed transitions.

```ts
const dismissCompleted = flow.after({
  id: "upload.dismiss-completed",
  delay: "2 seconds",
  target: "idle",
  update: resetUpload,
});
```

`delay` accepts `Duration.Input`:

```ts
"2 seconds";
{
  minutes: 5;
}
{
  milliseconds: 250;
}
```

Do not document Flow-specific `{ millis }`.

Lifecycle:

- Entering the state schedules the timer in the state's scope.
- Exiting the state interrupts the timer.
- Firing records `timer:fire`, applies guard/update/actions/target atomically,
  then routes a fired event if configured.
- Tests advance time through `TestClock` or harness `advance(Duration.Input)`.

## Queue And PubSub Sources

Use `Queue` for controlled single-consumer tests:

```ts
const queue =
  yield *
  Queue.make<UploadProgress>({
    capacity: 32,
    strategy: "sliding",
  });
const stream = Stream.fromQueue(queue);
```

Use `PubSub` when multiple consumers observe the same source:

```ts
const bus = yield * PubSub.bounded<TraceEvent>(128);
const stream = Stream.fromPubSub(bus);
```

The Flow descriptor receives a stream. The service decides whether the stream
came from a queue, pubsub, callback, websocket, SSE, polling loop, SDK, or async
iterable.

## Receipts

Stream and timer receipts are diagnostic facts:

```txt
stream:start
stream:value
stream:done
stream:failure
stream:defect
stream:interrupt
stream:cancel
stream:drop
stream:coalesce
timer:schedule
timer:fire
timer:cancel
```

Product logic should use routed machine events, not receipts.
