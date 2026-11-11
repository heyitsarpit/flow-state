import { Data, Option, Predicate } from "effect";
import { endingOf } from "../dsl/domain.ts";
import { endingNamed } from "../dsl/lifecycle-lives.ts";
import {
  type AttemptLife,
  LifeMove,
  type Model,
  Move,
  Phase,
  sameLane,
} from "../dsl/lifecycle-model.ts";
import type { LifeStep } from "../dsl/lifecycle-step.ts";
import { disposalBoundMs, Fact, type InvariantId, oracle, violation } from "../dsl/oracle.ts";
import { operationNamed, type Reference } from "../fixtures/reference.ts";
import { type Channel, type Ended, type Json, Observation, sameActor, sameJson } from "../port.ts";
import { type Answer, type Request, RequestPhase } from "../world/network.ts";

const GUARANTEE: ReadonlyArray<InvariantId> = [
  "Actors I29",
  "Actors I30",
  "Actors I31",
  "Actors I32",
  "Actors I35",
  "Actors I36",
];

type Answered = { readonly channel: Channel; readonly reason: Option.Option<string> };

type Call = Data.TaggedEnum<{
  Open: {};
  Settled: { answer: Answered };
  Done: {};
}>;

const Call = Data.taggedEnum<Call>();

type Window = {
  readonly since: string;
  readonly elapsed: number;
  readonly calls: ReadonlyArray<{ readonly life: AttemptLife; readonly call: Call }>;
};

type State = { readonly reference: Reference; readonly window: Option.Option<Window> };

type Context = {
  readonly reference: Reference;
  readonly requests: ReadonlyArray<Request>;
  readonly step: ReadonlyArray<Fact>;
  readonly lives: LifeStep;
};

const named = ({ id, lane }: AttemptLife) =>
  `${lane.operation} ${id} of ${lane.actor.machine}/${lane.actor.id}`;

const at = (window: Window) => `(at "${window.since}")`;

const onWire = (life: AttemptLife) =>
  Phase.$is("OnWire")(life.phase) || Phase.$is("Interrupted")(life.phase);

const moveCall = (window: Window, id: string, to: (call: Call) => Call) => ({
  ...window,
  calls: window.calls.map((c) => (c.life.id === id ? { ...c, call: to(c.call) } : c)),
});

const reasonSaid = (answer: Answered) =>
  Option.match(answer.reason, { onNone: () => "", onSome: (r) => ` ${r}` });

const endsAs = (answer: Answered, ended: Ended) =>
  answer.channel === ended.channel &&
  Option.match(answer.reason, { onNone: () => true, onSome: (r) => r === ended.reason });

const cancelsOwn = (life: AttemptLife, ended: Ended) =>
  Phase.$is("Interrupted")(life.phase) &&
  ended.channel === "unknown" &&
  ended.reason === "Cancelled";

const cutShortOpen = (window: Window, life: AttemptLife, ended: Ended) => {
  if (window.elapsed < disposalBoundMs)
    return [
      `Actors I35: ${named(life)} was on the wire when the Runtime's disposal began ${at(window)}; it ended ${ended.channel} ${ended.reason} ${window.elapsed} ms in, before its call settled and before the ${disposalBoundMs} ms bound`,
    ];

  if (ended.channel === "unknown" && ended.reason === "Disposed") return [];

  return [
    `Actors I35: ${named(life)} was still on the wire, unsettled, at the ${disposalBoundMs} ms disposal bound; it ends unknown { Disposed }, not ${ended.channel} ${ended.reason}`,
  ];
};

const cutShort = (window: Window, life: AttemptLife, call: Call, ended: Ended) =>
  cancelsOwn(life, ended)
    ? []
    : Call.$match(call, {
        Done: () => [],
        Settled: ({ answer }) =>
          endsAs(answer, ended)
            ? []
            : [
                `Actors I35: ${named(life)} settled within the disposal bound, which its commit takes as ${answer.channel}${reasonSaid(answer)}; it ends by its own result, not ${ended.channel} ${ended.reason}`,
              ],
        Open: () => cutShortOpen(window, life, ended),
      });

