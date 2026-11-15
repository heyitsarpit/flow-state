import { Data } from "effect";
import type { Request } from "./world/network.ts";
import { type ActorRef, type Observation, sameActor, type Use } from "./reports.ts";

/**
 * One entry of a case's timeline, in the order it happened: what the case did, what the server
 * received, and what the runtime reported.
 *
 * **Details**
 *
 * - `Stepped`: the case began a step; facts after it, up to the next, belong to that step.
 * - `Requested`: the server received this request, noted when the step that made it settles.
 * - `Landed`: the case landed every held store batch (perhaps none).
 * - `Disposal`: the runtime said its disposal ended (Actors R22, R23).
 */
export type Fact = Data.TaggedEnum<{
  Stepped: { what: string };
  Requested: { request: Request };
  Reloaded: {};
  Disposed: { actor: ActorRef };
  Forgot: { actor: ActorRef };
  Ensured: { actor: ActorRef; use: Use };
  Released: { actor: ActorRef; use: Use };
  DisposingRuntime: {};
  Landed: {};
  Reported: { observation: Observation };
  Disposal: {};
}>;

/**
 * Constructors and matchers for {@link Fact}.
 */
export const Fact = Data.taggedEnum<Fact>();

/**
 * The observations of a timeline, in order.
 */
export const reported = (timeline: ReadonlyArray<Fact>) =>
  timeline.flatMap((fact) => (Fact.$is("Reported")(fact) ? [fact.observation] : []));

/**
 * The uses a case holds after these facts, in the order they were attached: each `Ensured`
 * attaches its use, each `Released` ends one use of its kind, and `Disposed` or `Forgot` ends
 * every use of its actor. A reload re-attaches exactly these.
 */
export const usesHeld = (facts: ReadonlyArray<Fact>) =>
  facts.reduce<ReadonlyArray<readonly [ActorRef, Use]>>((held, fact) => {
    if (Fact.$is("Ensured")(fact)) return [...held, [fact.actor, fact.use] as const];

    if (Fact.$is("Released")(fact)) {
      const at = held.findIndex(([a, u]) => sameActor(a, fact.actor) && u === fact.use);

      return at < 0 ? held : held.toSpliced(at, 1);
    }

    if (Fact.$is("Disposed")(fact) || Fact.$is("Forgot")(fact))
      return held.filter(([a]) => !sameActor(a, fact.actor));

    return held;
  }, []);
