import { type Duration, Effect, type Layer, Option } from "effect";
import type { AnyDefinition, EventOf } from "../../definition.ts";
import { flowError, raise } from "../../error.ts";
import {
  actorIdOf,
  type ActorRef,
  type App,
  configOf,
  type DefsOf,
  machineOf,
  type RuntimeSetup,
} from "../runtime.ts";
import type { FakeWorld } from "./fake.ts";
import {
  attempt,
  type Reload,
  run,
  runForked,
  type RunFault,
  startRun,
  type StoryRun,
  type Subject,
} from "./run.ts";
import { Step, StepData, type WorldWord } from "./steps.ts";
import { overridesBy } from "../wiring.ts";

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
export type Story<Names extends string = never, Ds extends AnyDefinition = AnyDefinition> = {
  readonly [StoryId]: string;
  readonly [SubjectId]: Subject;
  readonly id: string;
  readonly steps: Steps<Names>;
  readonly ensure: <D extends Ds>(ref: ActorRef<D>) => Story<Names, Ds>;
  readonly detach: <D extends Ds>(ref: ActorRef<D>) => Story<Names, Ds>;
  readonly send: <D extends Ds>(ref: ActorRef<D>, event: EventOf<D>) => Story<Names, Ds>;
  readonly dispose: <D extends Ds>(
    ref: ActorRef<D>,
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public word: an omitted option takes its default
    options?: { readonly how?: "forget" },
  ) => Story<Names, Ds>;
  readonly disposeRuntime: (
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Runtime's public option: an omitted option keeps saved data
    options?: { readonly forget?: true },
  ) => Story<Names, Ds>;
  readonly world: (...words: ReadonlyArray<WorldWord>) => Story<Names, Ds>;
  readonly advance: (duration: Duration.Input) => Story<Names, Ds>;
  readonly reload: (
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public word: an omitted option takes its default
    options?: { readonly reattach?: boolean; readonly heldWrites?: "abort" | "land" },
  ) => Story<Names, Ds>;
  readonly checkpoint: <N extends string>(name: N & NewName<N, Names>) => Story<Names | N, Ds>;
  readonly run: {
    (): Promise<StoryRun<Names, Ds>>;
    <N extends string>(options: { readonly steps: Steps<N> }): Promise<StoryRun<N, Ds>>;
    <N extends string>(options: {
      readonly steps: Steps<N>;
      readonly seed: number;
    }): Promise<StoryRun<N, Ds>>;
  };
};

/**
 * A Story's steps as data, with the names of the checkpoints among them: `run({ steps })` keeps
 * those names. An array built by hand has none it can promise, so its run's names are text.
 */
export type Steps<Names extends string = string> = ReadonlyArray<Step> & {
  // A phantom method: the checkpoint names, which a spread or a hand-built array drops.
  "~names"?(names: Names): void;
};

const actorOf = <D extends AnyDefinition>(ref: ActorRef<D>) => actorIdOf(ref);

/**
 * A Story of a subject with no steps yet: `Story.app` makes one from a setup, and a generated run
 * of several fixtures from their merged subject.
 */
