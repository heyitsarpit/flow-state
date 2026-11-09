import { Option } from "effect";
import type { OperationReference, Reference } from "../fixtures/reference.ts";
import { type ActorRef, Observation, sameActor, sameJson } from "../port.ts";
import { Fact, type Facts, type Oracle, steps } from "./oracle.ts";

type Phase = "queued" | "waiting" | "wire" | "held" | "replaced";

type Tracked = { readonly id: string; readonly phase: Phase };

type Lane = {
  readonly actor: ActorRef;
  readonly operation: string;
  readonly policy: OperationReference;
  readonly attempts: ReadonlyArray<Tracked>;
};

type Cancelled = { readonly id: string; readonly from: "waiting" | "wire" };

type Model = {
  readonly lanes: Map<string, Lane>;
  readonly laneOf: Map<string, string>;
  readonly cancelled: Map<string, Cancelled>;
  readonly unstoppable: Set<string>;
};

type Ended = Extract<Observation, { readonly _tag: "Ended" }>;

const BOUND = { reject: 0, latest: 1, serialize: 64, cancel: 0 } as const;

const ADDRESSABLE: ReadonlyArray<Phase> = ["waiting", "wire", "held"];

const laneKey = (actor: ActorRef, operation: string) => `${actor.machine}/${actor.id} ${operation}`;

const addressable = (attempt: Tracked) => ADDRESSABLE.includes(attempt.phase);

const headOf = (lane: Lane) => Option.fromUndefinedOr(lane.attempts.find(addressable));

const queuedOf = (lane: Lane) => lane.attempts.filter((a) => a.phase === "queued");

const unkeyed = (operation: OperationReference) =>
  operation.attempts && operation.keyFields.length === 0;

const writeOf = (reference: Reference, actor: ActorRef, operation: string) =>
  Option.filter(Option.fromUndefinedOr(reference[actor.machine]?.[operation]), unkeyed);

const withPhase = (lane: Lane, id: string, phase: Phase) => ({
  ...lane,
  attempts: lane.attempts.map((a) => (a.id === id ? { id, phase } : a)),
});

const promoted = (lane: Lane) => {
  if (Option.isSome(headOf(lane))) return lane;
  const [next] = queuedOf(lane);

  return next === undefined ? lane : withPhase(lane, next.id, "waiting");
};

const without = (lane: Lane, id: string) =>
  promoted({ ...lane, attempts: lane.attempts.filter((a) => a.id !== id) });

const phaseIn = (lane: Lane, id: string) =>
  Option.fromUndefinedOr(lane.attempts.find((a) => a.id === id)?.phase);

const laneOfAttempt = (model: Model, id: string) =>
  Option.flatMap(Option.fromUndefinedOr(model.laneOf.get(id)), (key) =>
    Option.map(Option.fromUndefinedOr(model.lanes.get(key)), (lane) => [key, lane] as const),
  );

const mint = (model: Model, reference: Reference, minted: Observation) => {
  if (!Observation.$is("Minted")(minted) || Option.isNone(minted.actor)) return;
  const actor = minted.actor.value;
  const policy = writeOf(reference, actor, minted.operation);

  if (Option.isNone(policy)) return;
  const key = laneKey(actor, minted.operation);

  const lane = model.lanes.get(key) ?? {
    actor,
    operation: minted.operation,
    policy: policy.value,
    attempts: [],
  };

  const head = headOf(lane);
  model.laneOf.set(minted.attempt, key);

  if (Option.isNone(head)) {
    model.lanes.set(key, {
      ...lane,
      attempts: [...lane.attempts, { id: minted.attempt, phase: "waiting" }],
    });

    return;
  }

  const replaced =
    policy.value.concurrency === "cancel" ? withPhase(lane, head.value.id, "replaced") : lane;

  const phase = policy.value.concurrency === "cancel" ? "waiting" : "queued";
  model.lanes.set(key, {
    ...replaced,
    attempts: [...replaced.attempts, { id: minted.attempt, phase }],
  });
};

const rejoined = (lane: Lane, id: string, phase: Phase) =>
  Option.isSome(headOf(lane)) ? lane : { ...lane, attempts: [...lane.attempts, { id, phase }] };

const sent = (model: Model, id: string) =>
  Option.match(laneOfAttempt(model, id), {
    onNone: () => [],
    onSome: ([key, lane]) => {
      const phase = phaseIn(lane, id);

      if (Option.isNone(phase)) {
        model.lanes.set(key, rejoined(lane, id, "wire"));

        return [];
      }

      const head = headOf(lane);
      model.lanes.set(key, withPhase(lane, id, "wire"));

      if (model.cancelled.get(id)?.from === "waiting")
        return [
          `WriteLanes I20: ${lane.operation} ${id} was sent after a cancel found it never sent; it ends NotSent Cancelled by its history`,
        ];

      if (phase.value === "replaced")
        return [`WriteLanes I9: ${lane.operation} ${id} was sent after a later commit replaced it`];

      if (phase.value !== "queued") return [];

      return [
        `WriteLanes I11: ${lane.operation} ${id} was sent while ${Option.match(head, { onNone: () => "no head", onSome: (h) => `the head ${h.id} was ${h.phase}` })}, so it was promoted before the head was resolved or released`,
      ];
    },
  });

