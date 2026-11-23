import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

function unwrapExpression(node: ESTree.Expression): ESTree.Expression {
  let current = node;
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

function isGlobalIdentifier(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): boolean {
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable.defs.length === 0;
		scope = scope.upper;
	}
	return true;
}

function isUndefinedExpression(sourceCode: SourceCode, node: ESTree.Expression): boolean {
	const unwrapped = unwrapExpression(node);
	return unwrapped.type === "Identifier" &&
		unwrapped.name === "undefined" &&
		isGlobalIdentifier(sourceCode, unwrapped);
}

function isObjectShapeHidingConditional(sourceCode: SourceCode, node: ESTree.Expression): boolean {
	const conditional = unwrapExpression(node);
	if (conditional.type !== "ConditionalExpression") return false;
	const consequentIsObject = conditional.consequent.type === "ObjectExpression";
	const alternateIsObject = conditional.alternate.type === "ObjectExpression";
	const consequentIsUndefined = isUndefinedExpression(sourceCode, conditional.consequent);
	const alternateIsUndefined = isUndefinedExpression(sourceCode, conditional.alternate);
	return (
		(consequentIsObject && (alternateIsObject || alternateIsUndefined)) ||
		(alternateIsObject && (consequentIsObject || consequentIsUndefined))
	);
}

/** Ban conditional object spreads that hide a variant shape or optional omission. */
export const noConditionalEmptyObjectSpreadRule = defineRule({
  meta: {
    type: "suggestion",
		docs: {
			description: "Disallow object spreads that hide conditional object shapes or optional omission.",
		},
		messages: {
			avoid: "Build complete object alternatives in explicit branches. For domain data, use Data.TaggedEnum for trusted state variants, Schema-owned variants at admission, or Option for independent absence. Preserve wire omission when the protocol distinguishes it from a present field.",
    },
  },
  createOnce(context) {
    return {
      SpreadElement(node) {
        if (node.parent.type !== "ObjectExpression") return;

		if (isObjectShapeHidingConditional(context.sourceCode, node.argument)) {
          context.report({ node, messageId: "avoid" });
        }
      },
    };
  },
});
