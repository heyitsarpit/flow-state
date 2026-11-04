import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function typeName(node: ESTree.TSTypeReference["typeName"]): string {
	if (node.type === "Identifier") return node.name;
	return node.type === "TSQualifiedName" ? node.right.name : "";
}

// `{}` as one case of `Data.TaggedEnum<{ Landed: {} }>` means "a variant with no data".
function isEmptyTaggedEnumVariant(node: ESTree.TSTypeLiteral): boolean {
	const annotation = node.parent;
	const property = annotation?.parent;
	const cases = property?.parent;
	const typeArguments = cases?.parent;
	const reference = typeArguments?.parent;
	return (
		annotation?.type === "TSTypeAnnotation" &&
		property?.type === "TSPropertySignature" &&
		cases?.type === "TSTypeLiteral" &&
		typeArguments?.type === "TSTypeParameterInstantiation" &&
		reference?.type === "TSTypeReference" &&
		typeName(reference.typeName) === "TaggedEnum"
	);
}

/** Disallow the empty object type, except as an empty variant of a `Data.TaggedEnum`. */
export const noEmptyObjectTypeRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow `{}` and empty interfaces, which accept any non-nullish value; allow `{}` as an empty Data.TaggedEnum variant.",
		},
		messages: {
			emptyObject:
				"`{}` accepts any non-nullish value, not an empty object. Declare the fields this value carries, use `Record<string, never>` for an object with no keys, or `unknown` for any value. An empty variant of a Data.TaggedEnum may keep `{}`.",
			emptyInterface:
				"An empty interface accepts any non-nullish value. Declare its fields, or use a type alias for what it really means.",
		},
	},
	createOnce(context) {
		return {
			TSTypeLiteral(node: ESTree.TSTypeLiteral) {
				if (node.members.length === 0 && !isEmptyTaggedEnumVariant(node)) {
					context.report({ node, messageId: "emptyObject" });
				}
			},
			TSInterfaceDeclaration(node: ESTree.TSInterfaceDeclaration) {
				if (node.body.body.length === 0 && node.extends.length === 0) {
					context.report({ node, messageId: "emptyInterface" });
				}
			},
		};
	},
});