const byHistory = (mark: Cancelled, ended: Ended, id: string) => {
  if (mark.from === "wire" && (ended.channel !== "unknown" || ended.reason !== "Cancelled"))
    return [
      `WriteLanes I20: ${ended.operation} ${id} was on the wire when it was cancelled, so it ends unknown Cancelled by its history; it ended ${ended.channel} ${ended.reason}`,
    ];

  const decline = ended.reason === "Cancelled" || ended.reason === "StorageRefused";

  if (mark.from === "waiting" && (ended.channel !== "failure" || !decline))
    return [
      `WriteLanes I20: ${ended.operation} ${id} was never sent when it was cancelled, so it ends NotSent Cancelled (or StorageRefused) by its history; it ended ${ended.channel} ${ended.reason}`,
    ];

  return [];
};

const cancelledRight = (model: Model, ended: Ended, id: string) => {
  const mark = model.cancelled.get(id);
  model.cancelled.delete(id);

  return mark === undefined ? [] : byHistory(mark, ended, id);
};

const afterEnding = (ended: Ended, phase: Phase) =>
  ended.channel === "unknown" && ADDRESSABLE.includes(phase) ? "held" : "gone";

const end = (model: Model, ended: Ended) => {
  if (Option.isNone(ended.attempt)) return [];
  const id = ended.attempt.value;
  const judged = cancelledRight(model, ended, id);

  return Option.match(laneOfAttempt(model, id), {
    onNone: () => judged,
    onSome: ([key, lane]) => {
      const phase = phaseIn(lane, id);

      if (Option.isNone(phase)) {
        if (ended.channel === "unknown") model.lanes.set(key, rejoined(lane, id, "held"));

        return judged;
      }

      const queuedOk = phase.value !== "queued" || ended.channel === "failure";

      model.lanes.set(
        key,
        afterEnding(ended, phase.value) === "held"
          ? withPhase(lane, id, "held")
          : without(lane, id),
      );

      if (queuedOk) return judged;

      return [
        ...judged,
        `WriteLanes I11: ${lane.operation} ${id} ended ${ended.channel} while queued behind its head, never sent`,
      ];
    },
  });
};

const evidence = (model: Model, observed: Observation) => {
  if (!Observation.$is("Evidence")(observed) || Option.isNone(observed.attempt)) return [];
  const id = observed.attempt.value;

  if (observed.kind !== "Superseded" && observed.kind !== "Released") return [];

  return Option.match(laneOfAttempt(model, id), {
    onNone: () => [],
    onSome: ([key, lane]) => {
      const phase = phaseIn(lane, id);
      model.lanes.set(key, without(lane, id));

      if (observed.kind === "Released" || Option.isNone(phase)) return [];

      if (lane.policy.concurrency !== "latest")
        return [
          `WriteLanes I8: ${lane.operation} ${id} was superseded under ${lane.policy.concurrency}; only latest replaces a queued commit`,
        ];

      if (phase.value === "queued" || phase.value === "waiting") return [];

      return [
        `WriteLanes I8: ${lane.operation} ${id} was superseded while ${phase.value}; latest replaces only a queued commit or a never-sent head`,
      ];
    },
  });
};

const bounds = (model: Model) =>
  [...model.lanes.values()].flatMap((lane) => {
    const queued = queuedOf(lane).length;
    const heads = lane.attempts.filter(addressable).length;
    const bound = BOUND[lane.policy.concurrency];

    const found =
      queued > bound
        ? [
            `WriteLanes I8: ${lane.actor.machine}/${lane.actor.id} ${lane.operation} holds ${queued} queued commits under ${lane.policy.concurrency}, past its bound of ${bound}`,
          ]
        : [];

    return heads > 1
      ? [
          ...found,
          `WriteLanes I9: ${lane.actor.machine}/${lane.actor.id} ${lane.operation} has ${heads} addressable Attempts`,
        ]
      : found;
  });

const releasedIn = (window: ReadonlyArray<Observation>, id: string) =>
  window.some(
    (o) =>
      Observation.$is("Evidence")(o) && o.kind === "Released" && Option.contains(o.attempt, id),
  );

const endedIn = (window: ReadonlyArray<Observation>, operation: string) =>
  window.flatMap((o) =>
    Observation.$is("Ended")(o) && o.operation === operation ? Option.toArray(o.attempt) : [],
  );

