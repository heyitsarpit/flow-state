/// <reference types="node" />
import {
  Context,
  Data,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  type Scheduler,
  Schema,
} from "effect";
import { join } from "node:path";
import { type ActorRef, Boot, type Json, Observation, Runtime, Snapshot } from "../port.ts";
import { WorldClock } from "../world/clock.ts";
import { Page } from "../world/page.ts";
import { Network } from "../world/network.ts";
import { type Purpose, Storage, Write } from "../world/storage.ts";
import { observationsOf } from "./prototype-reports.ts";

declare const CompiledBrand: unique symbol;

/**
 * A prototype fixture's compiled machine: data the adapter passes from the fixture to the
 * runtime's boot and never reads.
 */
type Compiled = { readonly [CompiledBrand]: "Compiled" };

type PrototypeInstance = {
  readonly attach: (
    actor: string,
    machine: string,
    // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- the prototype's attach takes undefined for "no input"; the Runtime's Option is unwrapped here, at its boundary
    input: Json | undefined,
    owner: string,
    existing: boolean,
  ) => void;
  readonly detach: (actor: string, owner: string) => void;
  readonly send: (actor: string, event: { readonly tag: string; readonly payload: Json }) => void;
  readonly dispose: (actor: string) => void;
  readonly disposeRuntime: () => void;
  readonly state: (actor: string) => unknown;
  readonly memory: (actor: string) => unknown;
  readonly row: (actor: string, op: string, key: Json) => unknown;
  readonly pending: () => boolean;
};

const PrototypeWrite = Schema.Struct({
  key: Schema.String,
  value: Schema.UndefinedOr(Schema.String),
});

type PrototypeHost = {
  readonly now: () => number;
  readonly id: () => string;
  readonly setTimer: (at: number, fire: () => void) => () => void;
  readonly later: (task: () => void) => void;
  readonly workClock: () => number;
  readonly scheduler: Scheduler.Scheduler;
  readonly onHidden: (listener: () => void) => void;
  readonly isHidden: () => boolean;
  readonly storage: {
    readonly load: () => ReadonlyMap<string, string>;
    readonly write: (
      writes: ReadonlyArray<typeof PrototypeWrite.Type>,
      purpose: Purpose,
      answer: (ok: boolean) => void,
    ) => void;
  };
};

type PrototypePort = {
  readonly boot: (args: {
    readonly host: PrototypeHost;
    readonly compiled: ReadonlyArray<Compiled>;
    readonly bounds: { readonly captureMs: number };
    readonly faults: {
      readonly moduleThrows: Map<string, number>;
      readonly moduleThrowsAfter: Map<string, number>;
      readonly coreThrows: number;
    };
    readonly services: Context.Context<never>;
    readonly onEvidence: (batch: Parameters<typeof observationsOf>[0]) => void;
    readonly onIssue: (issues: ReadonlyArray<{ readonly code: string }>) => void;
  }) => PrototypeInstance;
};

/**
 * The prototype runtime or one of its fixtures could not be loaded.
 */
export class PrototypeLoadFailed extends Data.TaggedError("PrototypeLoadFailed")<{
  readonly path: string;
  readonly why: string;
}> {}

/**
 * A case booted a fixture name the adapter has no machine for: a suite defect.
 */
export class UnknownFixture extends Data.TaggedError("UnknownFixture")<{ readonly name: string }> {}

const FIXTURES = [
  { name: "pay", file: "typed/pay.ts", exported: "payFixture", made: "value" },
  { name: "cells", file: "typed/cells.ts", exported: "cellsFixture", made: "value" },
  { name: "serialize", file: "typed/phase1h.ts", exported: "p1AllFixture", made: "call" },
  { name: "latest", file: "typed/phase1h.ts", exported: "p1LatestFixture", made: "call" },
  { name: "cancel", file: "typed/round15.ts", exported: "r15SwitchFixture", made: "call" },
] as const;

const actorKey = (actor: ActorRef) =>
  `${actor.machine}/${actor.id.replaceAll("%", "%25").replaceAll("/", "%2F").replaceAll("|", "%7C")}`;

