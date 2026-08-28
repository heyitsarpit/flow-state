import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";
import { isEffectHostBoundaryFile } from "../shared/file-scope.ts";

function isImportedNamespaceMember(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	name: "Effect" | "Scope",
): boolean {
	if (expression.type === "Identifier") {
		return isImportedFromEffect(sourceCode, expression, new Set([name]));
	}
	if (expression.type !== "MemberExpression" || expression.object.type !== "Identifier") return false;
	const member = expression.computed
		? expression.property.type === "Literal" && typeof expression.property.value === "string"
			? expression.property.value
			: null
		: expression.property.type === "Identifier"
			? expression.property.name
			: null;
	return member === name && isImportedFromEffect(sourceCode, expression.object, new Set([name]));
}

function isMethodCall(
	sourceCode: SourceCode,
	node: ESTree.CallExpression,
	namespace: "Effect" | "Scope",
	method: "acquireRelease" | "make",
): boolean {
	return (
		node.callee.type === "MemberExpression" &&
		(node.callee.computed
			? node.callee.property.type === "Literal" && node.callee.property.value === method
			: node.callee.property.type === "Identifier" && node.callee.property.name === method) &&
		isImportedNamespaceMember(sourceCode, node.callee.object, namespace)
	);
}

function isAcquireArgument(sourceCode: SourceCode, node: ESTree.CallExpression): boolean {
	let current: ESTree.Node = node;
	while (
		current.parent.type === "ParenthesizedExpression" ||
		current.parent.type === "TSAsExpression" ||
		current.parent.type === "TSSatisfiesExpression" ||
		current.parent.type === "TSNonNullExpression" ||
		current.parent.type === "TSInstantiationExpression"
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

/** Require domain Scope acquisition to enter acquireRelease immediately. */
export const noUnmanagedEffectScopeRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow Scope.make outside Effect.acquireRelease in domain code while allowing explicit host/runtime owners.",
		},
		messages: {
			unmanaged:
				"Scope.make must be immediately owned by Effect.acquireRelease so every acquisition has a release path.",
		},
	},
	createOnce(context) {
		let allowedBoundary = false;

		return {
			Program() {
				allowedBoundary = isEffectHostBoundaryFile(context.filename);
			},
			CallExpression(node: ESTree.CallExpression) {
				if (
					!allowedBoundary &&
					isMethodCall(context.sourceCode, node, "Scope", "make") &&
					!isAcquireArgument(context.sourceCode, node)
				) {
					context.report({ node, messageId: "unmanaged" });
				}
			},
		};
	},
});
