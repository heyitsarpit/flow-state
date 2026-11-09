import { Option } from "effect";
import {
  mappedEvent,
  type OperationReference,
  operationNamed,
  type Reference,
} from "../fixtures/reference.ts";
import { Observation } from "../port.ts";
import { Answer } from "../world/network.ts";
import { Fact, type Facts, type Oracle, steps } from "./oracle.ts";

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

  const endingOf = (delivered: Delivered) =>
    Option.isSome(delivered.attempt)
      ? Option.fromUndefinedOr(latest.get(idOf(delivered.operation, delivered.attempt.value)))
      : Option.fromUndefinedOr(declines.get(delivered.operation)?.shift());

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
    Option.map(endedOf(fact), remember);

    return Option.toArray(deliveredOf(fact)).flatMap(judge);
  });
};

const expectedEnding = (answer: Answer, mayHaveApplied: boolean, operation: OperationReference) => {
  const channel = operation.classify(answer, mayHaveApplied);

  if (channel === "failure" && mayHaveApplied)
    return { channel: "unknown" as const, reason: Option.some("StillUnknown") };

  if (channel === "failure" && Answer.$is("Fail")(answer))
    return { channel, reason: Option.some(answer.tag) };

  return { channel, reason: Option.none<string>() };
};

type Asked = { readonly answer: Answer; readonly mayHaveApplied: boolean };

const judgeAnswered = (id: string, asked: Asked, ended: Ended, operation: OperationReference) => {
  const expected = expectedEnding(asked.answer, asked.mayHaveApplied, operation);

  const reasonRight = Option.match(expected.reason, {
    onNone: () => true,
    onSome: (reason) => reason === ended.reason,
  });

  if (expected.channel === ended.channel && reasonRight) return [];

  const said = Option.match(expected.reason, { onNone: () => "", onSome: (r) => ` ${r}` });

  return [
    `WriteLanes I3: the server answered ${id} ${asked.answer._tag}, so it ends ${expected.channel}${said}; it ended ${ended.channel} ${ended.reason}`,
  ];
};

const endedAsAnswered = (timeline: ReadonlyArray<Fact>, reference: Reference) => {
  const unsure = new Set<string>();

  const inStep = (step: ReadonlyArray<Fact>) => {
    const asked = new Map<string, Asked>();

    const ask = (fact: Fact) => {
      if (!Fact.$is("Answered")(fact) || Option.isNone(fact.request.key)) return;
      const id = idOf(fact.request.operation, fact.request.key.value);
      asked.set(id, { answer: fact.answer, mayHaveApplied: unsure.has(id) });
    };

    const end = (ended: Ended) => {
      if (Option.isNone(ended.attempt)) return [];
      const id = idOf(ended.operation, ended.attempt.value);
      const answered = Option.fromUndefinedOr(asked.get(id));
      const operation = writeNamed(reference, ended.operation);
      asked.delete(id);

      if (ended.channel === "unknown") unsure.add(id);

      if (Option.isNone(answered) || Option.isNone(operation)) return [];

      return judgeAnswered(id, answered.value, ended, operation.value);
    };

    return step.flatMap((fact) => {
      ask(fact);

      return Option.toArray(endedOf(fact)).flatMap(end);
    });
  };

  return steps(timeline).flatMap(inStep);
};

/**
 * WriteLanes I3: every delivered ending is exactly one of success, failure and unknown, and an
 * Attempt that ever ended unknown never delivers a definite failure.
 *
 * **Details**
 *
 * Three checks, each anchored to a fact the suite owns:
 * - an ending decided in the step the suite's server answered its Attempt is on the channel the
 *   fixture's commit gives that answer (the fixture's reference), turned into `unknown
 *   StillUnknown` when an earlier send of the Attempt ended unknown;
 * - a delivered ending runs the event the fixture maps its channel and reason to;
 * - no Attempt reports a definite failure after an unknown (report consistency).
 *
 * **Gotchas**
 *
 * - Only operations the case's references name, once, are checked by mapping.
 * - The Port's `Ended` channel is typed; an adapter that cannot read a channel reports no ending,
 *   which the delivery check then sees as a delivery with no ending.
 */
export const threeChannels: Oracle = {
  name: "three-channels",
  guarantee: "WriteLanes I3",
  check: ({ timeline, reference }: Facts) => [
    ...endedAsAnswered(timeline, reference),
    ...deliveredAsMapped(timeline, reference),
    ...failureAfterUnknown(timeline),
  ],
};
