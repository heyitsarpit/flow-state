import { type Lane, Phase } from "./world.ts";

/**
 * A write lane's row as `O.x.get` reads it (Operations O6): whether a send is pending, whether
 * an unknown holds it, whether commits wait behind it, and its re-sends.
 */
export type Row = {
  readonly pending: boolean;
  readonly uncertain: boolean;
  readonly waiting: boolean;
  readonly retryCount: number;
};

/**
 * The row a lane publishes.
 */
// RETURN_TYPE: the row is the public O.x.get shape.
export const rowOf = (lane: Lane): Row => ({
  pending: !Phase.$is("Held")(lane.head.phase),
  uncertain: Phase.$is("Held")(lane.head.phase),
  waiting: false,
  retryCount: lane.head.retryCount,
});
