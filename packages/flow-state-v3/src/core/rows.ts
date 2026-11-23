import { Data, Option, Predicate } from "effect";
import type { Values } from "./compiled.ts";
import { type Lane, Phase } from "./world.ts";

// What every read row carries: its entry's key, the data readers see, and whether a live
// optimistic value is applied to it.
type ReadSeen = {
  readonly key: Values;
  // FLOW_STATE_ALLOW_UNKNOWN: a read's data is the lookup's own value; none is undefined.
  readonly data: unknown;
  readonly predicted: boolean;
};

/**
 * A read's row as a snapshot shows it, for a slot's or a placement's entry: `Pending` with no
 * confirmed data, `Ready` with data and no request, `Refreshing` with data and a request, or its
 * last landed ending that was not data (`Failure` with the lookup's typed error, `Defect`,
 * `Interrupted`), which keeps the data it had.
 *
 * **Details**
 *
 * `data` is the confirmed data with each live optimistic value applied in start order, undefined
 * while there is none; `predicted` is true while any optimistic value is live.
 */
export type ReadRow = Data.TaggedEnum<{
  Pending: ReadSeen;
  Ready: ReadSeen;
  Refreshing: ReadSeen;
  // FLOW_STATE_ALLOW_UNKNOWN: a read's error is the lookup's own.
  Failure: ReadSeen & { readonly error: unknown };
  Defect: ReadSeen;
  Interrupted: ReadSeen;
}>;

/**
 * Constructors and matchers for {@link ReadRow}.
 */
export const ReadRow = Data.taggedEnum<ReadRow>();

/**
 * Any row a snapshot shows: a write lane's or a read's.
 */
export type AnyRow = Row | ReadRow;

/**
 * Whether a row is a write lane's: a read's row is tagged, a write's is not.
 */
// RETURN_TYPE: a type guard, which inference does not write.
export const isWriteRow = (row: AnyRow): row is Row => !Predicate.hasProperty(row, "_tag");

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
