import { Option } from "effect";
import { mappedEvent, retains } from "../fixtures/reference.ts";
import { type ActorRef, type EndingRef, type Json, Observation, sameActor } from "../port.ts";
import type { Request } from "../world/network.ts";
import { due } from "./lifecycle.ts";
import { apply } from "./lifecycle-fold.ts";
import { lifeNamed, misdelivered } from "./lifecycle-lives.ts";
import {
  ActorMove,
  type EndingName,
  type Input,
  LaneMove,
  LifeMove,
  type Model,
  Move,
  type Refusal,
} from "./lifecycle-model.ts";
import { type Known, operationOf, owedMembers } from "./lifecycle-owed.ts";
import { type Rules, rules } from "./lifecycle-rules.ts";
import { Fact, holdUse } from "./oracle.ts";

/**
 * One move the step applied: the model it applied to, and the refusals its cell (or a deadline it
 * reached) gave.
 */
export type Applied = {
  readonly move: Input;
  readonly on: Model;
  readonly refusals: ReadonlyArray<Refusal>;
};

/**
 * One step of the lifecycle: the model before and after it, and every move applied, in order.
 */
export type LifeStep = {
  readonly before: Model;
  readonly after: Model;
  readonly applied: ReadonlyArray<Applied>;
};

type Walk = {
  readonly model: Model;
  readonly applied: ReadonlyArray<Applied>;
  readonly reloaded: boolean;
  readonly used: ReadonlyArray<ActorRef>;
  readonly incarnated: ReadonlyArray<ActorRef>;
};

const isWrite = (known: Known, operation: string) =>
  Object.values(known.reference).some((operations) => Object.hasOwn(operations, operation));

const pushed = (walk: Walk, move: Input, given: Rules) => {
  const [model, refusals] = apply(walk.model, move, given);

  return { ...walk, model, applied: [...walk.applied, { move, on: walk.model, refusals }] };
};

const closedTurn = (walk: Walk, given: Rules) =>
  Option.isSome(walk.model.turn) ? pushed(walk, LaneMove.TurnCloses(), given) : walk;

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

const recordOf = (model: Model, actor: ActorRef) =>
  model.actors.find((a) => sameActor(a.actor, actor))?.record;

const mintedLane = (known: Known, actor: ActorRef, operation: string, key: Option.Option<Json>) =>
  Option.exists(operationOf(known, actor, operation), (o) => o.keyFields.length > 0)
    ? key
    : Option.none();

