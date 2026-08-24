import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isTestSupportFile } from "../shared/file-scope.ts";

function isPackageSource(filename: string): boolean {
	const normalized = filename.replaceAll("\\", "/");
	return /\/packages\/[^/]+\/src\//u.test(normalized);
}

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
				"Use a named export or a named default declaration so this module's public owner is discoverable.",
		},
	},
	createOnce(context) {
		return {
			ExportDefaultDeclaration(node: ESTree.ExportDefaultDeclaration) {
				if (!isPackageSource(context.filename) || isTestSupportFile(context.filename)) return;
				const declaration = node.declaration;
				if (declaration.type === "Identifier" || isNamedDeclaration(declaration)) return;
				context.report({ node, messageId: "anonymousDefault" });
			},
		};
	},
});
