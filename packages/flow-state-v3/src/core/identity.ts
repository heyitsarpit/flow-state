import { actorKey, type ActorId, byCodeUnits } from "./world.ts";
import { type Brand, Option, Predicate, Result, Schema } from "effect";
import { parseCanonical, writeJson } from "./codec.ts";
import { type Compiled, type Field, type Operation, Source, type Values } from "./compiled.ts";
import { defect } from "./defect.ts";
import { escapeContract, unescapeContract, unescapeSegment } from "./key-text.ts";

/**
 * The prefix of a local actor's name: a singleton's literal name may not start with it, and a
 * value-named actor's name is JSON text, so a local actor never shares a shared actor's identity.
 */
export const LOCAL_PREFIX = "~";

/**
 * Whether a name is a local actor's: local actors never save and no ref names one.
 */
export const isLocalName = (name: string) => name.startsWith(LOCAL_PREFIX);

/**
 * A machine's input fields, by name: the fields that name a value-named actor.
 */
export const inputFieldsOf = (compiled: Compiled) =>
  compiled.fields
    .filter((f) => Source.$is("Input")(f.source))
    .toSorted((a, b) => byCodeUnits(a.name, b.name));

/**
 * The Schema of a machine's name: its input fields, each by its own Schema, in field-name order;
 * a name is this Struct's encoded form as JSON text.
 */
export const nameSchemaOf = (fields: ReadonlyArray<Field>) =>
  Schema.Struct(
    Object.fromEntries(
      fields
        .filter((f) => Source.$is("Input")(f.source))
        .toSorted((a, b) => byCodeUnits(a.name, b.name))
        .map((f) => [f.name, f.schema]),
    ),
  );

/**
 * The name a value names an actor by: its input fields, each checked by its Schema's type side
 * and encoded, in field-name order, as JSON text. Fields the value has beyond its input are not
 * part of the identity. Fails with the first field that is missing or does not type-check, or,
 * when every field checks, with none: the input has no encoded form.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a ref's value is the caller's; each input field is checked before it is trusted.
export const nameOfValue = (compiled: Compiled, value: unknown) => {
  const input: Record<string, unknown> = {};

  for (const field of inputFieldsOf(compiled)) {
    const given = Predicate.hasProperty(value, field.name) ? value[field.name] : undefined;

    if (!field.is(given)) return Result.fail(Option.some(field.name));
    input[field.name] = given;
  }

  return Result.mapError(
    Result.flatMap(compiled.identity.encode(input), (encoded) =>
      Result.mapError(writeJson(encoded), () => "schema"),
    ),
    () => Option.none<string>(),
  );
};

/**
 * The input a saved record's name names: a value-named actor's input fields decoded from its name,
 * or nothing for a singleton. Fails `name` for a local
 * actor's name, since local actors never save, and for a name that does not decode by the
 * machine's identity or whose input does not name it back, so no other actor's name stands for it.
 */
// RETURN_TYPE: an actor's input is the Values creation takes.
export const decodeName = (compiled: Compiled, name: string): Result.Result<Values, "name"> => {
  if (isLocalName(name)) return Result.fail("name");

  if (inputFieldsOf(compiled).length === 0) return Result.succeed({});

  return Result.mapError(
    Result.flatMap(
      Result.mapError(parseCanonical(name), () => "json"),
      (json) =>
        Result.flatMap(compiled.identity.decode(json), (input) =>
          Result.flatMap(
            Result.mapError(nameOfValue(compiled, input), () => "schema"),
            (again) =>
              again === name ? Result.succeed<Values>({ ...input }) : Result.fail("other"),
          ),
        ),
    ),
    () => "name" as const,
  );
};

/**
 * The input an actor is created from, by its name: nothing for a local actor, whose input comes
 * with its creation. Any other name reaches here only from a ref or a record the boot read, both
 * checked by `decodeName`, so a name that does not decode is a defect.
 */
