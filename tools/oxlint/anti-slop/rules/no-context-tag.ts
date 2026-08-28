import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";

const bannedForms = new Set(["Tag", "GenericTag", "Service"]);

function memberName(node: ESTree.MemberExpression): string | null {
	if (!node.computed && node.property.type === "Identifier") return node.property.name;
	return node.computed && node.property.type === "Literal" && typeof node.property.value === "string"
		? node.property.value
		: null;
}

function isBannedContextForm(sourceCode: SourceCode, node: ESTree.MemberExpression): boolean {
	const property = memberName(node);
	if (property === null || !bannedForms.has(property)) {
		return false;
	}

	const owner = node.object;

	if (property === "Service") {
		return isImportedFromEffect(sourceCode, owner, new Set(["Effect"]));
	}

	return isImportedFromEffect(sourceCode, owner, new Set(["Context"]));
}

/** Keep pre-v4 Effect service constructors out of the rewrite. */
export const noContextTagRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Disallow pre-v4 Effect service constructors such as Context.Tag and Effect.Service.",
		},
		messages: {
			v3Service:
				"Use the Effect-v4 Context.Service form instead of Context.Tag, Context.GenericTag, or Effect.Service.",
		},
	},
	createOnce(context) {
		return {
			MemberExpression(node: ESTree.MemberExpression) {
				if (isBannedContextForm(context.sourceCode, node)) {
					context.report({ node, messageId: "v3Service" });
				}
			},
		};
	},
});
