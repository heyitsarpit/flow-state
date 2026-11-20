import {
  Context,
  Deferred,
  Duration,
  Effect,
  Layer,
  Option,
  Predicate,
  Result,
  Scope,
} from "effect";
import { RuntimeDefaults } from "../core/defaults.ts";
import type { Compiled } from "../core/compiled.ts";
import type { Evidence } from "../core/evidence.ts";
import { dependentsOf, Input } from "../core/step.ts";
import { endedBy, isStopped, Verdict } from "../core/life.ts";
import { type ActorId, actorKey, sameActor, type Wiring } from "../core/world.ts";
import { heldUntilReleased, makeClose, makeForget, type Unsettled, unsettledOf } from "./close.ts";
import { inputFieldsOf, LOCAL_PREFIX } from "../core/identity.ts";
import type { AnyDefinition, EventOf, InputOf, Machine } from "../definition.ts";
import type { CheckedEntries } from "./context-refs.ts";
import {
  type FlowError,
  flowError,
  foreignActorRef,
  lifeRejection,
  raise,
  refuse,
} from "../error.ts";
import { entry, entryEffect } from "../entry.ts";
import { appFindings, malformedOf } from "../core/well-formed.ts";
import { setupFindings } from "../config.ts";
import { makeDriver, type Driver } from "./driver.ts";
import { actorIdOf, type ActorRef } from "./refs.ts";
import { defect } from "../core/defect.ts";
import { browserPlatform } from "./platform/browser.ts";
import { Ending, makeOwner, makeRuntimeReport, type Traced } from "./owners/owners.ts";
import { makeRunPromise } from "./run-promise.ts";
import { makeWiring } from "./wiring.ts";
import { outside, type Snapshot, snapshotOf } from "./snapshot.ts";
import { Host, type Platform } from "./host.ts";
import { Store, StoreScope } from "./store.ts";

export { type Snapshot, snapshotIn, snapshotOf } from "./snapshot.ts";

export type { Unsettled } from "./close.ts";

export {
  type App,
  type AppEntry,
  type DefsOf,
  type MachineOf,
  machineOf,
  type RuntimeConfig,
  type ServicesLayer,
  type ServicesOf,
  noStore,
  servicesFailed,
  type SetupConfig,
} from "./setup.ts";

import {
  type App,
  type AppEntry,
  type DefsOf,
  machineOf,
  noStore,
  type RuntimeConfig,
  type ServicesOf,
  servicesFailed,
  type SetupConfig,
} from "./setup.ts";

export { actorIdOf, actorRef, type ActorRef, type RefName } from "./refs.ts";

/**
 * Declares an app: the closed list of machines a Runtime may run.
 *
 * **When to use**
 *
 * Once per application, in `app.ts`; `runtimeSetup` takes it.
 *
 * **Gotchas**
 *
 * - Unknown fields, two machines with one id, one machine under two keys, or two contracts with
 *   one id throw one {@link FlowError} naming every entry.
 */
export const app = entry(
  "app",
  // RETURN_TYPE: the App contract runtimeSetup takes, keeping its machines' types.
  <const M extends Readonly<Record<string, AppEntry>>>(
    config: App<M> & { readonly machines: CheckedEntries<NoInfer<M>> },
  ): App<M> => {
    refuse(
      appFindings({
        ...config,
        machines: Object.fromEntries(
          Object.entries(config.machines).map(([key, entry]) => [key, machineOf(entry)]),
        ),
      }),
    );

    return config;
  },
);

/**
 * A handle to an actor: it follows the identity, not the incarnation.
 */
export type Actor<D extends AnyDefinition = AnyDefinition> = {
  readonly machine: Machine<D>;
  // A method, so a handle of one machine reads as a handle of any machine.
  send(event: EventOf<D>): void;
  readonly getSnapshot: () => Option.Option<Snapshot<D, "outside">>;
};

