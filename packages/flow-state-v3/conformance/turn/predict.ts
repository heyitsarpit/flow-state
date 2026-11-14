import { Option } from "effect";
import { sameJson } from "../port.ts";
import type { Folded, Folds, Labels } from "../fixtures/folds.ts";
import { type Decide, type Machines, possible, type Route } from "../fixtures/handlers.ts";
import type { ActorRef } from "../port.ts";
import { type Actor, answerOf, creditLabels, keyOf, type State, Undecided } from "./anchor.ts";

/**
 * The labels of the fact a turn runs on (the expect half of selection, Conformance R20): a driven
 * event's payload, or the answer the suite gave the call a delivered ending came from; none
 * otherwise.
 */
export const labelsFor = (
  state: State,
  now: Actor,
  credit: string,
  driven: boolean,
  delivered: Option.Option<{ readonly operation: string; readonly attempt: Option.Option<string> }>,
) => {
  if (driven) return creditLabels(now.driven, credit);

  const none: Labels = {};

  return Option.match(delivered, {
    onNone: () => none,
    onSome: (d) => answerOf(state, d.operation, d.attempt),
  });
};

/**
 * The guards a fixture's folds compute for this turn ({@link Decide}): none while the actor's
 * folded fields are unknown.
 */
// RETURN_TYPE: the Decide contract selection's walk takes.
export const decideFor =
  (folds: Folds, fields: Option.Option<Folded>, labels: Labels): Decide =>
  (at) =>
    Option.flatMap(fields, (known) =>
      Option.flatMap(Option.fromUndefinedOr(folds.guards[at]), (guard) => guard(labels, known)),
    );

/**
 * The folded fields after the alternative at `at` ran: its updates applied to the fields before.
 */
export const foldedAfter = (
  folds: Folds,
  fields: Option.Option<Folded>,
  at: Option.Option<string>,
  labels: Labels,
) =>
  Option.match(at, {
    onNone: () => fields,
    onSome: (place) =>
      Option.map(fields, (before) => {
        const update = folds.updates[place];

        return update === undefined ? before : { ...before, ...update(labels, before) };
      }),
  });

/**
 * Whether a turn surely changes its actor's record from its value before the turn (toward
 * WriteAhead's Dirty; `Model`'s Gotchas say where the two part): it moves the leaf, or its update
 * changes a folded field. An
 * update that changes no folded field, or runs while the fields are unknown, may change nothing
 * (none); a turn with neither changes nothing.
 */
export const changeOf = (
  moves: boolean,
  updates: boolean,
  before: Option.Option<Folded>,
  after: Option.Option<Folded>,
) => {
  if (moves) return Option.some(true);

  if (!updates) return Option.some(false);

  const differs = Option.exists(Option.zipWith(before, after, sameFolded), (same) => !same);

  return differs ? Option.some(true) : Option.none<boolean>();
};

/**
 * The opaque guards judging one turn left to the runtime's word ({@link Undecided}): those its
 * folds could not compute on the turn's route, lane guards (which the lane oracles judge)
 * included.
 */
export const undecidedGuards = (
  machines: Machines,
  turn: { readonly actor: ActorRef; readonly event: string },
  from: string,
  route: Route,
  decide: Decide,
) => {
  const handlers = machines[turn.actor.machine];

  return handlers === undefined
    ? []
    : possible(handlers, from, turn.event, route, decide).undecided.map((at) =>
        Undecided.Guard({ actor: keyOf(turn.actor), at }),
      );
};

const sameFolded = (a: Folded, b: Folded) =>
  Object.keys({ ...a, ...b }).every((k) => sameJson(a[k] ?? null, b[k] ?? null));

/**
 * Each operation's key the fixture's folds compute for this turn, from its labels, the fields
 * after it and the alternative the suite judged ran; none while the fields are unknown.
 */
export const keysFor = (
  folds: Folds,
  fields: Option.Option<Folded>,
  labels: Labels,
  at: Option.Option<string>,
) =>
  Option.match(fields, {
    onNone: () => ({}),
    onSome: (known) =>
      Object.fromEntries(
        Object.entries(folds.keys).flatMap(([operation, key]) =>
          Option.toArray(key(labels, known, at)).map((value) => [operation, value] as const),
        ),
      ),
  });
