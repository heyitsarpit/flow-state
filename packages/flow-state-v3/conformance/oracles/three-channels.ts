import { Option } from "effect";
import { mappedEvent, operationNamed, type Reference } from "../fixtures/reference.ts";
import { Observation } from "../port.ts";
import { Answer } from "../world/network.ts";
import { Fact, type Facts, type Oracle, steps } from "./oracle.ts";

type Ended = Extract<Observation, { readonly _tag: "Ended" }>;

const attemptText = (attempt: Option.Option<string>) => Option.getOrElse(attempt, () => "(none)");

const failureAfterUnknown = (timeline: ReadonlyArray<Fact>): ReadonlyArray<string> => {
  const unsure = new Set<string>();
  const found: Array<string> = [];

  for (const fact of timeline) {
    if (!Fact.$is("Reported")(fact) || !Observation.$is("Ended")(fact.observation)) continue;
    const { attempt, channel, operation } = fact.observation;

    if (Option.isNone(attempt)) continue;

    if (channel === "failure" && unsure.has(attempt.value))
      found.push(
        `WriteLanes I3: ${operation} ${attempt.value} ended unknown, then delivered a definite failure`,
      );

    if (channel === "unknown") unsure.add(attempt.value);
  }

  return found;
};

const deliveredAsMapped = (
  timeline: ReadonlyArray<Fact>,
  reference: Reference,
): ReadonlyArray<string> => {
  const latest = new Map<string, Ended>();
  const declines = new Map<string, Array<Ended>>();
  const found: Array<string> = [];

  for (const fact of timeline) {
    if (!Fact.$is("Reported")(fact)) continue;
    const observed = fact.observation;

    if (Observation.$is("Ended")(observed)) {
      if (Option.isSome(observed.attempt))
        latest.set(`${observed.operation} ${observed.attempt.value}`, observed);
      else
        declines.set(observed.operation, [...(declines.get(observed.operation) ?? []), observed]);
    }

    if (!Observation.$is("Delivered")(observed)) continue;
    const queue = declines.get(observed.operation) ?? [];

    const ended = Option.isSome(observed.attempt)
      ? latest.get(`${observed.operation} ${observed.attempt.value}`)
      : queue.shift();

    const operation = operationNamed(reference, observed.operation);

    if (ended === undefined) {
      found.push(
        `WriteLanes I3: ${observed.operation} ${attemptText(observed.attempt)} delivered ${observed.event} with no ending decided`,
      );
      continue;
    }

    if (Option.isNone(operation) || !operation.value.attempts) continue;
    const expected = mappedEvent(operation.value, ended.channel, ended.reason);

    if (Option.isNone(expected) || expected.value !== observed.event)
      found.push(
        `WriteLanes I3: ${observed.operation} ${attemptText(observed.attempt)} ended ${ended.channel} ${ended.reason} and ran ${observed.event}, not ${Option.getOrElse(expected, () => "(no mapping)")}`,
      );
  }

  return found;
};

const expectedEnding = (
  answer: Answer,
  mayHaveApplied: boolean,
  classify: (answer: Answer, mayHaveApplied: boolean) => Ended["channel"],
) => {
  const channel = classify(answer, mayHaveApplied);

  if (channel === "failure" && mayHaveApplied)
    return { channel: "unknown" as const, reason: Option.some("StillUnknown") };

  if (channel === "failure" && Answer.$is("Fail")(answer))
    return { channel, reason: Option.some(answer.tag) };

  return { channel, reason: Option.none<string>() };
};

const endedAsAnswered = (
  timeline: ReadonlyArray<Fact>,
  reference: Reference,
): ReadonlyArray<string> => {
  const unsure = new Set<string>();
  const found: Array<string> = [];

  for (const step of steps(timeline)) {
    const asked = new Map<string, { readonly answer: Answer; readonly mayHaveApplied: boolean }>();

    for (const fact of step) {
      if (Fact.$is("Answered")(fact) && Option.isSome(fact.request.key)) {
        const id = `${fact.request.operation} ${fact.request.key.value}`;
        asked.set(id, { answer: fact.answer, mayHaveApplied: unsure.has(id) });
      }

      if (!Fact.$is("Reported")(fact) || !Observation.$is("Ended")(fact.observation)) continue;
      const ended = fact.observation;

      if (Option.isNone(ended.attempt)) continue;
      const id = `${ended.operation} ${ended.attempt.value}`;
      const answered = asked.get(id);
      const operation = operationNamed(reference, ended.operation);

      if (answered !== undefined && Option.isSome(operation) && operation.value.attempts) {
        asked.delete(id);

        const expected = expectedEnding(
          answered.answer,
          answered.mayHaveApplied,
          operation.value.classify,
        );

        const reasonWrong =
          Option.isSome(expected.reason) && expected.reason.value !== ended.reason;

        if (expected.channel !== ended.channel || reasonWrong)
          found.push(
            `WriteLanes I3: the server answered ${id} ${answered.answer._tag}, so it ends ${expected.channel}${Option.match(expected.reason, { onNone: () => "", onSome: (r) => ` ${r}` })}; it ended ${ended.channel} ${ended.reason}`,
          );
      }

      if (ended.channel === "unknown") unsure.add(id);
    }
  }

  return found;
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
