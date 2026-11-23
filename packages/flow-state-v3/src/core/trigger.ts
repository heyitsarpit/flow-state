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
 * What a turn's trigger decides: whether its source can send it again, the activation it is late
 * for, the lane it acts on as owner, the row it hears, and the source whose stored issue it raises
 * or clears. A firing's issues are its schedule's decision and an ending's are its row's refusal,
 * so neither names a stored source.
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
      source: Option.none<StoredSource>(),
      firing: Option.none<Firing>(),
    }),
  });
