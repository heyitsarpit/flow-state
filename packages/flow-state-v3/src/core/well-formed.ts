import { Option, Predicate, Schema } from "effect";
import type { Compiled, Values } from "./compiled.ts";
import type { Machine } from "../definition.ts";
import { checkName } from "../construction.ts";
import type { Finding } from "../error.ts";

// RETURN_TYPE: the Finding protocol the caller collects.
const invalid = (
  path: ReadonlyArray<string | number>,
  reason: string,
  summary: string,
  help: string,
): Finding => ({ code: "InvalidConfiguration", path, details: { reason }, summary, help });

const APP_FIELDS = new Set(["id", "machines"]);

type Seen = {
  readonly byMachine: Map<Machine, string>;
  readonly byId: Map<string, string>;
  readonly contracts: Map<string, { readonly identity: symbol; readonly at: string }>;
};

// The findings of one machine entry against the entries before it.
const entryFindings = (seen: Seen, key: string, entry: Machine) => {
  const at = ["machines", key];
  const twice = seen.byMachine.get(entry);

  if (twice !== undefined)
    return [
      invalid(
        at,
        "MachineTwice",
        `the machine under ${key} is also under ${twice}`,
        "List each machine once.",
      ),
    ];

  seen.byMachine.set(entry, key);
  const found: Array<Finding> = [];
  const sameId = seen.byId.get(entry.compiled.id);

  if (sameId === undefined) seen.byId.set(entry.compiled.id, key);
  else
    found.push(
      invalid(
        at,
        "DuplicateMachineId",
        `${key} and ${sameId} are both ${entry.compiled.id}`,
        "Give every machine its own id.",
      ),
    );

  for (const [name, bound] of Object.entries(entry.definition.operations)) {
    const first = seen.contracts.get(bound.contract);

    if (first === undefined)
      seen.contracts.set(bound.contract, { identity: bound.identity, at: `${key}.${name}` });
    else if (first.identity !== bound.identity)
      found.push(
        invalid(
          [...at, "operations", name],
          "DuplicateContractId",
          `${key}.${name} and ${first.at} are two contracts with the id ${bound.contract}`,
          "Give every contract its own id.",
        ),
      );
  }

  return found;
};

/**
 * The findings of an app's construction, in entry order: unknown fields, a bad id, one machine
 * under two keys, two machines with one id, and two contracts with one id.
 */
export const appFindings = (config: {
  readonly id: string;
  readonly machines: Readonly<Record<string, Machine>>;
}) => {
  const unknown = Object.keys(config)
    .filter((key) => !APP_FIELDS.has(key))
    .map((key) =>
      invalid(
        [key],
        "UnknownField",
        `an app has no field ${key}`,
        "Write an app as { id, machines }.",
      ),
    );

  const seen: Seen = { byMachine: new Map(), byId: new Map(), contracts: new Map() };

  return [
    ...unknown,
    ...checkName(config.id, ["id"]),
    ...Object.entries(config.machines).flatMap(([key, entry]) => entryFindings(seen, key, entry)),
  ];
};

// Functions Flow derives from a declared Schema, held on Compiled beside it.
const DERIVED = new Set(["sameMemory", "is", "walk"]);

// Whether a function at `key` of `value` is allowed: a Slot's run, or one Flow derived.
// FLOW_STATE_ALLOW_UNKNOWN: a Compiled handed to a Runtime is checked before it is trusted.
const allowed = (value: unknown, key: string) =>
  DERIVED.has(key) ||
  (key === "run" && Predicate.hasProperty(value, "slot") && Predicate.isString(value.slot));

// FLOW_STATE_ALLOW_UNKNOWN: a Compiled handed to a Runtime is checked before it is trusted.
// RETURN_TYPE: a type guard states the type it narrows to: an object, array or Map to walk.
const walkable = (value: unknown): value is Values =>
  !Schema.isSchema(value) && (Predicate.isObject(value) || Array.isArray(value));

// RETURN_TYPE: recursive: the first function that is neither a Slot's, a Schema's own nor derived.
const bareFunction = (
  // FLOW_STATE_ALLOW_UNKNOWN: a Compiled handed to a Runtime is checked before it is trusted.
  value: unknown,
  path: string,
): Option.Option<string> => {
  if (!walkable(value)) return Option.none();

  // A derived part (a Schema's walkers) is Flow's own, built from its Schema.
  const entries = (
    value instanceof Map ? [...value].map(([k, v]) => [String(k), v]) : Object.entries(value)
  ).filter(([key]) => !DERIVED.has(String(key)));

  for (const [key, child] of entries) {
    const at = path === "" ? key : `${path}.${key}`;
    const bare = Predicate.isFunction(child) && !Schema.isSchema(child) && !allowed(value, key);

    const found = bare ? Option.some(at) : bareFunction(child, at);

    if (Option.isSome(found)) return found;
  }

  return Option.none();
};

/**
 * Why a Runtime refuses a Compiled, if it does: no events table, an operation's key field outside
 * its input, or a function that is not a Slot's, a Schema's own or one Flow derived from a
 * declared Schema.
 */
export const malformedOf = (compiled: Compiled) => {
  const at = ["machines", compiled.id];

  if (!Predicate.hasProperty(compiled, "events") || !(compiled.events instanceof Map))
    return Option.some(
      invalid(
        at,
        "MissingEvents",
        `${compiled.id} has no events table`,
        "Build the machine with machine(); a Runtime runs only what it compiled.",
      ),
    );

  for (const operation of compiled.operations.values()) {
    const outside = operation.keyFields.filter((f) => !operation.inputFields.includes(f));

    if (outside.length > 0)
      return Option.some(
        invalid(
          [...at, "operations", operation.name],
          "KeyOutsideInput",
          `${operation.name}'s key fields ${outside.join(", ")} are not input fields`,
          "Key an operation only by fields of its input.",
        ),
      );
  }

  return Option.map(bareFunction(compiled, ""), (path) =>
    invalid(
      [...at, path],
      "BareFunction",
      `${compiled.id} holds a function at ${path} that is not a Slot`,
      "Build the machine with machine(); every closure is a named Slot.",
    ),
  );
};
