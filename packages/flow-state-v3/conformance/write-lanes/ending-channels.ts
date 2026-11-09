import { Option } from "effect";
import {
  mappedEvent,
  type OperationReference,
  operationNamed,
  type Reference,
} from "../fixtures/reference.ts";
import { Observation } from "../port.ts";
import { Answer, type Request, RequestPhase } from "../world/network.ts";
import { Fact, type Facts, type Oracle, steps } from "../dsl/oracle.ts";

type Ended = Extract<Observation, { readonly _tag: "Ended" }>;

type Delivered = Extract<Observation, { readonly _tag: "Delivered" }>;

const endedOf = (fact: Fact) =>
  Fact.$is("Reported")(fact) && Observation.$is("Ended")(fact.observation)
    ? Option.some(fact.observation)
    : Option.none();

const deliveredOf = (fact: Fact) =>
  Fact.$is("Reported")(fact) && Observation.$is("Delivered")(fact.observation)
    ? Option.some(fact.observation)
    : Option.none();

const idOf = (operation: string, attempt: string) => `${operation} ${attempt}`;

const attemptText = (attempt: Option.Option<string>) => Option.getOrElse(attempt, () => "(none)");

const writeNamed = (reference: Reference, name: string) =>
  Option.filter(operationNamed(reference, name), (operation) => operation.attempts);

const failureAfterUnknown = (timeline: ReadonlyArray<Fact>) => {
  const unsure = new Set<string>();

  return timeline.flatMap((fact) =>
    Option.toArray(endedOf(fact)).flatMap(({ attempt, channel, operation }) => {
      if (Option.isNone(attempt)) return [];
      const id = idOf(operation, attempt.value);
      const late = channel === "failure" && unsure.has(id);

      if (channel === "unknown") unsure.add(id);

      return late ? [`WriteLanes I3: ${id} ended unknown, then delivered a definite failure`] : [];
    }),
  );
};

const mismatch = (delivered: Delivered, ended: Ended, operation: OperationReference) => {
  const expected = mappedEvent(operation, ended.channel, ended.reason);

  if (Option.contains(expected, delivered.event)) return [];

  return [
    `WriteLanes I3: ${delivered.operation} ${attemptText(delivered.attempt)} ended ${ended.channel} ${ended.reason} and ran ${delivered.event}, not ${Option.getOrElse(expected, () => "(no mapping)")}`,
  ];
};

const deliveredAsMapped = (timeline: ReadonlyArray<Fact>, reference: Reference) => {
  const latest = new Map<string, Ended>();
  const declines = new Map<string, Array<Ended>>();

  const remember = (ended: Ended) => {
    if (Option.isSome(ended.attempt)) latest.set(idOf(ended.operation, ended.attempt.value), ended);
    else declines.set(ended.operation, [...(declines.get(ended.operation) ?? []), ended]);
  };

  const takeDecline = (operation: string) => {
    const [first, ...rest] = declines.get(operation) ?? [];
    declines.set(operation, rest);

    return Option.fromUndefinedOr(first);
  };

  const endingOf = (delivered: Delivered) =>
    Option.isSome(delivered.attempt)
      ? Option.fromUndefinedOr(latest.get(idOf(delivered.operation, delivered.attempt.value)))
      : takeDecline(delivered.operation);

  const judge = (delivered: Delivered) =>
    Option.match(endingOf(delivered), {
      onNone: () => [
        `WriteLanes I3: ${delivered.operation} ${attemptText(delivered.attempt)} delivered ${delivered.event} with no ending decided`,
      ],
      onSome: (ended) =>
        Option.match(writeNamed(reference, delivered.operation), {
          onNone: () => [],
          onSome: (operation) => mismatch(delivered, ended, operation),
        }),
    });

  return timeline.flatMap((fact) => {
    const ended = endedOf(fact);

    if (Option.isSome(ended)) remember(ended.value);

    return Option.toArray(deliveredOf(fact)).flatMap(judge);
  });
};

const failureTag = (answer: Answer) =>
  Answer.$is("Fail")(answer) || Answer.$is("FailButLanded")(answer)
    ? Option.some(answer.tag)
    : Option.none();

const expectedEnding = (answer: Answer, mayHaveApplied: boolean, operation: OperationReference) => {
  const channel = operation.classify(answer, mayHaveApplied);

  if (Answer.$is("Die")(answer))
    return { channel: "unknown" as const, reason: Option.some("Defect") };

  if (channel === "failure" && mayHaveApplied)
    return { channel: "unknown" as const, reason: Option.some("StillUnknown") };

  const tag = failureTag(answer);

  if (channel === "failure" && Option.isSome(tag)) return { channel, reason: tag };

  return { channel, reason: Option.none<string>() };
};

type Asked = {
  readonly answer: Answer;
  readonly mayHaveApplied: boolean;
  readonly live: boolean;
};

const failureKept = (asked: Asked, ended: Ended) => {
  const answered = failureTag(asked.answer);

  if (ended.reason !== "StillUnknown" || Option.isNone(answered)) return true;

  return Option.match(ended.failure, {
    onNone: () => true,
    onSome: (tag) => tag === answered.value,
  });
};