// RETURN_TYPE: an actor's input is the Values creation takes.
export const inputOfName = (compiled: Compiled, name: string): Values =>
  isLocalName(name)
    ? {}
    : Result.getOrElse(decodeName(compiled, name), () =>
        defect(`an actor name no admission or boot check read: ${name}`),
      );

/**
 * The order incarnations started in: the counter their id was minted with.
 */
export const startOrder = (incarnation: { readonly id: string }) =>
  Number(incarnation.id.slice(incarnation.id.lastIndexOf("-") + 1));

/**
 * A saved actor's name: one its machine's identity decodes and names back, never a local actor's.
 */
export type ActorName = string & Brand.Brand<"flow-state/ActorName">;

/**
 * An Attempt id as the Runtime mints it: `att-`, the session's seed in hex, and its count.
 */
export type AttemptId = string & Brand.Brand<"flow-state/AttemptId">;

/**
 * A leaf state of a machine, by its path.
 */
export type StateName = string & Brand.Brand<"flow-state/StateName">;

/**
 * A record's key: `actor/`, `lane/` or `owed/`, then an identity of a declared, persisted machine.
 */
export type RecordKey = string & Brand.Brand<"flow-state/RecordKey">;

/**
 * A lane's id: its identity, the contract its machine writes and its key text.
 */
export type LaneKey = string & Brand.Brand<"flow-state/LaneKey">;

/**
 * A lane's place after its identity, as an owed row of that identity names it: the contract of a
 * write operation its machine declares and key text that names itself back.
 */
export type LaneTail = string & Brand.Brand<"flow-state/LaneTail">;

/**
 * An operation its machine declares, by name.
 */
export type OperationName = string & Brand.Brand<"flow-state/OperationName">;

/**
 * An identity's text as a graph names it: a machine the app declares and a name its identity
 * decodes and names back.
 */
export type IdentityKey = string & Brand.Brand<"flow-state/IdentityKey">;

/**
 * An identity as a saved record names it.
 */
export type NamedActor = { readonly machine: string; readonly name: ActorName };

/**
 * The Schema of a saved name of `compiled`'s actors.
 */
export const actorNameOf = (compiled: Compiled) =>
  Schema.String.check(
    Schema.makeFilter((name: string) => Result.isSuccess(decodeName(compiled, name))),
  ).pipe(Schema.brand("flow-state/ActorName"));

/**
 * The Schema of an Attempt id the Runtime mints.
 */
export const AttemptIdSchema = Schema.String.check(
  Schema.isPattern(/^att-[\da-f]+-[1-9]\d*$/u),
).pipe(Schema.brand("flow-state/AttemptId"));

/**
 * The Schema of a lane's place after its identity, by `compiled`'s write operations.
 */
export const laneTailOfMachine = (compiled: Compiled) =>
  Schema.String.check(
    Schema.makeFilter((tail: string) => Result.isSuccess(laneTailParts(compiled, tail))),
  ).pipe(Schema.brand("flow-state/LaneTail"));

/**
 * The Schema of an operation `compiled` declares.
 */
export const operationNameOf = (compiled: Compiled) =>
  Schema.String.check(Schema.makeFilter((name: string) => compiled.operations.has(name))).pipe(
    Schema.brand("flow-state/OperationName"),
  );

/**
 * The operation of a lane an owed row names by its place after the identity, which its Schema
 * read; a place no Schema read is a defect.
 */
export const operationOfTail = (compiled: Compiled, tail: LaneTail) =>
  Result.match(laneTailParts(compiled, tail), {
    onSuccess: ({ operation }) => brandedAs<OperationName>(operation.name),
    onFailure: () => defect(`an owed row's lane no record Schema read: ${tail}`),
  });

/**
 * The Schema of an identity's text, by the machines `machines` declares.
 */
export const identityKeyOf = (machines: ReadonlyMap<string, Compiled>) =>
  Schema.String.check(
    Schema.makeFilter((key: string) => Option.isSome(readActorKey(machines, key))),
  ).pipe(Schema.brand("flow-state/IdentityKey"));