const unsettled = (window: Window) =>
  window.calls.filter((c) => Call.$is("Open")(c.call)).map((c) => c.life);

const pastBound = (window: Window) =>
  window.elapsed < disposalBoundMs
    ? []
    : unsettled(window).map(
        (life) =>
          `Actors I35: ${named(life)} was on the wire when the Runtime's disposal began ${at(window)} and is unsettled ${window.elapsed} ms in, past the ${disposalBoundMs} ms bound, with no ending; past the bound it ends unknown { Disposed }`,
      );

const endedEarly = (window: Window) =>
  window.elapsed >= disposalBoundMs
    ? []
    : unsettled(window).map(
        (life) =>
          `Actors I35: the Runtime's disposal ${at(window)} ended ${window.elapsed} ms in, while ${named(life)} was on the wire, unsettled and within the ${disposalBoundMs} ms bound; the disposal waits for it to settle or reach the bound`,
      );

const settledIn = (window: Window, context: Context, request: Request, answer: Answer) => {
  const answered = Option.flatMap(operationNamed(context.reference, request.operation), (o) =>
    endingOf(o, context.requests, request, answer),
  );

  const id = Option.getOrUndefined(request.key);

  const settles =
    !RequestPhase.$is("Orphaned")(request.phase) &&
    window.elapsed < disposalBoundMs &&
    window.calls.some((c) => c.life.id === id);

  return settles && id !== undefined && Option.isSome(answered)
    ? moveCall(window, id, (call) =>
        Call.$is("Open")(call) ? Call.Settled({ answer: answered.value }) : call,
      )
    : window;
};

const reportedWhileDisposing = (window: Window, observation: Observation) => {
  if (Observation.$is("RuntimeDisposed")(observation)) return [window, endedEarly(window)] as const;

  if (!Observation.$is("Ended")(observation) || Option.isNone(observation.attempt))
    return [window, []] as const;
  const id = observation.attempt.value;
  const found = window.calls.find((c) => c.life.id === id);
  const broken = found === undefined ? [] : cutShort(window, found.life, found.call, observation);

  return [moveCall(window, id, () => Call.Done()), broken] as const;
};

const invoked = (request: Request) =>
  `Actors I30: the server received a ${request.operation} request${Option.match(request.key, { onNone: () => "", onSome: (k) => ` (${k})` })} after the Runtime's disposal began; nothing is invoked from its start`;

const stepName = (step: ReadonlyArray<Fact>) =>
  Option.match(Option.fromUndefinedOr(step.find(Fact.$is("Stepped"))), {
    onNone: () => "the case's start",
    onSome: (stepped) => stepped.what,
  });

const opened = (context: Context) => {
  const start = context.lives.applied.find((a) => Move.$is("DisposalStarts")(a.move));

  return {
    since: stepName(context.step),
    elapsed: 0,
    calls: (start?.on.attempts ?? []).filter(onWire).map((life) => ({ life, call: Call.Open() })),
  };
};

const whileDisposing = (context: Context, window: Window, fact: Fact) => {
  const none = [Option.some(window), []] as const;

  const kept = ([w, broken]: readonly [Window, ReadonlyArray<string>]) =>
    [Option.some(w), broken] as const;

  return Fact.$match(fact, {
    Stepped: () => none,
    Requested: ({ request }) => [Option.some(window), [invoked(request)]] as const,
    Answered: ({ request, answer }) => kept([settledIn(window, context, request, answer), []]),
    Reported: ({ observation }) => kept(reportedWhileDisposing(window, observation)),
    Reloaded: () => [Option.none<Window>(), []] as const,
    Disposed: () => none,
    Forgot: () => none,
    Ensured: () => none,
    Released: () => none,
    DisposingRuntime: () => none,
    Drove: () => none,
    Unstoppable: () => none,
    Advanced: ({ ms }) => kept([{ ...window, elapsed: window.elapsed + ms }, []]),
    Read: () => none,
  });
};

