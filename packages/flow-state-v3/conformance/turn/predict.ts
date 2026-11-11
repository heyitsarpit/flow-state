import { Option } from "effect";
import type { Folded, Folds, Labels } from "../fixtures/folds.ts";
import type { Decide } from "../fixtures/handlers.ts";
import { type Actor, answerOf, creditLabels, type State } from "./anchor.ts";

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
 * Each operation's key the fixture's folds compute for this turn, from its labels and the fields
 * after it; none while the fields are unknown.
 */
export const keysFor = (folds: Folds, fields: Option.Option<Folded>, labels: Labels) =>
  Option.match(fields, {
    onNone: () => ({}),
    onSome: (known) =>
      Object.fromEntries(
        Object.entries(folds.keys).map(([operation, key]) => [operation, key(labels, known)]),
      ),
  });
