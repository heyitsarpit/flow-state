import { Clock, Context, Duration, Effect, Layer, Option, Result, Scheduler, Schema } from "effect";
import { actorRef, app } from "../../../src/index.ts";
import { attachInspector, Evidence } from "../../../src/host/inspect.ts";
import { Host, StoreRefused, testing } from "../../../src/host/testing.ts";
import { ShopApi } from "../../../fixtures/pay/machine.ts";
import { Server } from "../../../fixtures/part.ts";
import type { Fixture } from "./fixture.ts";
import {
  type ActorRef,
  type Json,
  Observation,
  Snapshot,
  Unreadable,
  type Use,
} from "./reports.ts";
import type { WorldClock } from "./world/clock.ts";
import type { Network } from "./world/network.ts";
import { Write } from "./world/storage.ts";
import type { World } from "./world/world.ts";

const decodeJson = Schema.decodeUnknownResult(Schema.Json);

// FLOW_STATE_ALLOW_UNKNOWN: the runtime's values are the application's; each is decoded here once, into JSON.
const jsonOf = (report: string, value: unknown) =>
  Result.mapError(decodeJson(value), (issue) => new Unreadable({ report, issue: String(issue) }));

const fromServer = <A, E>(effect: Effect.Effect<Json, Schema.JsonObject>) =>
  // SAFETY: the fake server answers what the case gave it, shaped as the shop's API answers.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fake server is untyped by design; this is its one typed seam
  effect as Effect.Effect<A, E>;

// FLOW_STATE_ALLOW_UNKNOWN: a request body is the contract's own input, serialised to JSON as a fetch would send it.
const body = (input: unknown) => Effect.orDie(Schema.decodeUnknownEffect(Schema.Json)(input));

const shopFrom = (network: Network) =>
  ShopApi.of({
    confirm: (input, options) =>
      fromServer(
        Effect.flatMap(body(input), (b) =>
          network.request("pay", b, Option.some(options.idempotencyKey)),
        ),
      ),
    placeOrder: (input, options) =>
      fromServer(
        Effect.flatMap(body(input), (b) =>
          network.request("place", b, Option.some(options.idempotencyKey)),
        ),
      ),
    voidAuthorization: (input, options) =>
      fromServer(
        Effect.flatMap(body(input), (b) =>
          network.request("void", b, Option.some(options.idempotencyKey)),
        ),
      ),
    intent: (input) =>
      fromServer(Effect.flatMap(body(input), (b) => network.request("intent", b, Option.none()))),
    orderFor: (input) =>
      fromServer(Effect.flatMap(body(input), (b) => network.request("order", b, Option.none()))),
  });

const serverFrom = (network: Network) =>
  Server.of({
    call: (operation, input, idempotencyKey) =>
      network
        .request(
          operation,
          input,
          Option.liftPredicate(idempotencyKey, (k) => k !== ""),
        )
        .pipe(
          Effect.mapError((failure) => ({
            ...Object.fromEntries(Object.entries(failure).filter(([k]) => k !== "_tag")),
            _tag: Schema.is(Schema.String)(failure["_tag"]) ? failure["_tag"] : "Error",
          })),
        ),
  });

// RETURN_TYPE: the harness's ActorRef.
const ref = (actor: { readonly machine: string; readonly name: string }): ActorRef => ({
  machine: actor.machine,
  id: actor.name,
});

const actorOf = (actor: ActorRef) => ({ machine: actor.machine, name: actor.id });

/**
 * One evidence record as the harness reports it, `None` for the disposal's end (a runtime answer,
 * not a report), or why a value in it is not JSON.
 */
