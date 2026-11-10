import { Option, Predicate } from "effect";
import { operationNamed, type Reference } from "../fixtures/reference.ts";
import { type ActorRef, type Json, sameActor, sameJson } from "../port.ts";

/**
 * The text that names one Attempt of an operation in a violation and in an oracle's maps.
 *
 * **When to use**
 *
 * Every oracle that keys state by Attempt uses this one spelling.
 */
export const attemptKey = (operation: string, attempt: string) => `${operation} ${attempt}`;

/**
 * The reference of a write (an operation whose sends are Attempts) by its name, when exactly one
 * fixture of the case declares it.
 *
 * **Gotchas**
 *
 * - The Port's endings name an operation, not its machine, so a name two machines share finds
 *   nothing.
 */
export const writeNamed = (reference: Reference, name: string) =>
  Option.filter(operationNamed(reference, name), (operation) => operation.attempts);

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
