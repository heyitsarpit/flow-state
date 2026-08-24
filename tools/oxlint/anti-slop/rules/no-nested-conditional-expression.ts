import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function isInsideConditionalBranch(node: ESTree.ConditionalExpression): boolean {
	let current: ESTree.Node = node;
	while (current.parent !== null) {
		const parent: ESTree.Node = current.parent;
		if (
			parent.type === "ConditionalExpression" &&
			(current === parent.consequent || current === parent.alternate)
		) {
			return true;
		}
		if (parent.type === "Program") return false;
		current = parent;
	}
	return false;
}

/** Keep conditional-expression branches flat and readable. */
export const noNestedConditionalExpressionRule = defineRule({
	meta: {
		type: "suggestion",
		docs: { description: "Disallow conditional expressions nested in ternary branches." },
		messages: {
			nestedConditional:
				"Do not nest a conditional expression inside another conditional branch. Use explicit control flow or name the intermediate decision.",
		},
	},
	createOnce(context) {
		return {
			ConditionalExpression(node: ESTree.ConditionalExpression) {
				if (isInsideConditionalBranch(node)) {
					context.report({ node, messageId: "nestedConditional" });
				}
			},
		};
	},
});
