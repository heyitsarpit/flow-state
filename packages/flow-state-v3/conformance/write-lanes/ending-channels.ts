import { Option } from "effect";
import { type AttemptRef, attemptText, endingOf, sameAttempt } from "../dsl/domain.ts";
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

const idText = (attempt: Option.Option<string>) =>
  Option.match(attempt, { onNone: () => "(none)", onSome: (id) => id });

const refOf = (operation: string, attempt: Option.Option<string>) =>
  Option.map(attempt, (id) => ({ operation, attempt: id }));

const withKey = <A>(map: ReadonlyMap<string, A>, key: string, value: A) =>
  new Map([...map, [key, value]]);

type Unsure = ReadonlyArray<AttemptRef>;

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const unsureAfter = (unsure: Unsure, ended: Ended): readonly [Unsure, Found] => {
  const named = refOf(ended.operation, ended.attempt);

  if (Option.isNone(named)) return [unsure, []];
  const ref = named.value;

  if (ended.channel === "unknown") return [[...unsure, ref], []];

  return ended.channel === "failure" && unsure.some((u) => sameAttempt(u, ref))
    ? [
        unsure,
        [`WriteLanes I3: ${attemptText(ref)} ended unknown, then delivered a definite failure`],
      ]
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
    `WriteLanes I3: ${delivered.operation} ${idText(delivered.attempt)} ended ${ended.channel} ${ended.reason} and ran ${delivered.event}, not ${named}`,
  ];
};

type Mapped = {
  readonly endings: ReadonlyArray<Ended>;
  readonly declines: ReadonlyMap<string, ReadonlyArray<Ended>>;
};

// RETURN_TYPE: both branches rebuild one field; without it each infers a different Map type.
const remembered = (mapped: Mapped, ended: Ended): Mapped =>
  Option.match(ended.attempt, {
    onSome: () => ({ ...mapped, endings: [...mapped.endings, ended] }),
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
      Option.fromUndefinedOr(
        mapped.endings.findLast(
          (e) => e.operation === delivered.operation && Option.contains(e.attempt, id),
        ),
      ),
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
      `WriteLanes I3: ${delivered.operation} ${idText(delivered.attempt)} delivered ${delivered.event} with no ending decided`,
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
  readonly ref: AttemptRef;
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
    `WriteLanes I25: the server answered ${id} ${asked.answer._tag}, so it ends ${expected.channel}${said}; it ended ${ended.channel} ${ended.reason}`,
  ];
};

const madeUp = (id: string, ended: Ended) =>
  ended.channel === "unknown" ||
  (ended.channel === "failure" && FLOW_DECLINES.includes(ended.reason))
    ? []
    : [
        `WriteLanes I25: ${id} ended ${ended.channel} ${ended.reason} in a step where the server gave it no answer; a success or the commit's own failure comes only from the server's answer`,
      ];

/**
 * The sends that are live: sent, with no ending since.
 */
type Live = ReadonlyArray<AttemptRef>;

// RETURN_TYPE: the branches return literal arrays that would infer narrower types than the state.
const learned = (live: Live, fact: Fact): Live => {
  if (Fact.$is("Reloaded")(fact)) return [];

  if (!Fact.$is("Reported")(fact)) return live;
  const observed = fact.observation;

  if (Observation.$is("Sent")(observed))
    return [...live, { operation: observed.operation, attempt: observed.attempt }];

  return Option.match(
    Observation.$is("Ended")(observed)
      ? refOf(observed.operation, observed.attempt)
      : Option.none(),
    {
      onNone: () => live,
      onSome: (ended) => live.filter((x) => !sameAttempt(x, ended)),
    },
  );
};

const newestRequest = (requests: ReadonlyArray<Request>, ref: AttemptRef) =>
  requests.findLast((r) => r.operation === ref.operation && Option.contains(r.key, ref.attempt))
    ?.seq;

type Answers = { readonly live: Live; readonly asked: ReadonlyArray<Asked> };

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
    const ref = { operation: request.operation, attempt: given.value.request.key.value };

    const expected = Option.flatMap(operationNamed(reference, request.operation), (o) =>
      endingOf(o, requests, request, answer),
    );

    if (Option.isNone(expected)) return answers;

    return {
      ...answers,
      asked: [
        ...answers.asked.filter((a) => !sameAttempt(a.ref, ref)),
        { ref, answer, expected: expected.value, seq: request.seq },
      ],
    };
  };

