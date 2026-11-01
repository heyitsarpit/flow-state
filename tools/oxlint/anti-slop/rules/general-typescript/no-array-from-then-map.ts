import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

function isGlobalArray(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): boolean {
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable.defs.length === 0;
		scope = scope.upper;
	}
	return true;
}

function isArrayFromCall(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
): boolean {
	while (expression.type === "ParenthesizedExpression") expression = expression.expression;
	if (expression.type !== "CallExpression") return false;
	const callee = expression.callee;
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.object.type === "Identifier" &&
		callee.object.name === "Array" &&
		isGlobalArray(sourceCode, callee.object) &&
		callee.property.type === "Identifier" &&
		expression.arguments.length === 1 &&
		callee.property.name === "from"
	);
}

/** Prefer Array.from's mapping argument over an immediate second traversal. */
export const noArrayFromThenMapRule = defineRule({
	meta: {
		type: "suggestion",
		docs: { description: "Disallow direct Array.from(iterable).map(callback) chains." },
		messages: {
			arrayFromThenMap:
				"Pass the mapping callback directly to `Array.from(iterable, callback)` instead of chaining `.map(callback)`.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				const callee = node.callee;
				if (
					callee.type === "MemberExpression" &&
					!callee.computed &&
					callee.property.type === "Identifier" &&
					callee.property.name === "map" &&
					isArrayFromCall(context.sourceCode, callee.object)
				) {
					context.report({ node, messageId: "arrayFromThenMap" });
				}
			},
		};
	},
});
