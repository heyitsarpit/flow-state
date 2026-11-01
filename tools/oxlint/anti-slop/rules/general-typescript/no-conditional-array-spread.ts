import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

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

function isArrayExpression(expression: ESTree.Expression): boolean {
	const unwrapped = unwrapExpression(expression);
	return unwrapped.type === "ArrayExpression";
}

function isConditionalArray(expression: ESTree.Expression): boolean {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type !== "ConditionalExpression") return false;
	return (
		isArrayExpression(unwrapped.consequent) &&
		isArrayExpression(unwrapped.alternate)
	);
}

/** Ban conditional array spreads that hide direct branch construction. */
export const noConditionalArraySpreadRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow conditional array spreads that hide direct branch construction.",
		},
		messages: {
			conditionalArraySpreads:
				"This array hides a conditional array behind a spread. Build the complete branch directly or use explicit insertion.",
		},
	},
	createOnce(context) {
		return {
			ArrayExpression(node: ESTree.ArrayExpression) {
				const spreads = node.elements.filter(
					(element): element is ESTree.SpreadElement => element?.type === "SpreadElement",
				);
				const conditionalSpreads = spreads.filter((spread) =>
					isConditionalArray(spread.argument),
				);
				if (conditionalSpreads.length > 0) {
					context.report({ node, messageId: "conditionalArraySpreads" });
				}
			},
		};
	},
});
