import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestSupportFile } from "../../shared/file-scope.ts";

function isNamedDeclaration(node: ESTree.Declaration | ESTree.Expression): boolean {
	if (node.type === "ParenthesizedExpression") return isNamedDeclaration(node.expression);
	return (
		(node.type === "FunctionDeclaration" ||
			node.type === "ClassDeclaration" ||
			node.type === "FunctionExpression" ||
			node.type === "ClassExpression") &&
		node.id !== null
	);
}

/** Keep package exports discoverable by requiring a name at the default-export site. */
export const noAnonymousDefaultExportRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description: "Disallow anonymous default exports in package source modules.",
		},
		messages: {
			anonymousDefault:
				"Give this export a meaningful name. Use a named export or named default declaration so consumers can identify the operation or value.",
		},
	},
	createOnce(context) {
		return {
			ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {
				if (isTestSupportFile(context.filename)) return;
				const declaration = node.declaration;
				if (declaration.type === "Identifier" || isNamedDeclaration(declaration)) return;
				context.report({ node, messageId: "anonymousDefault" });
			},
		};
	},
});