// RETURN_TYPE: the exported Story contract with no checkpoints yet.
export const storyOf = <Ds extends AnyDefinition = AnyDefinition>(
  subject: Subject,
  id: string,
): Story<never, Ds> => {
  // A Story's ref names an identity only of a machine its app runs.
  const own = (ref: ActorRef) => {
    if (Object.values(subject.config.app.machines).some((e) => machineOf(e) === ref.machine))
      return actorOf(ref);

    return raise(
      flowError([
        {
          code: "ForeignActorRef",
          path: [id, ref.machine.compiled.id],
          summary: `${ref.machine.compiled.id} is not a machine of this Story's app`,
          help: "Use refs of the machines the Story's setup lists.",
        },
      ]),
    );
  };

  // RETURN_TYPE: each step returns the Story contract with its names so far.
  const chain = <Names extends string>(steps: ReadonlyArray<Step>): Story<Names, Ds> => {
    const next = (step: Step) => chain<Names>([...steps, step]);

    return {
      [StoryId]: subject.config.app.id,
      [SubjectId]: subject,
      id,
      steps,
      ensure: (ref) =>
        next(
          StepData.ensure({
            actor: own(ref),
            context: overridesBy(ref, (_slot, p) => own(p)),
          }),
        ),
      detach: (ref) => next(StepData.detach({ actor: own(ref) })),
      send: (ref, event) => next(StepData.send({ actor: own(ref), event })),
      dispose: (ref, how) =>
        next(StepData.dispose({ actor: own(ref), how: how?.how ?? "dispose" })),
      disposeRuntime: (options) =>
        next(StepData.disposeRuntime({ forget: options?.forget === true })),
      world: (...words) => next(StepData.world({ words })),
      advance: (duration) => next(StepData.advance({ duration })),
      reload: (options) =>
        next(
          StepData.reload({
            reattach: options?.reattach ?? true,
            heldWrites: options?.heldWrites ?? "abort",
          }),
        ),
      checkpoint: (name) => chain([...steps, StepData.checkpoint({ name })]),
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
  app: <R, A extends App, const Fx extends ReadonlyArray<Fixture>>(
    setup: RuntimeSetup<R, A>,
    options: {
      readonly id: string;
      readonly fixtures: Fx & Covering<R, Fx>;
      // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: an omitted option takes its default
      readonly world?: ReadonlyArray<WorldWord>;
    },
  ): Story<never, DefsOf<A>> => {
    const subject = {
      config: configOf(setup),
      fixtures: options.fixtures,
      world: options.world ?? [],
    };

    return storyOf<DefsOf<A>>(subject, options.id);
  },
};

/**
 * Runs a reload at every position of a Story, each forked from the world saved there instead of
 * replayed from boot.
 *
 * **When to use**
 *
 * A sweep that inserts a reload at each position of a Story: replaying the steps before each one
 * makes the sweep's cost grow with the square of the Story's length, and forking skips them.
 *
 * **Details**
 *
 * Runs the Story's own steps once. Before each step and after the last, `visit` gets the position
 * `at` and `fork(reload, rest)`, the run `story.run({ steps })` gives for the Story's first `at`
 * steps, then `reload`, then `rest`. The saved world is all a reload keeps: the fake servers'
 * truth, calls, waiting words and held calls, the store's records, batches and armed words, the
 * actors the Story holds, what the run recorded so far, the tab's open count and the time. The
 * tab itself is not saved, since a reload abandons it, so a fork starts with its reload. Returns
 * the Story's own run.
 *
 * **Gotchas**
 *
 * - A fault of the Story's own run fails the whole call, at the step that faulted.
 * - A fork is a run of its own: it never changes the Story's own run or another fork.
 */
export const forkReloads = Effect.fn("forkReloads")(function* <
  Names extends string,
  Ds extends AnyDefinition,
  E,
>(
  story: Story<Names, Ds>,
  visit: (
    at: number,
    fork: (
      reload: Reload,
      rest: ReadonlyArray<Step>,
    ) => Effect.Effect<StoryRun<never, Ds>, RunFault>,
  ) => Effect.Effect<void, E>,
) {
  const subject = story[SubjectId];

  const own = yield* attempt(() =>
    startRun<Names>(subject, story.id, { seed: Option.none(), lenient: false }, Option.none()),
  );

  const forkAt = (at: number) => {
    const saved = own.save();

    return visit(at, (reload, rest) =>
      attempt(() => runForked(subject, story.id, saved, reload, rest)),
    );
  };

  for (const [at, step] of story.steps.entries()) {
    yield* forkAt(at);
    yield* attempt(() => own.step(step));
  }

  yield* forkAt(story.steps.length);

  const run: StoryRun<Names, Ds> = yield* attempt(() => own.finish().run);

  return run;
});
