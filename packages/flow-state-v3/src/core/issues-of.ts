import { Option } from "effect";
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

/**
 * Every open issue of a live incarnation, each read from the state that holds its cause and
 * stored nowhere but its own source's: the stored ones (events, context reads, reactions), each
 * schedule's, read from its timers, each refused owed ending's, read from its row, then each read
 * slot's whose entry last landed a Defect.
 */
export const issuesOf = (world: World, machines: Machines, incarnation: Incarnation) => [
  ...incarnation.issues,
  ...[...incarnation.schedules].flatMap(([name, scheduled]) => scheduleIssues(name, scheduled)),
  ...endingIssues(world, machines, incarnation),
  ...entryIssues(world, machines, incarnation),
];
