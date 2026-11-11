import { Context, Effect, Exit, Layer, Option, Predicate, Scheduler, Schema, Scope } from "effect";
import type { Values } from "../core/compiled.ts";
import type { Evidence } from "../core/evidence.ts";
import { rowOf, type Row } from "../core/rows.ts";
import { Input } from "../core/step.ts";
import { type ActorId, actorKey, type Use } from "../core/world.ts";
import type { AnyDefinition, Envelope, Machine, Operations } from "../definition.ts";
import { FlowError } from "../error.ts";
import { makeDriver, type Driver } from "./driver.ts";
import type { Host } from "./host.ts";

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

const Internal = Symbol.for("flow-state/runtime-internal");

type Internals = {
  readonly driver: Driver;
  readonly sinks: Set<(evidence: Evidence) => void>;
  readonly machines: ReadonlyMap<string, Machine>;
};

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
  readonly [Internal]: Internals;
};

/**
 * What a Runtime is set up with (Runtime O2).
 */
export type RuntimeSetup = {
  readonly construct: () => Runtime;
};

/**
 * A fresh 32-bit seed per boot from the platform's entropy, so two tabs never share one
 * (WriteLanes R5, I28).
 */
const entropy = () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;

// RETURN_TYPE: the Host contract.
const realHost = (): Host => ({
  now: () => Date.now(),
  monotonic: () => performance.now(),
  arm: (at, fire) => {
    const handle = setTimeout(fire, Math.max(0, at - Date.now()));

    return () => clearTimeout(handle);
  },
  later: (task) => void setTimeout(task, 0),
  scheduler: new Scheduler.MixedScheduler(),
  hidden: () => false,
  onHidden: () => undefined,
  store: Option.none(),
  sessionSeed: entropy(),
});

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
 * Builds a Runtime over a host (the internal seam `runtimeSetup` and the test host share).
 */
// RETURN_TYPE: the exported Runtime contract.
export const constructOn = (
  config: {
    readonly app: App;
    // oxlint-disable-next-line lint-bomb/no-explicit-any -- the setup's services Layer provides whatever the contracts list; checked by type at runtimeSetup
    readonly services?: Layer.Layer<any>;
    readonly scope?: string;
    readonly persistence?: { readonly captureMs?: number };
  },
  host: Host,
): Runtime => {
  const machines = new Map(Object.values(config.app.machines).map((m) => [m.compiled.id, m]));
  const sinks = new Set<(evidence: Evidence) => void>();
  let scope = Option.none<Scope.Closeable>();
  let services = Context.empty();

  const persistence =
    config.persistence !== undefined && config.scope !== undefined && Option.isSome(host.store);

  const driver = makeDriver({
    machines: new Map([...machines].map(([id, m]) => [id, m.compiled])),
    host,
    persistence,
    captureMs: config.persistence?.captureMs ?? 5000,
    get services() {
      return services;
    },
    sink: (batch) => {
      for (const e of batch) for (const sink of sinks) sink(e);
    },
  });

  // FLOW_STATE_ALLOW_UNKNOWN: stored values are JSON text, parsed here and decoded by the core.
  const parsed = (text: string) =>
    Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json))(text);

  const ready = () =>
    Effect.gen(function* () {
      if (config.services !== undefined) {
        // oxlint-disable-next-line lint-bomb/no-unmanaged-effect-scope -- the Runtime owns its services' scope for its whole life; dispose() closes it
        const owned = yield* Scope.make();
        scope = Option.some(owned);
        services = yield* Layer.buildWithScope(config.services, owned).pipe(
          Effect.mapError(
            (cause) => new FlowError({ code: "ServiceFailed", problems: [String(cause)] }),
          ),
        );
      }

      const stored = new Map(
        Option.match(persistence ? host.store : Option.none(), {
          onNone: () => [],
          onSome: (store) =>
            [...store.load()].flatMap(([k, v]) =>
              Option.toArray(Option.map(parsed(v), (x) => [k, x] as const)),
            ),
        }),
      );

      driver.input(Input.Boot({ stored }));
    });

  return {
    ready,
    ensureActor: (ref) => {
      const actor = { machine: ref.machine.compiled.id, name: ref.name };
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
      driver.input(
        Input.DisposeActor({ actor: { machine: ref.machine.compiled.id, name: ref.name } }),
      );
    },
    dispose: () =>
      Effect.suspend(() => {
        driver.stop();

        return Option.match(scope, {
          onNone: () => Effect.void,
          onSome: (s) => Scope.close(s, Exit.void),
        });
      }),
    [Internal]: { driver, sinks, machines },
  };
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
}): RuntimeSetup => ({ construct: () => constructOn(config, realHost()) });

/**
 * A Runtime's internals, for the internal routes (`inspect`, the test host).
 */
export const internalsOf = (runtime: Runtime) => runtime[Internal];

/**
 * Attaches or ends one use of an identity (Actors R7), as the snapshots stream and React hooks do.
 */
export const attachUse = (runtime: Runtime, actor: ActorId, use: Use, existing: boolean) =>
  runtime[Internal].driver.input(Input.Ensure({ actor, use: Option.some(use), existing }));

/**
 * Ends one use of an identity.
 */
export const detachUse = (runtime: Runtime, actor: ActorId, use: Use) =>
  runtime[Internal].driver.input(Input.Release({ actor, use }));

/**
 * Whether a value is a Runtime.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a narrowing predicate over any value.
// RETURN_TYPE: a type guard over any value.
export const isRuntime = (value: unknown): value is Runtime =>
  Predicate.hasProperty(value, Internal);
