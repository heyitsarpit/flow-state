import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";

type RuleOptions = [{ sourceRoots?: string[]; phaseNames?: string[] }];
type IdentifierNode = ESTree.IdentifierName | ESTree.IdentifierReference | ESTree.BindingIdentifier;

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
  const normalizedFilename = normalized(filename);
  return roots.some((root) => normalizedFilename.includes(`/${normalized(root)}/`));
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
    if (definition.type === "Variable" && definition.node.type === "VariableDeclarator") {
      return definition.node;
    }
  }
  return null;
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

function rootIdentifier(node: ESTree.Expression): ESTree.IdentifierReference | null {
  let current = unwrapExpression(node);
  while (current.type === "MemberExpression") current = unwrapExpression(current.object);
  return current.type === "Identifier" ? current : null;
}

type PhaseSource = {
  variables: Set<Variable>;
  wholeObject: boolean;
  truthiness: "truthy" | "falsy" | "unknown";
  nullishness: "nullish" | "non-nullish" | "unknown";
};

function emptyPhaseSource(overrides: Partial<PhaseSource> = {}): PhaseSource {
  return {
    variables: new Set(),
    wholeObject: false,
    truthiness: "unknown",
    nullishness: "unknown",
    ...overrides,
  };
}

function definitelyFalseyLiteral(node: ESTree.Expression): boolean {
  if (node.type !== "Literal") return false;
  if (node.value === null) return true;
  return typeof node.value === "boolean" ||
    typeof node.value === "number" ||
    typeof node.value === "string" ||
    typeof node.value === "bigint"
    ? !node.value
    : false;
}

function definitelyUndefinedExpression(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  seen: Set<Variable> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(node);
  if (unwrapped !== node) return definitelyUndefinedExpression(sourceCode, unwrapped, seen);
  if (unwrapped.type === "UnaryExpression" && unwrapped.operator === "void") return true;
  if (unwrapped.type !== "Identifier") return false;
  const variable = resolveVariable(sourceCode, unwrapped);
  if (unwrapped.name === "undefined" && (variable === null || variable.defs.length === 0))
    return true;
  if (variable === null || seen.has(variable)) return false;
  const declarator = variableDeclarator(variable);
  if (declarator === null || declarator.init === null || declarator.id.type !== "Identifier")
    return false;
  const nextSeen = new Set(seen);
  nextSeen.add(variable);
  return definitelyUndefinedExpression(sourceCode, declarator.init, nextSeen);
}

function definitelyPrimitiveExpression(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  seen: Set<Variable> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(node);
  if (definitelyUndefinedExpression(sourceCode, unwrapped)) return true;
  if (unwrapped.type === "Literal") {
    return (
      unwrapped.value === null ||
      typeof unwrapped.value === "boolean" ||
      typeof unwrapped.value === "number" ||
      typeof unwrapped.value === "string" ||
      typeof unwrapped.value === "bigint"
    );
  }
  if (unwrapped.type !== "Identifier") return false;
  const variable = resolveVariable(sourceCode, unwrapped);
  if (variable === null || seen.has(variable)) return false;
  const declarator = variableDeclarator(variable);
  if (declarator === null || declarator.init === null || declarator.id.type !== "Identifier")
    return false;
  const nextSeen = new Set(seen);
  nextSeen.add(variable);
  return definitelyPrimitiveExpression(sourceCode, declarator.init, nextSeen);
}

type Truthiness = "truthy" | "falsy" | "unknown";
type Nullishness = "nullish" | "non-nullish" | "unknown";

function joinFact(left: Truthiness, right: Truthiness): Truthiness {
  return left === right ? left : "unknown";
}

function joinNullishFact(left: Nullishness, right: Nullishness): Nullishness {
  return left === right ? left : "unknown";
}

