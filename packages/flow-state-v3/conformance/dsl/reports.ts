import { Option } from "effect";
import { operationNamed, type Reference } from "../fixtures/reference.ts";
import { type Minted, Observation, Unreadable } from "../port.ts";
import { type Fact, reported } from "./oracle.ts";

const missingField = (reference: Reference, minted: Minted) => {
  if (Option.isNone(minted.actor)) return Option.some("actor");

  const keyed = Option.exists(
    operationNamed(reference, minted.operation),
    (o) => o.keyFields.length > 0,
  );

  return keyed && Option.isNone(minted.key) ? Option.some("key") : Option.none();
};

/**
 * Stops a case at a report the Port requires and the runtime left incomplete: a mint with no actor,
 * or with no key on a keyed operation.
 */
export const decodeReports = (reference: Reference, fresh: ReadonlyArray<Fact>) => {
  for (const minted of reported(fresh).filter(Observation.$is("Minted"))) {
    const field = missingField(reference, minted);

    if (Option.isSome(field))
      throw new Unreadable({
        report: `Minted ${minted.operation} ${minted.attempt}`,
        issue: `it has no ${field.value}`,
      });
  }
};
