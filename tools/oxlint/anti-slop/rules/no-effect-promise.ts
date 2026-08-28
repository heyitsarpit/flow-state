import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { getEffectPromiseCall } from "../shared/effect-promise.ts";

/** Forbid Effect.promise; Promise interop belongs in the separately justified tryPromise rule. */
export const noEffectPromiseRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid Effect.promise so Promise conversion uses an explicit, justified tryPromise boundary.",
		},
		messages: {
			promise:
				"Effect.promise is forbidden. Make the operation Effect-native; use Effect.tryPromise({ try, catch }) only for unavoidable Promise interop.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				if (getEffectPromiseCall(context.sourceCode, node)?.method === "promise") {
					context.report({ node, messageId: "promise" });
				}
			},
		};
	},
});
