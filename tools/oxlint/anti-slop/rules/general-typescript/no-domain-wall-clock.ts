import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";

type RuleOptions = [{ sourceRoots?: string[]; allowedPathFragments?: string[] }];
type AmbientKind =
  | "global-object"
  | "object-Date"
  | "object-performance"
  | "array-Date"
  | "array-performance"
  | "Date"
  | "performance"
  | "Date.now"
  | "performance.now"
  | "state-truthy"
  | "state-falsy"
  | "state-nullish"
  | "state-non-nullish"
  | "state-unknown";
type AmbientAliases = Map<Variable, Set<AmbientKind>>;
type AliasUpdateMode = "replace" | "merge";
type IdentifierNode = ESTree.IdentifierName | ESTree.IdentifierReference | ESTree.BindingIdentifier;

const defaultSourceRoots = ["packages/flow-state-rewrite/src"] as const;
const defaultAllowedPathFragments = ["/src/hosts/"] as const;

function normalized(value: string): string {
  return value.replaceAll("\\", "/");
}

function resolveVariable(sourceCode: SourceCode, identifier: IdentifierNode): Variable | null {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) return variable;
    scope = scope.upper;
  }
  return null;
}

function propertyName(node: ESTree.MemberExpression): string | null {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  if (
    node.computed &&
    node.property.type === "Literal" &&
    (typeof node.property.value === "string" || typeof node.property.value === "number")
  ) {
    return String(node.property.value);
  }
  return null;
}

function propertyKeyName(property: { computed: boolean; key: ESTree.PropertyKey }): string | null {
  if (!property.computed && property.key.type === "Identifier") return property.key.name;
  if (
    property.computed &&
    property.key.type === "Literal" &&
    typeof property.key.value === "string"
  ) {
    return property.key.value;
  }
  return null;
}

function variableDeclarator(variable: Variable): ESTree.VariableDeclarator | null {
  for (const definition of variable.defs) {
    if (definition.type === "Variable" && definition.node.type === "VariableDeclarator") {
      return definition.node;
    }
  }
  return null;
}

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
  let current = expression;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSInstantiationExpression"
  ) {
    current = current.expression;
  }
  return current;
}

function globalObject(sourceCode: SourceCode, node: ESTree.Expression): boolean {
  return (
    node.type === "Identifier" &&
    (node.name === "globalThis" ||
      node.name === "global" ||
      node.name === "self" ||
      node.name === "window") &&
    (resolveVariable(sourceCode, node) === null ||
      resolveVariable(sourceCode, node)?.defs.length === 0)
  );
}

function ambientSet(...kinds: AmbientKind[]): Set<AmbientKind> {
  return new Set(kinds);
}

function definitelyFalsyLiteral(node: ESTree.Expression): boolean {
  if (node.type !== "Literal") return false;
  if (node.value === null) return true;
  return typeof node.value === "boolean" ||
    typeof node.value === "number" ||
    typeof node.value === "string" ||
    typeof node.value === "bigint"
    ? !node.value
    : false;
}

function definitelyUndefined(sourceCode: SourceCode, node: ESTree.Expression): boolean {
  const unwrapped = unwrapExpression(node);
  if (unwrapped.type === "UnaryExpression" && unwrapped.operator === "void") return true;
  if (unwrapped.type !== "Identifier") return false;
  const variable = resolveVariable(sourceCode, unwrapped);
  return unwrapped.name === "undefined" && (variable === null || variable.defs.length === 0);
}

function definitelyFalsy(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  aliases: AmbientAliases,
  seen: Set<Variable> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(node);
  if (definitelyFalsyLiteral(unwrapped) || definitelyUndefined(sourceCode, unwrapped)) return true;
  if (unwrapped.type === "Identifier") {
    const variable = resolveVariable(sourceCode, unwrapped);
    const alias = variable === null ? undefined : aliases.get(variable);
    if (alias !== undefined) {
      if (alias.has("state-falsy") || alias.has("state-nullish")) return true;
      if (alias.has("state-truthy") || alias.has("state-unknown")) return false;
    }
    if (variable === null || seen.has(variable)) return false;
    const declarator = variableDeclarator(variable);
    if (declarator?.init === null || declarator?.init === undefined)
      return false;
    if (declarator.id.type !== "Identifier") return false;
    const nextSeen = new Set(seen);
    nextSeen.add(variable);
    return definitelyFalsy(sourceCode, declarator.init, aliases, nextSeen);
  }
  if (unwrapped.type === "ConditionalExpression") {
    if (definitelyTruthy(sourceCode, unwrapped.test, aliases))
      return definitelyFalsy(sourceCode, unwrapped.consequent, aliases, seen);
    if (definitelyFalsy(sourceCode, unwrapped.test, aliases))
      return definitelyFalsy(sourceCode, unwrapped.alternate, aliases, seen);
  }
  if (unwrapped.type === "LogicalExpression") {
    const leftTruthy = definitelyTruthy(sourceCode, unwrapped.left, aliases);
    const leftFalsy = definitelyFalsy(sourceCode, unwrapped.left, aliases);
    if (unwrapped.operator === "&&") {
      if (leftFalsy) return true;
      if (leftTruthy) return definitelyFalsy(sourceCode, unwrapped.right, aliases, seen);
    } else if (unwrapped.operator === "||") {
      if (leftTruthy) return false;
      if (leftFalsy) return definitelyFalsy(sourceCode, unwrapped.right, aliases, seen);
    } else if (definitelyNullish(sourceCode, unwrapped.left, aliases)) {
      return definitelyFalsy(sourceCode, unwrapped.right, aliases, seen);
    } else if (definitelyNonNullish(sourceCode, unwrapped.left, aliases)) {
      return leftFalsy;
    }
  }
  return false;
}

function definitelyTruthy(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  aliases: AmbientAliases,
  seen: Set<Variable> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(node);
  if (
    unwrapped.type === "ObjectExpression" ||
    unwrapped.type === "ArrayExpression" ||
    unwrapped.type === "FunctionExpression" ||
    unwrapped.type === "ArrowFunctionExpression" ||
    unwrapped.type === "ClassExpression" ||
    unwrapped.type === "NewExpression"
  )
    return true;
  if (definitelyFalsyLiteral(unwrapped) || definitelyUndefined(sourceCode, unwrapped)) return false;
  if (unwrapped.type === "Literal") return true;
  if (unwrapped.type === "Identifier") {
    const variable = resolveVariable(sourceCode, unwrapped);
    const alias = variable === null ? undefined : aliases.get(variable);
    if (alias !== undefined) {
      if (alias.has("state-truthy")) return true;
      if (alias.has("state-falsy") || alias.has("state-unknown")) return false;
      if (alias.size > 0) return true;
      return false;
    }
    if (variable === null || variable.defs.length === 0)
      return ["Date", "performance", "globalThis", "global", "self", "window"].includes(
        unwrapped.name,
      );
    if (seen.has(variable)) return false;
    const declarator = variableDeclarator(variable);
    if (
      declarator?.init === null ||
      declarator?.init === undefined ||
      declarator.id.type !== "Identifier"
    )
      return false;
    const nextSeen = new Set(seen);
    nextSeen.add(variable);
    return definitelyTruthy(sourceCode, declarator.init, aliases, nextSeen);
  }
  if (unwrapped.type === "ConditionalExpression") {
    if (definitelyTruthy(sourceCode, unwrapped.test, aliases))
      return definitelyTruthy(sourceCode, unwrapped.consequent, aliases);
    if (definitelyFalsyLiteral(unwrapExpression(unwrapped.test)))
      return definitelyTruthy(sourceCode, unwrapped.alternate, aliases);
  }
  return false;
}

