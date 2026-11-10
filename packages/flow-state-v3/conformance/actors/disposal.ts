import { Data, Option, Predicate } from "effect";
import { disposalBoundMs, Fact, type Facts, type Oracle, steps, usesHeld } from "../dsl/oracle.ts";
import { operationNamed, type Reference } from "../fixtures/reference.ts";
import {
  type ActorRef,
  type Channel,
  type Ended,
  type Json,
  Observation,
  sameActor,
} from "../port.ts";
import { type Answer, type Request, RequestPhase } from "../world/network.ts";
import {
  freshLedger,
  type LaneId,
  type Ledger,
  laneOf,
  laneOfHead,
  learn,
  named,
  openHeads,
  type Owed,
  sameLane,
} from "./disposal-ledger.ts";

type Ending = { readonly channel: Channel; readonly reason: string };

type Life = Data.TaggedEnum<{
  Live: {};
  Disposing: {
    since: string;
    held: ReadonlyArray<Owed>;
    unsent: ReadonlyArray<Owed>;
    wire: ReadonlyArray<Owed>;
    ended: Map<string, Ending>;
    settled: Map<string, Channel>;
    elapsed: number;
  };
}>;

const Life = Data.taggedEnum<Life>();

type Disposing = Data.TaggedEnum.Value<Life, "Disposing">;

type Unbound = Owed & { readonly by: "disposeActor" | "forget" };

type Kept = {
  readonly dropped: Array<{ readonly lane: LaneId; readonly owed: Owed }>;
  readonly unbound: Array<Unbound>;
};

const RULE = { disposeActor: "Actors I29", forget: "Actors I32" } as const;

type Context = {
  readonly ledger: Ledger;
  readonly kept: Kept;
  readonly facts: Facts;
  readonly step: ReadonlyArray<Fact>;
};

const reportsAfter = (step: ReadonlyArray<Fact>, fact: Fact) =>
  step
    .slice(step.indexOf(fact) + 1)
    .flatMap((f) => (Fact.$is("Reported")(f) ? [f.observation] : []));

const deliveredIn = (reports: ReadonlyArray<Observation>, { id, attempt }: Owed) =>
  reports.some(
    (o) =>
      Observation.$is("Delivered")(o) &&
      o.operation === attempt.operation &&
      Option.contains(o.attempt, id),
  );

const restoredIn = (reports: ReadonlyArray<Observation>, { id }: Owed) =>
  reports.some(
    (o) =>
      Observation.$is("Ended")(o) &&
      o.channel === "unknown" &&
      o.reason === "Restored" &&
      Option.contains(o.attempt, id),
  );

const at = (life: Disposing) => `(at "${life.since}")`;

const keptLane = (life: Disposing, reports: ReadonlyArray<Observation>, owed: Owed) =>
  deliveredIn(reports, owed) && (life.ended.has(owed.id) || restoredIn(reports, owed));

const survived = (
  life: Disposing,
  attached: (owner: ActorRef) => boolean,
  reports: ReadonlyArray<Observation>,
) => {
  const dropped = life.held
    .filter((o) => attached(o.attempt.owner) && !keptLane(life, reports, o))
    .map(
      (o) =>
        `Actors I29: ${named(o)} was Held or on the wire when the Runtime's disposal began ${at(life)}; the next boot re-attached its actor and delivered neither unknown Restored nor the ending the disposal parked for it, so its lane did not survive the disposal`,
    );

  const vanished = life.unsent
    .filter((o) => !life.ended.has(o.id))
    .map(
      (o) =>
        `Actors I29: ${named(o)} was minted and never sent when the Runtime's disposal began ${at(life)}, and the disposal reported no ending of it; a never-sent commit ends NotSent { Disposed }`,
    );

  return [...vanished, ...dropped];
};

const holdLeaving = (life: Disposing, reports: ReadonlyArray<Observation>, id: string) =>
  life.ended.get(id)?.channel === "unknown" ||
  reports.some(
    (o) => Observation.$is("Ended")(o) && o.channel === "unknown" && Option.contains(o.attempt, id),
  );

