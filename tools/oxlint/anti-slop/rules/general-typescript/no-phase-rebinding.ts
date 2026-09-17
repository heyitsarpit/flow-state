import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";

type RuleOptions = [{ sourceRoots?: string[]; phaseNames?: string[] }];
type IdentifierNode = ESTree.IdentifierName | ESTree.IdentifierReference | ESTree.BindingIdentifier;
type LiteralNode = Extract<ESTree.Expression, { type: "Literal" }>;
type Truthiness = "truthy" | "falsy" | "unknown";
type Nullishness = "nullish" | "non-nullish" | "unknown";

const defaultSourceRoots = ["packages/flow-state-rewrite/src"] as const;
const defaultPhaseNames = [
  "activated",
  "admitted",
  "attached",
  "captured",
  "exposed",
  "prepared",
  "published",
  "registered",
  "staged",
  "phase",
  "phases",
  "stages",
  "workflow",
] as const;

function normalized(value: string): string {
  return value.replaceAll("\\", "/");
}

function inSourceRoot(filename: string, roots: readonly string[]): boolean {
  const value = normalized(filename);
  return roots.some((root) => value.includes(`/${normalized(root)}/`));
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

function variableDeclarator(variable: Variable): ESTree.VariableDeclarator | null {
  for (const definition of variable.defs) {
    if (definition.type === "Variable" && definition.node.type === "VariableDeclarator")
      return definition.node;
  }
  return null;
}

function bindingIdentifiers(node: ESTree.Node, result: IdentifierNode[] = []): IdentifierNode[] {
  switch (node.type) {
    case "Identifier":
      result.push(node);
      break;
    case "AssignmentPattern":
      bindingIdentifiers(node.left, result);
      break;
    case "RestElement":
      bindingIdentifiers(node.argument, result);
      break;
    case "ArrayPattern":
      for (const element of node.elements)
        if (element !== null) bindingIdentifiers(element, result);
      break;
    case "ObjectPattern":
      for (const property of node.properties) {
        if (property.type === "Property") bindingIdentifiers(property.value, result);
        else bindingIdentifiers(property.argument, result);
      }
      break;
  }
  return result;
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
  )
    current = current.expression;
  return current;
}

function isNumericLiteral(node: ESTree.Node | null): boolean {
  return node?.type === "Literal" && typeof node.value === "number" && Number.isFinite(node.value);
}

function isOneShotAdmittedCapabilityWrite(variable: Variable, write: ESTree.Node | null): boolean {
  if (write?.type !== "AssignmentExpression" || write.operator !== "=") return false;
  if (
    variable.name !== "admitted" ||
    variable.references.filter((reference) => reference.isWrite() && !reference.init).length !== 1
  )
    return false;
  const declarator = variableDeclarator(variable);
  return (
    declarator?.id.type === "Identifier" &&
    declarator.init?.type === "Literal" &&
    declarator.init.value === false &&
    write.left.type === "Identifier" &&
    write.right.type === "Literal" &&
    write.right.value === true
  );
}

type ExpressionFacts = {
  object: boolean;
  phaseObjects: Set<Variable>;
  truthiness: Truthiness;
  nullishness: Nullishness;
};

function unknownFacts(overrides: Partial<ExpressionFacts> = {}): ExpressionFacts {
  return {
    object: false,
    phaseObjects: new Set(),
    truthiness: "unknown",
    nullishness: "unknown",
    ...overrides,
  };
}

function join<T extends string>(left: T, right: T): T | "unknown" {
  return left === right ? left : ("unknown" as const);
}

function combineFacts(left: ExpressionFacts, right: ExpressionFacts): ExpressionFacts {
  return {
    object: left.object && right.object,
    phaseObjects: new Set([...left.phaseObjects, ...right.phaseObjects]),
    truthiness: join(left.truthiness, right.truthiness),
    nullishness: join(left.nullishness, right.nullishness),
  };
}

