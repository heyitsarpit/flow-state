import { Context, Data, Effect, Equal, Exit, Layer, Option, type Schema, Scope } from "effect";
import { type Fixture, referenceFor } from "../fixtures/fixture.ts";
import { Fact, type Oracle, reported } from "../oracles/oracle.ts";
import {
  type ActorRef,
  Boot,
  type EvidenceKind,
  type Json,
  Observation,
  Runtime,
  sameActor,
  type Snapshot,
  type Use,
} from "../port.ts";
import { Page } from "../world/page.ts";
import { type Answer, Network, NoHeldRequest, type Request } from "../world/network.ts";
import { Storage, type StorageAnswer } from "../world/storage.ts";
import { type Hosts, World } from "../world/world.ts";
import { type Actor, actorView } from "./actor.ts";
import { Timeline } from "./timeline.ts";

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

/**
 * A step: it settles the world and runs every oracle, failing with `Violated`.
 */
export type Step = Effect.Effect<void, Violated>;

const shown = <A>(value: A) => String(JSON.stringify(value));

/**
 * The scenario DSL one case runs through, fixture-agnostic: steps that settle the world and run
 * every oracle, and reads of public results. `actor` gives a typed view of one actor.
 *
 * **When to use**
 *
 * A scenario's `run` is an `Effect.gen` that takes this with `yield* Case`, makes its actors with
 * `actor(fixture, id)` and drives them.
 *
 * **Details**
 *
 * - Every step records itself on the timeline, runs, settles the world, notes the requests it
 *   made, then runs every oracle; any violation fails the step with `Violated`, naming every
 *   oracle that found one in that step.
 * - `eq` fails with `Mismatch` unless the two values are equal by Effect's structural equality.
 * - A reload kills the page, interrupts the boot's scope (a dead page runs nothing)
 *   and builds the runtime's Layer again over the same world, then re-attaches every use the case
 *   holds: those its `Ensured`, `Released` and `Disposed` facts leave.
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
 * - A step that names a request the server does not hold dies with `NoHeldRequest`: a scenario
 *   bug, never a verdict.
 */
export class Case extends Context.Service<
  Case,
  {
    readonly actor: <F extends Fixture>(fixture: F, id: string) => Actor<F>;
    readonly ensure: (actor: ActorRef, input: Option.Option<Json>) => Step;
    readonly release: (actor: ActorRef, use: Use) => Step;
    readonly dispose: (actor: ActorRef) => Step;
    readonly disposeRuntime: Step;
    readonly send: (drives: ReadonlyArray<Drive>) => Step;
    readonly ack: Step;
    readonly answerStorage: (how: StorageAnswer, match: Option.Option<string>) => Step;
    readonly answer: (operation: string, answer: Answer) => Step;
    readonly answerWhere: (operation: string, answer: Answer, where: Schema.JsonObject) => Step;
    readonly answerLate: (operation: string, answer: Answer) => Step;
    readonly landLate: (operation: string) => Step;
    readonly uninterruptible: (operation: string) => Step;
    readonly answerAtOnce: (operation: string, answer: Answer) => Step;
    readonly hide: Step;
    readonly advance: (ms: number) => Step;
    readonly reload: Step;
    readonly eq: <A>(
      label: string,
      actual: A,
      expected: NoInfer<A>,
    ) => Effect.Effect<void, Mismatch>;
    readonly snapshot: (actor: ActorRef) => Effect.Effect<Snapshot>;
    readonly row: (
      actor: ActorRef,
      operation: string,
      key: Json,
    ) => Effect.Effect<Option.Option<Json>>;
    readonly requests: (operation: string) => Effect.Effect<ReadonlyArray<Request>>;
    readonly keys: (operation: string) => Effect.Effect<ReadonlyArray<string>>;
    readonly landed: (operation: string) => Effect.Effect<number>;
    readonly landedKeys: (operation: string) => Effect.Effect<ReadonlyArray<string>>;
    readonly endings: (
      operation: string,
    ) => Effect.Effect<ReadonlyArray<Extract<Observation, { readonly _tag: "Ended" }>>>;
    readonly evidence: (kind: EvidenceKind) => Effect.Effect<number>;
    readonly issues: Effect.Effect<ReadonlyArray<string>>;
    readonly denials: Effect.Effect<ReadonlyArray<ReadonlyArray<string>>>;
    readonly runtimeDisposals: Effect.Effect<number>;
    readonly reports: Effect.Effect<ReadonlyArray<Observation>>;
  }
