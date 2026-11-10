import { Data, Equal, Option, type Schema } from "effect";
import { type Fixture, referenceFor } from "../fixtures/fixture.ts";
import { Fact, type Oracle, reported } from "./oracle.ts";
import {
  type ActorRef,
  type EvidenceKind,
  type Json,
  Observation,
  type Port,
  sameActor,
  type Snapshot,
  type Use,
} from "../port.ts";
import { type Answer, NoHeldRequest, type Request } from "../world/network.ts";
import type { StorageAnswer } from "../world/storage.ts";
import { makeWorld } from "../world/world.ts";
import { type Actor, actorView } from "./actor.ts";
import { makeTimeline } from "./timeline.ts";

/**
 * A case's own expectation did not hold. `expected` and `actual` are the values as JSON text.
 */
export class Mismatch extends Data.TaggedError("Mismatch")<{
  readonly label: string;
  readonly expected: string;
  readonly actual: string;
}> {}

/**
 * An oracle found a violation after a step.
 */
export class Violated extends Data.TaggedError("Violated")<{
  readonly oracles: ReadonlyArray<string>;
  readonly violation: string;
  readonly step: string;
}> {}

/**
 * One event the suite sends to one actor, its payload encoded: build one with an actor's
 * `event`.
 */
export type Drive = { readonly actor: ActorRef; readonly event: string; readonly payload: Json };

const shown = <A>(value: A) => String(JSON.stringify(value));

/**
 * The scenario DSL one case runs through, fixture-agnostic: steps that settle the world and run
 * every oracle, and reads of public results. `actor` gives a typed view of one actor.
 *
 * **When to use**
 *
 * A scenario's `run` is a plain function that takes this, makes its actors with
 * `actor(fixture, id)` and drives them.
 *
 * **Details**
 *
 * - Every step records itself on the timeline, runs, settles the world, notes the requests it
 *   made, then runs every oracle; any violation throws `Violated`, naming every oracle that found
 *   one in that step.
 * - `eq` throws `Mismatch` unless the two values are equal by Effect's structural equality.
 * - A reload kills the page and boots the port again over the same world (the dead page's
 *   Runtime is dropped: a dead page runs nothing), then re-attaches every use the case holds:
 *   those its `Ensured`, `Released` and `Disposed` facts leave.
 * - `send` makes several sends in one step, with no settling between them.
 * - `disposeRuntime` starts the Runtime's disposal; `runtimeDisposals` counts the reports that it
 *   ended.
 * - `landed` counts the distinct Attempts the server applied; `landedKeys` lists the key of every
 *   applied request, repeats included.
 * - World faults: `answerLate` (the server's answer arrives after all), `landLate` (a lost
 *   request lands unheard), `uninterruptible` and `answerAtOnce` (from now on, for an operation).
 * - `answer` takes the oldest open request of the operation, or with `where` the oldest whose
 *   input has those fields.
 *
 * **Gotchas**
 *
 * - A step that names a request the server does not hold throws `NoHeldRequest`: a scenario bug,
 *   never a verdict.
 */