function definitelyUndefined(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  seen: Set<Variable> = new Set(),
): boolean {
  const node = unwrapExpression(expression);
  if (node.type === "UnaryExpression" && node.operator === "void") return true;
  if (node.type !== "Identifier") return false;
  const variable = resolveVariable(sourceCode, node);
  if (node.name === "undefined" && (variable === null || variable.defs.length === 0)) return true;
  if (variable === null || seen.has(variable)) return false;
  const declarator = variableDeclarator(variable);
  if (declarator?.id.type !== "Identifier" || declarator.init === null) return false;
  const nextSeen = new Set(seen);
  nextSeen.add(variable);
  return definitelyUndefined(sourceCode, declarator.init, nextSeen);
}

function literalFacts(node: LiteralNode): ExpressionFacts {
  const falsy = node.value === null || !node.value;
  return {
    object: false,
    phaseObjects: new Set(),
    truthiness: falsy ? "falsy" : "truthy",
    nullishness: node.value === null ? "nullish" : "non-nullish",
  };
}

function expressionFacts(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  phaseObjects: Set<Variable>,
  seen: Set<Variable> = new Set(),
): ExpressionFacts {
  const node = unwrapExpression(expression);
  if (node.type === "AssignmentExpression")
    return expressionFacts(sourceCode, node.right, phaseObjects, seen);
  if (node.type === "SequenceExpression") {
    const last = node.expressions.at(-1);
    return last === undefined
      ? unknownFacts()
      : expressionFacts(sourceCode, last, phaseObjects, seen);
  }
  if (node.type === "Identifier") {
    const variable = resolveVariable(sourceCode, node);
    if (variable === null)
      return node.name === "undefined"
        ? unknownFacts({ truthiness: "falsy", nullishness: "nullish" })
        : unknownFacts();
    if (phaseObjects.has(variable))
      return unknownFacts({
        object: true,
        phaseObjects: new Set([variable]),
        truthiness: "truthy",
        nullishness: "non-nullish",
      });
    if (seen.has(variable)) return unknownFacts();
    const declarator = variableDeclarator(variable);
    if (declarator?.id.type !== "Identifier" || declarator.init === null) return unknownFacts();
    const nextSeen = new Set(seen);
    nextSeen.add(variable);
    return expressionFacts(sourceCode, declarator.init, phaseObjects, nextSeen);
  }
  if (node.type === "Literal") return literalFacts(node);
  if (node.type === "UnaryExpression" && node.operator === "void")
    return unknownFacts({ truthiness: "falsy", nullishness: "nullish" });
  if (node.type === "ObjectExpression") {
    const phaseSources = new Set<Variable>();
    for (const property of node.properties) {
      if (property.type !== "SpreadElement") continue;
      for (const variable of expressionFacts(sourceCode, property.argument, phaseObjects)
        .phaseObjects)
        phaseSources.add(variable);
    }
    return unknownFacts({
      object: true,
      phaseObjects: phaseSources,
      truthiness: "truthy",
      nullishness: "non-nullish",
    });
  }
  if (
    node.type === "ArrayExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "ClassExpression" ||
    node.type === "NewExpression"
  )
    return unknownFacts({ object: true, truthiness: "truthy", nullishness: "non-nullish" });
  if (node.type === "ConditionalExpression") {
    const test = expressionFacts(sourceCode, node.test, phaseObjects);
    if (test.truthiness === "truthy")
      return expressionFacts(sourceCode, node.consequent, phaseObjects, seen);
    if (test.truthiness === "falsy")
      return expressionFacts(sourceCode, node.alternate, phaseObjects, seen);
    return combineFacts(
      expressionFacts(sourceCode, node.consequent, phaseObjects, seen),
      expressionFacts(sourceCode, node.alternate, phaseObjects, seen),
    );
  }
  if (node.type === "LogicalExpression") {
    const left = expressionFacts(sourceCode, node.left, phaseObjects, seen);
    if (node.operator === "&&") {
      if (left.truthiness === "falsy") return left;
      if (left.truthiness === "truthy")
        return expressionFacts(sourceCode, node.right, phaseObjects, seen);
    } else if (node.operator === "||") {
      if (left.truthiness === "truthy") return left;
      if (left.truthiness === "falsy")
        return expressionFacts(sourceCode, node.right, phaseObjects, seen);
    } else {
      if (left.nullishness === "nullish")
        return expressionFacts(sourceCode, node.right, phaseObjects, seen);
      if (left.nullishness === "non-nullish") return left;
    }
    return combineFacts(left, expressionFacts(sourceCode, node.right, phaseObjects, seen));
  }
  return unknownFacts({
    truthiness: definitelyUndefined(sourceCode, node) ? "falsy" : "unknown",
    nullishness: definitelyUndefined(sourceCode, node) ? "nullish" : "unknown",
  });
}

