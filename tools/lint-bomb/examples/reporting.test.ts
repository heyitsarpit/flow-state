import assert from "node:assert/strict";
import { describe, it } from "@effect/vitest";
import { DateTime, Effect, Result, Schema, Struct } from "effect";
import { TestClock } from "effect/testing";
import { dailyUsageReport } from "./reporting.ts";

// This boundary exercises actual JSON admission, DateTime calendar rules, and injectable time.
const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const timestamp = Schema.decodeSync(Schema.DateTimeUtcFromString);

describe("Daily usage: calendar windows and UTC instants", () => {
  // Independently worked UTC boundaries, not expectations computed with the calendar implementation.
  for (const example of [
    {
      day: "2026-03-08",
      zone: "America/New_York",
      acceptedZoneNames: ["America/New_York"],
      start: "2026-03-08T05:00:00.000Z",
      end: "2026-03-09T04:00:00.000Z",
      hours: 23,
    },
    {
      day: "2026-11-01",
      zone: "America/New_York",
      acceptedZoneNames: ["America/New_York"],
      start: "2026-11-01T04:00:00.000Z",
      end: "2026-11-02T05:00:00.000Z",
      hours: 25,
    },
    {
      day: "2026-10-21",
      zone: "Asia/Kolkata",
      acceptedZoneNames: ["Asia/Kolkata", "Asia/Calcutta"],
      start: "2026-10-20T18:30:00.000Z",
      end: "2026-10-21T18:30:00.000Z",
      hours: 24,
    },
  ]) {
    it.effect(`D01 ${example.zone} ${example.day} spans ${example.hours} hours`, () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(DateTime.toEpochMillis(timestamp(`${example.day}T12:00:00Z`)));

        const report = yield* dailyUsageReport(
          json({
            timeZone: example.zone,
            events: [
              { occurredAt: example.start, units: 7 },
              { occurredAt: `${example.day}T12:00:00Z`, units: 11 },
              { occurredAt: example.end, units: 100 },
              { occurredAt: "2026-01-01T00:00:00Z", units: 100 },
            ],
          }),
        );

        assert(example.acceptedZoneNames.includes(report.timeZone));
        assert.deepEqual(Struct.omit(report, ["timeZone"]), {
          day: example.day,
          startsAt: example.start,
          endsAt: example.end,
          observedAt: `${example.day}T12:00:00.000Z`,
          eventCount: 2,
          totalUnits: 18,
        });
      }),
    );
  }

  it.effect("D02 local midnight moves an event into exactly one adjacent daily report", () =>
    Effect.gen(function* () {
      const input = json({
        timeZone: "Asia/Kolkata",
        events: [{ occurredAt: "2026-10-21T00:00:00+05:30", units: 9 }],
      });

      yield* TestClock.setTime(DateTime.toEpochMillis(timestamp("2026-10-20T18:29:59.999Z")));

      const before = yield* dailyUsageReport(input);

      yield* TestClock.adjust("1 millis");

      const after = yield* dailyUsageReport(input);

      assert.equal(before.day, "2026-10-20");
      assert.equal(before.totalUnits, 0);
      assert.equal(after.day, "2026-10-21");
      assert.equal(after.totalUnits, 9);
      assert.equal(before.endsAt, after.startsAt);
    }),
  );

  it.effect("D03 invalid wire data fails admission instead of silently dropping events", () =>
    Effect.gen(function* () {
      for (const input of [
        "{",
        json({ timeZone: "Not/A_Zone", events: [] }),
        json({ timeZone: "UTC", events: [{ occurredAt: "not-a-date", units: 1 }] }),
        json({ timeZone: "UTC", events: [{ occurredAt: "2026-01-01T00:00:00Z", units: -1 }] }),
        json({ timeZone: "UTC", events: [], extra: true }),
      ]) {
        assert(Result.isFailure(yield* Effect.result(dailyUsageReport(input))));
      }
    }),
  );

  it.effect("D04 bounded admission permits the largest exact usage total", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(DateTime.toEpochMillis(timestamp("2026-10-21T12:00:00Z")));

      const event = { occurredAt: "2026-10-21T12:00:00Z", units: 1_000_000 };
      const events = Array.from({ length: 1000 }, () => event);

      const report = yield* dailyUsageReport(json({ timeZone: "UTC", events }));

      assert.equal(report.totalUnits, 1_000_000_000);
      assert.equal(report.eventCount, 1000);
      assert(
        Result.isFailure(
          yield* Effect.result(
            dailyUsageReport(json({ timeZone: "UTC", events: [...events, event] })),
          ),
        ),
      );
      assert(
        Result.isFailure(
          yield* Effect.result(
            dailyUsageReport(json({ timeZone: "UTC", events: [{ ...event, units: 1_000_001 }] })),
          ),
        ),
      );
    }),
  );
});
