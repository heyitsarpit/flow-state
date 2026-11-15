import { Context, Deferred, Effect, Exit, Layer, Option, Result, Scope } from "effect";
import type { Values } from "../core/compiled.ts";
import type { Evidence } from "../core/evidence.ts";
import { laneKeyText } from "../core/lane-moves.ts";
import { rowOf, type Row } from "../core/rows.ts";
import { Input } from "../core/step.ts";
import type { Machines } from "../core/tx.ts";
import { type ActorId, actorKey, Disposal, type World } from "../core/world.ts";
import type { RequirementsOf } from "../contract.ts";
import type { AnyDefinition, Envelope, Machine, Operations } from "../definition.ts";
import { FlowError } from "../error.ts";
import { makeDriver, type Driver } from "./driver.ts";
import { browserPlatform } from "./platform/browser.ts";
import { decodeJsonText } from "./json.ts";
import { makeFibers } from "./fibers.ts";
import { Host, type Platform } from "./host.ts";

/**
 * An app: every machine a Runtime may run, by key.
 */
export type App<M extends Readonly<Record<string, Machine>> = Readonly<Record<string, Machine>>> = {
  readonly id: string;
  readonly machines: M;
};

/**
 * The services an app's contracts require: what its setup's services Layer, or a Story's fixtures,
 * must provide.
 */