function constantBranch(
  sourceCode: SourceCode,
  test: ESTree.Expression,
  phaseObjects: Set<Variable>,
): "consequent" | "alternate" | null {
  const truthiness = expressionFacts(sourceCode, test, phaseObjects).truthiness;
  return truthiness === "truthy" ? "consequent" : truthiness === "falsy" ? "alternate" : null;
}

type PathFacts = { sources: ESTree.Expression[]; maybeMissing: boolean };

function pathFacts(sources: ESTree.Expression[] = [], maybeMissing = true): PathFacts {
  return { sources, maybeMissing };
}

function combinePaths(left: PathFacts, right: PathFacts): PathFacts {
  return pathFacts([...left.sources, ...right.sources], left.maybeMissing || right.maybeMissing);
}

function staticArrayLength(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  phaseObjects: Set<Variable>,
  seen: Set<Variable> = new Set(),
): number | null {
  const node = unwrapExpression(expression);
  if (node.type === "AssignmentExpression")
    return staticArrayLength(sourceCode, node.right, phaseObjects, seen);
  if (node.type === "ArrayExpression") {
    let length = 0;
    for (const element of node.elements) {
      if (element === null) {
        length += 1;
        continue;
      }
      if (element.type !== "SpreadElement") {
        length += 1;
        continue;
      }
      const spreadLength = staticArrayLength(sourceCode, element.argument, phaseObjects, seen);
      if (spreadLength === null) return null;
      length += spreadLength;
    }
    return length;
  }
  if (node.type === "ConditionalExpression") {
    const branch = constantBranch(sourceCode, node.test, phaseObjects);
    if (branch === "consequent")
      return staticArrayLength(sourceCode, node.consequent, phaseObjects, seen);
    if (branch === "alternate")
      return staticArrayLength(sourceCode, node.alternate, phaseObjects, seen);
    const left = staticArrayLength(sourceCode, node.consequent, phaseObjects, seen);
    const right = staticArrayLength(sourceCode, node.alternate, phaseObjects, seen);
    return left !== null && left === right ? left : null;
  }
  if (node.type === "SequenceExpression") {
    const last = node.expressions.at(-1);
    return last === undefined ? null : staticArrayLength(sourceCode, last, phaseObjects, seen);
  }
  if (node.type !== "Identifier") return null;
  const variable = resolveVariable(sourceCode, node);
  if (variable === null || seen.has(variable)) return null;
  const declarator = variableDeclarator(variable);
  if (declarator?.id.type !== "Identifier" || declarator.init === null) return null;
  const nextSeen = new Set(seen);
  nextSeen.add(variable);
  return staticArrayLength(sourceCode, declarator.init, phaseObjects, nextSeen);
}

