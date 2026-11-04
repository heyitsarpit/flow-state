import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

import { isTestFile } from "../../shared/file-scope.ts";
import { resolveVariable } from "../../shared/scope.ts";
import { memberName, unwrapExpression } from "../../shared/effect/effect-call.ts";

type FrameworkApi = "expect" | "it" | "test" | "namespace";
type Assertion = {
  readonly node: ESTree.CallExpression;
  readonly conditional: boolean;
  readonly counted: boolean;
  readonly direct: boolean;
  readonly atMostOnce: boolean;
};
type TestAssertions = {
  readonly assertions: Assertion[];
  expectedCount: number | null;
};

function variableInitializer(variable: Variable): ESTree.Expression | null {
  if (variable.defs.length !== 1) return null;
  const definition = variable.defs[0];
  if (
    definition?.type !== "Variable" ||
    definition.node.type !== "VariableDeclarator" ||
    definition.parent?.type !== "VariableDeclaration" ||
    definition.parent.kind !== "const" ||
    definition.node.id.type !== "Identifier" ||
    variable.references.some((reference) => reference.isWrite() && !reference.init)
  ) {
    return null;
  }
  return definition.node.init;
}

function importedApi(variable: Variable): FrameworkApi | null {
  for (const definition of variable.defs) {
    if (definition.type !== "ImportBinding" || definition.parent?.type !== "ImportDeclaration")
      continue;
    const source = definition.parent.source.value;
    if (source !== "vitest" && source !== "@jest/globals") continue;
    if (definition.node.type === "ImportNamespaceSpecifier") return "namespace";
    if (definition.node.type !== "ImportSpecifier") continue;
    const name =
      definition.node.imported.type === "Identifier"
        ? definition.node.imported.name
        : definition.node.imported.value;
    if (name === "expect" || name === "test" || name === "it") return name;
  }
  return null;
}

function frameworkApiForExpression(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  seen: ReadonlySet<Variable> = new Set(),
): FrameworkApi | null {
  const value = unwrapExpression(expression);
  if (value.type === "MemberExpression") {
    if (value.computed) return null;
    const property = memberName(value);
    if (property === null) return null;
    const parentApi = frameworkApiForExpression(sourceCode, value.object, seen);
    if (parentApi === "namespace") {
      return property === "expect" || property === "test" || property === "it" ? property : null;
    }
    return parentApi === "expect" && property === "soft" ? "expect" : null;
  }
  if (value.type !== "Identifier") return null;
  const variable = resolveVariable(sourceCode, value);
  if (variable === null || variable.defs.length === 0) {
    return value.name === "expect" || value.name === "test" || value.name === "it"
      ? value.name
      : null;
  }
  if (seen.has(variable)) return null;
  const imported = importedApi(variable);
  if (imported !== null) return imported;
  const initializer = variableInitializer(variable);
  return initializer === null
    ? null
    : frameworkApiForExpression(sourceCode, initializer, new Set([...seen, variable]));
}

function isTestCallee(sourceCode: SourceCode, expression: ESTree.Expression): boolean {
  const callee = unwrapExpression(expression);
  if (callee.type === "CallExpression") return isTestCallee(sourceCode, callee.callee);
  if (callee.type === "Identifier") {
    const api = frameworkApiForExpression(sourceCode, callee);
    return api === "test" || api === "it";
  }
  if (callee.type !== "MemberExpression" || callee.computed) return false;
  const method = memberName(callee);
  return (
    (method === "each" ||
      method === "only" ||
      method === "skip" ||
      method === "concurrent" ||
      method === "fails") &&
    isTestCallee(sourceCode, callee.object)
  );
}

function assertionKind(
  sourceCode: SourceCode,
  node: ESTree.CallExpression,
): "assertion" | "count" | "occurrence" | null {
  const callee = unwrapExpression(node.callee);
  if (callee.type === "MemberExpression" && !callee.computed) {
    const method = memberName(callee);
    if (frameworkApiForExpression(sourceCode, callee.object) === "expect") {
      if (method === "assertions") return "count";
      if (method === "hasAssertions") return "occurrence";
    }
    if (isExpectationExpression(sourceCode, callee.object)) return "assertion";
  }
  if (frameworkApiForExpression(sourceCode, callee) !== "expect") return null;
  return node.parent?.type === "MemberExpression" && node.parent.object === node
    ? null
    : "assertion";
}

function isExpectationExpression(sourceCode: SourceCode, expression: ESTree.Expression): boolean {
  const value = unwrapExpression(expression);
  if (value.type === "CallExpression") {
    return frameworkApiForExpression(sourceCode, unwrapExpression(value.callee)) === "expect";
  }
  return (
    value.type === "MemberExpression" &&
    !value.computed &&
    isExpectationExpression(sourceCode, value.object)
  );
}

function isFunction(node: ESTree.Node): node is ESTree.Function | ESTree.ArrowFunctionExpression {
  return node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression";
}

function testCallback(sourceCode: SourceCode, node: ESTree.CallExpression): ESTree.Node | null {
  const ancestors = sourceCode.getAncestors(node) as unknown as ESTree.Node[];
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (
      isFunction(ancestor) &&
      ancestor.parent?.type === "CallExpression" &&
      isTestCallee(sourceCode, ancestor.parent.callee)
    ) {
      return ancestor;
    }
  }
  return null;
}