// RETURN_TYPE: a [state, violations] pair; the branches' literal arrays would infer different tuples.
const ending = (
  answers: Answers,
  reference: Reference,
  ended: Ended,
): readonly [Answers, Found] => {
  const named = refOf(ended.operation, ended.attempt);

  if (Option.isNone(named)) return [answers, []];
  const ref = named.value;
  const answered = Option.fromUndefinedOr(answers.asked.find((a) => sameAttempt(a.ref, ref)));
  const next = { ...answers, asked: answers.asked.filter((a) => !sameAttempt(a.ref, ref)) };

  if (Option.isNone(operationNamed(reference, ended.operation))) return [next, []];

  return [
    next,
    Option.match(answered, {
      onNone: () => madeUp(attemptText(ref), ended),
      onSome: (a) => judgeAnswered(attemptText(ref), a, ended),
    }),
  ];
};

const unended = ({ live, asked }: Answers, requests: ReadonlyArray<Request>) =>
  asked.flatMap((a) =>
    newestRequest(requests, a.ref) === a.seq && live.some((x) => sameAttempt(x, a.ref))
      ? [
          `WriteLanes I3: the server answered ${attemptText(a.ref)} ${a.answer._tag} on a live send, and no ending names it`,
        ]
      : [],
  );

const endedAsAnswered = (
  live: Live,
  step: ReadonlyArray<Fact>,
  reference: Reference,
  requests: ReadonlyArray<Request>,
) => {
  const ask = asking(reference, requests);

  const early = step.reduce<Answers>((answers, fact) => ask(answers, atOnce(fact)), {
    live,
    asked: [],
  });

  const [walked, found] = step.reduce<readonly [Answers, Found]>(
    ([answers, seen], fact) => {
      const told = ask(answers, answerOf(fact));

      const [judged, more] = Option.match(endedOf(fact), {
        onNone: () => [told, []] as const,
        onSome: (ended) => ending(told, reference, ended),
      });

      return [{ ...judged, live: learned(judged.live, fact) }, [...seen, ...more]];
    },
    [early, []],
  );

  return [walked.live, [...found, ...unended(walked, requests)]] as const;
};

type State = {
  readonly reference: Reference;
  readonly live: Live;
  readonly mapped: Mapped;
  readonly unsure: Unsure;
};

const neverSentEnds = (
  step: ReadonlyArray<Fact>,
  reference: Reference,
  requests: ReadonlyArray<Request>,
) =>
  step.flatMap((fact) => {
    if (!Fact.$is("Reported")(fact) || !Observation.$is("Ended")(fact.observation)) return [];

    const { operation, attempt, channel, reason } = fact.observation;

    if (Option.isNone(attempt) || Option.isNone(operationNamed(reference, operation))) return [];

    const sent = requests.some(
      (r) => r.operation === operation && Option.contains(r.key, attempt.value),
    );

    const booted = step.some((f) => Fact.$is("Reloaded")(f) || Fact.$is("Ensured")(f));

    const allowed =
      (channel === "failure" && FLOW_DECLINES.some((d) => d === reason)) ||
      (channel === "unknown" && reason === "Restored" && booted);

    return sent || allowed
      ? []
      : [
          `WriteLanes I3: ${operation} ${attempt.value} never reached the server and ended ${channel} ${reason}: an Attempt never sent ends only NotSent, or unknown { Restored } at a boot`,
        ];
  });

/**
 * Every delivered ending is exactly one of success, failure and unknown, and an Attempt that ever
 * ended unknown never delivers a definite failure (WriteLanes I3); a success or a commit's own
 * failure matches an answer the server gave a send of it (WriteLanes I25: the first and fourth
 * checks below).
 *
 * **Details**
 *
 * Five checks:
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
 * - an Attempt that never reached the server ends only NotSent (a Flow decline reason), or
 *   unknown { Restored } at a boot (ruling CQ5). Anchored to the server's log.
 *
 * It reads the server's log and the reports, never the Case's lifecycle fold: it is one of the
 * independent judges that guard the fold's common mode.
 *
 * **Gotchas**
 *
 * - Only operations the case's references name, once, are checked by mapping.
 * - An ending must come in the step its answer came; one in a later step is reported missing.
 * - Declines carry no Attempt id and are paired with deliveries in order per operation.
 */
export const endingChannels = oracle<State>({
  name: "ending-channels",
  guarantee: ["WriteLanes I3", "WriteLanes I25"],
  start: (reference) => ({
    reference,
    live: [],
    mapped: { endings: [], declines: new Map() },
    unsure: [],
  }),
  step: (state, step, requests) => {
    const [live, answered] = endedAsAnswered(state.live, step, state.reference, requests);
    const [mapped, delivered] = deliveredAsMapped(state.mapped, step, state.reference);
    const [unsure, failed] = failureAfterUnknown(state.unsure, step);

    const unsent = neverSentEnds(step, state.reference, requests);

    return [
      { ...state, live, mapped, unsure },
      [...answered, ...delivered, ...failed, ...unsent].map(violation),
    ] as const;
  },
});