function definitelyNullish(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  aliases: AmbientAliases = new Map(),
  seen: Set<Variable> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(node);
  if (unwrapped.type === "Literal") return unwrapped.value === null;
  if (definitelyUndefined(sourceCode, unwrapped)) return true;
  if (unwrapped.type === "UnaryExpression" && unwrapped.operator === "void") return true;
  if (unwrapped.type === "Identifier") {
    const variable = resolveVariable(sourceCode, unwrapped);
    const alias = variable === null ? undefined : aliases.get(variable);
    if (alias !== undefined) {
      if (alias.has("state-nullish")) return true;
      if (alias.has("state-non-nullish") || alias.has("state-unknown")) return false;
    }
    if (variable === null || seen.has(variable)) return false;
    const declarator = variableDeclarator(variable);
    if (declarator?.init === null || declarator?.init === undefined)
      return false;
    if (declarator.id.type !== "Identifier") return false;
    const nextSeen = new Set(seen);
    nextSeen.add(variable);
    return definitelyNullish(sourceCode, declarator.init, aliases, nextSeen);
  }
  if (unwrapped.type === "ConditionalExpression") {
    if (definitelyTruthy(sourceCode, unwrapped.test, aliases))
      return definitelyNullish(sourceCode, unwrapped.consequent, aliases, seen);
    if (definitelyFalsy(sourceCode, unwrapped.test, aliases))
      return definitelyNullish(sourceCode, unwrapped.alternate, aliases, seen);
  }
  return false;
}

function definitelyNonNullish(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  aliases: AmbientAliases,
  seen: Set<Variable> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(node);
  if (definitelyNullish(sourceCode, unwrapped, aliases)) return false;
  if (unwrapped.type === "Literal") return true;
  if (
    unwrapped.type === "ObjectExpression" ||
    unwrapped.type === "ArrayExpression" ||
    unwrapped.type === "FunctionExpression" ||
    unwrapped.type === "ArrowFunctionExpression" ||
    unwrapped.type === "ClassExpression" ||
    unwrapped.type === "NewExpression"
  )
    return true;
  if (unwrapped.type === "Identifier") {
    const variable = resolveVariable(sourceCode, unwrapped);
    const alias = variable === null ? undefined : aliases.get(variable);
    if (alias !== undefined) {
      if (alias.has("state-non-nullish") || alias.has("state-truthy") || alias.has("state-falsy"))
        return true;
      return false;
    }
    if (variable === null || variable.defs.length === 0)
      return !["undefined"].includes(unwrapped.name);
    if (seen.has(variable)) return false;
    const declarator = variableDeclarator(variable);
    if (declarator?.init === null || declarator?.init === undefined)
      return false;
    if (declarator.id.type !== "Identifier") return false;
    const nextSeen = new Set(seen);
    nextSeen.add(variable);
    return definitelyNonNullish(sourceCode, declarator.init, aliases, nextSeen);
  }
  if (unwrapped.type === "ConditionalExpression") {
    if (definitelyTruthy(sourceCode, unwrapped.test, aliases))
      return definitelyNonNullish(sourceCode, unwrapped.consequent, aliases, seen);
    if (definitelyFalsy(sourceCode, unwrapped.test, aliases))
      return definitelyNonNullish(sourceCode, unwrapped.alternate, aliases, seen);
    return (
      definitelyNonNullish(sourceCode, unwrapped.consequent, aliases, seen) &&
      definitelyNonNullish(sourceCode, unwrapped.alternate, aliases, seen)
    );
  }
  if (unwrapped.type === "LogicalExpression") {
    const leftTruthy = definitelyTruthy(sourceCode, unwrapped.left, aliases);
    const leftFalsy = definitelyFalsy(sourceCode, unwrapped.left, aliases);
    if (unwrapped.operator === "&&") {
      if (leftFalsy) return definitelyNonNullish(sourceCode, unwrapped.left, aliases, seen);
      if (leftTruthy) return definitelyNonNullish(sourceCode, unwrapped.right, aliases, seen);
    } else if (unwrapped.operator === "||") {
      if (leftTruthy) return definitelyNonNullish(sourceCode, unwrapped.left, aliases, seen);
      if (leftFalsy) return definitelyNonNullish(sourceCode, unwrapped.right, aliases, seen);
    } else {
      if (definitelyNullish(sourceCode, unwrapped.left, aliases))
        return definitelyNonNullish(sourceCode, unwrapped.right, aliases, seen);
      if (definitelyNonNullish(sourceCode, unwrapped.left, aliases, seen)) return true;
    }
  }
  return false;
}

function addCurrentStateFacts(
  sourceCode: SourceCode,
  source: ESTree.Expression | null,
  target: Set<AmbientKind>,
  aliases: AmbientAliases,
): Set<AmbientKind> {
  if (source === null) {
    if (target.size === 0) target.add("state-unknown");
    return target;
  }
  if (definitelyTruthy(sourceCode, source, aliases)) target.add("state-truthy");
  else if (definitelyFalsy(sourceCode, source, aliases)) target.add("state-falsy");
  else target.add("state-unknown");
  if (definitelyNullish(sourceCode, source, aliases)) target.add("state-nullish");
  else if (definitelyNonNullish(sourceCode, source, aliases)) target.add("state-non-nullish");
  else target.add("state-unknown");
  return target;
}

function constantBranch(
  sourceCode: SourceCode,
  test: ESTree.Expression,
  aliases: AmbientAliases,
): "consequent" | "alternate" | null {
  if (definitelyTruthy(sourceCode, test, aliases)) return "consequent";
  if (definitelyFalsyLiteral(unwrapExpression(test)) || definitelyUndefined(sourceCode, test))
    return "alternate";
  return null;
}

function addAmbientKinds(target: Set<AmbientKind>, source: Set<AmbientKind>): Set<AmbientKind> {
  for (const kind of source) target.add(kind);
  return target;
}

function ambientKindsForProperty(base: Set<AmbientKind>, key: string | null): Set<AmbientKind> {
  const result = new Set<AmbientKind>();
  for (const kind of base) {
    if (key === "Date" && (kind === "global-object" || kind === "object-Date")) result.add("Date");
    if (key === "performance" && (kind === "global-object" || kind === "object-performance"))
      result.add("performance");
    if (key !== null && /^\d+$/.test(key) && kind === "array-Date") result.add("Date");
    if (key !== null && /^\d+$/.test(key) && kind === "array-performance")
      result.add("performance");
    if (key === "now" && kind === "Date") result.add("Date.now");
    if (key === "now" && kind === "performance") result.add("performance.now");
  }
  return result;
}

