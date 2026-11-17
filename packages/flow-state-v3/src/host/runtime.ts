import { Context, Deferred, Effect, Exit, Layer, Option, Predicate, Result, Scope } from "effect";
import type { Compiled } from "../core/compiled.ts";
import type { Evidence } from "../core/evidence.ts";
import { dependentsOf, Input } from "../core/step.ts";
import { Verdict } from "../core/life.ts";
import { type ActorId, actorKey, sameActor, type Wiring } from "../core/world.ts";
import { inputFieldsOf, LOCAL_PREFIX, nameOfValue } from "../core/identity.ts";
import type { RequirementsOf } from "../contract.ts";
import type { AnyDefinition, EventOf, InputOf, Machine } from "../definition.ts";
import { type FlowError, flowError, flowErrorOf, lifeRejection, refuse } from "../error.ts";
import { appFindings, malformedOf } from "../core/well-formed.ts";
import { makeDriver, type Driver } from "./driver.ts";
import { browserPlatform } from "./platform/browser.ts";
import { makeFibers } from "./fibers.ts";
import { makeWiring } from "./wiring.ts";
import { outside, type Snapshot, snapshotOf } from "./snapshot.ts";
import { Host, type Platform } from "./host.ts";

export { type Snapshot, snapshotIn, snapshotOf } from "./snapshot.ts";

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
// RETURN_TYPE: the App contract runtimeSetup takes, keeping its machines' types.
export const app = <const M extends Readonly<Record<string, AppEntry>>>(config: App<M>): App<M> => {
  refuse(
    appFindings({
      ...config,
      machines: Object.fromEntries(
        Object.entries(config.machines).map(([key, entry]) => [key, machineOf(entry)]),
      ),
    }),
  );

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
        Option.match(field, {
          onSome: (name) => ({
            code: "SchemaValidation" as const,
            path: [compiled.id, name],
            summary: `the input field ${name} of ${compiled.id} is missing or refused by its Schema`,
            help: `Give ${name} a value its Schema accepts.`,
          }),
          onNone: () => ({
            code: "SchemaValidation" as const,
            path: [compiled.id],
            summary: `the input of ${compiled.id} has no encoded form, so it cannot name an actor`,
            help: "Name the actor by values JSON can hold: no non-finite number, lone surrogate or cycle.",
          }),
        }),
      ]);
    },
  });
};

/**
 * The key under which a handle keeps the Runtime and identity it belongs to.
 */
export const HandleId = "~flow-state/Handle";

/**
 * A handle to an actor: it follows the identity, not the incarnation.
 */
