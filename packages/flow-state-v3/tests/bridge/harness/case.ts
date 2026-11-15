import { Data, Equal, Formatter, Option, Result, Schema } from "effect";
import { invokedWhileDisposing } from "../checks/disposal.ts";
import { publicationBreaches } from "../checks/publication.ts";
import { Fact, reported, usesHeld } from "./facts.ts";
import type { Fixture } from "./fixture.ts";
import {
  type ActorRef,
  type Ended,
  type EvidenceKind,
  type Json,
  Observation,
  sameActor,
  sameJson,
  Snapshot,
  Unreadable,
  type Use,
} from "./reports.ts";
import { boot } from "./runtime.ts";
import { type Answer, NoHeldRequest, type Request, RequestPhase } from "./world/network.ts";
import type { StorageAnswer } from "./world/storage.ts";
import { makeWorld } from "./world/world.ts";

/**
 * How long a Runtime's disposal waits for calls on the wire before it ends them, in ms.
 */
export const disposalBoundMs = 5000;

/**
 * What a row read gives for a key with no lane: nothing.
 */
export const laneGone = Option.none();

/**
 * A case's expectation did not hold; `cites` is the rule `expect` named, empty for `eq`.
 */
export class Mismatch extends Data.TaggedError("Mismatch")<{
  readonly message: string;
  readonly cites: ReadonlyArray<string>;
}> {}

/**
 * A check found a breach in a run's observed facts.
 */
export class Breached extends Data.TaggedError("Breached")<{ readonly message: string }> {}

const expectation = <A>(cites: ReadonlyArray<string>, label: string, actual: A, expected: A) => {
  if (!Equal.equals(actual, expected))
    throw new Mismatch({
      message: `${[...cites, label].join(": ")}: expected ${Formatter.format(expected)}, got ${Formatter.format(actual)}`,
      cites,
    });
};

/**
 * One event a case sends to one actor, its payload encoded.
 */
export type Drive = { readonly actor: ActorRef; readonly event: string; readonly payload: Json };

type EventName<F extends Fixture> = keyof F["events"] & string;

type OperationName<F extends Fixture> = keyof F["operations"] & string;

/**
 * One actor of a fixture, typed by the fixture's Schemas: a wrong event name, payload, memory
 * field or row key is a type error. Its steps are the case's.
 *
 * **Details**
 *
 * - `state` expects one of the fixture's states, or `(absent)` when nothing is live.
 * - `memory` is the actor's memory decoded by the fixture's Schema; it throws when nothing is live.
 * - `row` is a write's row decoded by its policy's row Schema.
 */
export type Actor<F extends Fixture> = {
  readonly ensure: () => void;
  readonly send: <E extends EventName<F>>(event: E, payload: F["events"][E]["Type"]) => void;
  readonly release: (use: Use) => void;
  readonly dispose: () => void;
  readonly forget: () => void;
  readonly state: (expected: F["states"][number] | "(absent)") => void;
  readonly memory: () => F["memory"]["Type"];
  readonly row: <O extends OperationName<F>>(
    operation: O,
    key: F["operations"][O]["key"]["Type"],
  ) => Option.Option<F["operations"][O]["row"]["Type"]>;
};

/**
 * What a case drives and reads. Every step settles the fake world before it returns.
 *
 * **Details**
 *
 * - `expect(cited, label, actual, expected)` and `eq(label, actual, expected)` throw `Mismatch`
 *   unless the two values are equal by Effect's structural equality; `expect` cites its rule.
 * - A reload kills the page and boots the runtime again over the same world, then re-attaches
 *   every use the case holds.
 * - `send` makes several sends in one step, with no settling between them.
 * - `answer` takes the oldest open request of the operation; `answerOpen` the open one `skip`
 *   places after it; `answerTo` the oldest open one whose input has every field of `fields`;
 *   `answerLate` the oldest open, hanging or orphaned one.
 * - `landed` counts the distinct Attempts the server applied; `landedKeys` lists the key of every
 *   applied request, repeats included.
 * - `runtimeDisposals` counts the times the runtime said its disposal ended.
 */
