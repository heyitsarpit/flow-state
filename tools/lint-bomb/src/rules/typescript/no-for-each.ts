import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect/effect-import.ts";

function propertyName(node: ESTree.MemberExpression): string | null {
	if (!node.computed && node.property.type === "Identifier") return node.property.name;
	if (node.property.type === "Literal" && typeof node.property.value === "string") return node.property.value;
	return node.property.type === "TemplateLiteral" && node.property.expressions.length === 0 && node.property.quasis.length === 1
		? node.property.quasis[0]?.value.cooked ?? node.property.quasis[0]?.value.raw ?? null
		: null;
}

function isEffectForEach(sourceCode: SourceCode, node: ESTree.MemberExpression): boolean {
	return isImportedFromEffect(sourceCode, node.object, new Set(["Effect"]));
}

/** Prefer visible iteration syntax so control flow, awaiting, and early exits remain explicit. */
export const noForEachRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Flag member calls named forEach, except Effect.forEach; inspect custom receivers before applying native Array.forEach advice.",
		},
		messages: {
			forEach:
				"This rule flags member calls named .forEach; inspect the receiver before applying native Array.forEach advice. Native Array.prototype.forEach discards callback results and does not await asynchronous work; returning an Effect does not execute it. Use for...of for imperative iteration or Effect.forEach with an explicit concurrency policy for Effectful traversal.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				if (
					node.callee.type !== "MemberExpression" ||
					propertyName(node.callee) !== "forEach" ||
					isEffectForEach(context.sourceCode, node.callee)
				) {
					return;
				}
				context.report({ node, messageId: "forEach" });
			},
		};
	},
});