export type Case = {
  readonly actor: <F extends Fixture>(fixture: F, id: string) => Actor<F>;
  readonly ensure: (actor: ActorRef, input: Option.Option<Json>) => void;
  readonly release: (actor: ActorRef, use: Use) => void;
  readonly dispose: (actor: ActorRef) => void;
  readonly disposeRuntime: () => void;
  readonly send: (drives: ReadonlyArray<Drive>) => void;
  readonly ack: () => void;
  readonly answerStorage: (how: StorageAnswer, match: Option.Option<string>) => void;
  readonly answer: (operation: string, answer: Answer) => void;
  readonly answerWhere: (operation: string, answer: Answer, where: Schema.JsonObject) => void;
  readonly answerLate: (operation: string, answer: Answer) => void;
  readonly landLate: (operation: string) => void;
  readonly uninterruptible: (operation: string) => void;
  readonly answerAtOnce: (operation: string, answer: Answer) => void;
  readonly hide: () => void;
  readonly advance: (ms: number) => void;
  readonly reload: () => void;
  readonly eq: <A>(label: string, actual: A, expected: NoInfer<A>) => void;
  readonly snapshot: (actor: ActorRef) => Snapshot;
  readonly row: (actor: ActorRef, operation: string, key: Json) => Option.Option<Json>;
  readonly requests: (operation: string) => ReadonlyArray<Request>;
  readonly keys: (operation: string) => ReadonlyArray<string>;
  readonly landed: (operation: string) => number;
  readonly landedKeys: (operation: string) => ReadonlyArray<string>;
  readonly endings: (
    operation: string,
  ) => ReadonlyArray<Extract<Observation, { readonly _tag: "Ended" }>>;
  readonly evidence: (kind: EvidenceKind) => number;
  readonly issues: () => ReadonlyArray<string>;
  readonly denials: () => ReadonlyArray<ReadonlyArray<string>>;
  readonly runtimeDisposals: () => number;
  readonly reports: () => ReadonlyArray<Observation>;
};

/**
 * The steps and reads an actor view is made of: the Case's own.
 */
export type Driver = Pick<
  Case,
  "ensure" | "release" | "dispose" | "send" | "eq" | "snapshot" | "row"
>;

/**
 * What one run of a case needs: the port to boot, the fixtures, the oracles run after every step,
 * and the world's seed.
 *
 * **Details**
 *
 * `seed` fixes the world: the store's load order and the session seeds the runtime mints from.
 * The runner runs every case under more than one seed.
 */
export type CaseOptions = {
  readonly port: Port;
  readonly fixtures: ReadonlyArray<Fixture>;
  readonly oracles: ReadonlyArray<Oracle>;
  readonly seed: number;
};

const DISPOSAL_BOUND_MS = 5000;

