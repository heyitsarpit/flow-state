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

function isEffectImport(
	sourceCode: Parameters<typeof resolveVariable>[0],
	identifier: ESTree.IdentifierReference,
	importedName: string,
): boolean {
	const variable = resolveVariable(sourceCode, identifier);
	if (variable === null || variable.defs.length !== 1) return false;
	const definition = variable.defs[0];
	if (definition.type !== "ImportBinding") return false;
	const specifier = definition.node;
	return (
		specifier.type === "ImportSpecifier" &&
		specifier.imported.type === "Identifier" &&
		specifier.imported.name === importedName &&
		definition.parent?.type === "ImportDeclaration" &&
		definition.parent.source.value === "effect"
	);
}

function isTaggedEnumReference(sourceCode: Parameters<typeof resolveVariable>[0], type: ESTree.TSTypeReference): boolean {
	const name = type.typeName;
	if (name.type === "Identifier") return isEffectImport(sourceCode, name, "TaggedEnum");
	return (
		name.type === "TSQualifiedName" &&
		name.left.type === "Identifier" &&
		name.right.name === "TaggedEnum" &&
		isEffectImport(sourceCode, name.left, "Data")
	);
}

function taggedEnumReadonlyFields(sourceCode: Parameters<typeof resolveVariable>[0], type: ESTree.TSTypeReference) {
	if (!isTaggedEnumReference(sourceCode, type)) return [];
	const definition = type.typeArguments?.params[0];
	if (definition === undefined || definition.type !== "TSTypeLiteral") return [];
	return definition.members.flatMap((tag) => {
		const member = tag.type === "TSPropertySignature" ? tag.typeAnnotation?.typeAnnotation : undefined;
		if (member === undefined || member.type !== "TSTypeLiteral") return [];
		return member.members.filter((field) => field.type === "TSPropertySignature" && field.readonly);
	});
}

/** Prefer one readonly spelling instead of Readonly<{ readonly ... }> or readonly fields of Data.TaggedEnum members. */
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
			taggedEnum:
				"TaggedEnum already makes member fields readonly. Remove this readonly modifier; nested readonly types still need their own spelling.",
		},
	},
	createOnce(context) {
		return {
			TSTypeReference(node: ESTree.TSTypeReference) {
				if (isRedundantReadonly(context.sourceCode, node)) context.report({ node, messageId: "redundant" });
				for (const field of taggedEnumReadonlyFields(context.sourceCode, node)) {
					context.report({ node: field, messageId: "taggedEnum" });
				}
			},
		};
	},
});
