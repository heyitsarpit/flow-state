import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";

function propertyName(node: ESTree.MemberExpression): string | null {
	if (!node.computed && node.property.type === "Identifier") return node.property.name;
	return node.computed && node.property.type === "Literal" && typeof node.property.value === "string"
		? node.property.value
		: null;
}

function isEffectForEach(sourceCode: SourceCode, node: ESTree.MemberExpression): boolean {
	return (
		node.object.type === "Identifier" &&
		isImportedFromEffect(sourceCode, node.object, new Set(["Effect"]))
	);
}

/** Prefer visible iteration syntax so control flow, awaiting, and early exits remain explicit. */
export const noForEachRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow forEach calls. Use a for...of loop so control flow, awaiting, and early exits remain visible.",
		},
		messages: {
			forEach:
				"Use a `for...of` loop instead of `.forEach(...)`. This keeps control flow and async behavior visible.",
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
