import { Equal } from "effect";
import type { Surface } from "../surface.ts";
import { type InvariantId, Mismatch } from "./oracle.ts";

/**
 * A core Spec rule an expectation cites: an Invariant (`Compile I6`) or a Requirement with no
 * Invariant of its own (`Compile R17`).
 */
export type Cited = InvariantId | `${string} R${number}`;

/**
 * One expectation of a static case: unless `actual` equals `expected` by Effect's structural
 * equality, it fails citing `cited`.
 *
 * **Gotchas**
 *
 * - Only a failure citing an Invariant can prove a case-covered check; one citing a Requirement
 *   counts for no Invariant.
 */
export type Expect = <A>(cited: Cited, label: string, actual: A, expected: NoInfer<A>) => void;

/**
 * One static case (Conformance R14): its subject is a static surface, read through its public
 * results; it boots no runtime and has no step.
 *
 * **Details**
 *
 * - `cites`: the Spec Requirements and Invariants its expectations come from.
 * - `run`: builds its sources, calls the surface and checks each result with `expect`, whose
 *   failure names the Invariant it cites (Conformance R6's case expectations).
 */
export type StaticCase = {
  readonly id: string;
  readonly cites: ReadonlyArray<string>;
  readonly run: (surface: Surface, expect: Expect) => void;
};

const shown = <A>(value: A) => String(JSON.stringify(value));

/**
 * The {@link Expect} every static case runs with: a failure is a `Mismatch` whose label starts
 * with the cited Invariant.
 */
export const expect: Expect = (cited, label, actual, expected) => {
  if (!Equal.equals(actual, expected))
    throw new Mismatch({
      label: `${cited}: ${label}`,
      expected: shown(expected),
      actual: shown(actual),
    });
};

/**
 * Runs one static case on a surface; throws as the case does.
 */
export const playStatic = (surface: Surface, staticCase: StaticCase) =>
  staticCase.run(surface, expect);
