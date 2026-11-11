import { Option, Predicate } from "effect";
import { operationNamed, type OperationReference, type Reference } from "../fixtures/reference.ts";
import { Answer, type Request, RequestPhase } from "../world/network.ts";
import type { Channel, Json } from "../port.ts";

/**
 * One Attempt as the server and the reports name it: its operation and its id.
 */
export type AttemptRef = { readonly operation: string; readonly attempt: string };

/**
 * Whether two {@link AttemptRef}s name the same Attempt.
 */
export const sameAttempt = (a: AttemptRef, b: AttemptRef) =>
  a.operation === b.operation && a.attempt === b.attempt;

/**
 * How a violation names one Attempt: its operation, then its id.
 */
export const attemptText = ({ operation, attempt }: AttemptRef) => `${operation} ${attempt}`;

/**
 * The values of a write's key fields in a request's input or a reported key, in the order the
 * fixture's reference declares them; empty for an unkeyed operation, `null` for a missing field.
 */
export const keyValues = (reference: Reference, operation: string, value: Json) =>
  Option.match(operationNamed(reference, operation), {
    onNone: () => [],
    onSome: (o) =>
      o.keyFields.map((field) =>
        Predicate.isObjectKeyword(value) && !Array.isArray(value)
          ? (Object.entries(value).find(([key]) => key === field)?.[1] ?? null)
          : null,
      ),
  });

const heard = (request: Request, operation: OperationReference) =>
  RequestPhase.$match(request.phase, {
    Answered: ({ answer }) => operation.classify(answer, false) !== "unknown",
    Open: () => false,
    Hanging: () => false,
    Aborted: () => false,
    Orphaned: () => false,
  });

/**
 * The ending a server's answer gives an Attempt: its channel, and its reason where the answer fixes
 * one (a failure's tag, `StillUnknown` for a failure after an unknown send, `Defect` for a die).
 *
 * **When to use**
 *
 * Every oracle that asks how an answer settles a call asks this, so all of them agree.
 *
 * **Gotchas**
 *
 * - `Never` settles nothing: the request stays open, so the answer is none.
 */
// RETURN_TYPE: the branches build literal channels that would infer as several object types.
export const endingOf = (
  operation: OperationReference,
  requests: ReadonlyArray<Request>,
  request: Request,
  answer: Answer,
): Option.Option<{ readonly channel: Channel; readonly reason: Option.Option<string> }> => {
  if (Answer.$is("Never")(answer)) return Option.none();

  if (Answer.$is("Die")(answer))
    return Option.some({ channel: "unknown", reason: Option.some("Defect") });

  const may = mayHaveApplied(requests, request, operation);
  const channel = operation.classify(answer, may);

  if (channel === "failure" && may)
    return Option.some({ channel: "unknown", reason: Option.some("StillUnknown") });

  const tag =
    Answer.$is("Fail")(answer) || Answer.$is("FailButLanded")(answer)
      ? Option.some(answer.tag)
      : Option.none();

  return Option.some({ channel, reason: channel === "failure" ? tag : Option.none() });
};

/**
 * Whether an earlier send of this request's Attempt may have applied (the Attempt's
 * `mayHaveApplied`): the server log holds an earlier request with the same Attempt id that was
 * never definitely answered (still open, hanging, aborted, orphaned by a dead page, or answered in
 * a way its commit takes as unknown).
 *
 * **When to use**
 *
 * Every oracle that classifies an answer asks this, so all of them read "may have applied" off the
 * same server log.
 */
export const mayHaveApplied = (
  requests: ReadonlyArray<Request>,
  request: Request,
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
