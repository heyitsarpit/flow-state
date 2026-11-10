import { Option } from "effect";
import { attemptKey, endingOf } from "../dsl/domain.ts";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import {
  FLOW_DECLINES,
  mappedEvent,
  operationNamed,
  type OperationReference,
  type Reference,
} from "../fixtures/reference.ts";
import { type Channel, type Delivered, type Ended, Observation } from "../port.ts";
import { Answer, type Request, RequestPhase } from "../world/network.ts";

type Found = ReadonlyArray<string>;

const endedOf = (fact: Fact) =>
  Fact.$is("Reported")(fact) && Observation.$is("Ended")(fact.observation)
    ? Option.some(fact.observation)
    : Option.none();

const deliveredOf = (fact: Fact) =>
  Fact.$is("Reported")(fact) && Observation.$is("Delivered")(fact.observation)
    ? Option.some(fact.observation)
    : Option.none();

const attemptText = (attempt: Option.Option<string>) =>
  Option.match(attempt, { onNone: () => "(none)", onSome: (id) => id });

const withKey = <A>(map: ReadonlyMap<string, A>, key: string, value: A) =>
  new Map([...map, [key, value]]);

const withoutKey = <A>(map: ReadonlyMap<string, A>, key: string) =>
  new Map([...map].filter(([k]) => k !== key));

type Unsure = ReadonlySet<string>;

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const unsureAfter = (unsure: Unsure, ended: Ended): readonly [Unsure, Found] => {
  if (Option.isNone(ended.attempt)) return [unsure, []];
  const id = attemptKey(ended.operation, ended.attempt.value);

  if (ended.channel === "unknown") return [new Set([...unsure, id]), []];

  return ended.channel === "failure" && unsure.has(id)
    ? [unsure, [`WriteLanes I3: ${id} ended unknown, then delivered a definite failure`]]
    : [unsure, []];
};

const failureAfterUnknown = (unsure: Unsure, step: ReadonlyArray<Fact>) =>
  step.reduce<readonly [Unsure, Found]>(
    ([seen, found], fact) =>
      Option.match(endedOf(fact), {
        onNone: () => [seen, found],
        onSome: (ended) => {
          const [next, more] = unsureAfter(seen, ended);

          return [next, [...found, ...more]];
        },
      }),
    [unsure, []],
  );

const mismatch = (delivered: Delivered, ended: Ended, operation: OperationReference) => {
  const expected = mappedEvent(operation, ended.channel, ended.reason);

  if (Option.contains(expected, delivered.event)) return [];

  const named = Option.match(expected, { onNone: () => "(no mapping)", onSome: (e) => e });

  return [
    `WriteLanes I3: ${delivered.operation} ${attemptText(delivered.attempt)} ended ${ended.channel} ${ended.reason} and ran ${delivered.event}, not ${named}`,
  ];
};

type Mapped = {
  readonly latest: ReadonlyMap<string, Ended>;
  readonly declines: ReadonlyMap<string, ReadonlyArray<Ended>>;
};

// RETURN_TYPE: both branches rebuild one field; without it each infers a different Map type.
const remembered = (mapped: Mapped, ended: Ended): Mapped =>
  Option.match(ended.attempt, {
    onSome: (id) => ({
      ...mapped,
      latest: withKey(mapped.latest, attemptKey(ended.operation, id), ended),
    }),
    onNone: () => ({
      ...mapped,
      declines: withKey(mapped.declines, ended.operation, [
        ...(mapped.declines.get(ended.operation) ?? []),
        ended,
      ]),
    }),
  });

// RETURN_TYPE: the ending a delivery answers to and the state without a decline it took.
const endedFor = (mapped: Mapped, delivered: Delivered): readonly [Mapped, Option.Option<Ended>] =>
  Option.match(delivered.attempt, {
    onSome: (id) => [
      mapped,
      Option.fromUndefinedOr(mapped.latest.get(attemptKey(delivered.operation, id))),
    ],
    onNone: () => {
      const [first, ...rest] = mapped.declines.get(delivered.operation) ?? [];

      return [
        { ...mapped, declines: withKey(mapped.declines, delivered.operation, rest) },
        Option.fromUndefinedOr(first),
      ];
    },
  });

const judgeDelivered = (reference: Reference, delivered: Delivered, ended: Option.Option<Ended>) =>
  Option.match(ended, {
    onNone: () => [
      `WriteLanes I3: ${delivered.operation} ${attemptText(delivered.attempt)} delivered ${delivered.event} with no ending decided`,
    ],
    onSome: (e) =>
      Option.match(operationNamed(reference, delivered.operation), {
        onNone: () => [],
        onSome: (operation) => mismatch(delivered, e, operation),
      }),
  });

