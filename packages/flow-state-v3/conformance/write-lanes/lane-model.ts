import { Data, Option } from "effect";
import { type LaneId, laneOf, sameLane } from "../dsl/domain.ts";
import type { Concurrency, OperationReference, Reference } from "../fixtures/reference.ts";
import { type ActorRef, type Ended, type Json, type Minted, sameActor } from "../port.ts";
import type { Request } from "../world/network.ts";

/**
 * Where one Attempt stands in its lane: queued, the never-sent head, on the wire, Held by an
 * unknown since step `at`, or a head a later commit replaced under `cancel`.
 */
export type Phase = Data.TaggedEnum<{
  Queued: {};
  Waiting: {};
  Wire: {};
  Held: { at: number };
  Replaced: {};
}>;

/**
 * Constructors and matchers for {@link Phase}.
 */
export const Phase = Data.taggedEnum<Phase>();

const ADDRESSABLE: Readonly<Record<Phase["_tag"], boolean>> = {
  Queued: false,
  Waiting: true,
  Wire: true,
  Held: true,
  Replaced: false,
};

const BOUND: Readonly<Record<Concurrency, number>> = {
  reject: 0,
  latest: 1,
  serialize: 64,
  cancel: 0,
};

type Known = {
  readonly id: string;
  readonly owner: ActorRef;
  readonly operation: string;
  readonly policy: OperationReference;
  readonly lane: Option.Option<LaneId>;
};

/**
 * One Attempt of this boot's lanes and its phase.
 */
export type Live = { readonly id: string; readonly phase: Phase };

/**
 * A cancel the suite drove on a head, by the head's history then, until the head ends.
 */
export type CancelPending = { readonly id: string; readonly from: "waiting" | "wire" };

type DrivenTurn = { readonly actor: ActorRef; readonly step: number };

/**
 * The oracle's model of every lane: each Attempt minted in the case (`known`), this boot's
 * lane Attempts in mint order (`live`), pending cancels, the operations made uninterruptible and
 * the turns of driven steps. The `known` facts and the last two survive a reload.
 */
export type Model = {
  readonly known: ReadonlyArray<Known>;
  readonly live: ReadonlyArray<Live>;
  readonly cancels: ReadonlyArray<CancelPending>;
  readonly unstoppable: ReadonlyArray<string>;
  readonly drivenTurns: ReadonlyArray<DrivenTurn>;
};

/**
 * Violation sentences, each starting with its Invariant.
 */
export type Found = ReadonlyArray<string>;

/**
 * The model of a case before its first step.
 */
export const EMPTY: Model = { known: [], live: [], cancels: [], unstoppable: [], drivenTurns: [] };

/**
 * Whether an Attempt is its lane's addressable one (the head).
 */
export const addressable = (live: Live) => ADDRESSABLE[live.phase._tag];

/**
 * What the model knows of an Attempt minted in the case.
 */
export const knownOf = (model: Model, id: string) =>
  Option.fromUndefinedOr(model.known.find((k) => k.id === id));

const liveOf = (model: Model, id: string) =>
  Option.fromUndefinedOr(model.live.find((l) => l.id === id));

/**
 * The lane of an Attempt, once its key is known.
 */
export const laneOfId = (model: Model, id: string) =>
  Option.flatMap(knownOf(model, id), (k) => k.lane);

const inLane = (model: Model, lane: LaneId) =>
  model.live.filter((l) => Option.exists(laneOfId(model, l.id), (at) => sameLane(at, lane)));

const headOf = (model: Model, lane: LaneId) =>
  Option.fromUndefinedOr(inLane(model, lane).find(addressable));

/**
 * A lane's queued Attempts, in mint order.
 */
export const queuedOf = (model: Model, lane: LaneId) =>
  inLane(model, lane).filter((l) => Phase.$is("Queued")(l.phase));

const lanesOf = (model: Model) =>
  model.live
    .flatMap((l) => Option.toArray(laneOfId(model, l.id)))
    .filter((lane, at, all) => all.findIndex((other) => sameLane(other, lane)) === at);

const named = (lane: LaneId) =>
  `${lane.owner.machine}/${lane.owner.id} ${lane.operation}${lane.key.length === 0 ? "" : ` ${JSON.stringify(lane.key)}`}`;

const withPhase = (model: Model, id: string, phase: Phase) => ({
  ...model,
  live: model.live.map((l) => (l.id === id ? { id, phase } : l)),
});

const promoted = (model: Model, lane: Option.Option<LaneId>) =>
  Option.match(lane, {
    onNone: () => model,
    onSome: (at) => {
      if (Option.isSome(headOf(model, at))) return model;
      const [next] = queuedOf(model, at);

      return next === undefined ? model : withPhase(model, next.id, Phase.Waiting());
    },
  });

