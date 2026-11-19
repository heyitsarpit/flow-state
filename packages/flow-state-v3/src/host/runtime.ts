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
import { makeClose, makeForget, type Unsettled, unsettledOf } from "./close.ts";
import { inputFieldsOf, LOCAL_PREFIX } from "../core/identity.ts";
import type { RequirementsOf } from "../contract.ts";
import type { AnyDefinition, EventOf, InputOf, Machine } from "../definition.ts";
import { type FlowError, flowError, flowErrorOf, lifeRejection, raise, refuse } from "../error.ts";
import { entry, entryEffect } from "../entry.ts";
import { appFindings, malformedOf } from "../core/well-formed.ts";
import { setupFindings } from "../config.ts";
import { makeDriver, type Driver } from "./driver.ts";
import { actorIdOf, type ActorRef } from "./refs.ts";
import { defect } from "../core/defect.ts";
import { browserPlatform } from "./platform/browser.ts";
import { makeOwner, makeRuntimeReport, type Traced } from "./owners/owners.ts";
import { makeRunPromise } from "./run-promise.ts";
import { makeWiring } from "./wiring.ts";
import { outside, type Snapshot, snapshotOf } from "./snapshot.ts";
import { Host, type Platform } from "./host.ts";

export { type Snapshot, snapshotIn, snapshotOf } from "./snapshot.ts";

export type { Unsettled } from "./close.ts";

export { actorIdOf, actorRef, type ActorRef, type RefName } from "./refs.ts";

/**
 * One machine an app runs: the machine, or the machine with the default wiring of its context
 * slots, each to the ref of the actor that provides it.
 */
export type AppEntry =
  | Machine
  | {
      readonly machine: Machine;
      // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: an entry with no context wires no slot by default
      readonly context?: Readonly<Record<string, ActorRef>>;
    };

/**
 * The machine of an app entry.
 */
export type MachineOf<E> = E extends { readonly machine: infer M extends Machine } ? M : E;

/**
 * The machine of an app entry.
 */
export const machineOf = (entry: AppEntry) => ("machine" in entry ? entry.machine : entry);

/**
 * An app: every machine a Runtime may run, by key.
 */
export type App<M extends Readonly<Record<string, AppEntry>> = Readonly<Record<string, AppEntry>>> =
  {
    readonly id: string;
    readonly machines: M;
  };

/**
 * The services an app's contracts require: what its setup's services Layer, or a Story's fixtures,
 * must provide.
 */
