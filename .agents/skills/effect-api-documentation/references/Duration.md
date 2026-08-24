# `Duration`

Source: [Effect v4 `Duration` API](https://www.effect.website/docs/v4/api/effect/Duration). Examples assume `import { Duration } from "effect"`.

## API index

1. [Duration.Duration](#durationduration)
2. [Duration.DurationValue](#durationdurationvalue)
3. [Duration.Unit](#durationunit)
4. [Duration.Input](#durationinput)
5. [Duration.DurationObject](#durationdurationobject)
6. [Duration.fromInput](#durationfrominput)
7. [Duration.fromInputUnsafe](#durationfrominputunsafe)
8. [Duration.isDuration](#durationisduration)
9. [Duration.isFinite](#durationisfinite)
10. [Duration.abs](#durationabs)
11. [Duration.negate](#durationnegate)
12. [Duration.millis](#durationmillis)
13. [Duration.seconds](#durationseconds)
14. [Duration.minutes](#durationminutes)
15. [Duration.hours](#durationhours)
16. [Duration.nanos](#durationnanos)
17. [Duration.toMillis](#durationtomillis)
18. [Duration.toSeconds](#durationtoseconds)
19. [Duration.toMinutes](#durationtominutes)
20. [Duration.toNanos](#durationtonanos)
21. [Duration.toHrTime](#durationtohrtime)
22. [Duration.sum](#durationsum)
23. [Duration.subtract](#durationsubtract)
24. [Duration.times](#durationtimes)
25. [Duration.between](#durationbetween)
26. [Duration.Order](#durationorder)
27. [Duration.Equivalence](#durationequivalence)
28. [Duration.min](#durationmin)
29. [Duration.max](#durationmax)
30. [Duration.clamp](#durationclamp)
31. [Duration.divide](#durationdivide)
32. [Duration.isLessThan](#durationislessthan)
33. [Duration.isLessThanOrEqualTo](#durationislessthanorequalto)
34. [Duration.equals](#durationequals)
35. [Duration.match](#durationmatch)
36. [Duration.parts](#durationparts)
37. [Duration.format](#durationformat)
38. [Duration.zero](#durationzero)
39. [Duration.infinity](#durationinfinity)
40. [Duration.negativeInfinity](#durationnegativeinfinity)

### Additional known APIs (not expanded)

`isZero`, `isNegative`, `isPositive`, `micros`, `days`, `weeks`, `toHours`, `toDays`, `toWeeks`, `toNanosUnsafe`, `matchPair`, `divideUnsafe`, `isGreaterThan`, `isGreaterThanOrEqualTo`, `ReducerSum`, `CombinerMax`, `CombinerMin`

### [Duration.Duration](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:70)

Represents an immutable finite or infinite span of time for delays, timeouts, intervals, and TTLs.

```ts
const timeout: Duration.Duration = Duration.seconds(30);
```

### [Duration.DurationValue](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:96)

Describes the tagged representation stored in `Duration.value`, including millisecond, nanosecond, and infinite values.

```ts
const value: Duration.DurationValue = Duration.seconds(1).value;
```

### [Duration.Unit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:115)

Names the units accepted by string duration input.

```ts
const unit: Duration.Unit = "seconds";
```

### [Duration.Input](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:158)

Describes the duration-like inputs accepted by constructors and conversions.

```ts
const input: Duration.Input = { minutes: 1, seconds: 30 };
const duration = Duration.fromInputUnsafe(input);
```

### [Duration.DurationObject](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:189)

Represents an object-shaped duration input with additive time-unit fields.

```ts
const input: Duration.DurationObject = { minutes: 1, seconds: 30 };
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

### [Duration.isDuration](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:413)

Guards an unknown value to the `Duration` type.

```ts
const value: unknown = Duration.seconds(1);
if (Duration.isDuration(value)) console.log(value.value);
```

### [Duration.isFinite](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:430)

Checks that a duration is neither positive nor negative infinity.

```ts
const finite = Duration.isFinite(Duration.seconds(1));
```

### [Duration.abs](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:533)

Returns the absolute value of a duration.

```ts
const positive = Duration.abs(Duration.seconds(-5));
```

### [Duration.negate](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:560)

Negates a duration, including swapping positive and negative infinity.

```ts
const negative = Duration.negate(Duration.seconds(5));
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

### [Duration.hours](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:721)

Creates a duration from hours.

```ts
const lease = Duration.hours(2);
```

### [Duration.nanos](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:636)

Creates a duration from a bigint nanosecond count.

```ts
const precise = Duration.nanos(1000n);
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

### [Duration.toMinutes](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:818)

Converts duration input to minutes.

```ts
const minutes = Duration.toMinutes("2 hours");
```

### [Duration.toNanos](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:962)

Safely converts duration input to a bigint nanosecond count, returning an `Option` when conversion fails.

```ts
const nanos = Duration.toNanos(Duration.millis(2));
```

### [Duration.toHrTime](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:980)

Converts duration input to a Node-style seconds/nanoseconds tuple.

```ts
const [seconds, nanos] = Duration.toHrTime("1500 millis");
```

### [Duration.sum](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1494)

Adds two duration values while preserving the duration representation.

```ts
const total = Duration.sum("1 second", "250 millis");
```

### [Duration.subtract](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1450)

Subtracts one duration from another.

```ts
const remaining = Duration.subtract(Duration.seconds(1), Duration.millis(250));
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

### [Duration.Order](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1141)

Provides an `Order` instance for comparing durations.

```ts
const ordered = Duration.Order(Duration.seconds(1), Duration.seconds(2));
```

### [Duration.Equivalence](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1213)

Provides an `Equivalence` instance for checking duration equality.

```ts
const same = Duration.Equivalence(Duration.seconds(1), Duration.millis(1000));
```

### [Duration.min](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1235)

Returns the shorter of two durations.

```ts
const shorter = Duration.min(Duration.seconds(1), Duration.millis(250));
```

### [Duration.max](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1255)

Returns the longer of two durations.

```ts
const longer = Duration.max(Duration.seconds(1), Duration.millis(250));
```

### [Duration.clamp](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1278)

Constrains a duration between an inclusive minimum and maximum.

```ts
const bounded = Duration.clamp(Duration.seconds(5), {
  minimum: Duration.seconds(1),
  maximum: Duration.seconds(3),
});
```

### [Duration.divide](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1306)

Safely divides a duration and returns an `Option` for invalid divisors.

```ts
const half = Duration.divide(Duration.seconds(1), 2);
```

### [Duration.isLessThan](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1531)

Checks whether one duration is shorter than another.

```ts
const isShort = Duration.isLessThan("250 millis", "1 second");
```

### [Duration.isLessThanOrEqualTo](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1554)

Checks whether one duration is no longer than another.

```ts
const fits = Duration.isLessThanOrEqualTo(Duration.seconds(1), Duration.seconds(1));
```

### [Duration.equals](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1617)

Checks duration equality after normalizing the inputs.

```ts
const same = Duration.equals(Duration.seconds(1), Duration.millis(1000));
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

### [Duration.parts](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:1671)

Extracts normalized duration parts for inspection or serialization.

```ts
const value = Duration.parts(Duration.seconds(1));
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

### [Duration.infinity](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:603)

Provides the canonical positive-infinity duration.

```ts
const unbounded: Duration.Duration = Duration.infinity;
```

### [Duration.negativeInfinity](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Duration.ts:619)

Provides the canonical negative-infinity duration.

```ts
const beforeAll: Duration.Duration = Duration.negativeInfinity;
```
