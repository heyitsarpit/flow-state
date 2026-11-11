import { Data, Effect, Layer, Option, Result, Schema } from "effect";
import { Evidence as EvidenceRecord, type Evidence } from "../../src/core/evidence.ts";
import type { Machine } from "../../src/definition.ts";
import { testing } from "../../src/host/testing.ts";
import { actorRef, app } from "../../src/index.ts";
import { attachInspector } from "../../src/inspect.ts";
import { PayMachine, ShopApi } from "../machines/pay.ts";
import {
  type ActorRef,
  type Json,
  MemberTarget,
  Observation,
  type Port,
  type Runtime,
  Snapshot,
  Unreadable,
} from "../port.ts";
import type { Network } from "../world/network.ts";
import { Write } from "../world/storage.ts";

/**
 * A case booted a fixture name the production adapter has no machine for: not built yet.
 */
export class UnbuiltInProduction extends Data.TaggedError("UnbuiltInProduction")<{
  readonly what: string;
}> {}

/**
 * A case booted a fixture name the production adapter has no machine for: not built yet.
 */
export class UnknownProductionFixture extends Data.TaggedError("UnknownProductionFixture")<{
  readonly name: string;
}> {}

/**
 * The machines the production adapter boots, by the suite's catalog name.
 */
const MACHINES: ReadonlyMap<string, Machine> = new Map([["pay", PayMachine]]);

const decodeJson = Schema.decodeUnknownResult(Schema.Json);

// FLOW_STATE_ALLOW_UNKNOWN: the runtime's values are the application's; each is decoded here once, into the Port's JSON.
const jsonOf = (report: string, value: unknown) =>
  Result.mapError(decodeJson(value), (issue) => new Unreadable({ report, issue: String(issue) }));

/**
 * The suite's server under the shop API's names: the fixture's seam, where the fake's untyped
 * answers take the service's types. A real app gives a real Layer.
 */
const fromServer = <A, E>(effect: Effect.Effect<Json, Schema.JsonObject>) =>
  // SAFETY: the suite's server answers what the case gave it, shaped as the shop's API answers (fixtures/pay.ts).
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

// RETURN_TYPE: the Port's ActorRef.
const ref = (actor: { readonly machine: string; readonly name: string }): ActorRef => ({
  machine: actor.machine,
  id: actor.name,
});

type MemberTargetOf = Extract<Evidence, { readonly _tag: "Turn" }>["members"][number]["target"];

// RETURN_TYPE: the Port's MemberTarget, or why the key is unreadable.
const targetOf = (target: MemberTargetOf): Result.Result<MemberTarget, Unreadable> => {
  if (target._tag === "Key")
    return Result.map(jsonOf("member key", target.key), (key) => MemberTarget.Key({ key }));

  if (target._tag === "Only") return Result.succeed(MemberTarget.Only());

  return Result.succeed(target._tag === "Every" ? MemberTarget.Every() : MemberTarget.Nothing());
};

/**
 * Translates one evidence record into the Port's observation: names and JSON only, no decision.
 */
const observationOf = (evidence: Evidence, identify: (value: WeakKey) => number) =>
  EvidenceRecord.$match(evidence, {
    Turn: (e) =>
      Result.map(
        Result.all(
          e.members.map((m) =>
            Result.map(targetOf(m.target), (target) => ({
              operation: m.operation,
              kind: m.kind,
              target,
            })),
          ),
        ),
        (members) =>
          Observation.Turn({
            actor: ref(e.actor),
            event: e.event,
            from: e.from,
            to: e.to,
            parts: e.parts.map((p) => ({
              part: [],
              definition: e.actor.machine,
              at: p.at,
              node: p.node,
              target: p.target,
            })),
            members,
          }),
      ),
    Minted: (e) =>
      Result.map(jsonOf("mint key", e.key), (key) =>
        Observation.Minted({
          operation: e.operation,
          attempt: e.attempt,
          actor: Option.some(ref(e.actor)),
          key: Option.some(key),
        }),
      ),
    Sent: (e) => Result.succeed(Observation.Sent({ operation: e.operation, attempt: e.attempt })),
    Ended: (e) =>
      Result.succeed(
        Observation.Ended({
          operation: e.operation,
          attempt: e.attempt,
          channel: e.channel,
          reason: e.reason,
          actor: Option.isNone(e.attempt) ? Option.some(ref(e.actor)) : Option.none(),
          failure: Option.none(),
        }),
      ),
    Delivered: (e) =>
      Result.succeed(
        Observation.Delivered({
          operation: e.operation,
          attempt: e.attempt,
          event: e.event,
          actor: Option.some(ref(e.actor)),
        }),
      ),
    Parked: (e) =>
      Result.succeed(Observation.Parked({ operation: e.operation, attempt: e.attempt })),
    Unparked: (e) =>
      Result.succeed(Observation.Unparked({ operation: e.operation, attempt: e.attempt })),
    Recorded: (e) =>
      Result.succeed(
        Observation.Recorded({ operation: e.operation, attempt: e.attempt, why: e.why }),
      ),
    Unhandled: (e) => Result.succeed(Observation.Unhandled({ event: e.event })),
    Denied: (e) => Result.succeed(Observation.Denied({ event: e.event, reasons: e.reasons })),
    Lane: (e) =>
      Result.succeed(
        Observation.Evidence({ kind: e.kind, operation: e.operation, attempt: e.attempt }),
      ),
    Issue: (e) =>
      Result.succeed(
        Observation.Issue({
          code: e.code,
          ending: Option.map(e.ending, (x) => ({
            operation: x.operation,
            attempt: x.attempt,
            actor: ref(x.actor),
          })),
        }),
      ),
    Incarnated: (e) => Result.succeed(Observation.Incarnated({ actor: ref(e.actor) })),
    Finished: (e) => Result.succeed(Observation.Finished({ actor: ref(e.actor) })),
    RuntimeDisposed: () => Result.succeed(Observation.RuntimeDisposed()),
    Published: (e) =>
      Result.map(jsonOf("published memory", e.memory), (memory) =>
        Observation.Published({
          actor: ref(e.actor),
          state: e.state,
          memory,
          memoryId: identify(e.memory),
        }),
      ),
  });

