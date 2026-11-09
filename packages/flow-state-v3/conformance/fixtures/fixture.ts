import type { Schema } from "effect";
import type { OperationReference } from "./reference.ts";

/**
 * One write of a fixture: the Schema of its key, as `O.x.get` takes it, and what the suite expects
 * of it.
 */
export type Operation<Key extends Schema.Codec<unknown, unknown> = Schema.Codec<unknown, unknown>> =
  { readonly key: Key; readonly reference: OperationReference };

/**
 * One machine the suite boots, as the suite knows it: its catalog name, its machine id, and the
 * Schemas of its events, memory, input and write keys.
 *
 * **When to use**
 *
 * Scenarios import fixtures and name them in `fixtures`; `Case.actor(fixture, id)` gives a view of
 * one actor typed by these Schemas, so a wrong event name or payload is a type error.
 *
 * **Details**
 *
 * - Written by hand from the prototype fixture's source (`prototypes/conformance/typed/`), which
 *   the prototype adapter loads by catalog name. Phase 4 writes fixtures in the public API, and
 *   these Schemas come from the definitions themselves.
 * - `events` names the external events a case may send, each with its payload's Schema.
 * - `operations` names the writes, each with its key's Schema and its reference.
 * - With no type arguments, `Fixture` is any fixture.
 */
export type Fixture<
  Events extends Readonly<Record<string, Schema.Codec<unknown, unknown>>> = Readonly<
    Record<string, Schema.Codec<unknown, unknown>>
  >,
  Memory extends Schema.Codec<unknown, unknown> = Schema.Codec<unknown, unknown>,
  Input extends Schema.Codec<unknown, unknown> = Schema.Codec<unknown, unknown>,
  Keys extends Readonly<Record<string, Schema.Codec<unknown, unknown>>> = Readonly<
    Record<string, Schema.Codec<unknown, unknown>>
  >,
> = {
  readonly name: string;
  readonly machine: string;
  readonly events: Events;
  readonly memory: Memory;
  readonly input: Input;
  readonly operations: { readonly [O in keyof Keys]: Operation<Keys[O]> };
};

/**
 * The reference of a case: each fixture's operations' references, by machine id.
 */
export const referenceFor = (fixtures: ReadonlyArray<Fixture>) =>
  Object.fromEntries(
    fixtures.map((fixture) => [
      fixture.machine,
      Object.fromEntries(
        Object.entries(fixture.operations).map(([name, operation]) => [name, operation.reference]),
      ),
    ]),
  );
