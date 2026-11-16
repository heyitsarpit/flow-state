import { Context, Deferred, Effect, Exit, Layer, Option, Predicate, Result, Scope } from "effect";
import type { Values } from "../core/compiled.ts";
import type { Evidence } from "../core/evidence.ts";
import { laneKeyText } from "../core/lane-moves.ts";
import { rowOf, type Row } from "../core/rows.ts";
import { Input } from "../core/step.ts";
import type { Machines } from "../core/tx.ts";
import { actorLifecycleOf, Verdict } from "../core/life.ts";
import { type ActorId, actorKey, type Issue, type World } from "../core/world.ts";
import { inputFieldsOf, LOCAL_PREFIX, nameOfValue } from "../core/identity.ts";
import type { RequirementsOf } from "../contract.ts";
import type { AnyDefinition, Envelope, InputOf, Machine, Operations } from "../definition.ts";
import { type Code, Diagnostic, type FlowError, flowError, flowErrorOf } from "../error.ts";
import type { IssueCode } from "../core/vocabulary.ts";
import { appFindings, malformedOf } from "../core/well-formed.ts";
import { makeDriver, type Driver } from "./driver.ts";
import { browserPlatform } from "./platform/browser.ts";
import { decodeJsonText } from "./json.ts";
import { makeFibers } from "./fibers.ts";
import { Host, type Platform } from "./host.ts";

/**
 * One machine an app runs: the machine, or the machine with the default wiring of its context
 * slots, each to the ref of the actor that provides it.
 */
