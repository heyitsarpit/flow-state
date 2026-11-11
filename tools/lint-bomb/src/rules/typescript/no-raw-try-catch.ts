import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";

/** Keep recoverable failures in Result or Effect instead of local native catches. */
export const noRawTryCatchRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow native try/catch in selected library source, including host-named folders.",
		},
		messages: {
			rawTryCatch:
				"Raw try/catch is forbidden here. Use Schema parsers for admission and Result for pure expected rejection. Adapt synchronous foreign exceptions with Effect.try({ try, catch }) and foreign Promise rejections with Effect.tryPromise({ try, catch }). Compose existing Effects directly; use Effect.mapError for error translation and Effect.catchTag/catchTags for selective recovery. Effect.try does not execute a returned Effect or lift its A/E/R channels into the outer Effect.",
		},
	},
	createOnce(context) {
		return {
			TryStatement(node: ESTree.TryStatement) {
				if (node.handler !== null && !isTestSupportFile(context.filename)) {
					context.report({ node, messageId: "rawTryCatch" });
				}
			},
		};
	},
});