export type ServicesOf<A extends App> = {
  readonly [K in keyof A["machines"]]: RequirementsOf<A["machines"][K]["definition"]["operations"]>;
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
 * - Two entries with one machine id throw {@link FlowError}.
 */
// RETURN_TYPE: the App contract runtimeSetup takes, keeping its machines' types.
export const app = <const M extends Readonly<Record<string, Machine>>>(config: App<M>): App<M> => {
  const ids = Object.values(config.machines).map((m) => m.compiled.id);
  const doubled = ids.filter((id, i) => ids.indexOf(id) !== i);

  if (doubled.length > 0)
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- construction errors throw one FlowError before any work
    throw new FlowError({
      code: "DuplicateMachine",
      problems: doubled.map((id) => `machines: ${id} twice`),
    });

  return config;
};

/**
 * A shared actor's name: its machine and, for a machine with no input, a literal name.
 */
export type ActorRef<D extends AnyDefinition = AnyDefinition> = {
  readonly machine: Machine<D>;
  readonly name: string;
};

/**
 * Names a shared actor. Inert.
 */
// RETURN_TYPE: the ActorRef keeps its machine's definition type.
export const actorRef = <D extends AnyDefinition>(
  machine: Machine<D>,
  name: string,
): ActorRef<D> => ({ machine, name });

/**
 * What a handle shows of an identity: its leaf state, its memory and its write lanes'
 * rows.
 */
export type Snapshot = {
  readonly state: string;
  readonly memory: Values;
  readonly operations: Operations;
};

/**
 * A handle to a shared actor: it follows the identity, not the incarnation.
 */
export type Actor<D extends AnyDefinition = AnyDefinition> = {
  readonly ref: ActorRef<D>;
  readonly send: (event: Envelope) => void;
  readonly getSnapshot: () => Option.Option<Snapshot>;
};

/**
 * The key of a Runtime's one hook for `attachInspector`: it attaches a sink and
 * nothing else.
 */
export const InspectorId = "~flow-state/Inspector";

/**
 * The key of a Runtime's driver, which `inspect(runtime)` reads and nothing else.
 */
export const DriverId = "~flow-state/Driver";

/**
 * The key of a setup's configuration, which a Story reads to boot the same setup over its own
 * page.
 */
export const SetupId = "~flow-state/Setup";

/**
 * A constructed Runtime.
 *
 * **Details**
 *
 * `ready()` runs the one bootstrap: it reads storage before any actor starts. `ensureActor`
 * returns the one shared actor of a ref, creating or restoring it.
 */
export type Runtime = {
  readonly ready: () => Effect.Effect<void, FlowError>;
  readonly ensureActor: <D extends AnyDefinition>(ref: ActorRef<D>) => Actor<D>;
  readonly disposeActor: <D extends AnyDefinition>(actor: Actor<D> | ActorRef<D>) => void;
  readonly dispose: () => Effect.Effect<void>;
  readonly [InspectorId]: (sink: (evidence: Evidence) => void) => () => void;
  readonly [DriverId]: Driver;
};

/**
 * What a Runtime is set up with; `R` is the services its app's contracts require.
 */
export type RuntimeSetup<R = never> = {
  readonly construct: () => Runtime;
  readonly [SetupId]: RuntimeConfig;
  readonly "~services"?: R;
};

// RETURN_TYPE: the snapshot's Operations shape.
const operationsOf = (world: World, machines: Machines, actor: ActorId): Operations => {
  const rows = new Map<string, Map<string, Row>>();

  for (const lane of world.lanes.values())
    if (actorKey(lane.actor) === actorKey(actor))
      Option.match(laneKeyText(machines, lane), {
        onNone: () => undefined,
        onSome: (keyText) => {
          const byKey = rows.get(lane.operation) ?? new Map<string, Row>();
          byKey.set(keyText, rowOf(lane));
          rows.set(lane.operation, byKey);
        },
      });

  return rows;
};

// RETURN_TYPE: an Option of the snapshot: none when the identity has no incarnation and no record.
export const snapshotIn = (
  world: World,
  machines: Machines,
  actor: ActorId,
): Option.Option<Snapshot> => {
  const key = actorKey(actor);
  const live = world.incarnations.get(key) ?? world.records.get(key);

  return Option.map(Option.fromUndefinedOr(live), (x) => ({
    state: x.state,
    memory: x.memory,
    operations: operationsOf(world, machines, actor),
  }));
};

// RETURN_TYPE: an Option of the snapshot: none when the identity has no incarnation and no record.
export const snapshotOf = (driver: Driver, actor: ActorId): Option.Option<Snapshot> =>
  snapshotIn(driver.world(), driver.machines, actor);

/**
 * The Runtime's construction options.
 */
export type RuntimeConfig = {
  readonly app: App;
  // FLOW_STATE_ALLOW_UNKNOWN: a services Layer may fail with its own error; the boot reports it as ServiceFailed.
  readonly services?: Layer.Layer<never, unknown>;
  readonly scope?: string;
  readonly persistence?: { readonly captureMs?: number };
};

/**
 * A setup's services Layer: it provides `R` and needs nothing.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a services Layer may fail with its own error; the boot reports it as ServiceFailed.
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

/**
 * Builds a Runtime over a platform, with its driver beside it for Flow's own suite (the public
 * Runtime does not carry it).
 */
export const buildRuntime = (config: RuntimeConfig, platform: Platform) => {
  const machines = new Map(Object.values(config.app.machines).map((m) => [m.compiled.id, m]));
  const sinks = new Set<(evidence: Evidence) => void>();
  const host = Context.get(platform, Host);
  // oxlint-disable-next-line lint-bomb/no-unmanaged-effect-scope -- the Runtime owns one Scope for its whole life: its services and every fiber; dispose() closes it
  const scope = Scope.makeUnsafe();
  let services = Context.empty();
  const fibers = makeFibers(scope, () => Context.merge(services, platform));
  const booted = Deferred.makeUnsafe<void, FlowError>();
  let started = false;
  let open = false;

  const persistence =
    config.persistence !== undefined && config.scope !== undefined && Option.isSome(host.store);

  const driver = makeDriver({
    machines: new Map([...machines].map(([id, m]) => [id, m.compiled])),
    platform,
    fibers,
    persistence,
    captureMs: config.persistence?.captureMs ?? 5000,
    // A callback that throws detaches only itself; sinks never change a step.
    sink: (batch) => {
      for (const e of batch)
        for (const sink of sinks)
          if (Result.isFailure(Result.try({ try: () => sink(e), catch: () => sink })))
            sinks.delete(sink);
    },
  });

  const closed = () => !Disposal.$is("Open")(driver.world().disposal);

  const disposedError = (what: string) =>
    new FlowError({ code: "RuntimeDisposed", problems: [`${what} after dispose()`] });

  // Storage is read and validated before any app service is acquired.
  const boot = Effect.fn("Runtime.boot")(function* () {
    const loaded = yield* Option.match(persistence ? host.store : Option.none(), {
      onNone: () => Effect.succeed(new Map<string, string>()),
      onSome: (store) => store.load,
    });

    const stored = new Map(
      [...loaded].flatMap(([k, v]) =>
        Option.toArray(Option.map(decodeJsonText(v), (x) => [k, x] as const)),
      ),
    );

    if (config.services !== undefined)
      services = yield* Layer.buildWithScope(config.services, scope).pipe(
        Effect.mapError(
          (cause) => new FlowError({ code: "ServiceFailed", problems: [String(cause)], cause }),
        ),
      );

    if (closed()) return yield* Effect.fail(disposedError("ready()"));

    driver.input(Input.Boot({ stored }));
    open = true;
  });

  // The first call runs the bootstrap once; every caller shares its Exit. The bootstrap is
  // uninterruptible, so interrupting the first caller delays its own interrupt until the
  // bootstrap ends (a stated limit: only that wait should be interrupted).
  const ready = () =>
    Effect.suspend(() => {
      if (closed()) return Effect.fail(disposedError("ready()"));

      if (started) return Deferred.await(booted);
      started = true;

      return Effect.uninterruptible(boot()).pipe(
        Effect.exit,
        Effect.flatMap((exit) => Deferred.done(booted, exit)),
        Effect.andThen(Deferred.await(booted)),
      );
    });

  const actorOf = (ref: { readonly machine: Machine; readonly name: string }) => ({
    machine: ref.machine.compiled.id,
    name: ref.name,
  });

  const admitting = (what: string) => {
    if (closed())
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the public ensureActor's and send's contract: after dispose() they reject RuntimeDisposed
      throw disposedError(what);
  };

  const runtime: Runtime = {
    ready,
    ensureActor: (ref) => {
      admitting(`ensureActor ${ref.name}`);

      // Before ready succeeds, no handle exists.
      if (!open)
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the public ensureActor's contract: before ready it rejects RuntimeNotReady
        throw new FlowError({
          code: "RuntimeNotReady",
          problems: [`ensureActor ${ref.name} before ready()`],
        });

      const actor = actorOf(ref);
      driver.input(Input.Ensure({ actor, use: Option.none(), existing: false }));

      return {
        ref,
        send: (event) => {
          admitting(`send ${event._tag} to ${ref.name}`);
          const { _tag: tag, ...payload } = event;
          driver.send(actor, tag, payload);
        },
        getSnapshot: () => snapshotOf(driver, actor),
      };
    },
    disposeActor: (actor) => {
      const ref = "ref" in actor ? actor.ref : actor;
      driver.input(Input.DisposeActor({ actor: actorOf(ref) }));
    },
    // The core's disposal ends first: calls settling within its bound are parked, then the
    // Scope closes every fiber.
    dispose: () => driver.dispose.pipe(Effect.andThen(Scope.close(scope, Exit.void))),
    [InspectorId]: (sink) => {
      sinks.add(sink);

      return () => void sinks.delete(sink);
    },
    [DriverId]: driver,
  };

  return { runtime, driver };
};

/**
 * Sets up a Runtime over an app: `construct()` is synchronous and inert.
 *
 * **When to use**
 *
 * Once per host. `construct()` builds the Runtime; `ready()` starts it.
 */
// RETURN_TYPE: the exported RuntimeSetup contract keeps the services the app requires.
export const runtimeSetup = <A extends App>(
  config: SetupConfig<A>,
): RuntimeSetup<ServicesOf<A>> => ({
  construct: () => buildRuntime(config, browserPlatform()).runtime,
  [SetupId]: config,
});
