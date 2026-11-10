import { Data, Option } from "effect";
import { disposalBoundMs, Fact, holdUse, oracle, violation } from "../dsl/oracle.ts";
import {
  operationNamed,
  type OperationReference,
  type Reference,
  unknownEvent,
} from "../fixtures/reference.ts";
import { type ActorRef, type Channel, type Ended, Observation, sameActor } from "../port.ts";
import { type Answer, type Request, RequestPhase } from "../world/network.ts";
import {
  freshLedger,
  type Ledger,
  laneOfHead,
  learn,
  named,
  onFirstSend,
  openHeads,
  type Owed,
  unsent,
} from "./disposal-ledger.ts";
import { deliveredEvents, dropHeads, type Kept, keptFact, reportsAfter } from "./disposal-kept.ts";
import { endingOf, sameLane } from "../dsl/domain.ts";

type Ending = Pick<Ended, "channel" | "reason">;

type Answered = { readonly channel: Channel; readonly reason: Option.Option<string> };

type Call = Data.TaggedEnum<{
  Open: {};
  Settled: { answer: Answered };
  Done: { ending: Ending; settled: Option.Option<Answered> };
}>;

const Call = Data.taggedEnum<Call>();

type CallMove = Data.TaggedEnum<{ Settle: { answer: Answered }; End: { ending: Ending } }>;

const CallMove = Data.taggedEnum<CallMove>();

const settledOf = (call: Call) =>
  Call.$match(call, {
    Open: () => Option.none<Answered>(),
    Settled: ({ answer }) => Option.some(answer),
    Done: ({ settled }) => settled,
  });

const callStep = (call: Call, by: CallMove) =>
  CallMove.$match(by, {
    Settle: ({ answer }) => (Call.$is("Open")(call) ? Call.Settled({ answer }) : call),
    End: ({ ending }) => Call.Done({ ending, settled: settledOf(call) }),
  });

type Life = Data.TaggedEnum<{
  Live: {};
  Disposing: {
    since: string;
    held: ReadonlyArray<Owed>;
    unsent: ReadonlyArray<Owed>;
    calls: ReadonlyMap<string, Call>;
    elapsed: number;
  };
}>;

const Life = Data.taggedEnum<Life>();

type Disposing = Data.TaggedEnum.Value<Life, "Disposing">;

const callOf = (life: Disposing, id: string) => life.calls.get(id) ?? Call.Open();

const moveCall = (life: Disposing, id: string, by: CallMove) =>
  Life.Disposing({ ...life, calls: new Map(life.calls).set(id, callStep(callOf(life, id), by)) });

const wire = (life: Disposing) => life.held.filter(onFirstSend);

const endingOfCall = (life: Disposing, id: string) => {
  const call = callOf(life, id);

  return Call.$is("Done")(call) ? Option.some(call.ending) : Option.none();
};

type State = {
  readonly reference: Reference;
  readonly ledger: Ledger;
  readonly kept: Kept;
  readonly life: Life;
};

type Context = {
  readonly reference: Reference;
  readonly requests: ReadonlyArray<Request>;
  readonly step: ReadonlyArray<Fact>;
};

const restoredIn = (reports: ReadonlyArray<Observation>, { id }: Owed) =>
  reports.some(
    (o) =>
      Observation.$is("Ended")(o) &&
      o.channel === "unknown" &&
      o.reason === "Restored" &&
      Option.contains(o.attempt, id),
  );

const CHANNELS: ReadonlyArray<Channel> = ["success", "failure", "unknown"];

const channelsOfEvent = (operation: OperationReference, event: string) => {
  const events = {
    success: [operation.success],
    failure: Object.values(operation.failure),
    unknown: Option.toArray(unknownEvent(operation)),
  };

  return CHANNELS.filter((channel) => events[channel].includes(event));
};

const deliveredAs = (reference: Reference, owed: Owed, event: string, channel: Channel) =>
  Option.match(operationNamed(reference, owed.attempt.operation), {
    onNone: () => true,
    onSome: (o) => channelsOfEvent(o, event).includes(channel),
  });

const at = (life: Disposing) => `(at "${life.since}")`;