/**
 * The model without one Attempt, its lane's first queued promoted.
 */
export const without = (model: Model, id: string) =>
  promoted({ ...model, live: model.live.filter((l) => l.id !== id) }, laneOfId(model, id));

const policyOf = (reference: Reference, actor: ActorRef, operation: string) =>
  Option.fromUndefinedOr(reference[actor.machine]?.[operation]);

const placed = (
  reference: Reference,
  owner: ActorRef,
  operation: string,
  policy: OperationReference,
  key: Option.Option<Json>,
) =>
  policy.keyFields.length === 0
    ? Option.some(laneOf(owner, reference, operation, {}))
    : Option.map(key, (k) => laneOf(owner, reference, operation, k));

const joined = (model: Model, id: string, phase: Phase) => {
  const lane = laneOfId(model, id);

  if (Option.isNone(lane)) return { ...model, live: [...model.live, { id, phase }] };
  const head = headOf(model, lane.value);

  const policy = Option.match(knownOf(model, id), {
    onNone: () => "reject" as const,
    onSome: (k) => k.policy.concurrency,
  });

  if (Option.isNone(head)) return { ...model, live: [...model.live, { id, phase }] };

  if (policy === "cancel") {
    const replaced = withPhase(model, head.value.id, Phase.Replaced());

    return { ...replaced, live: [...replaced.live, { id, phase }] };
  }

  return { ...model, live: [...model.live, { id, phase: Phase.Queued() }] };
};

/**
 * The model after a `Minted`.
 */
// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
export const mint = (
  model: Model,
  reference: Reference,
  minted: Minted,
): readonly [Model, Found] => {
  if (Option.isNone(minted.actor))
    return [
      model,
      [`WriteLanes I9: ${minted.operation} ${minted.attempt} was minted with no actor`],
    ];
  const owner = minted.actor.value;
  const policy = policyOf(reference, owner, minted.operation);

  if (Option.isNone(policy) || Option.isSome(knownOf(model, minted.attempt))) return [model, []];

  const known: Known = {
    id: minted.attempt,
    owner,
    operation: minted.operation,
    policy: policy.value,
    lane: placed(reference, owner, minted.operation, policy.value, minted.key),
  };

  return [
    joined({ ...model, known: [...model.known, known] }, minted.attempt, Phase.Waiting()),
    [],
  ];
};

const placedBySend = (
  model: Model,
  reference: Reference,
  requests: ReadonlyArray<Request>,
  known: Known,
) => {
  if (Option.isSome(known.lane)) return model;

  const request = requests.find(
    (r) => r.operation === known.operation && Option.contains(r.key, known.id),
  );

  if (request === undefined) return model;
  const lane = Option.some(laneOf(known.owner, reference, known.operation, request.input));

  const phase = Option.match(liveOf(model, known.id), {
    onNone: () => Phase.Waiting(),
    onSome: (l) => l.phase,
  });

  return joined(
    {
      ...model,
      known: model.known.map((k) => (k.id === known.id ? { ...k, lane } : k)),
      live: model.live.filter((l) => l.id !== known.id),
    },
    known.id,
    phase,
  );
};

const permittedResend = (model: Model, owner: ActorRef, heldAt: number) =>
  model.drivenTurns.some((turn) => sameActor(turn.actor, owner) && turn.step > heldAt);

/**
 * The model after a `Sent`, with what the send breaks.
 */
// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
export const sent = (
  model: Model,
  reference: Reference,
  requests: ReadonlyArray<Request>,
  id: string,
): readonly [Model, Found] =>
  Option.match(knownOf(model, id), {
    onNone: () => [model, []],
    onSome: (known) => {
      const at = placedBySend(model, reference, requests, known);
      const live = liveOf(at, id);

      if (Option.isNone(live)) {
        const rejoin = Option.match(laneOfId(at, id), {
          onNone: () => false,
          onSome: (lane) => Option.isNone(headOf(at, lane)),
        });

        const left = Option.isSome(laneOfId(model, id));

        return [
          rejoin ? { ...at, live: [...at.live, { id, phase: Phase.Wire() }] } : at,
          left
            ? [
                `WriteLanes I1: ${known.operation} ${id} was sent after it left its lane (ended, released or lost with its page); only a commit, a promotion or a retry invokes it`,
              ]
            : [],
        ];
      }

      const next = withPhase(at, id, Phase.Wire());
      const what = `${known.operation} ${id}`;

      if (at.cancels.some((c) => c.id === id && c.from === "waiting"))
        return [
          next,
          [
            `WriteLanes I20: ${what} was sent after a cancel found it never sent; it ends NotSent Cancelled by its history`,
          ],
        ];

      return [
        next,
        Phase.$match(live.value.phase, {
          Queued: () => [
            `WriteLanes I11: ${what} was sent while queued behind its lane's head, so it was promoted before the head was resolved or released`,
          ],
          Waiting: () => [],
          Wire: () => [
            `WriteLanes I1: ${what} was sent while already on the wire; only a commit, a promotion or a retry invokes it`,
          ],
          Held: ({ at: heldAt }) =>
            permittedResend(at, known.owner, heldAt)
              ? []
              : [
                  `WriteLanes I12: ${what} was sent while Held, with no suite-driven turn of its actor since it was held; a Held head leaves Held only by a retry, a cancel or a release`,
                ],
          Replaced: () => [`WriteLanes I9: ${what} was sent after a later commit replaced it`],
        }),
      ];
    },
  });