/**
 * Whether a saved memory's input fields give the name its record's key names: input fields never
 * change, so a record whose memory names another actor is not this actor's. A singleton's memory
 * has none, so any memory is its own.
 */
export const memoryNamesActor = (compiled: Compiled, name: string, memory: Values) =>
  inputFieldsOf(compiled).length === 0 ||
  Result.getOrUndefined(nameOfValue(compiled, memory)) === name;

/**
 * The Schema of a leaf state of `compiled`.
 */
export const stateNameOf = (compiled: Compiled) =>
  Schema.String.check(
    Schema.makeFilter((path: string) => compiled.states.get(path)?.children.length === 0),
  ).pipe(Schema.brand("flow-state/StateName"));

/**
 * The id a write lane is kept under: its identity, its operation's contract and its key text.
 */
export const laneId = (actor: ActorId, contract: string, keyText: string) =>
  `${actorKey(actor)}|${escapeContract(contract)}|${keyText}`;

/**
 * The part of a lane id after its identity, which an owed row of that identity names it by.
 */
export const laneTailOf = (actor: ActorId, id: string) => id.slice(actorKey(actor).length + 1);

/**
 * The id of an identity's lane an owed row of that identity names by its place after the identity.
 */
export const laneKeyOf = (actor: ActorId, tail: LaneTail) =>
  brandedAs<LaneKey>(`${actorKey(actor)}|${tail}`);

/**
 * The key an identity's saved rows are stored under: one record, in the order they were owed.
 */
export const owedRecordKey = (key: string) => `owed/${key}`;

/**
 * The key an actor's record is stored under.
 */
export const actorRecordKey = (key: string) => `actor/${key}`;

/**
 * The key a lane's record is stored under.
 */
export const laneRecordKey = (lane: string) => `lane/${lane}`;

/**
 * The kinds of record a store holds, by the prefix of their keys.
 */
export type RecordKind = "actor" | "lane" | "owed";

const KINDS: ReadonlyArray<RecordKind> = ["actor", "lane", "owed"];

/**
 * The longest machine id of `ids` an identity's text starts with, followed by `/`.
 */
const machineIn = (ids: Iterable<string>, text: string) =>
  Option.fromUndefinedOr(
    [...ids].filter((id) => text.startsWith(`${id}/`)).toSorted((a, b) => b.length - a.length)[0],
  );

/**
 * A record key's kind, by its prefix, and the text after it.
 */
export const kindOfKey = (key: string) =>
  Option.flatMap(Option.fromUndefinedOr(KINDS.find((k) => key.startsWith(`${k}/`))), (kind) =>
    Option.some({ kind, rest: key.slice(kind.length + 1) }),
  );

/**
 * The machine of `ids` a record key names, if any: for telling which app a stored key belongs to.
 */
export const machineOfKey = (ids: Iterable<string>, key: string) =>
  Option.flatMap(kindOfKey(key), ({ rest }) => machineIn(ids, rest));

/**
 * A lane's place after its identity, read by the machine's write operations: the write operation
 * of the contract it names, and its key text, which reads by that operation's key fields in their
 * input order and is written back byte for byte.
 */
export const laneTailParts = (compiled: Compiled, tail: string) => {
  const bar = tail.indexOf("|");

  if (bar < 0) return Result.fail("key");

  const contract = unescapeContract(tail.slice(0, bar));
  const keyText = tail.slice(bar + 1);

  const operation = Option.flatMap(contract, (c) =>
    Option.fromUndefinedOr(
      [...compiled.operations.values()].find((o) => o._tag === "Write" && o.contract === c),
    ),
  );

  return Option.match(operation, {
    onNone: () => Result.fail("operation"),
    onSome: (o) => Result.map(keyNamesItself(o, keyText), () => ({ operation: o, keyText })),
  });
};

