import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function unwrapParentheses(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (current.type === "ParenthesizedExpression") current = current.expression;
	return current;
}

function arrayBranchSize(expression: ESTree.Expression): 0 | 1 | null {
	const unwrapped = unwrapParentheses(expression);
	if (unwrapped.type !== "ArrayExpression") return null;
	if (unwrapped.elements.length === 0) return 0;
	const [element] = unwrapped.elements;
	return unwrapped.elements.length === 1 && element !== null && element.type !== "SpreadElement"
		? 1
		: null;
}

function isConditionalEmptyOrSingletonArray(expression: ESTree.Expression): boolean {
	const unwrapped = unwrapParentheses(expression);
	if (unwrapped.type !== "ConditionalExpression") return false;
	const consequentLength = arrayBranchSize(unwrapped.consequent);
	const alternateLength = arrayBranchSize(unwrapped.alternate);
	return (
		(consequentLength === 0 && alternateLength === 1) ||
		(consequentLength === 1 && alternateLength === 0)
	);
}

/** Ban repeated conditional singleton-array spreads while preserving genuine array composition. */
export const noConditionalSingletonArraySpreadRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow arrays composed from two or more conditional empty-or-singleton spreads.",
		},
		messages: {
			conditionalSingletonSpreads:
				"This array hides repeated conditional element insertion behind singleton spreads. Build the array in statements instead.",
		},
	},
	createOnce(context) {
		return {
			ArrayExpression(node: ESTree.ArrayExpression) {
				const spreads = node.elements.filter(
					(element): element is ESTree.SpreadElement => element?.type === "SpreadElement",
				);
					if (spreads.filter((spread) => isConditionalEmptyOrSingletonArray(spread.argument)).length >= 2) {
					context.report({ node, messageId: "conditionalSingletonSpreads" });
				}
			},
		};
	},
});
