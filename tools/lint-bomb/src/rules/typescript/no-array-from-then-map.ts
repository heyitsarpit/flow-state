import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

import { memberName } from "../../shared/effect/effect-call.ts";

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
		callee.object.type === "Identifier" &&
		callee.object.name === "Array" &&
		isGlobalArray(sourceCode, callee.object) &&
		expression.arguments.length === 1 &&
		memberName(callee) === "from"
	);
}

/** Prefer Array.from's mapping argument over an immediate second traversal. */
export const noArrayFromThenMapRule = defineRule({
	meta: {
		type: "suggestion",
		docs: { description: "Disallow direct Array.from(iterable).map(callback) chains." },
		messages: {
			arrayFromThenMap:
				"Use Array.from(iterable, callback) to map during collection when behavior is preserved. Retain the separate .map when its callback needs the completed array or when mapping during iteration would change observable effects.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				const callee = node.callee;
				if (
			callee.type === "MemberExpression" &&
			memberName(callee) === "map" &&
					isArrayFromCall(context.sourceCode, callee.object)
				) {
					context.report({ node, messageId: "arrayFromThenMap" });
				}
			},
		};
	},
});