const apiOf = (network: typeof Network.Service, page: typeof Page.Service) => {
  const write = (op: string) => (input: unknown, options: { readonly idempotencyKey: string }) =>
    Effect.flatMap(Effect.orDie(Schema.decodeUnknownEffect(Schema.Json)(input)), (json) =>
      network.request(op, json, Option.some(options.idempotencyKey)),
    );

  const lookup = (op: string) => (input: unknown) =>
    Effect.flatMap(Effect.orDie(Schema.decodeUnknownEffect(Schema.Json)(input)), (json) =>
      network.request(op, json, Option.none()),
    );

  return {
    call: (
      op: string,
      input: unknown,
      ...options: ReadonlyArray<{ readonly idempotencyKey: string }>
    ) =>
      Effect.flatMap(Effect.orDie(Schema.decodeUnknownEffect(Schema.Json)(input)), (json) =>
        network.request(
          op,
          json,
          Option.map(Option.fromUndefinedOr(options[0]), (o) => o.idempotencyKey),
        ),
      ),
    confirm: write("pay"),
    placeOrder: write("place"),
    voidAuthorization: write("void"),
    intent: lookup("intent"),
    orderFor: lookup("order"),
    page: page.page,
  };
};

/**
 * The API the prototype fixtures' services take: the suite's server under the fixtures' names.
 */
type PrototypeApi = ReturnType<typeof apiOf>;

/**
 * A prototype fixture as the adapter uses it: its compiled machine over the suite's API, and the
 * services its commits ask for, when it has any.
 */
type PrototypeFixture = {
  readonly make: (api: PrototypeApi) => Compiled;
  readonly services: Option.Option<(api: PrototypeApi) => Context.Context<never>>;
};

const decodeState = Schema.decodeUnknownOption(Schema.String);
const decodeMemory = Schema.decodeUnknownSync(Schema.Json);
const decodeRow = Schema.decodeUnknownSync(Schema.Json);

const runtimeOf = (instance: PrototypeInstance) =>
  Runtime.of({
    ensure: (actor, input, use) =>
      instance.attach(actorKey(actor), actor.machine, Option.getOrUndefined(input), use, false),
    ensureExisting: (actor, use) =>
      instance.attach(actorKey(actor), actor.machine, undefined, use, true),
    release: (actor, use) => instance.detach(actorKey(actor), use),
    send: (actor, event, payload) => instance.send(actorKey(actor), { tag: event, payload }),
    dispose: (actor) => instance.dispose(actorKey(actor)),
    disposeRuntime: instance.disposeRuntime,
    snapshot: (actor) => {
      const key = actorKey(actor);

      return Option.match(decodeState(instance.state(key)), {
        onNone: () => Snapshot.Absent(),
        onSome: (state) => Snapshot.Live({ state, memory: decodeMemory(instance.memory(key)) }),
      });
    },
    row: (actor, operation, key) =>
      Option.map(Option.fromUndefinedOr(instance.row(actorKey(actor), operation, key)), decodeRow),
    pending: instance.pending,
  });

const killed = <A, E>(exit: Exit.Exit<A, E>) => Exit.hasInterrupts(exit);

/**
 * A dynamic import's namespace: each export is read by name and narrowed where it is used.
 */
// oxlint-disable-next-line lint-bomb/no-unsafe-dictionary-type, lint-bomb/no-object-type -- a module namespace has no static type; `exported` narrows each export it reads
type Namespace = Readonly<Record<string, object>>;

/**
 * A loaded prototype: its runtime's boot and its fixtures, by catalog name.
 */
export type LoadedPrototype = {
  readonly dir: string;
  readonly port: PrototypePort;
  readonly fixtures: ReadonlyMap<string, PrototypeFixture>;
};

const load = (path: string) =>
  // FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: the prototype is TypeScript loaded by path at run time (an edited copy under falsify); a dynamic import is the only way in.
  Effect.tryPromise({
    // RETURN_TYPE: a module namespace; each export is read by name below.
    try: (): Promise<Namespace> => import(path),
    catch: (cause) => new PrototypeLoadFailed({ path, why: String(cause) }),
  });

const exported = <A>(module: Namespace, name: string, path: string) =>
  Predicate.hasProperty(module, name) && Predicate.isObject(module[name])
    ? // SAFETY: trusted prototype code; its export shapes are pinned by prototypes/conformance/harness.ts.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a dynamic import has no static type to narrow from
      Effect.succeed(module[name] as A)
    : Effect.fail(new PrototypeLoadFailed({ path, why: `no export ${name}` }));

/**
 * A prototype fixture export: its `make`, and `services` unless it is a hand fixture.
 */
type FixtureExport = { readonly make: PrototypeFixture["make"] };

type Services = (api: PrototypeApi) => Context.Context<never>;

const fixtureOf = (raw: FixtureExport) => ({
  make: raw.make,
  services:
    Predicate.hasProperty(raw, "services") && Predicate.isFunction(raw.services)
      ? // SAFETY: trusted prototype code; a typed fixture's `services` takes the API (prototypes/conformance/harness.ts).
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a dynamic import has no static type to narrow from
        Option.some(raw.services as Services)
      : Option.none<Services>(),
});

