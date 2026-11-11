import { Data, Equal, Option, Schema } from "effect";
import { type Fixture, referenceFor, rowsFor } from "../fixtures/fixture.ts";
import { operationNamed, type Reference } from "../fixtures/reference.ts";
import {
  disposalBoundMs,
  Fact,
  type Graphed,
  Mismatch,
  type Oracle,
  reported,
  steps,
  usesHeld,
  Violated,
} from "./oracle.ts";
import {
  type ActorRef,
  type Ended,
  type EvidenceKind,
  type Json,
  type Minted,
  Observation,
  type Port,
  sameActor,
  sameJson,
  type Snapshot,
  type Use,
} from "../port.ts";
import { type Answer, NoHeldRequest, type Request, RequestPhase } from "../world/network.ts";
import type { StorageAnswer } from "../world/storage.ts";
import { makeWorld, type World } from "../world/world.ts";
import { type Actor, actorView } from "./actor.ts";
import { empty } from "./lifecycle-model.ts";
import { step as lifeStep } from "./lifecycle-step.ts";

/**
 * One event the suite sends to one actor, its payload encoded, addressed to the actor's root
 * (`part` empty) or to a trait or fragment instance: build one with an actor's `event` or
 * `eventInto`.
 */
export type Drive = {
  readonly actor: ActorRef;
  readonly event: string;
  readonly payload: Json;
  readonly part: ReadonlyArray<string>;
};

const shown = <A>(value: A) => String(JSON.stringify(value));

/**
 * A runtime report lacks a field the Port requires: a defect of the runtime or its adapter, never
 * a verdict on a guarantee. `field` names what is missing.
 */
export class UnreadableReport extends Data.TaggedError("UnreadableReport")<{
  readonly report: string;
  readonly field: string;
  readonly message: string;
}> {}

const missingField = (reference: Reference, minted: Minted) => {
  if (Option.isNone(minted.actor)) return Option.some("actor");

  const keyed = Option.exists(
    operationNamed(reference, minted.operation),
    (o) => o.keyFields.length > 0,
  );

  return keyed && Option.isNone(minted.key) ? Option.some("key") : Option.none();
};

