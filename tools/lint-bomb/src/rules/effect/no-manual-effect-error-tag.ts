import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import {
	broadEffectErrorTagDepth,
	getBroadEffectHandlerParameter,
	isReasonTagMember,
	isTagMember,
	tagMemberFromComparison,
} from "../../shared/effect/tagged-values.ts";

export const noManualEffectErrorTagRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Use Effect tagged error handlers instead of manually branching on `_tag` in a catch handler.",
		},
		messages: {
			tag: "Use Effect.catchTag or Effect.catchTags for selective tagged-error recovery. Preserve the existing fallback and failure channels; do not drop recovery for other cases. Use Effect.mapError when translating error vocabulary rather than recovering.",
			reason:
				"Use Effect.catchReason or Effect.catchReasons for selective recovery from supported tagged reasons. Preserve the existing fallback, failure channels, and interruption behavior; replacing selected cases must not discard other handling.",
		},
	},
	createOnce(context) {
		return {
			BinaryExpression(node: ESTree.BinaryExpression) {
				const tagMember = tagMemberFromComparison(node);
				const parameter = getBroadEffectHandlerParameter(context.sourceCode, node);
				if (
					tagMember === undefined ||
					parameter === undefined ||
					broadEffectErrorTagDepth(context.sourceCode, tagMember, parameter) === null
				) return;
				context.report({
					node,
					messageId: isReasonTagMember(tagMember) ? "reason" : "tag",
				});
			},
			SwitchStatement(node: ESTree.SwitchStatement) {
				const parameter = getBroadEffectHandlerParameter(context.sourceCode, node);
				if (
					!isTagMember(node.discriminant) ||
					parameter === undefined ||
					broadEffectErrorTagDepth(context.sourceCode, node.discriminant, parameter) === null
				) return;
				context.report({
					node,
					messageId: isReasonTagMember(node.discriminant) ? "reason" : "tag",
				});
			},
		};
	},
});