const keptLane = (
  reference: Reference,
  life: Disposing,
  reports: ReadonlyArray<Observation>,
  owed: Owed,
) => {
  const events = deliveredEvents(reports, owed);
  const parked = endingOfCall(life, owed.id);

  const asParked = Option.exists(parked, (ending) =>
    events.some((e) => deliveredAs(reference, owed, e, ending.channel)),
  );

  const asRestored =
    restoredIn(reports, owed) && events.some((e) => deliveredAs(reference, owed, e, "unknown"));

  return asParked || asRestored;
};

const survived = (
  reference: Reference,
  life: Disposing,
  attached: (owner: ActorRef) => boolean,
  reports: ReadonlyArray<Observation>,
) => {
  const dropped = life.held
    .filter((o) => attached(o.attempt.owner) && !keptLane(reference, life, reports, o))
    .map(
      (o) =>
        `Actors I29: ${named(o)} was Held or on the wire when the Runtime's disposal began ${at(life)}; the next boot re-attached its actor and delivered neither unknown Restored nor the ending the disposal parked for it (as that ending's event), so its lane did not survive the disposal`,
    );

  const vanished = life.unsent
    .filter((o) => Option.isNone(endingOfCall(life, o.id)))
    .map(
      (o) =>
        `Actors I29: ${named(o)} was minted and never sent when the Runtime's disposal began ${at(life)}, and the disposal reported no ending of it; a never-sent commit ends NotSent { Disposed }`,
    );

  return [...vanished, ...dropped];
};

const holdLeaving = (life: Disposing, reports: ReadonlyArray<Observation>, id: string) =>
  Option.exists(endingOfCall(life, id), (e) => e.channel === "unknown") ||
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
      .filter(
        (other) =>
          other !== id &&
          Option.exists(laneOfDelivered(ledger, life, other), (l) => sameLane(l, lane.value)),
      );

    return later.length === 0
      ? []
      : [
          `Actors I31: the boot after the Runtime's disposal ${at(life)} delivered ${id}'s hold-leaving ending before ${later.join(", ")} of the same lane; the ending that leaves a hold comes last`,
        ];
  });
};

const reasonSaid = (answer: Answered) =>
  Option.match(answer.reason, { onNone: () => "", onSome: (r) => ` ${r}` });

const endsAs = (answer: Answered, ended: Ended) =>
  answer.channel === ended.channel &&
  Option.match(answer.reason, { onNone: () => true, onSome: (r) => r === ended.reason });

const cutShortOpen = (life: Disposing, owed: Owed, ended: Ended) => {
  if (life.elapsed < disposalBoundMs)
    return [
      `Actors I35: ${named(owed)} was on the wire when the Runtime's disposal began ${at(life)}; it ended ${ended.channel} ${ended.reason} ${life.elapsed} ms in, before its call settled and before the ${disposalBoundMs} ms bound`,
    ];

  if (ended.channel === "unknown" && ended.reason === "Disposed") return [];

  return [
    `Actors I35: ${named(owed)} was still on the wire, unsettled, at the ${disposalBoundMs} ms disposal bound; it ends unknown { Disposed }, not ${ended.channel} ${ended.reason}`,
  ];
};

const cutShort = (life: Disposing, owed: Owed, ended: Ended) =>
  Call.$match(callOf(life, owed.id), {
    Done: () => [],
    Settled: ({ answer }) =>
      endsAs(answer, ended)
        ? []
        : [
            `Actors I35: ${named(owed)} settled within the disposal bound, which its commit takes as ${answer.channel}${reasonSaid(answer)}; it ends by its own result, not ${ended.channel} ${ended.reason}`,
          ],
    Open: () => cutShortOpen(life, owed, ended),
  });

const unsettled = (life: Disposing) =>
  wire(life).filter((o) => Call.$is("Open")(callOf(life, o.id)));

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

const settledIn = (life: Disposing, context: Context, request: Request, answer: Answer) => {
  const answered = Option.flatMap(operationNamed(context.reference, request.operation), (o) =>
    endingOf(o, context.requests, request, answer),
  );

  const id = Option.getOrUndefined(request.key);

  const settles =
    !RequestPhase.$is("Orphaned")(request.phase) &&
    life.elapsed < disposalBoundMs &&
    id !== undefined &&
    wire(life).some((o) => o.id === id);

  return settles && Option.isSome(answered)
    ? moveCall(life, id, CallMove.Settle({ answer: answered.value }))
    : life;
};

