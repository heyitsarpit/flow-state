import { type Brand, Option, Predicate, Result, Schema } from "effect";
import { parseCanonical, writeJson } from "./codec.ts";
import type { Compiled, Operation } from "./compiled.ts";
import { decodeName } from "./identity.ts";

type Json = Schema.Json;

/**
 * A machine id a record names, decoded against the machines a Runtime runs.
 */
export type MachineId = string & Brand.Brand<"flow-state/MachineId">;

/**
 * An actor's name, decoded by its machine's name codec and encoding back to the same text.
 */
export type ActorName = string & Brand.Brand<"flow-state/ActorName">;

/**
 * A leaf state's path, decoded against its machine's states.
 */
export type StateName = string & Brand.Brand<"flow-state/StateName">;

/**
 * A write contract's id, decoded against the contracts its machine writes.
 */
export type ContractName = string & Brand.Brand<"flow-state/ContractName">;

/**
 * A lane's key text, decoded by its operation's key fields and written back byte for byte.
 */
export type KeyText = string & Brand.Brand<"flow-state/KeyText">;

/**
 * Where a lane or a row sits in its identity: the root, the only subject a machine has yet.
 */
export type SubjectAddress = string & Brand.Brand<"flow-state/SubjectAddress">;

// RETURN_TYPE: a type guard narrows a JSON value to its object form.
const isJsonObject = (json: Json): json is { readonly [field: string]: Json } =>
  Predicate.isObject(json) && !Array.isArray(json);

/**
 * A lane's key text read by its operation's key fields in their input order and written back byte
 * for byte, as its key fields' JSON object.
 */
export const keyFieldsOf = (operation: Operation, text: string) =>
  Option.filter(
    Option.filter(Result.getSuccess(parseCanonical(text)), isJsonObject),
    (json) =>
      Object.keys(json).join("\n") ===
        operation.inputFields.filter((f) => operation.keyFields.includes(f)).join("\n") &&
      Result.getOrUndefined(writeJson(json)) === text,
  );

const decoded =
  <A>(schema: Schema.Codec<A, string>) =>
  (text: string) =>
    Result.getSuccess(Schema.decodeUnknownResult(schema)(text));

const holding = (holds: (text: string) => boolean) => Schema.String.check(Schema.makeFilter(holds));

const namesFrom = (compiled: Compiled) => {
  const leaves = new Set(
    [...compiled.states.values()].flatMap((n) => (n.children.length === 0 ? [n.path] : [])),
  );

  const writes = [...compiled.operations.values()].filter((o) => o._tag === "Write");

  return {
    machine: decoded(
      holding((text) => text === compiled.id).pipe(Schema.brand("flow-state/MachineId")),
    ),
    name: decoded(
      holding((text) => Result.isSuccess(decodeName(compiled, text))).pipe(
        Schema.brand("flow-state/ActorName"),
      ),
    ),
    state: decoded(holding((text) => leaves.has(text)).pipe(Schema.brand("flow-state/StateName"))),
    contract: decoded(
      holding((text) => writes.filter((o) => o.contract === text).length === 1).pipe(
        Schema.brand("flow-state/ContractName"),
      ),
    ),
    subject: decoded(
      holding((text) => text === "").pipe(Schema.brand("flow-state/SubjectAddress")),
    ),
    keyText: (operation: Operation) =>
      decoded(
        holding((text) => Option.isSome(keyFieldsOf(operation, text))).pipe(
          Schema.brand("flow-state/KeyText"),
        ),
      ),
  };
};

const built = new WeakMap<Compiled, ReturnType<typeof namesFrom>>();

/**
 * The names a machine's records may hold, each decoded by a Schema built from the machine: its id,
 * an actor's name (by the name codec, encoding back), a leaf state's path, a write contract, the
 * root subject, and an operation's key text.
 *
 * **Details**
 *
 * The one place a saved name is looked up in a definition, so a path a machine supplies (a
 * fragment's) is admitted here and nowhere else. Built once per machine.
 */
export const namesOf = (compiled: Compiled) => {
  const known = built.get(compiled);

  if (known !== undefined) return known;

  const names = namesFrom(compiled);
  built.set(compiled, names);

  return names;
};

/**
 * An identity a record names, read by its machine's name codec: its machine id and name as brands,
 * with the input its name holds.
 */
export const actorNamed = (
  machines: ReadonlyMap<string, Compiled>,
  machine: string,
  name: string,
) =>
  Option.flatMap(Option.fromUndefinedOr(machines.get(machine)), (compiled) => {
    const names = namesOf(compiled);

    return Option.flatMap(names.machine(machine), (id) =>
      Option.flatMap(names.name(name), (actorName) =>
        Option.map(Result.getSuccess(decodeName(compiled, actorName)), (input) => ({
          actor: { machine: id, name: actorName },
          input,
        })),
      ),
    );
  });

/**
 * The write operation a saved contract key names: a stepped body names an operation, a written one
 * a write contract; a read's contract is no lane's.
 */
export const operationNamed = (compiled: Compiled, contract: string, stepped: boolean) => {
  if (stepped) {
    const named = compiled.operations.get(contract);

    return named?._tag === "Write" ? Option.some<Operation>(named) : Option.none<Operation>();
  }

  return Option.flatMap(namesOf(compiled).contract(contract), (name) =>
    Option.fromUndefinedOr(
      [...compiled.operations.values()].find((o) => o._tag === "Write" && o.contract === name),
    ),
  );
};
