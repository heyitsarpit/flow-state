import { Option } from "effect";
import { rowsOf } from "./ledger.ts";
import { scheduleIssues } from "./schedule-issues.ts";
import { pick, type Machines } from "./tx.ts";
import { type Incarnation, type Issue, IssueSource, type World } from "./world.ts";

// An owed row's issue: one per refused row, at its operation and key, gone when the row closes.
const endingIssues = (world: World, machines: Machines, incarnation: Incarnation) =>
  rowsOf(world.owed, incarnation.actor).flatMap((row) =>
    Option.toArray(
      Option.map(row.refusal, (refusal) => {
        const operation = machines.get(row.actor.machine)?.operations.get(row.operation);
        const input = Option.getOrElse(row.input, () => ({}));

        const key = Option.getOrElse(
          Option.flatMap(Option.fromUndefinedOr(operation), (op) =>
            op.walk.keyText(pick(input, op.keyFields)),
          ),
          () => "",
        );

        return {
          source: IssueSource.Ending({ operation: row.operation, key }),
          code: refusal.code,
          slot: refusal.slot,
        } satisfies Issue;
      }),
    ),
  );

/**
 * Every open issue of a live incarnation, each read from the state that holds its cause and
 * stored nowhere but its own source's: the stored ones (events, context reads, reactions), each
 * schedule's, read from its timers, then each refused owed ending's, read from its row.
 */
export const issuesOf = (world: World, machines: Machines, incarnation: Incarnation) => [
  ...incarnation.issues,
  ...[...incarnation.schedules].flatMap(([name, scheduled]) => scheduleIssues(name, scheduled)),
  ...endingIssues(world, machines, incarnation),
];
