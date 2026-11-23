import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestFile } from "../../shared/file-scope.ts";

function isAllowedFile(filename: string): boolean {
	const normalized = filename.replaceAll("\\", "/");
	return (
		isTestFile(filename) ||
		normalized.includes("/src/testing/") ||
		normalized.includes("/typecheck/")
	);
}

/** Disallow explicit any in production code while preserving type-test and harness escape hatches. */
export const noExplicitAnyRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Disallow explicit any in production TypeScript code.",
		},
		messages: {
			explicitAny:
				"This explicit any erases the value contract. Preserve a generic, inferred type, or named protocol. Keep unknown at a genuine external admission boundary and decode with Schema before passing values downstream. Confine unavoidable erasure to a documented adapter; use a narrow, reasoned suppression when necessary, because a name or documentation alone does not exempt this check.",
		},
	},
	createOnce(context) {
		let allowedFile = false;

		return {
			Program() {
				allowedFile = isAllowedFile(context.filename);
			},
			TSAnyKeyword(node: ESTree.TSAnyKeyword) {
				if (allowedFile) return;
				context.report({ node, messageId: "explicitAny" });
			},
		};
	},
});