type Judged = readonly [Option.Option<Window>, ReadonlyArray<string>];

// RETURN_TYPE: a reducer's step; `reduce` needs the accumulator's declared type.
const judgeFact = (context: Context, [was, so]: Judged, fact: Fact): Judged => {
  const [window, found] = Option.match(was, {
    onNone: () =>
      Fact.$is("DisposingRuntime")(fact)
        ? ([Option.some(opened(context)), []] as const)
        : ([was, []] as const),
    onSome: (w) => whileDisposing(context, w, fact),
  });

  return [window, [...so, ...found]];
};

const leavesHold = (model: Model, index: number) => model.endings[index]?.channel === "unknown";

const laneOfAttempt = (model: Model, attempt: Option.Option<string>) =>
  Option.flatMap(attempt, (id) => Option.fromUndefinedOr(model.attempts.find((a) => a.id === id)));

const holdLast = (lives: LifeStep) => {
  const reload = lives.applied.findIndex(
    (a) => Move.$is("Reload")(a.move) && a.on.mode === "disposing",
  );

  if (reload < 0) return [];

  const delivered = lives.applied.slice(reload + 1).flatMap(({ move, on }) =>
    LifeMove.$is("Delivered")(move)
      ? Option.toArray(
          Option.flatMap(laneOfAttempt(on, move.ending.attempt), (life) =>
            Option.map(endingNamed(on, move.ending), (index) => ({
              life,
              index,
              hold: leavesHold(on, index),
            })),
          ),
        )
      : [],
  );

  return delivered.flatMap((d, i) => {
    const later = delivered
      .slice(i + 1)
      .filter((o) => o.index !== d.index && sameLane(o.life.lane, d.life.lane));

    return !d.hold || later.length === 0
      ? []
      : [
          `Actors I31: the boot after the Runtime's disposal delivered ${named(d.life)}'s hold-leaving ending before ${later.map((o) => o.life.id).join(", ")} of the same lane; the ending that leaves a hold comes last`,
        ];
  });
};

const inFlight = (life: AttemptLife) =>
  Phase.$is("Held")(life.phase) || Phase.$is("Resending")(life.phase) || onWire(life);

const UNBOUND = { disposeActor: "Actors I29", forget: "Actors I32" } as const;

const releasedUnbound = (lives: LifeStep) =>
  lives.applied.flatMap((a) => {
    if (!Move.$is("Evidence")(a.move) || a.move.kind !== "Released") return [];
    const id = a.move.attempt;
    const life = a.on.attempts.find((x) => x.id === id);

    const record = a.on.actors.find(
      (x) => life !== undefined && sameActor(x.actor, life.lane.actor),
    );

    if (life === undefined || record === undefined || !inFlight(life)) return [];

    if (record.record !== "disposeActor" && record.record !== "forget") return [];

    return [
      `${UNBOUND[record.record]}: ${named(life)} was Held or on the wire when the suite called ${record.record} on its actor, and the runtime released it before any ensure adopted the lane; ${record.record} keeps every lane that is not Idle`,
    ];
  });

const uncertain = (row: Json) =>
  Predicate.isObjectKeyword(row) &&
  Object.entries(row).some(([k, v]) => k === "uncertain" && v === true);

const readHeld = (context: Context) =>
  context.step.flatMap((fact) => {
    if (!Fact.$is("Read")(fact) || !Option.exists(fact.row, uncertain)) return [];

    const newest = context.lives.after.attempts.findLast(
      (a) =>
        sameActor(a.lane.actor, fact.actor) &&
        a.lane.operation === fact.operation &&
        Option.match(a.lane.key, { onNone: () => true, onSome: (k) => sameJson(k, fact.key) }),
    );

    return newest !== undefined &&
      Phase.$is("Gone")(newest.phase) &&
      newest.phase.why === "settledInDisposal"
      ? [
          `Actors I36: ${named(newest)} ended definitely during the Runtime's disposal, and after the next boot its row reads uncertain, so its head stayed Held; a definite ending drops the head`,
        ]
      : [];
  });

