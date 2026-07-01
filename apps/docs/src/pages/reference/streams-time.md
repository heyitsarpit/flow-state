# Streams And Time

Use `flow.stream` for state-scoped ongoing values and `flow.after` for one-shot
delayed transitions.

## `flow.stream`

```ts
const uploadStream = flow.stream({
  id: "Assets.uploadStream",
  params: ({ context }) => context.assets,
  subscribe: ({ params }) => AssetsApi.subscribeUpload(params),
  pressure: {
    strategy: "coalesce-latest",
    key: (progress) => progress.assetId,
  },
  routes: {
    value: (progress) => ({ type: "UPLOAD_PROGRESS", progress }),
    done: () => ({ type: "UPLOAD_DONE" }),
  },
});
```

Use the `subscribe` field for stream authoring. Use `unsubscribe` for closing a
concrete external subscription and `dispose` for larger runtime or service
lifetimes.

## Stream Facts

Stream snapshots live in `snapshot.streams`.

The current proved stream slice includes:

- running, done, failure, defect, and interrupt outcomes
- generation tracking
- latest emitted value when retained
- emitted counts
- cancellation on state exit, actor stop, and runtime disposal

Launch Workspace proves that tokens from an interrupted generation do not leak
into the next generation.

## Pressure

The runtime proves queue and keyed coalesce-style pressure slices today.

Treat broader pressure diagnostics and counters as partial. Keep docs and app
design honest about that.

## `flow.after`

Use `flow.after` for one delayed transition.

```ts
complete: {
  after: flow.after({
    id: "Assets.dismissComplete",
    delay: "2 seconds",
    target: "idle",
  }),
}
```

The current timer slice is explicitly one-shot. Recurring behavior should use
Effect `Schedule`, not `flow.after`.

## Timer Facts

Timer snapshots live in `snapshot.timers` and `harness.timers()`.

The proved slice includes:

- scheduled, fired, and interrupt lifecycle
- due times
- generation tracking
- restored resume for supported actor snapshot restore

## Time Controls In Tests

Use the harness controls intentionally:

- `flush()` for ready work only
- `advance(duration)` to move virtual time
- `settle(bounds)` for bounded quiescence
- `pendingWork()` to inspect work without moving time

The common mistake is expecting `flush()` to advance time or to wait forever for
future work.
