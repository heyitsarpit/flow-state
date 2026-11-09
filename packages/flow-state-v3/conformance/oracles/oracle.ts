import { Data } from "effect";
import type { Reference } from "../fixtures/reference.ts";
import type { Observation } from "../port.ts";
import type { Answer, Request } from "../world/network.ts";

/**
 * One entry of a case's timeline: what the suite did, what its world saw, and what the runtime
 * reported, in the order they happened.
 *
 * **Details**
 *
 * - `Stepped`: the suite began a step; facts after it, up to the next, belong to that step.
 * - `Requested`: the suite's server received this request, noted when the step that made it
 *   settles, after that step's reports.
 * - `Answered`: the suite's server answered this request.
 * - `Reported`: the runtime reported this observation.
 * - `Reloaded`: the suite killed the page and booted a new one.
 */
export type Fact = Data.TaggedEnum<{
  Stepped: { readonly step: number; readonly what: string };
  Requested: { readonly request: Request };
  Answered: { readonly request: Request; readonly answer: Answer };
  Reported: { readonly observation: Observation };
  Reloaded: {};
}>;

/**
 * Constructors and matchers for {@link Fact}.
 */
export const Fact = Data.taggedEnum<Fact>();

/**
 * What an oracle reads after each step: the timeline, the server's log, and the references of the
 * case's fixtures.
 */
export type Facts = {
  readonly timeline: ReadonlyArray<Fact>;
  readonly requests: ReadonlyArray<Request>;
  readonly reference: Reference;
};

/**
 * One guarantee's check, run after every step of every case.
 *
 * **When to use**
 *
 * Write one oracle module per guarantee, with its lies beside it in `<name>.lies.ts`.
 *
 * **Details**
 *
 * `check` returns every violation it finds, each a sentence naming the rule and the evidence; an
 * empty list is a pass.
 *
 * **Gotchas**
 *
 * - An oracle anchors each runtime report to a fact the suite owns. One that only compares reports
 *   with each other checks consistency, and must say so in its doc comment.
 */
export type Oracle = {
  readonly name: string;
  readonly guarantee: string;
  readonly check: (facts: Facts) => ReadonlyArray<string>;
};

/**
 * A wrong runtime an oracle must catch: edits to a runtime's source, the cases it is run on, and
 * the oracle that must turn at least one of them red.
 *
 * **When to use**
 *
 * Beside each oracle, in `<name>.lies.ts`. Falsify copies the runtime, applies the edits and runs
 * the cases.
 *
 * **Details**
 *
 * - `runtime`: which adapter's source the edits apply to.
 * - `edits`: each `find` must occur exactly once in its file, or the lie is reported as not
 *   applying, never as caught.
 * - `says`: what the wrong runtime does, in one sentence.
 */
export type Lie = {
  readonly name: string;
  readonly oracle: string;
  readonly says: string;
  readonly runtime: "prototype";
  readonly cases: ReadonlyArray<string>;
  readonly edits: ReadonlyArray<{
    readonly file: string;
    readonly find: string;
    readonly replace: string;
  }>;
};

/**
 * The observations of a timeline, in order.
 */
// RETURN_TYPE: The public view is read-only; an oracle must not mutate the timeline's observations.
export const reported = (timeline: ReadonlyArray<Fact>): ReadonlyArray<Observation> =>
  timeline.flatMap((fact) => (Fact.$is("Reported")(fact) ? [fact.observation] : []));

/**
 * The timeline cut into steps: each step's facts, in order.
 */
// RETURN_TYPE: The public view is read-only; an oracle must not mutate a step's facts.
export const steps = (timeline: ReadonlyArray<Fact>): ReadonlyArray<ReadonlyArray<Fact>> => {
  const cut: Array<Array<Fact>> = [];

  for (const fact of timeline) {
    const open = cut.at(-1);

    if (open === undefined || Fact.$is("Stepped")(fact)) cut.push([fact]);
    else open.push(fact);
  }

  return cut;
};
