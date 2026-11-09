import { Data, Option, Predicate } from "effect";
import type { Reference } from "../fixtures/reference.ts";
import { sameData } from "../oracles/equality.ts";
import { Fact, type Oracle } from "../oracles/oracle.ts";
import { type ActorRef, Observation, type Port, type Row, Snapshot, type Use } from "../port.ts";
import { type Answer, NoHeldRequest, type Request } from "../world/network.ts";
import type { StorageAnswer } from "../world/storage.ts";
import { advance, kill, makeWorld, settle, type World } from "../world/world.ts";

/**
 * A case's own expectation did not hold.
 */
export class Mismatch extends Data.TaggedError("Mismatch")<{
  readonly label: string;
  readonly expected: unknown;
  readonly actual: unknown;
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
 * One case: a machine set, the actor it is about, and what it drives and expects.
 *
 * **Details**
 *
 * - `cites`: the Spec Requirements and Invariants the case's expectations come from.
 * - `fixtures`: catalog names, booted together.
 * - `run`: the case, through a {@link Case}; it never reaches a runtime's internals.
 */
export type Scenario = {
  readonly id: string;
  readonly cites: ReadonlyArray<string>;
  readonly fixtures: ReadonlyArray<string>;
  readonly actor: ActorRef;
  readonly run: (c: Case) => void;
};

/**
 * One case per named variant of a base, each with the id `<base id>/<name>`.
 *
 * **When to use**
 *
 * Variants that share fixtures, actor and citations but drive different paths.
 */
export const variants = (
  base: Omit<Scenario, "run">,
  runs: Readonly<Record<string, (c: Case) => void>>,
) => Object.entries(runs).map(([name, run]) => ({ ...base, id: `${base.id}/${name}`, run }));

/**
 * The driver one case runs through: steps that settle the world and run every oracle, and reads
 * of public results.
 *
 * **Details**
 *
 * - Every step records itself on the timeline, runs, settles the world, notes the requests it
 *   made, then runs every oracle; any violation throws `Violated`, naming every oracle that found
 *   one in that step.
 * - `eq` and `state` throw `Mismatch`.
 * - A reload kills the page and boots the port again over the same world, then re-attaches every
 *   use the case holds.
 * - `sendMany` makes several sends in one step, with no settling between them.
 * - `disposeRuntime` starts the Runtime's disposal; `runtimeDisposals` counts the reports that it
 *   ended.
 * - World faults: `answerLate` (the server's answer arrives after all), `landLate` (a lost
 *   request lands unheard), `uninterruptible` and `answerAtOnce` (from now on, for an operation).
 * - The short forms act on the scenario's own actor; the `...Of` and `...Where` forms name what
 *   they act on.
 */
export type Case = {
  readonly actor: ActorRef;
  readonly world: World;
  readonly ensure: () => void;
  readonly ensureOf: (actor: ActorRef, input: Option.Option<unknown>) => void;
  readonly release: (actor: ActorRef, use: Use) => void;
  readonly dispose: (actor: ActorRef) => void;
  readonly disposeRuntime: () => void;
  readonly send: (event: string, payload: unknown) => void;
  readonly to: (actor: ActorRef, event: string, payload: unknown) => void;
  readonly sendMany: (sends: ReadonlyArray<readonly [ActorRef, string, unknown]>) => void;
  readonly ack: () => void;
  readonly answerStorage: (how: StorageAnswer, match: Option.Option<string>) => void;
  readonly answer: (operation: string, answer: Answer) => void;
  readonly answerWhere: (
    operation: string,
    answer: Answer,
    where: Readonly<Record<string, unknown>>,
  ) => void;
  readonly answerLate: (operation: string, answer: Answer) => void;
  readonly landLate: (operation: string) => void;
  readonly uninterruptible: (operation: string) => void;
  readonly answerAtOnce: (operation: string, answer: Answer) => void;
  readonly hide: () => void;
  readonly advance: (ms: number) => void;
  readonly reload: () => void;
  readonly eq: (label: string, actual: unknown, expected: unknown) => void;
  readonly state: (expected: string) => void;
  readonly stateOf: (actor: ActorRef, expected: string) => void;
  readonly memory: () => Readonly<Record<string, unknown>>;
  readonly memoryOf: (actor: ActorRef) => Readonly<Record<string, unknown>>;
  readonly row: (operation: string, key: unknown) => Option.Option<Row>;
  readonly rowOf: (actor: ActorRef, operation: string, key: unknown) => Option.Option<Row>;
  readonly requests: (operation: string) => ReadonlyArray<Request>;
  readonly keys: (operation: string) => ReadonlyArray<string>;
  readonly landed: (operation: string) => number;
  readonly endings: (
    operation: string,
  ) => ReadonlyArray<Extract<Observation, { readonly _tag: "Ended" }>>;
  readonly evidence: (kind: Extract<Observation, { readonly _tag: "Evidence" }>["kind"]) => number;
  readonly issues: () => ReadonlyArray<string>;
  readonly denials: () => ReadonlyArray<ReadonlyArray<string>>;
  readonly runtimeDisposals: () => number;
  readonly reports: () => ReadonlyArray<Observation>;
};

const record = (value: unknown) =>
  Object.fromEntries(Predicate.isObject(value) ? Object.entries(value) : []);

/**
 * Builds the driver for one scenario over a port, with the oracles it runs after every step.
 *
 * **Details**
 *
 * `seed` fixes the world: the store's load order and the session seeds the runtime mints from.
 * The runner runs every case under more than one seed.
 */
// RETURN_TYPE: the exported Case contract scenarios are written against.
export const openCase = (
  port: Port,
  scenario: Scenario,
  reference: Reference,
  oracles: ReadonlyArray<Oracle>,
  seed: number,
): Case => {
  const world = makeWorld(seed);
  const timeline: Array<Fact> = [];
  const uses: Array<readonly [ActorRef, Use]> = [];
  let step = 0;
  let seenRequests = 0;

  const boot = () =>
    port.boot({
      fixtures: scenario.fixtures,
      captureMs: 0,
      sessionSeed: world.lifecycle.sessionSeed(),
      world,
      observe: (observation) => {
        timeline.push(Fact.Reported({ observation }));
      },
    });

  let runtime = boot();
  const pending = () => runtime.pending();

  const noteRequests = () => {
    const all = world.network.requests();

    for (const request of all.slice(seenRequests)) timeline.push(Fact.Requested({ request }));
    seenRequests = all.length;
  };

  const judge = (what: string) => {
    const facts = { timeline, requests: world.network.requests(), reference };

    const found = oracles.flatMap((oracle) => {
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
    step += 1;
    timeline.push(Fact.Stepped({ step, what }));
    run();
    settle(world, pending);
    noteRequests();
    judge(what);
  };

  const answer = (
    operation: string,
    given: Answer,
    where: Option.Option<Readonly<Record<string, unknown>>>,
  ) =>
    act(`answer ${operation} ${given._tag}`, () => {
      const held = world.network.oldestOpen(operation, where);

      if (Option.isNone(held)) throw new NoHeldRequest({ operation });
      timeline.push(Fact.Answered({ request: held.value, answer: given }));
      world.network.answer(held.value, given);
    });

  const stateOf = (actor: ActorRef, expected: string) =>
    c.eq(
      "state",
      Snapshot.$match(runtime.snapshot(actor), {
        Live: ({ state }) => state,
        Absent: () => "(absent)",
      }),
      expected,
    );

  const memoryOf = (actor: ActorRef) =>
    Snapshot.$match(runtime.snapshot(actor), {
      Live: ({ memory }) => record(memory),
      Absent: () => ({}),
    });

  const reported = () =>
    timeline.flatMap((fact) => (Fact.$is("Reported")(fact) ? [fact.observation] : []));

  const c: Case = {
    actor: scenario.actor,
    world,
    ensure: () => c.ensureOf(scenario.actor, Option.none()),
    ensureOf: (actor, input) =>
      act(`ensure ${actor.id}`, () => {
        timeline.push(Fact.Ensured({ actor }));
        uses.push([actor, "story"]);
        runtime.ensure(actor, input, "story");
      }),
    release: (actor, use) =>
      act(`release ${actor.id}`, () => {
        const at = uses.findIndex(([a, u]) => sameData(a, actor) && u === use);

        if (at >= 0) uses.splice(at, 1);
        runtime.release(actor, use);
      }),
    dispose: (actor) =>
      act(`dispose ${actor.id}`, () => {
        timeline.push(Fact.Disposed({ actor }));

        for (let at = uses.length - 1; at >= 0; at -= 1)
          if (sameData(uses[at]?.[0], actor)) uses.splice(at, 1);
        runtime.dispose(actor);
      }),
    disposeRuntime: () =>
      act("dispose the runtime", () => {
        timeline.push(Fact.DisposingRuntime());
        runtime.disposeRuntime();
      }),
    send: (event, payload) => c.to(scenario.actor, event, payload),
    to: (actor, event, payload) => c.sendMany([[actor, event, payload]]),
    sendMany: (sends) =>
      act(`send ${sends.map(([, event]) => event).join(", ")}`, () => {
        for (const [actor, event, payload] of sends) {
          timeline.push(Fact.Drove({ actor, event }));
          runtime.send(actor, event, payload);
        }
      }),
    ack: () => c.answerStorage("ack", Option.none()),
    answerStorage: (how, match) => act(how, () => void world.storage.answer(how, match)),
    answer: (operation, given) => answer(operation, given, Option.none()),
    answerWhere: (operation, given, where) => answer(operation, given, Option.some(where)),
    answerLate: (operation, given) =>
      act(`late answer ${operation} ${given._tag}`, () => {
        const held = world.network.oldestUndecided(operation);

        if (Option.isNone(held)) throw new NoHeldRequest({ operation });
        timeline.push(Fact.Answered({ request: held.value, answer: given }));
        world.network.answerLate(held.value, given);
      }),
    landLate: (operation) =>
      act(`land late ${operation}`, () => {
        const lost = world.network.oldestLost(operation);

        if (Option.isNone(lost)) throw new NoHeldRequest({ operation });
        world.network.landLate(lost.value);
      }),
    uninterruptible: (operation) =>
      act(`uninterruptible ${operation}`, () => {
        timeline.push(Fact.Unstoppable({ operation }));
        world.network.uninterruptible(operation);
      }),
    answerAtOnce: (operation, given) =>
      act(`answer at once ${operation} ${given._tag}`, () =>
        world.network.answerAtOnce(operation, given),
      ),
    hide: () =>
      act("hide", () => {
        world.lifecycle.hide();
        world.lifecycle.show();
      }),
    advance: (ms) => act(`advance ${ms}`, () => advance(world, ms, pending)),
    reload: () =>
      act("reload", () => {
        kill(world);
        timeline.push(Fact.Reloaded());
        runtime = boot();

        for (const [actor, use] of uses) runtime.ensureExisting(actor, use);
      }),
    eq: (label, actual, expected) => {
      if (!sameData(actual, expected)) throw new Mismatch({ label, expected, actual });
    },
    state: (expected) => stateOf(scenario.actor, expected),
    stateOf,
    memory: () => memoryOf(scenario.actor),
    memoryOf,
    row: (operation, key) => runtime.row(scenario.actor, operation, key),
    rowOf: (actor, operation, key) => runtime.row(actor, operation, key),
    requests: (operation) => world.network.requests().filter((r) => r.operation === operation),
    keys: (operation) => [...new Set(c.requests(operation).flatMap((r) => Option.toArray(r.key)))],
    landed: (operation) =>
      new Set(
        world.network
          .landed()
          .filter((r) => r.operation === operation)
          .flatMap((r) => Option.toArray(r.key)),
      ).size,
    endings: (operation) =>
      reported().flatMap((o) =>
        Observation.$is("Ended")(o) && o.operation === operation ? [o] : [],
      ),
    evidence: (kind) =>
      reported().filter((o) => Observation.$is("Evidence")(o) && o.kind === kind).length,
    issues: () => reported().flatMap((o) => (Observation.$is("Issue")(o) ? [o.code] : [])),
    denials: () => reported().flatMap((o) => (Observation.$is("Denied")(o) ? [o.reasons] : [])),
    runtimeDisposals: () => reported().filter(Observation.$is("RuntimeDisposed")).length,
    reports: reported,
  };

  return c;
};
