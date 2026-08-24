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

/** Require the Schema.TaggedErrorClass form used by the rewrite's error contracts. */
export const noDataTaggedErrorRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Disallow Data.TaggedError; use Schema.TaggedErrorClass for typed errors.",
		},
		messages: {
			taggedError:
				"Data.TaggedError is not allowed. Define the error with Schema.TaggedErrorClass so its typed contract remains explicit.",
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