const judged = (life: Life, found: ReadonlyArray<string>) => [life, found] as const;

const reportedWhileDisposing = (life: Disposing, observation: Observation) => {
  if (Observation.$is("RuntimeDisposed")(observation)) return judged(life, endedEarly(life));

  if (!Observation.$is("Ended")(observation) || Option.isNone(observation.attempt))
    return judged(life, []);
  const id = observation.attempt.value;
  const owed = wire(life).find((o) => o.id === id);
  const found = owed === undefined ? [] : cutShort(life, owed, observation);
  const ending = { channel: observation.channel, reason: observation.reason };

  return judged(moveCall(life, id, CallMove.End({ ending })), found);
};

const invoked = (request: Request) =>
  `Actors I30: the server received a ${request.operation} request${Option.match(request.key, { onNone: () => "", onSome: (k) => ` (${k})` })} after the Runtime's disposal began; nothing is invoked from its start`;

const stepName = (step: ReadonlyArray<Fact>) =>
  Option.match(Option.fromUndefinedOr(step.find(Fact.$is("Stepped"))), {
    onNone: () => "the case's start",
    onSome: (stepped) => stepped.what,
  });

const definiteHeads = (ledger: Ledger, life: Disposing) =>
  ledger.heads.flatMap(({ lane, id }) => {
    const owed = wire(life).find((o) => o.id === id);
    const definite = Option.exists(settledOf(callOf(life, id)), (a) => a.channel !== "unknown");

    return owed !== undefined && definite ? [{ lane, owed }] : [];
  });

const disposing = (ledger: Ledger, since: string) =>
  Life.Disposing({
    since,
    held: openHeads(ledger),
    unsent: unsent(ledger),
    calls: new Map(),
    elapsed: 0,
  });

const withLife = (state: State, [life, found]: readonly [Life, ReadonlyArray<string>]) =>
  [{ ...state, life }, found] as const;

const endDisposal = (context: Context, state: State, life: Disposing, fact: Fact) => {
  const after = context.step.slice(context.step.indexOf(fact) + 1);
  const back = after.reduce(holdUse, state.ledger.uses);
  const attached = (owner: ActorRef) => back.some(([actor]) => sameActor(actor, owner));
  const reports = reportsAfter(context.step, fact);

  const found = [
    ...survived(context.reference, life, attached, reports),
    ...holdLast(state.ledger, life, reports),
  ];

  const kept = dropHeads(state.kept, definiteHeads(state.ledger, life));

  return [{ ...state, kept, life: Life.Live() }, found] as const;
};

const whileDisposing = (context: Context, state: State, life: Disposing, fact: Fact) => {
  const none = withLife(state, judged(life, []));

  return Fact.$match(fact, {
    Stepped: () => none,
    Requested: ({ request }) => withLife(state, judged(life, [invoked(request)])),
    Answered: ({ request, answer }) =>
      withLife(state, judged(settledIn(life, context, request, answer), [])),
    Reported: ({ observation }) => withLife(state, reportedWhileDisposing(life, observation)),
    Reloaded: () => endDisposal(context, state, life, fact),
    Disposed: () => none,
    Forgot: () => none,
    Ensured: () => none,
    Released: () => none,
    DisposingRuntime: () => none,
    Drove: () => none,
    Unstoppable: () => none,
    Advanced: ({ ms }) =>
      withLife(state, judged(Life.Disposing({ ...life, elapsed: life.elapsed + ms }), [])),
    Read: () => none,
  });
};

type Judged = readonly [State, ReadonlyArray<string>];

// RETURN_TYPE: a reducer's step; `reduce` needs the accumulator's declared type.
const judgeFact = (context: Context, [was, so]: Judged, fact: Fact): Judged => {
  const learned = { ...was, ledger: learn(was.ledger, context.reference, fact, context.requests) };

  const [lived, found] = Life.$match(learned.life, {
    Live: () =>
      withLife(
        learned,
        judged(
          Fact.$is("DisposingRuntime")(fact)
            ? disposing(learned.ledger, stepName(context.step))
            : learned.life,
          [],
        ),
      ),
    Disposing: (d) => whileDisposing(context, learned, d, fact),
  });

  const [kept, more] = keptFact(context.reference, context.step, lived.ledger, lived.kept, fact);

  return [{ ...lived, kept }, [...so, ...found, ...more]];
};