const isRecord = Schema.is(Schema.Record(Schema.String, Schema.Json));

const recordOf = (json: Json) => (isRecord(json) ? json : {});

const actorOf = (actor: ActorRef) => ({ machine: actor.machine, name: actor.id });

/**
 * The Port over the production runtime (`src/`), through its public API and its internal test
 * seam.
 *
 * **Details**
 *
 * - `boot` builds a Runtime over the world's hosts with the case's machines, wired to the suite's
 *   server, and runs its `ready()`.
 * - Evidence is translated into observations by name; the adapter decides nothing.
 * - Machines the production runtime does not have yet throw {@link UnknownProductionFixture}.
 */
export const productionPort: Port = {
  // RETURN_TYPE: the Port's Runtime contract types the methods' parameters.
  boot: (boot): Runtime => {
    const ids = new WeakMap<WeakKey, number>();
    let seen = 0;

    const identify = (value: WeakKey) => {
      const known = ids.get(value);

      if (known !== undefined) return known;
      seen += 1;
      ids.set(value, seen);

      return seen;
    };

    const machines = boot.fixtures.map((name) =>
      Option.getOrThrowWith(
        Option.fromUndefinedOr(MACHINES.get(name)),
        () => new UnknownProductionFixture({ name }),
      ),
    );

    const { clock, page, storage, network } = boot.hosts;

    const runtime = testing.constructOn(
      {
        app: app({
          id: "conformance",
          machines: Object.fromEntries(machines.map((m) => [m.compiled.id, m])),
        }),
        services: Layer.succeed(ShopApi, shopFrom(network)),
        scope: "conformance",
        persistence: { captureMs: boot.captureMs },
      },
      {
        now: clock.now,
        monotonic: clock.now,
        arm: clock.arm,
        later: page.later,
        scheduler: page.scheduler,
        hidden: page.hidden,
        onHidden: page.onHidden,
        sessionSeed: boot.sessionSeed,
        store: Option.some({
          load: storage.load,
          write: (writes, purpose, answer, acknowledges) =>
            storage.write(
              writes.map((w) =>
                Option.match(w.value, {
                  onNone: () => Write.Remove({ key: w.key }),
                  onSome: (value) => Write.Put({ key: w.key, value }),
                }),
              ),
              purpose,
              answer,
              acknowledges,
            ),
        }),
      },
    );

    attachInspector(runtime, (evidence) =>
      Result.match(observationOf(evidence, identify), {
        onFailure: boot.unreadable,
        onSuccess: boot.observe,
      }),
    );

    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the Port's boot is synchronous; ready() over the fake world's synchronous store and Layer completes in one run
    Effect.runSync(runtime.ready());

    const machineOf = (actor: ActorRef) =>
      Option.fromUndefinedOr(machines.find((m) => m.compiled.id === actor.machine));

    return {
      ensure: (actor, _input, use) => testing.attach(runtime, actorOf(actor), use, false),
      ensureExisting: (actor, use) => testing.attach(runtime, actorOf(actor), use, true),
      release: (actor, use) => testing.detach(runtime, actorOf(actor), use),
      send: (actor, event, payload, part) => {
        if (part.length > 0)
          throw new UnbuiltInProduction({ what: `a send to the part ${part.join(".")}` });

        if (isRecord(payload)) testing.send(runtime, actorOf(actor), event, payload);
        else
          boot.unreadable(
            new Unreadable({ report: `send ${event}`, issue: "the payload is not a JSON object" }),
          );
      },
      dispose: (actor) =>
        Option.match(machineOf(actor), {
          onNone: () => undefined,
          onSome: (m) => runtime.disposeActor(actorRef(m, actor.id)),
        }),
      forget: (actor) => testing.forget(runtime, actorOf(actor)),
      disposeRuntime: () => testing.disposeRuntime(runtime),
      snapshot: (actor) =>
        Option.match(testing.snapshot(runtime, actorOf(actor)), {
          onNone: () => Result.succeed(Snapshot.Absent()),
          onSome: (s) =>
            Result.map(jsonOf(`snapshot ${actor.id}`, s.memory), (memory) =>
              Snapshot.Live({ state: s.state, memory }),
            ),
        }),
      row: (actor, operation, key) =>
        Option.match(
          Option.flatMap(testing.snapshot(runtime, actorOf(actor)), (s) =>
            Option.flatMap(machineOf(actor), (m) =>
              testing.row(m, s.operations, operation, recordOf(key)),
            ),
          ),
          {
            onNone: () => Result.succeed(Option.none()),
            onSome: (row) => Result.map(jsonOf(`row ${operation}`, row), Option.some),
          },
        ),
      entity: () => Result.succeed(Option.none()),
      pending: () => testing.pending(runtime),
    };
  },
};
