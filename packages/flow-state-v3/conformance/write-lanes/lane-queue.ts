import { Array as Arr, Option } from "effect";
import type { LaneId } from "../dsl/domain.ts";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import type { OperationReference, Reference } from "../fixtures/reference.ts";
import { type ActorRef, type Ended, Observation, sameActor, sameJson, type Turn } from "../port.ts";
import type { Request } from "../world/network.ts";
import {
  addressable,
  bounds,
  byHistory,
  type CancelPending,
  EMPTY,
  end,
  type Found,
  knownOf,
  laneOfId,
  type Live,
  mint,
  type Model,
  Phase,
  queuedOf,
  sent,
  superseded,
  without,
} from "./lane-model.ts";

const releasedIn = (window: ReadonlyArray<Observation>, id: string) =>
  window.some(
    (o) =>
      Observation.$is("Evidence")(o) && o.kind === "Released" && Option.contains(o.attempt, id),
  );

const endedIn = (window: ReadonlyArray<Observation>, operation: string) =>
  window.flatMap((o) =>
    Observation.$is("Ended")(o) && o.operation === operation ? Option.toArray(o.attempt) : [],
  );

const queueEnded = (before: Model, lane: LaneId, window: ReadonlyArray<Observation>) => {
  const queued = queuedOf(before, lane).map((l) => l.id);
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

const deliveredAt = (window: ReadonlyArray<Observation>, id: string) =>
  Arr.findFirstIndex(
    window,
    (o) => Observation.$is("Delivered")(o) && Option.contains(o.attempt, id),
  );

const holdLast = (before: Model, lane: LaneId, head: Live, window: ReadonlyArray<Observation>) => {
  const heard = deliveredAt(window, head.id);

  if (!Phase.$is("Wire")(head.phase) || Option.isNone(heard)) return [];

  const later = queuedOf(before, lane).filter((l) =>
    Option.exists(deliveredAt(window, l.id), (at) => at > heard.value),
  );

  if (later.length === 0) return [];

  return [
    `WriteLanes I21: cancelAll delivered the head ${head.id}'s hold-leaving ending before the queued ${later.map((l) => l.id).join(", ")}; the head's comes last`,
  ];
};

const committedBy = (
  before: Model,
  window: ReadonlyArray<Observation>,
  actor: ActorRef,
  ended: Ended,
) =>
  Option.match(ended.attempt, {
    onNone: () =>
      Option.match(ended.actor, { onNone: () => true, onSome: (a) => sameActor(a, actor) }),
    onSome: (id) =>
      Option.exists(knownOf(before, id), (k) => sameActor(k.owner, actor)) ||
      window.some(
        (o) =>
          Observation.$is("Minted")(o) &&
          o.attempt === id &&
          Option.exists(o.actor, (a) => sameActor(a, actor)),
      ),
  });

const idleCancel = (
  before: Model,
  actor: ActorRef,
  operation: string,
  window: ReadonlyArray<Observation>,
) => {
  const ended = window
    .filter(Observation.$is("Ended"))
    .filter((o) => o.operation === operation && committedBy(before, window, actor, o));

  return ended.length === 0
    ? []
    : [
        `WriteLanes I20: a cancel on ${operation}'s Idle lane does nothing; ${ended.length} ending(s) were reported`,
      ];
};

type Judged = readonly [ReadonlyArray<CancelPending>, Found];

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const headByHistory = (operation: string, head: Live, window: ReadonlyArray<Observation>): Judged =>
  Phase.$match(head.phase, {
    Held: () =>
      [
        [],
        releasedIn(window, head.id)
          ? []
          : [
              `WriteLanes I12: a cancel on ${operation}'s Held head ${head.id} releases it; no Released was reported`,
            ],
      ] as const,
    Wire: () => fromHistory(operation, { id: head.id, from: "wire" }, window),
    Waiting: () => fromHistory(operation, { id: head.id, from: "waiting" }, window),
    Queued: () => [[], []] as const,
    Replaced: () => [[], []] as const,
  });

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const fromHistory = (
  operation: string,
  mark: CancelPending,
  window: ReadonlyArray<Observation>,
): Judged => {
  const sentAfter = window.some((o) => Observation.$is("Sent")(o) && o.attempt === mark.id);

  if (mark.from === "waiting" && sentAfter)
    return [
      [],
      [
        `WriteLanes I20: ${operation} ${mark.id} was sent after a cancel found it never sent; it ends NotSent Cancelled by its history`,
      ],
    ];

  const already = window
    .filter(Observation.$is("Ended"))
    .find((o) => Option.contains(o.attempt, mark.id));

  return already === undefined ? [[mark], []] : [[], byHistory(mark.from, already, mark.id)];
};

// RETURN_TYPE: a [pending cancels, violations] pair; the branches' literal arrays would infer different tuples.
const cancelOne = (
  before: Model,
  turn: Turn,
  window: ReadonlyArray<Observation>,
  operation: string,
  policy: OperationReference,
): Judged => {
  const verb = policy.cancels[turn.event];

  if (verb === undefined) return [[], []];

  const heads = before.live.filter(
    (l) =>
      addressable(l) &&
      Option.exists(
        knownOf(before, l.id),
        (k) => k.operation === operation && sameActor(k.owner, turn.actor),
      ),
  );

  const [head] = heads;

  if (head === undefined) return [[], idleCancel(before, turn.actor, operation, window)];

  if (heads.length > 1) return [[], []];
  const [marks, found] = headByHistory(operation, head, window);
  const lane = laneOfId(before, head.id);

  if (verb === "cancel" || Option.isNone(lane)) return [marks, found];

  return [
    marks,
    [
      ...queueEnded(before, lane.value, window),
      ...found,
      ...holdLast(before, lane.value, head, window),
    ],
  ];
};

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const cancelsOn = (
  before: Model,
  reference: Reference,
  turn: Turn,
  window: ReadonlyArray<Observation>,
): Judged => {
  const judged = Object.entries(reference[turn.actor.machine] ?? {}).map(([operation, policy]) =>
    cancelOne(before, turn, window, operation, policy),
  );

  return [judged.flatMap(([marks]) => marks), judged.flatMap(([, found]) => found)];
};

const unanchoredReleases = (model: Model, reports: ReadonlyArray<Observation>) =>
  reports.flatMap((o) => {
    if (!Observation.$is("Evidence")(o) || o.kind !== "Released") return [];

    return Option.match(
      Option.flatMap(o.attempt, (id) => knownOf(model, id)),
      {
        onNone: () => [],
        onSome: (known) => {
          const cancelTurn = reports.some(
            (r) =>
              Observation.$is("Turn")(r) &&
              sameActor(r.actor, known.owner) &&
              (known.policy.cancels[r.event] !== undefined ||
                known.policy.mayCancel.some(
                  (t) => t.event === r.event && t.from === r.from && t.to === r.to,
                )),
          );

          return cancelTurn
            ? []
            : [
                `WriteLanes I12: ${known.operation} ${known.id} was reported Released in a step with no turn of its actor on an event that cancels it; a Held lane leaves Held only by a retry, a cancel or a release on leave`,
              ];
        },
      },
    );
  });

const unended = (model: Model) =>
  model.cancels.flatMap((mark) => {
    const operation = Option.match(knownOf(model, mark.id), {
      onNone: () => mark.id,
      onSome: (k) => k.operation,
    });

    if (mark.from !== "wire" || model.unstoppable.includes(operation)) return [];

    return [
      `WriteLanes I20: ${operation} ${mark.id} was cancelled on the wire of an interruptible call and did not end in that step`,
    ];
  });

type Pending = { readonly turn: Turn; readonly before: Model; readonly from: number };

type Walk = {
  readonly model: Model;
  readonly reports: ReadonlyArray<Observation>;
  readonly before: Model;
  readonly from: number;
  readonly pending: ReadonlyArray<Pending>;
  readonly drove: ReadonlyArray<{ readonly actor: ActorRef; readonly event: string }>;
  readonly found: Found;
};

type Step = {
  readonly reference: Reference;
  readonly requests: ReadonlyArray<Request>;
  readonly at: number;
  readonly driven: boolean;
};

const flushed = (walk: Walk, reference: Reference) => {
  const judged = walk.pending.map((p) =>
    cancelsOn(p.before, reference, p.turn, walk.reports.slice(p.from)),
  );

  const model = { ...walk.model, cancels: [...walk.model.cancels, ...judged.flatMap(([m]) => m)] };

  return { ...walk, model, pending: [], found: [...walk.found, ...judged.flatMap(([, f]) => f)] };
};

const reloadedLive = (model: Model, at: number) =>
  model.live.flatMap((l) =>
    Phase.$match(l.phase, {
      Queued: () => [],
      Waiting: () => [],
      Wire: () => [{ id: l.id, phase: Phase.Held({ at }) }],
      Held: () => [l],
      Replaced: () => [],
    }),
  );

const atTurn = (walk: Walk, step: Step, turn: Turn) => {
  const at = Arr.findFirstIndex(
    walk.drove,
    (d) => d.event === turn.event && sameActor(d.actor, turn.actor),
  );

  const model = step.driven
    ? {
        ...walk.model,
        drivenTurns: [...walk.model.drivenTurns, { actor: turn.actor, step: step.at }],
      }
    : walk.model;

  return {
    ...walk,
    model,
    pending: Option.match(at, {
      onNone: () => walk.pending,
      onSome: () => [...walk.pending, { turn, before: walk.before, from: walk.from }],
    }),
    drove: Option.match(at, {
      onNone: () => walk.drove,
      onSome: (i) => walk.drove.toSpliced(i, 1),
    }),
    before: model,
    from: walk.reports.length,
    found: [...walk.found, ...bounds(model)],
  };
};

const reported = (walk: Walk, step: Step, observed: Observation) => {
  const seen = { ...walk, reports: [...walk.reports, observed] };

  const apply = ([model, found]: readonly [Model, Found]) => ({
    ...seen,
    model,
    found: [...seen.found, ...found],
  });

  return Observation.$match(observed, {
    Turn: (turn) => atTurn(seen, step, turn),
    Minted: (minted) => apply(mint(seen.model, step.reference, minted)),
    Sent: ({ attempt }) => apply(sent(seen.model, step.reference, step.requests, attempt)),
    Ended: (ended) => apply(end(seen.model, ended, step.at)),
    Delivered: () => seen,
    Parked: () => seen,
    Unparked: () => seen,
    Recorded: () => seen,
    Unhandled: () => seen,
    Denied: () => seen,
    Evidence: ({ kind, attempt }) =>
      Option.match(attempt, {
        onNone: () => seen,
        onSome: (id) => {
          if (kind === "Superseded") return apply(superseded(seen.model, id));

          return kind === "Released" ? apply([without(seen.model, id), []]) : seen;
        },
      }),
    Issue: () => seen,
    Incarnated: () => seen,
    Finished: () => seen,
    RuntimeDisposed: () => seen,
  });
};

const learned = (walk: Walk, step: Step, fact: Fact) =>
  Fact.$match(fact, {
    Stepped: () => walk,
    Requested: () => walk,
    Answered: () => walk,
    Reported: ({ observation }) => reported(walk, step, observation),
    Reloaded: () => {
      const judged = flushed(walk, step.reference);
      const model = { ...judged.model, live: reloadedLive(judged.model, step.at), cancels: [] };

      return { ...judged, model, before: model, from: judged.reports.length };
    },
    Disposed: () => walk,
    Forgot: () => walk,
    Ensured: () => walk,
    Released: () => walk,
    DisposingRuntime: () => walk,
    Drove: (drive) => ({ ...walk, drove: [...walk.drove, drive] }),
    Unstoppable: ({ operation }) => ({
      ...walk,
      model: { ...walk.model, unstoppable: [...walk.model.unstoppable, operation] },
    }),
    Advanced: () => walk,
    Read: () => walk,
  });

const judgeStep = (model: Model, step: Step, facts: ReadonlyArray<Fact>) => {
  const start: Walk = {
    model,
    reports: [],
    before: model,
    from: 0,
    pending: [],
    drove: [],
    found: [],
  };

  const walked = flushed(
    facts.reduce((walk, fact) => learned(walk, step, fact), start),
    step.reference,
  );

  return [
    walked.model,
    [
      ...walked.found,
      ...unanchoredReleases(walked.model, walked.reports),
      ...bounds(walked.model),
      ...unended(walked.model),
    ],
  ] as const;
};

type State = { readonly model: Model; readonly reference: Reference; readonly at: number };

/**
 * Each write lane keeps its cells: at most one addressable Attempt, a queue within its policy's
 * bound, promotion only past a resolved or released head, a Held head left only by a retry, a
 * cancel or a release, every cancel judged by the head's history, and no send of an Attempt
 * already on the wire.
 *
 * **Details**
 *
 * One model of every lane, from the runtime's reports in order. Each Attempt has one phase:
 * `Queued`, `Waiting` (the head, never sent), `Wire`, `Held { at }` (held by an unknown in step
 * `at`) or `Replaced` (a head a later commit replaced under `cancel`). `Minted` adds an Attempt (the
 * head on an Idle lane; queued under `reject`, `latest` and `serialize`; under `cancel` it replaces
 * the head), `Sent` puts it on the wire, an unknown ending holds an addressable one, any other
 * ending, `Released` or `Superseded` removes it and promotes the first queued. Checks:
 *
 * - after each turn and at the end of each step, the queue is within its policy's bound (0 under
 *   reject; 1 under latest; 64 under serialize; 0 under cancel, R7) and a lane has at most one
 *   addressable Attempt (R6);
 * - a `Minted` names its actor; a replaced Attempt is never sent (R6, R7);
 * - a queued Attempt is never sent, nor ended on a channel other than failure (R8: promotion only
 *   past a resolved or released head);
 * - an Attempt on the wire is not sent again: a send comes only from a commit, a promotion or a
 *   retry of a Held head (R8);
 * - a Held head is sent again only after a turn of its actor in a step the suite drove, later than
 *   the step that held it (R8, no automatic retry; see Gotchas);
 * - `Superseded` names only a queued commit or a never-sent head, and only under `latest` (R7);
 * - `Released` is reported only in a step with a turn of the Attempt's actor on an event the
 *   fixture's reference says cancels its operation, or that took a transition the reference says
 *   may cancel it (R8: no quiet release; R14);
 * - on a turn of an event the suite sent whose handler the reference says cancels the operation,
 *   by the head's history before that turn, over the reports from that turn to the end of its
 *   step: a Held head is released; a head on the wire ends `unknown Cancelled`, within the step
 *   unless the suite made the call uninterruptible; a never-sent head is never sent and ends
 *   `NotSent Cancelled` (or `StorageRefused`); an Idle lane ends nothing (R14). A `cancelAll` also
 *   ends every queued commit `NotSent Cancelled`, in mint order, and a head on the wire is
 *   delivered after them (R15).
 *
 * **Gotchas**
 *
 * - Anchored to the suite's facts: the events it sent, the calls it made uninterruptible, the
 *   server's log (a keyed lane's key) and the fixtures' references (policy, bound, which events
 *   cancel). Which Attempt was minted, sent or released is the runtime's report;
 *   `attempt-identity` anchors every received send to a reported one.
 * - A lane is (actor, operation, key). The Port requires `Minted.key` on a keyed operation; the
 *   round-14 adapter does not report it (a stated limit), so the key is then the key fields of the
 *   input of the Attempt's first request in the server's log, and until then a keyed Attempt is a
 *   never-sent head of a lane the oracle cannot name, judged by no lane check.
 * - An Idle cancel counts only endings of the cancelling actor's Attempts (known before the turn,
 *   or minted by that actor in the window) and its declines.
 * - A cancel of a keyed operation names its lane from the actor's state, which the timeline does
 *   not hold: the oracle judges it only when the actor has one addressable Attempt of the operation
 *   (none is an Idle cancel); with more, the cancel is not judged.
 * - The timeline names no retry events, so the re-send of a Held head is anchored to the suite's
 *   own steps: any driven turn of the actor permits it, even one whose handler does not retry.
 * - A turn's reports come before its `Turn` report, so a cancel's history is the model at the
 *   previous `Turn` of its step (or the step's start). A send never lands between a turn and its
 *   own reports: it waits for the store's acknowledgement, a later step.
 * - A `Released` is anchored to a turn by its event and, for a guarded cancel, its transition; two
 *   alternatives with the same source and target, only one of which cancels, are not told apart.
 *   A release on leave and a not-retained unknown (a bare or
 *   ignored mapping, R4) need fixtures that declare them; until then they read as violations.
 * - A reload keeps each Held head (`Held { at }` as it was), makes a head on the wire Held at the
 *   reload's step, and drops queued, waiting and replaced Attempts and the pending cancels: the
 *   page that would end them is gone. Cancels judged before it in the step are judged over the
 *   reports before it. A send of an Attempt that left its lane is WriteLanes I1 (a boot sends
 *   nothing, Restore I2).
 */
export const laneQueue = oracle<State>({
  name: "lane-queue",
  guarantee: [
    "WriteLanes I1",
    "WriteLanes I8",
    "WriteLanes I9",
    "WriteLanes I11",
    "WriteLanes I12",
    "WriteLanes I20",
    "WriteLanes I21",
  ],
  start: (reference) => ({ model: EMPTY, reference, at: 0 }),
  step: (state, facts, requests) => {
    const driven = facts.some((fact) => Fact.$is("Drove")(fact) || Fact.$is("Answered")(fact));
    const step = { reference: state.reference, requests, at: state.at, driven };
    const [model, found] = judgeStep(state.model, step, facts);

    return [{ ...state, model, at: state.at + 1 }, found.map(violation)] as const;
  },
});