function ambientKinds(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  aliases: AmbientAliases,
  seen: Set<Variable> = new Set(),
): Set<AmbientKind> {
  const unwrapped = unwrapExpression(node);
  if (unwrapped !== node) return ambientKinds(sourceCode, unwrapped, aliases, seen);

  if (node.type === "AssignmentExpression")
    return ambientKinds(sourceCode, node.right, aliases, seen);

  if (node.type === "Identifier") {
    const variable = resolveVariable(sourceCode, node);
    if (variable !== null) {
      const alias = aliases.get(variable);
      if (alias !== undefined) return new Set(alias);
    }
    if (variable === null || variable.defs.length === 0) {
      if (node.name === "Date") return ambientSet("Date");
      if (node.name === "performance") return ambientSet("performance");
      if (
        node.name === "globalThis" ||
        node.name === "global" ||
        node.name === "self" ||
        node.name === "window"
      ) {
        return ambientSet("global-object");
      }
      return new Set();
    }
    if (seen.has(variable)) return new Set();
    const nextSeen = new Set(seen);
    nextSeen.add(variable);
    const declarator = variableDeclarator(variable);
    if (declarator === null || declarator.init === null) return new Set();
    if (declarator.id.type === "Identifier")
      return ambientKinds(sourceCode, declarator.init, aliases, nextSeen);
    if (declarator.id.type !== "ObjectPattern") return new Set();
    const property = declarator.id.properties.find(
      (candidate) =>
        candidate.type === "Property" && bindingNames(candidate.value).includes(node.name),
    );
    if (property?.type !== "Property") return new Set();
    const key = propertyKeyName(property);
    const base = ambientKinds(sourceCode, declarator.init, aliases, nextSeen);
    const facts =
      key === null
        ? emptyObjectPropertyFacts()
        : objectPropertyFacts(sourceCode, declarator.init, key, aliases, nextSeen);
    return facts.values.reduce(
      (result, value) => addAmbientKinds(result, ambientKinds(sourceCode, value, aliases)),
      ambientKindsForProperty(base, key),
    );
  }

  if (node.type === "ConditionalExpression") {
    const choice = constantBranch(sourceCode, node.test, aliases);
    if (choice === "consequent") return ambientKinds(sourceCode, node.consequent, aliases, seen);
    if (choice === "alternate") return ambientKinds(sourceCode, node.alternate, aliases, seen);
    return addAmbientKinds(
      ambientKinds(sourceCode, node.consequent, aliases, seen),
      ambientKinds(sourceCode, node.alternate, aliases, seen),
    );
  }
  if (node.type === "LogicalExpression") {
    const left = ambientKinds(sourceCode, node.left, aliases, seen);
    if (node.operator === "&&") {
      if (
        definitelyFalsyLiteral(unwrapExpression(node.left)) ||
        definitelyUndefined(sourceCode, node.left)
      )
        return left;
      if (definitelyTruthy(sourceCode, node.left, aliases))
        return ambientKinds(sourceCode, node.right, aliases, seen);
    } else if (node.operator === "||") {
      if (definitelyTruthy(sourceCode, node.left, aliases)) return left;
      if (
        definitelyFalsyLiteral(unwrapExpression(node.left)) ||
        definitelyUndefined(sourceCode, node.left)
      )
        return ambientKinds(sourceCode, node.right, aliases, seen);
    } else {
      if (definitelyNullish(sourceCode, node.left, aliases))
        return ambientKinds(sourceCode, node.right, aliases, seen);
      if (definitelyTruthy(sourceCode, node.left, aliases)) return left;
    }
    return addAmbientKinds(left, ambientKinds(sourceCode, node.right, aliases, seen));
  }
  if (node.type === "SequenceExpression") {
    const last = node.expressions.at(-1);
    return last === undefined ? new Set() : ambientKinds(sourceCode, last, aliases, seen);
  }
  if (node.type === "AwaitExpression")
    return ambientKinds(sourceCode, node.argument, aliases, seen);
  if (unwrapped.type === "ArrayExpression") {
    const result = new Set<AmbientKind>();
    for (const element of unwrapped.elements) {
      if (element === null) continue;
      const kinds = ambientKinds(
        sourceCode,
        element.type === "SpreadElement" ? element.argument : element,
        aliases,
        seen,
      );
      if (kinds.has("Date") || kinds.has("array-Date")) result.add("array-Date");
      if (kinds.has("performance") || kinds.has("array-performance"))
        result.add("array-performance");
    }
    return result;
  }
  if (unwrapped.type === "ObjectExpression") {
    const result = new Set<AmbientKind>();
    for (const property of unwrapped.properties) {
      if (property.type === "SpreadElement") {
        const kinds = ambientKinds(sourceCode, property.argument, aliases, seen);
        if (kinds.has("global-object") || kinds.has("object-Date")) result.add("object-Date");
        if (kinds.has("global-object") || kinds.has("object-performance"))
          result.add("object-performance");
        continue;
      }
      const key = propertyKeyName(property);
      const kinds = ambientKinds(sourceCode, property.value, aliases, seen);
      if (key === "Date" && kinds.has("Date")) result.add("object-Date");
      if (key === "performance" && kinds.has("performance")) result.add("object-performance");
    }
    return result;
  }
  if (node.type !== "MemberExpression") return new Set();
  const property = propertyName(node);
  if (property === null) return new Set();
  if (globalObject(sourceCode, node.object)) {
    return ambientKindsForProperty(ambientSet("global-object"), property);
  }
  return ambientKindsForProperty(ambientKinds(sourceCode, node.object, aliases, seen), property);
}

function arrayElementExpression(
  sourceCode: SourceCode,
  source: ESTree.Expression,
  index: number,
  aliases: AmbientAliases,
  seen: Set<Variable> = new Set(),
): ESTree.Expression | null {
  const unwrapped = unwrapExpression(source);
  if (unwrapped !== source)
    return arrayElementExpression(sourceCode, unwrapped, index, aliases, seen);
  if (unwrapped.type === "ArrayExpression") {
    let offset = 0;
    for (const element of unwrapped.elements) {
      if (element === null) {
        if (offset === index) return null;
        offset += 1;
        continue;
      }
      if (element.type !== "SpreadElement") {
        if (offset === index) return element;
        offset += 1;
        continue;
      }
      const spreadLength = staticArrayLength(sourceCode, element.argument, aliases);
      if (spreadLength === null) return null;
      if (index >= offset && index < offset + spreadLength)
        return arrayElementExpression(sourceCode, element.argument, index - offset, aliases, seen);
      offset += spreadLength;
    }
    return null;
  }
  if (unwrapped.type === "ConditionalExpression") {
    const choice = constantBranch(sourceCode, unwrapped.test, aliases);
    if (choice === "consequent")
      return arrayElementExpression(sourceCode, unwrapped.consequent, index, aliases, seen);
    if (choice === "alternate")
      return arrayElementExpression(sourceCode, unwrapped.alternate, index, aliases, seen);
    return null;
  }
  if (unwrapped.type === "SequenceExpression") {
    const last = unwrapped.expressions.at(-1);
    return last === undefined
      ? null
      : arrayElementExpression(sourceCode, last, index, aliases, seen);
  }
  if (unwrapped.type !== "Identifier") return null;
  const variable = resolveVariable(sourceCode, unwrapped);
  if (variable === null || seen.has(variable)) return null;
  const declarator = variableDeclarator(variable);
  if (declarator === null || declarator.init === null || declarator.id.type !== "Identifier")
    return null;
  const nextSeen = new Set(seen);
  nextSeen.add(variable);
  return arrayElementExpression(sourceCode, declarator.init, index, aliases, nextSeen);
}

