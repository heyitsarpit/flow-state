import { Data, Option } from "effect";
import type { Owed } from "./ledger.ts";
import type { Firing } from "./schedule-decision.ts";
import { type ActivationId, IssueSource, type LaneId, type StoredSource } from "./world.ts";

/**
 * What a turn answers: a public or internal event, a schedule's firing, or an owed ending's mapped
 * event, with the activation it is late for when that activation has been left. Only an ending's
 * turn acts on its own lane.
 */
export type Trigger = Data.TaggedEnum<{
  Event: { tag: string; resendable: boolean };
  Firing: { firing: Firing };
  Ending: { row: Owed; late: Option.Option<ActivationId> };
}>;

/**
 * Constructors and matchers for {@link Trigger}.
 */
export const Trigger = Data.taggedEnum<Trigger>();

/**
 * The source an ending's turn raises or clears its issue on: its operation.
 */
// RETURN_TYPE: a stored source, never a schedule's.
export const endingSource = (row: Owed): StoredSource =>
  IssueSource.Operation({ name: row.operation });

/**
 * What a turn's trigger decides: whether its source can send it again, the activation it is late
 * for, the lane it acts on as owner, the row it hears, and the source whose issue it raises or
 * clears; a firing's issues are its schedule's decision, so it names its firing instead.
 */
export const routeOf = (trigger: Trigger) =>
  Trigger.$match(trigger, {
    Event: ({ tag, resendable }) => ({
      unrepeatable: !resendable,
      late: Option.none<ActivationId>(),
      own: Option.none<LaneId>(),
      ending: Option.none<Owed>(),
      source: Option.some<StoredSource>(IssueSource.Event({ tag })),
      firing: Option.none<Firing>(),
    }),
    Firing: ({ firing }) => ({
      unrepeatable: false,
      late: Option.none<ActivationId>(),
      own: Option.none<LaneId>(),
      ending: Option.none<Owed>(),
      source: Option.none<StoredSource>(),
      firing: Option.some(firing),
    }),
    Ending: ({ row, late }) => ({
      unrepeatable: true,
      late,
      own: row.lane,
      ending: Option.some(row),
      source: Option.some(endingSource(row)),
      firing: Option.none<Firing>(),
    }),
  });
