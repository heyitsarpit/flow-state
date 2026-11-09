/// <reference types="node" />
import { Context, Data, Effect, Option, Predicate, Schema } from "effect";
import { join } from "node:path";
import {
  type ActorRef,
  type Boot,
  type Channel,
  type EvidenceKind,
  Observation,
  type Port,
  type Runtime,
  Snapshot,
} from "../port.ts";
import type { World } from "../world/world.ts";

const PrototypeRow = Schema.Struct({
  pending: Schema.Boolean,
  uncertain: Schema.Boolean,
  waiting: Schema.Boolean,
  retryCount: Schema.Number,
});

const decodeRow = Schema.decodeUnknownOption(PrototypeRow);

type PrototypeInstance = {
  readonly attach: (
    actor: string,
    machine: string,
    input: unknown,
    owner: string,
    existing: boolean,
  ) => void;
  readonly send: (
    actor: string,
    event: { readonly tag: string; readonly payload: unknown },
  ) => void;
  readonly dispose: (actor: string) => void;
  readonly state: (actor: string) => unknown;
  readonly memory: (actor: string) => unknown;
  readonly row: (actor: string, op: string, key: unknown) => unknown;
  readonly pending: () => boolean;
};

type Report = Readonly<Record<string, unknown>>;

type PrototypeHost = {
  readonly now: () => number;
  readonly id: () => string;
  readonly setTimer: (at: number, fire: () => void) => () => void;
  readonly later: (task: () => void) => void;
  readonly workClock: () => number;
  readonly scheduler: World["lifecycle"]["scheduler"];
  readonly onHidden: (listener: () => void) => void;
  readonly isHidden: () => boolean;
  readonly storage: {
    readonly load: () => ReadonlyMap<string, string>;
    readonly write: World["storage"]["write"];
  };
};

type PrototypePort = {
  readonly boot: (args: {
    readonly host: PrototypeHost;
    readonly compiled: ReadonlyArray<unknown>;
    readonly bounds: { readonly captureMs: number };
    readonly faults: {
      readonly moduleThrows: Map<string, number>;
      readonly moduleThrowsAfter: Map<string, number>;
      readonly coreThrows: number;
    };
    readonly services?: Context.Context<never>;
    readonly onEvidence: (reports: ReadonlyArray<Report>) => void;
    readonly onIssue: (issues: ReadonlyArray<{ readonly code: string }>) => void;
  }) => PrototypeInstance;
};

type PrototypeApi = {
  readonly confirm: (
    input: unknown,
    options: { readonly idempotencyKey: string },
  ) => Effect.Effect<unknown, unknown>;
  readonly placeOrder: (
    input: unknown,
    options: { readonly idempotencyKey: string },
  ) => Effect.Effect<unknown, unknown>;
  readonly voidAuthorization: (
    input: unknown,
    options: { readonly idempotencyKey: string },
  ) => Effect.Effect<unknown, unknown>;
  readonly intent: (input: unknown) => Effect.Effect<unknown, unknown>;
  readonly orderFor: (input: unknown) => Effect.Effect<unknown, unknown>;
  readonly page: () => number;
};

type PrototypeFixture = {
  readonly make: (api: PrototypeApi) => unknown;
  readonly services?: (api: PrototypeApi) => Context.Context<never>;
};

/**
 * The prototype runtime or one of its fixtures could not be loaded.
 */
export class PrototypeLoadFailed extends Data.TaggedError("PrototypeLoadFailed")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

const FIXTURES = [{ name: "pay", file: "typed/pay.ts", exported: "payFixture" }] as const;

const EVIDENCE = ["Superseded", "Released", "InFlight", "NothingToResend"] as const;

const actorKey = (actor: ActorRef) =>
  `${actor.machine}/${actor.id.replaceAll("%", "%25").replaceAll("/", "%2F").replaceAll("|", "%7C")}`;

const actorRef = (key: string) => {
  const at = key.lastIndexOf("/");

  return { machine: key.slice(0, at), id: decodeURIComponent(key.slice(at + 1)) };
};

const text = (report: Report, field: string) => {
  const value = report[field];

  return Predicate.isString(value) ? value : "";
};

const attemptOf = (report: Report) => {
  const value = text(report, "attempt");

  return value === "" ? Option.none() : Option.some(value);
};

// RETURN_TYPE: a type guard; inference cannot produce one.
const isChannel = (value: string): value is Channel =>
  value === "success" || value === "failure" || value === "unknown";

// RETURN_TYPE: a type guard; inference cannot produce one.
const isEvidence = (value: string): value is EvidenceKind => EVIDENCE.some((k) => k === value);

// RETURN_TYPE: each branch builds one variant; the union keeps them one Observation.
const observationOf = (report: Report): Option.Option<Observation> => {
  const kind = text(report, "kind");
  const operation = text(report, "op");
  const channel = text(report, "channel");

  if (kind === "turn")
    return Option.some(
      Observation.Turn({
        actor: actorRef(text(report, "actor")),
        event: text(report, "event"),
        from: text(report, "from"),
        to: text(report, "to"),
      }),
    );

  if (kind === "mint")
    return Option.some(Observation.Minted({ operation, attempt: text(report, "attempt") }));

  if (kind === "invoked")
    return Option.some(Observation.Sent({ operation, attempt: text(report, "attempt") }));

  if (kind === "ending" && isChannel(channel))
    return Option.some(
      Observation.Ended({
        operation,
        attempt: attemptOf(report),
        channel,
        reason: text(report, "reason"),
      }),
    );

  if (kind === "delivered")
    return Option.some(
      Observation.Delivered({
        operation,
        attempt: attemptOf(report),
        event: text(report, "event"),
      }),
    );

  if (isEvidence(kind))
    return Option.some(Observation.Evidence({ kind, operation, attempt: attemptOf(report) }));

  return Option.none();
};