function staticArrayLength(
  sourceCode: SourceCode,
  source: ESTree.Expression,
  aliases: AmbientAliases,
  seen: Set<Variable> = new Set(),
): number | null {
  const unwrapped = unwrapExpression(source);
  if (unwrapped !== source) return staticArrayLength(sourceCode, unwrapped, aliases, seen);
  if (unwrapped.type === "ArrayExpression") {
    let length = 0;
    for (const element of unwrapped.elements) {
      if (element === null || element.type !== "SpreadElement") {
        length += 1;
        continue;
      }
      const spreadLength = staticArrayLength(sourceCode, element.argument, aliases, seen);
      if (spreadLength === null) return null;
      length += spreadLength;
    }
    return length;
  }
  if (unwrapped.type === "ConditionalExpression") {
    const choice = constantBranch(sourceCode, unwrapped.test, aliases);
    if (choice === "consequent")
      return staticArrayLength(sourceCode, unwrapped.consequent, aliases, seen);
    if (choice === "alternate")
      return staticArrayLength(sourceCode, unwrapped.alternate, aliases, seen);
    const left = staticArrayLength(sourceCode, unwrapped.consequent, aliases, seen);
    const right = staticArrayLength(sourceCode, unwrapped.alternate, aliases, seen);
    return left !== null && left === right ? left : null;
  }
  if (unwrapped.type === "SequenceExpression") {
    const last = unwrapped.expressions.at(-1);
    return last === undefined ? null : staticArrayLength(sourceCode, last, aliases, seen);
  }
  if (unwrapped.type !== "Identifier") return null;
  const variable = resolveVariable(sourceCode, unwrapped);
  if (variable === null || seen.has(variable)) return null;
  const declarator = variableDeclarator(variable);
  if (declarator === null || declarator.init === null || declarator.id.type !== "Identifier")
    return null;
  const nextSeen = new Set(seen);
  nextSeen.add(variable);
  return staticArrayLength(sourceCode, declarator.init, aliases, nextSeen);
}

type ObjectPropertyFacts = {
  values: ESTree.Expression[];
  maybeMissing: boolean;
  knownPresent: boolean;
};

function emptyObjectPropertyFacts(
  overrides: Partial<ObjectPropertyFacts> = {},
): ObjectPropertyFacts {
  return { values: [], maybeMissing: true, knownPresent: false, ...overrides };
}

function joinObjectPropertyFacts(
  left: ObjectPropertyFacts,
  right: ObjectPropertyFacts,
): ObjectPropertyFacts {
  return {
    values: [...left.values, ...right.values],
    maybeMissing: left.maybeMissing || right.maybeMissing,
    knownPresent: left.knownPresent || right.knownPresent,
  };
}

function objectPropertyFacts(
  sourceCode: SourceCode,
  source: ESTree.Expression,
  key: string,
  aliases: AmbientAliases,
  seen: Set<Variable> = new Set(),
): ObjectPropertyFacts {
  const unwrapped = unwrapExpression(source);
  if (unwrapped !== source) return objectPropertyFacts(sourceCode, unwrapped, key, aliases, seen);
  if (unwrapped.type === "AssignmentExpression")
    return objectPropertyFacts(sourceCode, unwrapped.right, key, aliases, seen);
  if (unwrapped.type === "ObjectExpression") {
    let facts = emptyObjectPropertyFacts();
    for (let index = unwrapped.properties.length - 1; index >= 0; index -= 1) {
      const property = unwrapped.properties[index];
      if (property?.type === "Property" && propertyKeyName(property) === key) {
        if (facts.knownPresent && !facts.maybeMissing) return facts;
        facts = joinObjectPropertyFacts(
          facts,
          emptyObjectPropertyFacts({
            values: [property.value],
            maybeMissing: false,
            knownPresent: true,
          }),
        );
        facts.maybeMissing = false;
        facts.knownPresent = true;
        continue;
      }
      if (property?.type === "SpreadElement") {
        const spreadFacts = objectPropertyFacts(sourceCode, property.argument, key, aliases, seen);
        facts = joinObjectPropertyFacts(facts, spreadFacts);
        if (!spreadFacts.maybeMissing) {
          facts.maybeMissing = false;
          facts.knownPresent = true;
          return facts;
        }
      }
    }
    return facts;
  }
  if (unwrapped.type === "ConditionalExpression") {
    const choice = constantBranch(sourceCode, unwrapped.test, aliases);
    if (choice === "consequent")
      return objectPropertyFacts(sourceCode, unwrapped.consequent, key, aliases, seen);
    if (choice === "alternate")
      return objectPropertyFacts(sourceCode, unwrapped.alternate, key, aliases, seen);
    return joinObjectPropertyFacts(
      objectPropertyFacts(sourceCode, unwrapped.consequent, key, aliases, seen),
      objectPropertyFacts(sourceCode, unwrapped.alternate, key, aliases, seen),
    );
  }
  if (unwrapped.type === "LogicalExpression") {
    const choice = constantBranch(sourceCode, unwrapped.left, aliases);
    if (unwrapped.operator === "&&") {
      if (choice === "consequent")
        return objectPropertyFacts(sourceCode, unwrapped.right, key, aliases, seen);
      if (choice === "alternate") return emptyObjectPropertyFacts();
    } else if (unwrapped.operator === "||") {
      if (choice === "consequent")
        return objectPropertyFacts(sourceCode, unwrapped.left, key, aliases, seen);
      if (choice === "alternate")
        return objectPropertyFacts(sourceCode, unwrapped.right, key, aliases, seen);
    } else {
      if (definitelyNullish(sourceCode, unwrapped.left, aliases))
        return objectPropertyFacts(sourceCode, unwrapped.right, key, aliases, seen);
      if (definitelyTruthy(sourceCode, unwrapped.left, aliases))
        return objectPropertyFacts(sourceCode, unwrapped.left, key, aliases, seen);
    }
    return joinObjectPropertyFacts(
      objectPropertyFacts(sourceCode, unwrapped.left, key, aliases, seen),
      objectPropertyFacts(sourceCode, unwrapped.right, key, aliases, seen),
    );
  }
  if (unwrapped.type === "SequenceExpression") {
    const last = unwrapped.expressions.at(-1);
    return last === undefined
      ? emptyObjectPropertyFacts()
      : objectPropertyFacts(sourceCode, last, key, aliases, seen);
  }
  if (unwrapped.type !== "Identifier") return emptyObjectPropertyFacts();
  const variable = resolveVariable(sourceCode, unwrapped);
  if (variable === null || variable.defs.length === 0) {
    if (
      (unwrapped.name === "globalThis" ||
        unwrapped.name === "global" ||
        unwrapped.name === "self" ||
        unwrapped.name === "window") &&
      (key === "Date" || key === "performance")
    )
      return emptyObjectPropertyFacts({ maybeMissing: false, knownPresent: true });
    const ambientProperty = ambientKindsForProperty(
      ambientKinds(sourceCode, unwrapped, aliases),
      key,
    );
    if (ambientProperty.size > 0)
      return emptyObjectPropertyFacts({ maybeMissing: false, knownPresent: true });
    return emptyObjectPropertyFacts();
  }
  if (seen.has(variable)) return emptyObjectPropertyFacts();
  const alias = aliases.get(variable);
  if (alias !== undefined) {
    if (ambientKindsForProperty(alias, key).size > 0)
      return emptyObjectPropertyFacts({ maybeMissing: false, knownPresent: true });
    if (variable.references.some((reference) => reference.isWrite() && !reference.init))
      return emptyObjectPropertyFacts();
  }
  const declarator = variableDeclarator(variable);
  if (declarator === null || declarator.init === null || declarator.id.type !== "Identifier")
    return emptyObjectPropertyFacts();
  const nextSeen = new Set(seen);
  nextSeen.add(variable);
  return objectPropertyFacts(sourceCode, declarator.init, key, aliases, nextSeen);
}

