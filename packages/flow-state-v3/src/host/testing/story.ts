import { type Duration, type Layer, Option } from "effect";
import type { AnyDefinition, Envelope, PayloadOf } from "../../definition.ts";
import { actorIdOf, type ActorRef, type RuntimeSetup, SetupId } from "../runtime.ts";
import type { FakeWorld } from "./fake.ts";
import { run, type StoryRun, type Subject } from "./run.ts";
import { Step, type WorldWord } from "./steps.ts";

/**
 * A public event of an actor's definition, as `send` takes it.
 */
export type EventOf<D extends AnyDefinition> = {
  readonly [K in keyof D["events"] & string]: Envelope<K, PayloadOf<D["events"][K]>>;
}[keyof D["events"] & string];

/**
 * A fixture: a Layer of the app's own services that may require only the run's fake servers.
 */
export type Fixture = Layer.Layer<never, unknown, FakeWorld>;

type Twice<Fx, Seen = never> = Fx extends readonly [infer H extends Fixture, ...infer Rest]
  ? [Extract<Layer.Success<H>, Seen>] extends [never]
    ? Twice<Rest, Seen | Layer.Success<H>>
    : Extract<Layer.Success<H>, Seen>
  : never;

/**
 * `unknown` when the fixtures provide every service `R` lists, each once; otherwise a type that
 * names what is missing or doubled, so `Story.app` is a type error.
 */
export type Covering<R, Fx extends ReadonlyArray<Fixture>> = [
  Exclude<R, Layer.Success<Fx[number]>>,
] extends [never]
  ? [Twice<Fx>] extends [never]
    ? unknown
    : { readonly "two fixtures of": Twice<Fx> }
  : { readonly "no fixture for": Exclude<R, Layer.Success<Fx[number]>> };

type NewName<N extends string, Names extends string> = string extends N
  ? never
  : N extends Names
    ? never
    : unknown;

/**
 * The key of a Story's brand, which holds the id of the app it runs: how a config's files are
 * searched for Stories.
 */
export const StoryId = "~flow-state/Story";

/**
 * The key of what a Story runs: its setup's configuration, fixtures and first world words, which a
 * generated run reuses.
 */
export const SubjectId = "~flow-state/Subject";

/**
 * A scripted run of an app over fakes: inert data until `run()`. Each step word returns a new
 * Story with one more step; `Names` are its checkpoints' names.
 */
export type Story<Names extends string = never> = {
  readonly [StoryId]: string;
  readonly [SubjectId]: Subject;
  readonly id: string;
  readonly steps: ReadonlyArray<Step>;
  readonly ensure: <D extends AnyDefinition>(ref: ActorRef<D>) => Story<Names>;
  readonly detach: <D extends AnyDefinition>(ref: ActorRef<D>) => Story<Names>;
  readonly send: <D extends AnyDefinition>(ref: ActorRef<D>, event: EventOf<D>) => Story<Names>;
  readonly dispose: <D extends AnyDefinition>(
    ref: ActorRef<D>,
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public word: an omitted option takes its default
    options?: { readonly how?: "forget" },
  ) => Story<Names>;
  readonly disposeRuntime: () => Story<Names>;
  readonly world: (...words: ReadonlyArray<WorldWord>) => Story<Names>;
  readonly advance: (duration: Duration.Input) => Story<Names>;
  readonly reload: (
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public word: an omitted option takes its default
    options?: { readonly reattach?: boolean; readonly heldWrites?: "abort" | "land" },
  ) => Story<Names>;
  readonly checkpoint: <N extends string>(name: N & NewName<N, Names>) => Story<Names | N>;
  readonly run: {
    (): Promise<StoryRun<Names>>;
    (options: { readonly steps: ReadonlyArray<Step> }): Promise<StoryRun>;
    (options: { readonly steps: ReadonlyArray<Step>; readonly seed: number }): Promise<StoryRun>;
  };
};

const actorOf = <D extends AnyDefinition>(ref: ActorRef<D>) => actorIdOf(ref);