function expressionTruthiness(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  phaseVariables: Set<Variable>,
  seen: Set<Variable> = new Set(),
): Truthiness {
  const unwrapped = unwrapExpression(node);
  if (unwrapped !== node) return expressionTruthiness(sourceCode, unwrapped, phaseVariables, seen);
  if (
    unwrapped.type === "ObjectExpression" ||
    unwrapped.type === "ArrayExpression" ||
    unwrapped.type === "FunctionExpression" ||
    unwrapped.type === "ArrowFunctionExpression" ||
    unwrapped.type === "ClassExpression" ||
    unwrapped.type === "NewExpression"
  )
    return "truthy";
  if (definitelyFalseyLiteral(unwrapped) || definitelyUndefinedExpression(sourceCode, unwrapped))
    return "falsy";
  if (unwrapped.type === "Literal") return "truthy";
  if (unwrapped.type === "UnaryExpression" && unwrapped.operator === "void") return "falsy";
  if (unwrapped.type === "Identifier") {
    const variable = resolveVariable(sourceCode, unwrapped);
    if (variable === null) return unwrapped.name === "undefined" ? "falsy" : "unknown";
    if (seen.has(variable)) return "unknown";
    const declarator = variableDeclarator(variable);
    if (declarator !== null && declarator.init !== null && declarator.id.type === "Identifier") {
      const nextSeen = new Set(seen);
      nextSeen.add(variable);
      return expressionTruthiness(sourceCode, declarator.init, phaseVariables, nextSeen);
    }
    return "unknown";
  }
  if (unwrapped.type === "ConditionalExpression") {
    const test = expressionTruthiness(sourceCode, unwrapped.test, phaseVariables);
    if (test === "truthy")
      return expressionTruthiness(sourceCode, unwrapped.consequent, phaseVariables, seen);
    if (test === "falsy")
      return expressionTruthiness(sourceCode, unwrapped.alternate, phaseVariables, seen);
    return joinFact(
      expressionTruthiness(sourceCode, unwrapped.consequent, phaseVariables, seen),
      expressionTruthiness(sourceCode, unwrapped.alternate, phaseVariables, seen),
    );
  }
  if (unwrapped.type === "LogicalExpression") {
    const left = expressionTruthiness(sourceCode, unwrapped.left, phaseVariables, seen);
    if (unwrapped.operator === "&&") {
      if (left === "falsy") return left;
      if (left === "truthy")
        return expressionTruthiness(sourceCode, unwrapped.right, phaseVariables, seen);
    } else if (unwrapped.operator === "||") {
      if (left === "truthy") return left;
      if (left === "falsy")
        return expressionTruthiness(sourceCode, unwrapped.right, phaseVariables, seen);
    } else {
      const leftNullish = expressionNullishness(sourceCode, unwrapped.left, phaseVariables, seen);
      if (leftNullish === "nullish")
        return expressionTruthiness(sourceCode, unwrapped.right, phaseVariables, seen);
      if (leftNullish === "non-nullish") return left;
    }
    return joinFact(left, expressionTruthiness(sourceCode, unwrapped.right, phaseVariables, seen));
  }
  return "unknown";
}

function expressionNullishness(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  phaseVariables: Set<Variable>,
  seen: Set<Variable> = new Set(),
): Nullishness {
  const unwrapped = unwrapExpression(node);
  if (unwrapped !== node) return expressionNullishness(sourceCode, unwrapped, phaseVariables, seen);
  if (definitelyUndefinedExpression(sourceCode, unwrapped)) return "nullish";
  if (unwrapped.type === "Literal") return unwrapped.value === null ? "nullish" : "non-nullish";
  if (unwrapped.type === "UnaryExpression" && unwrapped.operator === "void") return "nullish";
  if (
    unwrapped.type === "ObjectExpression" ||
    unwrapped.type === "ArrayExpression" ||
    unwrapped.type === "FunctionExpression" ||
    unwrapped.type === "ArrowFunctionExpression" ||
    unwrapped.type === "ClassExpression" ||
    unwrapped.type === "NewExpression"
  )
    return "non-nullish";
  if (unwrapped.type === "Identifier") {
    const variable = resolveVariable(sourceCode, unwrapped);
    if (variable === null) return "unknown";
    if (seen.has(variable)) return "unknown";
    const declarator = variableDeclarator(variable);
    if (declarator !== null && declarator.init !== null && declarator.id.type === "Identifier") {
      const nextSeen = new Set(seen);
      nextSeen.add(variable);
      return expressionNullishness(sourceCode, declarator.init, phaseVariables, nextSeen);
    }
    return "unknown";
  }
  if (unwrapped.type === "ConditionalExpression") {
    const test = expressionTruthiness(sourceCode, unwrapped.test, phaseVariables);
    if (test === "truthy")
      return expressionNullishness(sourceCode, unwrapped.consequent, phaseVariables, seen);
    if (test === "falsy")
      return expressionNullishness(sourceCode, unwrapped.alternate, phaseVariables, seen);
    return joinNullishFact(
      expressionNullishness(sourceCode, unwrapped.consequent, phaseVariables, seen),
      expressionNullishness(sourceCode, unwrapped.alternate, phaseVariables, seen),
    );
  }
  if (unwrapped.type === "LogicalExpression") {
    const left = expressionTruthiness(sourceCode, unwrapped.left, phaseVariables, seen);
    if (unwrapped.operator === "&&") {
      if (left === "falsy")
        return expressionNullishness(sourceCode, unwrapped.left, phaseVariables, seen);
      if (left === "truthy")
        return expressionNullishness(sourceCode, unwrapped.right, phaseVariables, seen);
    } else if (unwrapped.operator === "||") {
      if (left === "truthy")
        return expressionNullishness(sourceCode, unwrapped.left, phaseVariables, seen);
      if (left === "falsy")
        return expressionNullishness(sourceCode, unwrapped.right, phaseVariables, seen);
    } else {
      const leftNullish = expressionNullishness(sourceCode, unwrapped.left, phaseVariables, seen);
      if (leftNullish === "nullish")
        return expressionNullishness(sourceCode, unwrapped.right, phaseVariables, seen);
      if (leftNullish === "non-nullish") return leftNullish;
    }
    return joinNullishFact(
      expressionNullishness(sourceCode, unwrapped.left, phaseVariables, seen),
      expressionNullishness(sourceCode, unwrapped.right, phaseVariables, seen),
    );
  }
  return "unknown";
}

