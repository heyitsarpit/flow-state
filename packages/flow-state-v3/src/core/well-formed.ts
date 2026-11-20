import { DERIVED } from "./data-view.ts";
import { Option, Predicate, Schedule, Schema } from "effect";
import type { Compiled, Values } from "./compiled.ts";
import type { Machine } from "../definition.ts";
import { checkName } from "../construction.ts";
import { type Finding, invalid } from "../error.ts";

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

// Whether a function at `key` of `value` is allowed: a Slot's run, or one Flow derived.
// FLOW_STATE_ALLOW_UNKNOWN: a Compiled handed to a Runtime is checked before it is trusted.
const allowed = (value: unknown, key: string) =>
  DERIVED.has(key) ||
  (key === "run" && Predicate.hasProperty(value, "slot") && Predicate.isString(value.slot));

// FLOW_STATE_ALLOW_UNKNOWN: a Compiled handed to a Runtime is checked before it is trusted.
// RETURN_TYPE: a type guard states the type it narrows to: an object, array or Map to walk.
const walkable = (value: unknown): value is Values =>
  !Schema.isSchema(value) &&
  !Schedule.isSchedule(value) &&
  (Predicate.isObject(value) || Array.isArray(value));

// A walkable node's children with their paths; a derived part (a Schema's walkers) is Flow's own,
// built from its Schema. A Schema and an Effect Schedule are values the Runtime reads by their own
// modules, never walked.
// FLOW_STATE_ALLOW_UNKNOWN: a Map's entries, walked as any other node's children.
const childrenAt = (value: Values, path: string) =>
  (value instanceof Map
    ? [...value].map(([k, v]: readonly [unknown, unknown]) => [String(k), v] as const)
    : Object.entries(value)
  )
    .filter(([key]) => !DERIVED.has(String(key)))
    .map(([key, child]) => ({ key, child, at: path === "" ? key : `${path}.${key}` }));

// Whether a child is a function that is neither a Slot's, a Schema's own nor derived.
// FLOW_STATE_ALLOW_UNKNOWN: a Compiled handed to a Runtime is checked before it is trusted.
const isBare = (parent: Values, key: string, child: unknown) =>
  Predicate.isFunction(child) && !Schema.isSchema(child) && !allowed(parent, key);

// The first function, in walk order, that is neither a Slot's, a Schema's own nor derived; walked
// depth first with its own stack, so a constant of any depth is checked.
const bareFunction = (root: Values) => {
  const stack = [{ value: root, children: childrenAt(root, ""), next: 0 }];
  const open = new Set<Values>([root]);

  const descend = (child: Values, at: string) => {
    open.add(child);
    stack.push({ value: child, children: childrenAt(child, at), next: 0 });
  };

  for (let frame = stack.at(-1); frame !== undefined; frame = stack.at(-1)) {
    const entry = frame.children[frame.next];

    if (entry === undefined) {
      stack.pop();
      open.delete(frame.value);
    } else {
      frame.next += 1;

      if (isBare(frame.value, entry.key, entry.child)) return Option.some(entry.at);

      if (walkable(entry.child) && !open.has(entry.child)) descend(entry.child, entry.at);
    }
  }

  return Option.none<string>();
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

  return Option.map(bareFunction(compiled), (path) =>
    invalid(
      [...at, path],
      "BareFunction",
      `${compiled.id} holds a function at ${path} that is not a Slot`,
      "Build the machine with machine(); every closure is a named Slot.",
    ),
  );
};