/**
 * A Story of a subject with no steps yet: `Story.app` makes one from a setup, and a generated run
 * of several fixtures from their merged subject.
 */
// RETURN_TYPE: the exported Story contract with no checkpoints yet.
export const storyOf = (subject: Subject, id: string): Story => {
  // RETURN_TYPE: each step returns the Story contract with its names so far.
  const chain = <Names extends string>(steps: ReadonlyArray<Step>): Story<Names> => {
    const next = (step: Step) => chain<Names>([...steps, step]);

    return {
      [StoryId]: subject.config.app.id,
      [SubjectId]: subject,
      id,
      steps,
      ensure: (ref) =>
        next(
          Step.ensure({
            actor: actorOf(ref),
            context: new Map(Object.entries(ref.context).map(([slot, p]) => [slot, actorOf(p)])),
          }),
        ),
      detach: (ref) => next(Step.detach({ actor: actorOf(ref) })),
      send: (ref, event) => next(Step.send({ actor: actorOf(ref), event })),
      dispose: (ref, how) =>
        next(Step.dispose({ actor: actorOf(ref), how: how?.how ?? "dispose" })),
      disposeRuntime: () => next(Step.disposeRuntime()),
      world: (...words) => next(Step.world({ words })),
      advance: (duration) => next(Step.advance({ duration })),
      reload: (options) =>
        next(
          Step.reload({
            reattach: options?.reattach ?? true,
            heldWrites: options?.heldWrites ?? "abort",
          }),
        ),
      checkpoint: (name) => chain([...steps, Step.checkpoint({ name })]),
      // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts, lint-bomb/no-optional-domain-properties -- run() runs the Story's own steps; an omitted seed keeps the Story's own world
      run: (given?: { readonly steps: ReadonlyArray<Step>; readonly seed?: number }) =>
        run<Names>(subject, id, given?.steps ?? steps, Option.fromUndefinedOr(given?.seed)),
    };
  };

  return chain([]);
};

/**
 * Scripts runs of an app as data.
 *
 * **When to use**
 *
 * Write what a user, the network and storage do as chained steps over the app's own setup, then
 * read what the run recorded through its checkpoints and evidence.
 *
 * **Details**
 *
 * `Story.app(setup, { id, fixtures, world })` takes the app's `runtimeSetup`; the fixtures replace
 * its services, and must provide every service its contracts list, each once. `world` words apply
 * before the tab first opens. `run()` drives the real Runtime in one tab, `main`: Effect's
 * scheduler over a task list drained after every step, and Effect's `TestClock`, so time moves only
 * on `advance`. `reload` abandons the tab's open and boots its next one over the same store and fake
 * servers, at the same time, and ensures again every actor the Story still uses; `reload({ reattach: false })`
 * ensures none, so only what the boot itself wakes is live. A store write still held at a reload
 * aborts with its tab; `reload({ heldWrites: "land" })` lands every held write as the old tab dies,
 * unheard, as a transaction that commits just before its tab is killed. `steps` is the Story as
 * data, and `run({ steps })` runs the same subject over another step array.
 *
 * **Gotchas**
 *
 * - A fault of the script rejects `run()` with `StoryFailed`: a release with nothing held, a hold,
 *   drop or refuse never used, a repeated checkpoint name, a handler or control that throws, a tab
 *   that does not boot or stays busy, and a Runtime step after `disposeRuntime`.
 * - A fixture must not resume a fiber from a host Promise: a run never yields to the host.
 */
export const Story = {
  // RETURN_TYPE: the exported Story contract with no checkpoints yet.
  app: <R, const Fx extends ReadonlyArray<Fixture>>(
    setup: RuntimeSetup<R>,
    options: {
      readonly id: string;
      readonly fixtures: Fx & Covering<R, Fx>;
      // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: an omitted option takes its default
      readonly world?: ReadonlyArray<WorldWord>;
    },
  ): Story => {
    const subject = {
      config: setup[SetupId],
      fixtures: options.fixtures,
      world: options.world ?? [],
    };

    return storyOf(subject, options.id);
  },
};