const laneOfDelivered = (ledger: Ledger, life: Disposing, id: string) =>
  Option.orElse(laneOfHead(ledger, id), () => {
    const owed = [...life.unsent, ...life.held].find((o) => o.id === id);

    const heads = ledger.heads.filter(
      (h) =>
        owed !== undefined &&
        sameActor(h.lane.owner, owed.attempt.owner) &&
        h.lane.operation === owed.attempt.operation,
    );

    const [only] = heads;

    return heads.length === 1 && only !== undefined ? Option.some(only.lane) : Option.none();
  });

const holdLast = (ledger: Ledger, life: Disposing, reports: ReadonlyArray<Observation>) => {
  const delivered = reports.flatMap((o) =>
    Observation.$is("Delivered")(o) ? Option.toArray(o.attempt) : [],
  );

  return delivered.flatMap((id, index) => {
    const lane = laneOfDelivered(ledger, life, id);

    if (Option.isNone(lane) || !holdLeaving(life, reports, id)) return [];

    const later = delivered
      .slice(index + 1)
      .filter((other) =>
        Option.exists(laneOfDelivered(ledger, life, other), (l) => sameLane(l, lane.value)),
      );

    return later.length === 0
      ? []
      : [
          `Actors I31: the boot after the Runtime's disposal ${at(life)} delivered ${id}'s hold-leaving ending before ${later.join(", ")} of the same lane; the ending that leaves a hold comes last`,
        ];
  });
};

const onWire = (life: Disposing, id: string) => life.wire.find((o) => o.id === id);

const unsettled = (life: Disposing) =>
  life.wire.filter((o) => !life.settled.has(o.id) && !life.ended.has(o.id));

const cutShort = (life: Disposing, ended: Ended) =>
  Option.toArray(ended.attempt).flatMap((id) => {
    const owed = onWire(life, id);
    const settled = life.settled.get(id);

    if (owed === undefined) return [];

    if (settled !== undefined)
      return settled === ended.channel
        ? []
        : [
            `Actors I35: ${named(owed)} settled within the disposal bound, which its commit takes as ${settled}; it ends by its own result, not ${ended.channel} ${ended.reason}`,
          ];

    if (life.elapsed < disposalBoundMs)
      return [
        `Actors I35: ${named(owed)} was on the wire when the Runtime's disposal began ${at(life)}; it ended ${ended.channel} ${ended.reason} ${life.elapsed} ms in, before its call settled and before the ${disposalBoundMs} ms bound`,
      ];

    if (ended.channel === "unknown" && ended.reason === "Disposed") return [];

    return [
      `Actors I35: ${named(owed)} was still on the wire, unsettled, at the ${disposalBoundMs} ms disposal bound; it ends unknown { Disposed }, not ${ended.channel} ${ended.reason}`,
    ];
  });

const pastBound = (life: Disposing) =>
  life.elapsed < disposalBoundMs
    ? []
    : unsettled(life).map(
        (o) =>
          `Actors I35: ${named(o)} was on the wire when the Runtime's disposal began ${at(life)} and is unsettled ${life.elapsed} ms in, past the ${disposalBoundMs} ms bound, with no ending; past the bound it ends unknown { Disposed }`,
      );

const endedEarly = (life: Disposing) =>
  life.elapsed >= disposalBoundMs
    ? []
    : unsettled(life).map(
        (o) =>
          `Actors I35: the Runtime's disposal ${at(life)} ended ${life.elapsed} ms in, while ${named(o)} was on the wire, unsettled and within the ${disposalBoundMs} ms bound; the disposal waits for it to settle or reach the bound`,
      );

const settledIn = (life: Disposing, reference: Reference, request: Request, answer: Answer) => {
  if (RequestPhase.$is("Orphaned")(request.phase)) return;

  const channel = Option.match(operationNamed(reference, request.operation), {
    onNone: () => "unknown" as const,
    onSome: (o) => o.classify(answer, false),
  });

  if (life.elapsed < disposalBoundMs)
    for (const id of Option.toArray(request.key))
      if (onWire(life, id) !== undefined && !life.ended.has(id)) life.settled.set(id, channel);
};

