import { Option, Result } from "effect";
import { type Compiled, type Field, Source, Target, type Values } from "./compiled.ts";

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
 * Why creation refused its input: a field the input lacks or does not type-check, or a computed
 * start that threw.
 */
export type Uncreated = { readonly field: string; readonly computed: boolean };

// A start that needs no computing: the input's value, a constant, or an optional key's default.
const startOf = (field: Field, input: Values) =>
  Source.$match(field.source, {
    Input: () =>
      Object.hasOwn(input, field.name) && field.is(input[field.name])
        ? Result.succeed(Option.some(input[field.name]))
        : Result.fail<Uncreated>({ field: field.name, computed: false }),
    Constant: ({ value }) => Result.succeed(Option.some(value)),
    Computed: () => Result.succeed(Option.none()),
    Optional: () => Result.succeed(field.fallback),
  });

const computedRead = (name: string) => () => {
  // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the read is a callback's defect, caught by create as that callback's failure
  throw new Error(`a computed start read the computed field ${name}`);
};

/**
 * A new incarnation's memory from its input: each input field checked by its Schema's type side
 * and copied, then constant starts, then computed starts reading the input and constant fields.
 *
 * **Details**
 *
 * Pure and deterministic: no decode transforms the input, and no clock or randomness is read. An
 * optional key the input does not give stays absent unless its Schema has a constructor default.
 */
export const create = (compiled: Compiled, input: Values) => {
  // FLOW_STATE_ALLOW_UNKNOWN: field values have the definition's types; creation passes them through.
  const known = new Map<string, unknown>();

  for (const field of compiled.fields) {
    const start = startOf(field, input);

    if (Result.isFailure(start)) return Result.fail(start.failure);

    if (Option.isSome(start.success)) known.set(field.name, start.success.value);
  }

  // A computed start reads the input and constant fields only: reading a computed one, spread
  // included, is its defect.
  const read: Values = Object.defineProperties(
    Object.fromEntries(known),
    Object.fromEntries(
      compiled.fields
        .filter((f) => Source.$is("Computed")(f.source))
        .map((f) => [f.name, { get: computedRead(f.name), enumerable: true }]),
    ),
  );

  const memory = new Map(known);

  for (const field of compiled.fields)
    if (Source.$is("Computed")(field.source)) {
      const { compute } = field.source;
      const value = Result.try({ try: () => compute.run(read), catch: () => field.name });

      if (Result.isFailure(value))
        return Result.fail<Uncreated>({ field: field.name, computed: true });
      memory.set(field.name, value.success);
    }

  return Result.succeed<Values>(Object.fromEntries(memory));
};