export type AppEntry =
  | Machine
  | {
      readonly machine: Machine;
      readonly context: Readonly<Record<string, ActorRef>>;
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
// RETURN_TYPE: the App contract runtimeSetup takes, keeping its machines' types.
export const app = <const M extends Readonly<Record<string, AppEntry>>>(config: App<M>): App<M> => {
  const [first, ...rest] = appFindings({
    ...config,
    machines: Object.fromEntries(
      Object.entries(config.machines).map(([key, entry]) => [key, machineOf(entry)]),
    ),
  });

  if (first !== undefined)
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- construction errors throw one FlowError before any work
    throw flowError([first, ...rest]);

  return config;
};

/**
 * A shared actor's name: its machine and either the literal name of a machine with no input, or
 * the value that carries a machine's input fields.
 */
export type ActorRef<D extends AnyDefinition = AnyDefinition> = {
  readonly machine: Machine<D>;
  // FLOW_STATE_ALLOW_UNKNOWN: a value ref's value is the caller's, checked at the boundary that uses it.
  readonly value: unknown;
  readonly context: Readonly<Record<string, ActorRef>>;
};

/**
 * What names an actor of `D`: a value carrying its input fields when it has any, otherwise a
 * literal string that does not start with `~`.
 */
export type RefName<D extends AnyDefinition, N> = [keyof InputOf<D["memory"]>] extends [never]
  ? N extends string
    ? string extends N
      ? never
      : N extends `${typeof LOCAL_PREFIX}${string}`
        ? never
        : N
    : never
  : InputOf<D["memory"]>;

/**
 * Names a shared actor. Inert.
 *
 * **When to use**
 *
 * `actorRef(machine, value)` names a machine with `Flow.input` fields by those fields of `value`;
 * `actorRef(machine, "name")` names a machine with no input by a literal name.
 *
 * **Details**
 *
 * An actor is its machine plus its input: the input fields are encoded with their Schemas, in
 * field-name order, so a reorder or a field beyond the input names the same actor. The value is
 * checked where the ref is used: an ensure, send or dispose throws SchemaValidation naming a
 * field its Schema refuses.
 */
// RETURN_TYPE: the ActorRef keeps its machine's definition type.
export const actorRef = <D extends AnyDefinition, const N>(
  machine: Machine<D>,
  nameOrValue: N & RefName<D, N>,
  // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public word: a ref with no context uses its machine entry's wiring
  options?: { readonly context: Readonly<Record<string, ActorRef>> },
): ActorRef<D> => ({ machine, value: nameOrValue, context: options?.context ?? {} });

/**
 * The identity a ref names, checked: a value's input fields by their Schemas, a literal name by
 * its form. Throws the FlowError a refused ref names.
 */
// RETURN_TYPE: the core's ActorId, which every input that names an actor takes.
export const actorIdOf = (ref: ActorRef): ActorId => {
  const compiled = ref.machine.compiled;

  if (inputFieldsOf(compiled).length === 0) {
    if (Predicate.isString(ref.value) && !ref.value.startsWith(LOCAL_PREFIX))
      return { machine: compiled.id, name: ref.value };

    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a ref's contract: a name a singleton may not have throws before any work
    throw flowError([
      {
        code: "InvalidConfiguration",
        path: [compiled.id, "name"],
        summary: `${compiled.id} has no input, so it is named by a literal string not starting with ${LOCAL_PREFIX}`,
        help: "Name the actor with a literal string, or give the machine Flow.input fields.",
      },
    ]);
  }

  return Result.match(nameOfValue(compiled, ref.value), {
    onSuccess: (name) => ({ machine: compiled.id, name }),
    onFailure: (field) => {
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a ref's contract: an input its Schema refuses throws before any work
      throw flowError([
        {
          code: "SchemaValidation",
          path: [compiled.id, field],
          summary: `the input field ${field} of ${compiled.id} is missing or refused by its Schema`,
          help: `Give ${field} a value its Schema accepts.`,
        },
      ]);
    },
  });
};

/**
 * What a handle shows of an identity: its leaf state, its memory and its write lanes'
 * rows.
 */
export type Snapshot = {
  readonly state: string;
  readonly memory: Values;
  readonly operations: Operations;
  readonly lifecycle: "active" | "disposing" | "disposed";
  readonly issues: ReadonlyArray<Diagnostic>;
  readonly schedules: ReadonlyArray<{ readonly key: string; readonly dueAt: number }>;
};

// A keyed list in key order, as every list of a snapshot is.
const keyed = <A extends { readonly key: string }>(entries: ReadonlyArray<A>) =>
  entries.toSorted((a, b) => Number(a.key > b.key) - Number(a.key < b.key));

// The diagnostic code of an issue: a refused turn (a denial code, not a diagnostic) is the
// configuration it was given, a callback that threw is a Defect.
const DIAGNOSTIC_OF = {
  InvalidTurn: "InvalidConfiguration",
  CallbackDefect: "Defect",
  GuardDefect: "GuardDefect",
  Defect: "Defect",
  StorageFailure: "StorageFailure",
} as const satisfies Record<IssueCode, Code>;

// An open issue as the Diagnostic a snapshot shows: its identity and source in the path, the
// refusal and the callback slot that failed in details.
const issueOf = (actor: ActorId, issue: Issue) =>
  new Diagnostic({
    classification:
      issue.code === "InvalidTurn" || issue.code === "StorageFailure" ? "Failure" : "Defect",
    code: DIAGNOSTIC_OF[issue.code],
    path: [actor.machine, actor.name, issue.source],
    details: { refused: issue.code, slot: Option.getOrNull(issue.slot) },
    summary: `${issue.source} raised ${issue.code}`,
    help: "Fix the callback the slot names; the issue clears when this source next succeeds.",
  });

/**
 * The key under which a handle keeps the Runtime and identity it belongs to.
 */
export const HandleId = "~flow-state/Handle";

/**
 * A handle to an actor: it follows the identity, not the incarnation.
 */
export type Actor<D extends AnyDefinition = AnyDefinition> = {
  readonly machine: Machine<D>;
  readonly send: (event: Envelope) => void;
  readonly getSnapshot: () => Option.Option<Snapshot>;
  readonly [HandleId]: { readonly runtime: Driver; readonly actor: ActorId };
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
 * The key of a setup's configuration, which a Story reads to boot the same setup in its own tab.
 */
export const SetupId = "~flow-state/Setup";

/**
 * A constructed Runtime.
 *
 * **Details**
 *
 * `ready()` runs the one bootstrap: it reads storage before any actor starts. `ensureActor`
 * returns the one shared actor of a ref, creating it from the ref's input or restoring it.
 * `createActor` creates a new local actor from its input: it never persists, no ref names it, and
 * it lives until disposed.
 */
export type Runtime = {
  readonly ready: () => Effect.Effect<void, FlowError>;
  readonly ensureActor: <D extends AnyDefinition>(ref: ActorRef<D>) => Actor<D>;
  readonly createActor: <D extends AnyDefinition>(
    machine: Machine<D>,
    options: { readonly input: InputOf<D["memory"]> },
  ) => Actor<D>;
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
  const live = world.incarnations.get(key);
  const record = world.records.get(key);
  const ended = world.ended.get(key);
  const operations = operationsOf(world, machines, actor);

  if (live !== undefined)
    return Option.some({
      state: live.state,
      memory: live.memory,
      operations,
      lifecycle: actorLifecycleOf(world.life),
      issues: live.issues.map((issue) => issueOf(actor, issue)),
      schedules: keyed(
        [...live.schedules].map(([name, armed]) => ({ key: name, dueAt: armed.dueAt })),
      ),
    });

  if (record !== undefined)
    return Option.some({
      state: record.state,
      memory: record.memory,
      operations,
      lifecycle: "active",
      issues: [],
      schedules: keyed(record.schedules.map((s) => ({ key: s.name, dueAt: s.dueAt }))),
    });

  return Option.map(Option.fromUndefinedOr(ended), (x) => ({
    state: x.state,
    memory: x.memory,
    operations,
    lifecycle: "disposed",
    issues: [],
    schedules: [],
  }));
};

// An outside snapshot omits the machine's Flow.private fields; Stories and Inspection see them.
const outside = (machine: Machine, snapshot: Snapshot) => {
  const hidden = machine.compiled.fields.filter((f) => f.private).map((f) => f.name);

  return hidden.length === 0
    ? snapshot
    : {
        ...snapshot,
        memory: Object.fromEntries(
          Object.entries(snapshot.memory).filter(([name]) => !hidden.includes(name)),
        ),
      };
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
export const buildRuntime = (
  config: RuntimeConfig,
  platform: Platform,
  admit: (evidence: ReadonlyArray<Evidence>) => void,
) => {
  const entries = Object.values(config.app.machines);

  const refused = entries.flatMap((e) => Option.toArray(malformedOf(machineOf(e).compiled)));

  const [malformed, ...others] = refused;

  if (malformed !== undefined)
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a Runtime refuses a malformed Compiled before any actor
    throw flowError([malformed, ...others]);

  const machines = new Map(entries.map((e) => [machineOf(e).compiled.id, machineOf(e)]));

  // Each machine entry's default wiring: the ref of each context slot's provider.
  const defaults = new Map(
    entries.map((e) => [machineOf(e).compiled.id, "machine" in e ? e.context : {}]),
  );

  const contextError = (code: Code, path: ReadonlyArray<string>, summary: string, help: string) =>
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- admission's contract: a context graph it refuses throws before any work
    {
      throw flowError([{ code, path, summary, help }]);
    };

  // The providers a consumer's slots bind to: its entry's wiring with the ref's overrides, each
  // slot wired to an actor of the machine it declares, and no provider reached again on the way
  // up. Refused at admission, before any work.
  const wiringOf = (
    compiled: Compiled,
    override: Readonly<Record<string, ActorRef>>,
    path: ReadonlyArray<string>,
  ): ReadonlyMap<string, ActorId> => {
    const refs = { ...defaults.get(compiled.id), ...override };
    const wiring = new Map<string, ActorId>();

    for (const [slot, declared] of compiled.context) {
      const ref = refs[slot];

      if (ref === undefined || !machines.has(ref.machine.compiled.id))
        return contextError(
          "MissingContextProvider",
          [compiled.id, "context", slot],
          `no provider is wired for the context slot ${slot} of ${compiled.id}`,
          "Wire the slot in the machine's app entry, or in the ref's context.",
        );

      if (ref.machine.compiled.id !== declared.provider)
        return contextError(
          "InvalidConfiguration",
          [compiled.id, "context", slot],
          `${slot} is provided by ${declared.provider}, not ${ref.machine.compiled.id}`,
          `Wire ${slot} to an actor of ${declared.provider}.`,
        );

      const provider = actorIdOf(ref);
      const key = actorKey(provider);

      if (path.includes(key))
        return contextError(
          "ContextCycle",
          [...path, key],
          `the context of ${compiled.id} reaches ${key} again`,
          "Make context flow one way: no actor may provide, directly or not, to its own provider.",
        );

      wiringOf(ref.machine.compiled, {}, [...path, key]);
      wiring.set(slot, provider);
    }

    return wiring;
  };
  const sinks = new Set<(evidence: Evidence) => void>();
  const host = Context.get(platform, Host);
  // oxlint-disable-next-line lint-bomb/no-unmanaged-effect-scope -- the Runtime owns one Scope for its whole life: its services and every fiber; dispose() closes it
  const scope = Scope.makeUnsafe();
  let services = Context.empty();
  const fibers = makeFibers(scope, () => Context.merge(services, platform));
  const booted = Deferred.makeUnsafe<void, FlowError>();

  const persistence =
    config.persistence !== undefined && config.scope !== undefined && Option.isSome(host.store);

  const driver = makeDriver({
    machines: new Map([...machines].map(([id, m]) => [id, m.compiled])),
    platform,
    fibers,
    persistence,
    captureMs: config.persistence?.captureMs ?? 5000,
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
    flowError([
      code === "RuntimeNotReady"
        ? {
            code,
            path: ["ready"],
            summary: "ready() before boot",
            help: "Await runtime.ready() before using the Runtime.",
          }
        : {
            code,
            path: ["ready"],
            summary: "ready() after dispose()",
            help: "Create a new Runtime after disposal.",
          },
    ]);

  // Storage is read and validated before any app service is acquired; the core's life decides
  // whether the boot it reads still opens the Runtime.
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
        Effect.mapError((cause) =>
          flowErrorOf(
            [
              {
                code: "ServiceFailed",
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
          Verdict.$match(driver.verdict(Input.Boot({ stored })), {
            Reject: ({ code }) => rejected(code),
            Run: () => failed,
            Drop: () => failed,
          }),
        ),
      );

    const opened = Input.Boot({ stored });
    const verdict = driver.verdict(opened);
    driver.input(opened);

    if (Verdict.$is("Reject")(verdict)) return yield* Effect.fail(rejected(verdict.code));
  });

  // The first call runs the bootstrap once; every caller shares its Exit. The bootstrap is
  // uninterruptible, so interrupting the first caller delays its own interrupt until the
  // bootstrap ends (a stated limit: only that wait should be interrupted).
  const ready = () =>
    Effect.suspend(() => {
      const start = Input.Start();

      return Verdict.$match(driver.verdict(start), {
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

  // Local actors are numbered by the Runtime that creates them; they never persist or outlive it.
  let locals = 0;

  // RETURN_TYPE: the Actor contract keeps its machine's definition type.
  const handleOf = <D extends AnyDefinition>(machine: Machine<D>, actor: ActorId): Actor<D> => ({
    machine,
    send: (event) => {
      const { _tag: tag, ...payload } = event;
      driver.send(actor, tag, payload);
    },
    getSnapshot: () => Option.map(snapshotOf(driver, actor), (x) => outside(machine, x)),
    [HandleId]: { runtime: driver, actor },
  });

  // A handle names its own Runtime's identity; another Runtime's handle is refused.
  const identityOf = (target: Actor | ActorRef) => {
    if (!(HandleId in target)) return actorIdOf(target);

    if (target[HandleId].runtime === driver) return target[HandleId].actor;

    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a handle's contract: another Runtime's handle throws before any work
    throw flowError([
      {
        code: "ForeignActorRef",
        path: [target[HandleId].actor.machine, target[HandleId].actor.name],
        summary: "the handle belongs to another Runtime",
        help: "Use a handle from this Runtime, or name the actor with its ref.",
      },
    ]);
  };

  const runtime: Runtime = {
    ready,
    // Before ready succeeds, no handle exists: the core's life rejects the ensure.
    ensureActor: (ref) => {
      const actor = actorIdOf(ref);
      driver.offer(
        Input.Ensure({ actor, use: Option.none(), existing: false }),
        `ensureActor ${actor.name}`,
      );

      return handleOf(ref.machine, actor);
    },
    createActor: (machine, options) => {
      const compiled = machine.compiled;

      // The input is checked by its Schemas before any work, as a value ref's is.
      if (inputFieldsOf(compiled).length > 0)
        actorIdOf({ machine, value: options.input, context: {} });

      const actor = { machine: compiled.id, name: `${LOCAL_PREFIX}${locals + 1}` };
      driver.offer(Input.Create({ actor, input: options.input }), `createActor ${compiled.id}`);
      locals += 1;

      return handleOf(machine, actor);
    },
    disposeActor: (target) => {
      const actor = identityOf(target);
      driver.offer(Input.DisposeActor({ actor }), `disposeActor ${actor.name}`);
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
  construct: () => buildRuntime(config, browserPlatform(), () => undefined).runtime,
  [SetupId]: config,
});
