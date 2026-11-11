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
 * - `updates`: it has an `updateMemory`, so its turn may publish new memory.
 */
export type Alternative<State extends string = string> = {
  readonly index: Option.Option<number>;
  readonly target: State | "stay";
  readonly when: ReadonlyArray<State>;
  readonly opaque: boolean;
  readonly updates: boolean;
};

/**
 * One level's handlers: each event's alternatives in selection order.
 */
export type Level<State extends string = string> = Readonly<
  Record<string, ReadonlyArray<Alternative<State>>>
>;

/**
 * One schedule a state declares (Turn R14, R15), written by hand from the fixture's source.
 *
 * **Details**
 *
 * - `id`: its name in the state's `schedules`.
 * - `send`: the event it sends.
 * - `delayMs`: its Duration, `None` when a function of memory computes it.
 * - `armOn`: the events that arm or restart it while its state is active; it is armed on entry
 *   too unless `armOn` is written without `"entry"` (`entry: false`).
 */
export type Schedule = {
  readonly id: string;
  readonly send: string;
  readonly delayMs: Option.Option<number>;
  readonly armOn: ReadonlyArray<string>;
  readonly entry: boolean;
};

/**
 * A schedule armed on entry only, sending `send` after `delayMs` (`None`: a function of memory).
 */
// RETURN_TYPE: keeps `delayMs` an Option and `armOn` a list for later spreads.
export const schedule = (
  id: string,
  send: string,
  delayMs: Option.Option<number>,
  armOn: ReadonlyArray<string> = [],
): Schedule => ({ id, send, delayMs, armOn, entry: true });

/**
 * A machine's handler table (Turn R2): its initial leaf, its root's handlers, each leaf's own
 * handlers, and each leaf's schedules.
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
  readonly schedules: Readonly<Partial<Record<State, ReadonlyArray<Schedule>>>>;
};

/**
 * The events a machine's schedules send.
 */
export const scheduledEvents = (handlers: Handlers) =>
  Object.values<ReadonlyArray<Schedule> | undefined>(handlers.schedules).flatMap((list) =>
    (list ?? []).map((s) => s.send),
  );

/**
 * An alternative moving to `target`, or staying (`stay`), with no guard.
 */
// RETURN_TYPE: keeps `index` an Option of number and `when` the State list for later spreads.
export const to = <State extends string>(target: State | "stay"): Alternative<State> => ({
  index: Option.none(),
  target,
  when: [],
  opaque: false,
  updates: false,
});

/**
 * The same alternative with an `updateMemory`.
 */
export const updating = <State extends string>(alternative: Alternative<State>) => ({
  ...alternative,
  updates: true,
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
 * An alternative the turn may have run: its place, the leaf it ends in, whether it names a target
 * (it enters that state, a new Activation, re-entry included), and whether the root holds it.
 */
export type Possible = {
  readonly at: string;
  readonly to: string;
  readonly enters: boolean;
  readonly atRoot: boolean;
};

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
      enters: alternative.target !== "stay",
      atRoot: !at.startsWith("states."),
    })),
    handled: certain >= 0,
  };
};

/**
 * How an event is routed (Turn R20): from the active leaf (`current`), from the owner's nearest
 * surviving strict ancestor, the root here (`late`), or either, when the suite cannot tell.
 */
export type Route = "current" | "late" | "either";

/**
 * What Turn R2, I2 and I26 allow for `event` at leaf `from` on `route`: the alternatives that may
 * be selected, in order, and whether one is selected for certain (`handled`: the event can be
 * neither Unhandled nor Denied).
 *
 * **Details**
 *
 * A current event reads the leaf's level, then the root's; a late one the root's alone. An
 * alternative whose state tokens exclude `from` is skipped; the first with no opaque guard is
 * selected for certain and ends the walk; each opaque one before it may be selected. On `either`,
 * both walks are allowed, and the event is handled for certain only when both are.
 */
export const possible = (handlers: Handlers, from: string, event: string, route: Route) => {
  const leaf = { prefix: `states.${from}.`, level: handlers.states[from] ?? {} };
  const root = { prefix: "", level: handlers.root };
  const current = walk([leaf, root], from, event);
  const late = walk([root], from, event);

  if (route === "current") return current;

  if (route === "late") return late;

  return {
    alternatives: [
      ...current.alternatives,
      ...late.alternatives.filter((a) => !current.alternatives.some((b) => b.at === a.at)),
    ],
    handled: current.handled && late.handled,
  };
};

/**
 * Whether the alternative at `at` (as a turn record names it) has an `updateMemory`; false for a
 * place the table does not hold.
 */
export const updatesAt = (handlers: Handlers, at: string) => {
  const leaf = /^states\.([^.]+)\.on\.([^[]+)\[(\d+)\]$/u.exec(at);
  const root = /^on\.([^[]+)\[(\d+)\]$/u.exec(at);

  const find = (level: Level, event: string, index: number) =>
    (level[event] ?? []).some(
      (a, position) => Option.getOrElse(a.index, () => position) === index && a.updates,
    );

  if (leaf !== null)
    return find(handlers.states[leaf[1] ?? ""] ?? {}, leaf[2] ?? "", Number(leaf[3]));

  return root !== null && find(handlers.root, root[1] ?? "", Number(root[2]));
};

/**
 * The handler tables of a case's fixtures, by machine id.
 */
export type Machines = Readonly<Record<string, Handlers>>;