const made = (module: Namespace, name: string, path: string) => {
  const factory = module[name];

  return Predicate.isFunction(factory)
    ? exported<FixtureExport>({ [name]: factory() }, name, path)
    : Effect.fail(new PrototypeLoadFailed({ path, why: `no fixture factory ${name}` }));
};

/**
 * Loads the prototype runtime in `runtimeDir` and its fixtures.
 *
 * **When to use**
 *
 * The runner calls this once per process with `--runtime`; falsify passes an edited copy. Each
 * case then builds {@link PrototypeRuntime}'s Layer over it.
 *
 * **Details**
 *
 * The runtime is `<runtimeDir>/adapter.ts`; the fixtures are the prototype's typed fixtures in
 * `<runtimeDir>/../conformance/typed/`, loaded by path so an edited copy runs its own.
 */
export const loadPrototype = Effect.fn("loadPrototype")(function* (runtimeDir: string) {
  const adapterPath = join(runtimeDir, "adapter.ts");
  const port = yield* exported<PrototypePort>(yield* load(adapterPath), "port", adapterPath);

  const fixtures = yield* Effect.forEach(
    FIXTURES,
    (where) => {
      const path = join(runtimeDir, "..", "conformance", where.file);

      return load(path).pipe(
        Effect.flatMap((module) =>
          where.made === "call"
            ? made(module, where.exported, path)
            : exported<FixtureExport>(module, where.exported, path),
        ),
        Effect.map((fixture) => [where.name, fixtureOf(fixture)] as const),
      );
    },
    { concurrency: 1 },
  );

  return { dir: runtimeDir, port, fixtures: new Map(fixtures) } satisfies LoadedPrototype;
});

/**
 * The Runtime over a prototype runtime (the runner's default, or an edited copy of it).
 *
 * **Details**
 *
 * - Building the Layer boots the prototype over the world's hosts with the case's fixtures, wired
 *   to the suite's server; closing its scope disposes the Runtime, unless the scope was interrupted (a killed page).
 * - The prototype's evidence is translated into the Port's observations; its other reports are
 *   dropped.
 *
 * **Gotchas**
 *
 * - The prototype mints Attempt ids from the host: `att-<sessionSeed>-<n>`, unique per page.
 * - A boot that names a fixture the prototype has no machine for dies with `UnknownFixture`.
 */
export const PrototypeRuntime = {
  layer: (loaded: LoadedPrototype) =>
    Layer.effect(
      Runtime,
      Effect.gen(function* () {
        const boot = yield* Boot;
        const clock = yield* WorldClock;
        const page = yield* Page;
        const storage = yield* Storage;
        const network = yield* Network;
        const api = apiOf(network, page);

        const chosen = yield* Effect.forEach(
          boot.fixtures,
          (name) =>
            Option.match(Option.fromUndefinedOr(loaded.fixtures.get(name)), {
              onNone: () => Effect.die(new UnknownFixture({ name })),
              onSome: Effect.succeed,
            }),
          { concurrency: 1 },
        );

        const services = chosen
          .flatMap((f) => Option.toArray(Option.map(f.services, (of) => of(api))))
          .reduce((a, b) => Context.merge(a, b), Context.empty());

        let minted = 0;

        const host: PrototypeHost = {
          now: clock.now,
          id: () => {
            minted += 1;

            return `att-${boot.sessionSeed}-${minted}`;
          },
          setTimer: clock.arm,
          later: page.later,
          workClock: clock.work,
          scheduler: page.scheduler,
          onHidden: page.onHidden,
          isHidden: page.hidden,
          storage: {
            load: storage.load,
            write: (writes, purpose, answer) =>
              storage.write(
                writes.map((w) =>
                  w.value === undefined
                    ? Write.Remove({ key: w.key })
                    : Write.Put({ key: w.key, value: w.value }),
                ),
                purpose,
                answer,
              ),
          },
        };

        const instance = yield* Effect.acquireRelease(
          Effect.sync(() =>
            loaded.port.boot({
              host,
              compiled: chosen.map((f) => f.make(api)),
              bounds: { captureMs: boot.captureMs },
              faults: { moduleThrows: new Map(), moduleThrowsAfter: new Map(), coreThrows: 0 },
              services,
              onEvidence: (batch) => {
                for (const o of observationsOf(batch)) boot.observe(o);
              },
              onIssue: (issues) => {
                for (const issue of issues) boot.observe(Observation.Issue({ code: issue.code }));
              },
            }),
          ),
          (booted, exit) => (killed(exit) ? Effect.void : Effect.sync(booted.disposeRuntime)),
        );

        return runtimeOf(instance);
      }),
    ),
};