export type Case = {
  readonly actor: <F extends Fixture>(fixture: F, id: string) => Actor<F>;
  readonly ensure: (actor: ActorRef) => void;
  readonly release: (actor: ActorRef, use: Use) => void;
  readonly dispose: (actor: ActorRef) => void;
  readonly forget: (actor: ActorRef) => void;
  readonly disposeRuntime: () => void;
  readonly send: (drives: ReadonlyArray<Drive>) => void;
  readonly ack: () => void;
  readonly answerStorage: (how: StorageAnswer) => void;
  readonly answer: (operation: string, answer: Answer) => void;
  readonly answerOpen: (operation: string, skip: number, answer: Answer) => void;
  readonly answerTo: (
    operation: string,
    fields: Readonly<Record<string, Json>>,
    answer: Answer,
  ) => void;
  readonly answerLate: (operation: string, answer: Answer) => void;
  readonly uninterruptible: (operation: string) => void;
  readonly holdFlushes: () => void;
  readonly answerAtOnce: (operation: string, answer: Answer) => void;
  readonly advance: (ms: number) => void;
  readonly reload: () => void;
  readonly eq: <A>(label: string, actual: A, expected: NoInfer<A>) => void;
  readonly expect: <A>(cited: string, label: string, actual: A, expected: NoInfer<A>) => void;
  readonly snapshot: (actor: ActorRef) => Snapshot;
  readonly row: (actor: ActorRef, operation: string, key: Json) => Option.Option<Json>;
  readonly requests: (operation: string) => ReadonlyArray<Request>;
  readonly keys: (operation: string) => ReadonlyArray<string>;
  readonly landed: (operation: string) => number;
  readonly landedKeys: (operation: string) => ReadonlyArray<string>;
  readonly endings: (operation: string) => ReadonlyArray<Ended>;
  readonly evidence: (kind: EvidenceKind) => number;
  readonly issues: () => ReadonlyArray<string>;
  readonly denials: () => ReadonlyArray<ReadonlyArray<string>>;
  readonly runtimeDisposals: () => number;
  readonly reports: () => ReadonlyArray<Observation>;
};

const isRecord = Schema.is(Schema.Record(Schema.String, Schema.Json));

const encoded = <A, E>(schema: Schema.Codec<A, E>, value: A) =>
  Schema.encodeSync(Schema.toCodecJson(schema))(value);

const decoded = <A, E>(schema: Schema.Codec<A, E>, value: Json, report: string) =>
  Result.getOrThrowWith(
    Schema.decodeUnknownResult(schema)(value),
    (why) => new Unreadable({ report, issue: String(why) }),
  );

// RETURN_TYPE: the exported Actor contract; inference would lose the generic methods' links.
const actorView = <F extends Fixture>(c: Case, fixture: F, id: string): Actor<F> => {
  const ref = { machine: fixture.machine, id };

  return {
    ensure: () => c.ensure(ref),
    send: (event, payload) =>
      c.send([{ actor: ref, event, payload: encoded(declared(fixture.events, event), payload) }]),
    release: (use) => c.release(ref, use),
    dispose: () => c.dispose(ref),
    forget: () => c.forget(ref),
    state: (expected) =>
      c.eq(
        "state",
        Snapshot.$match(c.snapshot(ref), { Live: ({ state }) => state, Absent: () => "(absent)" }),
        expected,
      ),
    memory: () =>
      Snapshot.$match(c.snapshot(ref), {
        Live: ({ memory }) =>
          decoded(Schema.toCodecJson(fixture.memory), memory, `memory of ${id}`),
        Absent: () => {
          throw new Mismatch({ message: "memory: expected (live), got (absent)", cites: [] });
        },
      }),
    row: (operation, key) => {
      const write = declared(fixture.operations, operation);

      return Option.map(c.row(ref, operation, encoded(write.key, key)), (raw) =>
        decoded(write.row, raw, `row ${operation}`),
      );
    },
  };
};

const held = (operation: string, request: Option.Option<Request>) =>
  Option.getOrThrowWith(request, () => new NoHeldRequest({ operation }));

/**
 * A case named an event or write its fixture does not declare: the actor view's types make this
 * unreachable.
 */
export class NotInFixture extends Data.TaggedError("NotInFixture")<{ readonly name: string }> {}

const declared = <T>(table: Readonly<Record<string, T>>, name: string) =>
  Option.getOrThrowWith(Option.fromUndefinedOr(table[name]), () => new NotInFixture({ name }));

/**
 * Opens one case over a fresh world with seed `seed`: the case to drive, the end that disposes the
 * Runtime and reloads, and the timeline of facts.
 */
