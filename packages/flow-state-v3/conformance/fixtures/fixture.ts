import { Predicate, Schema } from "effect";
import type { Concurrency, OperationReference, Row, Rows } from "./reference.ts";

/**
 * The Schema of a payload, input or key with no fields: only `{}` type-checks against it, where
 * `Schema.Struct({})`'s type `{}` would take any value.
 */
export const Empty = Schema.Record(Schema.String, Schema.Never);

const Progress = Schema.OptionFromOptionalKey(Schema.Json);

/**
 * The row of a `reject` or `latest` write: `pending`, `uncertain`, `waiting` and `retryCount`,
 * and `progress` when the runtime publishes one.
 *
 * **Details**
 *
 * A runtime that omits `progress` decodes to `None`.
 */
export const RejectRow = Schema.Struct({
  pending: Schema.Boolean,
  uncertain: Schema.Boolean,
  waiting: Schema.Boolean,
  retryCount: Schema.Number,
  progress: Progress,
});

/**
 * The row of a `serialize` write: {@link RejectRow} plus `outstanding`, how many writes wait
 * behind the head.
 */
export const SerializeRow = Schema.Struct({ ...RejectRow.fields, outstanding: Schema.Number });

/**
 * The row of a `cancel` write: `pending` and `retryCount`, and `progress` when published. A
 * `cancel` row has no `uncertain` or `waiting`.
 */
export const CancelRow = Schema.Struct({
  pending: Schema.Boolean,
  retryCount: Schema.Number,
  progress: Progress,
});

const ROWS = {
  reject: RejectRow,
  latest: RejectRow,
  serialize: SerializeRow,
  cancel: CancelRow,
} as const;

/**
 * The row Schema of a write under `concurrency`: the policy picks the row's fields.
 *
 * **When to use**
 *
 * {@link writeOf} derives each operation's row from its reference's `concurrency`; a fixture does
 * not name a row itself.
 */
export const rowFor = <C extends Concurrency>(concurrency: C) => ROWS[concurrency];

/**
 * One write of a fixture: the Schema of its key, as `O.x.get` takes it, the Schema of its row, and
 * what the suite expects of it.
 */
export type Operation<
  Key extends Schema.Codec<unknown, unknown> = Schema.Codec<unknown, unknown>,
  Row extends Schema.Codec<unknown, unknown> = Schema.Codec<unknown, unknown>,
> = { readonly key: Key; readonly row: Row; readonly reference: OperationReference };

const fieldsOf = (key: Schema.Top) =>
  Predicate.hasProperty(key, "fields") && Predicate.isObject(key.fields)
    ? Object.keys(key.fields)
    : [];

/**
 * One write of a fixture from its key's Schema and its reference, with its row's Schema derived
 * from the reference's `concurrency` and its key fields from the key's Schema.
 *
 * **When to use**
 *
 * Write every operation with it, so each row is decoded by the Schema of its policy.
 */
export const writeOf = <
  Key extends Schema.Codec<unknown, unknown>,
  Reference extends Omit<OperationReference, "keyFields">,
>(
  key: Key,
  reference: Reference,
) => ({
  key,
  row: rowFor<Reference["concurrency"]>(reference.concurrency),
  reference: { ...reference, keyFields: fieldsOf(key) },
});

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
 * - `states` lists the machine's leaf states; `Actor.state` takes one of them or `(absent)`.
 * - `operations` names the writes, each with its key's Schema, its row's Schema and its reference.
 * - `rows` lists the alternatives that run lane members ({@link Row}), compared with the compiled
 *   machine by `fixtures/rows.test.ts` (a change detector).
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
  readonly states: ReadonlyArray<string>;
  readonly operations: { readonly [O in keyof Keys]: Operation<Keys[O]> };
  readonly rows: ReadonlyArray<Row>;
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

/**
 * The rows of a case: each fixture's {@link Row}s, by machine id.
 */
// RETURN_TYPE: the Rows record; `Object.fromEntries` would infer a wider value type.
export const rowsFor = (fixtures: ReadonlyArray<Fixture>): Rows =>
  Object.fromEntries(fixtures.map((fixture) => [fixture.machine, fixture.rows]));
