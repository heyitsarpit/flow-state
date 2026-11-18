import { Effect, Exit, Layer, Option } from "effect";
import { TestClock } from "effect/testing";
import type { Evidence } from "../../core/evidence.ts";
import { dependentsOf, Input } from "../../core/step.ts";
import { Life } from "../../core/life.ts";
import { retain } from "../../core/tx.ts";
import { type ActorId, actorKey, indexDrift, type Wiring } from "../../core/world.ts";
import type { AnyDefinition } from "../../definition.ts";
import { FlowError } from "../../error.ts";
import { Host } from "../host.ts";
import { attachInspector, inspect, type RuntimeCut } from "../inspect.ts";
import {
  actorIdOf,
  type ActorRef,
  buildRuntime,
  type RuntimeConfig,
  type Snapshot,
  snapshotIn,
} from "../runtime.ts";
import { type Trace, TraceRecord } from "../trace.ts";
import { tabClock } from "./clock.ts";
import {
  type AnyServer,
  type Batch,
  type CallEntry,
  type EndpointHandle,
  FakeWorld,
  makeStore,
  makeWorld,
} from "./fake.ts";
import { testing } from "./seam.ts";
import {
  mainTab,
  scriptFault,
  Step,
  StoryFailed,
  StoryTurnLimit,
  type Tab,
  WorldWord,
} from "./steps.ts";

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

type Noted =
  | { readonly kind: "record"; readonly open: number; readonly record: TraceRecord }
  | { readonly kind: "call" | "batch"; readonly index: number };

/**
 * What a run boots each open of its tab from: the setup's configuration with its services replaced by the
 * fixtures, which may require only the run's fake servers.
 */
export type Subject = {
  readonly config: RuntimeConfig;
  readonly fixtures: ReadonlyArray<Layer.Layer<never, unknown, FakeWorld>>;
  readonly world: ReadonlyArray<WorldWord>;
};

type Target = ActorRef | EndpointHandle | { readonly "~server": AnyServer };

// A runaway guard on the turns of one instant: the most an ordinary Story runs at once is 4,200
// (4,200 cancels on one lane); Stories R-tests drive exactly 10,000 to prove the limit.
const TURN_LIMIT = 10_000;

// The tab's session seed: its name, open count and the run's seed as hex, so ids never repeat
// across reloads and differ between seeds.
const seedOf = (tab: Tab, seed: Option.Option<number>) => {
  const text = `${tab.name}:${tab.open}${Option.match(seed, { onNone: () => "", onSome: (s) => `#${s}` })}`;

  return Array.from({ length: text.length }, (_, n) => text.charCodeAt(n).toString(16))
    .join("")
    .padStart(32, "0");
};

// RETURN_TYPE: the core's ActorId, which the driver's inputs take.
const actorOf = <D extends AnyDefinition>(ref: ActorRef<D>): ActorId => actorIdOf(ref);

type Limits = {
  readonly fail: (reason: "Turns" | "Settle") => never;
  readonly admit: (evidence: ReadonlyArray<Evidence>, at: number) => void;
};

// One open of the tab: its clock and event loop, and one Runtime whose every step is admitted by
// the turn limit before it applies.
const openTab = (config: RuntimeConfig, host: Host["Service"], now: number, limits: Limits) => {
  const tab = tabClock(host, now, () => limits.fail("Settle"));
  const built = buildRuntime(config, tab.platform, (evidence) => limits.admit(evidence, tab.now()));

  return {
    built,
    perform: tab.perform,
    idle: () => {
      tab.settle();

      return !tab.queued() && !built.driver.pending();
    },
    now: tab.now,
  };
};

/**
 * What a step source reads before it gives the next step: the calls held at the fake servers, each
 * endpoint's call count, every write batch's status, the held store writes and the Attempts each
 * acknowledges (oldest first), whether the tab's
 * Runtime is disposed, an actor's uses, the live consumers that read it as context, and the write
 * lanes.
 */
