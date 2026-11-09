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

const keyText = (request: Request) => Option.getOrElse(request.key, () => "(no key)");

const sentIn = (step: ReadonlyArray<Fact>, reference: Reference) =>
  tally(
    step.flatMap((fact) =>
      Fact.$is("Reported")(fact) &&
      Observation.$is("Sent")(fact.observation) &&
      isWrite(reference, fact.observation.operation)
        ? [`${fact.observation.operation} ${fact.observation.attempt}`]
        : [],
    ),
  );

const requestedIn = (step: ReadonlyArray<Fact>, reference: Reference) =>
  tally(
    step.flatMap((fact) =>
      Fact.$is("Requested")(fact) && isWrite(reference, fact.request.operation)
        ? [`${fact.request.operation} ${keyText(fact.request)}`]
        : [],
    ),
  );

const sentAsRequested = (timeline: ReadonlyArray<Fact>, reference: Reference) =>
  steps(timeline).flatMap((step) => {
    const sent = sentIn(step, reference);
    const requested = requestedIn(step, reference);

    return [...requested.keys()].flatMap((id) =>
      (requested.get(id) ?? 0) <= (sent.get(id) ?? 0)
        ? []
        : [
            `WriteLanes I6: in one step the server received ${id} ${requested.get(id) ?? 0} times and the runtime reported sending it ${sent.get(id) ?? 0} times`,
          ],
    );
  });

const oneInputPerKey = (requests: ReadonlyArray<Request>, reference: Reference) => {
  const first = new Map<string, Request>();

  return requests.flatMap((request) => {
    if (Option.isNone(request.key) || !isWrite(reference, request.operation)) return [];
    const id = `${request.operation} ${request.key.value}`;
    const before = first.get(id);

    if (before === undefined) first.set(id, request);

    return before === undefined || sameData(before.input, request.input)
      ? []
      : [`WriteLanes I6: ${id} was sent with two inputs`];
  });
};

const mintedOnce = (timeline: ReadonlyArray<Fact>) => {
  const seen = new Set<string>();

  return reported(timeline).flatMap((observed) => {
    if (!Observation.$is("Minted")(observed)) return [];
    const twice = seen.has(observed.attempt);
    seen.add(observed.attempt);

    return twice ? [`WriteLanes I6: the id ${observed.attempt} was minted twice`] : [];
  });
};

const judgeKey = (request: Request, minted: ReadonlySet<string>, decided: ReadonlySet<string>) =>
  Option.match(request.key, {
    onNone: () => [`WriteLanes I6: a send of ${request.operation} carried no Attempt id`],
    onSome: (key) => {
      if (!minted.has(key))
        return [
          `WriteLanes I6: a send of ${request.operation} carried ${key}, which no commit minted`,
        ];

      if (decided.has(key))
        return [
          `WriteLanes I6: ${request.operation} ${key} was sent again after it ended definitely`,
        ];

      return [];
    },
  });

const keysMintedAndOpen = (timeline: ReadonlyArray<Fact>, reference: Reference) => {
  const minted = new Set<string>();
  const decided = new Set<string>();

  const learn = (observed: Observation) => {
    if (Observation.$is("Minted")(observed)) minted.add(observed.attempt);

    if (
      Observation.$is("Ended")(observed) &&
      observed.channel !== "unknown" &&
      Option.isSome(observed.attempt)
    )
      decided.add(observed.attempt.value);
  };

  return timeline.flatMap((fact) => {
    if (Fact.$is("Reported")(fact)) learn(fact.observation);

    return Fact.$is("Requested")(fact) && isWrite(reference, fact.request.operation)
      ? judgeKey(fact.request, minted, decided)
      : [];
  });
};

/**
 * WriteLanes I6: all sends of one Attempt carry the same id and the same input, and no two writes
 * share an id.
 *
 * **Details**
 *
 * The suite's server sees each send's idempotency key and input; each check holds that against
 * the runtime's reports:
 * - in each step, every send the server receives under an id is one the runtime reported sending
 *   under that id (a reported send may die before it reaches the server);
 * - every send carries an id the runtime reported minting, and none follows that Attempt's
 *   reported definite ending;
 * - one id is always sent with one input (the server's log alone);
 * - no id is minted twice (report consistency).
 *
 * **Gotchas**
 *
 * - A runtime that mints a fresh Attempt for a re-send and reports it honestly passes here: that
 *   is a lane rule ("a Held lane leaves Held only by a retry's resolution"), not this one.
 * - retryCount is checked by cases, not here: the Port's row does not name its Attempt.
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
