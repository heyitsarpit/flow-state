import { Exit, Option, Predicate, Schema, SchemaAST } from "effect";
import type { Bound } from "./contract.ts";
import type { Values } from "./core/compiled.ts";
import type { EventFields } from "./definition.ts";
import type { Finding } from "./error.ts";
import type { Field, Initial, Input, Private, Uncertain } from "./flow.ts";
import { chainOf } from "./core/tree.ts";

/**
 * One node of a declared tree, by path, in declaration order.
 */
export type TreeNode = {
  readonly path: string;
  readonly name: string;
  readonly parent: Option.Option<string>;
  readonly children: ReadonlyArray<string>;
};

// RETURN_TYPE: a type guard over event fields.
export const isUncertain = (x: EventFields): x is Uncertain => Predicate.hasProperty(x, "~flow");

/**
 * Names Flow reserves: as any state name, and `root` at the top level.
 */
const RESERVED = new Set(["is", "child", "history", "self", "__proto__"]);

const MAX_DEPTH = 10;

const MAX_NAME_BYTES = 256;

const encoder = new TextEncoder();

// A lone surrogate, a C0 control or DEL makes a name invalid.
const UNSAFE =
  // oxlint-disable-next-line no-control-regex -- the rule is about control characters
  /[\u0000-\u001F\u007F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

/**
 * Why an authored name is invalid, if it is: empty, over 256 UTF-8 bytes, or holding a control
 * character or a lone surrogate.
 */
// RETURN_TYPE: the Compiled shape this part builds.
export const nameProblem = (name: string): Option.Option<string> => {
  if (name.length === 0) return Option.some("empty");

  if (encoder.encode(name).length > MAX_NAME_BYTES) return Option.some("over 256 UTF-8 bytes");

  return UNSAFE.test(name) ? Option.some("a control character or a lone surrogate") : Option.none();
};

// RETURN_TYPE: the Compiled shape this part builds.
export const invalid = (
  path: ReadonlyArray<string | number>,
  reason: string,
  summary: string,
  help: string,
): Finding => ({ code: "InvalidConfiguration", path, details: { reason }, summary, help });

/**
 * Findings for one authored name at `path`.
 */
// RETURN_TYPE: the findings this construction reports, in walk order.
export const checkName = (name: string, path: ReadonlyArray<string | number>): Array<Finding> =>
  Option.match(nameProblem(name), {
    onNone: () => [],
    onSome: (why) => [
      invalid(
        path,
        "InvalidName",
        `the name ${name} is ${why}`,
        "Use a nonempty name of at most 256 UTF-8 bytes with no control characters.",
      ),
    ],
  });

// FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
// RETURN_TYPE: a type guard states the type it narrows to.
const isRecord = (x: unknown): x is Values =>
  Predicate.isObject(x) && !Array.isArray(x) && !Predicate.isFunction(x);

// One element of a state list as its name and child list: a leaf name, or a single-key compound.
// FLOW_STATE_ALLOW_UNKNOWN: an authored value, checked here before it is trusted.
const elementOf = (element: unknown) => {
  if (Predicate.isString(element)) return Option.some({ name: element, kids: Option.none() });

  if (!isRecord(element)) return Option.none();

  const [only, ...more] = Object.entries(element);

  return only === undefined || more.length > 0
    ? Option.none()
    : Option.some({ name: only[0], kids: Option.some(only[1]) });
};

// The findings of one state's name at its place in the tree.
const nameFindings = (
  name: string,
  path: string,
  top: boolean,
  here: ReadonlyArray<string | number>,
) => {
  const found = [...checkName(name, here)];

  if (RESERVED.has(name) || (top && name === "root"))
    found.push({
      code: "ReservedStateName",
      path: here,
      summary: `the state name ${name} is reserved`,
      help: "Rename the state: is, child, history, self, __proto__ and a top-level root are Flow's.",
    });
  else if (name.includes("."))
    found.push(
      invalid(
        here,
        "InvalidName",
        `the state name ${name} holds a dot`,
        "Rename the state without a dot: dots join state paths.",
      ),
    );

  if (chainOf(path).length > MAX_DEPTH)
    found.push(
      invalid(
        here,
        "PathTooDeep",
        `the state path ${path} has more than ten segments`,
        "Flatten the tree to at most ten levels.",
      ),
    );

  return found;
};

// The findings of a state list that is not a nonempty array.
// FLOW_STATE_ALLOW_UNKNOWN: an authored value, checked here before it is trusted.
const listFindings = (list: unknown, at: ReadonlyArray<string | number>) => {
  if (!Array.isArray(list))
    return [
      invalid(
        at,
        "WrongKind",
        "a state list is not an array",
        "Write states as a list of names and single-key compounds.",
      ),
    ];

  return list.length === 0
    ? [
        invalid(
          at,
          "EmptyCompound",
          "a state list is empty",
          "Give every compound at least one child state.",
        ),
      ]
    : [];
};

// The tree's nodes in declaration order, and the findings of its shape.
// FLOW_STATE_ALLOW_UNKNOWN: an authored value, checked here before it is trusted.
export const treeOf = (states: unknown) => {
  const nodes: Array<TreeNode> = [];
  const findings: Array<Finding> = [];

  // RETURN_TYPE: recursive: the paths of a list's children, in declaration order.
  const walk = (
    // FLOW_STATE_ALLOW_UNKNOWN: an authored value, checked here before it is trusted.
    list: unknown,
    parent: Option.Option<string>,
    at: ReadonlyArray<string | number>,
  ): ReadonlyArray<string> => {
    const refused = listFindings(list, at);
    findings.push(...refused);

    if (refused.length > 0 || !Array.isArray(list)) return [];

    const names = new Set<string>();
    const children: Array<string> = [];

    for (const [i, raw] of list.entries()) {
      const element = elementOf(raw);

      if (Option.isNone(element)) {
        findings.push(
          invalid(
            [...at, i],
            "WrongKind",
            "a state is neither a name nor a single-key compound",
            "Write a leaf as its name and a compound as { NAME: [children] }.",
          ),
        );
        continue;
      }

      const { name, kids } = element.value;
      const path = Option.match(parent, { onNone: () => name, onSome: (p) => `${p}.${name}` });
      const here = [...at, name];

      findings.push(...nameFindings(name, path, Option.isNone(parent), here));

      if (names.has(name))
        findings.push(
          invalid(
            here,
            "DuplicateName",
            `two sibling states are named ${name}`,
            "Give sibling states different names.",
          ),
        );
      names.add(name);
      children.push(path);

      const slot = nodes.length;
      nodes.push({ path, name, parent, children: [] });

      if (Option.isSome(kids))
        nodes[slot] = { path, name, parent, children: walk(kids.value, Option.some(path), here) };
    }

    return children;
  };

  const top = walk(states, Option.none(), ["states"]);

  return { nodes, top, findings };
};

// ── memory fields.

// RETURN_TYPE: a type guard states the type it narrows to.
export const isMarker = (x: unknown): x is Initial | Input | Private =>
  Predicate.hasProperty(x, "~flow") &&
  (x["~flow"] === "initial" || x["~flow"] === "input" || x["~flow"] === "private");

const hasConstructorDefault = (ast: SchemaAST.AST) => ast.context?.constructorDefault !== undefined;

const hasDecodingDefault = (ast: SchemaAST.AST) =>
  !SchemaAST.isOptional(ast) && SchemaAST.isOptional(SchemaAST.toEncoded(ast));

/**
 * The Schema's constructor default, when it is a succeeded value: read, never run.
 */
export const pureDefault = (ast: SchemaAST.AST) => {
  const value = ast.context?.constructorDefault;

  if (value === undefined) return Option.some(Option.none());

  return Exit.isExit(value) && Exit.isSuccess(value)
    ? Option.some(Option.some(value.value))
    : Option.none();
};

// RETURN_TYPE: the Compiled shape this part builds.
const isStringEncoded = (ast: SchemaAST.AST): boolean => {
  const encoded = SchemaAST.toEncoded(ast);

  if (SchemaAST.isString(encoded) || SchemaAST.isTemplateLiteral(encoded)) return true;

  if (SchemaAST.isLiteral(encoded)) return Predicate.isString(encoded.literal);

  return SchemaAST.isUnion(encoded) && encoded.types.every(isStringEncoded);
};

const isIdentity = (ast: SchemaAST.AST) =>
  !SchemaAST.isOptional(ast) &&
  !hasConstructorDefault(ast) &&
  !hasDecodingDefault(ast) &&
  isStringEncoded(ast);

// The finding of one field's source, if its source breaks a rule.
// FLOW_STATE_ALLOW_UNKNOWN: an authored value, checked here before it is trusted.
const sourceFinding = (name: string, raw: unknown) => {
  const at = ["memory", name];
  const field = isMarker(raw) && raw["~flow"] === "private" ? raw.field : raw;

  if (isMarker(field) && field["~flow"] === "initial")
    return Option.liftPredicate(
      {
        code: "TwoDefaults",
        path: at,
        summary: `${name} has a Schema default beside Flow.initial`,
        help: "Keep one default: drop the Schema's default or Flow.initial.",
      } satisfies Finding,
      () => hasConstructorDefault(field.schema.ast) || hasDecodingDefault(field.schema.ast),
    );

  if (isMarker(field) && field["~flow"] === "input")
    return Option.liftPredicate(
      {
        code: "IdentityFieldOptional",
        path: at,
        summary: `the input field ${name} is optional, defaulted or not string-encoded`,
        help: "Make every input field required, default-free and string-encoded: input names the actor.",
      } satisfies Finding,
      () => !isIdentity(field.schema.ast),
    );

  if (Schema.isSchema(field) && SchemaAST.isOptional(field.ast))
    return Option.liftPredicate(
      {
        code: "ImpureDefault",
        path: at,
        summary: `${name}'s default is not a succeeded value`,
        help: "Give the field a constant default; a time or an id comes from an event or the Runtime.",
      } satisfies Finding,
      () => Option.isNone(pureDefault(field.ast)),
    );

  return Option.some(
    invalid(
      at,
      "NoSource",
      `${name} has no source`,
      "Start the field with Flow.input, Flow.initial, or make it an optional key.",
    ),
  );
};

/**
 * The findings of a definition's memory, field by field: its name, then its source.
 */
// FLOW_STATE_ALLOW_UNKNOWN: an authored value, checked here before it is trusted.
export const memoryFindings = (memory: unknown) => {
  if (!isRecord(memory))
    return [
      invalid(
        ["memory"],
        "WrongKind",
        "memory is not a record",
        "Write memory as a record of fields.",
      ),
    ];

  return Object.entries(memory).flatMap(([name, raw]) => [
    ...checkName(name, ["memory", name]),
    ...RESERVED_FIELDS.filter((field) => field === name).map((field) =>
      invalid(
        ["memory", field],
        "ReservedField",
        `memory declares ${field}`,
        "Rename the field: _tag is Flow's.",
      ),
    ),
    ...Option.toArray(sourceFinding(name, raw)),
  ]);
};

// ── events and operations.

// RETURN_TYPE: the findings this construction reports, in walk order.
export const eventFindings = (
  // FLOW_STATE_ALLOW_UNKNOWN: an authored or compiled value, checked here before it is trusted.
  events: unknown,
  key: "events" | "internalEvents",
): Array<Finding> => {
  if (!isRecord(events))
    return [
      invalid(
        [key],
        "WrongKind",
        `${key} is not a record`,
        "Write events as a record of payload field records.",
      ),
    ];

  return Object.entries(events).flatMap(([name, fields]) => {
    const at = [key, name];
    const named = checkName(name, at);

    const payload =
      Predicate.hasProperty(fields, "~flow") && Predicate.hasProperty(fields, "fields")
        ? fields.fields
        : fields;

    if (!isRecord(payload))
      return [
        ...named,
        invalid(
          at,
          "WrongKind",
          `${name}'s payload is not a record of fields`,
          "Write a payload as a record of field Schemas; {} means none.",
        ),
      ];

    return "_tag" in payload
      ? [
          ...named,
          invalid(
            [...at, "_tag"],
            "ReservedField",
            `${name}'s payload declares _tag`,
            "Rename the field: _tag is Flow's.",
          ),
        ]
      : named;
  });
};

// RETURN_TYPE: the findings this construction reports, in walk order.
export const operationFindings = (
  operations: Readonly<Record<string, Bound>>,
  internal: Readonly<Record<string, EventFields>>,
): Array<Finding> => {
  const writes = new Map<string, string>();

  return Object.entries(operations).flatMap(([name, bound]) => {
    const at = ["operations", name];
    const found: Array<Finding> = [...checkName(name, at)];

    found.push(...keyFieldFindings(name, bound));

    if (bound.kind === "write") {
      const target = internal[bound.unknown.ending.event];

      if (target === undefined || !isUncertain(target))
        found.push({
          code: "UnknownNotUncertain",
          path: [...at, "unknown"],
          summary: `${name}'s unknown ending maps to ${bound.unknown.ending.event}, not a Flow.uncertain event`,
          help: "Map unknown: to an internal event declared with Flow.uncertain.",
        });

      const first = writes.get(bound.contract);

      if (first !== undefined)
        found.push({
          code: "SharedContract",
          path: at,
          details: { contract: bound.contract, first },
          summary: `${name} and ${first} both write ${bound.contract}`,
          help: "Declare one write operation per write contract.",
        });
      else writes.set(bound.contract, name);
    }

    return found;
  });
};

const RESERVED_FIELDS = ["_tag"];

const publicAndInternal = (config: {
  readonly events: Readonly<Record<string, EventFields>>;
  readonly internalEvents: Readonly<Record<string, EventFields>>;
}) =>
  Object.keys(config.internalEvents)
    .filter((name) => Object.hasOwn(config.events, name))
    .map((name) =>
      invalid(
        ["internalEvents", name],
        "DuplicateName",
        `${name} is both a public and an internal event`,
        "Give public and internal events different names.",
      ),
    );

const unknownField = (key: string) =>
  KNOWN.has(key)
    ? []
    : [
        invalid(
          [key],
          "UnknownField",
          `a definition has no field ${key}`,
          "Remove the field; a definition declares id, persist, states, events, internalEvents, memory and operations.",
        ),
      ];

const KNOWN = new Set([
  "id",
  "persist",
  "states",
  "events",
  "internalEvents",
  "memory",
  "operations",
]);

// RETURN_TYPE: the findings this construction reports: a key field that may be absent.
const keyFieldFindings = (name: string, bound: Bound): Array<Finding> => {
  const ast = SchemaAST.toType(bound.input.ast);
  const fields = SchemaAST.isObjects(ast) ? ast.propertySignatures : [];

  return fields
    .filter((p) => bound.key.includes(String(p.name)) && SchemaAST.isOptional(p.type))
    .map((p) => ({
      code: "KeyFieldOptional",
      path: ["operations", name, "key", String(p.name)],
      summary: `${name}'s key field ${String(p.name)} is optional`,
      help: "Make every key field of the contract's input required.",
    }));
};

const REQUIRED = ["id", "states", "events"];

/**
 * The findings of a definition's missing required fields: id, states and events.
 */
export const missingFindings = (config: Values) =>
  REQUIRED.filter((key) => !Object.hasOwn(config, key)).map((key) =>
    invalid([key], "MissingField", `a definition has no ${key}`, "Declare id, states and events."),
  );

/**
 * The findings of one field of a definition, in rule order; the tree's findings come from its
 * walk, the operations' from the record they returned.
 */
export const definitionFindings = (
  key: string,
  config: {
    readonly id: string;
    readonly events: Readonly<Record<string, EventFields>>;
    readonly internalEvents: Readonly<Record<string, EventFields>>;
    readonly memory: Readonly<Record<string, Field>>;
  },
  tree: ReadonlyArray<Finding>,
  operations: Readonly<Record<string, Bound>>,
) => {
  switch (key) {
    case "id":
      return checkName(config.id, ["id"]);
    case "persist":
      return [];
    case "states":
      return tree;
    case "events":
      return eventFindings(config.events, "events");
    case "internalEvents":
      return [
        ...eventFindings(config.internalEvents, "internalEvents"),
        ...publicAndInternal(config),
      ];
    case "memory":
      return memoryFindings(config.memory);
    case "operations":
      return operationFindings(operations, config.internalEvents);
    default:
      return unknownField(key);
  }
};
