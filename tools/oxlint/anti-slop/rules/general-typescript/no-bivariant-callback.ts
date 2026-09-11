import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const hackName = "bivarianceHack";

function unwrapParentheses(type: ESTree.TSType): ESTree.TSType {
	return type.type === "TSParenthesizedType" ? unwrapParentheses(type.typeAnnotation) : type;
}

function typeKeyName(node: ESTree.Node): string | null {
	if (node.type === "Identifier") return node.name;
	if (node.type === "Literal" && typeof node.value === "string") return node.value;
	return null;
}

function isBivarianceHack(node: ESTree.TSIndexedAccessType): boolean {
	const objectType = unwrapParentheses(node.objectType);
	const indexType = unwrapParentheses(node.indexType);
	if (
		objectType.type !== "TSTypeLiteral" ||
		objectType.members.length !== 1 ||
		indexType.type !== "TSLiteralType" ||
		indexType.literal.type !== "Literal" ||
		indexType.literal.value !== hackName
	) {
		return false;
	}
	const member = objectType.members[0];
	return (
		member.type === "TSMethodSignature" &&
		member.kind === "method" &&
		!member.computed &&
		typeKeyName(member.key) === hackName
	);
}

/** Disallow TypeScript's indexed method-signature bivariance escape hatch. */
export const noBivariantCallbackRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow callback types made bivariant by indexing a bivarianceHack method out of an object type.",
		},
		messages: {
			bivariantCallback:
				"This bivarianceHack disables safe callback parameter checking. Use a normal function type so callback inputs remain contravariant.",
		},
	},
	createOnce(context) {
		let declarationFile = false;

		return {
			Program() {
				declarationFile = context.filename.replaceAll("\\", "/").endsWith(".d.ts");
			},
			TSIndexedAccessType(node: ESTree.TSIndexedAccessType) {
				if (!declarationFile && isBivarianceHack(node)) {
					context.report({ node, messageId: "bivariantCallback" });
				}
			},
		};
	},
});