const observationOf = (evidence: Evidence, identify: (value: WeakKey) => number) =>
  Evidence.$match(evidence, {
    Turn: (e) =>
      Result.succeed(
        Option.some(
          Observation.Turn({
            actor: ref(e.actor),
            event: e.event,
            from: e.from,
            to: e.to,
            parts: e.parts.map((p) => ({ definition: e.actor.machine, at: p.at })),
            members: e.members.map((m) => ({ operation: m.operation, kind: m.kind })),
          }),
        ),
      ),
    Minted: (e) =>
      Result.map(jsonOf("mint key", e.key), (key) =>
        Option.some(
          Observation.Minted({
            operation: e.operation,
            attempt: e.attempt,
            actor: ref(e.actor),
            key,
          }),
        ),
      ),
    Sent: (e) =>
      Result.succeed(Option.some(Observation.Sent({ operation: e.operation, attempt: e.attempt }))),
    Ended: (e) =>
      Result.succeed(
        Option.some(
          Observation.Ended({
            operation: e.operation,
            attempt: e.attempt,
            channel: e.channel === "notSent" ? "failure" : e.channel,
            reason: e.reason,
            actor: Option.isNone(e.attempt) ? Option.some(ref(e.actor)) : Option.none(),
          }),
        ),
      ),
    Delivered: (e) =>
      Result.succeed(
        Option.some(
          Observation.Delivered({
            operation: e.operation,
            attempt: e.attempt,
            event: e.event,
            actor: Option.some(ref(e.actor)),
          }),
        ),
      ),
    Parked: (e) =>
      Result.succeed(
        Option.some(Observation.Parked({ operation: e.operation, attempt: e.attempt })),
      ),
    Unparked: (e) =>
      Result.succeed(
        Option.some(Observation.Unparked({ operation: e.operation, attempt: e.attempt })),
      ),
    Recorded: (e) =>
      Result.succeed(
        Option.some(
          Observation.Recorded({ operation: e.operation, attempt: e.attempt, why: e.why }),
        ),
      ),
    Unhandled: (e) => Result.succeed(Option.some(Observation.Unhandled({ event: e.event }))),
    Denied: (e) =>
      Result.succeed(Option.some(Observation.Denied({ event: e.event, reasons: e.reasons }))),
    Lane: (e) =>
      Result.succeed(
        Option.some(
          Observation.Evidence({ kind: e.kind, operation: e.operation, attempt: e.attempt }),
        ),
      ),
    Issue: (e) =>
      Result.succeed(
        Option.some(
          Observation.Issue({
            code: e.code,
            ending: Option.map(e.ending, (x) => ({
              operation: x.operation,
              attempt: x.attempt,
              actor: ref(x.actor),
            })),
          }),
        ),
      ),
    Incarnated: (e) => Result.succeed(Option.some(Observation.Incarnated({ actor: ref(e.actor) }))),
    Finished: (e) => Result.succeed(Option.some(Observation.Finished({ actor: ref(e.actor) }))),
    RuntimeDisposed: () => Result.succeed(Option.none<Observation>()),
    Published: (e) =>
      Result.map(jsonOf("published memory", e.memory), (memory) =>
        Option.some(
          Observation.Published({
            actor: ref(e.actor),
            state: e.state,
            memory,
            memoryId: identify(e.memory),
          }),
        ),
      ),
  });

/**
 * Effect's Clock over the fake world's clock: virtual time, and sleeps as the world's timers, so
 * the runtime's timers and a commit's own deadline move only when a case advances time.
 */
const worldClock = (clock: WorldClock) => {
  const nanos = () => BigInt(clock.now()) * 1_000_000n;

  return Clock.Clock.of({
    currentTimeMillisUnsafe: clock.now,
    currentTimeMillis: Effect.sync(clock.now),
    currentTimeNanosUnsafe: nanos,
    currentTimeNanos: Effect.sync(nanos),
    monotonicTimeNanosUnsafe: nanos,
    monotonicTimeNanos: Effect.sync(nanos),
    sleep: (duration) =>
      Effect.callback<void>((resume) =>
        Effect.sync(
          clock.arm(clock.now() + Duration.toMillis(duration), () => resume(Effect.void)),
        ),
      ),
  });
};

const isRecord = Schema.is(Schema.Record(Schema.String, Schema.Json));

const recordOf = (json: Json) => (isRecord(json) ? json : {});

/**
 * What a boot tells its case: each report, each value it could not read, and the disposal's end.
 */
export type Listener = {
  readonly report: (observation: Observation) => void;
  readonly unreadable: (failure: Unreadable) => void;
  readonly disposed: () => void;
};

/**
 * Boots the production Runtime for one page over the world, with the case's machines, wired to the
 * fake server, and runs its `ready()`.
 *
 * **Details**
 *
 * - Its operations are the public API and the test seam (`src/host/testing.ts`); the world is
 *   synchronous, so the case settles it after each call.
 * - `snapshot` and `row` fail with {@link Unreadable} when the runtime's value is not JSON; an
 *   absent row is `None`.
 * - A reload is a new boot over the same world after the page was killed; the dead page's Runtime
 *   is dropped, never disposed, since a dead page runs nothing.
 */
