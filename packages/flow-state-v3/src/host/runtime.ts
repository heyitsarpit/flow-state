import { Context, Deferred, Effect, Exit, Layer, Option, Result, Scope } from "effect";
import type { Values } from "../core/compiled.ts";
import type { Evidence } from "../core/evidence.ts";
import { rowOf, type Row } from "../core/rows.ts";
import { Input } from "../core/step.ts";
import { type ActorId, actorKey } from "../core/world.ts";
import type { AnyDefinition, Envelope, Machine, Operations } from "../definition.ts";
import { FlowError } from "../error.ts";
import { makeDriver, type Driver } from "./driver.ts";
import { browserPlatform } from "./browser.ts";
import { decodeJsonText } from "./json.ts";
import { makeFibers } from "./fibers.ts";
import { Host, type Platform } from "./host.ts";

/**
 * An app: every machine a Runtime may run, by key (Runtime O1).
 */
export type App = { readonly id: string; readonly machines: Readonly<Record<string, Machine>> };

/**
 * Declares an app: the closed list of machines a Runtime may run (Runtime O1).
 *
 * **When to use**
 *
 * Once per application, in `app.ts`; `runtimeSetup` takes it.
 *
 * **Gotchas**
 *
 * - Two entries with one machine id throw {@link FlowError}.
 */
// RETURN_TYPE: the App contract runtimeSetup takes.
export const app = (config: App): App => {
  const ids = Object.values(config.machines).map((m) => m.compiled.id);
  const doubled = ids.filter((id, i) => ids.indexOf(id) !== i);

  if (doubled.length > 0)
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- construction errors throw one FlowError before any work (Compile R2, R15)
    throw new FlowError({
      code: "DuplicateMachine",
      problems: doubled.map((id) => `machines: ${id} twice`),
    });

  return config;
};

/**
 * A shared actor's name: its machine and, for a machine with no input, a literal name (Runtime O3).
 */
export type ActorRef<D extends AnyDefinition = AnyDefinition> = {
  readonly machine: Machine<D>;
  readonly name: string;
};

/**
 * Names a shared actor (Runtime O3). Inert.
 */
// RETURN_TYPE: the ActorRef keeps its machine's definition type.
export const actorRef = <D extends AnyDefinition>(
  machine: Machine<D>,
  name: string,
): ActorRef<D> => ({ machine, name });

/**
 * What a handle shows of an identity (Turn R23): its leaf state, its memory and its write lanes'
 * rows.
 */
export type Snapshot = {
  readonly state: string;
  readonly memory: Values;
  readonly operations: Operations;
};

/**
 * A handle to a shared actor: it follows the identity, not the incarnation (Runtime O3).
 */
export type Actor<D extends AnyDefinition = AnyDefinition> = {
  readonly ref: ActorRef<D>;
  readonly send: (event: Envelope) => void;
  readonly getSnapshot: () => Option.Option<Snapshot>;
};

/**
 * The key of a Runtime's one hook for `attachInspector` (Inspection O3): it attaches a sink and
 * nothing else.
 */
export const InspectorId = "~flow-state/Inspector";

/**
 * A constructed Runtime (Runtime O2).
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
};

/**
 * What a Runtime is set up with (Runtime O2).
 */
export type RuntimeSetup = {
  readonly construct: () => Runtime;
};

// RETURN_TYPE: the snapshot's Operations shape.
const operationsOf = (driver: Driver, actor: ActorId): Operations => {
  const rows = new Map<string, Map<string, Row>>();

  for (const lane of driver.world().lanes.values())
    if (actorKey(lane.actor) === actorKey(actor)) {
      const byKey = rows.get(lane.operation) ?? new Map<string, Row>();
      byKey.set(lane.keyText, rowOf(lane));
      rows.set(lane.operation, byKey);
    }

  return rows;
};

// RETURN_TYPE: an Option of the snapshot: none when the identity has no incarnation and no record.
export const snapshotOf = (driver: Driver, actor: ActorId): Option.Option<Snapshot> => {
  const world = driver.world();
  const key = actorKey(actor);
  const live = world.incarnations.get(key) ?? world.records.get(key);

  return Option.map(Option.fromUndefinedOr(live), (x) => ({
    state: x.state,
    memory: x.memory,
    operations: operationsOf(driver, actor),
  }));
};

/**
 * The Runtime's construction options (Runtime O2).
 */
export type RuntimeConfig = {
  readonly app: App;
  // oxlint-disable-next-line lint-bomb/no-explicit-any -- the setup's services Layer provides whatever the contracts list; checked by type at runtimeSetup
  readonly services?: Layer.Layer<any>;
  readonly scope?: string;
  readonly persistence?: { readonly captureMs?: number };
};

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
    // Inspection O3: a callback that throws detaches only itself; sinks never change a step.
    sink: (batch) => {
      for (const e of batch)
        for (const sink of sinks)
          if (Result.isFailure(Result.try({ try: () => sink(e), catch: () => sink })))
            sinks.delete(sink);
    },
  });

  // Actors R3, I4: storage is read and validated before any app service is acquired.
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

    driver.input(Input.Boot({ stored }));
    open = true;
  });

  // Actors R2, I3: the first call runs the bootstrap once; every caller shares its Exit. The
  // bootstrap is uninterruptible, so interrupting the first caller delays its own interrupt
  // until the bootstrap ends (a stated limit: R2 asks that only that wait be interrupted).
  const ready = () =>
    Effect.suspend(() => {
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

  const runtime: Runtime = {
    ready,
    ensureActor: (ref) => {
      // Actors R4, I5: before ready succeeds, no handle exists.
      if (!open)
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the public ensureActor's contract: before ready it rejects RuntimeNotReady (Actors R4)
        throw new FlowError({
          code: "RuntimeNotReady",
          problems: [`ensureActor ${ref.name} before ready()`],
        });

      const actor = actorOf(ref);
      driver.input(Input.Ensure({ actor, use: Option.none(), existing: false }));

      return {
        ref,
        send: (event) => {
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
    dispose: () =>
      Effect.suspend(() => {
        driver.close();

        return Scope.close(scope, Exit.void);
      }),
    [InspectorId]: (sink) => {
      sinks.add(sink);

      return () => void sinks.delete(sink);
    },
  };

  return { runtime, driver };
};

/**
 * Sets up a Runtime over an app (Runtime O2): `construct()` is synchronous and inert.
 *
 * **When to use**
 *
 * Once per host. `construct()` builds the Runtime; `ready()` starts it.
 */
// RETURN_TYPE: the exported RuntimeSetup contract.
export const runtimeSetup = (config: {
  readonly app: App;
  // oxlint-disable-next-line lint-bomb/no-explicit-any -- the services Layer provides whatever the contracts list
  readonly services?: Layer.Layer<any>;
  readonly scope?: string;
  readonly persistence?: { readonly captureMs?: number };
}): RuntimeSetup => ({ construct: () => buildRuntime(config, browserPlatform()).runtime });