const start = (reference: Reference) => ({
  reference,
  ledger: freshLedger,
  kept: [],
  life: Life.Live(),
});

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
 *   after an unknown), no cancel the suite drove on it while waiting or Held and no `Released`
 *   evidence for it, is Held or on the wire when the disposal starts. At the next boot, each such
 *   lane whose owner the reload attaches (every owner of a minted write is attached at the end of a
 *   case) must deliver an ending of that Attempt: the ending the disposal parked for it, delivered
 *   as an event of that ending's channel, or unknown { Restored }.
 * - A queued commit kept: an Attempt minted and never sent when the disposal starts, with no
 *   ending yet, must end (NotSent { Disposed }) before the next reload.
 * - The bound: a call on the wire when the disposal starts (its request open at the server) is
 *   not ended before it settles or the clock reaches 5 s from the start; one the server answers
 *   before then ends with the ending its commit gives that answer (channel, and a failure's tag);
 *   a `Never` answer settles nothing; the disposal does not report its end while such a call is
 *   unsettled within the bound; once the clock reaches the bound, every such call still unsettled
 *   has ended unknown { Disposed } by the end of that step. The clock is the suite's own
 *   `Advanced` facts since the start.
 * - A definite head dropped: a call on the wire at the start that the server answered within the
 *   bound with what its commit takes as success or failure gets no unknown ending after the next
 *   reload, and a read of its lane's row then (`Read`) is not `uncertain`, until a new commit of
 *   that lane.
 * - The hold-leaving ending last: among the endings the boot after a Runtime disposal delivers for
 *   one lane, none follows one that leaves a hold (an unknown).
 * - disposeActor and forget keep lanes: a lane Held or on the wire when the suite disposes or
 *   forgets its actor is never reported `Released` before an ensure adopts the actor, and the
 *   adopting ensure delivers an ending of it when it was Held or settled while unbound (one still
 *   on the wire hears its ending when it lands).
 *
 * **Gotchas**
 *
 * - Anchored to the suite's facts: its server's requests and answers, the fixtures' references
 *   (how a commit classifies an answer, its key fields, the events that cancel it, the events
 *   endings map to), its clock and the uses the suite holds. The rest are the runtime's reports:
 *   who committed an Attempt and that it was minted (`Minted`), when and how an Attempt ended
 *   (`Ended`), that a boot delivered an ending and its event (`Delivered`; a recorded ending does
 *   not count), that the disposal ended (`RuntimeDisposed`, its only public signal), and a row's
 *   `uncertain` field.
 * - A handler's own cancel (one not on an event the suite drove) is known only from the runtime's
 *   `Released` evidence, and a superseded commit from its `Superseded` evidence; whether such a
 *   release was anchored is `lane-queue`'s to judge.
 * - Time is counted per step: an ending in the step that reaches the bound passes as at it, though
 *   the runtime may have decided it earlier in that step. A re-send on the wire when the disposal
 *   starts is not told apart from a Held head, so the bound is judged on first sends.
 * - The hold-last order is judged per lane where the lane is known: a head by its request, a
 *   never-sent commit by the one head lane of its actor's operation.
 * - A reload with no disposal before it judges nothing here; what a plain reload restores is the
 *   restore oracle's.
 * - The end of a case re-attaches with `ensureExisting`, which reads as an adoption.
 */
export const disposal = oracle({
  name: "disposal",
  guarantee: ["Actors I29", "Actors I30", "Actors I31", "Actors I32", "Actors I35", "Actors I36"],
  start,
  step: (state: State, step: ReadonlyArray<Fact>, requests) => {
    const context = { reference: state.reference, requests, step };
    const initial: Judged = [state, []];
    const [after, found] = step.reduce((acc, fact) => judgeFact(context, acc, fact), initial);
    const late = Life.$match(after.life, { Live: () => [], Disposing: pastBound });

    return [after, [...found, ...late].map(violation)] as const;
  },
});
