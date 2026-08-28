import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";
import { isEffectHostBoundaryFile } from "../shared/file-scope.ts";

function unwrapParentheses(expression: ESTree.Expression): ESTree.Expression {
	return expression.type === "ParenthesizedExpression"
		? unwrapParentheses(expression.expression)
		: expression;
}

function isGlobalPromise(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): boolean {
	if (typeof sourceCode.getScope !== "function") return identifier.name === "Promise";

	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable.defs.length === 0;
		scope = scope.upper;
	}
	return true;
}

function isPromiseResolve(sourceCode: SourceCode, expression: ESTree.Expression): boolean {
	const unwrapped = unwrapParentheses(expression);
	if (unwrapped.type !== "CallExpression") return false;

	const callee = unwrapped.callee;
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.object.type === "Identifier" &&
		callee.object.name === "Promise" &&
		isGlobalPromise(sourceCode, callee.object) &&
		callee.property.type === "Identifier" &&
		callee.property.name === "resolve"
	);
}

function isEffectPromiseMicrotask(sourceCode: SourceCode, node: ESTree.CallExpression): boolean {
	const callee = node.callee;
	if (
		callee.type !== "MemberExpression" ||
		callee.computed ||
		callee.property.type !== "Identifier" ||
		callee.property.name !== "promise" ||
		!isImportedFromEffect(sourceCode, callee.object, new Set(["Effect"]))
	) {
		return false;
	}

	if (node.arguments.length !== 1) return false;
	const callback = node.arguments[0];
	return (
		callback.type === "ArrowFunctionExpression" &&
		callback.params.length === 0 &&
		(callback.body.type !== "BlockStatement"
			? isPromiseResolve(sourceCode, callback.body)
			: callback.body.body.length === 1 &&
				callback.body.body[0]?.type === "ReturnStatement" &&
				callback.body.body[0].argument !== null &&
				isPromiseResolve(sourceCode, callback.body.body[0].argument))
	);
}

/** Keep scheduler yielding inside Effect instead of manufacturing a Promise microtask. */
export const noEffectPromiseMicrotaskRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow Effect.promise callbacks that manufacture a microtask with Promise.resolve in domain code.",
		},
		messages: {
			promiseMicrotask:
				"Do not yield through Effect.promise(() => Promise.resolve(...)). Use Effect scheduling or coordination primitives.",
		},
	},
	createOnce(context) {
		let allowedBoundary = false;

		return {
			Program() {
				allowedBoundary = isEffectHostBoundaryFile(context.filename);
			},
			CallExpression(node: ESTree.CallExpression) {
				if (!allowedBoundary && isEffectPromiseMicrotask(context.sourceCode, node)) {
					context.report({ node, messageId: "promiseMicrotask" });
				}
			},
		};
	},
});
