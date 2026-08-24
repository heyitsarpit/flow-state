# `Schedule`

Source: [Effect v4 `Schedule` API](https://www.effect.website/docs/v4/api/effect/Schedule). Examples assume `import { Effect, Schedule } from "effect"`.

## API index

1. [Schedule.Schedule](#scheduleschedule)
2. [Schedule.fixed](#schedulefixed)
3. [Schedule.spaced](#schedulespaced)
4. [Schedule.exponential](#scheduleexponential)
5. [Schedule.recurs](#schedulerecurs)
6. [Schedule.upTo](#scheduleupto)
7. [Schedule.during](#scheduleduring)
8. [Schedule.jittered](#schedulejittered)
9. [Schedule.andThen](#scheduleandthen)
10. [Schedule.max](#schedulemax)
11. [Schedule.map](#schedulemap)
12. [Schedule.tap](#scheduletap)
13. [Schedule.cron](#schedulecron)
14. [Schedule.duration](#scheduleduration)
15. [Schedule.forever](#scheduleforever)

### Additional known APIs (not expanded)

`isSchedule`, `fromStep`, `fromStepWithMetadata`, `toStep`, `toStepWithMetadata`, `toStepWithSleep`, `addDelay`, `andThenResult`, `min`, `fibonacci`, `modifyDelay`, `passthrough`, `windowed`, `identity`, `while`, `setInputType`

### [Schedule.Schedule](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:78)

Represents a policy that consumes inputs and either stops or emits an output with the delay before the next step.

```ts
const retryPolicy: Schedule.Schedule<number> = Schedule.recurs(3);
```

### [Schedule.fixed](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:1436)

Repeats on a fixed cadence, aligning recurrences to the interval rather than adding the delay after each action.

```ts
const retry = Effect.retry(request, Schedule.fixed("1 second"));
```

### [Schedule.spaced](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:1823)

Repeats with the configured delay starting after the previous action completes.

```ts
const poll = Effect.repeat(refreshCache, Schedule.spaced("10 seconds"));
```

### [Schedule.exponential](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:1270)

Produces exponentially increasing delays for backoff policies.

```ts
const backoff = Schedule.exponential("100 millis").pipe(Schedule.upTo({ times: 5 }));
```

### [Schedule.recurs](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:1763)

Limits a counter schedule to a fixed number of recurrences, with no added delay.

```ts
const retry = Effect.retry(request, Schedule.recurs(3));
```

### [Schedule.upTo](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:1968)

Caps an existing schedule by elapsed duration, recurrence count, or both.

```ts
const bounded = Schedule.spaced("1 second").pipe(Schedule.upTo({ times: 10 }));
```

### [Schedule.during](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:1116)

Continues a schedule only while the configured amount of time has elapsed.

```ts
const fiveMinutePoll = Schedule.spaced("10 seconds").pipe(Schedule.during("5 minutes"));
```

### [Schedule.jittered](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:1645)

Adds bounded random variation to recurrence delays, reducing synchronized retries.

```ts
const resilientRetry = Schedule.exponential("100 millis").pipe(Schedule.jittered);
```

### [Schedule.andThen](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:631)

Runs one schedule to completion and then starts another, merging their outputs.

```ts
const retry = Schedule.andThen(
  Schedule.recurs(3),
  Schedule.exponential("1 second").pipe(Schedule.upTo({ times: 2 })),
);
```

### [Schedule.max](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:794)

Combines schedules while all continue, choosing the greatest next delay.

```ts
const conservative = Schedule.max([
  Schedule.fixed("1 second"),
  Schedule.exponential("1 second"),
]);
```

### [Schedule.map](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:1530)

Transforms schedule outputs while preserving the schedule’s timing and stopping behavior.

```ts
const labels = Schedule.recurs(3).pipe(
  Schedule.map(({ output }) => `attempt-${output}`),
);
```

### [Schedule.tap](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:1862)

Runs an effect for each schedule decision without changing its output or timing.

```ts
const observed = Schedule.exponential("100 millis").pipe(
  Schedule.tap(({ attempt }) => Effect.log(`attempt ${attempt}`)),
);
```

### [Schedule.cron](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:969)

Creates a schedule from a cron expression and emits the delay until the next occurrence.

```ts
const hourly = Schedule.cron("0 * * * *");
```

### [Schedule.duration](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:1014)

Creates a schedule that recurs once after the supplied duration and then stops.

```ts
const onceLater = Effect.repeat(task, Schedule.duration("5 minutes"));
```

### [Schedule.forever](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:2130)

Repeats forever and emits the current recurrence count.

```ts
const limitedDemo = Schedule.forever.pipe(Schedule.upTo({ times: 3 }));
```
