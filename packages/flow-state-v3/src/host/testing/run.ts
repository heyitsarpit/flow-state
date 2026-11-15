import { Clock, Context, Duration, Effect, Exit, Layer, Option, Scheduler, Scope } from "effect";
import { TestClock } from "effect/testing";
import type { Evidence } from "../../core/evidence.ts";
import { Input } from "../../core/step.ts";
import { type ActorId, actorKey } from "../../core/world.ts";
import { Host, type Store } from "../host.ts";
import { attachInspector, cutOf, type RuntimeCut } from "../inspect.ts";
import { buildRuntime, type RuntimeConfig } from "../runtime.ts";
import { testing } from "../testing.ts";
import { type AnyFake, type Batch, type Call, makeStore, makeWire } from "./fake.ts";
import { scriptFault, Step } from "./steps.ts";

/**
 * A Story's Runtime configuration: everything but the services, which its fakes provide.
 */
export type StoryConfig = Omit<RuntimeConfig, "services">;

/**
 * What a run shows at one step's end: the time, how many evidence records the run had, the
 * Runtime's cut, every call the fakes received, and the store's records and write batches.
 */
export type Cut = {
  readonly now: number;
  readonly evidence: number;
  readonly runtime: RuntimeCut;
  readonly received: ReadonlyArray<Call>;
  readonly store: ReadonlyMap<string, string>;
  readonly batches: ReadonlyArray<Batch>;
};

/**
 * A finished run: its steps, every evidence record in order, each checkpoint by name, and `end`,
 * a cut after the last step.
 */
export type StoryRun = {
  readonly steps: ReadonlyArray<Step>;
  readonly evidence: ReadonlyArray<Evidence>;
  readonly checkpoints: ReadonlyMap<string, Cut>;
  readonly end: Cut;
};

/**
 * The most tasks one step may run before its page counts as never idle.
 */
const TASK_LIMIT = 100_000;

// One page: its own task list drained by `settle` (Effect's MixedScheduler, whose host hook only
// queues), its own TestClock, and one Runtime. A dead page is never drained or adjusted again.
const openPage = (
  config: RuntimeConfig,
  store: Store,
  number: number,
  now: number,
  sink: (evidence: Evidence) => void,
) => {
  const tasks: Array<() => void> = [];

  const loop = new Scheduler.MixedScheduler("async", (task) => {
    tasks.push(task);

    return () => {
      if (tasks.includes(task)) tasks.splice(tasks.indexOf(task), 1);
    };
  });

  const settle = () => {
    for (let ran = 0; tasks.length > 0; ran++) {
      if (ran >= TASK_LIMIT) scriptFault(`page ${number} never went idle`);
      tasks.shift()?.();
    }
  };

  // oxlint-disable-next-line lint-bomb/no-unmanaged-effect-scope -- a page's clock lives as long as the page; a dead page is never closed, as a killed tab is not
  const scope = Scope.makeUnsafe();

  // TestClock's layer provides its Clock and a Scheduler wrapping `loop`, which every fiber of the
  // page's Runtime inherits.
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a page is built synchronously at the run's boundary
  const timing = Effect.runSync(
    Layer.buildWithScope(TestClock.layer({ warningDelay: Duration.infinity }), scope).pipe(
      Effect.provideService(Scheduler.Scheduler, loop),
    ),
  );

  const host = Host.of({
    hidden: () => false,
    onHidden: () => undefined,
    store: Option.some(store),
    sessionSeed: number.toString(16).padStart(32, "0"),
  });

  const platform = Context.merge(Context.make(Host, host), timing);
  const scheduler = Context.get(platform, Scheduler.Scheduler);

  const perform = <A, E>(effect: Effect.Effect<A, E>) => {
    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the run drives the page's Runtime from its boundary
    const fiber = Effect.runForkWith(platform)(effect, { scheduler });
    settle();

    // oxlint-disable-next-line lint-bomb/no-unsafe-fiber-methods -- the page is idle, so the fiber has ended or waits on a later step
    return Option.fromUndefinedOr(fiber.pollUnsafe());
  };

  perform(TestClock.setTime(now));
  const built = buildRuntime(config, platform);
  attachInspector(built.runtime, sink);

  if (!Option.exists(perform(built.runtime.ready()), Exit.isSuccess))
    scriptFault(`page ${number} did not boot`);

  const idle = () => {
    settle();

    if (tasks.length > 0 || built.driver.pending()) scriptFault(`page ${number} is not idle`);
  };

  return {
    number,
    built,
    idle,
    perform,
    now: () => Context.get(platform, Clock.Clock).currentTimeMillisUnsafe(),
  };
};

