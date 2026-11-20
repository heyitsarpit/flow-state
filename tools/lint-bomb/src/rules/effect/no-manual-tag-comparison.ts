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
				"Use the corresponding Effect guard or matcher instead of manually branching on `_tag` for recognized Effect values.",
		},
		messages: {
			manualComparison:
				"For a case test, use Option.isSome/isNone, Result.isSuccess/isFailure, or Exit.isSuccess/isFailure for those values. For trusted variants use $is from Data.taggedEnum; for Schema-owned variants use .isAnyOf from Schema.TaggedUnion or Schema.toTaggedUnion. Use Predicate.isTagged for other admitted tagged values. These guards do not validate unknown payloads.",
			manualSwitch:
				"Dispatch with Option.match, Result.match, or Exit.match for those values; use $match from Data.taggedEnum for trusted variants or .match from Schema.TaggedUnion/Schema.toTaggedUnion for Schema-owned variants. For other admitted tagged unions, use Match.value with Match.tag or Match.tagsExhaustive. Preserve every existing case and any intentional fallback.",
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
