import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { normalizedFilename } from "../shared/file-scope.ts";
import { getEffectPromiseCall } from "../shared/effect-promise.ts";

const commentOwnerKinds = new Set([
	"ExpressionStatement",
	"PropertyDefinition",
	"ReturnStatement",
	"ThrowStatement",
	"VariableDeclaration",
]);

function unwrapExpression(expression: ESTree.Expression | ESTree.SpreadElement): ESTree.Expression | ESTree.SpreadElement {
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

function isObjectForm(argument: ESTree.Expression | ESTree.SpreadElement | undefined): boolean {
	if (argument === undefined || argument.type === "SpreadElement") return false;
	const unwrapped = unwrapExpression(argument);
	if (unwrapped.type !== "ObjectExpression") return false;

	let tryFunction: ESTree.Expression | ESTree.SpreadElement | null = null;
	let catchMapper: ESTree.Expression | ESTree.SpreadElement | null = null;
	for (const property of unwrapped.properties) {
		if (property.type !== "Property") continue;
		const name = propertyName(property);
		if (name === "try") tryFunction = property.value;
		if (name === "catch") catchMapper = property.value;
	}

	return (
		tryFunction !== null &&
		catchMapper !== null &&
		isCallableExpression(tryFunction) &&
		isCallableExpression(catchMapper)
	);
}

function isStandaloneComment(
	sourceCode: SourceCode,
	comment: { readonly start: number; readonly end: number },
): boolean {
	const text = sourceCode.getText();
	const lineStart = Math.max(text.lastIndexOf("\n", comment.start - 1) + 1, 0);
	const lineEndIndex = text.indexOf("\n", comment.end);
	const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
	return text.slice(lineStart, comment.start).trim() === "" && text.slice(comment.end, lineEnd).trim() === "";
}

function isTryPromiseWaiver(comment: { readonly value: string }): boolean {
	return /^\s*FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE:\s*\S.*$/u.test(comment.value);
}

function hasAdjacentWaiver(sourceCode: SourceCode, node: ESTree.CallExpression): boolean {
	let current: ESTree.Node = node;
	while (true) {
		const before = sourceCode.getCommentsBefore(current).at(-1);
		if (before !== undefined && isTryPromiseWaiver(before) && isStandaloneComment(sourceCode, before)) {
			const gap = sourceCode.getText().slice(before.end, current.start);
			if (gap.trim() === "" && gap.includes("\n") && gap.split("\n").length <= 2) return true;
		}

		if (commentOwnerKinds.has(current.type) || current.parent === null || current.parent.type === "Program") return false;
		current = current.parent;
	}
}

function isFlowRewriteSource(filename: string): boolean {
	return normalizedFilename(filename).includes("/packages/flow-state-rewrite/src/");
}

/** Require explicit architectural justification for unavoidable Promise interop. */
export const noUnjustifiedEffectTryPromiseRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Require an adjacent justification before object-form Effect.tryPromise in Flow State rewrite source.",
		},
		messages: {
			unjustified:
				"Effect.tryPromise is a Promise boundary. Change the dependency to return Effect, or justify why that is impossible.",
			invalid:
				"Effect.tryPromise must provide both try and catch. Map rejection to Diagnostic.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				if (!isFlowRewriteSource(context.filename)) return;
				const call = getEffectPromiseCall(context.sourceCode, node);
				if (call?.method !== "tryPromise") return;
				if (!isObjectForm(call.argument)) {
					context.report({ node, messageId: "invalid" });
					return;
				}
				if (!hasAdjacentWaiver(context.sourceCode, node)) {
					context.report({ node, messageId: "unjustified" });
				}
			},
		};
	},
});
