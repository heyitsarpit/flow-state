import { Option } from "effect";
import { operationNamed, type Reference } from "../fixtures/reference.ts";
import { Observation } from "../port.ts";
import type { Request } from "../world/network.ts";
import { sameData } from "./equality.ts";
import { Fact, type Facts, type Oracle, reported, steps } from "./oracle.ts";

const isWrite = (reference: Reference, operation: string) =>
  Option.match(operationNamed(reference, operation), {
    onNone: () => false,
    onSome: (o) => o.attempts,
  });

const tally = (keys: ReadonlyArray<string>) => {
  const counts = new Map<string, number>();

  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);

  return counts;
};

const sentAsRequested = (
  timeline: ReadonlyArray<Fact>,
  reference: Reference,
): ReadonlyArray<string> =>
  steps(timeline).flatMap((step) => {
    const sent = tally(
      step.flatMap((fact) =>
        Fact.$is("Reported")(fact) &&
        Observation.$is("Sent")(fact.observation) &&
        isWrite(reference, fact.observation.operation)
          ? [`${fact.observation.operation} ${fact.observation.attempt}`]
          : [],
      ),
    );

    const requested = tally(
      step.flatMap((fact) =>
        Fact.$is("Requested")(fact) && isWrite(reference, fact.request.operation)
          ? [`${fact.request.operation} ${Option.getOrElse(fact.request.key, () => "(no key)")}`]
          : [],
      ),
    );

    return [...new Set([...sent.keys(), ...requested.keys()])].flatMap((id) =>
      (sent.get(id) ?? 0) === (requested.get(id) ?? 0)
        ? []
        : [
            `WriteLanes I6: in one step the runtime sent ${id} ${sent.get(id) ?? 0} times and the server received it ${requested.get(id) ?? 0} times`,
          ],
    );
  });

const oneInputPerKey = (
  requests: ReadonlyArray<Request>,
  reference: Reference,
): ReadonlyArray<string> => {
  const first = new Map<string, Request>();
  const found: Array<string> = [];

  for (const request of requests) {
    if (Option.isNone(request.key) || !isWrite(reference, request.operation)) continue;
    const id = `${request.operation} ${request.key.value}`;
    const before = first.get(id);

    if (before === undefined) first.set(id, request);
    else if (!sameData(before.input, request.input))
      found.push(`WriteLanes I6: ${id} was sent with two inputs`);
  }

  return found;
};

const mintedOnce = (timeline: ReadonlyArray<Fact>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const found: Array<string> = [];

  for (const observed of reported(timeline)) {
    if (!Observation.$is("Minted")(observed)) continue;

    if (seen.has(observed.attempt))
      found.push(`WriteLanes I6: the id ${observed.attempt} was minted twice`);
    seen.add(observed.attempt);
  }

  return found;
};

const keysMintedAndOpen = (
  timeline: ReadonlyArray<Fact>,
  reference: Reference,
): ReadonlyArray<string> => {
  const minted = new Set<string>();
  const decided = new Set<string>();
  const found: Array<string> = [];

  for (const fact of timeline) {
    if (Fact.$is("Reported")(fact) && Observation.$is("Minted")(fact.observation))
      minted.add(fact.observation.attempt);

    if (
      Fact.$is("Reported")(fact) &&
      Observation.$is("Ended")(fact.observation) &&
      fact.observation.channel !== "unknown"
    )
      Option.map(fact.observation.attempt, (attempt) => decided.add(attempt));

    if (!Fact.$is("Requested")(fact) || !isWrite(reference, fact.request.operation)) continue;
    const { key, operation } = fact.request;

    if (Option.isNone(key))
      found.push(`WriteLanes I6: a send of ${operation} carried no Attempt id`);
    else if (!minted.has(key.value))
      found.push(
        `WriteLanes I6: a send of ${operation} carried ${key.value}, which no commit minted`,
      );
    else if (decided.has(key.value))
      found.push(
        `WriteLanes I6: ${operation} ${key.value} was sent again after it ended definitely`,
      );
  }

  return found;
};

/**
 * WriteLanes I6: all sends of one Attempt carry the same id and the same input, and no two writes
 * share an id.
 *
 * **Details**
 *
 * Anchored to the suite's server, which sees each send's idempotency key and input:
 * - in each step, every send the runtime reports reaches the server under that Attempt's id, once
 *   per report;
 * - every send carries an id a commit minted, and none follows the Attempt's definite ending;
 * - one id is always sent with one input;
 * - no id is minted twice (report consistency).
 *
 * **Gotchas**
 *
 * - A runtime that mints a fresh Attempt for a re-send and reports it honestly passes here; the
 *   lane oracle (WriteLanes I12) owns "a Held lane leaves Held only by a retry's resolution".
 * - I7 (retryCount) is checked by cases, not here: the Port's row does not name its Attempt.
 */
export const attemptIdentity: Oracle = {
  name: "attempt-identity",
  guarantee: "WriteLanes I6",
  check: ({ timeline, requests, reference }: Facts) => [
    ...sentAsRequested(timeline, reference),
    ...keysMintedAndOpen(timeline, reference),
    ...oneInputPerKey(requests, reference),
    ...mintedOnce(timeline),
  ],
};
