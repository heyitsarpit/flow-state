import { Predicate } from "effect";

// FLOW_STATE_ALLOW_UNKNOWN: a snapshot's schedules in either published shape, read for comparison.
const schedulesOf = (snapshot: unknown) =>
  Predicate.hasProperty(snapshot, "schedules") ? snapshot.schedules : undefined;

/**
 * A snapshot's armed schedules as a record by schedule name (Machines O8), read from the record
 * the snapshot publishes or, until it publishes one, from its keyed list of `{ key, dueAt }` by
 * name, so a schedule check fails for its own rule and not for the snapshot's shape.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a snapshot of any definition, or none.
export const timersOf = (snapshot: unknown) => {
  const schedules = schedulesOf(snapshot);

  return Array.isArray(schedules)
    ? Object.fromEntries(
        schedules.flatMap((entry: unknown) =>
          Predicate.hasProperty(entry, "key") && Predicate.hasProperty(entry, "dueAt")
            ? [[String(entry.key), { dueAt: entry.dueAt }]]
            : [],
        ),
      )
    : schedules;
};

/**
 * The names of a snapshot's armed schedules.
 */
// FLOW_STATE_ALLOW_UNKNOWN: as timersOf.
export const timerNames = (snapshot: unknown) => {
  const timers = timersOf(snapshot);

  return Predicate.isObject(timers) ? Object.keys(timers) : [];
};

/**
 * How many of a snapshot's timers, keyed ones each counted, are held with exactly the given
 * reasons in `pausedBy`.
 */
// FLOW_STATE_ALLOW_UNKNOWN: as timersOf.
export const heldBy = (snapshot: unknown, reasons: ReadonlyArray<string>) => {
  const timers = timersOf(snapshot);

  const entries: ReadonlyArray<unknown> = Predicate.isObject(timers)
    ? Object.values(timers).flatMap((t: unknown) =>
        Array.isArray(t) ? Array.from<unknown>(t) : [t],
      )
    : [];

  const pausedBy = (t: unknown) =>
    Predicate.hasProperty(t, "pausedBy") && Array.isArray(t.pausedBy)
      ? Array.from<unknown>(t.pausedBy)
      : [];

  return entries.filter(
    (t) => pausedBy(t).length === reasons.length && reasons.every((r, n) => pausedBy(t)[n] === r),
  ).length;
};
