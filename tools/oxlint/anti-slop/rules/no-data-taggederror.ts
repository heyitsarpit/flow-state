// Superseded by rules/flow-state/no-parallel-diagnostic-errors.ts. Kept for
// compatibility with restored work and historical rule references.
import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";

function isDataTaggedError(sourceCode: SourceCode, node: ESTree.MemberExpression): boolean {
	return (
		node.object.type === "Identifier" &&
		((!node.computed && node.property.type === "Identifier" && node.property.name === "TaggedError") ||
			(node.computed && node.property.type === "Literal" && node.property.value === "TaggedError")) &&
		isImportedFromEffect(sourceCode, node.object, new Set(["Data"]))
	);
}

/** Legacy rule retained for compatibility; Flow State uses the superseding Diagnostic rule. */
export const noDataTaggedErrorRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Superseded by the Flow State Diagnostic rule; retained for compatibility only.",
		},
		messages: {
			taggedError:
				"This legacy rule is superseded. Use the canonical Diagnostic and its owned projector.",
		},
	},
	createOnce(context) {
		return {
			MemberExpression(node: ESTree.MemberExpression) {
				if (isDataTaggedError(context.sourceCode, node)) {
					context.report({ node, messageId: "taggedError" });
				}
			},
		};
	},
});
