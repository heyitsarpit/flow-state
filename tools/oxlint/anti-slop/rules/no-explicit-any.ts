import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestFile } from "../shared/file-scope.ts";

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
				"This explicit `any` erases the value contract. Preserve the generic, use `unknown` at an input boundary, or isolate the intentional erasure behind a named adapter.",
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
