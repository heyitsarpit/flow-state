import { Equal, Option } from "effect";
import { Alarm, type Alarmed, alarmKey, earliest } from "./alarms.ts";
import { Life } from "./life.ts";
import { alarmOf, dueRunsOf } from "./schedule-plan.ts";
import { isInFlight } from "./tx.ts";
import { actorKey, type Incarnation, type World } from "./world.ts";

/**
 * The alarms a world owes, by key, from its owner facts: a `Schedule` alarm per due run of an awake
 * actor (used, the Runtime open), at its deadline; a `Grace` per free actor (live, unused, no lane
 * in flight, no mail); a `Bound` while the Runtime disposes.
 */
const owed = (world: World) => {
  const open = Life.$is("Open")(world.life);

  const owedBy = (incarnation: Incarnation) => {
    const key = actorKey(incarnation.actor);
    const used = (world.uses.get(key) ?? []).length > 0;

    const inFlight = [...(world.lanesOfActor.get(key) ?? [])].some((id) =>
      Option.exists(Option.fromUndefinedOr(world.lanes.get(id)), isInFlight),
    );

    const schedules = open && used ? dueRunsOf(incarnation) : [];
    const free = open && !used && !inFlight && !world.mail.has(key);
    const grace = Alarm.Grace({ actor: incarnation.actor, incarnation: incarnation.id });

    const owes = schedules.map((due) => [alarmKey(alarmOf(due)), Option.some(due.dueAt)] as const);

    return free ? [...owes, [alarmKey(grace), Option.none<number>()] as const] : owes;
  };

  const bound = Life.$is("Disposing")(world.life)
    ? [[alarmKey(Alarm.Bound()), Option.none<number>()] as const]
    : [];

  return new Map([...[...world.incarnations.values()].flatMap(owedBy), ...bound]);
};

// Whether a held alarm stands for a fact the world still owes it for, by `owed`. A silence is not
// judged: its owner fact is the store's unanswered batch, which the World does not keep.
const ownedBy =
  (wanted: ReadonlyMap<string, Option.Option<number>>) =>
  (key: string, { alarm, at }: Alarmed) =>
    Alarm.$match(alarm, {
      Silent: () => true,
      Bound: () => wanted.has(key),
      Release: () => false,
      Collect: () => false,
      Grace: () => wanted.has(key),
      Schedule: () =>
        Option.exists(Option.flatten(Option.fromUndefinedOr(wanted.get(key))), (t) => t === at),
    });

/**
 * The alarms' match: the alarms a world holds that no owner fact owes, and the owner
 * facts with no alarm, each named by its key; none when the alarms match.
 */
export const alarmDrift = (world: World) => {
  const wanted = owed(world);
  const owns = ownedBy(wanted);

  // The host holds one wake exactly while an alarm is due, at the earliest deadline.
  const wake = earliest(world.alarms);

  const held = Equal.equals(wake, world.wake)
    ? []
    : [`the host's wake is not at the earliest alarm`];

  const orphans = [...world.alarms].flatMap(([key, alarmed]) =>
    owns(key, alarmed) ? [] : [`${key} has no owner fact`],
  );

  const missing = [...wanted.keys()].flatMap((key) =>
    world.alarms.has(key) ? [] : [`${key} has no alarm`],
  );

  return [...held, ...orphans, ...missing];
};