const judgeAnswered = (id: string, asked: Asked, ended: Ended, operation: OperationReference) => {
  const expected = expectedEnding(asked.answer, asked.mayHaveApplied, operation);

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

const heard = (request: Request, operation: OperationReference) =>
  RequestPhase.$match(request.phase, {
    Answered: ({ answer }) => operation.classify(answer, false) !== "unknown",
    Open: () => false,
    Hanging: () => false,
    Aborted: () => false,
    Orphaned: () => false,
  });

const earlierUnsure = (
  request: Request,
  requests: ReadonlyArray<Request>,
  operation: OperationReference,
) =>
  requests.some(
    (r) =>
      r.seq < request.seq &&
      r.operation === request.operation &&
      Option.isSome(r.key) &&
      Option.contains(request.key, r.key.value) &&
      !heard(r, operation),
  );

const learnLatest = (fact: Fact, latest: Map<string, number>) => {
  if (Fact.$is("Requested")(fact) && Option.isSome(fact.request.key))
    latest.set(idOf(fact.request.operation, fact.request.key.value), fact.request.seq);
};

const learnLive = (fact: Fact, live: Set<string>) => {
  if (Fact.$is("Reloaded")(fact)) live.clear();

  if (!Fact.$is("Reported")(fact)) return;
  const observed = fact.observation;

  if (Observation.$is("Sent")(observed)) live.add(idOf(observed.operation, observed.attempt));

  if (Observation.$is("Ended")(observed) && Option.isSome(observed.attempt))
    live.delete(idOf(observed.operation, observed.attempt.value));
};

const unended = (asked: ReadonlyMap<string, Asked>) =>
  [...asked].flatMap(([id, a]) =>
    a.live
      ? [
          `WriteLanes I3: the server answered ${id} ${a.answer._tag} on a live send, and no ending names it`,
        ]
      : [],
  );

const endedAsAnswered = (facts: Facts) => {
  const live = new Set<string>();
  const latest = new Map<string, number>();

  const inStep = (step: ReadonlyArray<Fact>) => {
    const asked = new Map<string, Asked>();

    const ask = (fact: Fact) => {
      if (!Fact.$is("Answered")(fact) || Option.isNone(fact.request.key)) return;

      if (Answer.$is("Never")(fact.answer)) return;
      const id = idOf(fact.request.operation, fact.request.key.value);
      const operation = writeNamed(facts.reference, fact.request.operation);

      if (Option.isNone(operation)) return;
      const mayHaveApplied = earlierUnsure(fact.request, facts.requests, operation.value);
      const newest = latest.get(id) === fact.request.seq;
      asked.set(id, { answer: fact.answer, mayHaveApplied, live: newest && live.has(id) });
    };

    const end = (ended: Ended) => {
      if (Option.isNone(ended.attempt)) return [];
      const id = idOf(ended.operation, ended.attempt.value);
      const answered = Option.fromUndefinedOr(asked.get(id));
      const operation = writeNamed(facts.reference, ended.operation);
      asked.delete(id);

      if (Option.isNone(answered) || Option.isNone(operation)) return [];

      return judgeAnswered(id, answered.value, ended, operation.value);
    };

    const found = step.flatMap((fact) => {
      ask(fact);
      const judged = Option.toArray(endedOf(fact)).flatMap(end);
      learnLive(fact, live);
      learnLatest(fact, latest);

      return judged;
    });

    return [...found, ...unended(asked)];
  };

  return steps(facts.timeline).flatMap(inStep);
};

/**
 * Every delivered ending is exactly one of success, failure and unknown, and an Attempt that ever
 * ended unknown never delivers a definite failure.
 *
 * **Details**
 *
 * Three checks:
 * - an answer the suite's server gives to a live send (the newest request of that id, with a send
 *   reported and no ending since; an older send's late answer is fenced and ends nothing) ends
 *   that Attempt in the same step, under its id, on the channel the fixture's
 *   commit gives that answer (the fixture's reference); it is `unknown Defect` for a died call,
 *   and `unknown StillUnknown`, carrying the failure's tag when the runtime reports it, for a
 *   definite failure when an earlier send of that Attempt was never definitely answered by the
 *   server. Anchored to the server's log.
 * - a delivered ending runs the event the fixture's reference maps the ending's channel and reason
 *   to. The mapping is the suite's; the channel and reason are the runtime's own report, so for an
 *   ending the server did not decide (a decline, a restore, a cancel) this is consistency only.
 * - no Attempt reports a definite failure after an unknown (report consistency).
 *
 * **Gotchas**
 *
 * - Only operations the case's references name, once, are checked by mapping.
 * - An ending must come in the step its answer came; one in a later step is reported missing.
 * - Declines carry no Attempt id and are paired with deliveries in order per operation.
 */
export const endingChannels: Oracle = {
  name: "ending-channels",
  guarantee: "WriteLanes I3",
  check: (facts: Facts) => [
    ...endedAsAnswered(facts),
    ...deliveredAsMapped(facts.timeline, facts.reference),
    ...failureAfterUnknown(facts.timeline),
  ],
};
