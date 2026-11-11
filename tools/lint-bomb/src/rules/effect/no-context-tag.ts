import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { memberName } from "../../shared/effect/effect-call.ts";
import { isImportedFromEffect } from "../../shared/effect/effect-import.ts";

const bannedForms = new Set(["Tag", "GenericTag", "Service"]);

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
				"Declare the capability with Effect v4 Context.Service<Self, Contract>()(\"ServiceId\") and provide its implementation through a Layer. Keep operation payloads as arguments and pure transformations as plain functions.",
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
