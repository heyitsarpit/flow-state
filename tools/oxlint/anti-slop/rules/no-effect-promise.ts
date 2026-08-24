import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";

function unwrapExpression(argument: ESTree.Expression | ESTree.SpreadElement): ESTree.Expression | ESTree.SpreadElement {
	let current = argument;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSSatisfiesExpression" ||
		current.type === "TSNonNullExpression"
	) {
		current = current.expression;
	}
	return current;
}

function propertyName(property: { computed: boolean; key: ESTree.PropertyKey }): string | null {
	if (property.computed) {
		return property.key.type === "Literal" && typeof property.key.value === "string"
			? property.key.value
			: null;
	}
	return property.key.type === "Identifier" ? property.key.name : null;
}

function isCallableExpression(expression: ESTree.Expression | ESTree.SpreadElement): boolean {
	const unwrapped = unwrapExpression(expression);
	return (
		(unwrapped.type === "Identifier" && unwrapped.name !== "undefined") ||
		unwrapped.type === "MemberExpression" ||
		unwrapped.type === "FunctionExpression" ||
		unwrapped.type === "ArrowFunctionExpression"
	);
}

function isObjectArgument(argument: ESTree.Expression | ESTree.SpreadElement): boolean {
	const unwrapped = unwrapExpression(argument);
	if (unwrapped.type !== "ObjectExpression") return false;
	let hasTry = false;
	let catchMapper: ESTree.Expression | ESTree.SpreadElement | null = null;
	for (const property of unwrapped.properties) {
		if (property.type !== "Property") continue;
		const name = propertyName(property);
		if (name === "try") hasTry = true;
		if (name === "catch") catchMapper = property.value;
	}
	return hasTry && catchMapper !== null && isCallableExpression(catchMapper);
}

function effectPromiseIssue(
	sourceCode: SourceCode,
	 node: ESTree.CallExpression,
	): "promise" | "tryPromise" | null {
	const callee = node.callee;
	if (
		callee.type !== "MemberExpression" ||
		callee.computed ||
		callee.object.type !== "Identifier" ||
		callee.property.type !== "Identifier" ||
		!isImportedFromEffect(sourceCode, callee.object, new Set(["Effect"]))
	) {
		return null;
	}

	if (callee.property.name === "promise") return "promise";
	if (callee.property.name === "tryPromise" && node.arguments.length === 1) {
		return isObjectArgument(node.arguments[0]) ? null : "tryPromise";
	}
	return null;
}

/** Require explicit rejection mapping for Promise-to-Effect adapters. */
export const noEffectPromiseRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Require object-notation Effect.tryPromise with an explicit rejection mapper.",
		},
		messages: {
			promise:
				"Effect.promise is not allowed. Use Effect.tryPromise({ try, catch }) so rejection remains a typed failure.",
			tryPromise:
				"Single-argument Effect.tryPromise is not allowed. Use Effect.tryPromise({ try, catch }) with an explicit failure mapper.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				const issue = effectPromiseIssue(context.sourceCode, node);
				if (issue !== null) context.report({ node, messageId: issue });
			},
		};
	},
});
