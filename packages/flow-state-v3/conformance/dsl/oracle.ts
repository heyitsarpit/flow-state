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
 * A Spec Invariant as an oracle names it: the Spec, then the Invariant (`WriteLanes I8`).
 */
export type InvariantId = `${string} I${number}`;

/**
 * One violation an oracle found: the Invariant broken and the evidence, in one sentence.
 */
export type Violation = { readonly invariant: InvariantId; readonly text: string };

const NAMED = /^(\S+ I\d+)(?: \([^)]*\))?: /u;

/**
 * A violation from a sentence that starts with its Invariant (`WriteLanes I8: ...`).
 *
 * **Gotchas**
 *
 * - A sentence that names no Invariant is a suite defect: it throws.
 */
// RETURN_TYPE: the Violation record; its Invariant is narrowed from the matched text.
export const violation = (sentence: string): Violation => {
  const found = NAMED.exec(sentence);
  const invariant = found?.[1];

  if (found === null || invariant === undefined) throw new UnnamedViolation({ sentence });

  // SAFETY: the pattern matched `<Spec> I<number>`, the InvariantId shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a template literal type has no runtime guard to narrow with
  return { invariant: invariant as InvariantId, text: sentence.slice(found[0].length) };
};

/**
 * A violation sentence that names no Invariant: a suite defect.
 */
export class UnnamedViolation extends Data.TaggedError("UnnamedViolation")<{
  readonly sentence: string;
}> {}

/**
 * One guarantee's check as a pure fold over the steps of a case.
 *
 * **When to use**
 *
 * Write one oracle module per guarantee, with its mutants beside it in `<name>.mutants.ts`, and
 * register it with {@link oracle}.
 *
 * **Details**
 *
 * - `start` builds the state from the case's reference; `step` takes the state, one step's facts
 *   in order and the server's log so far, and returns the next state and every violation found in
 *   that step.
 * - `guarantee` lists the Invariants it judges; each violation names one of them.
 *
 * **Gotchas**
 *
 * - An oracle anchors each runtime report to a fact the suite owns. One that only compares reports
 *   with each other checks consistency, and must say so in its doc comment.
 * - The step is the unit: an oracle may learn every fact of a step before judging it.
 */
export type Judge<S> = {
  readonly name: string;
  readonly guarantee: ReadonlyArray<InvariantId>;
  readonly start: (reference: Reference) => S;
  readonly step: (
    state: S,
    step: ReadonlyArray<Fact>,
    requests: ReadonlyArray<Request>,
  ) => readonly [S, ReadonlyArray<Violation>];
};

/**
 * A registered oracle: its name, its Invariants, and `open`, which starts one case's fold and
 * returns the function that judges each next step.
 */
export type Oracle = {
  readonly name: string;
  readonly guarantee: ReadonlyArray<InvariantId>;
  readonly open: (
    reference: Reference,
  ) => (step: ReadonlyArray<Fact>, requests: ReadonlyArray<Request>) => ReadonlyArray<Violation>;
};

/**
 * Registers a {@link Judge}: the Case keeps its state between steps, so the fold stays pure.
 */
// RETURN_TYPE: erases the state type, so oracles of different states share one registry.
export const oracle = <S>(judge: Judge<S>): Oracle => ({
  name: judge.name,
  guarantee: judge.guarantee,
  open: (reference) => {
    let state = judge.start(reference);

    return (step, requests) => {
      const [next, found] = judge.step(state, step, requests);
      state = next;

      return found;
    };
  },
});

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