const queueEnded = (lane: Lane, window: ReadonlyArray<Observation>) => {
  const queued = queuedOf(lane).map((a) => a.id);
  const ended = endedIn(window, lane.operation).filter((id) => queued.includes(id));

  const declined = (id: string) =>
    window.some(
      (o) =>
        Observation.$is("Ended")(o) &&
        Option.contains(o.attempt, id) &&
        o.channel === "failure" &&
        o.reason === "Cancelled",
    );

  const missing = queued.filter((id) => !declined(id));

  if (missing.length > 0)
    return [
      `WriteLanes I21: cancelAll left ${lane.operation} ${missing.join(", ")} queued or ended it otherwise; every queued commit ends NotSent Cancelled`,
    ];

  return sameJson(ended, queued)
    ? []
    : [
        `WriteLanes I21: cancelAll ended ${lane.operation}'s queue as ${ended.join(", ")}; mint order is ${queued.join(", ")}`,
      ];
};

const sentIn = (window: ReadonlyArray<Observation>, id: string) =>
  window.some((o) => Observation.$is("Sent")(o) && o.attempt === id);

const idleCancel = (lane: Lane, window: ReadonlyArray<Observation>) => {
  const ended = window.filter(
    (o) => Observation.$is("Ended")(o) && o.operation === lane.operation,
  ).length;

  return ended === 0
    ? []
    : [
        `WriteLanes I20: a cancel on ${lane.operation}'s Idle lane does nothing; ${ended} ending(s) were reported`,
      ];
};

const headByHistory = (model: Model, lane: Lane, window: ReadonlyArray<Observation>) =>
  Option.match(headOf(lane), {
    onNone: () => idleCancel(lane, window),
    onSome: (head) => {
      if (head.phase === "held")
        return releasedIn(window, head.id)
          ? []
          : [
              `WriteLanes I12: a cancel on ${lane.operation}'s Held head ${head.id} releases it; no Released was reported`,
            ];

      const mark: Cancelled = { id: head.id, from: head.phase === "wire" ? "wire" : "waiting" };

      if (mark.from === "waiting" && sentIn(window, head.id))
        return [
          `WriteLanes I20: ${lane.operation} ${head.id} was sent after a cancel found it never sent; it ends NotSent Cancelled by its history`,
        ];

      const already = window
        .filter(Observation.$is("Ended"))
        .find((o) => Option.contains(o.attempt, head.id));

      if (already !== undefined) return byHistory(mark, already, head.id);
      model.cancelled.set(head.id, mark);

      return [];
    },
  });

const deliveredAt = (window: ReadonlyArray<Observation>, id: string) =>
  window.findIndex((o) => Observation.$is("Delivered")(o) && Option.contains(o.attempt, id));

const holdLast = (lane: Lane, window: ReadonlyArray<Observation>) =>
  Option.match(headOf(lane), {
    onNone: () => [],
    onSome: (head) => {
      const heard = deliveredAt(window, head.id);
      const later = queuedOf(lane).filter((a) => deliveredAt(window, a.id) > heard);

      if (head.phase !== "wire" || heard < 0 || later.length === 0) return [];

      return [
        `WriteLanes I21: cancelAll delivered the head ${head.id}'s hold-leaving ending before the queued ${later.map((a) => a.id).join(", ")}; the head's comes last`,
      ];
    },
  });

const cancels = (
  model: Model,
  reference: Reference,
  before: ReadonlyMap<string, Lane>,
  turn: Extract<Observation, { readonly _tag: "Turn" }>,
  window: ReadonlyArray<Observation>,
) =>
  Object.entries(reference[turn.actor.machine] ?? {}).flatMap(([operation, policy]) => {
    const verb = policy.cancels[turn.event];

    if (verb === undefined || !unkeyed(policy)) return [];

    const lane = before.get(laneKey(turn.actor, operation)) ?? {
      actor: turn.actor,
      operation,
      policy,
      attempts: [],
    };

    return verb === "cancelAll"
      ? [
          ...queueEnded(lane, window),
          ...headByHistory(model, lane, window),
          ...holdLast(lane, window),
        ]
      : headByHistory(model, lane, window);
  });

const unended = (model: Model) =>
  [...model.cancelled.values()].flatMap((mark) => {
    const lane = laneOfAttempt(model, mark.id);
    const operation = Option.match(lane, { onNone: () => "", onSome: ([, l]) => l.operation });

    if (mark.from !== "wire" || model.unstoppable.has(operation)) return [];

    return [
      `WriteLanes I20: ${operation} ${mark.id} was cancelled on the wire of an interruptible call and did not end in that step`,
    ];
  });

// RETURN_TYPE: the Model record; inference would widen its empty collections.
const fresh = (): Model => ({
  lanes: new Map(),
  laneOf: new Map(),
  cancelled: new Map(),
  unstoppable: new Set(),
});

