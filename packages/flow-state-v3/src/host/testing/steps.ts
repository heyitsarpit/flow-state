import { Data, type Duration, type Exit } from "effect";
import type { ActorId } from "../../core/world.ts";
import type { Envelope } from "../../definition.ts";

/**
 * What a wire word does to a fake's held call.
 */
export type WireWord = "hold" | "release" | "dropRequest" | "dropResponse";

/**
 * What a storage word does to the run's store.
 */
export type StorageWord = "hold" | "refuse" | "release";

/**
 * One step of a Story, as data. Made by the typed words of `Story`, `Fake.server` and
 * `Fake.store`, never by hand.
 */
export type Step = Data.TaggedEnum<{
  Attach: { actor: ActorId };
  Detach: { actor: ActorId };
  Forget: { actor: ActorId };
  Send: { actor: ActorId; event: Envelope };
  DisposeActor: { actor: ActorId };
  DisposeRuntime: {};
  Advance: { duration: Duration.Input };
  Reload: {};
  Checkpoint: { name: string };
  Wire: { fake: string; method: string; word: WireWord };
  // FLOW_STATE_ALLOW_UNKNOWN: the Exit has the fake's method's own types, checked where the word is made.
  Answer: { fake: string; method: string; exit: Exit.Exit<unknown, unknown> };
  Storage: { word: StorageWord };
}>;

/**
 * Constructors and matchers for {@link Step}.
 */
export const Step = Data.taggedEnum<Step>();

/**
 * Thrown by a run for a fault of its script, not of the app.
 */
export class StoryFailed extends Data.TaggedError("StoryFailed")<{ readonly problem: string }> {
  override get message() {
    return this.problem;
  }
}

/**
 * Stops a run on a fault of its script.
 */
export const scriptFault = (problem: string) => {
  // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a script fault ends the run at once and rejects run(); it is never an app outcome
  throw new StoryFailed({ problem });
};
