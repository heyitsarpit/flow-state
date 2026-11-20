# `DateTime`

Source: [Effect v4 `DateTime` API](https://www.effect.website/docs/v4/api/effect/DateTime). Examples assume `import { DateTime } from "effect"`.

`DateTime` represents calendar date-time values and provides parsing, comparison, arithmetic, and timezone-aware operations.

## API index

1. [DateTime.DateTime](#datetimedatetime)
2. [DateTime.make](#datetimemake)
3. [DateTime.makeUnsafe](#datetimemakeunsafe)
4. [DateTime.now](#datetimenow)
5. [DateTime.makeZoned](#datetimemakezoned)
6. [DateTime.setZone](#datetimesetzone)
7. [DateTime.toUtc](#datetimetoutc)
8. [DateTime.toEpochMillis](#datetimetoepochmillis)
9. [DateTime.toDate](#datetimetodate)
10. [DateTime.add](#datetimeadd)
11. [DateTime.subtract](#datetimesubtract)
12. [DateTime.startOf](#datetimestartof)
13. [DateTime.endOf](#datetimeendof)
14. [DateTime.between](#datetimebetween)
15. [DateTime.distance](#datetimedistance)
16. [DateTime.match](#datetimematch)
17. [DateTime.formatIso](#datetimeformatiso)
18. [DateTime.formatIsoZoned](#datetimeformatisozoned)

### Additional known APIs (not expanded)

`Utc`, `Zoned`, `TimeZone`, `Disambiguation`, `isDateTime`, `isTimeZone`, `isTimeZoneOffset`, `isTimeZoneNamed`, `isUtc`, `isZoned`, `Equivalence`, `Order`, `clamp`, `fromDateUnsafe`, `makeZonedUnsafe`, `makeZonedFromString`, `nowAsDate`, `nowUnsafe`, `setZoneOffset`, `zoneMakeNamedUnsafe`, `zoneMakeOffset`, `zoneMakeNamed`, `zoneMakeNamedEffect`, `zoneMakeLocal`, `zoneFromString`, `zoneToString`, `setZoneNamed`, `setZoneNamedUnsafe`, `distance`, `min`, `max`, `isGreaterThan`, `isGreaterThanOrEqualTo`, `isLessThan`, `isLessThanOrEqualTo`, `isFuture`, `isFutureUnsafe`, `isPast`, `isPastUnsafe`, `toDateUtc`, `zonedOffset`, `zonedOffsetIso`, `removeTime`, `toParts`, `toPartsUtc`, `getPartUtc`, `getPart`, `setParts`, `setPartsUtc`, `CurrentTimeZone`, `setZoneCurrent`, `withCurrentZone`, `withCurrentZoneLocal`, `withCurrentZoneOffset`, `withCurrentZoneNamed`, `nowInCurrentZone`, `mutate`, `mutateUtc`, `mapEpochMillis`, `withDate`, `withDateUtc`, `nearest`, `format`, `formatLocal`, `formatUtc`, `formatIntl`, `formatIsoDate`, `formatIsoDateUtc`, `formatIsoOffset`, `layerCurrentZone`, `layerCurrentZoneOffset`, `layerCurrentZoneNamed`, `layerCurrentZoneLocal`

### [DateTime.DateTime](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:37)

Represents an immutable UTC or zoned date-time with explicit time-zone behavior.

```ts
const created: DateTime.DateTime = DateTime.makeUnsafe("2024-01-01T12:00:00Z");
```

### [DateTime.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:787)

Safely constructs a date-time from a `Date`, epoch milliseconds, parts, or parseable string and returns an `Option` on invalid input.

```ts
const parsed = DateTime.make("2024-01-01T12:00:00Z");
```

### [DateTime.makeUnsafe](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:656)

Constructs a date-time from trusted input and throws for invalid input.

```ts
const created = DateTime.makeUnsafe({ year: 2024, month: 1, day: 1 });
```

### [DateTime.now](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:838)

Reads the current time from the Effect `Clock` service as a UTC date-time.

```ts
const now = yield* DateTime.now;
```

### [DateTime.makeZoned](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:739)

Safely creates a zoned date-time, returning `None` when the input or time zone cannot be resolved.

```ts
const london = DateTime.makeZoned("2024-06-15T12:00:00Z", { timeZone: "Europe/London" });
```

### [DateTime.setZone](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:940)

Attaches or changes a time zone while preserving the date-time’s explicit zone semantics.

```ts
const london = DateTime.setZone(utc, DateTime.zoneMakeNamedUnsafe("Europe/London"));
```

### [DateTime.toUtc](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:918)

Converts a UTC or zoned value to a UTC representation.

```ts
const utc = DateTime.toUtc(zoned);
```

### [DateTime.toEpochMillis](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:1656)

Returns the UTC epoch timestamp in milliseconds, independent of the displayed time zone.

```ts
const timestamp = DateTime.toEpochMillis(DateTime.makeUnsafe("2024-01-01T00:00:00Z"));
```

### [DateTime.toDate](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:1582)

Converts a date-time to a JavaScript `Date`, applying the zone for zoned values.

```ts
const date = DateTime.toDate(DateTime.makeUnsafe("2024-01-01T00:00:00Z"));
```

### [DateTime.add](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:2343)

Adds calendar-aware date and time parts while accounting for time-zone rules.

```ts
const nextWeek = DateTime.add(utc, { weeks: 1 });
```

### [DateTime.subtract](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:2365)

Subtracts calendar-aware date and time parts.

```ts
const previousDay = DateTime.subtract(utc, { days: 1 });
```

### [DateTime.startOf](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:2393)

Rounds a date-time down to the start of a calendar unit.

```ts
const dayStart = DateTime.startOf(utc, "day");
```

### [DateTime.endOf](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:2428)

Rounds a date-time up to the end of a calendar unit.

```ts
const dayEnd = DateTime.endOf(utc, "day");
```

### [DateTime.between](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:1417)

Checks whether a date-time falls within inclusive minimum and maximum bounds.

```ts
const inWindow = DateTime.between(utc, { minimum: start, maximum: end });
```

### [DateTime.distance](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:1252)

Computes the absolute duration between two date-times.

```ts
const elapsed = DateTime.distance(start, end);
```

### [DateTime.match](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:2243)

Handles UTC and zoned representations without inspecting the internal tag.

```ts
const text = DateTime.match(value, {
  onUtc: DateTime.formatIso,
  onZoned: DateTime.formatIsoZoned,
});
```

### [DateTime.formatIso](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:2693)

Formats a date-time as an ISO string representing its instant.

```ts
const text = DateTime.formatIso(utc);
```

### [DateTime.formatIsoZoned](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/DateTime.ts:2804)

Formats a zoned date-time with its offset and named zone when available.

```ts
const text = DateTime.formatIsoZoned(london);
```
