/// <reference types="node" />
import { Context, Data, Effect, Option, Predicate } from "effect";
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

type PrototypeRow = {
  readonly pending: boolean;
  readonly uncertain: boolean;
  readonly waiting: boolean;
  readonly retryCount: number;
};

type PrototypeInstance = {
  readonly ensure: (actor: string, machine: string, input: unknown) => void;
  readonly attach?: (
    actor: string,
    machine: string,
    input: unknown,
    owner: string,
    existing?: boolean,
  ) => void;
  readonly send: (
    actor: string,
    event: { readonly tag: string; readonly payload: unknown },
  ) => void;
  readonly dispose: (actor: string) => void;
  readonly state: (actor: string) => string | undefined;
  readonly memory: (actor: string) => unknown;
  readonly row: (actor: string, op: string, key: unknown) => PrototypeRow | undefined;
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
  readonly call: (
    op: string,
    input: unknown,
    options?: { readonly idempotencyKey?: string },
  ) => Effect.Effect<unknown, unknown>;
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

const FIXTURES: Readonly<Record<string, { readonly file: string; readonly name: string }>> = {
  pay: { file: "typed/pay.ts", name: "payFixture" },
};

const EVIDENCE: ReadonlyArray<EvidenceKind> = [
  "Superseded",
  "Released",
  "InFlight",
  "NothingToResend",
];

const actorKey = (actor: ActorRef) =>
  `${actor.machine}/${actor.id.replaceAll("%", "%25").replaceAll("/", "%2F").replaceAll("|", "%7C")}`;

const actorRef = (key: string): ActorRef => {
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

const isChannel = (value: string): value is Channel =>
  value === "success" || value === "failure" || value === "unknown";

const isEvidence = (value: string): value is EvidenceKind => EVIDENCE.some((k) => k === value);

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

const apiOf = (world: World): PrototypeApi => {
  const write = (op: string) => (input: unknown, options: { readonly idempotencyKey: string }) =>
    world.network.request(op, input, Option.some(options.idempotencyKey));

  const read = (op: string) => (input: unknown) => world.network.request(op, input, Option.none());

  return {
    call: (op, input, options) =>
      world.network.request(op, input, Option.fromUndefinedOr(options?.idempotencyKey)),
    confirm: write("pay"),
    placeOrder: write("place"),
    voidAuthorization: write("void"),
    intent: read("intent"),
    orderFor: read("order"),
    page: world.lifecycle.page,
  };
};

const runtimeOf = (instance: PrototypeInstance): Runtime => ({
  ensure: (actor, input) => {
    const key = actorKey(actor);
    const given = Option.getOrUndefined(input);

    if (instance.attach === undefined) instance.ensure(key, actor.machine, given);
    else instance.attach(key, actor.machine, given, "story");
  },
  ensureExisting: (actor) =>
    instance.attach?.(actorKey(actor), actor.machine, undefined, "story", true),
  send: (actor, event, payload) => instance.send(actorKey(actor), { tag: event, payload }),
  dispose: (actor) => instance.dispose(actorKey(actor)),
  snapshot: (actor): Snapshot => {
    const key = actorKey(actor);
    const state = instance.state(key);

    return state === undefined
      ? Snapshot.Absent()
      : Snapshot.Live({ state, memory: instance.memory(key) });
  },
  row: (actor, operation, key) =>
    Option.fromUndefinedOr(instance.row(actorKey(actor), operation, key)),
  pending: instance.pending,
});

const load = (path: string) =>
  Effect.tryPromise({
    // SAFETY: a module's namespace object; each use below reads one named export and checks its shape.
    try: (): Promise<Readonly<Record<string, unknown>>> => import(path),
    catch: (cause) => new PrototypeLoadFailed({ path, cause }),
  });

const exported = <A>(module: Readonly<Record<string, unknown>>, name: string, path: string) =>
  Predicate.hasProperty(module, name) && Predicate.isObject(module[name])
    ? // SAFETY: trusted prototype code; the export's shape is pinned by prototypes/conformance/harness.ts.
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
    Object.entries(FIXTURES),
    ([name, where]) => {
      const path = join(runtimeDir, "..", "conformance", where.file);

      return load(path).pipe(
        Effect.flatMap((module) => exported<PrototypeFixture>(module, where.name, path)),
        Effect.map((fixture) => [name, fixture] as const),
      );
    },
    { concurrency: 1 },
  );

  const byName = new Map(fixtures);

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