const openCase = (fixtures: ReadonlyArray<Fixture>, seed: number, captureMs: number) => {
  const world = makeWorld(seed);
  const { network, storage } = world;
  const facts: Array<Fact> = [];
  const unread: Array<Unreadable> = [];
  const record = (fact: Fact) => void facts.push(fact);

  const start = () =>
    boot(fixtures, world, captureMs, {
      report: (observation) => record(Fact.Reported({ observation })),
      unreadable: (failure) => void unread.push(failure),
      disposed: () => record(Fact.Disposal()),
    });

  let runtime = start();
  let noted = 0;

  const act = (what: string, run: () => void) => {
    record(Fact.Stepped({ what }));
    run();
    world.settle(runtime.pending);
    const [failure] = unread;

    if (failure !== undefined) throw failure;

    for (const request of network.requests().slice(noted)) record(Fact.Requested({ request }));
    noted = network.requests().length;
  };

  const answered = (operation: string, request: Option.Option<Request>, given: Answer) =>
    network.answer(held(operation, request), given);

  const openOf = (operation: string) =>
    network
      .requests()
      .filter((r) => r.operation === operation && RequestPhase.$is("Open")(r.phase));

  const answerStorage = (how: StorageAnswer) =>
    act(how, () => {
      storage.answer(how);

      if (how === "ack" || how === "landNoAck") record(Fact.Landed());
    });

  const disposeRuntime = () =>
    act("dispose the runtime", () => {
      record(Fact.DisposingRuntime());
      runtime.disposeRuntime();
    });

  const advance = (ms: number) => act(`advance ${ms}`, () => world.advance(ms, runtime.pending));

  const thisBoot = () => facts.slice(facts.findLastIndex(Fact.$is("Reloaded")) + 1);

  // Whether the store holds no record of the actor: disposed or forgotten, or created by an ensure
  // whose record a reload lost before it landed, so a re-attach must create it again.
  const removed = (actor: ActorRef) =>
    facts.reduce<"recorded" | "absent" | "unlanded">((was, f) => {
      const mine = "actor" in f && sameActor(f.actor, actor);

      if ((Fact.$is("Disposed")(f) || Fact.$is("Forgot")(f)) && mine) return "absent";

      if (Fact.$is("Ensured")(f) && mine) return was === "absent" ? "unlanded" : was;

      if (was !== "unlanded") return was;

      if (Fact.$is("Landed")(f)) return "recorded";

      return Fact.$is("Reloaded")(f) ? "absent" : was;
    }, "recorded") === "absent";

  const reload = (attach: () => ReadonlyArray<ActorRef>) =>
    act("reload", () => {
      world.kill();
      record(Fact.Reloaded());
      runtime = start();

      for (const [actor, use] of usesHeld(facts)) runtime.ensureExisting(actor, use);

      for (const actor of attach()) {
        const fresh = removed(actor);
        record(Fact.Ensured({ actor, use: "story" }));

        if (fresh) runtime.ensure(actor, "story");
        else runtime.ensureExisting(actor, "story");
      }
    });

  const reportsOf = <T extends Observation["_tag"]>(tag: T) =>
    reported(facts).filter(Observation.$is(tag));

  const requests = (operation: string) =>
    network.requests().filter((r) => r.operation === operation);

  const landedKeys = (operation: string) =>
    network
      .landed()
      .filter((r) => r.operation === operation)
      .flatMap((r) => Option.toArray(r.key));

  const c: Case = {
    actor: (fixture, id) => actorView(c, fixture, id),
    ensure: (actor) =>
      act(`ensure ${actor.id}`, () => {
        record(Fact.Ensured({ actor, use: "story" }));
        runtime.ensure(actor, "story");
      }),
    release: (actor, use) =>
      act(`release ${actor.id}`, () => {
        record(Fact.Released({ actor, use }));
        runtime.release(actor, use);
      }),
    dispose: (actor) =>
      act(`dispose ${actor.id}`, () => {
        record(Fact.Disposed({ actor }));
        runtime.dispose(actor);
      }),
    forget: (actor) =>
      act(`forget ${actor.id}`, () => {
        record(Fact.Forgot({ actor }));
        runtime.forget(actor);
      }),
    disposeRuntime,
    send: (drives) =>
      act(`send ${drives.map((d) => d.event).join(", ")}`, () => {
        for (const { actor, event, payload } of drives) runtime.send(actor, event, payload);
      }),
    ack: () => answerStorage("ack"),
    answerStorage,
    answer: (operation, given) =>
      act(`answer ${operation}`, () => answered(operation, network.oldestOpen(operation), given)),
    answerOpen: (operation, skip, given) =>
      act(`answer ${operation} #${skip + 1}`, () =>
        answered(operation, Option.fromUndefinedOr(openOf(operation)[skip]), given),
      ),
    answerTo: (operation, fields, given) =>
      act(`answer ${operation} ${Formatter.format(fields)}`, () =>
        answered(
          operation,
          Option.fromUndefinedOr(
            openOf(operation).find((r) =>
              Object.entries(fields).every(
                ([name, value]) =>
                  isRecord(r.input) &&
                  Option.exists(Option.fromUndefinedOr(r.input[name]), (f) => sameJson(f, value)),
              ),
            ),
          ),
          given,
        ),
      ),
    answerLate: (operation, given) =>
      act(`late answer ${operation}`, () =>
        network.answerLate(held(operation, network.oldestUndecided(operation)), given),
      ),
    uninterruptible: (operation) =>
      act(`uninterruptible ${operation}`, () => network.uninterruptible(operation)),
    holdFlushes: () => act("hold flushes", storage.holdFlushes),
    answerAtOnce: (operation, given) =>
      act(`answer at once ${operation}`, () => network.answerAtOnce(operation, given)),
    advance,
    reload: () => reload(() => []),
    eq: (label, actual, expected) => expectation([], label, actual, expected),
    expect: (cited, label, actual, expected) => expectation([cited], label, actual, expected),
    snapshot: (actor) => Result.getOrThrowWith(runtime.snapshot(actor), (failure) => failure),
    row: (actor, operation, key) => {
      let read = Option.none<Json>();
      act(`read ${operation}`, () => {
        read = Result.getOrThrowWith(runtime.row(actor, operation, key), (failure) => failure);
      });

      return read;
    },
    requests,
    keys: (operation) => [...new Set(requests(operation).flatMap((r) => Option.toArray(r.key)))],
    landed: (operation) => new Set(landedKeys(operation)).size,
    landedKeys,
    endings: (operation) => reportsOf("Ended").filter((o) => o.operation === operation),
    evidence: (kind) => reportsOf("Evidence").filter((o) => o.kind === kind).length,
    issues: () => reportsOf("Issue").map((o) => o.code),
    denials: () => reportsOf("Denied").map((o) => o.reasons),
    runtimeDisposals: () => facts.filter(Fact.$is("Disposal")).length,
    reports: () => reported(facts),
  };

  // Every actor that minted a write and that the case no longer holds: the end's reload attaches
  // it, so what its lanes kept is seen. A local machine's writes die with the page.
  const writers = () => {
    const attached = usesHeld(facts).map(([actor]) => actor);

    return reportsOf("Minted")
      .map((o) => o.actor)
      .filter((actor, at, all) => all.findIndex((a) => sameActor(a, actor)) === at)
      .filter(
        (actor) =>
          fixtures.some((f) => f.machine === actor.machine && f.part.machine.compiled.persist) &&
          !attached.some((h) => sameActor(h, actor)),
      );
  };

  const end = () => {
    if (!thisBoot().some(Fact.$is("DisposingRuntime"))) disposeRuntime();
    answerStorage("ack");
    advance(disposalBoundMs - 1);
    advance(1);
    answerStorage("ack");
    expectation(
      [],
      "end of case: the Runtime's disposal ended within its bound (Actors R22, R23)",
      thisBoot().filter(Fact.$is("Disposal")).length,
      1,
    );
    reload(writers);
  };

  return { c, end, facts };
};