function nearestFunction(sourceCode: SourceCode, node: ESTree.CallExpression): ESTree.Node | null {
  const ancestors = sourceCode.getAncestors(node) as unknown as ESTree.Node[];
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (isFunction(ancestor)) return ancestor;
  }
  return null;
}

function isConditionalExecution(
  sourceCode: SourceCode,
  node: ESTree.CallExpression,
  fn: ESTree.Node,
): boolean {
  const ancestors = sourceCode.getAncestors(node) as unknown as ESTree.Node[];
  let child: ESTree.Node = node;
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (ancestor === fn) return false;
    if (
      (ancestor.type === "IfStatement" &&
        (ancestor.consequent === child || ancestor.alternate === child)) ||
      (ancestor.type === "ConditionalExpression" &&
        (ancestor.consequent === child || ancestor.alternate === child)) ||
      (ancestor.type === "LogicalExpression" && ancestor.right === child) ||
      ancestor.type === "SwitchCase" ||
      ((ancestor.type === "ForStatement" ||
        ancestor.type === "ForInStatement" ||
        ancestor.type === "ForOfStatement" ||
        ancestor.type === "WhileStatement" ||
        ancestor.type === "DoWhileStatement") &&
        ancestor.body === child)
    ) {
      return true;
    }
    child = ancestor;
  }
  return false;
}

function isAtMostOnce(
  sourceCode: SourceCode,
  node: ESTree.CallExpression,
  fn: ESTree.Node,
): boolean {
  if (fn.type === "FunctionExpression" && fn.id !== null) {
    const binding = resolveVariable(sourceCode, fn.id);
    if (
      binding?.references.some((reference) => {
        if (!reference.isRead()) return false;
        const identifier = reference.identifier;
        const parent = identifier.parent;
        return !(
          parent?.type === "MemberExpression" &&
          parent.object === identifier &&
          !parent.computed &&
          parent.property.type === "Identifier" &&
          parent.property.name === "name"
        );
      })
    ) {
      return false;
    }
  }
  const ancestors = sourceCode.getAncestors(node) as unknown as ESTree.Node[];
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (ancestor === fn) return true;
    if (
      ancestor.type === "ForStatement" ||
      ancestor.type === "ForInStatement" ||
      ancestor.type === "ForOfStatement" ||
      ancestor.type === "WhileStatement" ||
      ancestor.type === "DoWhileStatement"
    ) {
      return false;
    }
  }
  return false;
}

function expectedAssertionCount(node: ESTree.CallExpression): number | null {
  const argument = node.arguments[0];
  if (
    argument?.type !== "Literal" ||
    typeof argument.value !== "number" ||
    !Number.isInteger(argument.value) ||
    argument.value < 0
  ) {
    return null;
  }
  return argument.value;
}

/** Reject tests whose only assertion is hidden behind a possibly skipped branch. */
export const noExpectInIfRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow conditional assertions without a structurally safe exact assertion count.",
    },
    messages: {
      conditionalAssertion:
        "This assertion is conditional and may never run. Assert its expected outcome unconditionally before inspecting case-specific fields. For an intentional conditional assertion, expect.assertions(N) is accepted only when N matches the recognized assertion count and every assertion site can run at most once; expect.hasAssertions() does not prove this branch ran.",
    },
  },
  createOnce(context) {
    const assertions = new Map<ESTree.Node, TestAssertions>();
    let testFile = false;

    return {
      Program() {
        assertions.clear();
        testFile = isTestFile(context.filename);
      },
      CallExpression(node: ESTree.CallExpression) {
        if (!testFile) return;
        const kind = assertionKind(context.sourceCode, node);
        if (kind === null) return;
        const fn = testCallback(context.sourceCode, node);
        if (fn === null) return;
        const state = assertions.get(fn) ?? { assertions: [], expectedCount: null };
        const direct = nearestFunction(context.sourceCode, node) === fn;
        const conditional = isConditionalExecution(context.sourceCode, node, fn);
        const atMostOnce = isAtMostOnce(context.sourceCode, node, fn);
        if (kind === "count") {
          const expected = expectedAssertionCount(node);
          if (direct) {
            state.expectedCount = expected !== null && atMostOnce && !conditional ? expected : null;
          } else if (conditional) {
            state.assertions.push({ node, conditional, counted: false, direct, atMostOnce });
          }
        } else {
          state.assertions.push({
            node,
            conditional,
            counted: kind === "assertion",
            direct,
            atMostOnce,
          });
        }
        assertions.set(fn, state);
      },
      "Program:exit"() {
        for (const state of assertions.values()) {
          const conditionals = state.assertions.filter((assertion) => assertion.conditional);
          const countedAssertions = state.assertions.filter((assertion) => assertion.counted);
          const counted =
            countedAssertions.every((assertion) => assertion.direct && assertion.atMostOnce) &&
            conditionals.every(
              (assertion) => assertion.direct && assertion.counted && assertion.atMostOnce,
            ) &&
            state.expectedCount === countedAssertions.length;
          if (counted) continue;
          for (const assertion of state.assertions) {
            if (assertion.conditional) {
              context.report({ node: assertion.node, messageId: "conditionalAssertion" });
            }
          }
        }
      },
    };
  },
});