/**
 * The Runtime's disposal keeps every lane that is not Idle, invokes nothing from its start, keeps
 * its 5 s bound, and delivers a lane's hold-leaving ending last; disposeActor and forget keep
 * lanes. Read from the Case's one lifecycle fold, with views of its own: the window of calls on
 * the wire, the clock and the server's log.
 *
 * **Details**
 *
 * - The fold's refusals (`dsl/lifecycle-step.ts`): a never-sent commit left as it was when the
 *   disposal ends (Actors I29, pending CQ6); an incarnation after a Runtime disposal or a
 *   disposeActor that delivers a Held head neither `unknown { Restored }` nor its parked ending by
 *   its step's end (Actors I29), and after a forget (Actors I32); `unknown { Disposed }` while the
 *   Runtime is not disposing (Actors I35); `unknown { Restored }` of an Attempt that settled
 *   during the disposal (Actors I36).
 * - The window: the Attempts `OnWire` or `Interrupted` when the disposal starts. A call is open
 *   until the server answers it (through `endingOf`) or it ends. Actors I35 is broken by a call
 *   that ends before it is answered and before the bound, an ending that is not its answer's
 *   (channel, and a failure's tag), a call still unsettled past the bound that ends other than
 *   `unknown { Disposed }` or not by the step that reaches the bound, and `RuntimeDisposed` before
 *   the bound while a call is open. An `Interrupted` call's own `unknown { Cancelled }` is the
 *   cancel's ending, not the disposal's (WriteLanes R14). The clock is the suite's `Advanced`
 *   facts since the start.
 * - Nothing invoked (Actors I30): the server receives no request, write or read, from the start
 *   of the Runtime's disposal to the next reload. A request the next boot makes is not counted.
 * - The hold-leaving ending last (Actors I31): among the distinct endings the boot after a Runtime
 *   disposal delivers for one lane, none follows one that leaves a hold (an unknown). A second
 *   delivery of one ending is WriteLanes I15's.
 * - A definite head dropped (Actors I36): after a call settled definitely during the disposal, a
 *   read of its lane's row is not `uncertain` while it is the lane's newest Attempt.
 * - disposeActor and forget keep lanes: a Held, re-sending or on-the-wire head of an unbound
 *   actor is never reported
 *   `Released` before an ensure adopts it (Actors I29, I32).
 *
 * **Gotchas**
 *
 * - The fold is shared with the other lifecycle oracles: a wrong cell is wrong for all of them,
 *   caught by the lifecycle's traces and mutation test, and by the runtime mutants.
 * - Time is counted per step: an ending in the step that reaches the bound passes as at it, though
 *   the runtime may have decided it earlier in that step.
 * - An ending settled while its actor was unbound, owed at the adoption, is WriteLanes I15's
 *   (`delivered-once`, T6 L11).
 * - The read check takes the lane's newest Attempt at the step's end.
 * - `HoldForgotten` (Actors R21): no fixture removes an operation, a stated limit.
 * - The end of a case re-attaches with `ensureExisting`, which reads as an adoption.
 */
export const disposal = oracle({
  name: "disposal",
  guarantee: GUARANTEE,
  start: (reference: Reference) => ({ reference, window: Option.none<Window>() }),
  step: (state: State, step: ReadonlyArray<Fact>, requests, lives) => {
    const context = { reference: state.reference, requests, step, lives };
    const initial: Judged = [state.window, []];
    const [window, found] = step.reduce((acc, fact) => judgeFact(context, acc, fact), initial);
    const late = Option.match(window, { onNone: () => [], onSome: pastBound });

    const refused = lives.applied
      .flatMap((a) => a.refusals)
      .filter((r) => GUARANTEE.includes(r.invariant));

    const views = [
      ...found,
      ...late,
      ...holdLast(lives),
      ...releasedUnbound(lives),
      ...readHeld(context),
    ];

    return [{ ...state, window }, [...refused, ...views.map(violation)]] as const;
  },
});
