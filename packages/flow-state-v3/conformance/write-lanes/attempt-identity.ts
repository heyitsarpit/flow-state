import { Option } from "effect";
import { type AttemptRef, attemptText, keyValues, sameAttempt } from "../dsl/domain.ts";
import { Fact, oracle, reported, violation } from "../dsl/oracle.ts";
import { operationNamed, type Reference } from "../fixtures/reference.ts";
import { type Json, Observation, sameJson, type Sent } from "../port.ts";
import type { Request } from "../world/network.ts";

type Mint = AttemptRef & { readonly key: Option.Option<Json> };

const isWrite = (reference: Reference, operation: string) =>
  Option.isSome(operationNamed(reference, operation));

const countOf = (refs: ReadonlyArray<AttemptRef>, ref: AttemptRef) =>
  refs.filter((r) => sameAttempt(r, ref)).length;

const distinct = (refs: ReadonlyArray<AttemptRef>) =>
  refs.filter((ref, at) => refs.findIndex((r) => sameAttempt(r, ref)) === at);

const refOf = (request: Request) =>
  Option.map(request.key, (attempt) => ({ operation: request.operation, attempt }));

const sentIn = (step: ReadonlyArray<Fact>, reference: Reference) =>
  step.flatMap((fact) =>
    Fact.$is("Reported")(fact) &&
    Observation.$is("Sent")(fact.observation) &&
    isWrite(reference, fact.observation.operation)
      ? [{ operation: fact.observation.operation, attempt: fact.observation.attempt }]
      : [],
  );

const requestedIn = (step: ReadonlyArray<Fact>, reference: Reference) =>
  step.flatMap((fact) =>
    Fact.$is("Requested")(fact) && isWrite(reference, fact.request.operation)
      ? Option.toArray(refOf(fact.request))
      : [],
  );

const sentAsRequested = (step: ReadonlyArray<Fact>, reference: Reference) => {
  const sent = sentIn(step, reference);
  const requested = requestedIn(step, reference);

  return distinct(requested).flatMap((ref) => {
    const received = countOf(requested, ref);
    const reportedSent = countOf(sent, ref);

    return received <= reportedSent
      ? []
      : [
          `WriteLanes I6: in one step the server received ${attemptText(ref)} ${received} times and the runtime reported sending it ${reportedSent} times`,
        ];
  });
};

const oneInputPerKey = (requests: ReadonlyArray<Request>, from: number, reference: Reference) =>
  requests.slice(from).flatMap((request) => {
    const ref = refOf(request);

    if (Option.isNone(ref) || !isWrite(reference, request.operation)) return [];

    const first = requests.find((r) => Option.exists(refOf(r), (x) => sameAttempt(x, ref.value)));

    return first === undefined || sameJson(first.input, request.input)
      ? []
      : [`WriteLanes I6: ${attemptText(ref.value)} was sent with two inputs`];
  });

const mintsIn = (step: ReadonlyArray<Fact>) =>
  reported(step).flatMap((observed) =>
    Observation.$is("Minted")(observed)
      ? [{ operation: observed.operation, attempt: observed.attempt, key: observed.key }]
      : [],
  );

const mintedOnce = (before: ReadonlyArray<Mint>, minted: ReadonlyArray<Mint>) =>
  minted.flatMap((m, at) =>
    [...before, ...minted.slice(0, at)].some((x) => x.attempt === m.attempt)
      ? [`WriteLanes I6: the id ${m.attempt} was minted twice`]
      : [],
  );

const mintedUnder = (ref: AttemptRef, mints: ReadonlyArray<Mint>) => {
  if (mints.some((m) => sameAttempt(m, ref))) return Option.none<string>();

  return Option.some(
    Option.match(Option.fromUndefinedOr(mints.find((m) => m.attempt === ref.attempt)), {
      onNone: () => "no commit minted",
      onSome: (m) => `a commit of ${m.operation} minted`,
    }),
  );
};

const judgeSent = (sent: Sent, mints: ReadonlyArray<Mint>) =>
  Option.match(mintedUnder(sent, mints), {
    onNone: () => [],
    onSome: (why) => [
      `WriteLanes I6: an invoke of ${sent.operation} carried ${sent.attempt}, which ${why} it`,
    ],
  });

