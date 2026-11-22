import { Option, Result, Schema } from "effect";
import type { SavedTimer } from "./vocabulary.ts";

// The schedule part of an actor record's step from format 5: one list of saved timers by name,
// read as format 6's timers.

// Format 5: each saved timer by name, a keyed one's key, while armed its arming time, its firings
// since and its `dueAt` or its `left`, and the pause reasons it last read true.
export const SavedTimerFive = Schema.Struct({
  name: Schema.String,
  // FLOW_STATE_ALLOW_UNKNOWN: a key's values are the application's; the key codec reads them at the wake.
  key: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  armedAt: Schema.optionalKey(Schema.Number),
  attempt: Schema.optionalKey(Schema.Number),
  dueAt: Schema.optionalKey(Schema.Number),
  left: Schema.optionalKey(Schema.Number),
  pausedBy: Schema.optionalKey(Schema.Array(Schema.String)),
});

// A format-5 timer's arming: `left` held, `dueAt` due, neither idle.
// RETURN_TYPE: format 6's arming union, whichever branch builds it.
const armingFromFive = (
  timer: typeof SavedTimerFive.Type,
  armedAt: number,
  attempt: number,
): SavedTimer["arming"] => {
  if (timer.left !== undefined) return { _tag: "Held", armedAt, attempt, left: timer.left };

  if (timer.dueAt !== undefined) return { _tag: "Due", armedAt, attempt, dueAt: timer.dueAt };

  return { _tag: "Idle" };
};

// A format-5 saved timer as a timer of format 6.
// RETURN_TYPE: format 6's saved timer, read by its Schema.
export const timerFromFive = (timer: typeof SavedTimerFive.Type): SavedTimer => {
  const armedAt = timer.armedAt ?? timer.dueAt ?? 0;
  const attempt = timer.attempt ?? 0;

  const arming = armingFromFive(timer, armedAt, attempt);

  const key = Option.flatMap(Option.fromUndefinedOr(timer.key), (k) =>
    Result.getSuccess(Schema.decodeUnknownResult(Schema.Json)(k)),
  );

  return {
    ...Option.match(key, { onNone: () => ({}), onSome: (k) => ({ key: k }) }),
    ...Option.match(Option.fromUndefinedOr(timer.pausedBy), {
      onNone: () => ({}),
      onSome: (reasons) => ({ reasons }),
    }),
    arming,
  };
};
