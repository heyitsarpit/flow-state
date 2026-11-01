import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function isReadonlyReference(type: ESTree.TSTypeReference): boolean {
	return type.typeName.type === "Identifier" && type.typeName.name === "Readonly";
}

function unwrapParentheses(type: ESTree.TSType): ESTree.TSType {
	return type.type === "TSParenthesizedType" ? unwrapParentheses(type.typeAnnotation) : type;
}

function isRedundantReadonly(type: ESTree.TSType): boolean {
	if (type.type !== "TSTypeReference" || !isReadonlyReference(type)) return false;
	const typeArguments = type.typeArguments;
	if (typeArguments === null || typeArguments === undefined || typeArguments.params.length !== 1) {
		return false;
	}
	const inner = unwrapParentheses(typeArguments.params[0]);
	if (inner?.type !== "TSTypeLiteral" || inner.members.length === 0) return false;

	return inner.members.every((member) => {
		if (member.type === "TSPropertySignature" || member.type === "TSIndexSignature") {
			return member.readonly;
		}
		return false;
	});
}

/** Prefer one readonly spelling instead of Readonly<{ readonly ... }>. */
export const noRedundantReadonlyWrapperRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow Readonly wrappers whose object members are already individually readonly.",
		},
		messages: {
			redundant:
				"This Readonly wrapper duplicates readonly members. Choose either Readonly<{ ... }> or readonly properties.",
		},
	},
	createOnce(context) {
		return {
			TSTypeReference(node: ESTree.TSTypeReference) {
				if (isRedundantReadonly(node)) context.report({ node, messageId: "redundant" });
			},
		};
	},
});
