import { Option } from "effect";
import { attemptKey } from "../dsl/domain.ts";
import { Fact, oracle, reported, violation } from "../dsl/oracle.ts";
import { operationNamed, type Reference } from "../fixtures/reference.ts";
import { Observation, sameJson, type Sent } from "../port.ts";
import type { Request } from "../world/network.ts";

type Mint = { readonly operation: string; readonly attempt: string };

const isWrite = (reference: Reference, operation: string) =>
  Option.isSome(operationNamed(reference, operation));

const countOf = (keys: ReadonlyArray<string>, key: string) => keys.filter((k) => k === key).length;

const keyText = (request: Request) =>
  Option.match(request.key, { onNone: () => "(no key)", onSome: (key) => key });

const sentIn = (step: ReadonlyArray<Fact>, reference: Reference) =>
  step.flatMap((fact) =>
    Fact.$is("Reported")(fact) &&
    Observation.$is("Sent")(fact.observation) &&
    isWrite(reference, fact.observation.operation)
      ? [attemptKey(fact.observation.operation, fact.observation.attempt)]
      : [],
  );

const requestedIn = (step: ReadonlyArray<Fact>, reference: Reference) =>
  step.flatMap((fact) =>
    Fact.$is("Requested")(fact) && isWrite(reference, fact.request.operation)
      ? [`${fact.request.operation} ${keyText(fact.request)}`]
      : [],
  );

const sentAsRequested = (step: ReadonlyArray<Fact>, reference: Reference) => {
  const sent = sentIn(step, reference);
  const requested = requestedIn(step, reference);

  return [...new Set(requested)].flatMap((id) => {
    const received = countOf(requested, id);
    const reportedSent = countOf(sent, id);

    return received <= reportedSent
      ? []
      : [
          `WriteLanes I6: in one step the server received ${id} ${received} times and the runtime reported sending it ${reportedSent} times`,
        ];
  });
};

const idOf = (request: Request) =>
  Option.map(request.key, (key) => attemptKey(request.operation, key));

const oneInputPerKey = (requests: ReadonlyArray<Request>, from: number, reference: Reference) =>
  requests.slice(from).flatMap((request) => {
    const id = idOf(request);

    if (Option.isNone(id) || !isWrite(reference, request.operation)) return [];

    const first = requests.find((r) => Option.contains(idOf(r), id.value));

    return first === undefined || sameJson(first.input, request.input)
      ? []
      : [`WriteLanes I6: ${id.value} was sent with two inputs`];
  });

const mintsIn = (step: ReadonlyArray<Fact>) =>
  reported(step).flatMap((observed) =>
    Observation.$is("Minted")(observed)
      ? [{ operation: observed.operation, attempt: observed.attempt }]
      : [],
  );

const mintedOnce = (before: ReadonlyArray<Mint>, minted: ReadonlyArray<Mint>) =>
  minted.flatMap((m, at) =>
    [...before, ...minted.slice(0, at)].some((x) => x.attempt === m.attempt)
      ? [`WriteLanes I6: the id ${m.attempt} was minted twice`]
      : [],
  );

const mintedUnder = (operation: string, attempt: string, mints: ReadonlyArray<Mint>) => {
  if (mints.some((m) => m.operation === operation && m.attempt === attempt))
    return Option.none<string>();

  return Option.some(
    Option.match(Option.fromUndefinedOr(mints.find((m) => m.attempt === attempt)), {
      onNone: () => "no commit minted",
      onSome: (m) => `a commit of ${m.operation} minted`,
    }),
  );
};

const judgeSent = (sent: Sent, mints: ReadonlyArray<Mint>) =>
  Option.match(mintedUnder(sent.operation, sent.attempt, mints), {
    onNone: () => [],
    onSome: (why) => [
      `WriteLanes I6: an invoke of ${sent.operation} carried ${sent.attempt}, which ${why} it`,
    ],
  });

const judgeKey = (request: Request, mints: ReadonlyArray<Mint>, decided: ReadonlySet<string>) =>
  Option.match(request.key, {
    onNone: () => [`WriteLanes I6: a send of ${request.operation} carried no Attempt id`],
    onSome: (key) => {
      const wrong = mintedUnder(request.operation, key, mints);

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

const decidedIn = (decided: ReadonlySet<string>, step: ReadonlyArray<Fact>) =>
  new Set([
    ...decided,
    ...reported(step).flatMap((observed) =>
      Observation.$is("Ended")(observed) &&
      observed.channel !== "unknown" &&
      Option.isSome(observed.attempt)
        ? [attemptKey(observed.operation, observed.attempt.value)]
        : [],
    ),
  ]);

const keysMintedAndOpen = (
  mints: ReadonlyArray<Mint>,
  decidedBefore: ReadonlySet<string>,
  step: ReadonlyArray<Fact>,
  reference: Reference,
) =>
  step.flatMap((fact) => {
    if (
      Fact.$is("Reported")(fact) &&
      Observation.$is("Sent")(fact.observation) &&
      isWrite(reference, fact.observation.operation)
    )
      return judgeSent(fact.observation, mints);

    if (Fact.$is("Requested")(fact) && isWrite(reference, fact.request.operation))
      return judgeKey(fact.request, mints, decidedBefore);

    return [];
  });

type State = {
  readonly reference: Reference;
  readonly mints: ReadonlyArray<Mint>;
  readonly decided: ReadonlySet<string>;
  readonly checked: number;
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
export const attemptIdentity = oracle<State>({
  name: "attempt-identity",
  guarantee: ["WriteLanes I6"],
  start: (reference) => ({ reference, mints: [], decided: new Set(), checked: 0 }),
  step: (state, step, requests) => {
    const minted = mintsIn(step);
    const mints = [...state.mints, ...minted];

    return [
      { ...state, mints, decided: decidedIn(state.decided, step), checked: requests.length },
      [
        ...sentAsRequested(step, state.reference),
        ...keysMintedAndOpen(mints, state.decided, step, state.reference),
        ...oneInputPerKey(requests, state.checked, state.reference),
        ...mintedOnce(state.mints, minted),
      ].map(violation),
    ] as const;
  },
});
