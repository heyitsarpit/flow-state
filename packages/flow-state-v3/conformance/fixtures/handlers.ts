import { Option } from "effect";

/**
 * One alternative of a handler, written by hand from the fixture's source.
 *
 * **Details**
 *
 * - `index`: its position as its place names it (`on.Confirmed[2]`), the array position unless
 *   the source sets `index`.
 * - `target`: the leaf it moves to, or `stay` for an alternative with no target or `self`.
 * - `when`: the state tokens in its guard (`guard: [S.LEFT]`): it fails unless the actor is in
 *   one of them. Empty when its guard names none.
 * - `opaque`: its guard has a part the suite does not compute (memory, the event's payload, a
 *   lane read), so it may pass or fail.
 */
export type Alternative<State extends string = string> = {
  readonly index: Option.Option<number>;
  readonly target: State | "stay";
  readonly when: ReadonlyArray<State>;
  readonly opaque: boolean;
};

/**
 * One level's handlers: each event's alternatives in selection order.
 */
export type Level<State extends string = string> = Readonly<
  Record<string, ReadonlyArray<Alternative<State>>>
>;

/**
 * A machine's handler table (Turn R2): its initial leaf, its root's handlers, each leaf's own
 * handlers, and the events its schedules send.
 *
 * **Gotchas**
 *
 * - Flat machines only: every state is a leaf of the root, so selection reads the leaf's level,
 *   then the root's. No fixture has a compound state yet.
 */
export type Handlers<State extends string = string> = {
  readonly initial: State;
  readonly root: Level<State>;
  readonly states: Readonly<Partial<Record<State, Level<State>>>>;
  readonly scheduled: ReadonlyArray<string>;
};

/**
 * An alternative moving to `target`, or staying (`stay`), with no guard.
 */
// RETURN_TYPE: keeps `index` an Option of number and `when` the State list for later spreads.
export const to = <State extends string>(target: State | "stay"): Alternative<State> => ({
  index: Option.none(),
  target,
  when: [],
  opaque: false,
});

/**
 * The same alternative with a guard the suite does not compute.
 */
export const guarded = <State extends string>(alternative: Alternative<State>) => ({
  ...alternative,
  opaque: true,
});

/**
 * The same alternative with state tokens in its guard.
 */
export const inStates = <State extends string>(
  when: ReadonlyArray<State>,
  alternative: Alternative<State>,
) => ({ ...alternative, when });

/**
 * The same alternative at the position its source's `index` gives it.
 */
export const indexed = <State extends string>(index: number, alternative: Alternative<State>) => ({
  ...alternative,
  index: Option.some(index),
});

/**
 * An alternative the turn may have run: its place and the leaf it ends in.
 */
export type Possible = { readonly at: string; readonly to: string };

const walk = (
  levels: ReadonlyArray<{ readonly prefix: string; readonly level: Level }>,
  from: string,
  event: string,
) => {
  const candidates = levels
    .flatMap(({ prefix, level }) =>
      (level[event] ?? []).map((alternative, position) => ({
        alternative,
        at: `${prefix}on.${event}[${Option.getOrElse(alternative.index, () => position)}]`,
      })),
    )
    .filter(({ alternative }) => alternative.when.length === 0 || alternative.when.includes(from));

  const certain = candidates.findIndex(({ alternative }) => !alternative.opaque);
  const taken = certain < 0 ? candidates : candidates.slice(0, certain + 1);

  return {
    alternatives: taken.map(({ alternative, at }) => ({
      at,
      to: alternative.target === "stay" ? from : alternative.target,
    })),
  };
};

/**
 * What Turn R2 and I2 allow for `event` at leaf `from`: the alternatives that may be selected,
 * in order.
 *
 * **Details**
 *
 * The leaf's level is read first, then the root's. An alternative whose state tokens exclude
 * `from` is skipped; the first with no opaque guard is selected for certain and ends the walk;
 * each opaque one before it may be selected. With `mayBeLate`, an ending whose owner may be gone, the walk from
 * the root alone is allowed as well (Turn R19, R20).
 */
export const possible = (handlers: Handlers, from: string, event: string, mayBeLate: boolean) => {
  const leaf = { prefix: `states.${from}.`, level: handlers.states[from] ?? {} };
  const root = { prefix: "", level: handlers.root };
  const onTime = walk([leaf, root], from, event);

  if (!mayBeLate) return onTime;

  const late = walk([root], from, event);

  return {
    alternatives: [
      ...onTime.alternatives,
      ...late.alternatives.filter((a) => !onTime.alternatives.some((b) => b.at === a.at)),
    ],
  };
};

/**
 * The handler tables of a case's fixtures, by machine id.
 */
export type Machines = Readonly<Record<string, Handlers>>;