const decodeReports = (reference: Reference, fresh: ReadonlyArray<Fact>) => {
  for (const minted of reported(fresh).filter(Observation.$is("Minted"))) {
    const field = missingField(reference, minted);

    if (Option.isSome(field))
      throw new UnreadableReport({
        report: `Minted ${minted.operation} ${minted.attempt}`,
        field: field.value,
        message: `Minted ${minted.operation} ${minted.attempt} has no ${field.value}`,
      });
  }
};

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
 *   made, folds the lifecycle once over the step's facts, then runs every oracle with that fold;
 *   any violation throws `Violated`, naming every oracle that found one in that step.
 * - `eq` throws `Mismatch` unless the two values are equal by Effect's structural equality.
 * - `row` records the read on the timeline and runs every oracle on it, as a step does.
 * - A reload kills the page and boots the port again over the same world (the dead page's
 *   Runtime is dropped: a dead page runs nothing), then re-attaches every use the case holds:
 *   those its `Ensured`, `Released` and `Disposed` facts leave.
 * - `send` makes several sends in one step, with no settling between them.
 * - `disposeRuntime` starts the Runtime's disposal; `runtimeDisposals` counts the reports that it
 *   ended.
 * - `landed` counts the distinct Attempts the server applied; `landedKeys` lists the key of every
 *   applied request, repeats included.
 * - World faults: `answerLate` (the server's answer arrives after all), `uninterruptible` and
 *   `answerAtOnce` (from now on, for an operation).
 * - `answer` takes the oldest open request of the operation; `answerTo` the oldest open one whose
 *   input has every field of `fields` (any fields, not only the key's), so a case with two
 *   callers names which it answers.
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
  readonly forget: (actor: ActorRef) => void;
  readonly disposeRuntime: () => void;
  readonly send: (drives: ReadonlyArray<Drive>) => void;
  readonly ack: () => void;
  readonly answerStorage: (how: StorageAnswer) => void;
  readonly answer: (operation: string, answer: Answer) => void;
  readonly answerTo: (
    operation: string,
    fields: Readonly<Record<string, Json>>,
    answer: Answer,
  ) => void;
  readonly answerLate: (operation: string, answer: Answer) => void;
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
  readonly endings: (operation: string) => ReadonlyArray<Ended>;
  readonly evidence: (kind: EvidenceKind) => number;
  readonly issues: () => ReadonlyArray<string>;
  readonly denials: () => ReadonlyArray<ReadonlyArray<string>>;
  readonly runtimeDisposals: () => number;
  readonly reports: () => ReadonlyArray<Observation>;
};

/**
 * What one run of a case needs: the port to boot, the fixtures, the oracles run after every step,
 * and the world's seed.
 *
 * **Details**
 *
 * `seed` fixes the world: the store's load order and the session seeds the runtime mints from.
 * The runner runs every case under more than one seed. `graphs` are what `flow graph` printed for
 * the fixtures before the first boot; each oracle opens with them. `overdue` says whether the
 * case is past its time bound; the world asks it as it runs (see `makeWorld`).
 */
export type CaseOptions = {
  readonly port: Port;
  readonly fixtures: ReadonlyArray<Fixture>;
  readonly oracles: ReadonlyArray<Oracle>;
  readonly seed: number;
  readonly graphs: ReadonlyArray<Graphed>;
  readonly overdue: () => boolean;
};

const runtimeLife = (options: CaseOptions, world: World, record: (fact: Fact) => void) => {
  const fixtures = options.fixtures.map((f) => f.name);

  const boot = () =>
    options.port.boot({
      fixtures,
      captureMs: 0,
      sessionSeed: world.hosts.page.sessionSeed(),
      hosts: world.hosts,
      observe: (observation) => record(Fact.Reported({ observation })),
    });

  let runtime = boot();

  return {
    runtime: () => runtime,
    pending: () => runtime.pending(),
    reboot: () => {
      world.kill();
      record(Fact.Reloaded());
      runtime = boot();

      return runtime;
    },
  };
};

const stepEngine = (
  options: CaseOptions,
  world: World,
  facts: ReadonlyArray<Fact>,
  record: (fact: Fact) => void,
  pending: () => boolean,
) => {
  const { network } = world.hosts;
  const reference = referenceFor(options.fixtures);
  const known = { reference, rows: rowsFor(options.fixtures) };

  const judges = options.oracles.map((o) => ({
    name: o.name,
    next: o.open(reference, options.graphs),
  }));

  let stepped = 0;
  let noted = 0;
  let judged = 0;
  let model = empty;

  const noteRequests = () => {
    const made = network.requests();

    for (const request of made.slice(noted)) record(Fact.Requested({ request }));
    noted = made.length;
  };

  const judge = (what: string) => {
    decodeReports(reference, facts.slice(judged));
    const fresh = steps(facts.slice(judged));
    const requests = network.requests();
    judged = facts.length;

    const cuts = fresh.map((cut) => {
      const life = lifeStep(model, known, cut, requests);
      model = life.after;

      return { cut, life };
    });

    const found = judges.flatMap(({ name, next }) =>
      cuts.flatMap(({ cut, life }) => next(cut, requests, life)).map((v) => ({ name, v })),
    );

    if (found.length > 0)
      throw new Violated({
        oracles: [...new Set(found.map((f) => f.name))],
        violation: found.map((f) => `${f.name}: ${f.v.invariant}: ${f.v.text}`).join(" | "),
        step: what,
      });
  };

  const act = (what: string, run: () => void) => {
    stepped += 1;
    record(Fact.Stepped({ step: stepped, what }));
    run();
    world.settle(pending);
    noteRequests();
    judge(what);
  };

  return { act, judge };
};

const isRecord = Schema.is(Schema.Record(Schema.String, Schema.Json));

const fieldOf = (input: Json, name: string) =>
  isRecord(input) ? Option.fromUndefinedOr(input[name]) : Option.none();

const openCase = (options: CaseOptions) => {
  const world = makeWorld(options.seed, options.overdue);
  const { network, storage, page } = world.hosts;
  const facts: Array<Fact> = [];
  const record = (fact: Fact) => void facts.push(fact);
  const life = runtimeLife(options, world, record);
  const { act, judge } = stepEngine(options, world, facts, record, life.pending);

  const held = (operation: string, request: Option.Option<Request>) =>
    Option.getOrThrowWith(request, () => new NoHeldRequest({ operation }));

  const answer = (operation: string, given: Answer) =>
    act(`answer ${operation} ${given._tag}`, () => {
      const request = held(operation, network.oldestOpen(operation));
      record(Fact.Answered({ request, answer: given }));
      network.answer(request, given);
    });

  const answerTo = (operation: string, fields: Readonly<Record<string, Json>>, given: Answer) =>
    act(`answer ${operation} ${JSON.stringify(fields)} ${given._tag}`, () => {
      const request = held(
        operation,
        Option.fromUndefinedOr(
          network
            .requests()
            .find(
              (r) =>
                r.operation === operation &&
                RequestPhase.$is("Open")(r.phase) &&
                Object.entries(fields).every(([name, value]) =>
                  Option.exists(fieldOf(r.input, name), (v) => sameJson(v, value)),
                ),
            ),
        ),
      );

      record(Fact.Answered({ request, answer: given }));
      network.answer(request, given);
    });

  const answerStorage = (what: string, how: StorageAnswer) =>
    act(what, () => {
      const attempts = storage.answer(how);

      if (attempts.length > 0) record(Fact.Acknowledged({ attempts }));
    });

  const send = (drives: ReadonlyArray<Drive>) =>
    act(`send ${drives.map((d) => d.event).join(", ")}`, () => {
      for (const { actor, event, payload, part } of drives) {
        record(Fact.Drove({ actor, event }));
        life.runtime().send(actor, event, payload, part);
      }
    });

  const ensure = (actor: ActorRef, input: Option.Option<Json>) =>
    act(`ensure ${actor.id}`, () => {
      record(Fact.Ensured({ actor, use: "story" }));
      life.runtime().ensure(actor, input, "story");
    });

  const release = (actor: ActorRef, use: Use) =>
    act(`release ${actor.id}`, () => {
      record(Fact.Released({ actor, use }));
      life.runtime().release(actor, use);
    });

  const dispose = (actor: ActorRef) =>
    act(`dispose ${actor.id}`, () => {
      record(Fact.Disposed({ actor }));
      life.runtime().dispose(actor);
    });

  const forget = (actor: ActorRef) =>
    act(`forget ${actor.id}`, () => {
      record(Fact.Forgot({ actor }));
      life.runtime().forget(actor);
    });

  const eq = <A>(label: string, actual: A, expected: NoInfer<A>) => {
    if (!Equal.equals(actual, expected))
      throw new Mismatch({ label, expected: shown(expected), actual: shown(actual) });
  };

  const row = (actor: ActorRef, operation: string, key: Json) => {
    const read = life.runtime().row(actor, operation, key);
    record(Fact.Read({ actor, operation, key, row: read }));
    judge(`read ${operation}`);

    return read;
  };

  const requests = (operation: string) =>
    network.requests().filter((r) => r.operation === operation);

  const landedKeys = (operation: string) =>
    network
      .landed()
      .filter((r) => r.operation === operation)
      .flatMap((r) => Option.toArray(r.key));

  const reportsOf = <T extends Observation["_tag"]>(tag: T) =>
    reported(facts).filter(Observation.$is(tag));

  const disposeRuntime = (what: string) =>
    act(what, () => {
      record(Fact.DisposingRuntime());
      life.runtime().disposeRuntime();
    });

  const advance = (what: string, ms: number) =>
    act(what, () => {
      record(Fact.Advanced({ ms }));
      world.advance(ms, life.pending);
    });

  const reload = (what: string, attach: () => ReadonlyArray<ActorRef>) =>
    act(what, () => {
      const runtime = life.reboot();

      for (const [actor, use] of usesHeld(facts)) runtime.ensureExisting(actor, use);

      for (const actor of attach()) {
        record(Fact.Ensured({ actor, use: "story" }));
        runtime.ensureExisting(actor, "story");
      }
    });

  const driven: Case = {
    actor: (fixture, id) => actorView(driven, fixture, id),
    ensure,
    release,
    dispose,
    forget,
    disposeRuntime: () => disposeRuntime("dispose the runtime"),
    send,
    ack: () => answerStorage("ack", "ack"),
    answerStorage: (how) => answerStorage(how, how),
    answer,
    answerTo,
    answerLate: (operation, given) =>
      act(`late answer ${operation} ${given._tag}`, () => {
        const request = held(operation, network.oldestUndecided(operation));
        record(Fact.Answered({ request, answer: given }));
        network.answerLate(request, given);
      }),
    uninterruptible: (operation) =>
      act(`uninterruptible ${operation}`, () => {
        record(Fact.Unstoppable({ operation }));
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
    advance: (ms) => advance(`advance ${ms}`, ms),
    reload: () => reload("reload", () => []),
    eq,
    snapshot: (actor) => life.runtime().snapshot(actor),
    row,
    requests,
    keys: (operation) => [...new Set(requests(operation).flatMap((r) => Option.toArray(r.key)))],
    landed: (operation) => new Set(landedKeys(operation)).size,
    landedKeys,
    endings: (operation) => reportsOf("Ended").filter((o) => o.operation === operation),
    evidence: (kind) => reportsOf("Evidence").filter((o) => o.kind === kind).length,
    issues: () => reportsOf("Issue").map((o) => o.code),
    denials: () => reportsOf("Denied").map((o) => o.reasons),
    runtimeDisposals: () => reportsOf("RuntimeDisposed").length,
    reports: () => reported(facts),
  };

  const thisBoot = () => facts.slice(facts.findLastIndex(Fact.$is("Reloaded")) + 1);

  const writers = () => {
    const attached = usesHeld(facts).map(([actor]) => actor);

    return reportsOf("Minted")
      .flatMap((o) => Option.toArray(o.actor))
      .filter((actor, at, all) => all.findIndex((a) => sameActor(a, actor)) === at)
      .filter((actor) => !attached.some((h) => sameActor(h, actor)));
  };

  const end = () => {
    if (!thisBoot().some(Fact.$is("DisposingRuntime")))
      disposeRuntime("end of case: dispose the runtime");
    answerStorage("end of case: ack", "ack");
    advance(`end of case: advance ${disposalBoundMs - 1}`, disposalBoundMs - 1);
    advance("end of case: advance 1", 1);
    answerStorage("end of case: ack", "ack");
    eq(
      "end of case: the Runtime's disposal ended within its bound (Actors R22, R23)",
      reported(thisBoot()).filter(Observation.$is("RuntimeDisposed")).length,
      1,
    );
    reload("end of case: reload", writers);
  };

  return { driven, end };
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
 * boot's disposal already started), answer every held store write, advance the clock to the
 * disposal bound (one step short of it, then the last 1 ms), answer the writes again, expect that the disposal ended, and reload, which
 * re-attaches the uses the case holds and attaches every other actor that minted a write, so the
 * `disposal` oracle can see what survived.
 *
 * **Gotchas**
 *
 * - Throws as a step does: `Violated`, `Mismatch`, or a defect.
 * - The end's expectation cites its rules in its own label, so a case's `cites` need not repeat
 *   them.
 * - That the disposal ended is the runtime's `RuntimeDisposed` report, counted once per boot: a
 *   consistency check, not anchored to a suite fact. The bound is counted from the end's own
 *   advance, so a case that advanced after starting the disposal allows more time.
 */
export const playCase = (options: CaseOptions, run: Scenario["run"]) => {
  const opened = openCase(options);
  run(opened.driven);
  opened.end();
};