function arrayElementSources(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  index: number,
  phaseObjects: Set<Variable>,
  seen: Set<Variable> = new Set(),
): PathFacts {
  const node = unwrapExpression(expression);
  if (node.type === "AssignmentExpression")
    return arrayElementSources(sourceCode, node.right, index, phaseObjects, seen);
  if (node.type === "ArrayExpression") {
    let offset = 0;
    for (const element of node.elements) {
      if (element === null) {
        if (offset === index) return pathFacts();
        offset += 1;
        continue;
      }
      if (element.type !== "SpreadElement") {
        if (offset === index) return pathFacts([element], false);
        offset += 1;
        continue;
      }
      const spreadLength = staticArrayLength(sourceCode, element.argument, phaseObjects);
      if (spreadLength === null) return pathFacts();
      if (index >= offset && index < offset + spreadLength)
        return arrayElementSources(
          sourceCode,
          element.argument,
          index - offset,
          phaseObjects,
          seen,
        );
      offset += spreadLength;
    }
    return pathFacts();
  }
  if (node.type === "ConditionalExpression") {
    const branch = constantBranch(sourceCode, node.test, phaseObjects);
    if (branch === "consequent")
      return arrayElementSources(sourceCode, node.consequent, index, phaseObjects, seen);
    if (branch === "alternate")
      return arrayElementSources(sourceCode, node.alternate, index, phaseObjects, seen);
    return combinePaths(
      arrayElementSources(sourceCode, node.consequent, index, phaseObjects, seen),
      arrayElementSources(sourceCode, node.alternate, index, phaseObjects, seen),
    );
  }
  if (node.type === "LogicalExpression") {
    const left = expressionFacts(sourceCode, node.left, phaseObjects);
    if (node.operator === "&&") {
      if (left.truthiness === "falsy") return pathFacts();
      if (left.truthiness === "truthy")
        return arrayElementSources(sourceCode, node.right, index, phaseObjects, seen);
    } else if (node.operator === "||") {
      if (left.truthiness === "truthy")
        return arrayElementSources(sourceCode, node.left, index, phaseObjects, seen);
      if (left.truthiness === "falsy")
        return arrayElementSources(sourceCode, node.right, index, phaseObjects, seen);
    } else {
      if (left.nullishness === "nullish")
        return arrayElementSources(sourceCode, node.right, index, phaseObjects, seen);
      if (left.nullishness === "non-nullish")
        return arrayElementSources(sourceCode, node.left, index, phaseObjects, seen);
    }
    return combinePaths(
      arrayElementSources(sourceCode, node.left, index, phaseObjects, seen),
      arrayElementSources(sourceCode, node.right, index, phaseObjects, seen),
    );
  }
  if (node.type === "SequenceExpression") {
    const last = node.expressions.at(-1);
    return last === undefined
      ? pathFacts()
      : arrayElementSources(sourceCode, last, index, phaseObjects, seen);
  }
  if (node.type !== "Identifier") return pathFacts();
  const variable = resolveVariable(sourceCode, node);
  if (variable === null || seen.has(variable)) return pathFacts();
  const declarator = variableDeclarator(variable);
  if (declarator?.id.type !== "Identifier" || declarator.init === null) return pathFacts();
  const nextSeen = new Set(seen);
  nextSeen.add(variable);
  return arrayElementSources(sourceCode, declarator.init, index, phaseObjects, nextSeen);
}

function objectPropertyName(node: ESTree.Node): string | null {
  if (node.type !== "Property") return null;
  if (!node.computed && node.key.type === "Identifier") return node.key.name;
  if (node.computed && node.key.type === "Literal" && typeof node.key.value === "string")
    return node.key.value;
  return null;
}

function objectPropertySources(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  key: string,
  phaseObjects: Set<Variable>,
  seen: Set<Variable> = new Set(),
): PathFacts {
  const node = unwrapExpression(expression);
  if (node.type === "AssignmentExpression")
    return objectPropertySources(sourceCode, node.right, key, phaseObjects, seen);
  if (node.type === "ObjectExpression") {
    const spreadSources: ESTree.Expression[] = [];
    for (let index = node.properties.length - 1; index >= 0; index -= 1) {
      const property = node.properties[index];
      if (property?.type === "Property" && objectPropertyName(property) === key)
        return pathFacts([...spreadSources, property.value], false);
      if (property?.type === "SpreadElement") {
        const spread = objectPropertySources(
          sourceCode,
          property.argument,
          key,
          phaseObjects,
          seen,
        );
        spreadSources.push(...spread.sources);
        if (!spread.maybeMissing) return pathFacts(spreadSources, false);
      }
    }
    return pathFacts(spreadSources);
  }
  if (node.type === "ConditionalExpression") {
    const branch = constantBranch(sourceCode, node.test, phaseObjects);
    if (branch === "consequent")
      return objectPropertySources(sourceCode, node.consequent, key, phaseObjects, seen);
    if (branch === "alternate")
      return objectPropertySources(sourceCode, node.alternate, key, phaseObjects, seen);
    return combinePaths(
      objectPropertySources(sourceCode, node.consequent, key, phaseObjects, seen),
      objectPropertySources(sourceCode, node.alternate, key, phaseObjects, seen),
    );
  }
  if (node.type === "SequenceExpression") {
    const last = node.expressions.at(-1);
    return last === undefined
      ? pathFacts()
      : objectPropertySources(sourceCode, last, key, phaseObjects, seen);
  }
  if (node.type !== "Identifier") return pathFacts();
  const variable = resolveVariable(sourceCode, node);
  if (variable === null || seen.has(variable)) return pathFacts();
  const declarator = variableDeclarator(variable);
  if (declarator?.id.type !== "Identifier" || declarator.init === null) return pathFacts();
  const nextSeen = new Set(seen);
  nextSeen.add(variable);
  return objectPropertySources(sourceCode, declarator.init, key, phaseObjects, nextSeen);
}

