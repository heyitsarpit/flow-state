import { Option } from "effect";
import { mappedEvent, retains } from "../fixtures/reference.ts";
import {
  type ActorRef,
  type EndingRef,
  type Json,
  Observation,
  sameActor,
  type Turn,
} from "../port.ts";
import type { Request } from "../world/network.ts";
import { answeredEnding, closedTurn, isWrite, pushed, unsaved, type Walk } from "./expect.ts";
import { lifeNamed, misdelivered } from "./lifecycle-lives.ts";
import {
  ActorMove,
  type EndingName,
  type Input,
  LaneMove,
  LifeMove,
  type Model,
  Move,
  Phase,
} from "./lifecycle-model.ts";
import { type Known, operationOf, owedMembers, type Predicted } from "./lifecycle-owed.ts";
import type { Rules } from "./lifecycle-rules.ts";

/**
 * A turn the step was given no prediction for (a test driving the step alone): its header, with
 * no alternative and no keys.
 */
// RETURN_TYPE: the Predicted contract; `at` would infer as None of never.
const predictedOf = (turn: Turn): Predicted => ({
  actor: turn.actor,
  event: turn.event,
  from: turn.from,
  to: turn.to,
  at: Option.none(),
  keys: {},
});

const deliveringOf = (
  model: Model,
  known: Known,
  actor: Option.Option<ActorRef>,
  event: string,
) => {
  const matching = model.endings.filter(
    (e) =>
      e.life._tag === "Delivering" &&
      Option.match(actor, { onNone: () => true, onSome: (a) => sameActor(a, e.actor) }) &&
      Option.exists(operationOf(known, e.actor, e.operation), (o) =>
        Option.contains(mappedEvent(o, e.channel, e.reason), event),
      ),
  );

  const [first] = matching;
  const one = first !== undefined && matching.every((e) => sameActor(e.actor, first.actor));

  return Option.map(Option.fromUndefinedOr(one ? first : undefined), (e) => ({
    operation: e.operation,
    attempt: e.attempt,
    actor: e.actor,
  }));
};

const heardOf = (
  walk: Walk,
  known: Known,
  actor: Option.Option<ActorRef>,
  event: string,
  given: Rules,
) =>
  Option.match(deliveringOf(walk.model, known, actor, event), {
    onNone: () => walk,
    onSome: (ending) => pushed(walk, LifeMove.Heard({ ending }), given),
  });

const asMapped = (walk: Walk, before: Model, known: Known, name: EndingName, event: string) => {
  const last = walk.applied.at(-1);
  const wrong = misdelivered(before, known.reference, name, event);

  return last === undefined || Option.isNone(wrong)
    ? walk
    : {
        ...walk,
        applied: [
          ...walk.applied.slice(0, -1),
          { ...last, refusals: [...last.refusals, wrong.value] },
        ],
      };
};

const sendsOf = (walk: Walk, attempt: string, earlier: ReadonlyArray<Request>) =>
  earlier.filter((r) => Option.contains(r.key, attempt)).length +
  walk.applied.filter(
    (a) => Move.$is("Send")(a.move) && a.move.attempt === attempt && a.refusals.length === 0,
  ).length;

const mintedLane = (known: Known, actor: ActorRef, operation: string, key: Option.Option<Json>) =>
  Option.exists(operationOf(known, actor, operation), (o) => o.keyFields.length > 0)
    ? key
    : Option.none();

/**
 * Whether the reference maps an ending the runtime called unmapped: then its `UnmappedEnding`
 * excuses nothing, and the ending stays owed (only a cause the suite sees may excuse one).
 */
const mapped = (walk: Walk, known: Known, ref: EndingRef) =>
  walk.model.endings.some(
    (e) =>
      e.life._tag !== "Closed" &&
      sameActor(e.actor, ref.actor) &&
      e.operation === ref.operation &&
      Option.getOrNull(e.attempt) === Option.getOrNull(ref.attempt) &&
      Option.isSome(
        Option.flatMap(operationOf(known, e.actor, e.operation), (o) =>
          mappedEvent(o, e.channel, e.reason),
        ),
      ),
  );

/**
 * Matches one report to the move the expect half allows for it, and applies that move (the compare
 * half, Conformance R19): a turn opens with its predicted members, an answered Attempt ends as the
 * suite's answer says, and every other report is a move its table cell accepts or refuses.
 *
 * **Details**
 *
 * - A `Turn` is first the delivering ending's `Heard` (its actor's ending of that event), then a
 *   turn with the members selection predicted ({@link owedMembers}), never the report's.
 * - An Attempt's unknown `End` is `retained` by its operation's reference ({@link retains}).
 * - The open turn closes at the next `Delivered`, `Turn`, `Unhandled` or `Denied`.
 * - `Incarnated` counts only after a suite `Ensured` or `Drove` of that actor, or a `Reloaded`, in
 *   the same step, and once per actor per step.
 *
 * **Gotchas**
 *
 * - A `Parked`, `Unparked` or `Recorded` names no actor: it is read from the Attempt's lane, or for
 *   a decline from the oldest open decline of the operation (else its newest, so its cell
 *   refuses). One naming neither (an Attempt never minted) is not applied; a decline's `Ended`
 *   with no actor outside a turn likewise.
 * - A `Minted` with no actor is not applied: the Case stops it as `Unreadable`.
 * - A report of an operation no fixture declares as a write (a read's send or ending) is not a
 *   lifecycle move.
 */
