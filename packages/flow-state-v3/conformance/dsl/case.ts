import { Data, Option } from "effect";
import type { Reference } from "../fixtures/reference.ts";
import { sameData } from "../oracles/equality.ts";
import { Fact, type Oracle } from "../oracles/oracle.ts";
import {
  type ActorRef,
  Observation,
  type Port,
  type Row,
  type Runtime,
  Snapshot,
} from "../port.ts";
import { type Answer, NoHeldRequest, type Request } from "../world/network.ts";
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
  readonly oracle: string;
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
 * The driver one case runs through: steps that settle the world and run every oracle, and reads
 * of public results.
 *
 * **Details**
 *
 * - Every step records itself on the timeline, runs, settles the world, notes the requests it
 *   made, then runs the oracles; a violation throws `Violated`.
 * - `eq` and `state` throw `Mismatch`.
 * - A reload kills the page and boots the port again over the same world, then re-attaches every
 *   use the case holds.
 */
export type Case = {
  readonly actor: ActorRef;
  readonly world: World;
  readonly ensure: (actor?: ActorRef, input?: unknown) => void;
  readonly send: (event: string, payload?: unknown) => void;
  readonly to: (actor: ActorRef, event: string, payload?: unknown) => void;
  readonly ack: (match?: string) => void;
  readonly refuse: (match?: string) => void;
  readonly answer: (
    operation: string,
    answer: Answer,
    where?: Readonly<Record<string, unknown>>,
  ) => void;
  readonly advance: (ms: number) => void;
  readonly reload: () => void;
  readonly eq: (label: string, actual: unknown, expected: unknown) => void;
  readonly state: (expected: string, actor?: ActorRef) => void;
  readonly memory: (actor?: ActorRef) => Readonly<Record<string, unknown>>;
  readonly row: (operation: string, key: unknown, actor?: ActorRef) => Option.Option<Row>;
  readonly requests: (operation: string) => ReadonlyArray<Request>;
  readonly keys: (operation: string) => ReadonlyArray<string>;
  readonly landed: (operation: string) => number;
  readonly endings: (
    operation: string,
  ) => ReadonlyArray<Extract<Observation, { readonly _tag: "Ended" }>>;
  readonly evidence: (kind: Extract<Observation, { readonly _tag: "Evidence" }>["kind"]) => number;
};

const record = (value: unknown): Readonly<Record<string, unknown>> => {
  const out: Record<string, unknown> = {};

  if (value === null || value === undefined) return out;

  for (const [k, v] of Object.entries(value)) out[k] = v;

  return out;
};

/**
 * Builds the driver for one scenario over a port, with the oracles it runs after every step.
 *
 * **Details**
 *
 * The world's seed is fixed per case, so every run of a case is the same run.
 */
export const openCase = (
  port: Port,
  scenario: Scenario,
  reference: Reference,
  oracles: ReadonlyArray<Oracle>,
): Case => {
  const world = makeWorld(1);
  const timeline: Array<Fact> = [];
  const uses: Array<ActorRef> = [];
  let step = 0;
  let seenRequests = 0;

  const boot = (): Runtime =>
    port.boot({
      fixtures: scenario.fixtures,
      captureMs: 0,
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

    for (const oracle of oracles) {
      const [violation] = oracle.check(facts);

      if (violation !== undefined)
        throw new Violated({ oracle: oracle.name, violation, step: what });
    }
  };

  const act = (what: string, run: () => void) => {
    step += 1;
    timeline.push(Fact.Stepped({ step, what }));
    run();
    settle(world, pending);
    noteRequests();
    judge(what);
  };

  const snapshotOf = (actor: ActorRef) => runtime.snapshot(actor);

  const c: Case = {
    actor: scenario.actor,
    world,
    ensure: (actor = scenario.actor, input) =>
      act(`ensure ${actor.id}`, () => {
        uses.push(actor);
        runtime.ensure(actor, Option.fromUndefinedOr(input));
      }),
    send: (event, payload = {}) => c.to(scenario.actor, event, payload),
    to: (actor, event, payload = {}) =>
      act(`send ${event}`, () => runtime.send(actor, event, payload)),
    ack: (match) => act("ack", () => void world.storage.answer("ack", match)),
    refuse: (match) => act("refuse", () => void world.storage.answer("refuse", match)),
    answer: (operation, answer, where) =>
      act(`answer ${operation} ${answer._tag}`, () => {
        const held = world.network.oldestOpen(operation, Option.fromUndefinedOr(where));

        if (Option.isNone(held)) throw new NoHeldRequest({ operation });
        timeline.push(Fact.Answered({ request: held.value, answer }));
        world.network.answer(held.value, answer);
      }),
    advance: (ms) => {
      step += 1;
      timeline.push(Fact.Stepped({ step, what: `advance ${ms}` }));
      advance(world, ms, pending);
      noteRequests();
      judge(`advance ${ms}`);
    },
    reload: () =>
      act("reload", () => {
        kill(world);
        timeline.push(Fact.Reloaded());
        runtime = boot();

        for (const actor of uses) runtime.ensureExisting(actor);
      }),
    eq: (label, actual, expected) => {
      if (!sameData(actual, expected)) throw new Mismatch({ label, expected, actual });
    },
    state: (expected, actor = scenario.actor) =>
      c.eq(
        "state",
        Snapshot.$match(snapshotOf(actor), {
          Live: ({ state }) => state,
          Absent: () => "(absent)",
        }),
        expected,
      ),
    memory: (actor = scenario.actor) =>
      Snapshot.$match(snapshotOf(actor), {
        Live: ({ memory }) => record(memory),
        Absent: () => ({}),
      }),
    row: (operation, key, actor = scenario.actor) => runtime.row(actor, operation, key),
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
      timeline.flatMap((fact) =>
        Fact.$is("Reported")(fact) &&
        Observation.$is("Ended")(fact.observation) &&
        fact.observation.operation === operation
          ? [fact.observation]
          : [],
      ),
    evidence: (kind) =>
      timeline.filter(
        (fact) =>
          Fact.$is("Reported")(fact) &&
          Observation.$is("Evidence")(fact.observation) &&
          fact.observation.kind === kind,
      ).length,
  };

  return c;
};