const reportedWhileDisposing = (life: Disposing, observation: Observation) => {
  if (Observation.$is("Ended")(observation)) {
    for (const id of Option.toArray(observation.attempt))
      life.ended.set(id, { channel: observation.channel, reason: observation.reason });

    return cutShort(life, observation);
  }

  return Observation.$is("RuntimeDisposed")(observation) ? endedEarly(life) : [];
};

const invoked = (request: Request) =>
  `Actors I30: the server received a ${request.operation} request${Option.match(request.key, { onNone: () => "", onSome: (k) => ` (${k})` })} after the Runtime's disposal began; nothing is invoked from its start`;

const stepName = (step: ReadonlyArray<Fact>) =>
  Option.match(Option.fromUndefinedOr(step.find(Fact.$is("Stepped"))), {
    onNone: () => "the case's start",
    onSome: (stepped) => stepped.what,
  });

const dropHeads = (ledger: Ledger, kept: Kept, life: Disposing) => {
  for (const { lane, id } of ledger.heads) {
    const owed = onWire(life, id);
    const definite = life.settled.get(id) ?? "unknown";

    if (owed !== undefined && definite !== "unknown") kept.dropped.push({ lane, owed });
  }
};

const uncertain = (row: Json) =>
  Predicate.isObjectKeyword(row) && Object.entries(row).some(([k, v]) => k === "uncertain" && v);

const releasedUnbound = (kept: Kept, observation: Observation) => {
  if (!Observation.$is("Evidence")(observation) || observation.kind !== "Released") return [];

  return kept.unbound
    .filter(({ id }) => Option.contains(observation.attempt, id))
    .map(
      (o) =>
        `${RULE[o.by]}: ${named(o)} was Held or on the wire when the suite called ${o.by} on its actor, and the runtime released it before any ensure adopted the lane; ${o.by} keeps every lane that is not Idle`,
    );
};

const endedUnknownAgain = (kept: Kept, observation: Observation) => {
  if (!Observation.$is("Ended")(observation) || observation.channel !== "unknown") return [];

  return kept.dropped
    .filter(({ owed }) => Option.contains(observation.attempt, owed.id))
    .map(
      ({ owed }) =>
        `Actors I36: ${named(owed)} ended definitely during the Runtime's disposal, yet a later boot ended it unknown ${observation.reason}, so its head stayed Held; a definite ending drops the head`,
    );
};

const recommitted = (kept: Kept, observation: Observation) => {
  if (!Observation.$is("Minted")(observation)) return;

  const again = (owed: Owed) =>
    owed.attempt.operation === observation.operation &&
    Option.exists(observation.actor, (actor) => sameActor(actor, owed.attempt.owner));

  kept.dropped.splice(0, kept.dropped.length, ...kept.dropped.filter((d) => !again(d.owed)));
};

const readHeld = (context: Context, read: Data.TaggedEnum.Value<Fact, "Read">) => {
  const lane = laneOf(read.actor, context.facts.reference, read.operation, read.key);
  const found = context.kept.dropped.find((d) => sameLane(d.lane, lane));

  if (found === undefined || !Option.exists(read.row, uncertain)) return [];

  return [
    `Actors I36: ${named(found.owed)} ended definitely during the Runtime's disposal, and after the next boot its row reads uncertain, so its head stayed Held; a definite ending drops the head`,
  ];
};

const adopted = (context: Context, fact: Data.TaggedEnum.Value<Fact, "Ensured">) => {
  const { kept, ledger, step } = context;
  const owned = kept.unbound.filter((o) => sameActor(o.attempt.owner, fact.actor));
  const reports = reportsAfter(step, fact);

  kept.unbound.splice(0, kept.unbound.length, ...kept.unbound.filter((o) => !owned.includes(o)));

  return owned
    .filter((o) => ledger.attempts.get(o.id)?.phase === "Unsure" && !deliveredIn(reports, o))
    .map(
      (o) =>
        `${RULE[o.by]}: ${named(o)} was Held or on the wire when the suite called ${o.by} on its actor; the ensure that adopted the actor delivered no ending of it (an unbound lane binds to the adopting incarnation, which hears it once), so the lane did not survive ${o.by}`,
    );
};

