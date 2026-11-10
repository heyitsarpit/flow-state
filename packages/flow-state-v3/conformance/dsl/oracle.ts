import { Data, type Option } from "effect";
import type { Reference } from "../fixtures/reference.ts";
import { type ActorRef, type Json, type Observation, sameActor, type Use } from "../port.ts";
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
 * - `Disposed`: the suite disposed this actor.
 * - `Forgot`: the suite forgot this identity (its record removed; a live actor disposed first).
 * - `Ensured`: the suite attached a use of this actor, creating it if needed.
 * - `Released`: the suite ended one use of this actor.
 * - `DisposingRuntime`: the suite started the Runtime's disposal; it holds until the next reload.
 * - `Drove`: the suite sent this event to this actor.
 * - `Unstoppable`: from now on, calls of this operation cannot be interrupted.
 * - `Advanced`: the suite moved the world's clock forward by `ms`, firing the timers due.
 * - `Read`: the suite read this write's row (`O.x.get`) and the runtime returned `row`.
 */
export type Fact = Data.TaggedEnum<{
  Stepped: { step: number; what: string };
  Requested: { request: Request };
  Answered: { request: Request; answer: Answer };
  Reported: { observation: Observation };
  Reloaded: {};
  Disposed: { actor: ActorRef };
  Forgot: { actor: ActorRef };
  Ensured: { actor: ActorRef; use: Use };
  Released: { actor: ActorRef; use: Use };
  DisposingRuntime: {};
  Drove: { actor: ActorRef; event: string };
  Unstoppable: { operation: string };
  Advanced: { ms: number };
  Read: { actor: ActorRef; operation: string; key: Json; row: Option.Option<Json> };
}>;

/**
 * Constructors and matchers for {@link Fact}.
 */
export const Fact = Data.taggedEnum<Fact>();

/**
 * How long a Runtime's disposal waits for calls on the wire before it ends them, in ms.
 */
export const disposalBoundMs = 5000;

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
 * Write one oracle module per guarantee, with its mutants beside it in `<name>.mutants.ts`.
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
 * A wrong runtime an oracle must catch: edits to a runtime's source and the cases it is run on.
 * The {@link Guarantee} that holds it names the oracle that must turn one of them red.
 *
 * **When to use**
 *
 * Beside each oracle, in `<name>.mutants.ts`. Falsify copies the runtime, applies the edits and runs
 * the cases.
 *
 * **Details**
 *
 * - `runtime`: which adapter's source the edits apply to.
 * - `edits`: each `find` must occur exactly once in its file, or the mutant is reported as not
 *   applying, never as caught.
 * - `says`: what the wrong runtime does, in one sentence.
 * - `expects`: the Spec Invariant it breaks, as its oracle names it (`WriteLanes I8`); falsify
 *   counts it caught only by a violation of its oracle that names this Invariant.
 */
export type Mutant = {
  readonly name: string;
  readonly says: string;
  readonly expects: string;
  readonly runtime: "prototype" | "production";
  readonly cases: ReadonlyArray<string>;
  readonly edits: ReadonlyArray<{
    readonly file: string;
    readonly find: string;
    readonly replace: string;
  }>;
};

/**
 * One guarantee as the suite runs it: its oracle and the mutants that oracle must catch.
 *
 * **Gotchas**
 *
 * - Falsify fails a guarantee with no mutant for the runtime it runs on: an oracle nothing can turn
 *   red proves nothing.
 */
export type Guarantee = { readonly oracle: Oracle; readonly mutants: ReadonlyArray<Mutant> };

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

/**
 * The uses held after one more fact: an `Ensured` attaches its use, a `Released` ends one use of
 * its kind, and `Disposed` or `Forgot` ends every use of its actor.
 *
 * **When to use**
 *
 * To follow the held uses fact by fact; {@link usesHeld} folds a whole list with it.
 */
// RETURN_TYPE: The public view is read-only; a reader must not change the held uses.
export const holdUse = (
  held: ReadonlyArray<readonly [ActorRef, Use]>,
  fact: Fact,
): ReadonlyArray<readonly [ActorRef, Use]> => {
  if (Fact.$is("Ensured")(fact)) return [...held, [fact.actor, fact.use] as const];

  if (Fact.$is("Released")(fact)) {
    const at = held.findIndex(([a, u]) => sameActor(a, fact.actor) && u === fact.use);

    return at < 0 ? held : held.toSpliced(at, 1);
  }

  if (Fact.$is("Disposed")(fact) || Fact.$is("Forgot")(fact))
    return held.filter(([a]) => !sameActor(a, fact.actor));

  return held;
};

/**
 * The uses the suite holds after these facts, in the order they were attached: each `Ensured`
 * attaches its use, each `Released` ends one use of its kind, and `Disposed` ends every use
 * of its actor.
 *
 * **When to use**
 *
 * A reload re-attaches exactly these; an oracle reads them to know which actors a reload brings
 * back.
 */
// RETURN_TYPE: The public view is read-only; a reader must not change the held uses.
export const usesHeld = (facts: ReadonlyArray<Fact>): ReadonlyArray<readonly [ActorRef, Use]> =>
  facts.reduce(holdUse, []);