function mayBeUndefined(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  phaseObjects: Set<Variable>,
): boolean {
  const node = unwrapExpression(expression);
  if (definitelyUndefined(sourceCode, node)) return true;
  if (node.type === "ConditionalExpression") {
    const branch = constantBranch(sourceCode, node.test, phaseObjects);
    if (branch === "consequent") return mayBeUndefined(sourceCode, node.consequent, phaseObjects);
    if (branch === "alternate") return mayBeUndefined(sourceCode, node.alternate, phaseObjects);
    return (
      mayBeUndefined(sourceCode, node.consequent, phaseObjects) ||
      mayBeUndefined(sourceCode, node.alternate, phaseObjects)
    );
  }
  if (node.type === "LogicalExpression") {
    const left = expressionFacts(sourceCode, node.left, phaseObjects);
    if (node.operator === "&&") {
      if (left.truthiness === "truthy") return mayBeUndefined(sourceCode, node.right, phaseObjects);
      if (left.truthiness === "falsy") return mayBeUndefined(sourceCode, node.left, phaseObjects);
    } else if (node.operator === "||") {
      if (left.truthiness === "truthy") return mayBeUndefined(sourceCode, node.left, phaseObjects);
      if (left.truthiness === "falsy") return mayBeUndefined(sourceCode, node.right, phaseObjects);
    } else {
      if (left.nullishness === "nullish")
        return mayBeUndefined(sourceCode, node.right, phaseObjects);
      if (left.nullishness === "non-nullish")
        return mayBeUndefined(sourceCode, node.left, phaseObjects);
    }
    return (
      mayBeUndefined(sourceCode, node.left, phaseObjects) ||
      mayBeUndefined(sourceCode, node.right, phaseObjects)
    );
  }
  if (node.type === "SequenceExpression") {
    const last = node.expressions.at(-1);
    return last !== undefined && mayBeUndefined(sourceCode, last, phaseObjects);
  }
  if (node.type === "Identifier") {
    const variable = resolveVariable(sourceCode, node);
    const declarator = variable === null ? null : variableDeclarator(variable);
    return (
      declarator?.id.type === "Identifier" &&
      declarator.init !== null &&
      mayBeUndefined(sourceCode, declarator.init, phaseObjects)
    );
  }
  return false;
}

function assignmentTargets(
  node: ESTree.Node,
  result: { identifiers: IdentifierNode[]; members: ESTree.MemberExpression[] } = {
    identifiers: [],
    members: [],
  },
): { identifiers: IdentifierNode[]; members: ESTree.MemberExpression[] } {
  if (node.type === "Identifier") result.identifiers.push(node);
  else if (node.type === "MemberExpression") result.members.push(node);
  else if (node.type === "AssignmentPattern") assignmentTargets(node.left, result);
  else if (node.type === "RestElement") assignmentTargets(node.argument, result);
  else if (node.type === "ArrayPattern") {
    for (const element of node.elements) if (element !== null) assignmentTargets(element, result);
  } else if (node.type === "ObjectPattern") {
    for (const property of node.properties)
      assignmentTargets(property.type === "Property" ? property.value : property.argument, result);
  }
  return result;
}

function hasWriteTarget(sourceCode: SourceCode, node: ESTree.Node, variable: Variable): boolean {
  if (node.type === "AssignmentExpression")
    return node.left.type === "Identifier" && resolveVariable(sourceCode, node.left) === variable;
  if (node.type === "UpdateExpression")
    return (
      node.argument.type === "Identifier" && resolveVariable(sourceCode, node.argument) === variable
    );
  return (
    node.type === "SequenceExpression" &&
    node.expressions.some((expression) => hasWriteTarget(sourceCode, expression, variable))
  );
}

