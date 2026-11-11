/// <reference types="node" />
import { Context, Data, Effect, Option, Predicate, Result, type Scheduler, Schema } from "effect";
import { join } from "node:path";
import {
  type ActorRef,
  type Json,
  Observation,
  type Port,
  type Runtime,
  Snapshot,
  Unreadable,
} from "../port.ts";
import { makeNetwork, type Network } from "../world/network.ts";
import { makePage, type Page } from "../world/page.ts";
import { type Purpose, Write } from "../world/storage.ts";
import { actorRef, observationsOf } from "./prototype-observations.ts";

declare const CompiledBrand: unique symbol;

/**
 * A prototype fixture's compiled machine: data the adapter passes from the fixture to the
 * runtime's boot and never reads.
 */
type Compiled = { readonly [CompiledBrand]: "Compiled" };

type PrototypeEvent =
  | { readonly tag: string; readonly payload: Json }
  | { readonly tag: string; readonly payload: Json; readonly to: ReadonlyArray<string> };

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
  readonly send: (actor: string, event: PrototypeEvent) => void;
  readonly dispose: (actor: string) => void;
  readonly forget: (actor: string) => void;
  readonly disposeRuntime: () => void;
  readonly state: (actor: string) => unknown;
  readonly memory: (actor: string) => unknown;
  readonly row: (actor: string, op: string, key: Json) => unknown;
  readonly record: (ref: string) => unknown;
  readonly pending: () => boolean;
};

const PrototypeWrite = Schema.Struct({
  key: Schema.String,
  value: Schema.UndefinedOr(Schema.String),
});

const PrototypeIssue = Schema.Struct({
  code: Schema.String,
  ending: Schema.OptionFromOptionalKey(
    Schema.Struct({
      op: Schema.String,
      attempt: Schema.OptionFromOptionalKey(Schema.String),
      actor: Schema.String,
    }),
  ),
});

