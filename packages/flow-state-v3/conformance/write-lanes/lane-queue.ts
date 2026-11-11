import { Array as Arr, Option } from "effect";
import type { Applied, LifeStep } from "../dsl/lifecycle-step.ts";
import {
  type LaneId,
  type LaneMember,
  LaneMove,
  LifeMove,
  type Model,
  Move,
  sameLane,
  addressable,
} from "../dsl/lifecycle-model.ts";
import { Fact, type InvariantId, oracle, type Violation } from "../dsl/oracle.ts";
import type { Concurrency, Reference } from "../fixtures/reference.ts";
import { MemberTarget, sameActor, sameJson } from "../port.ts";

const GUARANTEE: ReadonlyArray<InvariantId> = [
  "WriteLanes I1",
  "WriteLanes I5",
  "WriteLanes I8",
  "WriteLanes I9",
  "WriteLanes I10",
  "WriteLanes I11",
  "WriteLanes I12",
  "WriteLanes I20",
  "WriteLanes I21",
  "WriteLanes I26",
];

const BOUND: Readonly<Record<Concurrency, number>> = {
  reject: 0,
  latest: 1,
  serialize: 64,
  cancel: 0,
};

const named = (lane: LaneId) =>
  `${lane.actor.machine}/${lane.actor.id} ${lane.operation}${Option.match(lane.key, {
    onNone: () => "",
    onSome: (key) => ` ${JSON.stringify(key)}`,
  })}`;

const lanesOf = (model: Model) =>
  model.attempts.reduce<ReadonlyArray<LaneId>>(
    (lanes, a) => (lanes.some((l) => sameLane(l, a.lane)) ? lanes : [...lanes, a.lane]),
    [],
  );

const bounds = (model: Model, reference: Reference) =>
  lanesOf(model).flatMap((lane) => {
    const on = model.attempts.filter((a) => sameLane(a.lane, lane));
    const queued = on.filter((a) => a.phase._tag === "Queued").length;
    const heads = on.filter((a) => addressable(a.phase)).length;
    const policy = reference[lane.actor.machine]?.[lane.operation]?.concurrency ?? "reject";

    const checks: ReadonlyArray<readonly [boolean, Violation]> = [
      [
        queued > BOUND[policy],
        {
          invariant: "WriteLanes I8",
          text: `${named(lane)} holds ${queued} waiting commits under ${policy} at the step's end, past its bound of ${BOUND[policy]}`,
        },
      ],
      [
        heads > 1,
        {
          invariant: "WriteLanes I9",
          text: `${named(lane)} has ${heads} addressable Attempts at the step's end`,
        },
      ],
    ];

    return checks.flatMap(([broken, found]) => (broken ? [found] : []));
  });

/**
 * Each head that was re-sending at the step's start and still is at its end, in a step where the
 * store answered every held write (WriteLanes I26: an accepted retry is followed by one
 * invocation once its capture lands).
 */
const owedResends = (lives: LifeStep, step: ReadonlyArray<Fact>) => {
  const stored = step.some((f) => Fact.$is("Landed")(f));

  if (!stored) return [];

  const before = lives.before.attempts.filter((a) => a.phase._tag === "Resending").map((a) => a.id);

  const known = lives.after.attempts.map((a) => a.id);

  const strangers = step.flatMap((f) =>
    Fact.$is("Reported")(f) &&
    f.observation._tag === "Sent" &&
    !known.includes(f.observation.attempt)
      ? [f.observation]
      : [],
  );

  return lives.after.attempts
    .filter((a) => a.phase._tag === "Resending" && before.includes(a.id))
    .map((a) => {
      const other = strangers.find((x) => x.operation === a.lane.operation);

      return other === undefined
        ? {
            invariant: "WriteLanes I26" as const,
            text: `${a.lane.operation} ${a.id} was retried and its capture landed, but it was not sent again`,
          }
        : {
            invariant: "WriteLanes I9" as const,
            text: `${a.lane.operation} ${a.id} was retried, and the re-send carried ${other.attempt}, not the Attempt its lane last sent`,
          };
    });
};

const memberLane = (actor: LaneId["actor"], member: LaneMember, lane: LaneId) =>
  sameActor(actor, lane.actor) &&
  member.operation === lane.operation &&
  MemberTarget.$match(member.target, {
    Only: () => true,
    Key: ({ key }) => Option.exists(lane.key, (k) => sameJson(k, key)),
    Every: () => true,
    Nothing: () => false,
  });