/**
 * What an ending breaks, given the history its head had when the suite cancelled it.
 */
export const byHistory = (from: CancelPending["from"], ended: Ended, id: string) => {
  if (from === "wire" && (ended.channel !== "unknown" || ended.reason !== "Cancelled"))
    return [
      `WriteLanes I20: ${ended.operation} ${id} was on the wire when it was cancelled, so it ends unknown Cancelled by its history; it ended ${ended.channel} ${ended.reason}`,
    ];

  const decline = ended.reason === "Cancelled" || ended.reason === "StorageRefused";

  if (from === "waiting" && (ended.channel !== "failure" || !decline))
    return [
      `WriteLanes I20: ${ended.operation} ${id} was never sent when it was cancelled, so it ends NotSent Cancelled (or StorageRefused) by its history; it ended ${ended.channel} ${ended.reason}`,
    ];

  return [];
};

/**
 * The model after an `Ended`, with what the ending breaks.
 */
// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
export const end = (model: Model, ended: Ended, at: number): readonly [Model, Found] => {
  if (Option.isNone(ended.attempt)) return [model, []];
  const id = ended.attempt.value;
  const mark = model.cancels.find((c) => c.id === id);
  const judged = mark === undefined ? [] : byHistory(mark.from, ended, id);
  const cleared = { ...model, cancels: model.cancels.filter((c) => c.id !== id) };
  const unknown = ended.channel === "unknown";

  return Option.match(liveOf(cleared, id), {
    onNone: () => {
      const rejoin =
        unknown &&
        Option.exists(laneOfId(cleared, id), (lane) => Option.isNone(headOf(cleared, lane)));

      return [
        rejoin
          ? { ...cleared, live: [...cleared.live, { id, phase: Phase.Held({ at }) }] }
          : cleared,
        judged,
      ];
    },
    onSome: (live) => {
      const next =
        unknown && addressable(live)
          ? withPhase(cleared, id, Phase.Held({ at }))
          : without(cleared, id);

      if (!Phase.$is("Queued")(live.phase) || ended.channel === "failure") return [next, judged];

      return [
        next,
        [
          ...judged,
          `WriteLanes I11: ${ended.operation} ${id} ended ${ended.channel} while queued behind its head, never sent`,
        ],
      ];
    },
  });
};

/**
 * The model after `Superseded` evidence, with what it breaks.
 */
// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
export const superseded = (model: Model, id: string): readonly [Model, Found] =>
  Option.match(Option.all([knownOf(model, id), liveOf(model, id)]), {
    onNone: () => [model, []],
    onSome: ([known, live]) => {
      const what = `${known.operation} ${id}`;
      const next = without(model, id);

      if (known.policy.concurrency !== "latest")
        return [
          next,
          [
            `WriteLanes I8: ${what} was superseded under ${known.policy.concurrency}; only latest replaces a queued commit`,
          ],
        ];

      if (Phase.$is("Queued")(live.phase) || Phase.$is("Waiting")(live.phase)) return [next, []];

      return [
        next,
        [
          `WriteLanes I8: ${what} was superseded while ${live.phase._tag}; latest replaces only a queued commit or a never-sent head`,
        ],
      ];
    },
  });

/**
 * Each lane's queue past its policy's bound and each lane with more than one head.
 */
export const bounds = (model: Model) =>
  lanesOf(model).flatMap((lane) => {
    const queued = queuedOf(model, lane).length;
    const heads = inLane(model, lane).filter(addressable).length;

    const policy = Option.match(
      Option.flatMap(Option.fromUndefinedOr(inLane(model, lane)[0]), (l) => knownOf(model, l.id)),
      { onNone: () => "reject" as const, onSome: (k) => k.policy.concurrency },
    );

    const bound = BOUND[policy];

    const found: Array<string> = [];

    if (queued > bound)
      found.push(
        `WriteLanes I8: ${named(lane)} holds ${queued} queued commits under ${policy}, past its bound of ${bound}`,
      );

    if (heads > 1) found.push(`WriteLanes I9: ${named(lane)} has ${heads} addressable Attempts`);

    return found;
  });
