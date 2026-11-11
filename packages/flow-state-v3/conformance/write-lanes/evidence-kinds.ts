import { Option, Schema } from "effect";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import { EvidenceKind, Observation } from "../port.ts";

type Ending = { readonly operation: string; readonly attempt: Option.Option<string> };

const same = (a: Ending, b: Ending) =>
  a.operation === b.operation && Option.getOrNull(a.attempt) === Option.getOrNull(b.attempt);

const isEvidence = Schema.is(EvidenceKind);

/**
 * Evidence kinds (WriteLanes I4): no ending whose reason is an evidence kind is delivered.
 *
 * **Details**
 *
 * An `Ended` whose reason is an evidence kind (`Superseded`, `Released`, ...) is held per step
 * until its operation and Attempt are delivered; a `Delivered` of it breaks I4. It reads the
 * runtime's reports only (a consistency check): which reason an ending carries is the runtime's
 * word, and `ending-channels` judges the channel against the server.
 *
 * **Gotchas**
 *
 * - "No author tag equals a Flow reason" is a construction rule on the fixtures' failure tags,
 *   not judged here (Compile's).
 */
export const evidenceKinds = oracle<{ readonly held: ReadonlyArray<Ending> }>({
  name: "evidence-kinds",
  guarantee: ["WriteLanes I4"],
  start: () => ({ held: [] }),
  step: (state, step) => {
    const walked = step.reduce<{
      readonly held: ReadonlyArray<Ending>;
      readonly found: ReadonlyArray<string>;
    }>(
      (acc, fact) => {
        if (Fact.$is("Reloaded")(fact)) return { held: [], found: acc.found };

        if (!Fact.$is("Reported")(fact)) return acc;

        const o = fact.observation;

        if (Observation.$is("Ended")(o) && isEvidence(o.reason))
          return {
            held: [...acc.held, { operation: o.operation, attempt: o.attempt }],
            found: acc.found,
          };

        if (Observation.$is("Delivered")(o) && acc.held.some((e) => same(e, o)))
          return {
            held: acc.held.filter((e) => !same(e, o)),
            found: [
              ...acc.found,
              `WriteLanes I4: ${o.operation} ${Option.getOrElse(o.attempt, () => "(decline)")} ended with an evidence kind and was delivered as ${o.event}`,
            ],
          };

        return acc;
      },
      { held: state.held, found: [] },
    );

    return [{ held: walked.held }, walked.found.map(violation)];
  },
});
