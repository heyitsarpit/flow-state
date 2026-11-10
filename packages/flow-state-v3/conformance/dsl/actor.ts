import { Data, Option, Schema } from "effect";
import type { Fixture } from "../fixtures/fixture.ts";
import { Snapshot, type Use } from "../port.ts";
import type { Case, Drive } from "./case.ts";
import { Mismatch } from "./oracle.ts";

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
 * - `memory` is the actor's memory decoded with the fixture's Schema; it throws `Mismatch` when
 *   nothing is live.
 * - `row` is a write's row decoded with its operation's row Schema, so its fields follow the
 *   operation's concurrency; a row that does not decode is a defect.
 */
export type Actor<F extends Fixture> = {
  readonly ensure: () => void;
  readonly event: <E extends EventName<F>>(event: E, payload: F["events"][E]["Type"]) => Drive;
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
export const actorView = <F extends Fixture>(c: Case, fixture: F, id: string): Actor<F> => {
  const ref = { machine: fixture.machine, id };

  const event = <E extends EventName<F>>(name: E, payload: F["events"][E]["Type"]) => ({
    actor: ref,
    event: name,
    payload: encoded(declared(fixture.events, name), payload),
    part: [],
  });

  return {
    ensure: () => c.ensure(ref, Option.none()),
    event,
    send: (name, payload) => c.send([event(name, payload)]),
    release: (use) => c.release(ref, use),
    dispose: () => c.dispose(ref),
    forget: () => c.forget(ref),
    state: (expected) =>
      c.eq(
        "state",
        Snapshot.$match(c.snapshot(ref), {
          Live: ({ state }) => state,
          Absent: () => "(absent)",
        }),
        expected,
      ),
    memory: () =>
      Snapshot.$match(c.snapshot(ref), {
        Live: ({ memory }) => Schema.decodeSync(Schema.toCodecJson(fixture.memory))(memory),
        Absent: () => {
          throw new Mismatch({ label: "memory", expected: "(live)", actual: "(absent)" });
        },
      }),
    row: (operation, key) => {
      const write = declared(fixture.operations, operation);

      return Option.map(
        c.row(ref, operation, encoded(write.key, key)),
        Schema.decodeUnknownSync(write.row),
      );
    },
  };
};
