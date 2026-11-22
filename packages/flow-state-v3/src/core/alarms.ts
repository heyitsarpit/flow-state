import { Data, Option } from "effect";
import type { ActorId, ArmingId, CallId, IncarnationId, TicketId } from "./world.ts";

/**
 * What a host alarm stands for: one owner fact with a deadline, at most one alarm per fact.
 *
 * **Details**
 *
 * - `Bound`: the Runtime's disposal is in progress; at its deadline the bound passes.
 * - `Silent`: a storage ticket is awaited; at its deadline the silence is reported.
 * - `Release`: a call is releasing its holders; at its deadline it is released.
 * - `Collect`: an entry is idle and unheld; at its deadline it is collected.
 * - `Grace`: an actor is free (unused, no lane in flight, no mail); at its deadline it ends.
 * - `Schedule`: a due run of an awake scope; at its deadline its firing is queued.
 */
export type Alarm = Data.TaggedEnum<{
  Bound: {};
  Silent: { ticket: TicketId };
  Release: { call: CallId };
  Collect: { entry: string };
  Grace: { actor: ActorId; incarnation: IncarnationId };
  Schedule: {
    actor: ActorId;
    incarnation: IncarnationId;
    schedule: string;
    track: string;
    arming: ArmingId;
  };
}>;

/**
 * Constructors and matchers for {@link Alarm}.
 */
export const Alarm = Data.taggedEnum<Alarm>();

/**
 * An alarm with its deadline.
 */
export type Alarmed = { readonly alarm: Alarm; readonly at: number };

/**
 * The owner fact an alarm stands for, as text: the key it is kept under, so a fact has one alarm.
 */
export const alarmKey = (alarm: Alarm) =>
  Alarm.$match(alarm, {
    Bound: () => "bound",
    Silent: ({ ticket }) => `silent ${ticket}`,
    Release: ({ call }) => `release ${call}`,
    Collect: ({ entry }) => `collect ${entry}`,
    Grace: ({ incarnation }) => `grace ${incarnation}`,
    Schedule: ({ incarnation, arming }) => `schedule ${incarnation} ${String(arming)}`,
  });

// The order of the kinds due at one instant: endings and releases settle before a firing reads
// the lanes.
const KIND_ORDER = {
  Bound: 0,
  Silent: 1,
  Release: 2,
  Collect: 3,
  Grace: 4,
  Schedule: 5,
} as const satisfies Record<Alarm["_tag"], number>;

/**
 * Orders alarms due together: by deadline, then kind, then `within` for two of one kind (a
 * schedule's due order; the order they were set otherwise, which a stable sort keeps).
 */
export const byDeadline = (within: (a: Alarm, b: Alarm) => number) => (a: Alarmed, b: Alarmed) =>
  a.at - b.at ||
  KIND_ORDER[a.alarm._tag] - KIND_ORDER[b.alarm._tag] ||
  (a.alarm._tag === b.alarm._tag ? within(a.alarm, b.alarm) : 0);

/**
 * The earliest deadline among the alarms, if any: when the host's one wake is owed.
 */
export const earliest = (alarms: ReadonlyMap<string, Alarmed>) => {
  let first: Alarmed | undefined;

  for (const alarmed of alarms.values())
    if (first === undefined || alarmed.at < first.at) first = alarmed;

  return Option.map(Option.fromUndefinedOr(first), (a) => a.at);
};
