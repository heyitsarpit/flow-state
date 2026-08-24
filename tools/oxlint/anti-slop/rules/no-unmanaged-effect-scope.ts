import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";

function isImportedNamespaceMember(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	name: "Effect" | "Scope",
): boolean {
	if (expression.type === "Identifier") {
		return isImportedFromEffect(sourceCode, expression, new Set([name]));
	}
	return (
		expression.type === "MemberExpression" &&
		!expression.computed &&
		expression.object.type === "Identifier" &&
		expression.property.type === "Identifier" &&
		expression.property.name === name &&
		isImportedFromEffect(sourceCode, expression.object, new Set([name]))
	);
}

function isMethodCall(
	sourceCode: SourceCode,
	node: ESTree.CallExpression,
	namespace: "Effect" | "Scope",
	method: "acquireRelease" | "make",
): boolean {
	return (
		node.callee.type === "MemberExpression" &&
		!node.callee.computed &&
		node.callee.property.type === "Identifier" &&
		node.callee.property.name === method &&
		isImportedNamespaceMember(sourceCode, node.callee.object, namespace)
	);
}

function isAcquireArgument(sourceCode: SourceCode, node: ESTree.CallExpression): boolean {
	let current: ESTree.Node = node;
	while (
		current.parent.type === "ParenthesizedExpression" ||
		current.parent.type === "TSAsExpression" ||
		current.parent.type === "TSSatisfiesExpression" ||
		current.parent.type === "TSNonNullExpression"
	) {
		current = current.parent;
	}
	const parent = current.parent;
	return (
		parent.type === "CallExpression" &&
		parent.arguments[0] === current &&
		isMethodCall(sourceCode, parent, "Effect", "acquireRelease")
	);
}

/** Require every Effect Scope acquisition to enter acquireRelease immediately. */
export const noUnmanagedEffectScopeRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow Scope.make outside the acquisition argument of Effect.acquireRelease.",
		},
		messages: {
			unmanaged:
				"Scope.make must be immediately owned by Effect.acquireRelease so every acquisition has a release path.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				if (
					isMethodCall(context.sourceCode, node, "Scope", "make") &&
					!isAcquireArgument(context.sourceCode, node)
				) {
					context.report({ node, messageId: "unmanaged" });
				}
			},
		};
	},
});
