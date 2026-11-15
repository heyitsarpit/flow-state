import { Data, type Duration } from "effect";
import type { Values } from "../../core/compiled.ts";
import type { Evidence } from "../../core/evidence.ts";
import type { ActorId } from "../../core/world.ts";
import type { Envelope } from "../../definition.ts";
import type { AnyServer } from "./fake.ts";

/**
 * Where a wire word acts on a call: before the server's handler runs, or after it, on its answer.
 */
export type At = "request" | "response";

/**
 * Where a call, write or trace event came from: its tab's name and which open of that tab it is,
 * counted from 1. A reload is the same tab's next open.
 */
export type Tab = { readonly name: string; readonly open: number };

/**
 * The tab a Story runs in at a given open.
 */
export const mainTab = (open: number) => ({ name: "main", open });

/**
 * One word a `world` step applies, as data: a fake control, a wire word on an endpoint, or a
 * storage word. Made by a server's controls and endpoints and by `Fake.storage`, never by hand.
 */
export type WorldWord = Data.TaggedEnum<{
  control: { server: AnyServer; control: string; input: Values };
  wire: { server: AnyServer; endpoint: string; word: "hold" | "release" | "drop"; at: At };
  storage: { word: "hold" | "refuse" | "release" };
}>;

/**
 * Constructors and matchers for {@link WorldWord}.
 */
export const WorldWord = Data.taggedEnum<WorldWord>();

/**
 * One step of a Story, as data, tagged with its step word's name. A chained Story's `steps` is an
 * array of these, and a run takes one back.
 */
export type Step = Data.TaggedEnum<{
  ensure: { actor: ActorId };
  detach: { actor: ActorId };
  send: { actor: ActorId; event: Envelope };
  dispose: { actor: ActorId; how: "dispose" | "forget" };
  disposeRuntime: {};
  world: { words: ReadonlyArray<WorldWord> };
  advance: { duration: Duration.Input };
  reload: { reattach: boolean; heldWrites: "abort" | "land" };
  checkpoint: { name: string };
}>;

/**
 * Constructors and matchers for {@link Step}.
 */
export const Step = Data.taggedEnum<Step>();

/**
 * A run's fault of its script, not of the app: it rejects `run()`.
 */
export class StoryFailed extends Data.TaggedError("StoryFailed")<{ readonly problem: string }> {
  override get message() {
    return this.problem;
  }
}

/**
 * A step ran past a turn or settle limit: it rejects `run()` with the evidence so far.
 *
 * **Details**
 *
 * `reason` is Turns (more than 10,000 turns in one instant) or Settle (a settle that did not end
 * within 100,000 tasks). `evidence` is every record up to the limit.
 */
export class StoryTurnLimit extends Data.TaggedError("StoryTurnLimit")<{
  readonly reason: "Turns" | "Settle";
  readonly step: number;
  readonly instant: number;
  readonly evidence: ReadonlyArray<Evidence>;
}> {
  override get message() {
    return `step ${this.step} passed the ${this.reason} limit at ${this.instant} ms`;
  }
}

/**
 * Stops a run on a fault of its script.
 */
export const scriptFault = (problem: string) => {
  // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a script fault ends the run at once and rejects run(); it is never an app outcome
  throw new StoryFailed({ problem });
};