// The Runtime and identity each handle belongs to, kept beside it rather than on it, so no
// caller reaches the driver through a handle.
const handles = new WeakMap<WeakKey, { readonly runtime: Driver; readonly actor: ActorId }>();

// RETURN_TYPE: a type guard states the type it narrows to.
const isHandle = (target: Actor | ActorRef): target is Actor => handles.has(target);

/**
 * What a Runtime keeps beside it for Flow's own tools: its driver, which `inspect(runtime)` reads,
 * and its one hook for `attachInspector`, which attaches a sink and nothing else.
 */
type Internals = {
  readonly driver: Driver;
  readonly attach: (sink: (evidence: Evidence) => void) => () => void;
};

const internals = new WeakMap<WeakKey, Internals>();

/**
 * A Runtime's driver and inspector hook. Only Flow's inspection reads them.
 */
export const internalsOf = (runtime: Runtime) =>
  internals.get(runtime) ?? defect("a Runtime this Flow did not construct");

const setups = new WeakMap<WeakKey, RuntimeConfig>();

/**
 * A setup's configuration, which a Story reads to boot the same setup in its own tab.
 */
export const configOf = <R>(setup: RuntimeSetup<R>) =>
  setups.get(setup) ?? defect("a setup runtimeSetup did not make");

/**
 * A constructed Runtime.
 *
 * **Details**
 *
 * `ready()` runs the one bootstrap: it reads storage before any actor starts. `ensureActor`
 * returns the one shared actor of a ref, creating it from the ref's input or restoring it.
 * `createActor` creates a new local actor from its input: it never persists, no ref names it, and
 * it lives until disposed. `dispose()` keeps the scope's saved data; `dispose({ forget: true })`
 * deletes every record of the scope and succeeds only once the deletion landed, failing
 * `StorageFailure` when the store refused it. Disposal ends the core's work, interrupts every
 * call and waits for it, then runs a wanted forget, then releases the services, the Store among
 * them; a forget asked after that stage fails `StorageFailure`. A cleanup that fails rejects every
 * `dispose()` with `CleanupFailed`, keeping each Cause. `unsettledWrites()` lists every identity
 * with a write still out, for a host's `beforeunload`. `runPromise(effect, { signal })` runs a host
 * Effect with the app's services `R` in the Runtime's Scope, so a disposal interrupts it: it rejects
 * `RuntimeNotReady` before ready and `RuntimeDisposed` once disposal starts, running nothing; a
 * failed, defective or interrupted Effect rejects with a FlowError coded `RunFailed` keeping the
 * whole Cause; aborting the signal interrupts the Effect.
 */
export type Runtime<R = never, A extends App = App> = {
  // A phantom type: the app, whose definitions are the only ones its words take.
  readonly "~app"?: A;
  readonly ready: () => Effect.Effect<void, FlowError>;
  readonly ensureActor: <D extends DefsOf<A>>(ref: ActorRef<D>) => Actor<D>;
  readonly createActor: <D extends DefsOf<A>>(
    machine: Machine<D>,
    options: { readonly input: InputOf<D["memory"]> },
  ) => Actor<D>;
  readonly disposeActor: <D extends DefsOf<A>>(actor: Actor<D> | ActorRef<D>) => void;
  readonly dispose: (
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public option: an omitted option keeps saved data
    options?: { readonly forget?: boolean },
  ) => Effect.Effect<void, FlowError>;
  // Generic, so a Runtime of one app is still a Runtime where its app is not read; a method, so its
  // guard is too. The rows are the app's own definitions': naming a narrower app needs an
  // argument no caller has.
  unsettledWrites<Ds extends DefsOf<A> = DefsOf<A>>(
    ...exact: [DefsOf<A>] extends [Ds] ? [] : [never]
  ): ReadonlyArray<Unsettled<Ds>>;
  // A method, so a Runtime of any services is still a Runtime where its services are not read.
  runPromise<A, E>(
    effect: Effect.Effect<A, E, R>,
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public option, as Effect.runPromise takes it: an omitted signal never aborts
    options?: { readonly signal?: AbortSignal },
  ): Promise<A>;
};