export const reported = (
  walk: Walk,
  known: Known,
  observation: Observation,
  earlier: ReadonlyArray<Request>,
  given: Rules,
) => {
  const push = (w: Walk, move: Input) => pushed(w, move, given);

  if ("operation" in observation && !isWrite(known, observation.operation)) return walk;

  return Observation.$match(observation, {
    Turn: (turn) => {
      const [next = predictedOf(turn)] = walk.turns;
      const hearing = deliveringOf(walk.model, known, Option.some(turn.actor), turn.event);

      const heard = heardOf(
        { ...walk, turns: walk.turns.slice(1) },
        known,
        Option.some(turn.actor),
        turn.event,
        given,
      );

      return push(
        heard,
        LaneMove.Turn({
          actor: next.actor,
          members: owedMembers(heard.model, known, next, hearing, (attempt) =>
            sendsOf(heard, attempt, earlier),
          ),
        }),
      );
    },
    Minted: ({ operation, attempt, actor, key }) =>
      Option.match(actor, {
        onNone: () => walk,
        onSome: (who) =>
          push(
            walk,
            LaneMove.Minted({
              attempt,
              lane: { actor: who, operation, key: mintedLane(known, who, operation, key) },
            }),
          ),
      }),
    Sent: ({ attempt }) => {
      const at = walk.unsent.indexOf(attempt);

      return at < 0
        ? walk
        : push({ ...walk, unsent: walk.unsent.toSpliced(at, 1) }, Move.Send({ attempt }));
    },
    Ended: ({ operation, attempt, channel, reason, actor }) =>
      Option.match(attempt, {
        onSome: (id) => {
          const lane = walk.model.attempts.find((a) => a.id === id)?.lane;

          const onWire = walk.model.attempts.some(
            (a) => a.id === id && Phase.$is("OnWire")(a.phase),
          );

          const answered = Option.flatMap(
            Option.filter(Option.fromUndefinedOr(lane), () => onWire),
            (l) => answeredEnding(known, l, walk, id),
          );

          const said = Option.match(answered, {
            onNone: () => ({ channel, reason }),
            onSome: (e) => ({
              channel: e.channel,
              reason: Option.getOrElse(e.reason, () => reason),
            }),
          });

          const retained =
            lane === undefined ||
            Option.match(operationOf(known, lane.actor, lane.operation), {
              onNone: () => true,
              onSome: (o) => retains(o, said.reason),
            });

          return unsaved(push(walk, Move.End({ attempt: id, ...said, retained })), id);
        },
        onNone: () =>
          Option.match(
            Option.orElse(actor, () => Option.map(walk.model.turn, (t) => t.actor)),
            {
              onNone: () => walk,
              onSome: (who) => push(walk, LaneMove.Declined({ operation, actor: who, reason })),
            },
          ),
      }),
    Delivered: ({ operation, attempt, actor, event }) => {
      const open = closedTurn(walk, given);

      return Option.match(lifeNamed(open.model, operation, attempt, actor), {
        onNone: () => open,
        onSome: (ending) =>
          asMapped(push(open, LifeMove.Delivered({ ending })), open.model, known, ending, event),
      });
    },
    Parked: ({ operation, attempt }) =>
      Option.match(lifeNamed(walk.model, operation, attempt, Option.none()), {
        onNone: () => walk,
        onSome: (ending) => push(walk, LifeMove.Parked({ ending })),
      }),
    Unparked: ({ operation, attempt }) =>
      Option.match(lifeNamed(walk.model, operation, attempt, Option.none()), {
        onNone: () => walk,
        onSome: (ending) => push(walk, LifeMove.Unparked({ ending })),
      }),
    Recorded: ({ operation, attempt, why }) =>
      Option.match(lifeNamed(walk.model, operation, attempt, Option.none()), {
        onNone: () => walk,
        onSome: (ending) => push(walk, LifeMove.Recorded({ ending, letGo: why === "letGo" })),
      }),
    Unhandled: ({ event }) => heardOf(closedTurn(walk, given), known, Option.none(), event, given),
    Denied: ({ event }) => heardOf(closedTurn(walk, given), known, Option.none(), event, given),
    Evidence: ({ kind, attempt }) =>
      (kind === "Released" || kind === "Superseded") && Option.isSome(attempt)
        ? unsaved(push(walk, Move.Evidence({ attempt: attempt.value, kind })), attempt.value)
        : walk,
    Issue: ({ code, ending }) => {
      const issue = { InvalidTurn: "InvalidTurn", UnmappedEnding: "Unmapped" } as const;
      const named = code === "InvalidTurn" || code === "UnmappedEnding" ? issue[code] : undefined;
      const excused = named !== "Unmapped" || !Option.exists(ending, (e) => mapped(walk, known, e));

      return Option.isSome(ending) && named !== undefined && excused
        ? push(walk, LifeMove.Refused({ ending: ending.value, issue: named }))
        : walk;
    },
    Incarnated: ({ actor }) => {
      const anchored = walk.reloaded || walk.used.some((a) => sameActor(a, actor));
      const twice = walk.incarnated.some((a) => sameActor(a, actor));

      return anchored && !twice
        ? {
            ...push(walk, ActorMove.Incarnated({ actor })),
            incarnated: [...walk.incarnated, actor],
          }
        : walk;
    },
    Finished: ({ actor }) => push(walk, ActorMove.Finished({ actor })),
    Published: () => walk,
  });
};
