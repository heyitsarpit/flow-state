import { Clock, Context, Duration, Effect, Exit, Layer, Option, Scheduler, Scope } from "effect";
import { TestClock } from "effect/testing";
import type { Evidence } from "../../core/evidence.ts";
import { Input } from "../../core/step.ts";
import { type ActorId, actorKey } from "../../core/world.ts";
import type { AnyDefinition } from "../../definition.ts";
import { Host } from "../host.ts";
import { attachInspector, inspect, type RuntimeCut } from "../inspect.ts";
import {
  type ActorRef,
  buildRuntime,
  type RuntimeConfig,
  type Snapshot,
  snapshotIn,
} from "../runtime.ts";
import { testing } from "../testing.ts";
import { type Trace, TraceRecord } from "../trace.ts";
import {
  type AnyServer,
  type Batch,
  type CallEntry,
  type EndpointHandle,
  FakeWorld,
  makeStore,
  makeWorld,
} from "./fake.ts";
import { scriptFault, Step, StoryFailed, StoryTurnLimit, WorldWord } from "./steps.ts";

/**
 * What a run shows at one step's end, captured then: the time, the runtime cut, the store's
 * records and write batches, every call the fake servers received, and `read` for an actor, a fake
 * server or an endpoint.
 *
 * **Details**
 *
 * `calls` is every call of every endpoint in arrival order, each named by its server and endpoint:
 * what a rule over all of a run's requests reads without knowing the app's servers.
 * `read(ref)` is the actor's snapshot, or undefined when it has no incarnation and no record.
 * `read(server)` is the server's truth. `read(endpoint)` is every call the endpoint received, in
 * arrival order, with its status.
 */
export type Cut = {
  readonly now: number;
  readonly inspection: RuntimeCut;
  readonly records: {
    readonly stored: ReadonlyMap<string, string>;
    readonly batches: ReadonlyArray<Batch>;
  };
  readonly calls: ReadonlyArray<CallEntry & { readonly server: string; readonly endpoint: string }>;
  readonly read: {
    // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- the Plan's read: undefined for an absent actor
    <D extends AnyDefinition>(ref: ActorRef<D>): Snapshot | undefined;
    <I>(endpoint: EndpointHandle<I>): ReadonlyArray<CallEntry<I>>;
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- a phantom type: it carries the type for reads and holds no value
    <T>(server: { readonly "~server": AnyServer; readonly "~truth"?: T }): T;
  };
};

/**
 * A finished run: its steps, every evidence record in order, each checkpoint by name, `end`, a cut
 * after the last step, and `trace`, every step, evidence record, call and write in order.
 */
export type StoryRun<Names extends string = string> = {
  readonly steps: ReadonlyArray<Step>;
  readonly evidence: ReadonlyArray<Evidence>;
  readonly checkpoints: { readonly [K in Names]: Cut };
  readonly end: Cut;
  readonly trace: Trace;
};

// One event as the run's sink stamps it: a call or a write is resolved at the run's end, so it
// carries its final status.
type Noted =
  | { readonly kind: "record"; readonly page: number; readonly record: TraceRecord }
  | { readonly kind: "call" | "batch"; readonly index: number };

/**
 * What a run boots each page from: the setup's configuration with its services replaced by the
 * fixtures, which may require only the run's fake servers.
 */
export type Subject = {
  readonly config: RuntimeConfig;
  readonly fixtures: ReadonlyArray<Layer.Layer<never, unknown, FakeWorld>>;
  readonly world: ReadonlyArray<WorldWord>;
};

type Target = ActorRef | EndpointHandle | { readonly "~server": AnyServer };

const TASK_LIMIT = 100_000;
const TURN_LIMIT = 10_000;

// RETURN_TYPE: the core's ActorId, which the driver's inputs take.
const actorOf = <D extends AnyDefinition>(ref: ActorRef<D>): ActorId => ({
  machine: ref.machine.compiled.id,
  name: ref.name,
});

type Limits = {
  readonly over: () => boolean;
  readonly fail: (reason: "Turns" | "Settle") => never;
};

