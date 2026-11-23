import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isInsideEffectWorkflow } from "../../shared/effect/effect-workflow.ts";

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
				"Yield Effect.fail with a tagged error for expected failure, or Effect.die for an invariant defect. Native throw bypasses the typed E channel, but does not inherently bypass Effect finalizers. Compose the Effect without starting a nested runtime.",
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