type Cause = { readonly kinds: ReadonlyArray<LaneMember["kind"]>; readonly lane: LaneId };

const laneOfAttempt = (lives: LifeStep, id: string) =>
  Arr.findFirst(lives.after.attempts, (a) => a.id === id);

// RETURN_TYPE: one Cause per branch; inference would keep a union of the literal kind lists.
const causeOf = (lives: LifeStep, move: Applied["move"]): Option.Option<Cause> => {
  if (LaneMove.$is("Minted")(move)) return Option.some({ kinds: ["commit"], lane: move.lane });

  if (LaneMove.$is("Declined")(move))
    return Option.some({
      kinds: ["commit"],
      lane: { actor: move.actor, operation: move.operation, key: Option.none() },
    });

  if (Move.$is("Evidence")(move))
    return Option.map(laneOfAttempt(lives, move.attempt), (a) => ({
      kinds: move.kind === "Superseded" ? ["commit"] : ["cancel", "cancelAll", "release"],
      lane: a.lane,
    }));

  return Move.$is("End")(move) && move.channel === "failure" && move.reason === "Cancelled"
    ? Option.map(laneOfAttempt(lives, move.attempt), (a) => ({
        kinds: ["cancel", "cancelAll"],
        lane: a.lane,
      }))
    : Option.none();
};

type Order = {
  readonly actor: LaneId["actor"];
  readonly members: ReadonlyArray<LaneMember>;
  readonly at: number;
};

const placed = (order: Order, cause: Cause) => {
  const fits = (m: LaneMember) =>
    cause.kinds.includes(m.kind) &&
    (Option.isSome(cause.lane.key) || m.target._tag !== "Key"
      ? memberLane(order.actor, m, cause.lane)
      : sameActor(order.actor, cause.lane.actor) && m.operation === cause.lane.operation);

  return Option.orElse(
    Arr.findFirstIndex(order.members, (m, i) => i >= order.at && fits(m)),
    () => Arr.findFirstIndex(order.members, fits),
  );
};

const memberOrder = (lives: LifeStep) =>
  lives.applied.reduce<{
    readonly order: Option.Option<Order>;
    readonly found: ReadonlyArray<Violation>;
  }>(
    (walk, { move }) => {
      if (LaneMove.$is("Turn")(move))
        return { ...walk, order: Option.some({ actor: move.actor, members: move.members, at: 0 }) };

      if (LaneMove.$is("TurnCloses")(move) || Move.$is("Reload")(move))
        return { ...walk, order: Option.none() };

      return Option.match(
        Option.flatMap(walk.order, (order) =>
          Option.flatMap(causeOf(lives, move), (cause) =>
            Option.map(placed(order, cause), (at) => [order, at] as const),
          ),
        ),
        {
          onNone: () => walk,
          onSome: ([order, at]) =>
            at < order.at
              ? {
                  order: walk.order,
                  found: [
                    ...walk.found,
                    {
                      invariant: "WriteLanes I10",
                      text: `${move._tag} of ${order.members[at]?.operation ?? ""}'s ${order.members[at]?.kind ?? ""} (member ${at + 1}) came after a report of member ${order.at + 1}; a turn's members apply in action order`,
                    },
                  ],
                }
              : { ...walk, order: Option.some({ ...order, at }) },
        },
      );
    },
    { order: Option.none(), found: [] },
  ).found;

const cancelledAfter = (lives: LifeStep, from: number, id: string) =>
  lives.applied.some(
    ({ move }, i) =>
      i > from &&
      Move.$is("End")(move) &&
      move.attempt === id &&
      move.channel === "failure" &&
      move.reason === "Cancelled",
  );

const endedAfter = (lives: LifeStep, from: number, id: string) =>
  lives.applied.some(({ move }, i) => i > from && Move.$is("End")(move) && move.attempt === id);

const deliveredFrom = (lives: LifeStep, from: number) =>
  lives.applied.flatMap(({ move }, i) =>
    i > from && LifeMove.$is("Delivered")(move) ? Option.toArray(move.ending.attempt) : [],
  );

const cancelAllLanes = (on: Model, actor: LaneId["actor"], members: ReadonlyArray<LaneMember>) =>
  lanesOf(on).filter((lane) =>
    members.some((m) => m.kind === "cancelAll" && memberLane(actor, m, lane)),
  );

