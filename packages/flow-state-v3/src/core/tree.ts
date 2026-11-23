import { Option } from "effect";
import { InternalsId, type Compiled, Source, Target, type Values } from "./compiled.ts";

/**
 * Whether `state` is `path` or below it.
 */
export const atOrBelow = (state: string, path: string) =>
  state === path || state.startsWith(`${path}.`);

// The chain and the default leaf of a state, as its machine computed them once.
const chainIn = (compiled: Compiled, path: string) => compiled.states.get(path)?.chain ?? [];

const leafIn = (compiled: Compiled, path: string) => compiled.states.get(path)?.leaf ?? path;

/**
 * One transition's change of state: the states it exits, deepest first, the states it enters,
 * outermost first, and the leaf it reaches.
 */
export type Move = {
  readonly exits: ReadonlyArray<string>;
  readonly enters: ReadonlyArray<string>;
  readonly leaf: string;
  readonly target: string;
};

// The nearest proper ancestor of `target` that contains `handler`, as a depth: 0 is the root.
const boundaryDepth = (compiled: Compiled, handler: string, target: string) => {
  if (handler !== "" && target.startsWith(`${handler}.`)) return chainIn(compiled, handler).length;

  const above = chainIn(compiled, target).slice(0, -1);
  let depth = 0;

  for (const [i, path] of above.entries())
    if (handler !== "" && atOrBelow(handler, path)) depth = i + 1;

  return depth;
};

/**
 * The move of a handler at `handler` (`""` for the root) to `target`, from the active leaf
 * `leaf`, with the last active child of each compound in `history`.
 *
 * **Details**
 *
 * The unchanged boundary is the handler's state when the target lies strictly below it, otherwise
 * the target's nearest proper ancestor that contains the handler: so a target naming the handler's
 * own state, or an active ancestor, is entered again. A history target reaches the compound's last
 * active child, through that child's defaults, else the compound's default leaf.
 */
export const moveOf = (
  compiled: Compiled,
  leaf: string,
  handler: string,
  target: Target,
  history: ReadonlyMap<string, string>,
) => {
  const path = target.path;

  const depth = boundaryDepth(compiled, handler, path);
  const exits = chainIn(compiled, leaf).slice(depth).toReversed();

  // A history the move itself records, exiting the target, is the one it enters (as SCXML).
  const recorded = exits.includes(path)
    ? Option.fromUndefinedOr(chainIn(compiled, leaf)[chainIn(compiled, path).length])
    : Option.fromUndefinedOr(history.get(path));

  const reached = Target.$match(target, {
    State: () => leafIn(compiled, path),
    History: () =>
      leafIn(
        compiled,
        Option.getOrElse(recorded, () => path),
      ),
  });

  const move: Move = {
    exits,
    enters: chainIn(compiled, reached).slice(depth),
    leaf: reached,
    target: path,
  };

  return move;
};

/**
 * The history a move leaves: each exited compound remembers its child that was active.
 */
export const historyAfter = (
  compiled: Compiled,
  history: ReadonlyMap<string, string>,
  leaf: string,
  move: Move,
) => {
  const next = new Map(history);

  const chain = chainIn(compiled, leaf);

  for (const path of move.exits) {
    const child = chain[chainIn(compiled, path).length];

    if (child !== undefined) next.set(path, child);
  }

  return next;
};

/**
 * A new incarnation's memory from its input, which its boundary already checked: each input field
 * copied, each constant start, and each optional key's default.
 *
 * **Details**
 *
 * Pure and deterministic: no decode transforms the input, and no clock or randomness is read. An
 * optional key the input does not give stays absent unless its Schema has a constructor default.
 */
// RETURN_TYPE: memory is the Values every incarnation holds, not the entries' literal shape.
export const create = (compiled: Compiled, input: Values): Values =>
  Object.fromEntries(
    compiled[InternalsId].fields.flatMap((field) =>
      Option.toArray(
        Option.map(
          Source.$match(field.source, {
            Input: () => Option.some(input[field.name]),
            Constant: ({ value }) => Option.some(value),
            Optional: () => field.fallback,
          }),
          (value) => [field.name, value] as const,
        ),
      ),
    ),
  );