// A lane key's text: its operation's key fields in their input order, as JSON text written back
// byte for byte; its values are read by their Schemas only when a head's input names it.
const keyNamesItself = (operation: Operation, text: string) =>
  Result.flatMap(
    Result.mapError(parseCanonical(text), () => "key"),
    (json) =>
      Predicate.isObject(json) &&
      !Array.isArray(json) &&
      Object.keys(json).join("\n") ===
        operation.inputFields.filter((f) => operation.keyFields.includes(f)).join("\n") &&
      Result.getOrUndefined(writeJson(json)) === text
        ? Result.succeed(text)
        : Result.fail("key"),
  );

/**
 * An identity's text read back, as `actorKey` writes it: a machine of `machines` and a name its
 * identity decodes and names back, never a local actor's. Also the text after a record key's
 * kind, up to a lane's contract.
 */
export const readActorKey = (machines: ReadonlyMap<string, Compiled>, text: string) =>
  Option.flatMap(
    Option.flatMap(machineIn(machines.keys(), text), (id) =>
      Option.fromUndefinedOr(machines.get(id)),
    ),
    (compiled) =>
      Option.map(
        Option.filter(unescapeSegment(text.slice(compiled.id.length + 1)), (n) =>
          Result.isSuccess(decodeName(compiled, n)),
        ),
        (name) => ({
          compiled,
          actor: { machine: compiled.id, name: brandedAs<ActorName>(name) } satisfies NamedActor,
        }),
      ),
  );

/**
 * A record key read by the machines a Runtime runs.
 */
export type KeyParts =
  | {
      readonly kind: "actor" | "owed";
      readonly key: RecordKey;
      readonly compiled: Compiled;
      readonly actor: NamedActor;
    }
  | {
      readonly kind: "lane";
      readonly key: RecordKey;
      readonly compiled: Compiled;
      readonly actor: NamedActor;
      readonly id: LaneKey;
      readonly operation: Operation;
      readonly operationName: OperationName;
      readonly keyText: string;
    };

/**
 * Why a key names no record: no kind, a machine no entry declares (`machine`) or one that does
 * not persist (`persist`), or a name, contract or key text that does not read.
 */
export type KeyFailure = "kind" | "machine" | "persist" | "name" | "operation" | "key";

/**
 * Reads a record key: its kind, a declared and persisted machine, a name its machine's identity
 * decodes and names back (never a local actor's), and for a lane, the contract of a write
 * operation and key text that names itself back. One key spells one record.
 */
// RETURN_TYPE: the key's parts, by kind, or why it names no record.
export const readRecordKey = (
  machines: ReadonlyMap<string, Compiled>,
  key: string,
): Result.Result<KeyParts, KeyFailure> => {
  const kinded = kindOfKey(key);

  if (Option.isNone(kinded)) return Result.fail("kind");

  const { kind, rest } = kinded.value;

  const persisted = new Map([...machines].filter(([, c]) => c.persist));

  if (Option.isNone(machineIn(machines.keys(), rest))) return Result.fail("machine");

  if (Option.isNone(machineIn(persisted.keys(), rest))) return Result.fail("persist");

  const bar = kind === "lane" ? rest.indexOf("|") : rest.length;

  if (bar < 0) return Result.fail("key");

  const named = readActorKey(persisted, rest.slice(0, bar));

  if (Option.isNone(named)) return Result.fail("name");

  const { compiled, actor } = named.value;

  if (kind !== "lane")
    return Result.succeed({ kind, key: brandedAs<RecordKey>(key), compiled, actor });

  return Result.map(
    Result.mapError(laneTailParts(compiled, rest.slice(bar + 1)), (why) =>
      why === "operation" ? "operation" : "key",
    ),
    ({ operation, keyText }) => ({
      kind,
      key: brandedAs<RecordKey>(key),
      compiled,
      actor,
      id: brandedAs<LaneKey>(rest),
      operation,
      operationName: brandedAs<OperationName>(operation.name),
      keyText,
    }),
  );
};

// A text read by its Schema's check, given the brand that check stands for.
const brandedAs = <B extends string>(text: string) =>
  // SAFETY: called only on a text its brand's own check (readRecordKey's reading) accepted.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a brand is type-only; the reading above is its check
  text as B;