const unbind = (context: Context, actor: ActorRef, by: Unbound["by"]) => {
  for (const owed of openHeads(context.ledger))
    if (sameActor(owed.attempt.owner, actor)) context.kept.unbound.push({ ...owed, by });

  return [];
};

const bothLives = (context: Context, fact: Fact) =>
  Fact.$match(fact, {
    Stepped: () => [],
    Requested: () => [],
    Answered: () => [],
    Reported: ({ observation }) => {
      recommitted(context.kept, observation);

      return [
        ...releasedUnbound(context.kept, observation),
        ...endedUnknownAgain(context.kept, observation),
      ];
    },
    Reloaded: () => [],
    Disposed: ({ actor }) => unbind(context, actor, "disposeActor"),
    Forgot: ({ actor }) => unbind(context, actor, "forget"),
    Ensured: (ensured) => adopted(context, ensured),
    Released: () => [],
    DisposingRuntime: () => [],
    Drove: () => [],
    Unstoppable: () => [],
    Advanced: () => [],
    Read: (read) => readHeld(context, read),
  });

type Judged = readonly [Life, ReadonlyArray<string>];

const judged = (life: Life, found: ReadonlyArray<string>) => [life, found] as const;

const disposing = (ledger: Ledger, since: string) => {
  const open = [...ledger.attempts].map(([id, attempt]) => ({ id, attempt }));
  const heads = openHeads(ledger);

  return Life.Disposing({
    since,
    held: heads,
    unsent: open.filter((o) => o.attempt.phase === "Minted"),
    wire: heads.filter((o) => o.attempt.phase === "Sent"),
    ended: new Map(),
    settled: new Map(),
    elapsed: 0,
  });
};

const whileLive = (context: Context, life: Life, fact: Fact) =>
  Fact.$is("DisposingRuntime")(fact)
    ? judged(disposing(context.ledger, stepName(context.step)), [])
    : judged(life, []);

const endDisposal = (context: Context, life: Disposing, fact: Fact) => {
  const { facts, step, ledger, kept } = context;
  const reload = step.indexOf(fact);
  const before = facts.timeline.slice(0, facts.timeline.indexOf(fact));
  const back = usesHeld([...before, ...step.slice(reload)]);
  const attached = (owner: ActorRef) => back.some(([actor]) => sameActor(actor, owner));
  const reports = reportsAfter(step, fact);
  const found = [...survived(life, attached, reports), ...holdLast(ledger, life, reports)];
  dropHeads(ledger, kept, life);

  return judged(Life.Live(), found);
};

const whileDisposing = (context: Context, life: Disposing, fact: Fact) => {
  const none = judged(life, []);

  return Fact.$match(fact, {
    Stepped: () => none,
    Requested: ({ request }) => judged(life, [invoked(request)]),
    Answered: ({ request, answer }) => {
      settledIn(life, context.facts.reference, request, answer);

      return none;
    },
    Reported: ({ observation }) => judged(life, reportedWhileDisposing(life, observation)),
    Reloaded: () => endDisposal(context, life, fact),
    Disposed: () => none,
    Forgot: () => none,
    Ensured: () => none,
    Released: () => none,
    DisposingRuntime: () => none,
    Drove: () => none,
    Unstoppable: () => none,
    Advanced: ({ ms }) => judged(Life.Disposing({ ...life, elapsed: life.elapsed + ms }), []),
    Read: () => none,
  });
};

const judgeStep = (context: Context, start: Life) => {
  const [life, found] = context.step.reduce<Judged>(
    ([now, so], fact) => {
      learn(context.ledger, context.facts.reference, fact);

      const [next, more] = Life.$match(now, {
        Live: () => whileLive(context, now, fact),
        Disposing: (d) => whileDisposing(context, d, fact),
      });

      return judged(next, [...so, ...more, ...bothLives(context, fact)]);
    },
    judged(start, []),
  );

  const late = Life.$match(life, { Live: () => [], Disposing: pastBound });

  return judged(life, [...found, ...late]);
};

