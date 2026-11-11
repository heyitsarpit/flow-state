import { Option } from "effect";
import type { Route } from "../fixtures/handlers.ts";
import type { Delivered, Turn } from "../port.ts";
import { type Actor, attemptKey, pendingOf, type State } from "./anchor.ts";
import { leafOf } from "./phases.ts";

const name = (turn: Turn) => `${turn.actor.machine} ${turn.actor.id} ran ${turn.event}`;

/**
 * A late turn that exits the active leaf's Activation while it owns pending work (Turn I27).
 */
export const lateLeftWork = (
  state: State,
  now: Actor,
  turn: Turn,
  route: Route,
  enters: boolean,
  delivered: Option.Option<Delivered>,
) => {
  const leaf = leafOf(now.phase);

  if (route !== "late" || Option.isNone(leaf) || !enters) return [];

  const pending = pendingOf(state, turn.actor, { state: leaf.value, entry: now.entry });
  const work = pending.map((c) => `${c.operation} ${c.attempt}`).join(", ");

  const reentered = Option.exists(delivered, (d) =>
    Option.exists(d.attempt, (id) =>
      Option.exists(
        Option.flatMap(
          Option.fromUndefinedOr(state.calls.get(attemptKey(d.operation, id))),
          (c) => c.owner,
        ),
        (owner) => owner.state === leaf.value && owner.entry !== now.entry,
      ),
    ),
  );

  if (pending.length === 0) return [];

  return reentered
    ? [
        `Turn I5: ${name(turn)} as current, though ${leaf.value} was re-entered since its call: a re-entry is a new Activation, so the ending is late and may not leave ${leaf.value}'s pending work (${work})`,
      ]
    : [
        `Turn I27: ${name(turn)}, a late turn, and left ${leaf.value}, whose Activation owns pending work (${work})`,
      ];
};
