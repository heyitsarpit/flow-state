import { Option } from "effect";
import {
  mappedEvent,
  type OperationReference,
  type Reference,
  retains,
  type Row,
  type Rows,
} from "../fixtures/reference.ts";
import {
  type ActorRef,
  type Json,
  type Member,
  MemberTarget,
  Observation,
  sameActor,
  type Turn,
} from "../port.ts";
import type { Request } from "../world/network.ts";
import { due } from "./lifecycle.ts";
import { apply } from "./lifecycle-fold.ts";
import {
  ActorMove,
  addressable,
  type Input,
  type LaneId,
  LaneMove,
  LifeMove,
  type Model,
  Move,
  type Refusal,
  sameLane,
} from "./lifecycle-model.ts";
import { type Rules, rules } from "./lifecycle-rules.ts";
import { Fact } from "./oracle.ts";

/**
 * One move the step applied, with the refusals its cell (or a deadline it reached) gave.
 */
export type Applied = { readonly move: Input; readonly refusals: ReadonlyArray<Refusal> };

/**
 * One step of the lifecycle: the model before and after it, and every move applied, in order.
 */
export type LifeStep = {
  readonly before: Model;
  readonly after: Model;
  readonly applied: ReadonlyArray<Applied>;
};

/**
 * What the step reads besides the facts: the case's operation references and its rows.
 */
export type Known = { readonly reference: Reference; readonly rows: Rows };

type Walk = {
  readonly model: Model;
  readonly applied: ReadonlyArray<Applied>;
  readonly reloaded: boolean;
  readonly used: ReadonlyArray<ActorRef>;
  readonly incarnated: ReadonlyArray<ActorRef>;
};

const operationOf = (known: Known, actor: ActorRef, operation: string) =>
  Option.fromUndefinedOr(known.reference[actor.machine]?.[operation]);

const isWrite = (known: Known, operation: string) =>
  Object.values(known.reference).some((operations) => Object.hasOwn(operations, operation));

const pushed = (walk: Walk, move: Input, given: Rules) => {
  const [model, refusals] = apply(walk.model, move, given);

  return { ...walk, model, applied: [...walk.applied, { move, refusals }] };
};

const closedTurn = (walk: Walk, given: Rules) =>
  Option.isSome(walk.model.turn) ? pushed(walk, LaneMove.TurnCloses(), given) : walk;

const lifeNamed = (
  model: Model,
  operation: string,
  attempt: Option.Option<string>,
  actor: Option.Option<ActorRef>,
) => {
  const ofAttempt = Option.flatMap(attempt, (id) =>
    Option.fromUndefinedOr(model.attempts.find((a) => a.id === id)?.lane.actor),
  );

  const declines = model.endings.filter(
    (e) => Option.isNone(e.attempt) && e.operation === operation,
  );

  const ofDecline = Option.fromUndefinedOr(
    (declines.find((e) => e.life._tag !== "Closed") ?? declines.at(-1))?.actor,
  );

  return Option.map(
    Option.orElse(actor, () => (Option.isSome(attempt) ? ofAttempt : ofDecline)),
    (who) => ({ operation, attempt, actor: who }),
  );
};

const deliveringOf = (model: Model, known: Known, actor: Option.Option<ActorRef>, event: string) =>
  Option.map(
    Option.fromUndefinedOr(
      model.endings.find(
        (e) =>
          e.life._tag === "Delivering" &&
          Option.match(actor, { onNone: () => true, onSome: (a) => sameActor(a, e.actor) }) &&
          Option.exists(operationOf(known, e.actor, e.operation), (o) =>
            Option.contains(mappedEvent(o, e.channel, e.reason), event),
          ),
      ),
    ),
    (e) => ({ operation: e.operation, attempt: e.attempt, actor: e.actor }),
  );

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

const sendsOf = (walk: Walk, attempt: string, earlier: ReadonlyArray<Request>) =>
  earlier.filter((r) => Option.contains(r.key, attempt)).length +
  walk.applied.filter(
    (a) => Move.$is("Send")(a.move) && a.move.attempt === attempt && a.refusals.length === 0,
  ).length;

const laneOfMember = (actor: ActorRef, member: Member) =>
  MemberTarget.$match(member.target, {
    Only: () => Option.some<LaneId>({ actor, operation: member.operation, key: Option.none() }),
    Key: ({ key }) =>
      Option.some<LaneId>({ actor, operation: member.operation, key: Option.some(key) }),
    Every: () => Option.none<LaneId>(),
    Nothing: () => Option.none<LaneId>(),
  });

const guardHolds = (
  walk: Walk,
  row: Row,
  actor: ActorRef,
  members: ReadonlyArray<Member>,
  earlier: ReadonlyArray<Request>,
) =>
  Option.match(row.guard, {
    onNone: () => true,
    onSome: (guard) => {
      const named = Option.flatMap(
        Option.fromUndefinedOr(members.find((m) => m.operation === guard.operation)),
        (m) => laneOfMember(actor, m),
      );

      const head = Option.flatMap(named, (lane) =>
        Option.fromUndefinedOr(
          walk.model.attempts.find((a) => sameLane(a.lane, lane) && addressable(a.phase)),
        ),
      );

      const passes = Option.exists(
        head,
        (h) => h.phase._tag === "Held" && sendsOf(walk, h.id, earlier) - 1 < guard.times,
      );

      return Option.isSome(named) && passes === guard.passes;
    },
  });

const spelled = (members: ReadonlyArray<{ readonly operation: string; readonly kind: string }>) =>
  members.map((m) => `${m.operation}.${m.kind}`).join(" ");