export type Actor<D extends AnyDefinition = AnyDefinition> = {
  readonly machine: Machine<D>;
  // A method, so a handle of one machine reads as a handle of any machine.
  send(event: EventOf<D>): void;
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
 * it lives until disposed. `dispose()` keeps the scope's saved data; `dispose({ forget: true })`
 * deletes every record of the scope and succeeds only once the deletion landed, failing
 * `StorageFailure` when the store refused it.
 */
export type Runtime = {
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
 * Runtime does not carry it).
 */
export const buildRuntime = (
  config: RuntimeConfig,
  platform: Platform,
  admit: (evidence: ReadonlyArray<Evidence>) => void,
) => {
  const entries = Object.values(config.app.machines);

  // A Runtime refuses a malformed Compiled before any actor.
  refuse(entries.flatMap((e) => Option.toArray(verdictOf(machineOf(e).compiled))));

  const machines = new Map(entries.map((e) => [machineOf(e).compiled.id, machineOf(e)]));

  // Each machine entry's default wiring: the ref of each context slot's provider.
  const defaults = new Map(
    entries.map((e) => [machineOf(e).compiled.id, ("machine" in e ? e.context : undefined) ?? {}]),
  );

  const { wiringOf, overridesOf, refused: contextRefused } = makeWiring(machines, defaults);

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
    fibers,
    persistence,
    captureMs: config.persistence?.captureMs ?? 5000,
    // A Runtime a defect stopped closes its Scope: its services and every fiber end.
    halted: () =>
      // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the driver stops synchronously, inside the step that failed; the Scope closes on its own fiber
      void Effect.runFork(Scope.close(scope, Exit.void)),
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
    flowError([lifeRejection(code, "ready", "ready()", "boot")]);

  // Storage is read and validated before any app service is acquired; the core's life decides
  // whether the boot it reads still opens the Runtime.
  const boot = Effect.fn("Runtime.boot")(function* () {
    // A load the store refused boots with nothing and no persistence; the core reports it.
    const stored = yield* Option.match(persistence ? host.store : Option.none(), {
      onNone: () => Effect.succeed(Option.some<ReadonlyMap<string, string>>(new Map())),
      onSome: (store) => store.load.pipe(Effect.option),
    });

    if (config.services !== undefined)
      services = yield* Layer.buildWithScope(config.services, scope).pipe(
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

  const forgetFailed = flowError([
    {
      code: "StorageFailure",
      path: ["dispose", "forget"],
      summary: "the store did not delete the scope's records",
      help: "The saved data may still be there; dispose with forget again once the store answers.",
    },
  ]);

  // A forget removes every record the scope holds in one batch, after the disposal's own writes. It
  // fails with no store call when it cannot know it deleted everything: a write of the disposal
  // still unanswered may land later, and a Runtime that never booted, or whose load failed, never
  // owned what it would delete. A Runtime that never persisted has nothing to forget.
  const forget = Effect.fn("Runtime.forget")(function* () {
    const store = host.store;

    if (!persistence || Option.isNone(store)) return;

    const opened = (yield* Deferred.isDone(booted))
      ? Exit.isSuccess(yield* Effect.exit(Deferred.await(booted)))
      : false;

    if (!opened || !driver.world().persistence || !driver.stored())
      return yield* Effect.fail(forgetFailed);

    yield* store.value.load.pipe(
      Effect.flatMap((saved) =>
        store.value.write(
          [...saved.keys()].map((key) => ({ key, value: Option.none() })),
          "flush",
          [],
        ),
      ),
      Effect.mapError(() => forgetFailed),
    );
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

  // A ref names an identity only of a machine this Runtime's app runs.
  const ownRef = (ref: ActorRef) => {
    if (machines.get(ref.machine.compiled.id) === ref.machine) return actorIdOf(ref);

    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a ref's contract: a machine this app does not run throws before any work
    throw flowError([
      {
        code: "ForeignActorRef",
        path: [ref.machine.compiled.id],
        summary: `${ref.machine.compiled.id} is not a machine of this Runtime's app`,
        help: "Use refs of the machines this Runtime's app lists.",
      },
    ]);
  };

  // A handle names its own Runtime's identity; another Runtime's handle is refused.
  const identityOf = (target: Actor | ActorRef) => {
    if (!(HandleId in target)) return ownRef(target);

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

        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- admission's contract: a refused context throws before any work
        throw contextRefused(
          "ConflictingActorRef",
          [live.machine, live.name],
          `${live.name} is live with other context`,
          "Name one identity with one context: drop the ref's override or use another identity.",
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
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- admission's contract: a refused context throws before any work
        throw contextRefused(
          "BlockedByDependents",
          [actor.machine, actor.name, ...dependents.map(actorKey)],
          `${actor.name} provides context to ${dependents.map(actorKey).join(", ")}`,
          "Dispose its consumers first.",
        );
    },
  };

  const runtime: Runtime = {
    ready,
    // Before ready succeeds, no handle exists: the core's life rejects the ensure.
    ensureActor: (ref) => {
      const actor = ownRef(ref);
      const what = `ensureActor ${actor.name}`;

      const probe = Input.Ensure({
        actor,
        use: Option.none(),
        existing: false,
        wiring: Option.none(),
      });

      // The life decides first; then the context graph is checked, before any work.
      if (!Verdict.$is("Run")(driver.verdict(probe))) driver.offer(probe, what);

      const graph = admission.ensure(actor, overridesOf(ref));
      driver.offer(Input.Ensure({ ...probe, wiring: Option.some(graph) }), what);

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
      admission.dispose(actor);
      driver.offer(Input.DisposeActor({ actor }), `disposeActor ${actor.name}`);
    },
    // The core's disposal ends first: calls settling within its bound are parked, then a forget
    // deletes the scope's records, and the Scope closes every fiber whatever the forget did.
    dispose: (options) =>
      driver.dispose.pipe(
        Effect.andThen(options?.forget === true ? forget() : Effect.void),
        Effect.ensuring(Scope.close(scope, Exit.void)),
      ),
    [InspectorId]: (sink) => {
      sinks.add(sink);

      return () => void sinks.delete(sink);
    },
    [DriverId]: driver,
  };

  return { runtime, driver, admission };
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