// RETURN_TYPE: the prototype's Host contract, which its boot takes.
const hostOf = (world: World): PrototypeHost => {
  const seed = world.lifecycle.sessionSeed();
  let minted = 0;

  return {
    now: world.clock.now,
    id: () => {
      minted += 1;

      return `att-${seed}-${minted}`;
    },
    setTimer: world.clock.arm,
    later: world.lifecycle.later,
    workClock: world.clock.work,
    scheduler: world.lifecycle.scheduler,
    onHidden: world.lifecycle.onHidden,
    isHidden: world.lifecycle.hidden,
    storage: { load: world.storage.load, write: world.storage.write },
  };
};

// RETURN_TYPE: the prototype fixtures' Api contract, which their services take.
const apiOf = (world: World): PrototypeApi => {
  const write = (op: string) => (input: unknown, options: { readonly idempotencyKey: string }) =>
    world.network.request(op, input, Option.some(options.idempotencyKey));

  const read = (op: string) => (input: unknown) => world.network.request(op, input, Option.none());

  return {
    confirm: write("pay"),
    placeOrder: write("place"),
    voidAuthorization: write("void"),
    intent: read("intent"),
    orderFor: read("order"),
    page: world.lifecycle.page,
  };
};

// RETURN_TYPE: the Port's Runtime contract.
const runtimeOf = (instance: PrototypeInstance): Runtime => ({
  ensure: (actor, input) =>
    instance.attach(actorKey(actor), actor.machine, Option.getOrUndefined(input), "story", false),
  ensureExisting: (actor) =>
    instance.attach(actorKey(actor), actor.machine, undefined, "story", true),
  send: (actor, event, payload) => instance.send(actorKey(actor), { tag: event, payload }),
  dispose: (actor) => instance.dispose(actorKey(actor)),
  snapshot: (actor) => {
    const key = actorKey(actor);
    const state = instance.state(key);

    return Predicate.isString(state)
      ? Snapshot.Live({ state, memory: instance.memory(key) })
      : Snapshot.Absent();
  },
  row: (actor, operation, key) => decodeRow(instance.row(actorKey(actor), operation, key)),
  pending: instance.pending,
});

const load = (path: string) =>
  // FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: the prototype is TypeScript loaded by path at run time (an edited copy under falsify); a dynamic import is the only way in.
  Effect.tryPromise({
    // RETURN_TYPE: a module namespace; each export is read by name below.
    try: (): Promise<Readonly<Record<string, unknown>>> => import(path),
    catch: (cause) => new PrototypeLoadFailed({ path, cause }),
  });

const exported = <A>(module: Readonly<Record<string, unknown>>, name: string, path: string) =>
  Predicate.hasProperty(module, name) && Predicate.isObject(module[name])
    ? // SAFETY: trusted prototype code; its export shapes are pinned by prototypes/conformance/harness.ts.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a dynamic import has no static type to narrow from
      Effect.succeed(module[name] as A)
    : Effect.fail(new PrototypeLoadFailed({ path, cause: `no export ${name}` }));

/**
 * Loads the prototype runtime in `runtimeDir` and returns a `Port` over it.
 *
 * **When to use**
 *
 * The runner calls this once per process with `--runtime`; falsify passes an edited copy.
 *
 * **Details**
 *
 * - The runtime is `<runtimeDir>/adapter.ts`; the fixtures are the prototype's typed fixtures in
 *   `<runtimeDir>/../conformance/typed/`, wired to the suite's fake network.
 * - The prototype's evidence is translated into the Port's observations; its other reports are
 *   dropped.
 *
 * **Gotchas**
 *
 * - The prototype mints Attempt ids from the host: `att-<sessionSeed>-<n>`, unique per page.
 */
export const loadPrototype = Effect.fn("loadPrototype")(function* (runtimeDir: string) {
  const adapterPath = join(runtimeDir, "adapter.ts");
  const runtime = yield* exported<PrototypePort>(yield* load(adapterPath), "port", adapterPath);

  const fixtures = yield* Effect.forEach(
    FIXTURES,
    (where) => {
      const path = join(runtimeDir, "..", "conformance", where.file);

      return load(path).pipe(
        Effect.flatMap((module) => exported<PrototypeFixture>(module, where.exported, path)),
        Effect.map((fixture) => [where.name, fixture] as const),
      );
    },
    { concurrency: 1 },
  );

  const byName = new Map<string, PrototypeFixture>(fixtures);

  const port: Port = {
    name: `prototype ${runtimeDir}`,
    boot: (boot: Boot) => {
      const api = apiOf(boot.world);

      const chosen = boot.fixtures.flatMap((name) => {
        const fixture = byName.get(name);

        return fixture === undefined ? [] : [fixture];
      });

      const contexts = chosen.flatMap((f) => (f.services === undefined ? [] : [f.services(api)]));
      const services = contexts.reduce((a, b) => Context.merge(a, b), Context.empty());

      const instance = runtime.boot({
        host: hostOf(boot.world),
        compiled: chosen.map((f) => f.make(api)),
        bounds: { captureMs: boot.captureMs },
        faults: { moduleThrows: new Map(), moduleThrowsAfter: new Map(), coreThrows: 0 },
        services,
        onEvidence: (reports) => {
          for (const report of reports) Option.map(observationOf(report), boot.observe);
        },
        onIssue: (issues) => {
          for (const issue of issues) boot.observe(Observation.Issue({ code: issue.code }));
        },
      });

      return runtimeOf(instance);
    },
  };

  return port;
});
