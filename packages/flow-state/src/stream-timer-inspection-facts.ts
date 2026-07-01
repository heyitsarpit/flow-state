import type { FlowStreamSnapshot } from "./core/api/types.js";

export type StreamTimerInterruptReason = "state-exit" | "dispose";

type StreamSnapshotLike = Pick<FlowStreamSnapshot, "emitted" | "value">;

export function streamReceiptFacts(
  snapshot: StreamSnapshotLike | undefined,
  restored: boolean,
): Readonly<{
  readonly emitted: number;
  readonly lastValueAvailable: boolean;
  readonly restored: boolean;
}> {
  return Object.freeze({
    emitted: snapshot?.emitted ?? 0,
    lastValueAvailable: snapshot?.value !== undefined,
    restored,
  });
}

export function timerScheduleReceiptFacts(
  startedAt: number,
  dueAt: number,
  restored: boolean,
): Readonly<{
  readonly startedAt: number;
  readonly dueAt: number;
  readonly scheduledMillis: number;
  readonly restored: boolean;
}> {
  return Object.freeze({
    startedAt,
    dueAt,
    scheduledMillis: Math.max(0, dueAt - startedAt),
    restored,
  });
}

export function timerOutcomeReceiptFacts(
  startedAt: number,
  dueAt: number,
  endedAt: number,
  restored: boolean,
): Readonly<{
  readonly startedAt: number;
  readonly dueAt: number;
  readonly endedAt: number;
  readonly scheduledMillis: number;
  readonly elapsedMillis: number;
  readonly restored: boolean;
}> {
  return Object.freeze({
    ...timerScheduleReceiptFacts(startedAt, dueAt, restored),
    endedAt,
    elapsedMillis: Math.max(0, endedAt - startedAt),
  });
}
