/// <reference types="node" />
import { Context, Data, Effect, Option, Predicate, Result, Schema } from "effect";
import { join } from "node:path";
import {
  type ActorRef,
  type Boot,
  Channel,
  EvidenceKind,
  Observation,
  type Port,
  type RecordedWhy,
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
  readonly detach: (actor: string, owner: string) => void;
  readonly send: (
    actor: string,
    event: { readonly tag: string; readonly payload: unknown },
  ) => void;
  readonly dispose: (actor: string) => void;
  readonly disposeRuntime: () => void;
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
  readonly call: (
    op: string,
    input: unknown,
    ...options: ReadonlyArray<{ readonly idempotencyKey: string }>
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

/**
 * A report the prototype gave in a shape the adapter cannot read: the runtime broke its own
 * evidence contract, so the case stops.
 */
export class PrototypeReportUnreadable extends Data.TaggedError("PrototypeReportUnreadable")<{
  readonly kind: string;
  readonly issue: string;
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

const actorRef = (key: string) => {
  const at = key.lastIndexOf("/");

  return { machine: key.slice(0, at), id: decodeURIComponent(key.slice(at + 1)) };
};

const attemptOf = (attempt: Option.Option<string>) => Option.filter(attempt, (id) => id !== "");

const OptionalText = Schema.OptionFromOptionalNullOr(Schema.String);

const reports = {
  turn: Schema.Struct({
    actor: Schema.String,
    event: Schema.String,
    from: Schema.String,
    to: Schema.String,
  }),
  mint: Schema.Struct({ op: Schema.String, attempt: Schema.String }),
  invoked: Schema.Struct({ op: Schema.String, attempt: Schema.String }),
  ending: Schema.Struct({
    op: Schema.String,
    attempt: OptionalText,
    channel: Channel,
    reason: Schema.String,
  }),
  delivered: Schema.Struct({ op: Schema.String, attempt: OptionalText, event: OptionalText }),
  evidence: Schema.Struct({ kind: EvidenceKind, op: Schema.String, attempt: OptionalText }),
  onLane: Schema.Struct({ op: Schema.String, attempt: OptionalText }),
  unhandled: Schema.Struct({ event: Schema.String }),
  denied: Schema.Struct({ event: Schema.String, reasons: Schema.Array(Schema.String) }),
};

const RECORDED = new Map<string, RecordedWhy>([
  ["ignored", "ignored"],
  ["evidenceOnly", "evidence"],
  ["KeptLetGo", "letGo"],
  ["ParkedLetGo", "letGo"],
]);

const read = <A>(schema: Schema.Decoder<A>, report: Report, kind: string) =>
  Result.getOrThrowWith(
    Schema.decodeUnknownResult(schema)(report),
    (issue) => new PrototypeReportUnreadable({ kind, issue: String(issue) }),
  );

// RETURN_TYPE: each branch builds one variant; inference keeps a union of Options, not one Option.
const observationOf = (report: Report): Option.Option<Observation> => {
  const kind = report["kind"];

  if (kind === "turn") {
    const r = read(reports.turn, report, kind);

    return Option.some(
      Observation.Turn({ actor: actorRef(r.actor), event: r.event, from: r.from, to: r.to }),
    );
  }

  if (kind === "mint") {
    const r = read(reports.mint, report, kind);

    return Option.some(
      Observation.Minted({ operation: r.op, attempt: r.attempt, actor: Option.none() }),
    );
  }

  if (kind === "invoked") {
    const r = read(reports.invoked, report, kind);

    return Option.some(Observation.Sent({ operation: r.op, attempt: r.attempt }));
  }

  if (kind === "ending") {
    const r = read(reports.ending, report, kind);

    return Option.some(
      Observation.Ended({
        operation: r.op,
        attempt: attemptOf(r.attempt),
        channel: r.channel,
        reason: r.reason,
        actor: Option.none(),
        failure: Option.none(),
      }),
    );
  }

  if (kind === "delivered") {
    const r = read(reports.delivered, report, kind);
    const event = Option.getOrElse(r.event, () => "(unmapped)");

    return Option.some(
      Observation.Delivered({
        operation: r.op,
        attempt: attemptOf(r.attempt),
        event,
        actor: Option.none(),
      }),
    );
  }

  return laneReport(report);
};

// RETURN_TYPE: each branch builds one variant; inference keeps a union of Options, not one Option.
const laneReport = (report: Report): Option.Option<Observation> => {
  const kind = report["kind"];

  if (kind === "Disposed") return Option.some(Observation.RuntimeDisposed());

  if (kind === "Unhandled") {
    const r = read(reports.unhandled, report, kind);

    return Option.some(Observation.Unhandled({ event: r.event }));
  }

  if (kind === "Denied") {
    const r = read(reports.denied, report, kind);

    return Option.some(Observation.Denied({ event: r.event, reasons: r.reasons }));
  }

  if (kind === "parked" || kind === "unparked") {
    const r = read(reports.onLane, report, kind);
    const at = { operation: r.op, attempt: attemptOf(r.attempt) };

    return Option.some(kind === "parked" ? Observation.Parked(at) : Observation.Unparked(at));
  }

  const why = Option.fromUndefinedOr(Predicate.isString(kind) ? RECORDED.get(kind) : undefined);

  if (Option.isSome(why)) {
    const r = read(reports.onLane, report, String(kind));

    return Option.some(
      Observation.Recorded({ operation: r.op, attempt: attemptOf(r.attempt), why: why.value }),
    );
  }

  if (!Schema.is(EvidenceKind)(kind)) return Option.none();
  const r = read(reports.evidence, report, kind);

  return Option.some(
    Observation.Evidence({ kind: r.kind, operation: r.op, attempt: attemptOf(r.attempt) }),
  );
};

// RETURN_TYPE: a spread of one variant stays that variant; the caller needs the union.
const owned = (observed: Observation, actor: Option.Option<ActorRef>): Observation => {
  if (Observation.$is("Minted")(observed) || Observation.$is("Delivered")(observed))
    return { ...observed, actor };

  if (Observation.$is("Ended")(observed) && Option.isNone(observed.attempt))
    return { ...observed, actor };

  return observed;
};

const attributed = (batch: ReadonlyArray<Observation>) => {
  const out: Array<Observation> = [];
  let next = Option.none<ActorRef>();

  for (const observed of [...batch].toReversed()) {
    if (Observation.$is("Turn")(observed)) next = Option.some(observed.actor);
    out.push(owned(observed, next));
  }

  return out.toReversed();
};

// RETURN_TYPE: the prototype's Host contract, which its boot takes.
const hostOf = (world: World, seed: number): PrototypeHost => {
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
    call: (op, input, ...options) =>
      world.network.request(
        op,
        input,
        Option.map(Option.fromUndefinedOr(options[0]), (o) => o.idempotencyKey),
      ),
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

const made = (module: Readonly<Record<string, unknown>>, name: string, path: string) => {
  const factory = module[name];

  return Predicate.isFunction(factory)
    ? exported<PrototypeFixture>({ [name]: factory() }, name, path)
    : Effect.fail(new PrototypeLoadFailed({ path, cause: `no fixture factory ${name}` }));
};

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
        Effect.flatMap((module) =>
          where.made === "call"
            ? made(module, where.exported, path)
            : exported<PrototypeFixture>(module, where.exported, path),
        ),
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

      const chosen = boot.fixtures.map((name) => {
        const fixture = byName.get(name);

        if (fixture === undefined) throw new UnknownFixture({ name });

        return fixture;
      });

      const contexts = chosen.flatMap((f) => (f.services === undefined ? [] : [f.services(api)]));
      const services = contexts.reduce((a, b) => Context.merge(a, b), Context.empty());

      const instance = runtime.boot({
        host: hostOf(boot.world, boot.sessionSeed),
        compiled: chosen.map((f) => f.make(api)),
        bounds: { captureMs: boot.captureMs },
        faults: { moduleThrows: new Map(), moduleThrowsAfter: new Map(), coreThrows: 0 },
        services,
        onEvidence: (given) => {
          for (const observed of attributed(given.flatMap((r) => Option.toArray(observationOf(r)))))
            boot.observe(observed);
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
