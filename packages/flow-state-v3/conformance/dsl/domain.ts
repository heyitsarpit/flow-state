import { Option, Predicate } from "effect";
import { operationNamed, type OperationReference, type Reference } from "../fixtures/reference.ts";
import { Answer, type Request, RequestPhase } from "../world/network.ts";
import { type ActorRef, type Channel, type Json, sameActor, sameJson } from "../port.ts";

/**
 * The text that names one Attempt of an operation in a violation and in an oracle's maps.
 *
 * **When to use**
 *
 * Every oracle that keys state by Attempt uses this one spelling.
 */
export const attemptKey = (operation: string, attempt: string) => `${operation} ${attempt}`;

/**
 * One write lane: its owner, operation, and the values of its key fields in their declared order.
 */
export type LaneId = {
  readonly owner: ActorRef;
  readonly operation: string;
  readonly key: ReadonlyArray<Json>;
};

/**
 * Whether two {@link LaneId}s name the same lane; key values compare as JSON values.
 */
export const sameLane = (a: LaneId, b: LaneId) =>
  sameActor(a.owner, b.owner) && a.operation === b.operation && sameJson(a.key, b.key);

const keyFieldsOf = (input: Json, fields: ReadonlyArray<string>) =>
  fields.map((field) =>
    Predicate.isObjectKeyword(input) && !Array.isArray(input)
      ? (Object.entries(input).find(([key]) => key === field)?.[1] ?? null)
      : null,
  );

/**
 * The lane a write's input or key names: its key fields' values, by the fixture's reference.
 */
export const laneOf = (owner: ActorRef, reference: Reference, operation: string, key: Json) => {
  const fields = Option.match(operationNamed(reference, operation), {
    onNone: () => [],
    onSome: (o) => o.keyFields,
  });

  return { owner, operation, key: keyFieldsOf(key, fields) };
};

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
