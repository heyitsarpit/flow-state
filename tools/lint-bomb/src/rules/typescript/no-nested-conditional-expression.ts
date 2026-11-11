import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function isNestedConditional(node: ESTree.ConditionalExpression): boolean {
	let current: ESTree.Node = node;
	while (current.parent !== null) {
		const parent: ESTree.Node = current.parent;
		if (parent.type === "ConditionalExpression") return true;
		if (
			parent.type === "FunctionDeclaration" ||
			parent.type === "FunctionExpression" ||
			parent.type === "ArrowFunctionExpression"
		) return false;
		if (parent.type === "Program") return false;
		current = parent;
	}
	return false;
}

/** Keep conditional-expression branches flat and readable. */
export const noNestedConditionalExpressionRule = defineRule({
	meta: {
		type: "suggestion",
		docs: { description: "Disallow conditional expressions nested inside another ternary." },
		messages: {
			nestedConditional:
				"Replace nested conditional expressions with clear decisions. Use if branches or name an intermediate decision for simple control flow. For trusted tagged variants, use $match from Data.taggedEnum; for Schema-owned variants, use .match from Schema.TaggedUnion or Schema.toTaggedUnion. Use Option.match, Result.match, or Exit.match for those values. Use Match.value/Match.type with Match.when when structural or predicate cases read more clearly. Preserve branch laziness, evaluation order, and intentional fallbacks; require exhaustive handling when the contract covers every case.",
		},
	},
	createOnce(context) {
		return {
			ConditionalExpression(node: ESTree.ConditionalExpression) {
				if (isNestedConditional(node)) {
					context.report({ node, messageId: "nestedConditional" });
				}
			},
		};
	},
});