const deliveredAsMapped = (mapped: Mapped, step: ReadonlyArray<Fact>, reference: Reference) =>
  step.reduce<readonly [Mapped, Found]>(
    ([state, found], fact) => {
      const known = Option.match(endedOf(fact), {
        onNone: () => state,
        onSome: (ended) => remembered(state, ended),
      });

      return Option.match(deliveredOf(fact), {
        onNone: () => [known, found],
        onSome: (delivered) => {
          const [next, ended] = endedFor(known, delivered);

          return [next, [...found, ...judgeDelivered(reference, delivered, ended)]];
        },
      });
    },
    [mapped, []],
  );

const failureTag = (answer: Answer) =>
  Answer.$is("Fail")(answer) || Answer.$is("FailButLanded")(answer)
    ? Option.some(answer.tag)
    : Option.none();

type Asked = {
  readonly answer: Answer;
  readonly expected: { readonly channel: Channel; readonly reason: Option.Option<string> };
  readonly seq: number;
};

const failureKept = (asked: Asked, ended: Ended) => {
  const answered = failureTag(asked.answer);

  if (ended.reason !== "StillUnknown" || Option.isNone(answered)) return true;

  return Option.match(ended.failure, {
    onNone: () => true,
    onSome: (tag) => tag === answered.value,
  });
};

const judgeAnswered = (id: string, asked: Asked, ended: Ended) => {
  const { expected } = asked;

  const reasonRight = Option.match(expected.reason, {
    onNone: () => true,
    onSome: (reason) => reason === ended.reason,
  });

  if (expected.channel === ended.channel && reasonRight && failureKept(asked, ended)) return [];

  const said = Option.match(expected.reason, { onNone: () => "", onSome: (r) => ` ${r}` });

  return [
    `WriteLanes I3: the server answered ${id} ${asked.answer._tag}, so it ends ${expected.channel}${said}; it ended ${ended.channel} ${ended.reason}`,
  ];
};

const madeUp = (id: string, ended: Ended) =>
  ended.channel === "unknown" ||
  (ended.channel === "failure" && FLOW_DECLINES.includes(ended.reason))
    ? []
    : [
        `WriteLanes I3: ${id} ended ${ended.channel} ${ended.reason} in a step where the server gave it no answer; a success or the commit's own failure comes only from the server's answer`,
      ];

/**
 * Which sends are live (sent, with no ending since) and the newest request of each Attempt.
 */
type Answering = {
  readonly live: ReadonlySet<string>;
  readonly latest: ReadonlyMap<string, number>;
};

// RETURN_TYPE: the branches build Sets and Maps whose inferred types differ from the readonly state.
const learned = ({ live, latest }: Answering, fact: Fact): Answering => {
  if (Fact.$is("Reloaded")(fact)) return { live: new Set(), latest };

  if (Fact.$is("Requested")(fact))
    return Option.match(fact.request.key, {
      onNone: () => ({ live, latest }),
      onSome: (key) => ({
        live,
        latest: withKey(latest, attemptKey(fact.request.operation, key), fact.request.seq),
      }),
    });

  if (!Fact.$is("Reported")(fact)) return { live, latest };
  const observed = fact.observation;

  if (Observation.$is("Sent")(observed))
    return { live: new Set([...live, attemptKey(observed.operation, observed.attempt)]), latest };

  if (Observation.$is("Ended")(observed) && Option.isSome(observed.attempt)) {
    const id = attemptKey(observed.operation, observed.attempt.value);

    return { live: new Set([...live].filter((x) => x !== id)), latest };
  }

  return { live, latest };
};

type Answers = { readonly answering: Answering; readonly asked: ReadonlyMap<string, Asked> };

const answerOf = (fact: Fact) =>
  Fact.$is("Answered")(fact)
    ? Option.some({ request: fact.request, answer: fact.answer })
    : Option.none();

const atOnce = (fact: Fact) =>
  Fact.$is("Requested")(fact) && RequestPhase.$is("Answered")(fact.request.phase)
    ? Option.some({ request: fact.request, answer: fact.request.phase.answer })
    : Option.none();