export type View = {
  readonly held: ReadonlyArray<{
    readonly server: AnyServer;
    readonly endpoint: string;
    readonly input: CallEntry["input"];
  }>;
  readonly calls: (server: AnyServer, endpoint: string) => number;
  readonly writes: ReadonlyArray<Batch["status"]>;
  readonly heldWrites: number;
  readonly heldAcknowledges: ReadonlyArray<ReadonlyArray<string>>;
  readonly disposed: boolean;
  readonly uses: (actor: ActorId) => number;
  readonly dependents: (actor: ActorId) => ReadonlyArray<ActorId>;
  readonly lanes: () => RuntimeCut["lanes"];
};

/**
 * Where a run's steps come from: given the view before a step, the step to run, `skip` to draw
 * again, or `done` to end the run.
 */
export type Source = (view: View) => Step | "skip" | "done";

/**
 * How a run treats its world: `seed` shuffles the store's load order and changes the session
 * seeds; `lenient` lets hold, drop and refuse words go unused and reports their steps instead of
 * failing the run.
 */
export type Options = { readonly seed: Option.Option<number>; readonly lenient: boolean };

/**
 * A run of a source: what it recorded, and the indices of the steps whose words went unused.
 */
export type Drawn<Names extends string = string> = {
  readonly run: StoryRun<Names>;
  readonly unused: ReadonlyArray<number>;
};

/**
 * Runs a subject over a step array and returns what it recorded; a Story's `run()` calls it.
 */
// RETURN_TYPE: the exported StoryRun contract keeps the checkpoints' names.
const runSteps = <Names extends string>(
  subject: Subject,
  id: string,
  steps: ReadonlyArray<Step>,
  seed: Option.Option<number> = Option.none(),
): StoryRun<Names> => {
  let next = 0;

  return runFrom<Names>(subject, id, () => steps[next++] ?? "done", { seed, lenient: false }).run;
};

/**
 * Runs a subject over the steps a source gives, one at a time, each after the source has read the
 * run's view; skipped draws leave no step.
 */