function objectRestAmbientKinds(
  sourceCode: SourceCode,
  source: ESTree.Expression | null,
  base: Set<AmbientKind>,
  aliases: AmbientAliases,
): Set<AmbientKind> {
  const result = new Set(base);
  if (source === null) return result;
  for (const [key, objectKind, ambientKind] of [
    ["Date", "object-Date", "Date"],
    ["performance", "object-performance", "performance"],
  ] as const) {
    const facts = objectPropertyFacts(sourceCode, source, key, aliases);
    if (facts.values.some((value) => ambientKinds(sourceCode, value, aliases).has(ambientKind)))
      result.add(objectKind);
  }
  return result;
}

function ambientArrayElementKinds(
  sourceCode: SourceCode,
  source: ESTree.Expression,
  index: number,
  aliases: AmbientAliases,
  seen: Set<Variable> = new Set(),
): Set<AmbientKind> {
  const unwrapped = unwrapExpression(source);
  if (unwrapped !== source)
    return ambientArrayElementKinds(sourceCode, unwrapped, index, aliases, seen);
  if (unwrapped.type === "ConditionalExpression") {
    const choice = constantBranch(sourceCode, unwrapped.test, aliases);
    if (choice === "consequent")
      return ambientArrayElementKinds(sourceCode, unwrapped.consequent, index, aliases, seen);
    if (choice === "alternate")
      return ambientArrayElementKinds(sourceCode, unwrapped.alternate, index, aliases, seen);
    return addAmbientKinds(
      ambientArrayElementKinds(sourceCode, unwrapped.consequent, index, aliases, seen),
      ambientArrayElementKinds(sourceCode, unwrapped.alternate, index, aliases, seen),
    );
  }
  if (unwrapped.type === "LogicalExpression") {
    const left = ambientKinds(sourceCode, unwrapped.left, aliases);
    if (unwrapped.operator === "&&") {
      if (
        definitelyFalsyLiteral(unwrapExpression(unwrapped.left)) ||
        definitelyUndefined(sourceCode, unwrapped.left)
      )
        return left;
      if (definitelyTruthy(sourceCode, unwrapped.left, aliases))
        return ambientArrayElementKinds(sourceCode, unwrapped.right, index, aliases, seen);
    } else if (unwrapped.operator === "||") {
      if (definitelyTruthy(sourceCode, unwrapped.left, aliases)) return left;
      if (
        definitelyFalsyLiteral(unwrapExpression(unwrapped.left)) ||
        definitelyUndefined(sourceCode, unwrapped.left)
      )
        return ambientArrayElementKinds(sourceCode, unwrapped.right, index, aliases, seen);
    } else {
      if (definitelyNullish(sourceCode, unwrapped.left, aliases))
        return ambientArrayElementKinds(sourceCode, unwrapped.right, index, aliases, seen);
      if (definitelyTruthy(sourceCode, unwrapped.left, aliases)) return left;
    }
    return addAmbientKinds(
      left,
      ambientArrayElementKinds(sourceCode, unwrapped.right, index, aliases, seen),
    );
  }
  if (unwrapped.type === "SequenceExpression") {
    const last = unwrapped.expressions.at(-1);
    return last === undefined
      ? new Set()
      : ambientArrayElementKinds(sourceCode, last, index, aliases, seen);
  }
  if (unwrapped.type === "Identifier") {
    const variable = resolveVariable(sourceCode, unwrapped);
    if (variable !== null && !seen.has(variable)) {
      const aliasedKinds = aliases.get(variable);
      if (aliasedKinds !== undefined) {
        const result = ambientKindsForProperty(aliasedKinds, String(index));
        if (result.size > 0) return result;
      }
      const nextSeen = new Set(seen);
      nextSeen.add(variable);
      const declarator = variableDeclarator(variable);
      if (
        declarator?.init !== null &&
        declarator?.init !== undefined &&
        declarator.id.type === "Identifier"
      )
        return ambientArrayElementKinds(sourceCode, declarator.init, index, aliases, nextSeen);
    }
  }
  const element = arrayElementExpression(sourceCode, unwrapped, index, aliases, seen);
  return element === null ? new Set() : ambientKinds(sourceCode, element, aliases, seen);
}

function bindingNames(node: ESTree.Node): string[] {
  if (node.type === "Identifier") return [node.name];
  if (node.type === "AssignmentPattern") return bindingNames(node.left);
  if (node.type === "RestElement") return bindingNames(node.argument);
  if (node.type === "ArrayPattern") {
    return node.elements.flatMap((element) => (element === null ? [] : bindingNames(element)));
  }
  if (node.type === "ObjectPattern") {
    return node.properties.flatMap((property) =>
      property.type === "Property" ? bindingNames(property.value) : bindingNames(property.argument),
    );
  }
  return [];
}

function isAmbientCallMember(
  sourceCode: SourceCode,
  node: ESTree.MemberExpression,
  aliases: AmbientAliases,
): boolean {
  return (
    (node.property.type === "Identifier" || node.property.type === "Literal") &&
    ["call", "apply", "bind"].includes(propertyName(node) ?? "") &&
    ambientKinds(sourceCode, node.object, aliases).has("Date")
  );
}

function arrayRestAmbientKinds(
  sourceCode: SourceCode,
  source: ESTree.Expression | null,
  index: number,
  aliases: AmbientAliases,
): Set<AmbientKind> {
  const result = new Set<AmbientKind>();
  if (source === null) return result;
  const length = staticArrayLength(sourceCode, source, aliases);
  if (length === null) {
    const kinds = ambientKinds(sourceCode, source, aliases);
    if (kinds.has("array-Date")) result.add("array-Date");
    if (kinds.has("array-performance")) result.add("array-performance");
    return result;
  }
  for (let current = index; current < length; current += 1) {
    const element = ambientArrayElementKinds(sourceCode, source, current, aliases);
    if (element.has("Date")) result.add("array-Date");
    if (element.has("performance")) result.add("array-performance");
  }
  return result;
}

