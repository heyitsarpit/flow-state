import { Data, type Duration } from "effect";
import type { Values } from "../../core/compiled.ts";
import type { Evidence } from "../../core/evidence.ts";
import type { ActorId, Wiring } from "../../core/world.ts";
import type { AnyDefinition, Envelope } from "../../definition.ts";
import type { AnyServer } from "./fake.ts";

/**
 * Where a wire word acts on a call: before the server's handler runs, or after it, on its answer.
 */
export type At = "request" | "response";

/**
 * Where a call, write or trace event came from: its tab's name and which open of that tab it is,
 * counted from 1. A reload is the same tab's next open.
 */
export type Tab = { readonly name: "main"; readonly open: number };

/**
 * The tab a Story runs in at a given open.
 */
// RETURN_TYPE: the Tab contract, whose name is the literal "main", not text.
export const mainTab = (open: number): Tab => ({ name: "main", open });

/**
 * How a fake call's cleanup ends when the call is interrupted: it dies with a defect, or fails
 * with a typed error.
 */
export type Cleanup = "dies" | "fails";

/**
 * One word a `world` step applies, as data: a fake control, a wire word on an endpoint, how an
 * endpoint's next held call cleans up, or a storage word. Made by a server's controls and
 * endpoints and by `Fake.storage`, never by hand.
 */
export type WorldWord = Data.TaggedEnum<{
  control: { server: AnyServer; control: string; input: Values };
  wire: { server: AnyServer; endpoint: string; word: "hold" | "release" | "lose" | "drop"; at: At };
  cleanup: { server: AnyServer; endpoint: string; outcome: Cleanup };
  storage: { word: "hold" | "refuse" | "release" | "refuseHeld" | "refuseLoad" };
  stored: { key: string; text: string };
  network: { word: "offline" | "online" };
}>;

/**
 * A server's control word: what a fake server's control returns, and what a sample's failures and
 * controls take.
 */
export type ControlWord = Data.TaggedEnum.Value<WorldWord, "control">;

/**
 * Constructors and matchers for {@link WorldWord}.
 */
export const WorldWord = Data.taggedEnum<WorldWord>();

/**
 * One step of a Story, as data, tagged with its step word's name. A chained Story's `steps` is an
 * array of these, and a run takes one back.
 */
export type Step = Data.TaggedEnum<{
  ensure: { actor: ActorId; context: Wiring };
  detach: { actor: ActorId };
  send: { actor: ActorId; event: Envelope };
  dispose: { actor: ActorId; how: "dispose" | "forget" };
  disposeRuntime: { forget: boolean };
  world: { words: ReadonlyArray<WorldWord> };
  advance: { duration: Duration.Input };
  reload: { reattach: boolean; heldWrites: "abort" | "land" };
  hide: {};
  show: {};
  checkpoint: { name: string };
}>;

/**
 * A step of one app's run: an actor step names one of the app's machines. Over an erased app it
 * is any {@link Step}; the key a step without an actor gains is never set.
 */
export type StepOf<Ds extends AnyDefinition> = Step & {
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- a narrowing of an actor step's own actor, written optional so the type stays covariant; no step gains the key
  readonly actor?: { readonly machine: Ds["id"] };
};

/**
 * Constructors and matchers for every {@link Step}, actor steps included: Flow's own tooling builds
 * steps from refs its app already checked.
 */
export const StepData = Data.taggedEnum<Step>();

/**
 * The step words a script writes by hand, with the matchers for {@link Step}.
 *
 * **Details**
 *
 * An actor's steps (ensure, detach, send, dispose) are written with the Story's own words, which
 * take only its app's refs and each ref's own events; a hand-written actor step would name any
 * machine and any envelope.
 */
export const Step = {
  disposeRuntime: StepData.disposeRuntime,
  world: StepData.world,
  advance: StepData.advance,
  reload: StepData.reload,
  hide: StepData.hide,
  show: StepData.show,
  checkpoint: StepData.checkpoint,
  $is: StepData.$is,
  $match: StepData.$match,
};

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
