import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { resolveVariable } from "../../shared/scope.ts";

function isReadonlyReference(sourceCode: Parameters<typeof resolveVariable>[0], type: ESTree.TSTypeReference): boolean {
	if (type.typeName.type !== "Identifier" || type.typeName.name !== "Readonly") return false;
	const variable = resolveVariable(sourceCode, type.typeName);
	return variable === null || variable.defs.length === 0;
}

function unwrapParentheses(type: ESTree.TSType): ESTree.TSType {
	return type.type === "TSParenthesizedType" ? unwrapParentheses(type.typeAnnotation) : type;
}

function isRedundantReadonly(sourceCode: Parameters<typeof resolveVariable>[0], type: ESTree.TSType): boolean {
	if (type.type !== "TSTypeReference" || !isReadonlyReference(sourceCode, type)) return false;
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
				"This Readonly wrapper duplicates readonly members. If the contract requires readonly, keep one spelling; otherwise use a plain internal record. Preserve public guarantees and configure required readonly contracts as exceptions to the broader readonly review policy rather than removing them to silence another diagnostic.",
		},
	},
	createOnce(context) {
		return {
			TSTypeReference(node: ESTree.TSTypeReference) {
				if (isRedundantReadonly(context.sourceCode, node)) context.report({ node, messageId: "redundant" });
			},
		};
	},
});