function updateAmbientTarget(
  sourceCode: SourceCode,
  target: ESTree.Node,
  base: Set<AmbientKind>,
  aliases: AmbientAliases,
  mode: AliasUpdateMode,
  source: ESTree.Expression | null,
  sourceMayBeUndefined = source === null,
): void {
  if (target.type === "Identifier") {
    const variable = resolveVariable(sourceCode, target);
    if (variable !== null) {
      if (mode === "replace") {
        aliases.set(variable, addCurrentStateFacts(sourceCode, source, new Set(base), aliases));
      } else if (base.size > 0) {
        const current = aliases.get(variable) ?? new Set<AmbientKind>();
        aliases.set(
          variable,
          addCurrentStateFacts(sourceCode, source, addAmbientKinds(current, base), aliases),
        );
      }
    }
    return;
  }
  if (target.type === "AssignmentPattern") {
    const defaults =
      sourceMayBeUndefined || (source !== null && definitelyUndefined(sourceCode, source))
        ? ambientKinds(sourceCode, target.right, aliases)
        : new Set<AmbientKind>();
    updateAmbientTarget(
      sourceCode,
      target.left,
      addAmbientKinds(new Set(base), defaults),
      aliases,
      mode,
      source,
      sourceMayBeUndefined,
    );
    return;
  }
  if (target.type === "RestElement") {
    updateAmbientTarget(
      sourceCode,
      target.argument,
      base,
      aliases,
      mode,
      source,
      sourceMayBeUndefined,
    );
    return;
  }
  if (target.type === "ArrayPattern") {
    for (const [index, element] of target.elements.entries()) {
      if (element === null) continue;
      const elementSource =
        source === null ? null : arrayElementExpression(sourceCode, source, index, aliases);
      const elementBase =
        source === null
          ? new Set<AmbientKind>()
          : element.type === "RestElement"
            ? arrayRestAmbientKinds(sourceCode, source, index, aliases)
            : ambientArrayElementKinds(sourceCode, source, index, aliases);
      updateAmbientTarget(sourceCode, element, elementBase, aliases, mode, elementSource);
    }
    return;
  }
  if (target.type !== "ObjectPattern") return;
  for (const property of target.properties) {
    if (property.type !== "Property") {
      updateAmbientTarget(
        sourceCode,
        property.argument,
        objectRestAmbientKinds(sourceCode, source, base, aliases),
        aliases,
        mode,
        source,
        sourceMayBeUndefined,
      );
      continue;
    }
    const key = propertyKeyName(property);
    const facts =
      source === null || key === null
        ? emptyObjectPropertyFacts()
        : objectPropertyFacts(sourceCode, source, key, aliases);
    const propertyBase = facts.values.reduce(
      (result, value) => addAmbientKinds(result, ambientKinds(sourceCode, value, aliases)),
      ambientKindsForProperty(base, key),
    );
    const propertySource = facts.values[0] ?? null;
    const propertyMayBeUndefined =
      sourceMayBeUndefined ||
      facts.maybeMissing ||
      facts.values.some((value) => definitelyUndefined(sourceCode, value));
    updateAmbientTarget(
      sourceCode,
      property.value,
      propertyBase,
      aliases,
      mode,
      propertySource,
      propertyMayBeUndefined,
    );
  }
}

type FunctionLike = {
  params: readonly ESTree.Node[];
  body: ESTree.BlockStatement | ESTree.Expression | null;
};

type AnalysisContext = {
  sourceCode: SourceCode;
  report: (node: ESTree.Node) => void;
};

type FlowResult = {
  normal: AmbientAliases | null;
  breaks: AmbientAliases[];
  continues: AmbientAliases[];
};

function normalFlow(state: AmbientAliases): FlowResult {
  return { normal: state, breaks: [], continues: [] };
}

function abruptFlow(kind: "break" | "continue", state: AmbientAliases): FlowResult {
  return {
    normal: null,
    breaks: kind === "break" ? [state] : [],
    continues: kind === "continue" ? [state] : [],
  };
}

function joinNormalStates(states: readonly (AmbientAliases | null)[]): AmbientAliases | null {
  const reachable = states.filter((state): state is AmbientAliases => state !== null);
  return reachable.length === 0 ? null : joinAmbientAliases(...reachable);
}

function joinFlowResults(results: readonly FlowResult[]): FlowResult {
  return {
    normal: joinNormalStates(results.map((result) => result.normal)),
    breaks: results.flatMap((result) => result.breaks),
    continues: results.flatMap((result) => result.continues),
  };
}

function cloneAmbientAliases(aliases: AmbientAliases): AmbientAliases {
  return new Map([...aliases].map(([variable, kinds]) => [variable, new Set(kinds)]));
}

function joinAmbientAliases(...states: AmbientAliases[]): AmbientAliases {
  const result: AmbientAliases = new Map();
  for (const state of states) {
    for (const [variable, kinds] of state) {
      const current = result.get(variable) ?? new Set<AmbientKind>();
      result.set(variable, addAmbientKinds(current, kinds));
    }
  }
  return result;
}

function analyzeFunction(
  context: AnalysisContext,
  node: FunctionLike,
  outer: AmbientAliases,
): void {
  let state = cloneAmbientAliases(outer);
  for (const parameter of node.params) {
    if (parameter.type === "AssignmentPattern") {
      state = analyzeExpression(context, parameter.right, state);
      updateAmbientTarget(
        context.sourceCode,
        parameter.left,
        ambientKinds(context.sourceCode, parameter.right, state),
        state,
        "replace",
        parameter.right,
      );
    }
  }
  if (node.body === null) return;
  if (node.body.type === "BlockStatement") analyzeStatement(context, node.body, state);
  else analyzeExpression(context, node.body, state);
}

function analyzeClass(
  context: AnalysisContext,
  node: ESTree.Class,
  aliases: AmbientAliases,
): AmbientAliases {
  let state = node.superClass === null
    ? aliases
    : analyzeExpression(context, node.superClass, aliases);
  for (const element of node.body.body) {
    if (element.type === "StaticBlock") {
      const result = analyzeStatements(context, element.body, cloneAmbientAliases(state));
      state = result.normal ?? state;
      continue;
    }
    if (element.type === "MethodDefinition" || element.type === "TSAbstractMethodDefinition") {
      if (element.computed) state = analyzeExpression(context, element.key as ESTree.Expression, state);
      analyzeFunction(context, element.value, cloneAmbientAliases(state));
      continue;
    }
    if (
      element.type === "PropertyDefinition" ||
      element.type === "TSAbstractPropertyDefinition" ||
      element.type === "AccessorProperty" ||
      element.type === "TSAbstractAccessorProperty"
    ) {
      if (element.computed) state = analyzeExpression(context, element.key as ESTree.Expression, state);
      if (element.value !== null) state = analyzeExpression(context, element.value, state);
    }
  }
  return state;
}

function reportAmbientCall(
  context: AnalysisContext,
  node: ESTree.CallExpression,
  aliases: AmbientAliases,
): boolean {
  if (node.callee.type === "Super") return false;
  const kinds = ambientKinds(context.sourceCode, node.callee, aliases);
  const ambient =
    kinds.has("Date") ||
    kinds.has("performance") ||
    kinds.has("Date.now") ||
    kinds.has("performance.now") ||
    (node.callee.type === "MemberExpression" &&
      isAmbientCallMember(context.sourceCode, node.callee, aliases));
  if (ambient) context.report(node.callee);
  return ambient;
}