// One page: its own task list drained by `settle` (Effect's MixedScheduler, whose host hook only
// queues), its own TestClock, and one Runtime. A dead page is never drained or adjusted again.
const openPage = (config: RuntimeConfig, host: Host["Service"], now: number, limits: Limits) => {
  const tasks: Array<() => void> = [];

  const loop = new Scheduler.MixedScheduler("async", (task) => {
    tasks.push(task);

    return () => {
      if (tasks.includes(task)) tasks.splice(tasks.indexOf(task), 1);
    };
  });

  // Turns that ran inside a step's own input, before any task, are judged here too.
  const settle = () => {
    if (limits.over()) limits.fail("Turns");

    for (let ran = 0; tasks.length > 0; ran++) {
      if (ran >= TASK_LIMIT) limits.fail("Settle");
      tasks.shift()?.();

      if (limits.over()) limits.fail("Turns");
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

  return {
    built,
    perform,
    idle: () => {
      settle();

      return tasks.length === 0 && !built.driver.pending();
    },
    now: () => Context.get(platform, Clock.Clock).currentTimeMillisUnsafe(),
  };
};

/**
 * Runs a subject over a step array and returns what it recorded; a Story's `run()` calls it.
 */
// RETURN_TYPE: the exported StoryRun contract keeps the checkpoints' names.
export const runSteps = <Names extends string>(
  subject: Subject,
  id: string,
  steps: ReadonlyArray<Step>,
): StoryRun<Names> => {
  if (id === "") scriptFault("a Story's id is empty");

  const evidence: Array<Evidence> = [];
  const checkpoints = new Map<string, Cut>();
  const uses = new Map<string, { readonly actor: ActorId; readonly count: number }>();
  let current = 0;
  let stepAt = -1;
  const turns = { instant: -1, count: 0, keep: 0 };
  const alive = (page: number) => page === current;
  const noted: Array<Noted> = [];
  const note = (event: Noted) => void noted.push(event);

  const fakes = makeWorld(
    alive,
    () => stepAt,
    (index) => note({ kind: "call", index }),
  );

  const store = makeStore(alive, (index) => note({ kind: "batch", index }));

  const limits: Limits = {
    over: () => turns.count > TURN_LIMIT,
    fail: (reason) => {
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a limit ends the run at once and rejects run(); it is never an app outcome
      throw new StoryTurnLimit({
        reason,
        step: stepAt,
        instant: turns.instant,
        evidence: reason === "Turns" ? evidence.slice(0, turns.keep) : [...evidence],
      });
    },
  };

  const boot = (number: number, now: number) => {
    const world = Layer.succeed(FakeWorld, fakes.service(number));

    const services = Layer.provide(Layer.mergeAll(Layer.empty, ...subject.fixtures), world);

    const host = Host.of({
      hidden: () => false,
      onHidden: () => undefined,
      store: Option.some(store.at(number)),
      sessionSeed: number.toString(16).padStart(32, "0"),
    });

    const opened = openPage({ ...subject.config, services }, host, now, limits);

    attachInspector(opened.built.runtime, (e) => {
      evidence.push(e);
      note({ kind: "record", page: number, record: TraceRecord.Runtime({ evidence: e }) });

      if (e._tag !== "Turn") return;
      const at = opened.now();

      if (at !== turns.instant) Object.assign(turns, { instant: at, count: 0 });
      turns.count += 1;

      if (turns.count === TURN_LIMIT) turns.keep = evidence.length;
    });

    if (!Option.exists(opened.perform(opened.built.runtime.ready()), Exit.isSuccess))
      scriptFault(`page ${number} did not boot`);

    return opened;
  };

  const apply = (word: WorldWord) =>
    WorldWord.$is("storage")(word) ? store.word(word.word) : fakes.word(word);

  for (const word of subject.world) apply(word);

  let page = boot(0, 0);
  let disposed = false;

  // RETURN_TYPE: the exported Cut contract with its overloaded read.
  const cut = (): Cut => {
    const world = page.built.driver.world();
    const machines = page.built.driver.machines;
    const truths = fakes.truths();
    const log = fakes.log();

    // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts, lint-bomb/prefer-inferred-return-types -- the Plan's read: undefined for an absent actor; an overload states its own result
    function read<D extends AnyDefinition>(ref: ActorRef<D>): Snapshot | undefined;
    // RETURN_TYPE: an overload states its own result.
    function read<I>(endpoint: EndpointHandle<I>): ReadonlyArray<CallEntry<I>>;
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/prefer-inferred-return-types -- a phantom type: it carries the type for reads and holds no value; an overload states its own result
    function read<T>(server: { readonly "~server": AnyServer; readonly "~truth"?: T }): T;
    // FLOW_STATE_ALLOW_UNKNOWN: one read answers for three kinds of target, each typed by its overload.
    // RETURN_TYPE: the implementation's result is erased; each overload states its own.
    function read(target: Target): unknown {
      if ("~endpoint" in target) {
        const { server, name } = target["~endpoint"];

        return log.filter((l) => l.server === server && l.endpoint === name).map((l) => l.entry);
      }

      if ("~server" in target) {
        const server = target["~server"];

        return truths.has(server) ? truths.get(server) : server.initial;
      }

      return Option.getOrUndefined(snapshotIn(world, machines, actorOf(target)));
    }

    return {
      now: page.now(),
      inspection: inspect(page.built.runtime),
      records: { stored: store.data(), batches: store.batches() },
      calls: log.map((l) => ({ ...l.entry, server: l.server.name, endpoint: l.endpoint })),
      read,
    };
  };

  const live = (what: string) => {
    if (disposed) scriptFault(`${what} after disposeRuntime`);
  };

  const attach = (actor: ActorId) => testing.attach(page.built, actor, "story", false);

  for (const [n, step] of steps.entries()) {
    stepAt = n;
    note({ kind: "record", page: current, record: TraceRecord.Step({ index: n, step }) });
    Object.assign(turns, { instant: page.now(), count: 0, keep: 0 });

    Step.$match(step, {
      ensure: ({ actor }) => {
        live("ensure");
        const count = uses.get(actorKey(actor))?.count ?? 0;
        uses.set(actorKey(actor), { actor, count: count + 1 });
        attach(actor);
      },
      detach: ({ actor }) => {
        live("detach");
        const count = uses.get(actorKey(actor))?.count ?? 0;

        if (count <= 1) uses.delete(actorKey(actor));
        else uses.set(actorKey(actor), { actor, count: count - 1 });
        testing.detach(page.built, actor, "story");
      },
      send: ({ actor, event: { _tag, ...payload } }) => {
        live("send");
        testing.send(page.built, actor, _tag, payload);
      },
      dispose: ({ actor, how }) => {
        live("dispose");
        uses.delete(actorKey(actor));

        if (how === "forget") testing.forget(page.built, actor);
        else page.built.driver.input(Input.DisposeActor({ actor }));
      },
      disposeRuntime: () => {
        disposed = true;
        page.perform(page.built.runtime.dispose());
      },
      world: ({ words }) => {
        for (const word of words) apply(word);
      },
      advance: ({ duration }) => {
        // adjust ends once every woken fiber has suspended, so on an idle page it always ends.
        if (!Option.exists(page.perform(TestClock.adjust(duration)), Exit.isSuccess))
          scriptFault("advance did not end");
      },
      reload: ({ reattach }) => {
        const now = page.now();
        current += 1;
        disposed = false;
        page = boot(current, now);

        if (!reattach) uses.clear();

        for (const { actor, count } of uses.values()) for (let k = 0; k < count; k++) attach(actor);
      },
      checkpoint: ({ name }) => {
        if (checkpoints.has(name)) scriptFault(`checkpoint ${name} twice`);
        checkpoints.set(name, cut());
      },
    });

    if (!page.idle()) scriptFault(`step ${n} left page ${current} busy`);
    const faults = fakes.faults();

    if (faults.length > 0) scriptFault(faults.join("; "));
  }

  const unused = [...fakes.unused(), ...store.unused()];

  if (unused.length > 0) scriptFault(unused.join("; "));

  // SAFETY: a chained Story's checkpoint steps are exactly its Names, each taken once (checked above).
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, lint-bomb/no-object-iteration-result-cast -- the checkpoints the steps named, keyed by name
  const named = Object.fromEntries(checkpoints) as StoryRun<Names>["checkpoints"];

  const log = fakes.log();
  const batches = store.batches();

  const resolve = (event: Noted, sequence: number) => {
    const at = (page: number, record: TraceRecord) => ({ sequence, page, record });

    if (event.kind === "record") return Option.some(at(event.page, event.record));

    if (event.kind === "call")
      return Option.map(Option.fromUndefinedOr(log[event.index]), ({ server, endpoint, entry }) =>
        at(
          entry.page,
          TraceRecord.Request({
            server: server.name,
            endpoint,
            input: entry.input,
            status: entry.status,
          }),
        ),
      );

    return Option.map(Option.fromUndefinedOr(batches[event.index]), (batch) =>
      at(
        batch.page,
        TraceRecord.Write({
          purpose: batch.purpose,
          keys: batch.keys,
          acknowledges: batch.acknowledges,
          status: batch.status,
        }),
      ),
    );
  };

  const events = noted.flatMap((event, n) => Option.toArray(resolve(event, n + 1)));

  return { steps, evidence, checkpoints: named, end: cut(), trace: { storyId: id, events } };
};

/**
 * Runs a subject over a step array as a Promise: a script fault or limit rejects it; anything else
 * thrown rejects it as StoryFailed.
 */
export const run = <Names extends string>(
  subject: Subject,
  id: string,
  steps: ReadonlyArray<Step>,
) =>
  Effect.runPromise(
    Effect.try({
      try: () => runSteps<Names>(subject, id, steps),
      catch: (fault) =>
        fault instanceof StoryFailed || fault instanceof StoryTurnLimit
          ? fault
          : new StoryFailed({ problem: `the run threw: ${String(fault)}` }),
    }),
  );