const forget = (model: Model) => {
  for (const [key, lane] of model.lanes) model.lanes.set(key, { ...lane, attempts: [] });
  model.cancelled.clear();
};

type Pending = {
  readonly turn: Extract<Observation, { readonly _tag: "Turn" }>;
  readonly before: ReadonlyMap<string, Lane>;
  readonly from: number;
};

const judgeStep = (model: Model, facts: Facts, step: ReadonlyArray<Fact>) => {
  let before = new Map(model.lanes);
  let from = 0;
  const reports: Array<Observation> = [];
  const pending: Array<Pending> = [];
  const drove: Array<{ readonly actor: ActorRef; readonly event: string }> = [];

  const atTurn = (turn: Extract<Observation, { readonly _tag: "Turn" }>) => {
    const at = drove.findIndex((d) => d.event === turn.event && sameActor(d.actor, turn.actor));

    if (at >= 0) {
      drove.splice(at, 1);
      pending.push({ turn, before, from });
    }

    before = new Map(model.lanes);
    from = reports.length;

    return bounds(model);
  };

  const one = (fact: Fact) => {
    if (Fact.$is("Reloaded")(fact)) forget(model);

    if (Fact.$is("Unstoppable")(fact)) model.unstoppable.add(fact.operation);

    if (Fact.$is("Drove")(fact)) drove.push(fact);

    if (!Fact.$is("Reported")(fact)) return [];
    const observed = fact.observation;
    reports.push(observed);

    if (Observation.$is("Turn")(observed)) return atTurn(observed);
    mint(model, facts.reference, observed);

    if (Observation.$is("Sent")(observed)) return sent(model, observed.attempt);

    if (Observation.$is("Ended")(observed)) return end(model, observed);

    return evidence(model, observed);
  };

  const found = step.flatMap(one);

  const judged = pending.flatMap((p) =>
    cancels(model, facts.reference, p.before, p.turn, reports.slice(p.from)),
  );

  return [...found, ...judged, ...bounds(model), ...unended(model)];
};

/**
 * Each write lane keeps its cells: at most one addressable Attempt, a queue within its policy's
 * bound, promotion only past a resolved or released head, a Held head left only by a retry, a
 * cancel or a release, and every cancel judged by the head's history.
 *
 * **Details**
 *
 * A model of each lane, built from the runtime's reports in order: `Minted` adds an Attempt (the
 * head on an Idle lane; queued under `latest` and `serialize`; under `cancel` it replaces the
 * head), `Sent` puts the head on the wire, an unknown ending holds it, a definite ending or
 * `Released` resolves it and promotes the first queued commit, and `Superseded` drops one. Checks:
 * - after each turn and at the end of each step, the queue is within its policy's bound (0 under
 *   reject; 1 under latest; 64 under serialize; 0 under cancel, whose commit replaces the head, R7)
 *   and a lane has one addressable Attempt;
 * - a queued Attempt is never sent or ended on a channel other than failure (it is promoted only
 *   once the head is resolved or released; an unknown never promotes);
 * - `Superseded` names only a queued commit or a never-sent head, and only under `latest`;
 * - on a turn of an event the suite sent whose handler the fixture's reference says cancels the
 *   operation, by the head's history before that turn, judged over the reports from that turn to
 *   the end of its step (one action of the suite, settled): a Held head is released; a head on the
 *   wire ends `unknown Cancelled`, within the step unless the suite made the call uninterruptible;
 *   a never-sent head is never sent and ends `NotSent Cancelled` (or `StorageRefused`); an Idle
 *   lane ends nothing (evidence is allowed). A `cancelAll` also ends every queued commit
 *   `NotSent Cancelled`, in mint order, and a head on the wire is delivered after them.
 *
 * **Gotchas**
 *
 * - Anchored to the suite's own facts: the events it sent, the calls it made uninterruptible, and
 *   the fixtures' references (policy, bound, which events cancel). Which Attempt was minted, sent
 *   or released is the runtime's report, so the rest checks consistency against the Spec's cells;
 *   `attempt-identity` anchors every received send to a reported one.
 * - The Port's `Minted` carries no key, so only unkeyed operations are judged, where an actor's
 *   operation is exactly one lane. A keyed operation waits for the Attempt's key on `Minted`. A
 *   mint with no actor is not modelled.
 * - A reload empties the lanes and drops the pending cancel judgments: what the disk carries is
 *   the restore oracle's. An Attempt known from before rejoins its lane as the head, when a report
 *   names it again and the lane has none.
 */
export const laneCells: Oracle = {
  name: "lane-cells",
  guarantee: "WriteLanes I8, I9, I11, I12, I20, I21",
  check: (facts: Facts) => {
    const model = fresh();

    return steps(facts.timeline).flatMap((step) => judgeStep(model, facts, step));
  },
};
