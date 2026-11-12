import { Data } from "effect";
import type { Labels } from "../fixtures/folds.ts";
import { type ActorRef, type Json, sameActor, type Use } from "../port.ts";
import type { Answer, Request } from "../world/network.ts";

/**
 * Where in an actor an event the suite sends is addressed: its root, or the trait or fragment
 * instance at `path` (as the public API's scoped events, `E.t.Go`, address it).
 */
export type Address = Data.TaggedEnum<{
  Root: {};
  Part: { path: readonly [string, ...Array<string>] };
}>;

/**
 * Constructors and matchers for {@link Address}.
 */
export const Address = Data.taggedEnum<Address>();

/**
 * What the suite did and what its world saw: the facts the model's expect half reads (Conformance
 * R20). It also reads two runtime answers, stated limits until T45 step 6 lists them: `Purposed` and
 * `Acknowledges`.
 *
 * **Details**
 *
 * - `Stepped`: the suite began a step; facts after it, up to the next, belong to that step.
 * - `Requested`: the suite's server received this request, noted when the step that made it
 *   settles, after that step's reports.
 * - `Answered`: the suite's server answered this request; `labels` are the fixture's labels of
 *   the answer (`fixtures/folds.ts`).
 * - `Reloaded`: the suite killed the page and booted a new one, at this release of the app's code.
 * - `Disposed`: the suite disposed this actor.
 * - `Forgot`: the suite forgot this identity (its record removed; a live actor disposed first).
 * - `Ensured`: the suite attached a use of this actor, creating it if needed.
 * - `Released`: the suite ended one use of this actor.
 * - `DisposingRuntime`: the suite started the Runtime's disposal; it holds until the next reload.
 * - `Drove`: the suite sent this event to this actor, at its root or at one of its parts; `labels`
 *   are the fixture's labels of its payload.
 * - `Unstoppable`: from now on, calls of this operation cannot be interrupted.
 * - `Landed`: the suite landed every held batch (perhaps none).
 * - `Wrote`: the store received a batch of `bytes` characters of keys and values, noted when the
 *   step that wrote it settles, after that step's reports.
 * - `Dropped`: the suite answered the held batches `refuse` or `hang`: none of them lands.
 * - `Advanced`: the suite moved the world's clock forward by `ms`, firing the timers due.
 * - `Read`: the suite read this write's row (`O.x.get`).
 */
export type SuiteFact = Data.TaggedEnum<{
  Stepped: { step: number; what: string };
  Requested: { request: Request };
  Answered: { request: Request; answer: Answer; labels: Labels };
  Reloaded: { release: number };
  Disposed: { actor: ActorRef };
  Forgot: { actor: ActorRef };
  Ensured: { actor: ActorRef; use: Use };
  Released: { actor: ActorRef; use: Use };
  DisposingRuntime: {};
  Drove: { actor: ActorRef; event: string; to: Address; labels: Labels };
  Unstoppable: { operation: string };
  Landed: {};
  Wrote: { bytes: number };
  Dropped: {};
  Advanced: { ms: number };
  Read: { actor: ActorRef; operation: string; key: Json };
}>;

/**
 * Constructors and matchers for {@link SuiteFact}.
 */
export const SuiteFact = Data.taggedEnum<SuiteFact>();

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
  fact: SuiteFact,
): ReadonlyArray<readonly [ActorRef, Use]> => {
  if (SuiteFact.$is("Ensured")(fact)) return [...held, [fact.actor, fact.use] as const];

  if (SuiteFact.$is("Released")(fact)) {
    const at = held.findIndex(([a, u]) => sameActor(a, fact.actor) && u === fact.use);

    return at < 0 ? held : held.toSpliced(at, 1);
  }

  if (SuiteFact.$is("Disposed")(fact) || SuiteFact.$is("Forgot")(fact))
    return held.filter(([a]) => !sameActor(a, fact.actor));

  return held;
};

/**
 * A Spec Invariant as an oracle names it: the Spec, then the Invariant (`WriteLanes I8`).
 */
export type InvariantId = `${string} I${number}`;
