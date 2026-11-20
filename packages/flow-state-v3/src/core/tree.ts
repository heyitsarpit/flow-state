import { Option } from "effect";
import { type Compiled, Source, Target, type Values } from "./compiled.ts";

/**
 * The path of every state from the top level down to `leaf`: `ON.PLAYING` gives `ON`, then
 * `ON.PLAYING`.
 */
export const chainOf = (leaf: string) => {
  const segments = leaf.split(".");

  return segments.map((_, i) => segments.slice(0, i + 1).join("."));
};

/**
 * Whether `state` is `path` or below it.
 */
export const atOrBelow = (state: string, path: string) =>
  state === path || state.startsWith(`${path}.`);

/**
 * The leaf a state reaches by its defaults.
 */
export const leafOf = (compiled: Compiled, path: string) => {
  let at = path;

  for (let node = compiled.states.get(at); node !== undefined && Option.isSome(node.default);) {
    at = node.default.value;
    node = compiled.states.get(at);
  }

  return at;
};

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
const boundaryDepth = (handler: string, target: string) => {
  if (handler !== "" && target.startsWith(`${handler}.`)) return chainOf(handler).length;

  const above = chainOf(target).slice(0, -1);
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

  const depth = boundaryDepth(handler, path);
  const exits = chainOf(leaf).slice(depth).toReversed();

  // A history the move itself records, exiting the target, is the one it enters (as SCXML).
  const recorded = exits.includes(path)
    ? Option.fromUndefinedOr(chainOf(leaf)[chainOf(path).length])
    : Option.fromUndefinedOr(history.get(path));

  const reached = Target.$match(target, {
    State: () => leafOf(compiled, path),
    History: () =>
      leafOf(
        compiled,
        Option.getOrElse(recorded, () => path),
      ),
  });

  const move: Move = {
    exits,
    enters: chainOf(reached).slice(depth),
    leaf: reached,
    target: path,
  };

  return move;
};

/**
 * The history a move leaves: each exited compound remembers its child that was active.
 */
export const historyAfter = (history: ReadonlyMap<string, string>, leaf: string, move: Move) => {
  const next = new Map(history);

  const chain = chainOf(leaf);

  for (const path of move.exits) {
    const child = chain[chainOf(path).length];

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
    compiled.fields.flatMap((field) =>
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