const playOnce = (
  fixtures: ReadonlyArray<Fixture>,
  run: (c: Case) => void,
  seed: number,
  captureMs: number,
) => {
  const opened = openCase(fixtures, seed, captureMs);
  run(opened.c);
  opened.end();

  const breaches = [
    ...publicationBreaches(fixtures, opened.facts),
    ...invokedWhileDisposing(opened.facts),
  ];

  if (breaches.length > 0) throw new Breached({ message: `seed ${seed}: ${breaches.join(" | ")}` });

  return reported(opened.facts);
};

/**
 * Plays one case on the production Runtime: runs `run`, then ends the case (disposes the Runtime,
 * answers its writes, waits out the disposal bound, expects that the disposal ended, and reloads,
 * attaching every actor that minted a write), then runs the checks over what was observed.
 *
 * **Details**
 *
 * - It plays under seeds 1 and 2, which change the store's load order and the session seeds, then
 *   seed 1 again, which must give the same reports in order (Turn I17).
 * - `captureMs` is the persistence capture interval: 0 by default, so every change is written at
 *   once.
 */
export const play = (fixtures: ReadonlyArray<Fixture>, run: (c: Case) => void, captureMs = 0) => {
  const first = playOnce(fixtures, run, 1, captureMs);
  playOnce(fixtures, run, 2, captureMs);
  const again = playOnce(fixtures, run, 1, captureMs);
  expectation(["Turn I17"], "seed 1 replayed gives the same reports", again, first);
};
