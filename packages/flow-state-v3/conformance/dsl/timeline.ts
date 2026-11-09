import type { Fact } from "./oracle.ts";

/**
 * One case's timeline: every fact, in the order it happened.
 *
 * **When to use**
 *
 * The Case records what it drove and what its world saw; a runtime's reports reach it through
 * `Boot.observe`. Oracles read the facts after each step.
 *
 * **Details**
 *
 * - `record` appends; nothing is ever changed or removed.
 * - `facts` is a copy of the whole timeline so far.
 * - Synchronous: a runtime reports from inside its own fibers.
 */
export type Timeline = {
  readonly record: (fact: Fact) => void;
  readonly facts: () => ReadonlyArray<Fact>;
};

/**
 * An empty timeline, one per case.
 */
// RETURN_TYPE: the exported Timeline contract the Case records on.
export const makeTimeline = (): Timeline => {
  const facts: Array<Fact> = [];

  return {
    record: (fact) => {
      facts.push(fact);
    },
    facts: () => [...facts],
  };
};
