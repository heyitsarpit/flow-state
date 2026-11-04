// Concern = responsibility; Boundary = its implementation through a contract.
// Protocol = data with agreed meaning; Established fact = what construction or validation proves.
// Composition level = depth in this workflow, not a required folder or class.
// Concern: summarize supplied usage for today's calendar day in the customer's named zone.
// No storage, service wrapper, or timer is needed: Schema admission + calendar arithmetic suffice.
import { Array as Arr, DateTime, Effect, Schema } from "effect";

/*****************************************************************************/
/* Level 1: Usage admission */
/*****************************************************************************/

// Protocol: UsageRequest carries valid zone, instant, and bounded quantity facts into calculation.
const UsageRequest = Schema.Struct({
  timeZone: Schema.TimeZoneNamedFromString,
  events: Schema.Array(
    Schema.Struct({
      occurredAt: Schema.DateTimeUtcFromString,
      units: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 })),
    }),
  ).check(Schema.isMaxLength(1000)),
});

// Build the decoder once. Schema owns parsing and named-zone validation, not ad hoc Date parsing.
// DateTimeUtcFromString accepts DateTime.make strings; offsetless strings mean UTC, not customer time.
const decodeRequest = Schema.decodeEffect(Schema.fromJsonString(UsageRequest), {
  onExcessProperty: "error",
});

/*****************************************************************************/
/* Level 0: Daily report workflow */
/*****************************************************************************/

// Composition site: admit the entire request -> capture one instant -> select the day -> aggregate.
// Contract: JSON -> report or SchemaError; current time comes from Effect's injected Clock.
// Invariant: totalUnits is an exact integer in [0, 1,000,000,000] for every successful report.
export const dailyUsageReport = Effect.fn("dailyUsageReport")(function* (json: string) {
  const request = yield* decodeRequest(json);

  // Carry established facts: calendar arithmetic consumes admitted zones and instants directly.
  // Aggregation relies on admitted quantity bounds; filtering selects the day, not valid input.

  // One injected instant owns both day selection and observedAt. Tests control it with TestClock.
  const now = yield* DateTime.now;
  const start = now.pipe(DateTime.setZone(request.timeZone), DateTime.startOf("day"));
  const end = start.pipe(DateTime.add({ days: 1 }), DateTime.startOf("day"));

  // Half-open windows avoid counting midnight in two days. between() has inclusive endpoints.
  // Admission proved units and collection bounds: the sum cannot exceed 1,000,000,000.
  const included = Arr.filter(
    request.events,
    ({ occurredAt }) =>
      DateTime.isGreaterThanOrEqualTo(occurredAt, start) && DateTime.isLessThan(occurredAt, end),
  );

  return {
    day: DateTime.formatIsoDate(start),
    // Intl may normalize equivalent zone aliases, e.g. Kolkata to Calcutta.
    timeZone: DateTime.zoneToString(request.timeZone),
    startsAt: DateTime.formatIso(start),
    endsAt: DateTime.formatIso(end),
    observedAt: DateTime.formatIso(now),
    eventCount: included.length,
    totalUnits: Arr.reduce(included, 0, (total, event) => total + event.units),
  };
});
