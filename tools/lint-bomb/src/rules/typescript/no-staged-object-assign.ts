import { defineRule } from "@oxlint/plugins";

import { resolveVariable } from "../../shared/scope.ts";

import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

type IdentifierNode = ESTree.IdentifierName | ESTree.IdentifierReference | ESTree.BindingIdentifier;

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
  let current = expression;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression"
  ) {
    current = current.expression;
  }
  return current;
}

function isGlobalObject(sourceCode: SourceCode, identifier: IdentifierNode): boolean {
  if (sourceCode.isGlobalReference(identifier)) return true;
  const variable = resolveVariable(sourceCode, identifier);
  return variable === null || variable.defs.length === 0;
}

function isAssignProperty(member: ESTree.MemberExpression): boolean {
  if (!member.computed && member.property.type === "Identifier")
    return member.property.name === "assign";
  if (member.computed && member.property.type === "Literal")
    return member.property.value === "assign";
  return (
    member.computed &&
    member.property.type === "TemplateLiteral" &&
    member.property.expressions.length === 0 &&
    member.property.quasis.length === 1 &&
    (member.property.quasis[0]?.value.cooked ?? member.property.quasis[0]?.value.raw) === "assign"
  );
}

function objectAssignCall(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
): ESTree.CallExpression | null {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped.type !== "CallExpression") return null;
  const callee = unwrapped.callee;
  if (
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    callee.object.name === "Object" &&
    isGlobalObject(sourceCode, callee.object) &&
    isAssignProperty(callee)
  ) {
    return unwrapped;
  }
  return null;
}

/** Disallow mutating a local Object.assign result through a second Object.assign call. */
export const noStagedObjectAssignRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow repeated Object.assign mutation of a local object assembled by Object.assign.",
    },
    messages: {
      stagedObjectAssign:
        "Compute derived values first and construct one complete object literal when behavior is equivalent. Preserve property overwrite precedence, source evaluation, getter/setter behavior, and any observable intermediate identity.",
    },
  },
  createOnce(context) {
    const stagedVariables = new Set<Variable>();
    const emptyObjectVariables = new Set<Variable>();
    const functionStates: { staged: Set<Variable>; empty: Set<Variable> }[] = [];
    const enterFunction = () => {
      functionStates.push({
        staged: new Set(stagedVariables),
        empty: new Set(emptyObjectVariables),
      });
    };
    const exitFunction = () => {
      const previous = functionStates.pop();
      if (previous === undefined) return;
      stagedVariables.clear();
      emptyObjectVariables.clear();
      for (const variable of previous.staged) stagedVariables.add(variable);
      for (const variable of previous.empty) emptyObjectVariables.add(variable);
    };
    const trackInitialValue = (variable: Variable, expression: ESTree.Expression) => {
      const initialCall = objectAssignCall(context.sourceCode, expression);
      if (initialCall !== null && initialCall.arguments.length >= 2) stagedVariables.add(variable);
      const initialValue = unwrapExpression(expression);
      if (initialValue.type === "ObjectExpression" && initialValue.properties.length === 0) {
        emptyObjectVariables.add(variable);
      }
    };

    return {
      FunctionDeclaration: enterFunction,
      "FunctionDeclaration:exit": exitFunction,
      FunctionExpression: enterFunction,
      "FunctionExpression:exit": exitFunction,
      ArrowFunctionExpression: enterFunction,
      "ArrowFunctionExpression:exit": exitFunction,
      VariableDeclarator(node: ESTree.VariableDeclarator) {
        if (node.id.type !== "Identifier" || node.init === null) return;
        const variable = resolveVariable(context.sourceCode, node.id);
        if (variable === null) return;
        trackInitialValue(variable, node.init);
      },
      CallExpression(node: ESTree.CallExpression) {
        const assignCall = objectAssignCall(context.sourceCode, node);
        if (assignCall === null || assignCall.arguments.length < 2) return;
        const [target] = assignCall.arguments;
        if (target?.type !== "Identifier") return;
        const variable = resolveVariable(context.sourceCode, target);
        if (
          variable !== null &&
          (stagedVariables.has(variable) || emptyObjectVariables.has(variable))
        ) {
          context.report({ node, messageId: "stagedObjectAssign" });
        }
      },
      AssignmentExpression(node: ESTree.AssignmentExpression) {
        if (node.operator !== "=" || node.left.type !== "Identifier") return;
        const variable = resolveVariable(context.sourceCode, node.left);
        if (variable !== null) {
          stagedVariables.delete(variable);
          emptyObjectVariables.delete(variable);
          trackInitialValue(variable, node.right);
        }
      },
    };
  },
});