function isVariableReference(
  sourceCode: SourceCode,
  node: ESTree.Node,
  variable: Variable,
): boolean {
  if (node.type === "Identifier") return resolveVariable(sourceCode, node) === variable;
  if (node.type === "MemberExpression")
    return (
      isVariableReference(sourceCode, node.object, variable) ||
      (node.computed && isVariableReference(sourceCode, node.property, variable))
    );
  if (node.type === "BinaryExpression" || node.type === "LogicalExpression")
    return (
      isVariableReference(sourceCode, node.left, variable) ||
      isVariableReference(sourceCode, node.right, variable)
    );
  if (node.type === "UnaryExpression" || node.type === "AwaitExpression")
    return isVariableReference(sourceCode, node.argument, variable);
  if (node.type === "ConditionalExpression")
    return (
      isVariableReference(sourceCode, node.test, variable) ||
      isVariableReference(sourceCode, node.consequent, variable) ||
      isVariableReference(sourceCode, node.alternate, variable)
    );
  if (node.type === "CallExpression" || node.type === "NewExpression")
    return (
      isVariableReference(sourceCode, node.callee, variable) ||
      node.arguments.some(
        (argument) =>
          argument.type !== "SpreadElement" && isVariableReference(sourceCode, argument, variable),
      )
    );
  return false;
}

function isCursorBound(node: ESTree.Node): boolean {
  return (
    isNumericLiteral(node) ||
    (node.type === "MemberExpression" &&
      ((!node.computed && node.property.type === "Identifier" && node.property.name === "length") ||
        (node.computed && node.property.type === "Literal" && node.property.value === "length")))
  );
}

function isCursorTest(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  variable: Variable,
): boolean {
  if (node.type !== "BinaryExpression" || !["<", "<=", ">", ">="].includes(node.operator))
    return false;
  return (
    (isVariableReference(sourceCode, node.left, variable) && isCursorBound(node.right)) ||
    (isCursorBound(node.left) && isVariableReference(sourceCode, node.right, variable))
  );
}

function isNumericCursorUpdate(
  sourceCode: SourceCode,
  node: ESTree.Node,
  variable: Variable,
): boolean {
  if (node.type === "UpdateExpression")
    return (
      (node.operator === "++" || node.operator === "--") &&
      hasWriteTarget(sourceCode, node, variable)
    );
  if (node.type !== "AssignmentExpression" || !hasWriteTarget(sourceCode, node, variable))
    return false;
  if ((node.operator === "+=" || node.operator === "-=") && isNumericLiteral(node.right))
    return true;
  if (node.operator !== "=") return false;
  return (
    node.right.type === "BinaryExpression" &&
    (node.right.operator === "+" || node.right.operator === "-") &&
    ((isVariableReference(sourceCode, node.right.left, variable) &&
      isNumericLiteral(node.right.right)) ||
      (isNumericLiteral(node.right.left) &&
        isVariableReference(sourceCode, node.right.right, variable)))
  );
}

function cursorUpdateNode(
  sourceCode: SourceCode,
  declarator: ESTree.VariableDeclarator,
  variable: Variable,
): ESTree.Node | null {
  if (
    declarator.id.type !== "Identifier" ||
    declarator.parent.type !== "VariableDeclaration" ||
    declarator.parent.parent.type !== "ForStatement" ||
    declarator.parent.parent.init !== declarator.parent ||
    declarator.parent.parent.update === null ||
    !isNumericLiteral(declarator.init) ||
    declarator.parent.parent.test === null ||
    !isCursorTest(sourceCode, declarator.parent.parent.test, variable)
  )
    return null;
  const update = declarator.parent.parent.update;
  if (update.type === "SequenceExpression")
    return (
      update.expressions.find((expression) =>
        isNumericCursorUpdate(sourceCode, expression, variable),
      ) ?? null
    );
  return isNumericCursorUpdate(sourceCode, update, variable) ? update : null;
}

