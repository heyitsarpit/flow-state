import { type Duration, Effect, Option } from "effect";
import { actorKey } from "../../core/world.ts";
import type { AnyDefinition, Envelope, PayloadOf } from "../../definition.ts";
import type { ActorRef } from "../runtime.ts";
import type { AnyFake } from "./fake.ts";
import { type Cut, runStory, type StoryConfig, type StoryRun } from "./run.ts";
import { Step, StoryFailed } from "./steps.ts";

/**
 * A public event of an actor's definition, as `send` takes it.
 */
export type EventOf<D extends AnyDefinition> = {
  readonly [K in keyof D["events"] & string]: Envelope<K, PayloadOf<D["events"][K]>>;
}[keyof D["events"] & string];

/**
 * A scripted run of an app over fakes: inert data until `run()`.
 */
export type Story = {
  readonly config: StoryConfig;
  readonly fakes: ReadonlyArray<AnyFake>;
  readonly steps: ReadonlyArray<Step>;
  readonly run: () => Promise<StoryRun>;
};

const idOf = <D extends AnyDefinition>(ref: ActorRef<D>) => ({
  machine: ref.machine.compiled.id,
  name: ref.name,
});

/**
 * Scripts runs of an app as data.
 *
 * **When to use**
 *
 * In Flow's own tests: write the steps a user, the network and storage take, then read what the
 * run recorded.
 *
 * **Details**
 *
 * `run()` drives the real Runtime on one page: Effect's scheduler over a task list drained after
 * every step, and Effect's `TestClock`, so time moves only on `advance`. `reload` abandons the
 * page and boots a new one over the same store and the same fakes, at the same time, and attaches
 * again every use the story still holds. A call nobody scripted lands through its handler.
 *
 * **Gotchas**
 *
 * - A script fault rejects `run()` with `StoryFailed`: a word that finds nothing held, a hold or
 *   refuse never used, a repeated checkpoint name, two fakes of one service, or a page that is not
 *   idle after a step.
 */
export const Story = {
  // RETURN_TYPE: the exported Story contract.
  app: (config: StoryConfig, fakes: ReadonlyArray<AnyFake>, steps: ReadonlyArray<Step>): Story => {
    const own = [...steps];

    return {
      config,
      fakes,
      steps: own,
      run: () =>
        Effect.runPromise(
          Effect.try({
            try: () => runStory(config, fakes, own),
            catch: (fault) =>
              fault instanceof StoryFailed
                ? fault
                : new StoryFailed({ problem: `the run threw: ${String(fault)}` }),
          }),
        ),
    };
  },
  attach: <D extends AnyDefinition>(ref: ActorRef<D>) => Step.Attach({ actor: idOf(ref) }),
  detach: <D extends AnyDefinition>(ref: ActorRef<D>) => Step.Detach({ actor: idOf(ref) }),
  forget: <D extends AnyDefinition>(ref: ActorRef<D>) => Step.Forget({ actor: idOf(ref) }),
  send: <D extends AnyDefinition>(ref: ActorRef<D>, event: EventOf<D>) =>
    Step.Send({ actor: idOf(ref), event }),
  disposeActor: <D extends AnyDefinition>(ref: ActorRef<D>) =>
    Step.DisposeActor({ actor: idOf(ref) }),
  disposeRuntime: () => Step.DisposeRuntime(),
  advance: (duration: Duration.Input) => Step.Advance({ duration }),
  reload: () => Step.Reload(),
  checkpoint: (name: string) => Step.Checkpoint({ name }),
  /**
   * An actor's snapshot in a cut: none when it is not live there.
   */
  actorIn: <D extends AnyDefinition>(cut: Cut, ref: ActorRef<D>) =>
    Option.map(
      Option.fromUndefinedOr(cut.runtime.actors.find((a) => a.actor === actorKey(idOf(ref)))),
      (a) => a.snapshot,
    ),
};