function analyzeExpression(
  context: AnalysisContext,
  node: ESTree.Expression,
  aliases: AmbientAliases,
  reportMember = true,
): AmbientAliases {
  if (
    node.type === "ParenthesizedExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSTypeAssertion" ||
    node.type === "TSNonNullExpression" ||
    node.type === "TSInstantiationExpression"
  )
    return analyzeExpression(context, node.expression, aliases, reportMember);
  if (node.type === "AssignmentExpression") {
    let state = analyzeExpression(context, node.left as ESTree.Expression, aliases);
    state = analyzeExpression(context, node.right, state);
    updateAmbientTarget(
      context.sourceCode,
      node.left,
      ambientKinds(context.sourceCode, node.right, state),
      state,
      "replace",
      node.right,
    );
    return state;
  }
  if (node.type === "SequenceExpression") {
    let state = aliases;
    for (const expression of node.expressions)
      state = analyzeExpression(context, expression, state);
    return state;
  }
  if (node.type === "ConditionalExpression") {
    const afterTest = analyzeExpression(context, node.test, aliases);
    const choice = constantBranch(context.sourceCode, node.test, afterTest);
    if (choice === "consequent") return analyzeExpression(context, node.consequent, afterTest);
    if (choice === "alternate") return analyzeExpression(context, node.alternate, afterTest);
    const consequent = analyzeExpression(context, node.consequent, cloneAmbientAliases(afterTest));
    const alternate = analyzeExpression(context, node.alternate, cloneAmbientAliases(afterTest));
    return joinAmbientAliases(consequent, alternate);
  }
  if (node.type === "LogicalExpression") {
    const afterLeft = analyzeExpression(context, node.left, aliases);
    if (node.operator === "&&") {
      if (
        definitelyFalsyLiteral(unwrapExpression(node.left)) ||
        definitelyUndefined(context.sourceCode, node.left)
      )
        return afterLeft;
      if (definitelyTruthy(context.sourceCode, node.left, afterLeft))
        return analyzeExpression(context, node.right, afterLeft);
    } else if (node.operator === "||") {
      if (definitelyTruthy(context.sourceCode, node.left, afterLeft)) return afterLeft;
      if (
        definitelyFalsyLiteral(unwrapExpression(node.left)) ||
        definitelyUndefined(context.sourceCode, node.left)
      )
        return analyzeExpression(context, node.right, afterLeft);
    } else {
      if (definitelyNullish(context.sourceCode, node.left, afterLeft))
        return analyzeExpression(context, node.right, afterLeft);
      if (definitelyTruthy(context.sourceCode, node.left, afterLeft)) return afterLeft;
    }
    const afterRight = analyzeExpression(context, node.right, cloneAmbientAliases(afterLeft));
    return joinAmbientAliases(afterLeft, afterRight);
  }
  if (node.type === "CallExpression") {
    const ambient = reportAmbientCall(context, node, aliases);
    let state = analyzeExpression(context, node.callee as ESTree.Expression, aliases, !ambient);
    for (const argument of node.arguments) {
      if (argument.type !== "SpreadElement") state = analyzeExpression(context, argument, state);
    }
    return state;
  }
  if (node.type === "NewExpression") {
    if (
      node.callee.type !== "Super" &&
      ambientKinds(context.sourceCode, node.callee, aliases).has("Date")
    )
      context.report(node);
    let state =
      node.callee.type === "Super" ? aliases : analyzeExpression(context, node.callee, aliases);
    for (const argument of node.arguments) {
      if (argument.type !== "SpreadElement") state = analyzeExpression(context, argument, state);
    }
    return state;
  }
  if (node.type === "MemberExpression") {
    if (reportMember) {
      const kinds = ambientKinds(context.sourceCode, node, aliases);
      if (kinds.has("Date.now") || kinds.has("performance.now")) context.report(node);
    }
    let state = analyzeExpression(context, node.object, aliases);
    if (node.computed)
      state = analyzeExpression(context, node.property as ESTree.Expression, state);
    return state;
  }
  if (node.type === "UnaryExpression") return analyzeExpression(context, node.argument, aliases);
  if (node.type === "UpdateExpression") return analyzeExpression(context, node.argument, aliases);
  if (node.type === "AwaitExpression") return analyzeExpression(context, node.argument, aliases);
  if (node.type === "BinaryExpression") {
    const state = analyzeExpression(context, node.left as ESTree.Expression, aliases);
    return analyzeExpression(context, node.right as ESTree.Expression, state);
  }
  if (node.type === "ArrayExpression") {
    let state = aliases;
    for (const element of node.elements) {
      if (element === null) continue;
      state = analyzeExpression(
        context,
        element.type === "SpreadElement" ? element.argument : element,
        state,
      );
    }
    return state;
  }
  if (node.type === "ObjectExpression") {
    let state = aliases;
    for (const property of node.properties) {
      if (property.type === "SpreadElement")
        state = analyzeExpression(context, property.argument, state);
      else {
        if (property.computed)
          state = analyzeExpression(context, property.key as ESTree.Expression, state);
        state = analyzeExpression(context, property.value, state);
      }
    }
    return state;
  }
  if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
    analyzeFunction(context, node, aliases);
    return aliases;
  }
  if (node.type === "ClassExpression") return analyzeClass(context, node, aliases);
  if (node.type === "ChainExpression")
    return analyzeExpression(context, node.expression, aliases, reportMember);
  if (node.type === "TaggedTemplateExpression")
    return analyzeExpression(context, node.tag, aliases);
  if (node.type === "YieldExpression")
    return node.argument === null ? aliases : analyzeExpression(context, node.argument, aliases);
  return aliases;
}

function analyzeVariableDeclaration(
  context: AnalysisContext,
  node: ESTree.VariableDeclaration,
  aliases: AmbientAliases,
): AmbientAliases {
  let state = aliases;
  for (const declarator of node.declarations) {
    if (declarator.init !== null) state = analyzeExpression(context, declarator.init, state);
    const base =
      declarator.init === null
        ? new Set<AmbientKind>()
        : ambientKinds(context.sourceCode, declarator.init, state);
    updateAmbientTarget(context.sourceCode, declarator.id, base, state, "replace", declarator.init);
  }
  return state;
}

