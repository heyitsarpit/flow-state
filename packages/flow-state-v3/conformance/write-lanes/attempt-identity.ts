import { Option } from "effect";
import type { Reference } from "../fixtures/reference.ts";
import { attemptKey, writeNamed } from "../dsl/domain.ts";
import { Observation, sameJson, type Sent } from "../port.ts";
import type { Request } from "../world/network.ts";
import { Fact, oracle, reported, violation } from "../dsl/oracle.ts";

type Minting = {
  readonly pairs: Set<string>;
  readonly owner: Map<string, string>;
};

const isWrite = (reference: Reference, operation: string) =>
  Option.isSome(writeNamed(reference, operation));

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
        ? [attemptKey(fact.observation.operation, fact.observation.attempt)]
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

const sentAsRequested = (step: ReadonlyArray<Fact>, reference: Reference) => {
  const sent = sentIn(step, reference);
  const requested = requestedIn(step, reference);

  return [...requested.keys()].flatMap((id) =>
    (requested.get(id) ?? 0) <= (sent.get(id) ?? 0)
      ? []
      : [
          `WriteLanes I6: in one step the server received ${id} ${requested.get(id) ?? 0} times and the runtime reported sending it ${sent.get(id) ?? 0} times`,
        ],
  );
};

const oneInputPerKey = (
  first: Map<string, Request>,
  requests: ReadonlyArray<Request>,
  reference: Reference,
) =>
  requests.flatMap((request) => {
    if (Option.isNone(request.key) || !isWrite(reference, request.operation)) return [];
    const id = attemptKey(request.operation, request.key.value);
    const before = first.get(id);

    if (before === undefined) first.set(id, request);

    return before === undefined || sameJson(before.input, request.input)
      ? []
      : [`WriteLanes I6: ${id} was sent with two inputs`];
  });

const mintedOnce = (seen: Set<string>, step: ReadonlyArray<Fact>) =>
  reported(step).flatMap((observed) => {
    if (!Observation.$is("Minted")(observed)) return [];
    const twice = seen.has(observed.attempt);
    seen.add(observed.attempt);

    return twice ? [`WriteLanes I6: the id ${observed.attempt} was minted twice`] : [];
  });

const mintedUnder = (operation: string, attempt: string, minting: Minting) => {
  if (minting.pairs.has(attemptKey(operation, attempt))) return Option.none<string>();

  return Option.some(
    Option.match(Option.fromUndefinedOr(minting.owner.get(attempt)), {
      onNone: () => "no commit minted",
      onSome: (owner) => `a commit of ${owner} minted`,
    }),
  );
};

const judgeSent = (sent: Sent, minting: Minting) =>
  Option.match(mintedUnder(sent.operation, sent.attempt, minting), {
    onNone: () => [],
    onSome: (why) => [
      `WriteLanes I6: an invoke of ${sent.operation} carried ${sent.attempt}, which ${why} it`,
    ],
  });

const judgeKey = (request: Request, minting: Minting, decided: ReadonlySet<string>) =>
  Option.match(request.key, {
    onNone: () => [`WriteLanes I6: a send of ${request.operation} carried no Attempt id`],
    onSome: (key) => {
      const wrong = mintedUnder(request.operation, key, minting);

      if (Option.isSome(wrong))
        return [
          `WriteLanes I6: a send of ${request.operation} carried ${key}, which ${wrong.value} it`,
        ];

      if (decided.has(attemptKey(request.operation, key)))
        return [
          `WriteLanes I6: ${request.operation} ${key} was sent again after it ended definitely`,
        ];

      return [];
    },
  });

type Keys = { readonly minting: Minting; readonly decided: Set<string> };

const keysMintedAndOpen = (
  { minting, decided }: Keys,
  step: ReadonlyArray<Fact>,
  reference: Reference,
) => {
  const learn = (observed: Observation) => {
    if (Observation.$is("Minted")(observed)) {
      minting.pairs.add(attemptKey(observed.operation, observed.attempt));

      if (!minting.owner.has(observed.attempt))
        minting.owner.set(observed.attempt, observed.operation);
    }

    if (
      Observation.$is("Ended")(observed) &&
      observed.channel !== "unknown" &&
      Option.isSome(observed.attempt)
    )
      decided.add(attemptKey(observed.operation, observed.attempt.value));
  };

  const judgeStep = () => {
    const decidedBefore = new Set(decided);

    for (const fact of step) if (Fact.$is("Reported")(fact)) learn(fact.observation);

    return step.flatMap((fact) => {
      if (
        Fact.$is("Reported")(fact) &&
        Observation.$is("Sent")(fact.observation) &&
        isWrite(reference, fact.observation.operation)
      )
        return judgeSent(fact.observation, minting);

      if (Fact.$is("Requested")(fact) && isWrite(reference, fact.request.operation))
        return judgeKey(fact.request, minting, decidedBefore);

      return [];
    });
  };

  return judgeStep();
};

/**
 * All sends of one Attempt carry the same id and the same input, and no two writes share an id.
 *
 * **Details**
 *
 * The suite's server sees each send's idempotency key and input; each check holds that against
 * the runtime's reports:
 * - in each step, every send the server receives under an id is one the runtime reported sending
 *   under that id (a reported send may die before it reaches the server);
 * - an Attempt is its operation and id: every invoke the runtime reports, and every send the
 *   server receives, names the operation its id was minted under, and the id was reported minted
 *   by the end of its step; a send of it in a step after its reported definite ending is a
 *   violation;
 * - one id is always sent with one input (the server's log alone);
 * - no id is minted twice, under any operation (report consistency).
 *
 * **Gotchas**
 *
 * - A runtime that mints a fresh Attempt for a re-send and reports it honestly passes here: that
 *   is a lane rule ("a Held lane leaves Held only by a retry's resolution"), not this one.
 * - retryCount is checked by cases, not here: the Port's row does not name its Attempt.
 */
type State = {
  readonly reference: Reference;
  readonly keys: Keys;
  readonly first: Map<string, Request>;
  readonly seen: Set<string>;
  readonly checked: number;
};

export const attemptIdentity = oracle<State>({
  name: "attempt-identity",
  guarantee: ["WriteLanes I6"],
  start: (reference) => ({
    reference,
    keys: { minting: { pairs: new Set(), owner: new Map() }, decided: new Set() },
    first: new Map(),
    seen: new Set(),
    checked: 0,
  }),
  step: (state, step, requests) =>
    [
      { ...state, checked: requests.length },
      [
        ...sentAsRequested(step, state.reference),
        ...keysMintedAndOpen(state.keys, step, state.reference),
        ...oneInputPerKey(state.first, requests.slice(state.checked), state.reference),
        ...mintedOnce(state.seen, step),
      ].map(violation),
    ] as const,
});