/**
 * Runs a Story's steps and returns what it recorded; `Story.app(...).run()` calls it.
 */
export const runStory = (
  config: StoryConfig,
  fakes: ReadonlyArray<AnyFake>,
  steps: ReadonlyArray<Step>,
) => {
  const evidence: Array<Evidence> = [];
  const checkpoints = new Map<string, Cut>();
  const uses = new Map<string, { readonly actor: ActorId; readonly count: number }>();
  let current = 0;
  const alive = (page: number) => page === current;
  const wire = makeWire(fakes, alive);
  const store = makeStore(alive);

  const boot = (number: number, now: number) =>
    openPage(
      { ...config, services: wire.layer(number) },
      store.at(number),
      number,
      now,
      (e) => void evidence.push(e),
    );

  let page = boot(0, 0);

  // RETURN_TYPE: the exported Cut contract.
  const cut = (): Cut => ({
    now: page.now(),
    evidence: evidence.length,
    runtime: cutOf(page.built.driver),
    received: wire.received(),
    store: store.data(),
    batches: store.batches(),
  });

  const attach = (actor: ActorId) => testing.attach(page.built, actor, "story", false);

  const forgetUses = (actor: ActorId) => void uses.delete(actorKey(actor));

  for (const step of steps) {
    Step.$match(step, {
      Attach: ({ actor }) => {
        const count = uses.get(actorKey(actor))?.count ?? 0;
        uses.set(actorKey(actor), { actor, count: count + 1 });
        attach(actor);
      },
      Detach: ({ actor }) => {
        const count = uses.get(actorKey(actor))?.count ?? 0;

        if (count <= 1) forgetUses(actor);
        else uses.set(actorKey(actor), { actor, count: count - 1 });
        testing.detach(page.built, actor, "story");
      },
      Forget: ({ actor }) => {
        forgetUses(actor);
        testing.forget(page.built, actor);
      },
      Send: ({ actor, event: { _tag, ...payload } }) =>
        testing.send(page.built, actor, _tag, payload),
      DisposeActor: ({ actor }) => {
        forgetUses(actor);
        page.built.driver.input(Input.DisposeActor({ actor }));
      },
      DisposeRuntime: () => {
        uses.clear();
        page.perform(page.built.runtime.dispose());
      },
      Advance: ({ duration }) => {
        // adjust ends once every woken fiber has suspended, so on an idle page it always ends.
        if (!Option.exists(page.perform(TestClock.adjust(duration)), Exit.isSuccess))
          scriptFault("advance did not end");
      },
      Reload: () => {
        const now = page.now();
        current += 1;
        page = boot(current, now);

        for (const { actor, count } of uses.values()) for (let n = 0; n < count; n++) attach(actor);
      },
      Checkpoint: ({ name }) => {
        if (checkpoints.has(name)) scriptFault(`checkpoint ${name} twice`);
        checkpoints.set(name, cut());
      },
      Wire: ({ fake, method, word }) => wire.word(fake, method, word),
      Answer: ({ fake, method, exit }) => wire.answer(fake, method, exit),
      Storage: ({ word }) => store.word(word),
    });
    page.idle();
  }

  const unused = [...wire.unused(), ...store.unused()];

  if (unused.length > 0) scriptFault(unused.join("; "));

  return { steps, evidence, checkpoints, end: cut() };
};