function analyzeStatement(
  context: AnalysisContext,
  node: ESTree.Statement | ESTree.BlockStatement,
  aliases: AmbientAliases,
): FlowResult {
  switch (node.type) {
    case "BlockStatement":
      return analyzeStatements(context, node.body, aliases);
    case "ExpressionStatement":
      return normalFlow(analyzeExpression(context, node.expression, aliases));
    case "VariableDeclaration":
      return normalFlow(analyzeVariableDeclaration(context, node, aliases));
    case "FunctionDeclaration":
      analyzeFunction(context, node, aliases);
      return normalFlow(aliases);
    case "ReturnStatement":
    case "ThrowStatement":
      if (node.argument !== null) analyzeExpression(context, node.argument, aliases);
      return { normal: null, breaks: [], continues: [] };
    case "BreakStatement":
      return abruptFlow("break", aliases);
    case "ContinueStatement":
      return abruptFlow("continue", aliases);
    case "IfStatement": {
      const afterTest = analyzeExpression(context, node.test, aliases);
      const choice = constantBranch(context.sourceCode, node.test, afterTest);
      if (choice === "consequent")
        return analyzeStatement(context, node.consequent, cloneAmbientAliases(afterTest));
      if (choice === "alternate") {
        return node.alternate === null
          ? normalFlow(afterTest)
          : analyzeStatement(context, node.alternate, cloneAmbientAliases(afterTest));
      }
      const consequent = analyzeStatement(context, node.consequent, cloneAmbientAliases(afterTest));
      const alternate =
        node.alternate === null
          ? normalFlow(cloneAmbientAliases(afterTest))
          : analyzeStatement(context, node.alternate, cloneAmbientAliases(afterTest));
      return joinFlowResults([consequent, alternate]);
    }
    case "WhileStatement": {
      const afterTest = analyzeExpression(context, node.test, aliases);
      if (constantBranch(context.sourceCode, node.test, afterTest) === "alternate")
        return normalFlow(afterTest);
      const body = analyzeStatement(context, node.body, cloneAmbientAliases(afterTest));
      const testIsAlwaysTrue =
        constantBranch(context.sourceCode, node.test, afterTest) === "consequent";
      return {
        normal: joinNormalStates([
          ...(testIsAlwaysTrue ? [] : [afterTest, body.normal, ...body.continues]),
          ...body.breaks,
        ]),
        breaks: [],
        continues: [],
      };
    }
    case "DoWhileStatement": {
      const body = analyzeStatement(context, node.body, cloneAmbientAliases(aliases));
      const testState = joinNormalStates([body.normal, ...body.continues]);
      const afterTest =
        testState === null ? null : analyzeExpression(context, node.test, testState);
      const testIsAlwaysTrue =
        afterTest !== null &&
        constantBranch(context.sourceCode, node.test, afterTest) === "consequent";
      return {
        normal: joinNormalStates([...body.breaks, ...(testIsAlwaysTrue ? [] : [afterTest])]),
        breaks: [],
        continues: [],
      };
    }
    case "ForStatement": {
      let beforeLoop = aliases;
      if (node.init !== null) {
        beforeLoop =
          node.init.type === "VariableDeclaration"
            ? analyzeVariableDeclaration(context, node.init, beforeLoop)
            : analyzeExpression(context, node.init, beforeLoop);
      }
      const afterTest =
        node.test === null ? beforeLoop : analyzeExpression(context, node.test, beforeLoop);
      if (
        node.test !== null &&
        constantBranch(context.sourceCode, node.test, afterTest) === "alternate"
      )
        return normalFlow(afterTest);
      const body = analyzeStatement(context, node.body, cloneAmbientAliases(afterTest));
      const iterationState = joinNormalStates([body.normal, ...body.continues]);
      const afterUpdate =
        iterationState === null || node.update === null
          ? iterationState
          : analyzeExpression(context, node.update, iterationState);
      const testIsAlwaysTrue =
        node.test === null ||
        (afterTest !== null &&
          constantBranch(context.sourceCode, node.test, afterTest) === "consequent");
      return {
        normal: joinNormalStates([
          ...(testIsAlwaysTrue ? [] : [beforeLoop]),
          ...body.breaks,
          ...(testIsAlwaysTrue ? [] : [afterUpdate]),
        ]),
        breaks: [],
        continues: [],
      };
    }
    case "ForInStatement":
    case "ForOfStatement": {
      const afterRight = analyzeExpression(context, node.right, aliases);
      const iteration =
        node.left.type === "VariableDeclaration"
          ? analyzeVariableDeclaration(context, node.left, cloneAmbientAliases(afterRight))
          : analyzeExpression(
              context,
              node.left as ESTree.Expression,
              cloneAmbientAliases(afterRight),
            );
      const afterBody = analyzeStatement(context, node.body, iteration);
      return {
        normal: joinNormalStates([
          afterRight,
          afterBody.normal,
          ...afterBody.breaks,
          ...afterBody.continues,
        ]),
        breaks: [],
        continues: [],
      };
    }
    case "SwitchStatement": {
      const afterDiscriminant = analyzeExpression(context, node.discriminant, aliases);
      let fallthrough: AmbientAliases | null = null;
      const exits: AmbientAliases[] = node.cases.some((branch) => branch.test === null)
        ? []
        : [afterDiscriminant];
      const continues: AmbientAliases[] = [];
      for (const branch of node.cases) {
        const entry = joinNormalStates([
          afterDiscriminant,
          fallthrough === null ? null : cloneAmbientAliases(fallthrough),
        ]);
        if (entry === null) {
          fallthrough = null;
          continue;
        }
        const caseEntry =
          branch.test === null
            ? entry
            : analyzeExpression(context, branch.test, cloneAmbientAliases(entry));
        const result = analyzeStatements(context, branch.consequent, cloneAmbientAliases(caseEntry));
        exits.push(...result.breaks);
        continues.push(...result.continues);
        fallthrough = result.normal;
      }
      if (fallthrough !== null) exits.push(fallthrough);
      return { normal: joinNormalStates(exits), breaks: [], continues };
    }
    case "TryStatement": {
      const tried = analyzeStatement(context, node.block, cloneAmbientAliases(aliases));
      const caught =
        node.handler === null
          ? normalFlow(cloneAmbientAliases(aliases))
          : analyzeStatement(context, node.handler.body, cloneAmbientAliases(aliases));
      const joined = joinFlowResults([tried, caught]);
      if (node.finalizer === null) return joined;
      if (joined.normal === null)
        return {
          normal: null,
          breaks: [...joined.breaks],
          continues: [...joined.continues],
        };
      const finalizer = analyzeStatement(context, node.finalizer, joined.normal);
      return joinFlowResults([
        finalizer,
        {
          normal: null,
          breaks: joined.breaks,
          continues: joined.continues,
        },
      ]);
    }
    case "LabeledStatement":
      return analyzeStatement(context, node.body, aliases);
    case "WithStatement": {
      const afterObject = analyzeExpression(context, node.object, aliases);
      return analyzeStatement(context, node.body, afterObject);
    }
    case "ClassDeclaration":
      return normalFlow(analyzeClass(context, node, aliases));
    default:
      return normalFlow(aliases);
  }
}

function analyzeStatements(
  context: AnalysisContext,
  statements: readonly (ESTree.Statement | ESTree.ModuleDeclaration)[],
  aliases: AmbientAliases,
): FlowResult {
  let state: AmbientAliases | null = aliases;
  const breaks: AmbientAliases[] = [];
  const continues: AmbientAliases[] = [];
  for (const statement of statements) {
    if (state === null) break;
    if (statement.type === "ExportNamedDeclaration") {
      if (statement.declaration?.type === "VariableDeclaration")
        state = analyzeVariableDeclaration(context, statement.declaration, state);
      else if (statement.declaration?.type === "FunctionDeclaration")
        analyzeFunction(context, statement.declaration, state);
      else if (statement.declaration?.type === "ClassDeclaration")
        state = analyzeClass(context, statement.declaration, state);
      continue;
    }
    if (statement.type === "ExportDefaultDeclaration") {
      if (statement.declaration.type === "FunctionDeclaration")
        analyzeFunction(context, statement.declaration, state);
      else if (statement.declaration.type === "ClassDeclaration")
        state = analyzeClass(context, statement.declaration, state);
      else
        state = analyzeExpression(context, statement.declaration as ESTree.Expression, state);
      continue;
    }
    if (statement.type !== "ImportDeclaration" && statement.type !== "ExportAllDeclaration") {
      const result = analyzeStatement(context, statement, state);
      breaks.push(...result.breaks);
      continues.push(...result.continues);
      state = result.normal;
    }
  }
  return { normal: state, breaks, continues };
}

function analyzeProgram(context: AnalysisContext, node: ESTree.Program): void {
  analyzeStatements(context, node.body, new Map());
}

/** Require domain time reads to use the supplied Effect Clock. */
export const noDomainWallClockRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow ambient wall-clock reads and Date construction in runtime domain source.",
    },
    messages: {
      wallClock:
        "Use the supplied Effect Clock at the host boundary instead of reading ambient wall time in domain code.",
    },
    schema: [
      {
        type: "object",
        properties: {
          sourceRoots: { type: "array", items: { type: "string" } },
          allowedPathFragments: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [
      {
        sourceRoots: [...defaultSourceRoots],
        allowedPathFragments: [...defaultAllowedPathFragments],
      },
    ],
  },
  createOnce(context) {
    return {
      Program(node: ESTree.Program) {
        const option = context.options?.[0] as RuleOptions[0] | undefined;
        const roots = option?.sourceRoots ?? [...defaultSourceRoots];
        const allowed = option?.allowedPathFragments ?? [...defaultAllowedPathFragments];
        const filename = normalized(context.filename);
        const enabled =
          roots.some((root) => filename.includes(`/${normalized(root)}/`)) &&
          !isTestSupportFile(context.filename) &&
          !allowed.some((fragment) => filename.includes(fragment));
        if (enabled)
          analyzeProgram(
            {
              sourceCode: context.sourceCode,
              report: (reportedNode) =>
                context.report({ node: reportedNode, messageId: "wallClock" }),
            },
            node,
          );
      },
    };
  },
});