>()("flow-state-v3/conformance/dsl/Case") {
  /**
   * The driver of one case: it boots `runtime` over the world for `fixtures` and runs `oracles`
   * after every step.
   *
   * **Details**
   *
   * Each boot builds `runtime` in its own scope under the case's, with a `Boot` from the page's
   * session seed; the case's end closes it, which disposes the Runtime.
   */
  static readonly layer = (options: {
    readonly fixtures: ReadonlyArray<Fixture>;
    readonly runtime: Layer.Layer<Runtime, never, Boot | Hosts>;
    readonly oracles: ReadonlyArray<Oracle>;
  }) =>
    Layer.effect(
      Case,
      Effect.gen(function* () {
        const world = yield* World;
        const network = yield* Network;
        const storage = yield* Storage;
        const page = yield* Page;
        const timeline = yield* Timeline;
        const hosts = yield* Effect.context<Hosts>();
        const scope = yield* Effect.scope;
        const reference = referenceFor(options.fixtures);
        const fixtures = options.fixtures.map((f) => f.name);

        const boot = Effect.gen(function* () {
          const own = yield* Scope.fork(scope);

          const built = yield* Layer.buildWithScope(
            Layer.fresh(options.runtime).pipe(
              Layer.provide(
                Layer.succeed(Boot)({
                  fixtures,
                  captureMs: 0,
                  sessionSeed: page.sessionSeed(),
                  observe: (observation) => timeline.record(Fact.Reported({ observation })),
                }),
              ),
              Layer.provide(Layer.succeedContext(hosts)),
            ),
            own,
          );

          return { scope: own, runtime: Context.get(built, Runtime) };
        });

        let booted = yield* boot;

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

        const judge = (what: string) =>
          Effect.suspend(() => {
            const facts = { timeline: timeline.facts(), requests: network.requests(), reference };

            const found = options.oracles.flatMap((oracle) => {
              const [violation] = oracle.check(facts);

              return violation === undefined ? [] : [{ oracle: oracle.name, violation }];
            });

            return found.length === 0
              ? Effect.void
              : Effect.fail(
                  new Violated({
                    oracles: found.map((f) => f.oracle),
                    violation: found.map((f) => `${f.oracle}: ${f.violation}`).join(" | "),
                    step: what,
                  }),
                );
          });

        const act = (what: string, run: Effect.Effect<void>) =>
          Effect.gen(function* () {
            timeline.record(Fact.Stepped({ step: count("Stepped") + 1, what }));
            yield* run;
            world.settle(() => booted.runtime.pending());
            noteRequests();
            yield* judge(what);
          });

        const held = (operation: string, request: Option.Option<Request>) =>
          Option.match(request, {
            onNone: () => Effect.die(new NoHeldRequest({ operation })),
            onSome: Effect.succeed,
          });

        const answer = (
          operation: string,
          given: Answer,
          where: Option.Option<Schema.JsonObject>,
        ) =>
          act(
            `answer ${operation} ${given._tag}`,
            Effect.gen(function* () {
              const request = yield* held(operation, network.oldestOpen(operation, where));
              timeline.record(Fact.Answered({ request, answer: given }));
              network.answer(request, given);
            }),
          );

        const answerStorage = (how: StorageAnswer, match: Option.Option<string>) =>
          act(
            how,
            Effect.sync(() => void storage.answer(how, match)),
          );

        const send = (drives: ReadonlyArray<Drive>) =>
          act(
            `send ${drives.map((d) => d.event).join(", ")}`,
            Effect.sync(() => {
              for (const { actor, event, payload } of drives) {
                timeline.record(Fact.Drove({ actor, event }));
                booted.runtime.send(actor, event, payload);
              }
            }),
          );

        const ensure = (actor: ActorRef, input: Option.Option<Json>) =>
          act(
            `ensure ${actor.id}`,
            Effect.sync(() => {
              timeline.record(Fact.Ensured({ actor }));
              booted.runtime.ensure(actor, input, "story");
            }),
          );

        const release = (actor: ActorRef, use: Use) =>
          act(
            `release ${actor.id}`,
            Effect.sync(() => {
              timeline.record(Fact.Released({ actor, use }));
              booted.runtime.release(actor, use);
            }),
          );

        const dispose = (actor: ActorRef) =>
          act(
            `dispose ${actor.id}`,
            Effect.sync(() => {
              timeline.record(Fact.Disposed({ actor }));
              booted.runtime.dispose(actor);
            }),
          );

        const eq = <A>(label: string, actual: A, expected: NoInfer<A>) =>
          Equal.equals(actual, expected)
            ? Effect.void
            : Effect.fail(
                new Mismatch({ label, expected: shown(expected), actual: shown(actual) }),
              );

        const snapshot = (actor: ActorRef) => Effect.sync(() => booted.runtime.snapshot(actor));

        const row = (actor: ActorRef, operation: string, key: Json) =>
          Effect.sync(() => booted.runtime.row(actor, operation, key));

        const requests = (operation: string) =>
          Effect.sync(() => network.requests().filter((r) => r.operation === operation));

        const landedKeys = (operation: string) =>
          Effect.sync(() =>
            network
              .landed()
              .filter((r) => r.operation === operation)
              .flatMap((r) => Option.toArray(r.key)),
          );

        const observed = Effect.sync(() => reported(timeline.facts()));

        const driver = {
          ensure,
          release,
          dispose,
          send,
          eq,
          snapshot,
          row,
        };

        return Case.of({
          actor: (fixture, id) => actorView(driver, fixture, id),
          ensure,
          release,
          dispose,
          disposeRuntime: act(
            "dispose the runtime",
            Effect.sync(() => {
              timeline.record(Fact.DisposingRuntime());
              booted.runtime.disposeRuntime();
            }),
          ),
          send,
          ack: answerStorage("ack", Option.none()),
          answerStorage,
          answer: (operation, given) => answer(operation, given, Option.none()),
          answerWhere: (operation, given, where) => answer(operation, given, Option.some(where)),
          answerLate: (operation, given) =>
            act(
              `late answer ${operation} ${given._tag}`,
              Effect.gen(function* () {
                const request = yield* held(operation, network.oldestUndecided(operation));
                timeline.record(Fact.Answered({ request, answer: given }));
                network.answerLate(request, given);
              }),
            ),
          landLate: (operation) =>
            act(
              `land late ${operation}`,
              Effect.gen(function* () {
                network.landLate(yield* held(operation, network.oldestLost(operation)));
              }),
            ),
          uninterruptible: (operation) =>
            act(
              `uninterruptible ${operation}`,
              Effect.sync(() => {
                timeline.record(Fact.Unstoppable({ operation }));
                network.uninterruptible(operation);
              }),
            ),
          answerAtOnce: (operation, given) =>
            act(
              `answer at once ${operation} ${given._tag}`,
              Effect.sync(() => network.answerAtOnce(operation, given)),
            ),
          hide: act(
            "hide",
            Effect.sync(() => {
              page.hide();
              page.show();
            }),
          ),
          advance: (ms) =>
            act(
              `advance ${ms}`,
              Effect.sync(() => world.advance(ms, () => booted.runtime.pending())),
            ),
          reload: act(
            "reload",
            Effect.gen(function* () {
              world.kill();
              timeline.record(Fact.Reloaded());
              yield* Scope.close(booted.scope, Exit.interrupt());
              booted = yield* boot;

              for (const [actor, use] of uses()) booted.runtime.ensureExisting(actor, use);
            }),
          ),
          eq,
          snapshot,
          row,
          requests,
          keys: (operation) =>
            Effect.map(requests(operation), (all) => [
              ...new Set(all.flatMap((r) => Option.toArray(r.key))),
            ]),
          landed: (operation) => Effect.map(landedKeys(operation), (keys) => new Set(keys).size),
          landedKeys,
          endings: (operation) =>
            Effect.map(observed, (all) =>
              all.flatMap((o) =>
                Observation.$is("Ended")(o) && o.operation === operation ? [o] : [],
              ),
            ),
          evidence: (kind) =>
            Effect.map(
              observed,
              (all) => all.filter((o) => Observation.$is("Evidence")(o) && o.kind === kind).length,
            ),
          issues: Effect.map(observed, (all) =>
            all.flatMap((o) => (Observation.$is("Issue")(o) ? [o.code] : [])),
          ),
          denials: Effect.map(observed, (all) =>
            all.flatMap((o) => (Observation.$is("Denied")(o) ? [o.reasons] : [])),
          ),
          runtimeDisposals: Effect.map(
            observed,
            (all) => all.filter(Observation.$is("RuntimeDisposed")).length,
          ),
          reports: observed,
        });
      }),
    );
}

/**
 * The steps and reads an actor view is made of: the Case's own.
 */
export type Driver = Pick<
  typeof Case.Service,
  "ensure" | "release" | "dispose" | "send" | "eq" | "snapshot" | "row"
>;

/**
 * One case: the machines it boots and what it drives and expects.
 *
 * **Details**
 *
 * - `cites`: the Spec Requirements and Invariants the case's expectations come from.
 * - `fixtures`: booted together.
 * - `run`: the case, through {@link Case}; it never reaches a runtime's internals.
 */
export type Scenario = {
  readonly id: string;
  readonly cites: ReadonlyArray<string>;
  readonly fixtures: ReadonlyArray<Fixture>;
  readonly run: Effect.Effect<void, Violated | Mismatch, Case>;
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