const reported = (
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
      const hearing = deliveringOf(walk.model, known, Option.some(turn.actor), turn.event);
      const heard = heardOf(walk, known, Option.some(turn.actor), turn.event, given);

      return push(
        heard,
        LaneMove.Turn({
          actor: turn.actor,
          members: owedMembers(heard.model, known, turn, hearing, (attempt) =>
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
    Sent: ({ attempt }) => push(walk, Move.Send({ attempt })),
    Ended: ({ operation, attempt, channel, reason, actor }) =>
      Option.match(attempt, {
        onSome: (id) => {
          const lane = walk.model.attempts.find((a) => a.id === id)?.lane;

          const retained =
            lane === undefined ||
            Option.match(operationOf(known, lane.actor, lane.operation), {
              onNone: () => true,
              onSome: (o) => retains(o, reason),
            });

          return push(walk, Move.End({ attempt: id, channel, reason, retained }));
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
        ? push(walk, Move.Evidence({ attempt: attempt.value, kind }))
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
    RuntimeDisposed: () => push(walk, Move.RuntimeDisposed()),
    Published: () => walk,
  });
};

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

const ADOPTABLE: ReadonlyArray<string> = ["grace", "disposeActor", "forget"];

const ensured = (walk: Walk, actor: ActorRef, given: Rules) => {
  const used = { ...walk, used: [...walk.used, actor] };
  const record = recordOf(walk.model, actor);

  return record !== undefined && ADOPTABLE.includes(record)
    ? {
        ...pushed(used, ActorMove.Adopt({ actor }), given),
        incarnated: [...walk.incarnated, actor],
      }
    : used;
};

const holding = (walk: Walk, fact: Fact) => ({
  ...walk,
  model: { ...walk.model, held: holdUse(walk.model.held, fact) },
});

const onFact = (
  walk: Walk,
  fact: Fact,
  known: Known,
  earlier: ReadonlyArray<Request>,
  given: Rules,
) =>
  Fact.$match(fact, {
    Reported: ({ observation }) => reported(walk, known, observation, earlier, given),
    Reloaded: () => {
      const reloaded = pushed(closedTurn(walk, given), Move.Reload(), given);

      return { ...reloaded, model: { ...reloaded.model, held: [] }, reloaded: true };
    },
    DisposingRuntime: () => pushed(walk, Move.DisposalStarts(), given),
    Disposed: ({ actor }) => pushed(holding(walk, fact), ActorMove.Disposed({ actor }), given),
    Forgot: ({ actor }) => pushed(holding(walk, fact), ActorMove.Forgot({ actor }), given),
    Ensured: ({ actor }) => ensured(holding(walk, fact), actor, given),
    Drove: ({ actor }) => ({ ...walk, used: [...walk.used, actor] }),
    Unstoppable: ({ operation }) =>
      walk.model.unstoppable.includes(operation)
        ? walk
        : {
            ...walk,
            model: { ...walk.model, unstoppable: [...walk.model.unstoppable, operation] },
          },
    Acknowledged: ({ attempts }) => ({
      ...walk,
      model: { ...walk.model, acknowledged: [...walk.model.acknowledged, ...attempts] },
    }),
    Stepped: () => walk,
    Requested: () => walk,
    Answered: () => walk,
    Released: () => holding(walk, fact),
    Advanced: () => walk,
    Read: () => walk,
  });

const ended = (walk: Walk, given: Rules) => {
  const closed = closedTurn(walk, given);
  const settled = closed.reloaded ? pushed(closed, Move.BootSettles(), given) : closed;

  const stepped = pushed(settled, Move.StepEnds({ unstoppable: settled.model.unstoppable }), given);

  const [model, late] = due(stepped.model, "StepEnds", given);
  const before = stepped.applied.slice(0, -1);
  const last = stepped.applied.slice(-1).map((a) => ({ ...a, refusals: [...a.refusals, ...late] }));

  return { ...stepped, model, applied: [...before, ...last] };
};

/**
 * Turns one step's facts into lifecycle moves, in order, and applies each by the tables.
 *
 * **When to use**
 *
 * The Case runs it once per step, before the oracles; each lifecycle oracle reads the refusals of
 * its own Invariants from `applied`, and its own views from `before` and `after`.
 *
 * **Details**
 *
 * - A `Turn` is first the delivering ending's `Heard` (its actor's ending of that event), then a
 *   turn with the members it owes ({@link owedMembers}): they come only from the reference and
 *   the turn's facts, never from what the report adds, drops, retargets or reorders.
 * - An Attempt's unknown `End` is `retained` by its operation's reference ({@link retains}).
 * - The open turn closes at the next `Delivered`, `Turn`, `Unhandled`, `Denied` or `Reloaded`,
 *   and at the step's end.
 * - `Incarnated` counts only after a suite `Ensured` or `Drove` of that actor, or a `Reloaded`, in
 *   the same step, and once per actor per step; an `Ensured` of an unbound actor is `Adopt`.
 * - At the step's end: the turn closes, a reload's boot settles, every Attempt and ending sees
 *   `StepEnds`, and the obligations due by then are refused on that move.
 * - The uses the suite holds (`held`) follow its `Ensured`, `Released`, `Disposed` and `Forgot`
 *   facts, and a reload drops them until the boot re-attaches them: an actor with a held use is
 *   live by the suite's own facts, whatever the runtime reports.
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
export const step = (
  model: Model,
  known: Known,
  facts: ReadonlyArray<Fact>,
  requests: ReadonlyArray<Request>,
  given: Rules = rules,
) => {
  const fresh = facts.flatMap((f) => (Fact.$is("Requested")(f) ? [f.request.seq] : []));
  const earlier = requests.filter((r) => !fresh.includes(r.seq));
  const start: Walk = { model, applied: [], reloaded: false, used: [], incarnated: [] };

  const walked = ended(
    facts.reduce((walk, fact) => onFact(walk, fact, known, earlier, given), start),
    given,
  );

  const result: LifeStep = { before: model, after: walked.model, applied: walked.applied };

  return result;
};
