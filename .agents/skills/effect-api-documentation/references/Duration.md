# `Duration`

Source: [Effect v4 `Duration` API](https://www.effect.website/docs/v4/api/effect/Duration). Examples assume `import { Duration } from "effect"`.

## API index

1. [Duration.Duration](#durationduration)
2. [Duration.fromInput](#durationfrominput)
3. [Duration.fromInputUnsafe](#durationfrominputunsafe)
4. [Duration.millis](#durationmillis)
5. [Duration.seconds](#durationseconds)
6. [Duration.minutes](#durationminutes)
7. [Duration.toMillis](#durationtomillis)
8. [Duration.toSeconds](#durationtoseconds)
9. [Duration.sum](#durationsum)
10. [Duration.times](#durationtimes)
11. [Duration.between](#durationbetween)
12. [Duration.isLessThan](#durationislessthan)
13. [Duration.match](#durationmatch)
14. [Duration.format](#durationformat)
15. [Duration.zero](#durationzero)

### Additional known APIs (not expanded)

`DurationValue`, `Unit`, `Input`, `DurationObject`, `isDuration`, `isFinite`, `isZero`, `isNegative`, `isPositive`, `abs`, `negate`, `infinity`, `negativeInfinity`, `nanos`, `micros`, `hours`, `days`, `weeks`, `toMinutes`, `toHours`, `toDays`, `toWeeks`, `toNanosUnsafe`, `toNanos`, `toHrTime`, `matchPair`, `Order`, `Equivalence`, `min`, `max`, `clamp`, `divide`, `divideUnsafe`, `subtract`, `isLessThanOrEqualTo`, `isGreaterThan`, `isGreaterThanOrEqualTo`, `equals`, `parts`, `ReducerSum`, `CombinerMax`, `CombinerMin`

### [Duration.Duration](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:70)

Represents an immutable finite or infinite span of time for delays, timeouts, intervals, and TTLs.

```ts
const timeout: Duration.Duration = Duration.seconds(30);
```

### [Duration.fromInput](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:330)

Decodes duration-like input safely, returning an `Option` for invalid input instead of throwing.

```ts
const parsed = Duration.fromInput("250 millis");
```

### [Duration.fromInputUnsafe](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:228)

Decodes trusted duration-like input and throws when the input is invalid.

```ts
const timeout = Duration.fromInputUnsafe({ seconds: 30 });
```

### [Duration.millis](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:670)

Creates a duration from milliseconds.

```ts
const debounce = Duration.millis(250);
```

### [Duration.seconds](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:687)

Creates a duration from seconds.

```ts
const lease = Duration.seconds(30);
```

### [Duration.minutes](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:704)

Creates a duration from minutes.

```ts
const retention = Duration.minutes(15);
```

### [Duration.toMillis](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:772)

Converts duration input to milliseconds for APIs that require a number.

```ts
const milliseconds = Duration.toMillis("2 seconds");
```

### [Duration.toSeconds](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:795)

Converts duration input to seconds.

```ts
const seconds = Duration.toSeconds(Duration.millis(1500));
```

### [Duration.sum](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1494)

Adds two duration values while preserving the duration representation.

```ts
const total = Duration.sum("1 second", "250 millis");
```

### [Duration.times](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1412)

Scales a duration by a number.

```ts
const backoff = Duration.times("100 millis", 3);
```

### [Duration.between](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1193)

Returns the absolute difference between two durations.

```ts
const gap = Duration.between(Duration.seconds(2), Duration.seconds(5));
```

### [Duration.isLessThan](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1531)

Checks whether one duration is shorter than another.

```ts
const isShort = Duration.isLessThan("250 millis", "1 second");
```

### [Duration.match](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1019)

Handles finite and infinite duration representations without inspecting the internal tag directly.

```ts
const label = Duration.match(Duration.infinity, {
  onMillis: String,
  onNanos: String,
  onInfinity: () => "unbounded",
  onNegativeInfinity: () => "negative",
});
```

### [Duration.format](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1735)

Formats a duration as a human-readable string.

```ts
const label = Duration.format(Duration.millis(1500));
```

### [Duration.zero](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:587)

Provides the canonical zero duration for immediate schedules and neutral arithmetic.

```ts
const immediate = Duration.zero;
```
