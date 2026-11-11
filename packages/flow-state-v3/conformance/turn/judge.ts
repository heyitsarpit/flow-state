import { Option } from "effect";
import {
  type Decide,
  type Handlers,
  type Machines,
  type Possible,
  partsOnly,
  possible,
  type Route,
} from "../fixtures/handlers.ts";
import type { Turn, TurnPart } from "../port.ts";
import { leafOf, type Phase } from "./phases.ts";

type Judged = {
  readonly to: Option.Option<string>;
  readonly found: ReadonlyArray<string>;
  readonly match: Option.Option<Possible>;
  readonly from: string;
};

/**
 * A turn named for a violation: its actor and event.
 */
export const name = (turn: Turn) => `${turn.actor.machine} ${turn.actor.id} ran ${turn.event}`;

/**
 * A late ending's turn that ran an alternative of the leaf, which only a current one may reach
 * (Turn I26). A current ending that skips a passing leaf alternative breaks I2, not I26.
 */
const lateRanLeaf = (
  handlers: Handlers,
  from: string,
  turn: Turn,
  route: Route,
  ran: Option.Option<TurnPart>,
) =>
  Option.filter(
    ran,
    (part) =>
      route === "late" &&
      !possible(handlers, from, turn.event, "late").alternatives.some((a) => a.at === part.at) &&
      possible(handlers, from, turn.event, "current").alternatives.some((a) => a.at === part.at),
  ).pipe(
    Option.map(
      (part) =>
        `Turn I26: ${name(turn)} at ${from} by ${part.at}, routed from the active leaf, but its owner Activation has ended, so it is routed from the root, as late`,
    ),
  );

/**
 * The turn a pending reset runs as, Flow's own (Turn R5): it selects no alternative.
 */
export const PENDING_RESET = "PendingReset";

/**
 * The parts of a turn that are selected alternatives: not the callbacks a trait notified its host
 * with (`traits.<name>.callbacks...`), which run beside them.
 */
export const selectedParts = (turn: Turn) => turn.parts.filter((p) => !p.at.startsWith("traits."));

/**
 * A turn that selects no root alternative and so stays at its leaf: a pending reset, or one whose
 * every selected part is a trait or fragment alternative the table names, where neither the leaf
 * nor the root handles its event.
 */
const noRootAlternative = (
  handlers: Handlers,
  turn: Turn,
  rootAlternatives: number,
  selected: ReadonlyArray<TurnPart>,
) =>
  (selected.length === 0 && turn.event === PENDING_RESET) ||
  (rootAlternatives === 0 && partsOnly(handlers, turn.event, selected));

/**
 * A part-only turn leaves the root's leaf where it was; one that says otherwise breaks Turn I2.
 */
const partLeft = (turn: Turn, from: string) =>
  turn.to === from
    ? []
    : [
        `Turn I2: ${name(turn)} at ${from} in a part alone, which leaves the leaf, but the turn says ${turn.to}`,
      ];

/**
 * Judges one turn's header against the handler table from the leaf the suite carried (or, when it
 * carried none, the leaf the turn reports): the alternative the actor's root ran is one Turn I2 and
 * I26 allow on its route, and the turn ends at that alternative's leaf.
 *
 * **Details**
 *
 * `decide` computes the opaque guards the fixture's folds can (`fixtures/folds.ts`), so a guard the
 * suite computes allows one alternative, not both.
 */
// RETURN_TYPE: each branch builds one judgement; the branches infer different shapes.
export const judgeTurn = (
  machines: Machines,
  phase: Phase,
  turn: Turn,
  route: Route,
  decide: Decide,
): Judged => {
  const handlers = machines[turn.actor.machine];

  if (handlers === undefined)
    return { to: Option.none(), found: [], match: Option.none(), from: turn.from };

  const anchored = leafOf(phase);
  const from = Option.getOrElse(anchored, () => turn.from);

  const wrongFrom = Option.match(anchored, {
    onNone: () => [],
    onSome: (state) =>
      state === turn.from
        ? []
        : [`Turn I2: ${name(turn)} from ${turn.from}, but the actor was at ${state}`],
  });

  const allowed = possible(handlers, from, turn.event, route, decide);
  const selected = selectedParts(turn);
  const ran = selected.find((p) => p.part.length === 0 && p.definition === turn.actor.machine);
  const ats = allowed.alternatives.map((a) => a.at).join(", ");

  if (ran === undefined && noRootAlternative(handlers, turn, allowed.alternatives.length, selected))
    return {
      to: Option.some(from),
      found: [...wrongFrom, ...partLeft(turn, from)],
      match: Option.none(),
      from,
    };

  const misrouted = lateRanLeaf(handlers, from, turn, route, Option.fromUndefinedOr(ran));

  if (Option.isSome(misrouted))
    return {
      to: Option.none(),
      found: [...wrongFrom, misrouted.value],
      match: Option.none(),
      from,
    };

  if (allowed.alternatives.length === 0)
    return {
      to: Option.some(from),
      found: [
        ...wrongFrom,
        `Turn I2: ${name(turn)} at ${from}, which no alternative handles (it is Unhandled or Denied)`,
      ],
      match: Option.none(),
      from,
    };

  const [only] = allowed.alternatives;
  const fallback = allowed.alternatives.length === 1 && only !== undefined ? [only.to] : [];

  if (ran === undefined)
    return {
      to: Option.fromUndefinedOr(fallback[0]),
      found: [
        ...wrongFrom,
        `Turn I2: ${name(turn)} at ${from} and reported no part of its root, so no selected alternative (${ats}) can be told`,
      ],
      match: Option.none(),
      from,
    };

  const match = allowed.alternatives.find((a) => a.at === ran.at);

  if (match === undefined)
    return {
      to: Option.fromUndefinedOr(fallback[0]),
      found: [
        ...wrongFrom,
        `Turn I2: ${name(turn)} at ${from} by ${ran.at}, not one of the alternatives selection allows (${ats})`,
      ],
      match: Option.none(),
      from,
    };

  if (match.to !== turn.to)
    return {
      to: Option.some(match.to),
      found: [
        ...wrongFrom,
        `Turn I2: ${name(turn)} at ${from} by ${match.at}, which ends at ${match.to}, but the turn says ${turn.to}`,
      ],
      match: Option.some(match),
      from,
    };

  return { to: Option.some(match.to), found: wrongFrom, match: Option.some(match), from };
};
