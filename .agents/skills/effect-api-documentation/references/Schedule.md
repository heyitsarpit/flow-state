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
16. [Schedule.isSchedule](#scheduleisschedule)
17. [Schedule.addDelay](#scheduleadddelay)
18. [Schedule.min](#schedulemin)
19. [Schedule.fibonacci](#schedulefibonacci)
20. [Schedule.modifyDelay](#schedulemodifydelay)
21. [Schedule.windowed](#schedulewindowed)

### Additional known APIs (not expanded)

`fromStep`, `fromStepWithMetadata`, `toStep`, `toStepWithMetadata`, `toStepWithSleep`, `andThenResult`, `passthrough`, `identity`, `while`, `setInputType`

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

### [Schedule.isSchedule](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:258)

Checks whether an unknown value is a `Schedule` and narrows it to the schedule type.

```ts
const input: unknown = Schedule.recurs(3);

if (Schedule.isSchedule(input)) {
  yield* Effect.repeat(Effect.log("attempt"), input);
}
```

### [Schedule.addDelay](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:572)

Adds an effectfully computed delay to each delay already produced by a schedule.

```ts
const delayed = Schedule.recurs(3).pipe(
  Schedule.addDelay(() => Effect.succeed("100 millis")),
);

yield* Effect.retry(Effect.fail("temporary"), delayed);
```

### [Schedule.min](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:1174)

Combines schedules and continues while at least one continues, choosing the shortest next delay.

```ts
const earliest = Schedule.min([
  Schedule.fixed("1 second"),
  Schedule.fixed("5 seconds"),
]);

yield* Effect.repeat(Effect.log("poll"), earliest);
```

### [Schedule.fibonacci](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:1350)

Produces delays that grow according to the Fibonacci sequence from the supplied initial duration.

```ts
const backoff = Schedule.fibonacci("100 millis");
yield* Effect.retry(Effect.fail("temporary"), backoff);
```

### [Schedule.modifyDelay](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:1595)

Replaces each schedule delay with an effectfully computed duration based on its metadata.

```ts
const adaptive = Schedule.exponential("100 millis").pipe(
  Schedule.modifyDelay(({ attempt }) =>
    Effect.succeed(attempt > 2 ? "1 second" : "100 millis")
  ),
);

yield* Effect.retry(Effect.fail("temporary"), adaptive);
```

### [Schedule.windowed](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Schedule.ts:2090)

Aligns recurrences to fixed time windows instead of delaying from the previous completion.

```ts
const everyMinute = Schedule.windowed("1 minute");
yield* Effect.repeat(Effect.log("refresh"), everyMinute);
```
