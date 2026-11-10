import { type Data, Option } from "effect";
import type { Reference } from "../fixtures/reference.ts";
import {
  type ActorRef,
  type Ended,
  type Minted,
  Observation,
  sameActor,
  sameJson,
  type Turn,
} from "../port.ts";
import { Fact, type Facts, type Oracle, steps } from "../dsl/oracle.ts";
import {
  ADDRESSABLE,
  BOUND,
  type Cancelled,
  type Lane,
  type Model,
  type Phase,
  addressable,
  forget,
  fresh,
  headOf,
  laneKey,
  laneOfAttempt,
  phaseIn,
  queuedOf,
  unkeyed,
  withPhase,
  without,
  writeOf,
} from "./lane-model.ts";

const permittedResend = (model: Model, actor: ActorRef, id: string) => {
  const heldAt = model.heldAt.get(id) ?? Infinity;

  return model.drivenTurns.some((turn) => sameActor(turn.actor, actor) && turn.step > heldAt);
};

const mint = (model: Model, reference: Reference, minted: Minted) => {
  if (Option.isNone(minted.actor))
    return [`WriteLanes I9: ${minted.operation} ${minted.attempt} was minted with no actor`];

  const actor = minted.actor.value;
  const policy = writeOf(reference, actor, minted.operation);

  if (Option.isNone(policy)) return [];
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

    return [];
  }

  const replaced =
    policy.value.concurrency === "cancel" ? withPhase(lane, head.value.id, "replaced") : lane;

  const phase = policy.value.concurrency === "cancel" ? "waiting" : "queued";
  model.lanes.set(key, {
    ...replaced,
    attempts: [...replaced.attempts, { id: minted.attempt, phase }],
  });

  return [];
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

      if (phase.value === "held")
        return permittedResend(model, lane.actor, id)
          ? []
          : [
              `WriteLanes I12: ${lane.operation} ${id} was sent while Held, with no suite-driven turn of its actor since it was held; a Held head leaves Held only by a retry, a cancel or a release`,
            ];

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

const end = (model: Model, ended: Ended, at: number) => {
  if (Option.isNone(ended.attempt)) return [];
  const id = ended.attempt.value;
  const judged = cancelledRight(model, ended, id);

  return Option.match(laneOfAttempt(model, id), {
    onNone: () => judged,
    onSome: ([key, lane]) => {
      const phase = phaseIn(lane, id);

      if (Option.isNone(phase)) {
        if (ended.channel === "unknown") {
          model.heldAt.set(id, at);
          model.lanes.set(key, rejoined(lane, id, "held"));
        }

        return judged;
      }

      const queuedOk = phase.value !== "queued" || ended.channel === "failure";
      const holds = afterEnding(ended, phase.value) === "held";

      if (holds) model.heldAt.set(id, at);
      model.lanes.set(key, holds ? withPhase(lane, id, "held") : without(lane, id));

      if (queuedOk) return judged;

      return [
        ...judged,
        `WriteLanes I11: ${lane.operation} ${id} ended ${ended.channel} while queued behind its head, never sent`,
      ];
    },
  });
};

const evidence = (model: Model, observed: Data.TaggedEnum.Value<Observation, "Evidence">) => {
  if (Option.isNone(observed.attempt)) return [];
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
  turn: Turn,
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

type Pending = {
  readonly turn: Turn;
  readonly before: ReadonlyMap<string, Lane>;
  readonly from: number;
};

const judgeStep = (model: Model, facts: Facts, step: ReadonlyArray<Fact>, at: number) => {
  const driven = step.some((fact) => Fact.$is("Drove")(fact) || Fact.$is("Answered")(fact));
  let before = new Map(model.lanes);
  let from = 0;
  const reports: Array<Observation> = [];
  const pending: Array<Pending> = [];
  const drove: Array<{ readonly actor: ActorRef; readonly event: string }> = [];

  const atTurn = (turn: Turn) => {
    const at = drove.findIndex((d) => d.event === turn.event && sameActor(d.actor, turn.actor));

    if (at >= 0) {
      drove.splice(at, 1);
      pending.push({ turn, before, from });
    }

    before = new Map(model.lanes);
    from = reports.length;

    return bounds(model);
  };

  const reported = (observed: Observation) => {
    reports.push(observed);

    return Observation.$match(observed, {
      Turn: (turn) => {
        if (driven) model.drivenTurns.push({ actor: turn.actor, step: at });

        return atTurn(turn);
      },
      Minted: (minted) => mint(model, facts.reference, minted),
      Sent: ({ attempt }) => sent(model, attempt),
      Ended: (ended) => end(model, ended, at),
      Delivered: () => [],
      Parked: () => [],
      Unparked: () => [],
      Recorded: () => [],
      Unhandled: () => [],
      Denied: () => [],
      Evidence: (observed) => evidence(model, observed),
      Issue: () => [],
      RuntimeDisposed: () => [],
    });
  };

  const one = (fact: Fact) =>
    Fact.$match(fact, {
      Stepped: () => [],
      Requested: () => [],
      Answered: () => [],
      Reported: ({ observation }) => reported(observation),
      Reloaded: () => {
        forget(model);

        return [];
      },
      Disposed: () => [],
      Forgot: () => [],
      Ensured: () => [],
      Released: () => [],
      DisposingRuntime: () => [],
      Drove: (drive) => {
        drove.push(drive);

        return [];
      },
      Unstoppable: ({ operation }) => {
        model.unstoppable.add(operation);

        return [];
      },
      Advanced: () => [],
      Read: () => [],
    });

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
 * - a Held head is sent again only after a retry the suite could have caused: a turn of its actor
 *   in a step the suite drove, in a step after the one that held it (see Gotchas);
 * - a `Minted` names its actor, so the lane it joins is known;
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
 *   mint with no actor is itself a violation: an unattributed Attempt cannot be placed in a lane.
 * - The timeline names no retry events, so the re-send of a Held head is anchored to the suite's
 *   own steps, not to the retry verb. A send of a Held head passes when a turn of the head's actor
 *   ran in a step the suite drove (a `Drove` or an `Answered` in it), reported after the step that
 *   held the head. A turn in the hold's own step does not count, so a re-send on the hold is caught.
 *   Limit: any driven turn of the actor permits the re-send, even one whose handler does not retry,
 *   so a re-send that rides on an unrelated event the suite sent is not caught. A retry's send lands
 *   a step after its turn (once the store acknowledges, as Pay's intent read does), so the cause
 *   cannot be required in the send's own step.
 * - A reload empties the lanes and drops the pending cancel judgments: what the disk carries is
 *   the restore oracle's. An Attempt known from before rejoins its lane as the head, when a report
 *   names it again and the lane has none.
 */
export const laneQueue: Oracle = {
  name: "lane-queue",
  guarantee: "WriteLanes I8, I9, I11, I12, I20, I21",
  check: (facts: Facts) => {
    const model = fresh();

    return steps(facts.timeline).flatMap((step, at) => judgeStep(model, facts, step, at));
  },
};