// RETURN_TYPE: the Drawn contract keeps the checkpoints' names.
export const runFrom = <Names extends string>(
  subject: Subject,
  id: string,
  source: Source,
  options: Options,
): Drawn<Names> => {
  if (id === "") scriptFault("a Story's id is empty");

  const evidence: Array<Evidence> = [];
  const checkpoints = new Map<string, Cut>();

  const uses = new Map<
    string,
    {
      readonly actor: ActorId;
      readonly context: Wiring;
      readonly count: number;
    }
  >();

  let current = 1;
  let stepAt = -1;
  const turns = { instant: -1, count: 0 };
  const alive = (open: number) => open === current;
  const noted: Array<Noted> = [];
  const note = (event: Noted) => void noted.push(event);

  const fakes = makeWorld(
    alive,
    () => stepAt,
    (index) => note({ kind: "call", index }),
  );

  const store = makeStore(
    alive,
    (index) => note({ kind: "batch", index }),
    () => stepAt,
    options.seed,
  );

  const limits: Limits = {
    fail: (reason) => {
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a limit ends the run at once and rejects run(); it is never an app outcome
      throw new StoryTurnLimit({
        reason,
        step: stepAt,
        instant: turns.instant,
        evidence: [...evidence],
      });
    },
    admit: (given, at) => {
      if (at !== turns.instant) Object.assign(turns, { instant: at, count: 0 });

      if (turns.count + given.filter((e) => e._tag === "Turn").length > TURN_LIMIT)
        limits.fail("Turns");
    },
  };

  const boot = (open: number, now: number) => {
    const world = Layer.succeed(FakeWorld, fakes.service(open));

    const services = Layer.provide(Layer.mergeAll(Layer.empty, ...subject.fixtures), world);

    const host = Host.of({
      hidden: () => false,
      onHidden: () => () => undefined,
      store: Option.some(store.at(open)),
      sessionSeed: seedOf(mainTab(open), options.seed),
      freezeValues: true,
      workClock: Option.none(),
    });

    const opened = openTab({ ...subject.config, services }, host, now, limits);

    attachInspector(opened.built.runtime, (e) => {
      evidence.push(e);
      note({ kind: "record", open, record: TraceRecord.Runtime({ evidence: e }) });

      if (e._tag !== "Turn") return;
      const at = opened.now();

      if (at !== turns.instant) Object.assign(turns, { instant: at, count: 0 });
      turns.count += 1;
    });

    if (!Option.exists(opened.perform(opened.built.runtime.ready()), Exit.isSuccess))
      scriptFault(`open ${open} of the tab did not boot`);

    return opened;
  };

  const apply = (word: WorldWord) => {
    if (WorldWord.$is("storage")(word)) store.word(word.word);
    else if (WorldWord.$is("stored")(word)) store.put(word.key, word.text);
    else fakes.word(word);
  };

  for (const word of subject.world) apply(word);

  let tab = boot(current, 0);

  // The tab's Runtime is disposed once its life has left Open for good: disposing or disposed.
  const disposed = () => {
    const { life } = tab.built.driver.world();

    return Life.$is("Disposing")(life) || Life.$is("Disposed")(life);
  };

  // RETURN_TYPE: the exported Cut contract with its overloaded read.
  const cut = (): Cut => {
    const world = tab.built.driver.world();
    // The cut reads this world after later steps run: they must not take its maps.
    retain(world);
    const drift = indexDrift(world);

    if (drift.length > 0)
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- an index out of step with its facts is a defect in Flow, never the app's
      throw new Error(
        `Defect: the world's ${drift.join(", ")} index is out of step with its facts`,
      );
    const machines = tab.built.driver.machines;
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
      now: tab.now(),
      inspection: inspect(tab.built.runtime),
      records: { stored: store.data(), batches: store.batches() },
      calls: log.map((l) => ({ ...l.entry, server: l.server.name, endpoint: l.endpoint })),
      read,
    };
  };

  const live = (what: string) => {
    if (disposed()) scriptFault(`${what} after disposeRuntime`);
  };

  // An ensure passes the Runtime's admission, as the public ensureActor does, with the ref's
  // context overrides; an ensure again after a reload passes it with the ones it was first given.
  const attach = (actor: ActorId, context: Wiring) =>
    testing.attach(
      tab.built,
      actor,
      "story",
      false,
      Option.some(tab.built.admission.ensure(actor, context)),
    );

  const steps: Array<Step> = [];

  // RETURN_TYPE: the exported View contract a source reads.
  const view = (): View => ({
    held: fakes.held(),
    calls: (server, endpoint) => fakes.calls(server, endpoint).length,
    writes: store.batches().map((b) => b.status),
    heldWrites: store.heldWrites(),
    heldAcknowledges: store.heldAcknowledges(),
    disposed: disposed(),
    uses: (actor) => uses.get(actorKey(actor))?.count ?? 0,
    dependents: (actor) => dependentsOf(tab.built.driver.world(), actor),
    lanes: () => inspect(tab.built.runtime).lanes,
  });

  for (let pulled = source(view()); pulled !== "done"; pulled = source(view())) {
    if (pulled === "skip") continue;
    const step = pulled;
    const n = steps.push(step) - 1;
    stepAt = n;
    note({ kind: "record", open: current, record: TraceRecord.Step({ index: n, step }) });
    Object.assign(turns, { instant: tab.now(), count: 0 });

    Step.$match(step, {
      ensure: ({ actor, context }) => {
        live("ensure");
        attach(actor, context);
        const count = uses.get(actorKey(actor))?.count ?? 0;
        uses.set(actorKey(actor), { actor, context, count: count + 1 });
      },
      detach: ({ actor }) => {
        live("detach");
        const used = uses.get(actorKey(actor));

        if (used === undefined || used.count <= 1) uses.delete(actorKey(actor));
        else uses.set(actorKey(actor), { ...used, count: used.count - 1 });
        testing.detach(tab.built, actor, "story");
      },
      send: ({ actor, event: { _tag, ...payload } }) => {
        live("send");
        testing.send(tab.built, actor, _tag, payload);
      },
      dispose: ({ actor, how }) => {
        live("dispose");

        if (how === "forget") testing.forget(tab.built, actor);
        else {
          tab.built.admission.dispose(actor);
          tab.built.driver.input(Input.DisposeActor({ actor }));
        }

        uses.delete(actorKey(actor));
      },
      disposeRuntime: ({ forget }) => {
        tab.perform(tab.built.runtime.dispose({ forget }));
      },
      world: ({ words }) => {
        for (const word of words) apply(word);
      },
      advance: ({ duration }) => {
        // adjust ends once every woken fiber has suspended, so on an idle tab it always ends.
        if (!Option.exists(tab.perform(TestClock.adjust(duration)), Exit.isSuccess))
          scriptFault("advance did not end");
      },
      reload: ({ reattach, heldWrites }) => {
        const now = tab.now();

        if (heldWrites === "land") store.landHeld(current);
        else store.abortHeld(current);
        current += 1;
        tab = boot(current, now);

        if (!reattach) uses.clear();

        for (const { actor, context, count } of uses.values())
          for (let k = 0; k < count; k++) attach(actor, context);
      },
      checkpoint: ({ name }) => {
        if (checkpoints.has(name)) scriptFault(`checkpoint ${name} twice`);
        checkpoints.set(name, cut());
      },
    });

    if (!tab.idle()) scriptFault(`step ${n} left open ${current} of the tab busy`);
    const faults = fakes.faults();

    if (faults.length > 0) scriptFault(faults.join("; "));
  }

  const unused = [...fakes.unused(), ...store.unused()];

  if (unused.length > 0 && !options.lenient) scriptFault(unused.join("; "));

  // SAFETY: a Story's own steps hold one checkpoint word per name its type collected as Names, each taken once (checked above); a run of other steps is typed with string Names.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, lint-bomb/no-object-iteration-result-cast -- the checkpoints the steps named, keyed by name
  const named = Object.fromEntries(checkpoints) as StoryRun<Names>["checkpoints"];

  const log = fakes.log();
  const batches = store.batches();

  const resolve = (event: Noted, sequence: number) => {
    const at = (tab: Tab, record: TraceRecord) => ({ sequence, tab, record });

    if (event.kind === "record") return Option.some(at(mainTab(event.open), event.record));

    if (event.kind === "call")
      return Option.map(Option.fromUndefinedOr(log[event.index]), ({ server, endpoint, entry }) =>
        at(
          entry.tab,
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
        batch.tab,
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

  return {
    run: { steps, evidence, checkpoints: named, end: cut(), trace: { storyId: id, events } },
    unused: [...fakes.unusedAt(), ...store.unusedAt()],
  };
};

/**
 * Runs a subject over a step array as an Effect: a script fault or limit fails it, an ensure or
 * dispose the Runtime refuses fails it with that FlowError; anything else thrown fails it as
 * StoryFailed.
 */
export const runEffect = Effect.fn("runEffect")(function* <Names extends string>(
  subject: Subject,
  id: string,
  steps: ReadonlyArray<Step>,
  seed: Option.Option<number> = Option.none(),
) {
  return yield* Effect.try({
    try: () => runSteps<Names>(subject, id, steps, seed),
    catch: (fault) =>
      fault instanceof StoryFailed || fault instanceof StoryTurnLimit || fault instanceof FlowError
        ? fault
        : new StoryFailed({ problem: `the run threw: ${String(fault)}` }),
  });
});

/**
 * Runs a subject over a step array as a Promise: a script fault or limit rejects it, an ensure or
 * dispose the Runtime refuses rejects it with that FlowError; anything else thrown rejects it as
 * StoryFailed.
 */
export const run = <Names extends string>(
  subject: Subject,
  id: string,
  steps: ReadonlyArray<Step>,
  seed: Option.Option<number> = Option.none(),
) => Effect.runPromise(runEffect<Names>(subject, id, steps, seed));
