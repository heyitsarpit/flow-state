import { Exit, Option, Predicate, Schema, SchemaAST } from "effect";
import { inDeclarationOrder, isUncertain } from "./config.ts";
import { invalid } from "./error.ts";
import type { Bound } from "./contract.ts";
import { operationFindings } from "./operation-checks.ts";
import type { ContextConfig, EventFields, MemoryConfig, StateTree } from "./definition.ts";
import type { Finding } from "./error.ts";
import type { Field, Initial, Input, Private } from "./flow.ts";

/**
 * One node of a declared tree, by path, in declaration order.
 */
export type TreeNode = {
  readonly path: string;
  readonly name: string;
  readonly parent: Option.Option<string>;
  readonly children: ReadonlyArray<string>;
};

/**
 * Names Flow reserves: as any state name, and `root` at the top level.
 */
const RESERVED = new Set(["is", "child", "history", "self", "__proto__", "~path", "~flow"]);

// A lone surrogate, a C0 control or DEL makes a name invalid.
const UNSAFE =
  // oxlint-disable-next-line no-control-regex -- the rule is about control characters
  /[\u0000-\u001F\u007F]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

// Why an authored name is invalid, if it is: empty, or holding a control character or a lone
// surrogate. A name has no length limit.
// RETURN_TYPE: the reason a name is refused, if it is.
const nameProblem = (name: string): Option.Option<string> => {
  if (name.length === 0) return Option.some("empty");

  return UNSAFE.test(name) ? Option.some("a control character or a lone surrogate") : Option.none();
};

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
        "Use a nonempty name with no control characters or lone surrogates.",
      ),
    ],
  });

