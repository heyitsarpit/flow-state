import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestSupportFile, normalizedFilename } from "../shared/file-scope.ts";

function isFlowRewriteProduction(filename: string): boolean {
	return (
		normalizedFilename(filename).includes("/packages/flow-state-rewrite/src/") &&
		!isTestSupportFile(filename)
	);
}

/** Keep recoverable failures in Result or Effect instead of local native catches. */
export const noRawTryCatchRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow native try/catch in Flow State rewrite library source, including host-named folders.",
		},
		messages: {
			rawTryCatch:
				"Raw try/catch is forbidden in library code. Use Result or an Effect boundary.",
		},
	},
	createOnce(context) {
		return {
			TryStatement(node: ESTree.TryStatement) {
				if (node.handler !== null && isFlowRewriteProduction(context.filename)) {
					context.report({ node, messageId: "rawTryCatch" });
				}
			},
		};
	},
});
