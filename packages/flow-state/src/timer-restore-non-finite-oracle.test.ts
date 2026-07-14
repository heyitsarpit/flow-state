import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { test } from "./testing.js";
import { createFocusedRuntimeWithTestClock } from "./testing/fixtures/focused-test-runtime.js";

const timerId = "timer-restore.non-finite.after";

const machine = flow.machine<{}, never, "waiting" | "done">({
  id: "timer-restore.non-finite.machine",
  initial: "waiting",
  context: () => ({}),
  states: {
    waiting: {
      after: flow.after({
        id: timerId,
        delay: "1 second",
        target: "done",
      }),
    },
    done: {},
  },
});

const hostileTimingCases = [
  {
    name: "snapshot-started-at",
    timerStartedAt: Number.NaN,
    timerDueAt: 1_000,
    receiptStartedAt: Number.NaN,
    receiptDueAt: 1_000,
    scheduledMillis: 1_000,
    reason: "scheduled-timer-non-finite-timing",
  },
  {
    name: "snapshot-due-at",
    timerStartedAt: 0,
    timerDueAt: Number.POSITIVE_INFINITY,
    receiptStartedAt: 0,
    receiptDueAt: Number.POSITIVE_INFINITY,
    scheduledMillis: Number.POSITIVE_INFINITY,
    reason: "scheduled-timer-non-finite-timing",
  },
  {
    name: "receipt-started-at",
    timerStartedAt: 0,
    timerDueAt: 1_000,
    receiptStartedAt: Number.NEGATIVE_INFINITY,
    receiptDueAt: 1_000,
    scheduledMillis: 1_000,
    reason: "scheduled-timer-start-receipt-non-finite-timing",
  },
  {
    name: "receipt-due-at",
    timerStartedAt: 0,
    timerDueAt: 1_000,
    receiptStartedAt: 0,
    receiptDueAt: Number.NaN,
    scheduledMillis: 1_000,
    reason: "scheduled-timer-start-receipt-non-finite-timing",
  },
  {
    name: "receipt-scheduled-millis",
    timerStartedAt: 0,
    timerDueAt: 1_000,
    receiptStartedAt: 0,
    receiptDueAt: 1_000,
    scheduledMillis: Number.POSITIVE_INFINITY,
    reason: "scheduled-timer-start-receipt-non-finite-timing",
  },
] as const;

type HostileTimingCase = (typeof hostileTimingCases)[number];

function restoredSnapshot(actorId: string, timing: HostileTimingCase) {
  return Object.freeze({
    ...machine.getInitialSnapshot(),
    timers: {
      [timerId]: {
        id: timerId,
        status: "scheduled" as const,
        generation: 2,
        parentState: "waiting",
        startedAt: timing.timerStartedAt,
        dueAt: timing.timerDueAt,
      },
    },
    receipts: [
      { type: "actor:start", id: actorId },
      {
        type: "timer:start",
        id: timerId,
        generation: 2,
        parentState: "waiting",
        startedAt: timing.receiptStartedAt,
        dueAt: timing.receiptDueAt,
        scheduledMillis: timing.scheduledMillis,
        restored: false,
      },
    ],
  });
}

function captureFailure(operation: () => void): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  return undefined;
}

function expectRejectedTiming(failure: unknown, timing: HostileTimingCase): void {
  expect(failure).toMatchObject({
    code: "FLOW-TIMER-001",
    debug: expect.objectContaining({ reason: timing.reason }),
  });
}

describe("non-finite timer restore oracle", () => {
  it("rejects hostile timing facts before production actor registration", async () => {
    const runtime = createFocusedRuntimeWithTestClock(machine, "TimerRestoreNonFinite");

    try {
      for (const timing of hostileTimingCases) {
        const actorId = `timer-restore.runtime.${timing.name}`;
        const failure = captureFailure(() =>
          runtime.createActor(machine, {
            id: actorId,
            snapshot: restoredSnapshot(actorId, timing),
          }),
        );

        expectRejectedTiming(failure, timing);
        expect(runtime.orchestrators.get(actorId)).toBe(null);
      }
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects the same hostile timing facts through Flow Test", () => {
    for (const timing of hostileTimingCases) {
      const actorId = `timer-restore.flow-test.${timing.name}`;
      const failure = captureFailure(() =>
        test.rehydrate(machine, {
          id: actorId,
          snapshot: restoredSnapshot(actorId, timing),
        }),
      );

      expectRejectedTiming(failure, timing);
    }
  });
});