export const boot = (
  fixtures: ReadonlyArray<Fixture>,
  world: World,
  captureMs: number,
  listener: Listener,
) => {
  const ids = new WeakMap<WeakKey, number>();
  let seen = 0;

  const identify = (value: WeakKey) => {
    const known = ids.get(value);

    if (known !== undefined) return known;
    seen += 1;
    ids.set(value, seen);

    return seen;
  };

  const machines = fixtures.map((f) => f.part.machine);
  const { clock, page, storage, network } = world;

  const built = testing.build(
    {
      app: app({
        id: "tests",
        machines: Object.fromEntries(machines.map((m) => [m.compiled.id, m])),
      }),
      services: Layer.mergeAll(
        Layer.succeed(ShopApi, shopFrom(network)),
        Layer.succeed(Server, serverFrom(network)),
      ),
      scope: "tests",
      persistence: { captureMs },
    },
    Context.make(
      Host,
      Host.of({
        hidden: page.hidden,
        onHidden: page.onHidden,
        sessionSeed: page.sessionSeed().toString(16).padStart(32, "0"),
        store: Option.some({
          load: Effect.sync(storage.load),
          write: (writes, purpose) =>
            Effect.callback<void, StoreRefused>((resume) =>
              storage.write(
                writes.map((w) =>
                  Option.match(w.value, {
                    onNone: () => Write.Remove({ key: w.key }),
                    onSome: (value) => Write.Put({ key: w.key, value }),
                  }),
                ),
                purpose,
                (ok) => resume(ok ? Effect.void : Effect.fail(new StoreRefused({}))),
              ),
            ),
        }),
      }),
    ).pipe(
      Context.add(Clock.Clock, worldClock(clock)),
      Context.add(Scheduler.Scheduler, page.scheduler),
    ),
  );

  attachInspector(built.runtime, (evidence) =>
    Result.match(observationOf(evidence, identify), {
      onFailure: listener.unreadable,
      onSuccess: Option.match({ onNone: listener.disposed, onSome: listener.report }),
    }),
  );

  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a boot is synchronous; ready() over the fake world's synchronous store and Layer completes in one run
  Effect.runSync(built.runtime.ready());

  const machineOf = (actor: ActorRef) =>
    Option.fromUndefinedOr(machines.find((m) => m.compiled.id === actor.machine));

  return {
    ensure: (actor: ActorRef, use: Use) => testing.attach(built, actorOf(actor), use, false),
    ensureExisting: (actor: ActorRef, use: Use) => testing.attach(built, actorOf(actor), use, true),
    release: (actor: ActorRef, use: Use) => testing.detach(built, actorOf(actor), use),
    send: (actor: ActorRef, event: string, payload: Json) => {
      if (isRecord(payload)) testing.send(built, actorOf(actor), event, payload);
      else
        listener.unreadable(
          new Unreadable({ report: `send ${event}`, issue: "the payload is not a JSON object" }),
        );
    },
    dispose: (actor: ActorRef) =>
      Option.match(machineOf(actor), {
        onNone: () => undefined,
        onSome: (m) => built.runtime.disposeActor(actorRef(m, actor.id)),
      }),
    forget: (actor: ActorRef) => testing.forget(built, actorOf(actor)),
    disposeRuntime: () => testing.disposeRuntime(built),
    snapshot: (actor: ActorRef) =>
      Option.match(testing.snapshot(built, actorOf(actor)), {
        onNone: () => Result.succeed<Snapshot>(Snapshot.Absent()),
        onSome: (s) =>
          Result.map(jsonOf(`snapshot ${actor.id}`, s.memory), (memory) =>
            Snapshot.Live({ state: s.state, memory }),
          ),
      }),
    row: (actor: ActorRef, operation: string, key: Json) =>
      Option.match(
        Option.flatMap(testing.snapshot(built, actorOf(actor)), (s) =>
          Option.flatMap(machineOf(actor), (m) =>
            testing.row(m, s.operations, operation, recordOf(key)),
          ),
        ),
        {
          onNone: () => Result.succeed(Option.none<Json>()),
          onSome: (r) => Result.map(jsonOf(`row ${operation}`, r), Option.some),
        },
      ),
    pending: () => testing.pending(built),
  };
};

/**
 * One booted production Runtime, driven through its public operations.
 */
export type Runtime = ReturnType<typeof boot>;