const judge = (facts: Facts) => {
  const ledger = freshLedger();
  const kept: Kept = { dropped: [], unbound: [] };

  return steps(facts.timeline).reduce<Judged>(
    ([life, found], step) => {
      const [next, more] = judgeStep({ ledger, kept, facts, step }, life);

      return judged(next, [...found, ...more]);
    },
    judged(Life.Live(), []),
  )[1];
};

/**
 * Disposal keeps every lane that is not Idle, invokes nothing from the Runtime's disposal on,
 * keeps the disposal's 5 s bound, and delivers a lane's hold-leaving ending last.
 *
 * **Details**
 *
 * - Nothing invoked: from the start of the Runtime's disposal to the next reload, the suite's
 *   server receives no request, write or read. A request the next boot makes is not counted.
 * - A Held lane kept through Runtime disposal: a lane whose newest Attempt the server received,
 *   with no definite answer (none yet, one its commit takes as unknown, or a definite failure
 *   after an unknown), no cancel the suite drove since and no `Released` evidence for it, is Held
 *   or on the wire when the disposal starts. At the next boot, each such lane whose owner the
 *   reload attaches (every owner of a minted write is attached at the end of a case) must deliver
 *   an ending of that Attempt: the ending the disposal parked for it, or unknown { Restored }.
 * - A queued commit kept: an Attempt minted and never sent when the disposal starts, with no
 *   ending yet, must end (NotSent { Disposed }) before the next reload.
 * - The bound: a call on the wire when the disposal starts (its request open at the server) is
 *   not ended before it settles or the clock reaches 5 s from the start; one the server answers
 *   before then ends on the channel its commit gives that answer; the disposal does not report its
 *   end while such a call is unsettled within the bound; once the clock reaches the bound, every
 *   such call still unsettled has ended unknown { Disposed } by the end of that step. The clock is
 *   the suite's own `Advanced` facts since the start.
 * - A definite head dropped: a call on the wire at the start that the server answered within the
 *   bound with what its commit takes as success or failure gets no unknown ending after the next
 *   reload, and a read of its lane's row then (`Read`) is not `uncertain`, until a new commit of
 *   that actor's operation.
 * - The hold-leaving ending last: among the endings the boot after a Runtime disposal delivers for
 *   one lane, none follows one that leaves a hold (an unknown).
 * - disposeActor keeps lanes: a lane Held or on the wire when the suite disposes its actor is never
 *   reported `Released` before an ensure adopts the actor, and the adopting ensure delivers an
 *   ending of it when it was Held (one still on the wire hears its ending when it lands).
 *
 * **Gotchas**
 *
 * - Anchored to the suite's facts: its server's requests and answers, the fixtures' references
 *   (how a commit classifies an answer, its key fields, the events that cancel it), its clock and
 *   the uses the suite holds. The rest are the runtime's reports: who committed an Attempt and
 *   that it was minted (`Minted`), when and how an Attempt ended (`Ended`), that a boot delivered
 *   an ending (`Delivered`; a recorded ending does not count), that the disposal ended
 *   (`RuntimeDisposed`, its only public signal), and a row's `uncertain` field. `Delivered`
 *   carries no channel: a parked ending counts when the disposal reported an ending for the
 *   Attempt, whichever it was.
 * - An answer to a dead page's request reaches no caller, so it decides nothing here. A never-sent
 *   commit dies with its page at a reload; one the disk kept ends again at the boot, by report.
 * - A handler's own cancel (one not on an event the suite drove) is known only from the runtime's
 *   `Released` evidence, and a superseded commit from its `Superseded` evidence. This is lenient:
 *   a runtime that claims a release it did not make, then drops the lane, is not caught here.
 * - Time is counted per step: an ending in the step that reaches the bound passes as at it, though
 *   the runtime may have decided it earlier in that step. A re-send on the wire when the disposal
 *   starts is not told apart from a Held head, so the bound is judged on first sends.
 * - The hold-last order is judged per lane where the lane is known: a head by its request, a
 *   never-sent commit by the one head lane of its actor's operation.
 * - A reload with no disposal before it judges nothing here; what a plain reload restores is the
 *   restore oracle's.
 */
export const disposal: Oracle = {
  name: "disposal",
  guarantee: "Actors I29, I30, I31, I35, I36",
  check: judge,
};