// The findings of one state's name at its place in the tree.
const nameFindings = (name: string, top: boolean, here: ReadonlyArray<string | number>) => {
  const found = [...checkName(name, here)];

  if (RESERVED.has(name) || (top && name === "root"))
    found.push({
      code: "ReservedStateName",
      path: here,
      summary: `the state name ${name} is reserved`,
      help: "Rename the state: is, child, history, self, __proto__, ~path, ~flow and a top-level root are Flow's.",
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

  return found;
};

const emptyCompound = (at: ReadonlyArray<string | number>) =>
  invalid(
    at,
    "EmptyCompound",
    "a state list is empty",
    "Give every compound at least one child state.",
  );

// A state list's element as its name and child list: a leaf, or a compound's one key.
const entriesOf = (element: StateTree[number]) =>
  Predicate.isString(element)
    ? [{ name: element, kids: Option.none<StateTree>() }]
    : Object.entries(element).map(([name, kids]) => ({ name, kids: Option.some(kids) }));

/**
 * A decoded tree's nodes in declaration order, and the findings of its rules: names, reserved
 * names, duplicate siblings and empty compounds.
 */
export const treeOf = (states: StateTree) => {
  const nodes: Array<TreeNode> = [];
  const findings: Array<Finding> = [];

  // RETURN_TYPE: recursive: the paths of a list's children, in declaration order.
  const walk = (
    list: StateTree,
    parent: Option.Option<string>,
    at: ReadonlyArray<string | number>,
  ): ReadonlyArray<string> => {
    if (list.length === 0) findings.push(emptyCompound(at));

    const names = new Set<string>();

    return list.flatMap(entriesOf).map(({ name, kids }) => {
      const path = Option.match(parent, { onNone: () => name, onSome: (p) => `${p}.${name}` });
      const here = [...at, name];

      findings.push(...nameFindings(name, Option.isNone(parent), here));

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

      const slot = nodes.length;
      nodes.push({ path, name, parent, children: [] });

      if (Option.isSome(kids))
        nodes[slot] = { path, name, parent, children: walk(kids.value, Option.some(path), here) };

      return path;
    });
  };

  const top = walk(states, Option.none(), ["states"]);

  return { nodes, top, findings };
};

// RETURN_TYPE: a type guard states the type it narrows to.
export const isMarker = (x: Field): x is Initial | Input | Private =>
  // oxlint-disable-next-line flow-state/no-mark-probe -- construction still recognises its own markers by mark until its decode checks them by identity
  Predicate.hasProperty(x, "~flow");

/**
 * Whether a memory field is `Flow.private`.
 */
// RETURN_TYPE: a type guard states the type it narrows to.
export const isPrivate = (raw: Field): raw is Private =>
  isMarker(raw) && raw["~flow"] === "private";

/**
 * A memory field without its `Flow.private` wrapper.
 */
export const unwrapPrivate = (raw: Field) => (isPrivate(raw) ? raw.field : raw);

/**
 * A memory field's own Schema, through its `Flow.private` and source markers.
 */
export const schemaOfField = (raw: Field) => {
  const field = unwrapPrivate(raw);

  return isMarker(field) ? field.schema : field;
};

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
// RETURN_TYPE: one Finding type for every rule's literal.
const sourceFinding = (name: string, raw: Field): Option.Option<Finding> => {
  const at = ["memory", name];
  const field = unwrapPrivate(raw);

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

  if (isMarker(field))
    return Option.liftPredicate(
      {
        code: "IdentityFieldOptional",
        path: at,
        summary: `the input field ${name} is optional, defaulted or not string-encoded`,
        help: "Make every input field required, default-free and string-encoded: input names the actor.",
      } satisfies Finding,
      () => !isIdentity(field.schema.ast),
    );

  if (!isMarker(field) && SchemaAST.isOptional(field.ast))
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

const RESERVED_FIELD = "_tag";

const reservedField = (at: ReadonlyArray<string | number>, owner: string) =>
  invalid(at, "ReservedField", `${owner} declares _tag`, "Rename the field: _tag is Flow's.");

// A constant start its field's Schema refuses, checked by the Schema's type side, never run.
// RETURN_TYPE: one Finding type for every rule's literal.
const constantFinding = (name: string, raw: Field): Option.Option<Finding> => {
  const field = unwrapPrivate(raw);

  if (!isMarker(field) || field["~flow"] !== "initial" || field.start._tag !== "Constant")
    return Option.none();

  const { schema, start } = field;

  return Option.liftPredicate(
    invalid(
      ["memory", name],
      "WrongKind",
      `${name}'s constant start is not a value of its Schema`,
      "Start the field at a value of its Schema's type, such as a Date for DateFromString.",
    ),
    () => !Schema.is(schema)(start.value),
  );
};

const memoryFindings = (memory: MemoryConfig) =>
  Object.entries(memory).flatMap(([name, raw]) => [
    ...checkName(name, ["memory", name]),
    ...[name]
      .filter((n) => n === RESERVED_FIELD)
      .map((n) => reservedField(["memory", n], "memory")),
    ...Option.toArray(sourceFinding(name, raw)),
    ...Option.toArray(constantFinding(name, raw)),
  ]);

const eventFindings = (
  events: Readonly<Record<string, EventFields>>,
  key: "events" | "internalEvents",
) =>
  Object.entries(events).flatMap(([name, fields]) => [
    ...checkName(name, [key, name]),
    ...Object.keys(isUncertain(fields) ? fields.fields : fields)
      .filter((field) => field === RESERVED_FIELD)
      .map((field) => reservedField([key, name, field], `${name}'s payload`)),
  ]);

const publicAndInternal = (
  events: Readonly<Record<string, EventFields>>,
  internal: Readonly<Record<string, EventFields>>,
) =>
  Object.keys(internal)
    .filter((name) => Object.hasOwn(events, name))
    .map((name) =>
      invalid(
        ["internalEvents", name],
        "DuplicateName",
        `${name} is both a public and an internal event`,
        "Give public and internal events different names.",
      ),
    );

/**
 * The findings of a decoded definition's rules, in declaration then rule order; the tree's come
 * from its walk, the operations' from the record they returned.
 */
export const definitionFindings = (
  config: {
    readonly id: string;
    readonly events: Readonly<Record<string, EventFields>>;
    readonly internalEvents: Readonly<Record<string, EventFields>>;
    readonly memory: MemoryConfig;
    readonly context: ContextConfig;
  },
  tree: ReadonlyArray<Finding>,
  operations: Readonly<Record<string, Bound>>,
  keys: ReadonlyArray<string>,
) =>
  inDeclarationOrder(keys, [
    ...checkName(config.id, ["id"]),
    ...tree,
    ...eventFindings(config.events, "events"),
    ...eventFindings(config.internalEvents, "internalEvents"),
    ...publicAndInternal(config.events, config.internalEvents),
    ...memoryFindings(config.memory),
    ...Object.keys(config.context).flatMap((slot) => checkName(slot, ["context", slot])),
    ...operationFindings(operations, config.internalEvents),
  ]);
