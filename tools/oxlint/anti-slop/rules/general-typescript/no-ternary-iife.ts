import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function unwrapParentheses(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (current.type === "ParenthesizedExpression") current = current.expression;
	return current;
}

function isIife(expression: ESTree.Expression): boolean {
	const branch = unwrapParentheses(expression);
	if (branch.type !== "CallExpression") return false;
	const callee = unwrapParentheses(branch.callee);
	return callee.type === "ArrowFunctionExpression" || callee.type === "FunctionExpression";
}

/** Keep immediately invoked function bodies out of conditional-expression branches. */
export const noTernaryIifeRule = defineRule({
	meta: {
		type: "suggestion",
		docs: { description: "Disallow immediately invoked functions in ternary branches." },
		messages: {
			ternaryIife:
				"Move this immediately invoked function out of the conditional expression and use explicit control flow.",
		},
	},
	createOnce(context) {
		return {
			ConditionalExpression(node: ESTree.ConditionalExpression) {
				if (isIife(node.consequent)) {
					context.report({ node: node.consequent, messageId: "ternaryIife" });
				}
				if (isIife(node.alternate)) {
					context.report({ node: node.alternate, messageId: "ternaryIife" });
				}
			},
		};
	},
});