const keyAsMinted = (
  reference: Reference,
  ref: AttemptRef,
  input: Json,
  mints: ReadonlyArray<Mint>,
) =>
  mints
    .filter((m) => sameAttempt(m, ref))
    .flatMap((m) => Option.toArray(m.key))
    .flatMap((key) => {
      const minted = keyValues(reference, ref.operation, key);
      const sent = keyValues(reference, ref.operation, input);

      return sameJson(minted, sent)
        ? []
        : [
            `WriteLanes I6: ${attemptText(ref)} was minted on key ${JSON.stringify(minted)} and sent with key ${JSON.stringify(sent)}`,
          ];
    });

const judgeKey = (
  reference: Reference,
  request: Request,
  mints: ReadonlyArray<Mint>,
  definite: ReadonlyArray<AttemptRef>,
) =>
  Option.match(refOf(request), {
    onNone: () => [`WriteLanes I6: a send of ${request.operation} carried no Attempt id`],
    onSome: (ref) => {
      const wrong = mintedUnder(ref, mints);

      if (Option.isSome(wrong))
        return [
          `WriteLanes I6: a send of ${request.operation} carried ${ref.attempt}, which ${wrong.value} it`,
        ];

      if (definite.some((d) => sameAttempt(d, ref)))
        return [`WriteLanes I6: ${attemptText(ref)} was sent again after it ended definitely`];

      return keyAsMinted(reference, ref, request.input, mints);
    },
  });

const definiteIn = (step: ReadonlyArray<Fact>) =>
  reported(step).flatMap((observed) =>
    Observation.$is("Ended")(observed) &&
    observed.channel !== "unknown" &&
    Option.isSome(observed.attempt)
      ? [{ operation: observed.operation, attempt: observed.attempt.value }]
      : [],
  );

const keysMintedAndOpen = (
  mints: ReadonlyArray<Mint>,
  definiteBefore: ReadonlyArray<AttemptRef>,
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
      return judgeKey(reference, fact.request, mints, definiteBefore);

    return [];
  });

type State = {
  readonly reference: Reference;
  readonly mints: ReadonlyArray<Mint>;
  readonly definite: ReadonlyArray<AttemptRef>;
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
 * - an Attempt is sent on the key it was minted on: the key fields of each send's input equal
 *   those of the key `Minted` reported (WriteLanes R5: an Attempt has one key and every send
 *   carries its one input; the check is convergence v2's, proposed). The lifecycle places the
 *   Attempt on its lane by that reported key;
 * - one id is always sent with one input (the server's log alone);
 * - no id is minted twice, under any operation (report consistency).
 *
 * It reads the server's log and the reports, never the Case's lifecycle fold: it is one of the
 * independent judges that guard the fold's common mode.
 *
 * **Gotchas**
 *
 * - A runtime that mints a fresh Attempt for a re-send and reports it honestly passes here: that
 *   is a lane rule ("a Held lane leaves Held only by a retry's resolution"), not this one.
 * - retryCount is checked by cases, not here: the Port's row does not name its Attempt.
 * - The key check reads the reference's current key fields from both sides. A key made by a hand
 *   closure, or minted under an older key version (WriteLanes R11), is not told apart: no fixture
 *   has either (a stated limit).
 */
export const attemptIdentity = oracle<State>({
  name: "attempt-identity",
  guarantee: ["WriteLanes I6"],
  start: (reference) => ({ reference, mints: [], definite: [], checked: 0 }),
  step: (state, step, requests) => {
    const minted = mintsIn(step);
    const mints = [...state.mints, ...minted];

    return [
      {
        ...state,
        mints,
        definite: [...state.definite, ...definiteIn(step)],
        checked: requests.length,
      },
      [
        ...sentAsRequested(step, state.reference),
        ...keysMintedAndOpen(mints, state.definite, step, state.reference),
        ...oneInputPerKey(requests, state.checked, state.reference),
        ...mintedOnce(state.mints, minted),
      ].map(violation),
    ] as const;
  },
});
