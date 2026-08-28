import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isInsideEffectWorkflow } from "../shared/effect-workflow.ts";

/** Keep recoverable failures in Effect's E channel instead of native throws. */
export const noThrowInEffectGenRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow native throw statements inside Effect.gen, Effect.fn, and Effect.fnUntraced workflows.",
		},
		messages: {
			throw:
				"Native throw bypasses the workflow's typed E channel. Yield Effect.fail for an expected failure or Effect.die for a violated invariant so callers can compose recovery, interruption, and cleanup.",
		},
	},
	createOnce(context) {
		return {
			ThrowStatement(node: ESTree.ThrowStatement) {
				if (isInsideEffectWorkflow(context.sourceCode, node)) {
					context.report({ node, messageId: "throw" });
				}
			},
		};
	},
});