const headLast = (lives: LifeStep) =>
  lives.applied.flatMap(({ move, on }, turn) => {
    if (!LaneMove.$is("Turn")(move)) return [];

    const order = deliveredFrom(lives, turn);
    const at = (id: string) => Arr.findFirstIndex(order, (d) => d === id);

    return cancelAllLanes(on, move.actor, move.members).flatMap((lane) => {
      const onLane = on.attempts.filter((a) => sameLane(a.lane, lane));

      const head = Arr.findFirst(
        onLane,
        (a) => addressable(a.phase) && endedAfter(lives, turn, a.id),
      );

      return Option.match(
        Option.flatMap(head, (h) => Option.map(at(h.id), (heard) => [h, heard] as const)),
        {
          onNone: () => [],
          onSome: ([h, heard]) => {
            const later = onLane.filter(
              (q) =>
                q.phase._tag === "Queued" &&
                cancelledAfter(lives, turn, q.id) &&
                Option.exists(at(q.id), (i) => i > heard),
            );

            return later.length === 0
              ? []
              : [
                  {
                    invariant: "WriteLanes I21" as const,
                    text: `cancelAll delivered the head ${h.id}'s ending before the queued ${later.map((q) => q.id).join(", ")}; the head's comes last`,
                  },
                ];
          },
        },
      );
    });
  });

type State = { readonly reference: Reference };

/**
 * Each write lane keeps its cells, read from the Case's one lifecycle fold: every refusal of
 * WriteLanes I1, I8, I10, I11, I12, I20 and I21, the waiting list within its policy's bound,
 * at most one addressable Attempt, and a turn's members' reports in member order.
 *
 * **Details**
 *
 * - The refusals are the lifecycle's (`dsl/lifecycle-step.ts` over Tables A and B and the
 *   obligation deadlines in `dsl/lifecycle-rules.ts`): a send only of an addressable Attempt, never of a Held one without a retry (I1,
 *   I12); a mint or decline only where its anchored commit member admits one (I1, I8); promotion
 *   only past a head that left (I11); `Released` only where a cancel or a release owes it, and owed ones by the turn's close (I12); a cancel's ending by the head's
 *   history (I20); cancelAll's queue ended `NotSent { Cancelled }` in mint order (I21).
 * - Views of its own: a head re-sending since the step began is sent by the end of a step in which
 *   the store answered every held write (I26), and a re-send that carries an Attempt the lane
 *   never sent instead breaks I9; at the step's end each lane's waiting list is within its policy's bound (0
 *   under reject and cancel, 1 under latest, 64 under serialize; I8) and holds at most one
 *   addressable Attempt (I9); within a turn, each report a member causes (a mint or decline of a
 *   commit, a `Superseded`, a `Released`, a `NotSent { Cancelled }`) comes no earlier than the
 *   reports of the members before it (I10, order only); from a turn with a cancelAll member, the
 *   commits queued on its lane when the turn opened, ended `NotSent { Cancelled }`, are delivered
 *   before the ending of the lane's head at that open, when the head ends after the turn (I21,
 *   "then the head's ending").
 *
 * **Gotchas**
 *
 * - The fold is shared with the other lifecycle oracles: a wrong cell is wrong for all of them,
 *   caught by the lifecycle's traces and mutation test, and by the runtime mutants.
 * - The bound view reads the model at the step's end, not at each turn's close: an over-admitting
 *   mint is refused at the mint itself, so only a waiting Attempt left unsuperseded is seen there.
 * - The head-last view judges the deliveries after the turn in its own step only; an order across
 *   steps is not seen.
 * - I10's view places a report on the earliest member of its kind and lane at or after the last
 *   placed one, so two like members of one lane in one turn are not told apart.
 */
export const laneQueue = oracle<State>({
  name: "lane-queue",
  guarantee: GUARANTEE,
  start: (reference) => ({ reference }),
  step: (state, facts, _requests, lives) => {
    const refused = lives.applied
      .flatMap((a) => a.refusals)
      .filter((r) => GUARANTEE.includes(r.invariant));

    return [
      state,
      [
        ...refused,
        ...bounds(lives.after, state.reference),
        ...memberOrder(lives),
        ...headLast(lives),
        ...owedResends(lives, facts),
      ],
    ] as const;
  },
});
