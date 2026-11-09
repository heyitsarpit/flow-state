import { Context, Layer } from "effect";
import type { Fact } from "../oracles/oracle.ts";

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
 * - `facts` is the whole timeline so far.
 * - Synchronous: a runtime reports from inside its own fibers.
 */
export class Timeline extends Context.Service<
  Timeline,
  {
    readonly record: (fact: Fact) => void;
    readonly facts: () => ReadonlyArray<Fact>;
  }
>()("flow-state-v3/conformance/dsl/Timeline") {
  /**
   * An empty timeline, one per case.
   */
  static readonly layer = Layer.sync(Timeline, () => {
    const facts: Array<Fact> = [];

    return Timeline.of({
      record: (fact) => {
        facts.push(fact);
      },
      facts: () => facts,
    });
  });
}
