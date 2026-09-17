import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";
import { isPathWithin } from "../../shared/module-path.ts";

type RuleOptions = [{ sourceRoots?: string[] }];

const defaultSourceRoots = ["packages/flow-state-rewrite/src"] as const;
const nativeTimerNames = new Set(["setInterval", "setTimeout"]);
const globalObjectNames = new Set(["global", "globalThis", "self", "window"]);

function resolveVariable(
  sourceCode: SourceCode,
  identifier: ESTree.IdentifierReference,
): Variable | null {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) return variable;
    scope = scope.upper;
  }
  return null;
}

function isGlobalReference(
  sourceCode: SourceCode,
  identifier: ESTree.IdentifierReference,
): boolean {
  const variable = resolveVariable(sourceCode, identifier);
  return variable === null || variable.defs.length === 0;
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

function memberName(node: ESTree.MemberExpression): string | null {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  if (
    node.computed &&
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
  ) {
    return node.property.value;
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

function variableValues(variable: Variable, at: number): ESTree.Expression[] {
  const values: ESTree.Expression[] = [];
  for (const definition of variable.defs) {
    if (
      definition.type === "Variable" &&
      definition.node.type === "VariableDeclarator" &&
      definition.node.id.type === "Identifier" &&
      definition.node.start <= at &&
      definition.node.init !== null
    ) {
      values.push(definition.node.init);
    }
  }
  for (const reference of variable.references) {
    if (
      reference.isWrite() &&
      !reference.init &&
      reference.identifier.start <= at &&
      reference.writeExpr !== null
    ) {
      values.push(reference.writeExpr);
    }
  }
  return values;
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

function propertyName(node: ESTree.Node): string | null {
  if (node.type !== "Property") return null;
  if (!node.computed && node.key.type === "Identifier") return node.key.name;
  return node.computed && node.key.type === "Literal" && typeof node.key.value === "string"
    ? node.key.value
    : null;
}

function destructuredInitializer(
  declarator: ESTree.VariableDeclarator,
  name: string,
): ESTree.Expression | null {
  if (declarator.init === null) return null;
  if (declarator.id.type === "ObjectPattern" && declarator.init.type === "ObjectExpression") {
    for (const binding of declarator.id.properties) {
      if (binding.type !== "Property" || !bindingNames(binding.value).includes(name)) continue;
      const key = propertyName(binding);
      if (key === null) continue;
      for (const property of [...declarator.init.properties].reverse()) {
        if (property.type === "Property" && propertyName(property) === key) return property.value;
      }
    }
  }
  if (declarator.id.type === "ArrayPattern" && declarator.init.type === "ArrayExpression") {
    for (const [index, binding] of declarator.id.elements.entries()) {
      if (binding === null || !bindingNames(binding).includes(name)) continue;
      const value = declarator.init.elements[index];
      return value !== undefined && value !== null && value.type !== "SpreadElement" ? value : null;
    }
  }
  return null;
}

function isGlobalObjectExpression(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set<Variable>(),
): boolean {
  const node = unwrapExpression(expression);
  if (node.type !== "Identifier") return false;
  if (globalObjectNames.has(node.name) && isGlobalReference(sourceCode, node)) return true;
  const variable = resolveVariable(sourceCode, node);
  if (variable === null || seen.has(variable)) return false;
  const nextSeen = new Set(seen).add(variable);
  const values = variableValues(variable, node.start);
  const value = values.at(-1);
  if (value !== undefined) return isGlobalObjectExpression(sourceCode, value, nextSeen);
  const declarator = variableDeclarator(variable);
  if (
    declarator?.init === null ||
    declarator?.init === undefined ||
    declarator.id.type !== "Identifier"
  )
    return false;
  return isGlobalObjectExpression(sourceCode, declarator.init, nextSeen);
}

function isNativeTimerExpression(
  sourceCode: SourceCode,
  callee: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set<Variable>(),
): boolean {
  const node = unwrapExpression(callee);
  if (node.type === "MemberExpression") {
    const name = memberName(node);
    if (
      (name === "call" || name === "apply") &&
      isNativeTimerExpression(sourceCode, node.object as ESTree.Expression, seen)
    )
      return true;
    return (
      name !== null &&
      nativeTimerNames.has(name) &&
      isGlobalObjectExpression(sourceCode, node.object as ESTree.Expression)
    );
  }
  if (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    memberName(node.callee) === "bind" &&
    isNativeTimerExpression(sourceCode, node.callee.object, seen)
  )
    return true;
  if (node.type !== "Identifier") return false;
  if (nativeTimerNames.has(node.name) && isGlobalReference(sourceCode, node)) return true;
  const variable = resolveVariable(sourceCode, node);
  if (variable === null || seen.has(variable)) return false;
  const nextSeen = new Set(seen).add(variable);
  const values = variableValues(variable, node.start);
  const value = values.at(-1);
  if (value !== undefined) {
    const current = unwrapExpression(value);
    if (
      current.type === "MemberExpression" &&
      memberName(current) === "bind" &&
      isNativeTimerExpression(sourceCode, current.object as ESTree.Expression, nextSeen)
    )
      return true;
    return isNativeTimerExpression(sourceCode, value, nextSeen);
  }
  const declarator = variableDeclarator(variable);
  if (declarator?.init === null || declarator?.init === undefined) return false;
  if (declarator.id.type === "ObjectPattern") {
    if (isGlobalObjectExpression(sourceCode, declarator.init)) {
      return declarator.id.properties.some((property) => {
        if (property.type !== "Property") return false;
        const name = propertyName(property);
        return (
          name !== null &&
          nativeTimerNames.has(name) &&
          bindingNames(property.value).includes(node.name)
        );
      });
    }
  }
  const initializer = destructuredInitializer(declarator, node.name);
  return initializer !== null && isNativeTimerExpression(sourceCode, initializer, nextSeen);
}

function isNativeTimerCall(sourceCode: SourceCode, callee: ESTree.Expression): boolean {
  return isNativeTimerExpression(sourceCode, callee);
}

/** Prefer explicit ownership signals over native timer sleeps in test synchronization. */
export const noSleepBasedTestSyncRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow native timer polling and synchronization in test files; use explicit deterministic coordination instead.",
    },
    messages: {
      nativeTimer:
        "Do not synchronize tests with native timers. Use Deferred, TestClock, an explicit owner receipt, or a deterministic drain instead of setTimeout/setInterval.",
    },
    schema: [
      {
        type: "object",
        properties: {
          sourceRoots: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ sourceRoots: [...defaultSourceRoots] }] satisfies RuleOptions,
  },
  createOnce(context) {
    let enabled = false;

    return {
      Program() {
        const option = context.options?.[0];
        const rawSourceRoots =
          typeof option === "object" && option !== null && !Array.isArray(option)
            ? option.sourceRoots
            : undefined;
        const sourceRoots =
          Array.isArray(rawSourceRoots) &&
          rawSourceRoots.every((root): root is string => typeof root === "string")
            ? rawSourceRoots
            : defaultSourceRoots;
        enabled =
          sourceRoots.some((root) => isPathWithin(context.filename, root)) &&
          isTestSupportFile(context.filename);
      },
      CallExpression(node: ESTree.CallExpression) {
        if (enabled && isNativeTimerCall(context.sourceCode, node.callee)) {
          context.report({ node, messageId: "nativeTimer" });
        }
      },
    };
  },
});
