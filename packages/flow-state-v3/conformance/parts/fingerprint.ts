import { Fact } from "../dsl/oracle.ts";
import { Observation } from "../port.ts";

/**
 * The work a replay did (Conformance R23): turns, publications, Attempts minted and requests by
 * operation, batches the store received and the characters of their keys and values.
 */
export type Fingerprint = {
  readonly turns: number;
  readonly publications: number;
  readonly commits: Readonly<Record<string, number>>;
  readonly requests: Readonly<Record<string, number>>;
  readonly batches: number;
  readonly bytes: number;
};

const counted = (names: ReadonlyArray<string>) =>
  Object.fromEntries(
    [...Map.groupBy(names, (n) => n)].map(([name, all]) => [name, all.length] as const),
  );

const observed = (facts: ReadonlyArray<Fact>) =>
  facts.flatMap((f) => (Fact.$is("Reported")(f) ? [f.observation] : []));

/**
 * The fingerprint of a replay, from the facts it recorded: the conformance run's and the bench's
 * alike, so the two compare the work each one's runtime did, never the script.
 */
export const fingerprintOf = ({ facts }: { readonly facts: ReadonlyArray<Fact> }) => {
  const observations = observed(facts);
  const wrote = facts.flatMap((f) => (Fact.$is("Wrote")(f) ? [f.bytes] : []));

  return {
    turns: observations.filter(Observation.$is("Turn")).length,
    publications: observations.filter(Observation.$is("Published")).length,
    commits: counted(observations.filter(Observation.$is("Minted")).map((o) => o.operation)),
    requests: counted(
      facts.flatMap((f) => (Fact.$is("Requested")(f) ? [f.request.operation] : [])),
    ),
    batches: wrote.length,
    bytes: wrote.reduce((sum, b) => sum + b, 0),
  } satisfies Fingerprint;
};
