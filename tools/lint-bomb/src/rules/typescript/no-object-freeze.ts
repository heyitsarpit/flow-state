import { defineRule } from "@oxlint/plugins";

import { resolveVariable } from "../../shared/scope.ts";

import type { ESTree, SourceCode } from "@oxlint/plugins";

function isGlobalObjectReference(sourceCode: SourceCode, node: ESTree.Node): boolean {
  if (node.type !== "Identifier" || node.name !== "Object") return false;
  if (sourceCode.isGlobalReference(node)) return true;
  const variable = resolveVariable(sourceCode, node);
  return variable === null || variable.defs.length === 0;
}

function isFreezeProperty(node: ESTree.MemberExpression): boolean {
  if (!node.computed) return node.property.type === "Identifier" && node.property.name === "freeze";
  if (node.property.type === "Literal") return node.property.value === "freeze";
  return (
    node.property.type === "TemplateLiteral" &&
    node.property.expressions.length === 0 &&
    node.property.quasis.length === 1 &&
    (node.property.quasis[0]?.value.cooked ?? node.property.quasis[0]?.value.raw) === "freeze"
  );
}

/** Review Object.freeze against the owning boundary; syntax cannot classify its contract. */
export const noObjectFreezeRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Review Object.freeze against the owner contract; observable snapshots may require it.",
    },
    messages: {
      objectFreeze:
        "Review this reference to Object.freeze and any call sites against the owner contract. Remove unnecessary freezing of internal trusted values; retain freezing required by an observable contract. Capture owned representations of retained mutable input and publish detached values when isolation is required. Shallow freezing alone does not protect nested mutable values.",
    },
  },
  createOnce(context) {
    return {
      MemberExpression(node: ESTree.MemberExpression) {
        if (!isGlobalObjectReference(context.sourceCode, node.object) || !isFreezeProperty(node))
          return;
        context.report({ node, messageId: "objectFreeze" });
      },
    };
  },
});
