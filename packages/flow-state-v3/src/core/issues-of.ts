import { Option } from "effect";
import { Alarm, alarmKey } from "./alarms.ts";
import { Placement } from "./entry-view.ts";
import type { Values } from "./compiled.ts";
import { rowsOf } from "./ledger.ts";
import { scheduleIssues } from "./schedule-issues.ts";
import { pick, type Machines } from "./tx.ts";
import { type Incarnation, type Issue, IssueSource, type World } from "./world.ts";

// An operation's key text in an input, as its issue names it; empty when it has none.
const keyTextIn = (machines: Machines, machine: string, operation: string, input: Values) =>
  Option.getOrElse(
    Option.flatMap(Option.fromUndefinedOr(machines.get(machine)?.operations.get(operation)), (op) =>
      op.walk.keyText(pick(input, op.keyFields)),
    ),
    () => "",
  );

// An owed row's issue: one per refused row, at its operation and key, gone when the row closes.
const endingIssues = (world: World, machines: Machines, incarnation: Incarnation) =>
  rowsOf(world.owed, incarnation.actor).flatMap((row) =>
    Option.toArray(
      Option.map(
        row.refusal,
        (refusal) =>
          ({
            source: IssueSource.Ending({
              operation: row.operation,
              key: keyTextIn(
                machines,
                row.actor.machine,
                row.operation,
                Option.getOrElse(row.input, () => ({})),
              ),
            }),
            code: refusal.code,
            slot: refusal.slot,
          }) satisfies Issue,
      ),
    ),
  );

// A read's issue: one per slot of the incarnation whose entry's last landed ending is a Defect,
// at its operation and key; gone at the next landed success, a Clear, or when the slot leaves.
const entryIssues = (world: World, machines: Machines, incarnation: Incarnation) =>
  [...(world.slots.get(incarnation.id) ?? [])].flatMap(([operation, slot]) =>
    Option.toArray(
      Option.flatMap(Option.fromUndefinedOr(world.entries.get(slot.entry)), (entry) =>
        Option.map(
          Option.filter(entry.last, (last) => last.reason === "Defect"),
          () =>
            ({
              source: IssueSource.Entry({
                operation,
                key: keyTextIn(machines, incarnation.actor.machine, operation, entry.key),
              }),
              code: "Defect",
              slot: Option.none(),
            }) satisfies Issue,
        ),
      ),
    ),
  );

// A placement's issue: one per placement whose select's last run named no key, at its select's
// slot; gone at its next clean run or when it leaves.
const placementIssues = (world: World, incarnation: Incarnation) =>
  [...(world.placements.get(incarnation.id) ?? [])].flatMap(([operation, placement]) =>
    Option.toArray(
      Option.map(
        Placement.$match(placement, {
          Placed: ({ failed }) => failed,
          Unkeyed: ({ failed }) => Option.some(failed),
          Left: () => Option.none<string>(),
        }),
        (slot) =>
          ({
            source: IssueSource.Placement({ operation }),
            code: "Defect",
            slot: Option.some(slot),
          }) satisfies Issue,
      ),
    ),
  );

// The entries an incarnation holds, by its slots and placements, each with the operation that
// holds it.
const heldBy = (world: World, incarnation: Incarnation) => [
  ...[...(world.slots.get(incarnation.id) ?? [])].map(([operation, s]) => [operation, s.entry]),
  ...[...(world.placements.get(incarnation.id) ?? [])].flatMap(([operation, p]) =>
    Placement.$is("Placed")(p) ? [[operation, p.entry] as const] : [],
  ),
];

// A released call's issue: one per key the incarnation holds whose released call's alarm was
// taken while the call runs on, past the disposal bound; gone when the last such call ends.
const callIssues = (world: World, machines: Machines, incarnation: Incarnation) => {
  const overdue = new Set(
    [...world.releasing]
      .filter(([call]) => !world.alarms.has(alarmKey(Alarm.Release({ call }))))
      .map(([, releasing]) => releasing.entry),
  );

  return heldBy(world, incarnation).flatMap(([operation, entry]) =>
    Option.toArray(
      Option.map(
        Option.filter(Option.fromUndefinedOr(world.entries.get(entry)), () => overdue.has(entry)),
        (e) =>
          ({
            source: IssueSource.Call({
              operation,
              key: keyTextIn(machines, incarnation.actor.machine, operation, e.key),
            }),
            code: "ReleaseOverdue",
            slot: Option.none(),
          }) satisfies Issue,
      ),
    ),
  );
};

/**
 * Every open issue of a live incarnation, each read from the state that holds its cause and
 * stored nowhere but its own source's: the stored ones (events, context reads, reactions), each
 * schedule's, read from its timers, each refused owed ending's, read from its row, each read
 * slot's whose entry last landed a Defect, each placement's whose select failed, and each held
 * key's with a released call past the disposal bound.
 */
export const issuesOf = (world: World, machines: Machines, incarnation: Incarnation) => [
  ...incarnation.issues,
  ...[...incarnation.schedules].flatMap(([name, scheduled]) => scheduleIssues(name, scheduled)),
  ...endingIssues(world, machines, incarnation),
  ...entryIssues(world, machines, incarnation),
  ...placementIssues(world, incarnation),
  ...callIssues(world, machines, incarnation),
];
