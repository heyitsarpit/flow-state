import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import {
	broadEffectErrorTagDepth,
	getBroadEffectHandlerParameter,
	isEffectTaggedValue,
	isTagMember,
	tagMemberFromComparison,
} from "../../shared/effect/tagged-values.ts";

export const noManualTagComparisonRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Use Effect Match or Predicate helpers instead of manually branching on `_tag` for Effect tagged values.",
		},
		messages: {
			manualComparison:
				"Use Match.tag/Match.tags for Effect tagged-value branching, or Predicate.isTagged for a simple reusable predicate.",
			manualSwitch:
				"Use Match.value(value).pipe(Match.tag/Match.tags/Match.tagsExhaustive) instead of switching on an Effect tagged value's `_tag`.",
		},
	},
	createOnce(context) {
		const isEffectTagMember = (node: ESTree.MemberExpression): boolean =>
			isEffectTaggedValue(context.sourceCode, node.object);
		const belongsToCaughtError = (node: ESTree.MemberExpression): boolean => {
			const parameter = getBroadEffectHandlerParameter(context.sourceCode, node);
			return parameter !== undefined && broadEffectErrorTagDepth(context.sourceCode, node, parameter) !== null;
		};

		return {
			BinaryExpression(node: ESTree.BinaryExpression) {
				const tagMember = tagMemberFromComparison(node);
				if (
					tagMember === undefined ||
					belongsToCaughtError(tagMember) ||
					!isEffectTagMember(tagMember)
				) return;
				context.report({ node, messageId: "manualComparison" });
			},
			SwitchStatement(node: ESTree.SwitchStatement) {
				if (
					!isTagMember(node.discriminant) ||
					belongsToCaughtError(node.discriminant) ||
					!isEffectTagMember(node.discriminant)
				) return;
				context.report({ node, messageId: "manualSwitch" });
			},
		};
	},
});
