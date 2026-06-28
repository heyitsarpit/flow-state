# Streams And Time

Streams model ongoing state-scoped values. Time uses Effect `Clock`, `TestClock`, `Schedule`, and `Duration.Input`.

## flow.stream

```ts
export const uploadStream = flow.stream({
  id: "Assets.uploadStream",
  params: ({ context }) => context.assets,
  subscribe: ({ params }) =>
    Stream.fromIterable(
      params.map((asset) => ({
        assetId: asset.id,
        uploadedBytes: asset.size,
        totalBytes: asset.size,
      })),
    ),
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

The final authoring field is `subscribe`. Use `unsubscribe` for closing a concrete external subscription and `dispose` for a larger owned runtime, service, actor, or resource lifetime.

## Snapshots

Stream snapshots live in `snapshot.streams`, not `snapshot.resources`.

| Field                   | Meaning                                                   |
| ----------------------- | --------------------------------------------------------- |
| `status`                | Idle, running, done, typed failure, defect, or interrupt. |
| `generation`            | Monotonic generation for stale token protection.          |
| `latest`                | Latest emitted value if retained.                         |
| `emitted`               | Generation-local emitted count.                           |
| `coalesced` / `dropped` | Pressure diagnostics.                                     |
| `startedAt` / `endedAt` | Lifecycle timestamps where available.                     |

Launch Workspace chat tests prove that stale tokens from an interrupted generation do not route into the next generation.

## Pressure

Prefer Effect-aligned pressure vocabulary such as suspend, dropping, sliding, unbounded, and sample. Launch Workspace currently uses `coalesce-latest` as compatibility/product sugar for keyed latest progress. New pressure APIs should make that relationship explicit instead of pretending it is an Effect queue strategy.

## Cancellation

State exit, actor stop, parent supervision stop, and runtime disposal should interrupt state-owned streams. Interrupts are distinct from typed failures and defects.

```ts
await runtime.orchestrators.stop("chat:launch-1");

expect(actor.issues()).toEqual([
  expect.objectContaining({ kind: "interrupt", source: "stream", id: "Chat.tokenStream" }),
]);
```

## flow.after

Use `flow.after` for one-shot delayed transitions.

```ts
complete: {
  after: flow.after({ id: "Assets.dismissComplete", delay: "2 seconds", target: "idle" }),
}
```

Delayed transitions are state-owned: they cancel on state exit and actor stop, and they should run under injected `Clock` / `TestClock` services instead of real sleeps in tests.

Timer snapshots live in `snapshot.timers`, and `flowTest.timers()` exposes the same lifecycle facts with receipt filtering.

| Field                 | Meaning                                                        |
| --------------------- | -------------------------------------------------------------- |
| `status`              | `scheduled`, `fired`, or `interrupt`.                          |
| `generation`          | Monotonic generation for cancel/rearm and stale-fire tracking. |
| `parentState`         | The state that owned the timer when it was scheduled.          |
| `startedAt` / `dueAt` | Virtual or injected clock boundaries for the one-shot timer.   |
| `endedAt`             | When the timer fired or was interrupted, when available.       |

Use `Schedule` for retry, polling, repeat, refresh, and sampling. Do not stretch `flow.after` into repeated behavior.

## Durations And Time

Use Effect `Duration.Input` values:

```ts
"30 seconds";
"5 minutes";
"250 millis";
```

`flush` drains work that is ready now. It should not advance time, wait for unfinished Deferreds, consume an unbounded stream, or chase polling forever. Use `advance(duration)` to move virtual time for a specific delayed transition boundary. Use `settle(bounds)` when you want bounded quiescence that can advance to the next delayed transition and fail with explicit diagnostics if work does not drain.