const sameMembers = (row: Row, members: ReadonlyArray<Member>) =>
  spelled(row.members) === spelled(members);

const fromMatches = (row: Row, from: string, to: string) =>
  (row.from === "any" || row.from === from) && (row.to === "same" ? to === from : row.to === to);

const laneMemberOf = (known: Known, actor: ActorRef) => (member: Member) =>
  Option.map(operationOf(known, actor, member.operation), (o: OperationReference) => ({
    ...member,
    concurrency: o.concurrency,
  }));

const anchoredMembers = (walk: Walk, known: Known, turn: Turn, earlier: ReadonlyArray<Request>) => {
  const lane = turn.members.filter((m) => m.kind !== "release");

  const matched =
    lane.length === 0 ||
    (known.rows[turn.actor.machine] ?? []).some(
      (row) =>
        row.event === turn.event &&
        fromMatches(row, turn.from, turn.to) &&
        sameMembers(row, lane) &&
        guardHolds(walk, row, turn.actor, lane, earlier),
    );

  const leaving = turn.members
    .filter((m) => m.kind === "release")
    .every((m) =>
      Option.exists(operationOf(known, turn.actor, m.operation), (o) =>
        o.releasesOnLeave.some(
          (t) => t.event === turn.event && t.from === turn.from && t.to === turn.to,
        ),
      ),
    );

  const members = turn.members.map(laneMemberOf(known, turn.actor));

  return matched && leaving && members.every(Option.isSome) ? members.flatMap(Option.toArray) : [];
};

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
      const heard = heardOf(walk, known, Option.some(turn.actor), turn.event, given);

      return push(
        heard,
        LaneMove.Turn({ actor: turn.actor, members: anchoredMembers(heard, known, turn, earlier) }),
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
    Delivered: ({ operation, attempt, actor }) => {
      const open = closedTurn(walk, given);

      return Option.match(lifeNamed(open.model, operation, attempt, actor), {
        onNone: () => open,
        onSome: (ending) => push(open, LifeMove.Delivered({ ending })),
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

      return Option.isSome(ending) && named !== undefined
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
  });
};

const UNBOUND: ReadonlyArray<string> = ["grace", "disposeActor", "forget"];

const ensured = (walk: Walk, actor: ActorRef, given: Rules) => {
  const used = { ...walk, used: [...walk.used, actor] };
  const record = recordOf(walk.model, actor);

  return record !== undefined && UNBOUND.includes(record)
    ? {
        ...pushed(used, ActorMove.Adopt({ actor }), given),
        incarnated: [...walk.incarnated, actor],
      }
    : used;
};

const onFact = (
  walk: Walk,
  fact: Fact,
  known: Known,
  earlier: ReadonlyArray<Request>,
  given: Rules,
) =>
  Fact.$match(fact, {
    Reported: ({ observation }) => reported(walk, known, observation, earlier, given),
    Reloaded: () => ({
      ...pushed(closedTurn(walk, given), Move.Reload(), given),
      reloaded: true,
    }),
    DisposingRuntime: () => pushed(walk, Move.DisposalStarts(), given),
    Disposed: ({ actor }) => pushed(walk, ActorMove.Disposed({ actor }), given),
    Forgot: ({ actor }) => pushed(walk, ActorMove.Forgot({ actor }), given),
    Ensured: ({ actor }) => ensured(walk, actor, given),
    Drove: ({ actor }) => ({ ...walk, used: [...walk.used, actor] }),
    Unstoppable: ({ operation }) =>
      walk.model.unstoppable.includes(operation)
        ? walk
        : {
            ...walk,
            model: { ...walk.model, unstoppable: [...walk.model.unstoppable, operation] },
          },
    Stepped: () => walk,
    Requested: () => walk,
    Answered: () => walk,
    Released: () => walk,
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
 *   turn with its members, anchored when a row of its machine matches its event, from and to, its
 *   computed guard holds, and its members (releases aside) equal the reported ones in order. A
 *   turn no row matches opens with no members, so its effects are refused under their own
 *   Invariants (a `Minted` with no commit member is WriteLanes I1). A turn with no lane member
 *   anchors its releases, and a `release` member anchors only on an operation whose reference
 *   lists the turn's transition among those that release it on leaving (WriteLanes R16; review
 *   H1); otherwise the turn anchors nothing, so its `Released` is WriteLanes I12.
 * - A row's `retryable` guard reads the head of the lane its reported member names: it passes
 *   when the head is Held and was sent fewer than `times` + 1 times (the server's log before
 *   this step, and the step's accepted `Send`s so far).
 * - An Attempt's unknown `End` is `retained` by its operation's reference ({@link retains}).
 * - The open turn closes at the next `Delivered`, `Turn`, `Unhandled`, `Denied` or `Reloaded`,
 *   and at the step's end.
 * - `Incarnated` counts only after a suite `Ensured` or `Drove` of that actor, or a `Reloaded`, in
 *   the same step, and once per actor per step; an `Ensured` of an unbound actor is `Adopt`.
 * - At the step's end: the turn closes, a reload's boot settles, every Attempt and ending sees
 *   `StepEnds`, and the obligations due by then are refused on that move.
 *
 * **Gotchas**
 *
 * - Rows with the same members are not told apart, so two of them matching one turn anchor it.
 * - A `Parked`, `Unparked` or `Recorded` names no actor: it is read from the Attempt's lane, or for
 *   a decline from the oldest open decline of the operation (else its newest, so its cell refuses). One naming neither (an Attempt never
 *   minted) is not applied; a decline's `Ended` with no actor outside a turn likewise.
 * - A `Minted` with no actor is not applied: the Case stops it as `UnreadableReport`.
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