const openCase = (options: CaseOptions) => {
  const world = makeWorld(options.seed);
  const { network, storage, page } = world.hosts;
  const timeline = makeTimeline();
  const reference = referenceFor(options.fixtures);
  const fixtures = options.fixtures.map((f) => f.name);

  const boot = () =>
    options.port.boot({
      fixtures,
      captureMs: 0,
      sessionSeed: page.sessionSeed(),
      hosts: world.hosts,
      observe: (observation) => timeline.record(Fact.Reported({ observation })),
    });

  let runtime = boot();
  const pending = () => runtime.pending();

  const count = (tag: "Stepped" | "Requested") =>
    timeline.facts().filter((fact) => fact._tag === tag).length;

  const noteRequests = () => {
    for (const request of network.requests().slice(count("Requested")))
      timeline.record(Fact.Requested({ request }));
  };

  const uses = () =>
    timeline.facts().reduce<ReadonlyArray<readonly [ActorRef, Use]>>(
      (held, fact) =>
        Fact.$match(fact, {
          Ensured: ({ actor }) => [...held, [actor, "story"] as const],
          Released: ({ actor, use }) => {
            const at = held.findIndex(([a, u]) => sameActor(a, actor) && u === use);

            return at < 0 ? held : held.toSpliced(at, 1);
          },
          Disposed: ({ actor }) => held.filter(([a]) => !sameActor(a, actor)),
          Stepped: () => held,
          Requested: () => held,
          Answered: () => held,
          Reported: () => held,
          Reloaded: () => held,
          DisposingRuntime: () => held,
          Drove: () => held,
          Unstoppable: () => held,
        }),
      [],
    );

  const judge = (what: string) => {
    const facts = { timeline: timeline.facts(), requests: network.requests(), reference };

    const found = options.oracles.flatMap((oracle) => {
      const [violation] = oracle.check(facts);

      return violation === undefined ? [] : [{ oracle: oracle.name, violation }];
    });

    if (found.length > 0)
      throw new Violated({
        oracles: found.map((f) => f.oracle),
        violation: found.map((f) => `${f.oracle}: ${f.violation}`).join(" | "),
        step: what,
      });
  };

  const act = (what: string, run: () => void) => {
    timeline.record(Fact.Stepped({ step: count("Stepped") + 1, what }));
    run();
    world.settle(pending);
    noteRequests();
    judge(what);
  };

  const held = (operation: string, request: Option.Option<Request>) =>
    Option.getOrThrowWith(request, () => new NoHeldRequest({ operation }));

  const answer = (operation: string, given: Answer, where: Option.Option<Schema.JsonObject>) =>
    act(`answer ${operation} ${given._tag}`, () => {
      const request = held(operation, network.oldestOpen(operation, where));
      timeline.record(Fact.Answered({ request, answer: given }));
      network.answer(request, given);
    });

  const answerStorage = (how: StorageAnswer, match: Option.Option<string>) =>
    act(how, () => void storage.answer(how, match));

  const send = (drives: ReadonlyArray<Drive>) =>
    act(`send ${drives.map((d) => d.event).join(", ")}`, () => {
      for (const { actor, event, payload } of drives) {
        timeline.record(Fact.Drove({ actor, event }));
        runtime.send(actor, event, payload);
      }
    });

  const ensure = (actor: ActorRef, input: Option.Option<Json>) =>
    act(`ensure ${actor.id}`, () => {
      timeline.record(Fact.Ensured({ actor }));
      runtime.ensure(actor, input, "story");
    });

  const release = (actor: ActorRef, use: Use) =>
    act(`release ${actor.id}`, () => {
      timeline.record(Fact.Released({ actor, use }));
      runtime.release(actor, use);
    });

  const dispose = (actor: ActorRef) =>
    act(`dispose ${actor.id}`, () => {
      timeline.record(Fact.Disposed({ actor }));
      runtime.dispose(actor);
    });

  const eq = <A>(label: string, actual: A, expected: NoInfer<A>) => {
    if (!Equal.equals(actual, expected))
      throw new Mismatch({ label, expected: shown(expected), actual: shown(actual) });
  };

  const snapshot = (actor: ActorRef) => runtime.snapshot(actor);

  const row = (actor: ActorRef, operation: string, key: Json) => runtime.row(actor, operation, key);

  const requests = (operation: string) =>
    network.requests().filter((r) => r.operation === operation);

  const landedKeys = (operation: string) =>
    network
      .landed()
      .filter((r) => r.operation === operation)
      .flatMap((r) => Option.toArray(r.key));

  const observed = () => reported(timeline.facts());

  const driver: Driver = { ensure, release, dispose, send, eq, snapshot, row };

  const thisBoot = () => {
    const facts = timeline.facts();

    return facts.slice(facts.findLastIndex(Fact.$is("Reloaded")) + 1);
  };

  const disposeRuntime = (what: string) =>
    act(what, () => {
      timeline.record(Fact.DisposingRuntime());
      runtime.disposeRuntime();
    });

  const reload = (what: string) =>
    act(what, () => {
      world.kill();
      timeline.record(Fact.Reloaded());
      runtime = boot();

      for (const [actor, use] of uses()) runtime.ensureExisting(actor, use);
    });

  const end = () => {
    if (!thisBoot().some(Fact.$is("DisposingRuntime")))
      disposeRuntime("end of case: dispose the runtime");
    act("end of case: ack", () => void storage.answer("ack", Option.none()));
    act(`end of case: advance ${DISPOSAL_BOUND_MS}`, () =>
      world.advance(DISPOSAL_BOUND_MS, pending),
    );
    act("end of case: ack", () => void storage.answer("ack", Option.none()));
    eq(
      "end of case: the Runtime's disposal ended within its bound (Actors R22, R23)",
      reported(thisBoot()).filter(Observation.$is("RuntimeDisposed")).length,
      1,
    );
    reload("end of case: reload");
  };

  const steps: Case = {
    actor: (fixture, id) => actorView(driver, fixture, id),
    ensure,
    release,
    dispose,
    disposeRuntime: () => disposeRuntime("dispose the runtime"),
    send,
    ack: () => answerStorage("ack", Option.none()),
    answerStorage,
    answer: (operation, given) => answer(operation, given, Option.none()),
    answerWhere: (operation, given, where) => answer(operation, given, Option.some(where)),
    answerLate: (operation, given) =>
      act(`late answer ${operation} ${given._tag}`, () => {
        const request = held(operation, network.oldestUndecided(operation));
        timeline.record(Fact.Answered({ request, answer: given }));
        network.answerLate(request, given);
      }),
    landLate: (operation) =>
      act(`land late ${operation}`, () =>
        network.landLate(held(operation, network.oldestLost(operation))),
      ),
    uninterruptible: (operation) =>
      act(`uninterruptible ${operation}`, () => {
        timeline.record(Fact.Unstoppable({ operation }));
        network.uninterruptible(operation);
      }),
    answerAtOnce: (operation, given) =>
      act(`answer at once ${operation} ${given._tag}`, () =>
        network.answerAtOnce(operation, given),
      ),
    hide: () =>
      act("hide", () => {
        page.hide();
        page.show();
      }),
    advance: (ms) => act(`advance ${ms}`, () => world.advance(ms, pending)),
    reload: () => reload("reload"),
    eq,
    snapshot,
    row,
    requests,
    keys: (operation) => [...new Set(requests(operation).flatMap((r) => Option.toArray(r.key)))],
    landed: (operation) => new Set(landedKeys(operation)).size,
    landedKeys,
    endings: (operation) =>
      observed().flatMap((o) =>
        Observation.$is("Ended")(o) && o.operation === operation ? [o] : [],
      ),
    evidence: (kind) =>
      observed().filter((o) => Observation.$is("Evidence")(o) && o.kind === kind).length,
    issues: () => observed().flatMap((o) => (Observation.$is("Issue")(o) ? [o.code] : [])),
    denials: () => observed().flatMap((o) => (Observation.$is("Denied")(o) ? [o.reasons] : [])),
    runtimeDisposals: () => observed().filter(Observation.$is("RuntimeDisposed")).length,
    reports: observed,
  };

  return { steps, end };
};