export type ServicesOf<A extends App> = {
  readonly [K in keyof A["machines"]]: RequirementsOf<
    MachineOf<A["machines"][K]>["definition"]["operations"]
  >;
}[keyof A["machines"]];

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
  <const M extends Readonly<Record<string, AppEntry>>>(config: App<M>): App<M> => {
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
  readonly getSnapshot: () => Option.Option<Snapshot>;
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
 * call and waits for it, then releases the services; a cleanup that fails there rejects every
 * `dispose()` with `CleanupFailed`, keeping each Cause. `unsettledWrites()` lists every identity
 * with a write still out, for a host's `beforeunload`. `runPromise(effect, { signal })` runs a host
 * Effect with the app's services `R` in the Runtime's Scope, so a disposal interrupts it: it rejects
 * `RuntimeNotReady` before ready and `RuntimeDisposed` once disposal starts, running nothing; a
 * failed, defective or interrupted Effect rejects with a FlowError coded `RunFailed` keeping the
 * whole Cause; aborting the signal interrupts the Effect.
 */
export type Runtime<R = never> = {
  readonly ready: () => Effect.Effect<void, FlowError>;
  readonly ensureActor: <D extends AnyDefinition>(ref: ActorRef<D>) => Actor<D>;
  readonly createActor: <D extends AnyDefinition>(
    machine: Machine<D>,
    options: { readonly input: InputOf<D["memory"]> },
  ) => Actor<D>;
  readonly disposeActor: <D extends AnyDefinition>(actor: Actor<D> | ActorRef<D>) => void;
  readonly dispose: (
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public option: an omitted option keeps saved data
    options?: { readonly forget?: boolean },
  ) => Effect.Effect<void, FlowError>;
  readonly unsettledWrites: () => ReadonlyArray<Unsettled>;
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
export type RuntimeSetup<R = never> = {
  readonly construct: () => Runtime<R>;
  readonly "~services"?: R;
};

/**
 * The Runtime's construction options.
 */
export type RuntimeConfig = {
  readonly app: App;
  // FLOW_STATE_ALLOW_UNKNOWN: a services Layer may fail with its own error; the boot reports it as a Defect.
  readonly services?: Layer.Layer<never, unknown>;
  readonly scope?: string;
  readonly persistence?: { readonly captureMs?: number };
};

/**
 * A setup's services Layer: it provides `R` and needs nothing.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a services Layer may fail with its own error; the boot reports it as a Defect.
export type ServicesLayer<R> = Layer.Layer<R, unknown>;

/**
 * What `runtimeSetup` takes: the services Layer is required, and must provide every service the
 * app's contracts list, unless they list none.
 */
export type SetupConfig<A extends App> = {
  readonly app: A;
  readonly scope?: string;
  readonly persistence?: { readonly captureMs?: number };
} & ([ServicesOf<A>] extends [never]
  ? { readonly services?: ServicesLayer<never> }
  : { readonly services: ServicesLayer<ServicesOf<A>> });

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

/**
 * Builds a Runtime over a platform, with its driver beside it for Flow's own suite (the public
 * Runtime does not carry it); `traced` hears each Owner's tasks and reports for a dev trace.
 */
export const buildRuntime = <R = never>(
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

  const persistence =
    config.persistence !== undefined && config.scope !== undefined && Option.isSome(host.store);

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

  // Storage is read and validated before any app service is acquired; the core's life decides
  // whether the boot it reads still opens the Runtime.
  const boot = Effect.fn("Runtime.boot")(function* () {
    // A load the store refused boots with nothing and no persistence; the core reports it.
    const stored = yield* Option.match(persistence ? host.store : Option.none(), {
      onNone: () => Effect.succeed(Option.some<ReadonlyMap<string, string>>(new Map())),
      onSome: (store) => store.load.pipe(Effect.option),
    });

    if (config.services !== undefined)
      services = yield* Layer.buildWithScope(config.services, servicesScope).pipe(
        Effect.mapError((cause) =>
          flowErrorOf(
            [
              {
                code: "Defect",
                path: ["services"],
                summary: "the services Layer failed to build",
                help: "Fix the failing service; its cause is on this error.",
              },
            ],
            cause,
          ),
        ),
        Effect.tapError(() => Effect.sync(() => driver.input(Input.BootFailed()))),
        // A bootstrap the disposal cancelled fails as the life says, whatever its service did.
        Effect.mapError((failed) =>
          Option.match(
            Option.liftPredicate(driver.verdict(Input.Boot({ stored })), Verdict.$is("Reject")),
            {
              onSome: ({ code }) => rejected(code),
              onNone: () => failed,
            },
          ),
        ),
      );

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

  const forget = makeForget(driver, persistence ? host.store : Option.none(), booted);

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

    return raise(
      flowError([
        {
          code: "ForeignActorRef",
          path: [ref.machine.compiled.id],
          summary: `${ref.machine.compiled.id} is not a machine of this Runtime's app`,
          help: "Use refs of the machines this Runtime's app lists.",
        },
      ]),
    );
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

  const runtime: Runtime<R> = {
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
    // The core's disposal ends first (calls settling within its bound are parked), the Runtime
    // closes, then a forget deletes the scope's records whatever the close reported, as the
    // close's own last stage, so a caller that leaves skips nothing; a failed close and a failed
    // forget are both kept.
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
    unsettledWrites: entry("unsettledWrites", () => unsettledOf(driver)),
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
  <A extends App>(config: SetupConfig<A>): RuntimeSetup<ServicesOf<A>> => {
    refuse(setupFindings(config));
    app(config.app);

    const setup: RuntimeSetup<ServicesOf<A>> = {
      construct: entry(
        "construct",
        () =>
          buildRuntime<ServicesOf<A>>(config, browserPlatform(), () => undefined, Option.none())
            .runtime,
      ),
    };

    setups.set(setup, config);

    return setup;
  },
);