// FLOW_STATE_ALLOW_UNKNOWN: the prototype's issues are untyped; each is decoded here, once.
const issueOf = (raw: unknown) =>
  Result.gen(function* () {
    const issue = yield* Result.mapError(
      Schema.decodeUnknownResult(PrototypeIssue)(raw),
      (why) => new Unreadable({ report: "issue", issue: String(why) }),
    );

    const ending = Option.isNone(issue.ending)
      ? Option.none()
      : Option.some({
          operation: issue.ending.value.op,
          attempt: issue.ending.value.attempt,
          actor: yield* actorRef(issue.ending.value.actor),
        });

    return Observation.Issue({ code: issue.code, ending });
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
      acknowledges: ReadonlyArray<string>,
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
    // FLOW_STATE_ALLOW_UNKNOWN: the prototype's issues are untyped; `issueOf` decodes each.
    readonly onIssue: (issues: ReadonlyArray<unknown>) => void;
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
  { name: "rel", file: "typed/phase1h.ts", exported: "p1RelFixture", made: "call" },
  { name: "keyed", file: "typed/round15b.ts", exported: "r15KeyedFixture", made: "call" },
  { name: "held", file: "typed/round15b.ts", exported: "r15HeldFixture", made: "call" },
  { name: "stamp", file: "typed/round13.ts", exported: "keyStampFixture", made: "release" },
  { name: "issues", file: "typed/issues.ts", exported: "issuesFixture", made: "value" },
  { name: "latequeue", file: "typed/latequeue.ts", exported: "lateQueueFixture", made: "call" },
  { name: "cancel", file: "typed/round15.ts", exported: "r15SwitchFixture", made: "call" },
] as const;

const actorKey = (actor: ActorRef) =>
  `${actor.machine}/${actor.id.replaceAll("%", "%25").replaceAll("/", "%2F").replaceAll("|", "%7C")}`;

const BodyJson = Schema.fromJsonString(Schema.Json);

/**
 * A fixture's request body as the JSON a fetch would send: undefined fields dropped.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a fixture's request body is its own code's value; it is serialised and decoded here, once.
const asJson = (input: unknown) =>
  Effect.orDie(
    Schema.decodeUnknownEffect(BodyJson)(JSON.stringify(input === undefined ? null : input)),
  );

const apiOf = (network: Network, page: Page) => {
  // FLOW_STATE_ALLOW_UNKNOWN: a fixture's request body, decoded by `asJson`.
  const write = (op: string) => (input: unknown, options: { readonly idempotencyKey: string }) =>
    Effect.flatMap(asJson(input), (json) =>
      network.request(op, json, Option.some(options.idempotencyKey)),
    );

  // FLOW_STATE_ALLOW_UNKNOWN: a fixture's request body, decoded by `asJson`.
  const lookup = (op: string) => (input: unknown) =>
    Effect.flatMap(asJson(input), (json) => network.request(op, json, Option.none()));

  return {
    call: (
      op: string,
      // FLOW_STATE_ALLOW_UNKNOWN: a fixture's request body, decoded by `asJson`.
      input: unknown,
      ...options: ReadonlyArray<{ readonly idempotencyKey: string }>
    ) =>
      Effect.flatMap(asJson(input), (json) =>
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
  readonly release: Option.Option<{ v: number }>;
};

const decodeState = Schema.decodeUnknownResult(Schema.String);

// FLOW_STATE_ALLOW_UNKNOWN: the prototype's memory and rows are untyped; each is decoded here, once.
const decodeJson = (report: string, value: unknown) =>
  Result.mapError(
    Schema.decodeUnknownResult(Schema.Json)(value),
    (issue) => new Unreadable({ report, issue: String(issue) }),
  );

// RETURN_TYPE: the Port's Runtime contract types the methods' parameters.
const runtimeOf = (instance: PrototypeInstance): Runtime => ({
  ensure: (actor, input, use) =>
    instance.attach(actorKey(actor), actor.machine, Option.getOrUndefined(input), use, false),
  ensureExisting: (actor, use) =>
    instance.attach(actorKey(actor), actor.machine, undefined, use, true),
  release: (actor, use) => instance.detach(actorKey(actor), use),
  send: (actor, event, payload, part) =>
    instance.send(
      actorKey(actor),
      part.length === 0 ? { tag: event, payload } : { tag: event, payload, to: part },
    ),
  dispose: (actor) => instance.dispose(actorKey(actor)),
  forget: (actor) => instance.forget(actorKey(actor)),
  disposeRuntime: instance.disposeRuntime,
  snapshot: (actor) => {
    const key = actorKey(actor);

    const raw = instance.state(key);

    if (raw === undefined) return Result.succeed(Snapshot.Absent());

    return Result.gen(function* () {
      const state = yield* Result.mapError(
        decodeState(raw),
        (why) => new Unreadable({ report: `snapshot ${key}`, issue: String(why) }),
      );

      const memory = yield* decodeJson(`snapshot ${key}`, instance.memory(key));

      return Snapshot.Live({ state, memory });
    });
  },
  row: (actor, operation, key) =>
    Option.match(Option.fromUndefinedOr(instance.row(actorKey(actor), operation, key)), {
      onNone: () => Result.succeed(Option.none()),
      onSome: (raw) => Result.map(decodeJson(`row ${operation}`, raw), Option.some),
    }),
  entity: (ref) =>
    Option.match(Option.fromUndefinedOr(instance.record(ref)), {
      onNone: () => Result.succeed(Option.none()),
      onSome: (raw) => Result.map(decodeJson(`entity ${ref}`, raw), Option.some),
    }),
  pending: instance.pending,
});

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

/**
 * Imports one prototype module by path; a module that fails to load is `PrototypeLoadFailed`.
 */
export const load = (path: string) =>
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

const fixtureOf = (raw: FixtureExport, release: Option.Option<{ v: number }>) => ({
  make: raw.make,
  release,
  services:
    Predicate.hasProperty(raw, "services") && Predicate.isFunction(raw.services)
      ? // SAFETY: trusted prototype code; a typed fixture's `services` takes the API (prototypes/conformance/harness.ts).
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a dynamic import has no static type to narrow from
        Option.some(raw.services as Services)
      : Option.none<Services>(),
});

const made = (
  module: Namespace,
  name: string,
  path: string,
  release: Option.Option<{ v: number }>,
) => {
  const factory = module[name];

  return Predicate.isFunction(factory)
    ? exported<FixtureExport>(
        { [name]: Option.match(release, { onNone: () => factory(), onSome: (r) => factory(r) }) },
        name,
        path,
      )
    : Effect.fail(new PrototypeLoadFailed({ path, why: `no fixture factory ${name}` }));
};

/**
 * Loads the prototype runtime in `runtimeDir` and its fixtures.
 *
 * **When to use**
 *
 * The runner calls this once per process with `--runtime`; falsify passes an edited copy. Each
 * case then boots {@link prototypePort} over it.
 *
 * **Details**
 *
 * The runtime is `<runtimeDir>/adapter.ts`; the fixtures are the prototype's typed fixtures in
 * `<runtimeDir>/../conformance/typed/`, loaded by path so an edited copy runs its own. A fixture
 * made for several releases (`made: "release"`) is made over a release object the boot sets.
 */
export const loadPrototype = Effect.fn("loadPrototype")(function* (runtimeDir: string) {
  const adapterPath = join(runtimeDir, "adapter.ts");
  const port = yield* exported<PrototypePort>(yield* load(adapterPath), "port", adapterPath);

  const fixtures = yield* Effect.forEach(
    FIXTURES,
    (where) => {
      const path = join(runtimeDir, "..", "conformance", where.file);
      const release = where.made === "release" ? Option.some({ v: 1 }) : Option.none();

      return load(path).pipe(
        Effect.flatMap((module) =>
          where.made === "value"
            ? exported<FixtureExport>(module, where.exported, path)
            : made(module, where.exported, path, release),
        ),
        Effect.map((fixture) => [where.name, fixtureOf(fixture, release)] as const),
      );
    },
    { concurrency: 1 },
  );

  return { dir: runtimeDir, port, fixtures: new Map(fixtures) } satisfies LoadedPrototype;
});

/**
 * The compiled machine of one loaded prototype fixture, unread: none when the prototype has no
 * fixture of that catalog name.
 *
 * **When to use**
 *
 * The rows' change detector (`fixtures/rows.test.ts`) decodes it to compare a fixture's rows with
 * the alternatives its compiled machine holds. The fixture is made over an idle server.
 */
export const compiledOf = (loaded: LoadedPrototype, name: string) =>
  Option.map(Option.fromUndefinedOr(loaded.fixtures.get(name)), (fixture) =>
    fixture.make(apiOf(makeNetwork(), makePage(0))),
  );

/**
 * The Port over a prototype runtime (the runner's default, or an edited copy of it).
 *
 * **Details**
 *
 * - `boot` boots the prototype over the world's hosts with the case's fixtures, wired to the
 *   suite's server.
 * - The prototype's evidence is translated into the Port's observations; its other reports are
 *   dropped. A report, issue, memory or row that does not decode is an `Unreadable` failure
 *   (`boot.unreadable`, or the read's failure), never a throw into the prototype's sink.
 *
 * **Gotchas**
 *
 * - The prototype mints Attempt ids from the host: `att-<sessionSeed>-<n>`, unique per page.
 * - A boot that names a fixture the prototype has no machine for throws `UnknownFixture`: a
 *   suite defect.
 */
// RETURN_TYPE: the exported Port contract the runner boots every case through.
export const prototypePort = (loaded: LoadedPrototype): Port => ({
  boot: (boot) => {
    const ids = new Map<WeakKey, number>();

    const identify = (value: WeakKey) => {
      const known = ids.get(value);

      if (known !== undefined) return known;

      ids.set(value, ids.size + 1);

      return ids.size;
    };

    const { clock, page, storage, network } = boot.hosts;
    const api = apiOf(network, page);

    const chosen = boot.fixtures.map((name) =>
      Option.getOrThrowWith(
        Option.fromUndefinedOr(loaded.fixtures.get(name)),
        () => new UnknownFixture({ name }),
      ),
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
        write: (writes, purpose, answer, acknowledges) =>
          storage.write(
            writes.map((w) =>
              w.value === undefined
                ? Write.Remove({ key: w.key })
                : Write.Put({ key: w.key, value: w.value }),
            ),
            purpose,
            answer,
            acknowledges,
          ),
      },
    };

    return runtimeOf(
      loaded.port.boot({
        host,
        compiled: chosen.map((f) => {
          if (Option.isSome(f.release))
            // oxlint-disable-next-line eslint/no-param-reassign -- a prototype fixture reads its release from this shared object when it is made; setting it is that fixture's contract
            f.release.value.v = boot.release;

          return f.make(api);
        }),
        bounds: { captureMs: boot.captureMs },
        faults: { moduleThrows: new Map(), moduleThrowsAfter: new Map(), coreThrows: 0 },
        services,
        onEvidence: (batch) => {
          for (const o of observationsOf(batch, identify))
            Result.match(o, { onFailure: boot.unreadable, onSuccess: boot.observe });
        },
        onIssue: (issues) => {
          for (const issue of issues)
            Result.match(issueOf(issue), { onFailure: boot.unreadable, onSuccess: boot.observe });
        },
      }),
    );
  },
});