/**
 * One case: the machines it boots and what it drives and expects.
 *
 * **Details**
 *
 * - `cites`: the Spec Requirements and Invariants the case's expectations come from.
 * - `fixtures`: booted together.
 * - `run`: the case, a plain function over its {@link Case}; it never reaches a runtime's
 *   internals.
 */
export type Scenario = {
  readonly id: string;
  readonly cites: ReadonlyArray<string>;
  readonly fixtures: ReadonlyArray<Fixture>;
  readonly run: (c: Case) => void;
};

/**
 * One case per named variant of a base, each with the id `<base id>/<name>`.
 *
 * **When to use**
 *
 * Variants that share fixtures and citations but drive different paths.
 */
export const variants = (
  base: Omit<Scenario, "run">,
  runs: Readonly<Record<string, Scenario["run"]>>,
) => Object.entries(runs).map(([name, run]) => ({ ...base, id: `${base.id}/${name}`, run }));

/**
 * Runs one case on a fresh world: opens it, runs the scenario's steps, then ends it with a judged
 * Runtime disposal.
 *
 * **Details**
 *
 * The end is steps like any other, so every oracle judges each: dispose the Runtime (unless this
 * boot's disposal already started), answer every held store write, advance the clock past the
 * disposal bound, answer the writes again, expect that the disposal ended (Actors R22, R23), and
 * reload, which re-attaches the uses the case holds so the `disposal` oracle can see what
 * survived.
 *
 * **Gotchas**
 *
 * - Throws as a step does: `Violated`, `Mismatch`, or a defect.
 */
export const playCase = (options: CaseOptions, run: Scenario["run"]) => {
  const opened = openCase(options);
  run(opened.steps);
  opened.end();
};