const asking =
  (reference: Reference, requests: ReadonlyArray<Request>) =>
  // RETURN_TYPE: the reducer's accumulator; the early returns and the rebuilt Map must agree.
  (answers: Answers, given: ReturnType<typeof answerOf>): Answers => {
    if (Option.isNone(given) || Option.isNone(given.value.request.key)) return answers;
    const { request, answer } = given.value;
    const id = attemptKey(request.operation, given.value.request.key.value);

    const expected = Option.flatMap(operationNamed(reference, request.operation), (o) =>
      endingOf(o, requests, request, answer),
    );

    if (Option.isNone(expected)) return answers;

    return {
      ...answers,
      asked: withKey(answers.asked, id, { answer, expected: expected.value, seq: request.seq }),
    };
  };

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const ending = (
  answers: Answers,
  reference: Reference,
  ended: Ended,
): readonly [Answers, Found] => {
  if (Option.isNone(ended.attempt)) return [answers, []];
  const id = attemptKey(ended.operation, ended.attempt.value);
  const answered = Option.fromUndefinedOr(answers.asked.get(id));
  const next = { ...answers, asked: withoutKey(answers.asked, id) };

  if (Option.isNone(operationNamed(reference, ended.operation))) return [next, []];

  return [
    next,
    Option.match(answered, {
      onNone: () => madeUp(id, ended),
      onSome: (a) => judgeAnswered(id, a, ended),
    }),
  ];
};

const unended = ({ answering, asked }: Answers) =>
  [...asked].flatMap(([id, a]) =>
    answering.latest.get(id) === a.seq && answering.live.has(id)
      ? [
          `WriteLanes I3: the server answered ${id} ${a.answer._tag} on a live send, and no ending names it`,
        ]
      : [],
  );

const endedAsAnswered = (
  answering: Answering,
  step: ReadonlyArray<Fact>,
  reference: Reference,
  requests: ReadonlyArray<Request>,
) => {
  const ask = asking(reference, requests);

  const early = step.reduce<Answers>((answers, fact) => ask(answers, atOnce(fact)), {
    answering,
    asked: new Map(),
  });

  const [walked, found] = step.reduce<readonly [Answers, Found]>(
    ([answers, seen], fact) => {
      const told = ask(answers, answerOf(fact));

      const [judged, more] = Option.match(endedOf(fact), {
        onNone: () => [told, []] as const,
        onSome: (ended) => ending(told, reference, ended),
      });

      return [{ ...judged, answering: learned(judged.answering, fact) }, [...seen, ...more]];
    },
    [early, []],
  );

  return [walked.answering, [...found, ...unended(walked)]] as const;
};

type State = {
  readonly reference: Reference;
  readonly answering: Answering;
  readonly mapped: Mapped;
  readonly unsure: Unsure;
};

/**
 * Every delivered ending is exactly one of success, failure and unknown, and an Attempt that ever
 * ended unknown never delivers a definite failure.
 *
 * **Details**
 *
 * Four checks:
 * - an answer the suite's server gives to a live send (an answer given at request time counts in
 *   the step that sent it) (the newest request of that id, with a send reported and no ending
 *   since, judged at the step's end; an older send's late answer is fenced and ends nothing) ends
 *   that Attempt in the same step, under its id, on the channel the fixture's commit gives that
 *   answer (the fixture's reference); it is `unknown Defect` for a died call, and `unknown
 *   StillUnknown`, carrying the failure's tag when the runtime reports it, for a definite failure
 *   when an earlier send of that Attempt was never definitely answered by the server. Anchored to
 *   the server's log.
 * - a delivered ending runs the event the fixture's reference maps the ending's channel and reason
 *   to. The mapping is the suite's; the channel and reason are the runtime's own report, so for an
 *   ending the server did not decide (a decline, a restore, a cancel) this is consistency only.
 * - no Attempt reports a definite failure after an unknown (report consistency).
 * - an Attempt of a referenced write ends success, or with its commit's own failure, only in a step
 *   where the server answered one of its sends: a definite ending the server did not give is made
 *   up. Only unknowns and Flow's own failures end without an answer.
 *
 * **Gotchas**
 *
 * - Only operations the case's references name, once, are checked by mapping.
 * - An ending must come in the step its answer came; one in a later step is reported missing.
 * - Declines carry no Attempt id and are paired with deliveries in order per operation.
 */
export const endingChannels = oracle<State>({
  name: "ending-channels",
  guarantee: ["WriteLanes I3"],
  start: (reference) => ({
    reference,
    answering: { live: new Set(), latest: new Map() },
    mapped: { latest: new Map(), declines: new Map() },
    unsure: new Set(),
  }),
  step: (state, step, requests) => {
    const [answering, answered] = endedAsAnswered(state.answering, step, state.reference, requests);
    const [mapped, delivered] = deliveredAsMapped(state.mapped, step, state.reference);
    const [unsure, failed] = failureAfterUnknown(state.unsure, step);

    return [
      { ...state, answering, mapped, unsure },
      [...answered, ...delivered, ...failed].map(violation),
    ] as const;
  },
});
