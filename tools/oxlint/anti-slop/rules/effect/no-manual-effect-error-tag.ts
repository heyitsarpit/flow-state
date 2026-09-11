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
			tag: "Use Effect.catchTag or Effect.catchTags instead of manually discriminating a tagged error in a broad Effect catch handler.",
			reason:
				"Use Effect.catchReason or Effect.catchReasons instead of manually discriminating a tagged `reason` in a broad Effect catch handler.",
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