/**
 * What a Runtime is set up with; `R` is the services its app's contracts require.
 */
export type RuntimeSetup<R = never, A extends App = App> = {
  readonly construct: () => Runtime<R, A>;
  readonly "~services"?: R;
  readonly "~app"?: A;
};

// Each Compiled's verdict, judged once: a Compiled never changes, and every boot of a Runtime over
// it would walk it again.
const verdicts = new WeakMap<Compiled, ReturnType<typeof malformedOf>>();

const verdictOf = (compiled: Compiled) => {
  const known = verdicts.get(compiled);

  if (known !== undefined) return known;

  const verdict = malformedOf(compiled);
  verdicts.set(compiled, verdict);

  return verdict;
};

const LOAD_SILENT = "load silent";

/**
 * Builds a Runtime over a platform, with its driver beside it for Flow's own suite (the public
 * Runtime does not carry it); `traced` hears each Owner's tasks and reports for a dev trace.
 */
export const buildRuntime = <R = never, A extends App = App>(
  config: RuntimeConfig,
  platform: Platform,
  admit: (evidence: ReadonlyArray<Evidence>) => void,
  traced: Traced,
) => {
  const entries = Object.values(config.app.machines);

  refuse(entries.flatMap((e) => Option.toArray(verdictOf(machineOf(e).compiled))));

  const machines = new Map(entries.map((e) => [machineOf(e).compiled.id, machineOf(e)]));

  // Each machine entry's default wiring: the ref of each context slot's provider.
  const defaults = new Map(
    entries.map((e) => [machineOf(e).compiled.id, ("machine" in e ? e.context : undefined) ?? {}]),
  );

  const { wiringOf, overridesOf, refused: contextRefused } = makeWiring(machines, defaults);

  const sinks = new Set<(evidence: Evidence) => void>();
  const host = Context.get(platform, Host);
  // oxlint-disable-next-line lint-bomb/no-unmanaged-effect-scope -- the Runtime owns one Scope for its whole life: its services and its work; dispose() closes it
  const root = Scope.makeUnsafe();
  // The services' Scope comes first and the work's second, so the root releases work first.
  // oxlint-disable-next-line lint-bomb/no-unmanaged-effect-scope -- a child of the Runtime's root, released when the root closes
  const servicesScope = Scope.forkUnsafe(root);
  let services = Context.empty();
  const context = () => Context.merge(services, platform);
  // Each failed cleanup is an Issue as it is judged.
  const work = makeOwner(root, context, () => driver.input(Input.CleanupFailed()), "work", traced);
  const report = makeRuntimeReport(host.report);
  const booted = Deferred.makeUnsafe<void, FlowError>();

  const persistence = config.persistence !== undefined && config.scope !== undefined;

  // The scope's store, found in the services once they are built, else in the platform, where
  // Flow's test host gives one; a setup's own services win.
  let store = Option.none<Store["Service"]>();

  const driver = makeDriver({
    machines: new Map(
      [...machines].map(([id, m]) => [
        id,
        {
          ...m.compiled,
          wiring: new Map(
            Object.entries(defaults.get(id) ?? {}).map(([slot, ref]) => [slot, actorIdOf(ref)]),
          ),
        },
      ]),
    ),
    platform,
    work,
    report,
    persistence,
    store: () => Option.getOrElse(store, () => defect("a capture before the store was found")),
    captureMs: config.persistence?.captureMs ?? Duration.toMillis(RuntimeDefaults.captureInterval),
    admit,
    // A callback that throws detaches only itself; sinks never change a step.
    sink: (batch) => {
      for (const e of batch)
        for (const sink of sinks)
          if (Result.isFailure(Result.try({ try: () => sink(e), catch: () => sink })))
            sinks.delete(sink);
    },
  });

  const rejected = (code: "RuntimeNotReady" | "RuntimeDisposed") =>
    flowError([lifeRejection(code, "ready", "ready()", "boot", endedBy(driver.world().life))]);

  // The services, the Store among them, are acquired whole, since one Layer cannot be split; then
  // storage is read and validated before any actor starts. The core's life decides whether the boot
  // it reads still opens the Runtime.
  const boot = Effect.fn("Runtime.boot")(function* () {
    const failed = (error: FlowError) =>
      Effect.sync(() => driver.input(Input.BootFailed())).pipe(
        // A bootstrap the disposal cancelled fails as the life says, whatever its service did.
        Effect.andThen(
          Option.match(
            Option.liftPredicate(
              driver.verdict(Input.Boot({ stored: Option.none() })),
              Verdict.$is("Reject"),
            ),
            {
              onSome: ({ code }) => Effect.fail(rejected(code)),
              onNone: () => Effect.fail(error),
            },
          ),
        ),
      );

    if (config.services !== undefined)
      services = yield* Layer.buildWithScope(config.services, servicesScope).pipe(
        Effect.provideService(StoreScope, { app: config.app.id, scope: config.scope ?? "" }),
        Effect.catch((cause) => failed(servicesFailed(cause))),
      );

    store = persistence
      ? yield* Effect.transposeOption(
          Option.map(
            Option.orElse(Context.getOption(services, Store), () =>
              Context.getOption(platform, Store),
            ),
            (found) => heldUntilReleased(found, servicesScope),
          ),
        )
      : Option.none();

    if (persistence && Option.isNone(store)) return yield* failed(noStore);

    // A load the store refused boots with nothing and no persistence; the core reports it. A load
    // still unanswered at the storage silence default is reported, and waited for.
    const stored = yield* Option.match(store, {
      onNone: () => Effect.succeed(Option.some<ReadonlyMap<string, string>>(new Map())),
      onSome: (given) => {
        work.fork(LOAD_SILENT, Effect.sleep(RuntimeDefaults.storageSilent), (ending) => {
          if (Ending.$is("Done")(ending)) driver.input(Input.LoadSilent());
        });

        return given.load.pipe(
          Effect.option,
          Effect.ensuring(Effect.sync(() => work.cancel(LOAD_SILENT))),
        );
      },
    });

    const opened = Input.Boot({ stored });
    const verdict = driver.verdict(opened);
    driver.input(opened);

    // A boot step that failed with a defect stopped the Runtime: ready fails with that defect.
    if (isStopped(driver.world().life)) return yield* driver.ended;

    if (Verdict.$is("Reject")(verdict)) return yield* Effect.fail(rejected(verdict.code));
  });

  // The first call runs the bootstrap once; every caller shares its Exit. The bootstrap is
  // uninterruptible, so interrupting the first caller delays its own interrupt until the
  // bootstrap ends (a stated limit: only that wait should be interrupted).
  const ready = Effect.fn("ready")(function* () {
    const start = Input.Start();

    return yield* Verdict.$match(driver.verdict(start), {
      Reject: ({ code }) => Effect.fail(rejected(code)),
      Drop: () => Deferred.await(booted),
      Run: () => {
        driver.input(start);

        return Effect.uninterruptible(boot()).pipe(
          Effect.exit,
          Effect.flatMap((exit) => Deferred.done(booted, exit)),
          Effect.andThen(Deferred.await(booted)),
        );
      },
    });
  });

  const forget = makeForget(driver, persistence, () => store, booted);

  const close = makeClose(driver, root, report, forget, context, traced);

  // Local actors are numbered by the Runtime that creates them; they never persist or outlive it.
  let locals = 0;

  // RETURN_TYPE: the Actor contract keeps its machine's definition type.
  const handleOf = <D extends AnyDefinition>(machine: Machine<D>, actor: ActorId): Actor<D> => {
    const handle: Actor<D> = {
      machine,
      send: entry(`send to ${actor.name}`, (event: EventOf<D>) => {
        // An event a caller without types sent: no tag names no event, so the driver refuses it.
        if (!Predicate.hasProperty(event, "_tag") || !Predicate.isString(event._tag))
          return driver.send(actor, "", {});

        const { _tag: tag, ...payload } = event;
        driver.send(actor, tag, payload);
      }),
      getSnapshot: entry(`getSnapshot of ${actor.name}`, () =>
        Option.map(snapshotOf(driver, actor), (x) => outside(machine, x)),
      ),
    };

    handles.set(handle, { runtime: driver, actor });

    return handle;
  };

  // A ref names an identity only of a machine this Runtime's app runs.
  const ownRef = (ref: ActorRef) => {
    if (machines.get(ref.machine.compiled.id) === ref.machine) return actorIdOf(ref);

    return foreignActorRef([ref.machine.compiled.id], ref.machine.compiled.id, "Runtime");
  };

  // A handle names its own Runtime's identity; another Runtime's handle is refused.
  const identityOf = (target: Actor | ActorRef) => {
    if (!isHandle(target)) return ownRef(target);

    const link = handles.get(target) ?? defect("a handle without its Runtime");

    if (link.runtime === driver) return link.actor;

    return raise(
      flowError([
        {
          code: "ForeignActorRef",
          path: [link.actor.machine, link.actor.name],
          summary: "the handle belongs to another Runtime",
          help: "Use a handle from this Runtime, or name the actor with its ref.",
        },
      ]),
    );
  };

  // What admission checks before an ensure or a dispose does any work; a Story's words pass it too.
  const admission = {
    // The providers an ensure's graph binds: each entry's wiring with the refs' overrides; an
    // identity anywhere in the graph that is live and bound otherwise is refused.
    ensure: (actor: ActorId, overrides: Wiring) => {
      const graph = wiringOf(actor, overrides, [actorKey(actor)]);

      const conflicting = [...graph].find(([key, wiring]) =>
        Option.exists(
          Option.fromUndefinedOr(driver.world().incarnations.get(key)),
          ({ bound }) =>
            bound.size !== wiring.size ||
            [...wiring].some(([slot, p]) => !sameActor(p, bound.get(slot) ?? actor)),
        ),
      );

      if (conflicting !== undefined) {
        const live = driver.world().incarnations.get(conflicting[0])?.actor ?? actor;

        return raise(
          contextRefused(
            "ConflictingActorRef",
            [live.machine, live.name],
            `${live.name} is live with other context`,
            "Name one identity with one context: drop the ref's override or use another identity.",
          ),
        );
      }

      return graph;
    },
    // A provider with bound consumers is not disposed: its consumers would lose their context.
    dispose: (actor: ActorId) => {
      const dependents = dependentsOf(driver.world(), actor);

      if (
        dependents.length > 0 &&
        Verdict.$is("Run")(driver.verdict(Input.DisposeActor({ actor })))
      )
        return raise(
          contextRefused(
            "BlockedByDependents",
            [actor.machine, actor.name, ...dependents.map(actorKey)],
            `${actor.name} provides context to ${dependents.map(actorKey).join(", ")}`,
            "Dispose its consumers first.",
          ),
        );
    },
  };

  const runtime: Runtime<R, A> = {
    ready: entryEffect("ready", ready),
    // Before ready succeeds, no handle exists: the core's life rejects the ensure.
    ensureActor: entry("ensureActor", <D extends AnyDefinition>(ref: ActorRef<D>) => {
      const actor = ownRef(ref);
      const what = `ensureActor ${actor.name}`;

      const probe = Input.Ensure({
        actor,
        use: Option.none(),
        start: "create",
        wiring: Option.none(),
      });

      // The life decides first; then the context graph is checked, before any work.
      if (!Verdict.$is("Run")(driver.verdict(probe))) driver.offer(probe, what);

      // A ref whose ended actor's cleanup failed reports that failure until it is disposed.
      const failed = driver.quarantine(actor);

      if (Option.isSome(failed)) raise(failed.value);

      const graph = admission.ensure(actor, overridesOf(ref));
      driver.offer(Input.Ensure({ ...probe, wiring: Option.some(graph) }), what);

      return handleOf(ref.machine, actor);
    }),
    createActor: entry(
      "createActor",
      <D extends AnyDefinition>(
        machine: Machine<D>,
        options: { readonly input: InputOf<D["memory"]> },
      ) => {
        const compiled = machine.compiled;

        // The input is checked by its Schemas before any work, as a value ref's is.
        if (inputFieldsOf(compiled).length > 0)
          actorIdOf({ machine, value: options.input, context: {} });

        const actor = { machine: compiled.id, name: `${LOCAL_PREFIX}${locals + 1}` };
        driver.offer(Input.Create({ actor, input: options.input }), `createActor ${compiled.id}`);
        locals += 1;

        return handleOf(machine, actor);
      },
    ),
    disposeActor: entry(
      "disposeActor",
      <D extends AnyDefinition>(target: Actor<D> | ActorRef<D>) => {
        const actor = identityOf(target);
        admission.dispose(actor);

        // Lifted first, by a disposal that runs: this disposal's own reads may quarantine the ref
        // again as they end.
        if (Verdict.$is("Run")(driver.verdict(Input.DisposeActor({ actor })))) driver.lift(actor);
        driver.offer(Input.DisposeActor({ actor }), `disposeActor ${actor.name}`);
      },
    ),
    // The core's disposal ends first (calls settling within its bound are parked), then the
    // Runtime's work closes, a wanted forget deletes the scope's records whatever the work's close
    // reported, and the services release, all on the close's own fiber, so a caller that leaves
    // skips nothing; a failed close and a failed forget are both kept.
    dispose: entryEffect(
      "dispose",
      // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public option: an omitted option keeps saved data
      (options?: { readonly forget?: boolean }) => {
        const forgetting = options?.forget === true;

        return Effect.suspend(() => {
          if (forgetting) close.wantForget();
          driver.input(Input.DisposeRuntime());

          return close.join(forgetting);
        });
      },
    ),
    unsettledWrites: entry("unsettledWrites", <Ds extends DefsOf<A>>() => unsettledOf<Ds>(driver)),
    runPromise: entry("runPromise", makeRunPromise<R>(driver)),
  };

  internals.set(runtime, {
    driver,
    attach: (sink) => {
      sinks.add(sink);

      return () => void sinks.delete(sink);
    },
  });

  return { runtime, driver, admission };
};

/**
 * Sets up a Runtime over an app: `construct()` is synchronous and inert.
 *
 * **When to use**
 *
 * Once per host. `construct()` builds the Runtime; `ready()` starts it.
 *
 * **Gotchas**
 *
 * - A setup with an unknown or wrong-kind field, or an app `app` refuses, throws one
 *   {@link FlowError} naming each field.
 */
export const runtimeSetup = entry(
  "runtimeSetup",
  // RETURN_TYPE: the exported RuntimeSetup contract keeps the services the app requires.
  <A extends App>(config: SetupConfig<A>): RuntimeSetup<ServicesOf<A>, A> => {
    refuse(setupFindings(config));
    app(config.app);

    const setup: RuntimeSetup<ServicesOf<A>, A> = {
      construct: entry(
        "construct",
        () =>
          buildRuntime<ServicesOf<A>, A>(config, browserPlatform(), () => undefined, Option.none())
            .runtime,
      ),
    };

    setups.set(setup, config);

    return setup;
  },
);