/** Reject mutable workflow values while preserving ordinary locals and real loop cursors. */
export const noPhaseRebindingRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow workflow placeholders and rebinding in the refactored runtime source slice.",
    },
    messages: {
      placeholder:
        "This workflow value is declared without an initializer. Initialize it at its declaration or return a complete value from the transition.",
      rebind:
        "This workflow value is rebound after declaration. Return the next complete value instead of mutating a phase placeholder.",
      phaseBag:
        "Do not mutate a workflow value through properties. Return a complete value from the owning transition.",
    },
    schema: [
      {
        type: "object",
        properties: {
          sourceRoots: { type: "array", items: { type: "string" } },
          phaseNames: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ sourceRoots: [...defaultSourceRoots], phaseNames: [...defaultPhaseNames] }],
  },
  createOnce(context) {
    let enabled = false;
    let phaseNames: Set<string> = new Set(defaultPhaseNames);
    const phaseVariables = new Set<Variable>();
    const phaseObjects = new Set<Variable>();
    const cursorUpdates = new Set<ESTree.Node>();
    const placeholders = new Set<Variable>();
    const sourceCode = () => context.sourceCode;
    const isPhaseName = (identifier: IdentifierNode) => phaseNames.has(identifier.name);

    const markPhase = (variable: Variable, facts: ExpressionFacts, named: boolean) => {
      if (!facts.object || (!named && facts.phaseObjects.size === 0)) return;
      phaseVariables.add(variable);
      phaseObjects.add(variable);
    };

    const seedParameters = (parameters: readonly ESTree.Node[]) => {
      for (const parameter of parameters) {
        for (const identifier of bindingIdentifiers(parameter)) {
          const variable = resolveVariable(sourceCode(), identifier);
          if (variable !== null && isPhaseName(identifier)) phaseVariables.add(variable);
        }
      }
    };

    const markPattern = (
      target: ESTree.Node,
      sources: readonly ESTree.Expression[],
      maybeMissing = false,
    ): void => {
      if (target.type === "Identifier") {
        const variable = resolveVariable(sourceCode(), target);
        if (variable === null) return;
        const facts = sources.reduce(
          (result, expression) =>
            combineFacts(result, expressionFacts(sourceCode(), expression, phaseObjects)),
          unknownFacts({ object: sources.length > 0 }),
        );
        markPhase(variable, facts, isPhaseName(target));
        return;
      }
      if (target.type === "AssignmentPattern") {
        const inherited = sources.filter((source) => !definitelyUndefined(sourceCode(), source));
        const needsDefault =
          maybeMissing ||
          sources.length === 0 ||
          sources.some((source) => mayBeUndefined(sourceCode(), source, phaseObjects));
        markPattern(target.left, needsDefault ? [...inherited, target.right] : inherited);
        return;
      }
      if (target.type === "RestElement") {
        markPattern(target.argument, sources, maybeMissing);
        return;
      }
      if (target.type === "ArrayPattern") {
        for (const [index, element] of target.elements.entries()) {
          if (element === null) continue;
          const facts = sources.map((source) =>
            arrayElementSources(sourceCode(), source, index, phaseObjects),
          );
          markPattern(
            element,
            facts.flatMap((path) => path.sources),
            maybeMissing || facts.some((path) => path.maybeMissing),
          );
        }
        return;
      }
      if (target.type === "ObjectPattern") {
        for (const property of target.properties) {
          if (property.type !== "Property") {
            markPattern(property.argument, sources, maybeMissing);
            continue;
          }
          const key = objectPropertyName(property);
          if (key === null) continue;
          const facts = sources.map((source) =>
            objectPropertySources(sourceCode(), source, key, phaseObjects),
          );
          markPattern(
            property.value,
            facts.flatMap((path) => path.sources),
            maybeMissing || facts.some((path) => path.maybeMissing),
          );
        }
      }
    };

    const reportRebind = (
      variable: Variable,
      node: ESTree.Node,
      write: ESTree.Node | null = null,
    ) => {
      if (
        phaseVariables.has(variable) &&
        !isOneShotAdmittedCapabilityWrite(variable, write) &&
        !cursorUpdates.has(write as ESTree.Node)
      )
        context.report({ node, messageId: "rebind" });
    };

    const rootIdentifier = (expression: ESTree.Expression): ESTree.IdentifierReference | null => {
      let node = unwrapExpression(expression);
      while (node.type === "MemberExpression") node = unwrapExpression(node.object);
      return node.type === "Identifier" ? node : null;
    };

    const reportMemberMutation = (node: ESTree.MemberExpression) => {
      const root = rootIdentifier(node.object);
      if (root === null) return;
      const variable = resolveVariable(sourceCode(), root);
      if (variable !== null && phaseObjects.has(variable))
        context.report({ node, messageId: "phaseBag" });
    };

    const reportAssignmentTarget = (node: ESTree.Node) => {
      const targets = assignmentTargets(node);
      for (const member of targets.members) reportMemberMutation(member);
      for (const identifier of targets.identifiers) {
        const variable = resolveVariable(sourceCode(), identifier);
        if (variable !== null) reportRebind(variable, identifier);
      }
    };

    return {
      Program() {
        const option = context.options?.[0] as RuleOptions[0] | undefined;
        const roots = option?.sourceRoots ?? [...defaultSourceRoots];
        phaseNames = new Set(option?.phaseNames ?? [...defaultPhaseNames]);
        enabled = inSourceRoot(context.filename, roots) && !isTestSupportFile(context.filename);
      },
      FunctionDeclaration(node: ESTree.Function) {
        if (enabled) seedParameters(node.params);
      },
      FunctionExpression(node: ESTree.Function) {
        if (enabled) seedParameters(node.params);
      },
      ArrowFunctionExpression(node: ESTree.ArrowFunctionExpression) {
        if (enabled) seedParameters(node.params);
      },
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (!enabled) return;
        const identifiers = bindingIdentifiers(node.id);
        const facts =
          node.init === null
            ? unknownFacts()
            : expressionFacts(sourceCode(), node.init, phaseObjects);
        if (node.id.type !== "Identifier" && node.init !== null) markPattern(node.id, [node.init]);
        for (const identifier of identifiers) {
          const variable = resolveVariable(sourceCode(), identifier);
          if (variable === null) continue;
          const cursorUpdate = cursorUpdateNode(sourceCode(), node, variable);
          if (cursorUpdate !== null) cursorUpdates.add(cursorUpdate);
          const named = isPhaseName(identifier);
          if (named) phaseVariables.add(variable);
          if (node.id.type === "Identifier") markPhase(variable, facts, named);
          if (node.init === null && named) placeholders.add(variable);
        }
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (!enabled) return;
        const targets = assignmentTargets(node.left);
        for (const member of targets.members) reportMemberMutation(member);
        if (node.left.type !== "Identifier") markPattern(node.left, [node.right]);
        const facts =
          node.left.type === "Identifier"
            ? expressionFacts(sourceCode(), node.right, phaseObjects)
            : unknownFacts();
        for (const identifier of targets.identifiers) {
          const variable = resolveVariable(sourceCode(), identifier);
          if (variable === null) continue;
          if (node.left.type === "Identifier") markPhase(variable, facts, isPhaseName(identifier));
          reportRebind(variable, identifier, node);
        }
      },
      UpdateExpression(node: ESTree.UpdateExpression) {
        if (!enabled) return;
        if (node.argument.type === "MemberExpression") reportMemberMutation(node.argument);
        else if (node.argument.type === "Identifier") {
          const variable = resolveVariable(sourceCode(), node.argument);
          if (variable !== null) reportRebind(variable, node.argument, node);
        }
      },
      CallExpression(node: ESTree.CallExpression) {
        if (enabled && node.callee.type === "MemberExpression") reportMemberMutation(node.callee);
      },
      UnaryExpression(node: ESTree.UnaryExpression) {
        if (enabled && node.operator === "delete" && node.argument.type === "MemberExpression")
          reportMemberMutation(node.argument);
      },
      ForInStatement(node: ESTree.ForInStatement) {
        if (enabled && node.left.type !== "VariableDeclaration") reportAssignmentTarget(node.left);
      },
      ForOfStatement(node: ESTree.ForOfStatement) {
        if (enabled && node.left.type !== "VariableDeclaration") reportAssignmentTarget(node.left);
      },
      "Program:exit"() {
        if (!enabled) return;
        for (const variable of placeholders) {
          if (
            phaseVariables.has(variable) &&
            variable.references.every((reference) => reference.init || !reference.isWrite())
          ) {
            const declarator = variableDeclarator(variable);
            if (declarator !== null)
              context.report({ node: declarator.id, messageId: "placeholder" });
          }
        }
      },
    };
  },
});
