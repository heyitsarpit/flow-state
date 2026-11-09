import { Data, Effect, Option, Schema } from "effect";
import type { Fixture } from "../fixtures/fixture.ts";
import { type ActorRef, Snapshot, type Use } from "../port.ts";
import { type Drive, type Driver, Mismatch, type Step } from "./case.ts";

/**
 * The events a fixture's actor takes, by name.
 */
export type EventName<F extends Fixture> = keyof F["events"] & string;

/**
 * The write operations of a fixture, by name.
 */
export type OperationName<F extends Fixture> = keyof F["operations"] & string;

/**
 * One actor of a fixture, typed by the fixture's Schemas: a wrong event name, payload, input,
 * memory field or row key is a type error.
 *
 * **When to use**
 *
 * Make one with `Case.actor(fixture, id)` and drive it; its steps are the Case's, with values
 * encoded by the fixture's Schemas on the way to the Port and decoded on the way back.
 *
 * **Details**
 *
 * - `event` builds a {@link Drive} for `Case.send`, which sends several in one step.
 * - `state` expects one of the fixture's `states` or `(absent)` when nothing is live.
 * - `memory` is the actor's memory decoded with the fixture's Schema; it fails with `Mismatch` when
 *   nothing is live.
 * - `row` is a write's row decoded with its operation's row Schema, so its fields follow the
 *   operation's concurrency; a row that does not decode is a defect.
 */
export type Actor<F extends Fixture> = {
  readonly ref: ActorRef;
  readonly ensure: Step;
  readonly ensureWith: (input: F["input"]["Type"]) => Step;
  readonly event: <E extends EventName<F>>(event: E, payload: F["events"][E]["Type"]) => Drive;
  readonly send: <E extends EventName<F>>(event: E, payload: F["events"][E]["Type"]) => Step;
  readonly release: (use: Use) => Step;
  readonly dispose: Step;
  readonly state: (expected: F["states"][number] | "(absent)") => Effect.Effect<void, Mismatch>;
  readonly memory: Effect.Effect<F["memory"]["Type"], Mismatch>;
  readonly row: <O extends OperationName<F>>(
    operation: O,
    key: F["operations"][O]["key"]["Type"],
  ) => Effect.Effect<Option.Option<F["operations"][O]["row"]["Type"]>>;
};

/**
 * A name an actor view looked up is not in its fixture: the view's types make this unreachable.
 */
export class NotInFixture extends Data.TaggedError("NotInFixture")<{ readonly name: string }> {}

const declared = <T extends Readonly<Record<string, unknown>>, K extends keyof T & string>(
  table: T,
  name: K,
) => Option.getOrThrowWith(Option.fromUndefinedOr(table[name]), () => new NotInFixture({ name }));

const encoded = <A, E>(schema: Schema.Codec<A, E>, value: A) =>
  Schema.encodeSync(Schema.toCodecJson(schema))(value);

/**
 * The typed view of actor `id` of `fixture` over a Case's steps.
 */
// RETURN_TYPE: the exported Actor contract; inference would lose the generic methods' links.
export const actorView = <F extends Fixture>(driver: Driver, fixture: F, id: string): Actor<F> => {
  const ref = { machine: fixture.machine, id };

  const event = <E extends EventName<F>>(name: E, payload: F["events"][E]["Type"]) => ({
    actor: ref,
    event: name,
    payload: encoded(declared(fixture.events, name), payload),
  });

  return {
    ref,
    ensure: driver.ensure(ref, Option.none()),
    ensureWith: (input) => driver.ensure(ref, Option.some(encoded(fixture.input, input))),
    event,
    send: (name, payload) => driver.send([event(name, payload)]),
    release: (use) => driver.release(ref, use),
    dispose: driver.dispose(ref),
    state: (expected) =>
      Effect.flatMap(driver.snapshot(ref), (snapshot) =>
        driver.eq(
          "state",
          Snapshot.$match(snapshot, { Live: ({ state }) => state, Absent: () => "(absent)" }),
          expected,
        ),
      ),
    memory: Effect.flatMap(driver.snapshot(ref), (snapshot) =>
      Snapshot.$match(snapshot, {
        Live: ({ memory }) =>
          Effect.orDie(Schema.decodeEffect(Schema.toCodecJson(fixture.memory))(memory)),
        Absent: () =>
          Effect.fail(new Mismatch({ label: "memory", expected: "(live)", actual: "(absent)" })),
      }),
    ),
    row: (operation, key) => {
      const write = declared(fixture.operations, operation);

      return Effect.flatMap(
        driver.row(ref, operation, encoded(write.key, key)),
        Option.match({
          onNone: () => Effect.succeed(Option.none()),
          onSome: (json) =>
            Effect.map(Effect.orDie(Schema.decodeUnknownEffect(write.row)(json)), Option.some),
        }),
      );
    },
  };
};
