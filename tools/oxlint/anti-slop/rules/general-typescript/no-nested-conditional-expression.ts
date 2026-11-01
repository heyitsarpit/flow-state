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
				"Do not nest a conditional expression inside another conditional. Use explicit control flow or name the intermediate decision.",
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
