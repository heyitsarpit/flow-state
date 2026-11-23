import { Option } from "effect";
import { type Lane, Phase } from "./world.ts";

/**
 * A write lane's row as `O.x.get` reads it: whether a send is pending, whether
 * an unknown holds it, whether commits wait behind it, its re-sends, and the last progress its
 * commit reported, present once it reported one.
 */
export type Row = {
  readonly pending: boolean;
  readonly uncertain: boolean;
  readonly waiting: boolean;
  readonly retryCount: number;
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public row: `progress` is absent until the commit reports one
  readonly progress?: Progress;
};

/**
 * A commit's reported progress, as a row shows it.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a progress value has the type its contract's progress Schema decodes.
export type Progress = unknown;

/**
 * The row a lane publishes.
 */
// RETURN_TYPE: the row is the public O.x.get shape.
export const rowOf = (lane: Lane): Row => ({
  pending: !Phase.$is("Held")(lane.head.phase),
  uncertain: Phase.$is("Held")(lane.head.phase),
  waiting: lane.queue.length > 0,
  retryCount: lane.head.retryCount,
  ...Option.match(lane.head.progress, { onNone: () => ({}), onSome: (progress) => ({ progress }) }),
});