function definitelyTruthyExpression(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  phaseVariables: Set<Variable>,
  seen: Set<Variable> = new Set(),
): boolean {
  return expressionTruthiness(sourceCode, node, phaseVariables, seen) === "truthy";
}

function combinePhaseSources(left: PhaseSource, right: PhaseSource): PhaseSource {
  return {
    variables: new Set([...left.variables, ...right.variables]),
    wholeObject: left.wholeObject && right.wholeObject,
    truthiness: left.truthiness === right.truthiness ? left.truthiness : "unknown",
    nullishness: left.nullishness === right.nullishness ? left.nullishness : "unknown",
  };
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

function hasWriteTarget(sourceCode: SourceCode, node: ESTree.Node, variable: Variable): boolean {
  if (node.type === "AssignmentExpression") {
    return node.left.type === "Identifier" && resolveVariable(sourceCode, node.left) === variable;
  }
  if (node.type === "UpdateExpression") {
    return (
      node.argument.type === "Identifier" && resolveVariable(sourceCode, node.argument) === variable
    );
  }
  if (node.type === "SequenceExpression") {
    return node.expressions.some((expression) => hasWriteTarget(sourceCode, expression, variable));
  }
  return false;
}

function isNumericLiteral(node: ESTree.Node | null): boolean {
  return node?.type === "Literal" && typeof node.value === "number" && Number.isFinite(node.value);
}

function isVariableReference(
  sourceCode: SourceCode,
  node: ESTree.Node,
  variable: Variable,
): boolean {
  if (node.type === "Identifier") return resolveVariable(sourceCode, node) === variable;
  if (node.type === "MemberExpression") {
    return (
      isVariableReference(sourceCode, node.object, variable) ||
      (node.computed && isVariableReference(sourceCode, node.property, variable))
    );
  }
  if (node.type === "BinaryExpression" || node.type === "LogicalExpression") {
    return (
      isVariableReference(sourceCode, node.left, variable) ||
      isVariableReference(sourceCode, node.right, variable)
    );
  }
  if (node.type === "UnaryExpression" || node.type === "AwaitExpression") {
    return isVariableReference(sourceCode, node.argument, variable);
  }
  if (node.type === "ConditionalExpression") {
    return (
      isVariableReference(sourceCode, node.test, variable) ||
      isVariableReference(sourceCode, node.consequent, variable) ||
      isVariableReference(sourceCode, node.alternate, variable)
    );
  }
  if (node.type === "CallExpression" || node.type === "NewExpression") {
    return (
      isVariableReference(sourceCode, node.callee, variable) ||
      node.arguments.some(
        (argument) =>
          argument.type !== "SpreadElement" && isVariableReference(sourceCode, argument, variable),
      )
    );
  }
  return false;
}

function isCursorBound(node: ESTree.Node): boolean {
  if (isNumericLiteral(node)) return true;
  return (
    node.type === "MemberExpression" &&
    ((!node.computed && node.property.type === "Identifier" && node.property.name === "length") ||
      (node.computed && node.property.type === "Literal" && node.property.value === "length"))
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
  if (node.type === "UpdateExpression") {
    return (
      (node.operator === "++" || node.operator === "--") &&
      hasWriteTarget(sourceCode, node, variable)
    );
  }
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
  if (update.type === "SequenceExpression") {
    return (
      update.expressions.find((expression) =>
        isNumericCursorUpdate(sourceCode, expression, variable),
      ) ?? null
    );
  }
  return isNumericCursorUpdate(sourceCode, update, variable) ? update : null;
}

function phaseSourceInfo(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  phaseVariables: Set<Variable>,
): PhaseSource {
  const unwrapped = unwrapExpression(node);
  if (unwrapped !== node) return phaseSourceInfo(sourceCode, unwrapped, phaseVariables);
  if (unwrapped.type === "AssignmentExpression")
    return phaseSourceInfo(sourceCode, unwrapped.right, phaseVariables);
  if (unwrapped.type === "Identifier") {
    const variable = resolveVariable(sourceCode, unwrapped);
    const declarator = variable === null ? null : variableDeclarator(variable);
    const primitiveInitializer =
      declarator !== null &&
      declarator.init !== null &&
      definitelyPrimitiveExpression(sourceCode, declarator.init);
    const truthiness = expressionTruthiness(sourceCode, unwrapped, phaseVariables);
    const nullishness = expressionNullishness(sourceCode, unwrapped, phaseVariables);
    const wholeObject =
      truthiness === "truthy" &&
      nullishness === "non-nullish" &&
      variable !== null &&
      !primitiveInitializer &&
      (phaseVariables.has(variable) ||
        definitelyTruthyExpression(sourceCode, unwrapped, phaseVariables));
    return emptyPhaseSource({
      variables: variable !== null && wholeObject ? new Set([variable]) : new Set(),
      wholeObject,
      truthiness,
      nullishness,
    });
  }
  if (
    unwrapped.type === "ObjectExpression" ||
    unwrapped.type === "ArrayExpression" ||
    unwrapped.type === "FunctionExpression" ||
    unwrapped.type === "ArrowFunctionExpression" ||
    unwrapped.type === "ClassExpression" ||
    unwrapped.type === "NewExpression"
  ) {
    const variables = new Set<Variable>();
    if (unwrapped.type === "ObjectExpression") {
      for (const property of unwrapped.properties) {
        if (property.type !== "SpreadElement") continue;
        const spread = phaseSourceInfo(sourceCode, property.argument, phaseVariables);
        if (!spread.wholeObject) continue;
        for (const variable of spread.variables) variables.add(variable);
      }
    }
    return emptyPhaseSource({
      variables,
      wholeObject: true,
      truthiness: "truthy",
      nullishness: "non-nullish",
    });
  }
  if (unwrapped.type === "Literal") {
    return emptyPhaseSource({
      truthiness: definitelyFalseyLiteral(unwrapped) ? "falsy" : "truthy",
      nullishness: unwrapped.value === null ? "nullish" : "non-nullish",
    });
  }
  if (unwrapped.type === "ConditionalExpression") {
    const test = expressionTruthiness(sourceCode, unwrapped.test, phaseVariables);
    if (test === "truthy") return phaseSourceInfo(sourceCode, unwrapped.consequent, phaseVariables);
    if (test === "falsy") return phaseSourceInfo(sourceCode, unwrapped.alternate, phaseVariables);
    return combinePhaseSources(
      phaseSourceInfo(sourceCode, unwrapped.consequent, phaseVariables),
      phaseSourceInfo(sourceCode, unwrapped.alternate, phaseVariables),
    );
  }
  if (unwrapped.type === "LogicalExpression") {
    const left = phaseSourceInfo(sourceCode, unwrapped.left, phaseVariables);
    const right = phaseSourceInfo(sourceCode, unwrapped.right, phaseVariables);
    if (unwrapped.operator === "&&") {
      if (left.truthiness === "truthy") return right;
      if (left.truthiness === "falsy") return left;
      return combinePhaseSources(left, right);
    }
    if (unwrapped.operator === "||") {
      if (left.truthiness === "truthy") return left;
      if (left.truthiness === "falsy") return right;
      return combinePhaseSources(left, right);
    }
    if (left.nullishness === "nullish") return right;
    if (left.nullishness === "non-nullish") return left;
    return combinePhaseSources(left, right);
  }
  return emptyPhaseSource({
    truthiness: expressionTruthiness(sourceCode, unwrapped, phaseVariables),
    nullishness: expressionNullishness(sourceCode, unwrapped, phaseVariables),
  });
}

function phaseSourceVariables(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  phaseVariables: Set<Variable>,
): Set<Variable> {
  const source = phaseSourceInfo(sourceCode, node, phaseVariables);
  return source.wholeObject ? source.variables : new Set();
}

function constantBranch(
  sourceCode: SourceCode,
  test: ESTree.Expression,
  phaseVariables: Set<Variable>,
): "consequent" | "alternate" | null {
  const facts = phaseSourceInfo(sourceCode, test, phaseVariables);
  if (facts.truthiness === "truthy") return "consequent";
  if (facts.truthiness === "falsy") return "alternate";
  return null;
}

function staticArrayLength(
  sourceCode: SourceCode,
  source: ESTree.Expression,
  phaseVariables: Set<Variable>,
  seen: Set<Variable> = new Set(),
): number | null {
  const unwrapped = unwrapExpression(source);
  if (unwrapped !== source) return staticArrayLength(sourceCode, unwrapped, phaseVariables, seen);
  if (unwrapped.type === "ArrayExpression") {
    let length = 0;
    for (const element of unwrapped.elements) {
      if (element === null) {
        length += 1;
        continue;
      }
      if (element.type !== "SpreadElement") {
        length += 1;
        continue;
      }
      const spreadLength = staticArrayLength(sourceCode, element.argument, phaseVariables, seen);
      if (spreadLength === null) return null;
      length += spreadLength;
    }
    return length;
  }
  if (unwrapped.type === "ConditionalExpression") {
    const choice = constantBranch(sourceCode, unwrapped.test, phaseVariables);
    if (choice === "consequent")
      return staticArrayLength(sourceCode, unwrapped.consequent, phaseVariables, seen);
    if (choice === "alternate")
      return staticArrayLength(sourceCode, unwrapped.alternate, phaseVariables, seen);
    const left = staticArrayLength(sourceCode, unwrapped.consequent, phaseVariables, seen);
    const right = staticArrayLength(sourceCode, unwrapped.alternate, phaseVariables, seen);
    return left !== null && left === right ? left : null;
  }
  if (unwrapped.type === "SequenceExpression") {
    const last = unwrapped.expressions.at(-1);
    return last === undefined ? null : staticArrayLength(sourceCode, last, phaseVariables, seen);
  }
  if (unwrapped.type !== "Identifier") return null;
  const variable = resolveVariable(sourceCode, unwrapped);
  if (variable === null || seen.has(variable)) return null;
  const declarator = variableDeclarator(variable);
  if (declarator === null || declarator.init === null || declarator.id.type !== "Identifier")
    return null;
  const nextSeen = new Set(seen);
  nextSeen.add(variable);
  return staticArrayLength(sourceCode, declarator.init, phaseVariables, nextSeen);
}

type PhasePathFacts = {
  sources: ESTree.Expression[];
  maybeMissing: boolean;
};

function phasePathFacts(
  sources: ESTree.Expression[] = [],
  maybeMissing = true,
): PhasePathFacts {
  return { sources, maybeMissing };
}

function combinePhasePathFacts(
  left: PhasePathFacts,
  right: PhasePathFacts,
): PhasePathFacts {
  return phasePathFacts(
    [...left.sources, ...right.sources],
    left.maybeMissing || right.maybeMissing,
  );
}

function arrayElementSources(
  sourceCode: SourceCode,
  source: ESTree.Expression,
  index: number,
  phaseVariables: Set<Variable>,
  seen: Set<Variable> = new Set(),
): PhasePathFacts {
  const unwrapped = unwrapExpression(source);
  if (unwrapped !== source)
    return arrayElementSources(sourceCode, unwrapped, index, phaseVariables, seen);
  if (unwrapped.type === "AssignmentExpression")
    return arrayElementSources(sourceCode, unwrapped.right, index, phaseVariables, seen);
  if (unwrapped.type === "ArrayExpression") {
    let offset = 0;
    for (const element of unwrapped.elements) {
      if (element === null) {
        if (offset === index) return phasePathFacts();
        offset += 1;
        continue;
      }
      if (element.type !== "SpreadElement") {
        if (offset === index) return phasePathFacts([element], false);
        offset += 1;
        continue;
      }
      const spreadLength = staticArrayLength(sourceCode, element.argument, phaseVariables);
      if (spreadLength === null) return phasePathFacts();
      if (index >= offset && index < offset + spreadLength)
        return arrayElementSources(
          sourceCode,
          element.argument,
          index - offset,
          phaseVariables,
          seen,
        );
      offset += spreadLength;
    }
    return phasePathFacts();
  }
  if (unwrapped.type === "ConditionalExpression") {
    const choice = constantBranch(sourceCode, unwrapped.test, phaseVariables);
    if (choice === "consequent")
      return arrayElementSources(sourceCode, unwrapped.consequent, index, phaseVariables, seen);
    if (choice === "alternate")
      return arrayElementSources(sourceCode, unwrapped.alternate, index, phaseVariables, seen);
    return combinePhasePathFacts(
      arrayElementSources(sourceCode, unwrapped.consequent, index, phaseVariables, seen),
      arrayElementSources(sourceCode, unwrapped.alternate, index, phaseVariables, seen),
    );
  }
  if (unwrapped.type === "LogicalExpression") {
    const left = phaseSourceInfo(sourceCode, unwrapped.left, phaseVariables);
    if (unwrapped.operator === "&&") {
      if (left.truthiness === "falsy") return phasePathFacts();
      if (left.truthiness === "truthy")
        return arrayElementSources(sourceCode, unwrapped.right, index, phaseVariables, seen);
    } else if (unwrapped.operator === "||") {
      if (left.truthiness === "truthy")
        return arrayElementSources(sourceCode, unwrapped.left, index, phaseVariables, seen);
      if (left.truthiness === "falsy")
        return arrayElementSources(sourceCode, unwrapped.right, index, phaseVariables, seen);
    } else {
      if (left.nullishness === "nullish")
        return arrayElementSources(sourceCode, unwrapped.right, index, phaseVariables, seen);
      if (left.nullishness === "non-nullish")
        return arrayElementSources(sourceCode, unwrapped.left, index, phaseVariables, seen);
    }
    return combinePhasePathFacts(
      arrayElementSources(sourceCode, unwrapped.left, index, phaseVariables, seen),
      arrayElementSources(sourceCode, unwrapped.right, index, phaseVariables, seen),
    );
  }
  if (unwrapped.type === "SequenceExpression") {
    const last = unwrapped.expressions.at(-1);
    return last === undefined
      ? phasePathFacts()
      : arrayElementSources(sourceCode, last, index, phaseVariables, seen);
  }
  if (unwrapped.type !== "Identifier") return phasePathFacts();
  const variable = resolveVariable(sourceCode, unwrapped);
  if (variable === null || seen.has(variable)) return phasePathFacts();
  const declarator = variableDeclarator(variable);
  if (declarator === null || declarator.init === null || declarator.id.type !== "Identifier")
    return phasePathFacts();
  const nextSeen = new Set(seen);
  nextSeen.add(variable);
  return arrayElementSources(sourceCode, declarator.init, index, phaseVariables, nextSeen);
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
  source: ESTree.Expression,
  key: string,
  phaseVariables: Set<Variable>,
  seen: Set<Variable> = new Set(),
): PhasePathFacts {
  const unwrapped = unwrapExpression(source);
  if (unwrapped !== source)
    return objectPropertySources(sourceCode, unwrapped, key, phaseVariables, seen);
  if (unwrapped.type === "AssignmentExpression")
    return objectPropertySources(sourceCode, unwrapped.right, key, phaseVariables, seen);
  if (unwrapped.type === "ObjectExpression") {
    let possibleSources: ESTree.Expression[] = [];
    for (let index = unwrapped.properties.length - 1; index >= 0; index -= 1) {
      const property = unwrapped.properties[index];
      if (property?.type === "Property" && objectPropertyName(property) === key)
        return phasePathFacts([...possibleSources, property.value], false);
      if (property?.type === "SpreadElement") {
        const spreadSources = objectPropertySources(
          sourceCode,
          property.argument,
          key,
          phaseVariables,
          seen,
        );
        possibleSources.push(...spreadSources.sources);
        if (!spreadSources.maybeMissing) return phasePathFacts(possibleSources, false);
      }
    }
    return phasePathFacts(possibleSources);
  }
  if (unwrapped.type === "ConditionalExpression") {
    const choice = constantBranch(sourceCode, unwrapped.test, phaseVariables);
    if (choice === "consequent")
      return objectPropertySources(sourceCode, unwrapped.consequent, key, phaseVariables, seen);
    if (choice === "alternate")
      return objectPropertySources(sourceCode, unwrapped.alternate, key, phaseVariables, seen);
    return combinePhasePathFacts(
      objectPropertySources(sourceCode, unwrapped.consequent, key, phaseVariables, seen),
      objectPropertySources(sourceCode, unwrapped.alternate, key, phaseVariables, seen),
    );
  }
  if (unwrapped.type === "SequenceExpression") {
    const last = unwrapped.expressions.at(-1);
    return last === undefined
      ? phasePathFacts()
      : objectPropertySources(sourceCode, last, key, phaseVariables, seen);
  }
  if (unwrapped.type !== "Identifier") return phasePathFacts();
  const variable = resolveVariable(sourceCode, unwrapped);
  if (variable === null || seen.has(variable)) return phasePathFacts();
  const declarator = variableDeclarator(variable);
  if (declarator === null || declarator.init === null || declarator.id.type !== "Identifier")
    return phasePathFacts();
  const nextSeen = new Set(seen);
  nextSeen.add(variable);
  return objectPropertySources(sourceCode, declarator.init, key, phaseVariables, nextSeen);
}

function mayBeUndefined(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  phaseVariables: Set<Variable>,
): boolean {
  const unwrapped = unwrapExpression(node);
  if (definitelyUndefinedExpression(sourceCode, unwrapped)) return true;
  if (unwrapped.type === "ConditionalExpression") {
    const choice = constantBranch(sourceCode, unwrapped.test, phaseVariables);
    if (choice === "consequent")
      return mayBeUndefined(sourceCode, unwrapped.consequent, phaseVariables);
    if (choice === "alternate")
      return mayBeUndefined(sourceCode, unwrapped.alternate, phaseVariables);
    return (
      mayBeUndefined(sourceCode, unwrapped.consequent, phaseVariables) ||
      mayBeUndefined(sourceCode, unwrapped.alternate, phaseVariables)
    );
  }
  if (unwrapped.type === "LogicalExpression") {
    const left = phaseSourceInfo(sourceCode, unwrapped.left, phaseVariables);
    if (unwrapped.operator === "&&") {
      if (left.truthiness === "truthy")
        return mayBeUndefined(sourceCode, unwrapped.right, phaseVariables);
      if (left.truthiness === "falsy")
        return mayBeUndefined(sourceCode, unwrapped.left, phaseVariables);
    } else if (unwrapped.operator === "||") {
      if (left.truthiness === "truthy")
        return mayBeUndefined(sourceCode, unwrapped.left, phaseVariables);
      if (left.truthiness === "falsy")
        return mayBeUndefined(sourceCode, unwrapped.right, phaseVariables);
    } else {
      if (left.nullishness === "nullish")
        return mayBeUndefined(sourceCode, unwrapped.right, phaseVariables);
      if (left.nullishness === "non-nullish")
        return mayBeUndefined(sourceCode, unwrapped.left, phaseVariables);
    }
    return (
      mayBeUndefined(sourceCode, unwrapped.left, phaseVariables) ||
      mayBeUndefined(sourceCode, unwrapped.right, phaseVariables)
    );
  }
  return false;
}

type AssignmentTargets = {
  identifiers: IdentifierNode[];
  members: ESTree.MemberExpression[];
};

function assignmentTargets(
  node: ESTree.Node,
  result: AssignmentTargets = { identifiers: [], members: [] },
): AssignmentTargets {
  if (node.type === "Identifier") {
    result.identifiers.push(node);
    return result;
  }
  if (node.type === "MemberExpression") {
    result.members.push(node);
    return result;
  }
  if (node.type === "AssignmentPattern") return assignmentTargets(node.left, result);
  if (node.type === "RestElement") return assignmentTargets(node.argument, result);
  if (node.type === "ArrayPattern") {
    for (const element of node.elements) if (element !== null) assignmentTargets(element, result);
    return result;
  }
  if (node.type === "ObjectPattern") {
    for (const property of node.properties) {
      if (property.type === "Property") assignmentTargets(property.value, result);
      else assignmentTargets(property.argument, result);
    }
  }
  return result;
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
    const cursorUpdateNodes = new Set<ESTree.Node>();
    const placeholderVariables = new Set<Variable>();

    const isPhaseName = (identifier: IdentifierNode) => phaseNames.has(identifier.name);

    const seedParameters = (parameters: readonly ESTree.Node[]) => {
      for (const parameter of parameters) {
        for (const identifier of bindingIdentifiers(parameter)) {
          const variable = resolveVariable(context.sourceCode, identifier);
          if (variable !== null && isPhaseName(identifier)) phaseVariables.add(variable);
        }
      }
    };

    const markPhasePattern = (
      target: ESTree.Node,
      sources: readonly ESTree.Expression[],
      maybeMissing = false,
    ): void => {
      if (target.type === "Identifier") {
        const variable = resolveVariable(context.sourceCode, target);
        const source = sources.reduce(
          (result, expression) =>
            combinePhaseSources(
              result,
              phaseSourceInfo(context.sourceCode, expression, phaseVariables),
            ),
          emptyPhaseSource({ wholeObject: sources.length > 0 }),
        );
        if (
          variable !== null &&
          source.wholeObject &&
          [...source.variables].some((candidate) => phaseVariables.has(candidate))
        )
          phaseVariables.add(variable);
        return;
      }
      if (target.type === "AssignmentPattern") {
        const inherited = sources.filter(
          (source) => !definitelyUndefinedExpression(context.sourceCode, source),
        );
        const needsDefault =
          maybeMissing ||
          sources.length === 0 ||
          sources.some((source) => mayBeUndefined(context.sourceCode, source, phaseVariables));
        markPhasePattern(
          target.left,
          needsDefault ? [...inherited, target.right] : inherited,
          false,
        );
        return;
      }
      if (target.type === "RestElement") {
        markPhasePattern(target.argument, sources, maybeMissing);
        return;
      }
      if (target.type === "ArrayPattern") {
        for (const [index, element] of target.elements.entries()) {
          if (element === null) continue;
          const elementFacts = sources.map((source) =>
            arrayElementSources(context.sourceCode, source, index, phaseVariables),
          );
          markPhasePattern(
            element,
            elementFacts.flatMap((facts) => facts.sources),
            maybeMissing || elementFacts.some((facts) => facts.maybeMissing),
          );
        }
        return;
      }
      if (target.type === "ObjectPattern") {
        for (const property of target.properties) {
          if (property.type !== "Property") {
            markPhasePattern(property.argument, sources, maybeMissing);
            continue;
          }
          const key = objectPropertyName(property);
          if (key === null) continue;
          const propertyFacts = sources.map((source) =>
            objectPropertySources(context.sourceCode, source, key, phaseVariables),
          );
          markPhasePattern(
            property.value,
            propertyFacts.flatMap((facts) => facts.sources),
            maybeMissing || propertyFacts.some((facts) => facts.maybeMissing),
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
        (write === null || !cursorUpdateNodes.has(write))
      ) {
        context.report({ node, messageId: "rebind" });
      }
    };

    const reportMemberMutation = (node: ESTree.MemberExpression) => {
      const root = rootIdentifier(node.object);
      if (root === null) return;
      const variable = resolveVariable(context.sourceCode, root);
      if (variable !== null && phaseVariables.has(variable)) {
        context.report({ node, messageId: "phaseBag" });
      }
    };

    const reportAssignmentTarget = (node: ESTree.Node) => {
      const targets = assignmentTargets(node);
      for (const member of targets.members) reportMemberMutation(member);
      for (const identifier of targets.identifiers) {
        const variable = resolveVariable(context.sourceCode, identifier);
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
        const sourceVariables =
          node.id.type === "Identifier" && node.init !== null
            ? phaseSourceVariables(context.sourceCode, node.init, phaseVariables)
            : new Set<Variable>();
        if (node.id.type !== "Identifier" && node.init !== null)
          markPhasePattern(node.id, [node.init]);
        for (const identifier of identifiers) {
          const variable = resolveVariable(context.sourceCode, identifier);
          if (variable === null) continue;
          const cursorUpdate = cursorUpdateNode(context.sourceCode, node, variable);
          if (cursorUpdate !== null) cursorUpdateNodes.add(cursorUpdate);
          if (
            isPhaseName(identifier) ||
            [...sourceVariables].some((source) => phaseVariables.has(source))
          ) {
            phaseVariables.add(variable);
          }
          if (node.init === null && isPhaseName(identifier)) placeholderVariables.add(variable);
        }
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (!enabled) return;
        const targets = assignmentTargets(node.left);
        for (const member of targets.members) reportMemberMutation(member);
        if (node.left.type !== "Identifier") markPhasePattern(node.left, [node.right]);
        const sourceVariables =
          node.left.type === "Identifier"
            ? phaseSourceVariables(context.sourceCode, node.right, phaseVariables)
            : new Set<Variable>();
        for (const identifier of targets.identifiers) {
          const variable = resolveVariable(context.sourceCode, identifier);
          if (variable === null) continue;
          if ([...sourceVariables].some((source) => phaseVariables.has(source)))
            phaseVariables.add(variable);
          reportRebind(variable, identifier, node);
        }
      },
      UpdateExpression(node: ESTree.UpdateExpression) {
        if (!enabled) return;
        if (node.argument.type === "MemberExpression") reportMemberMutation(node.argument);
        else if (node.argument.type === "Identifier") {
          const variable = resolveVariable(context.sourceCode, node.argument);
          if (variable !== null) reportRebind(variable, node.argument, node);
        }
      },
      UnaryExpression(node: ESTree.UnaryExpression) {
        if (enabled && node.operator === "delete" && node.argument.type === "MemberExpression") {
          reportMemberMutation(node.argument);
        }
      },
      ForInStatement(node: ESTree.ForInStatement) {
        if (enabled && node.left.type !== "VariableDeclaration") reportAssignmentTarget(node.left);
      },
      ForOfStatement(node: ESTree.ForOfStatement) {
        if (enabled && node.left.type !== "VariableDeclaration") reportAssignmentTarget(node.left);
      },
      "Program:exit"() {
        if (!enabled) return;
        for (const variable of placeholderVariables) {
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
