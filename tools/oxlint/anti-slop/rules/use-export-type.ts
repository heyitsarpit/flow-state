import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function moduleName(node: ESTree.ModuleExportName): string | null {
	return node.type === "Identifier" ? node.name : null;
}

function collectTypeOnlyNames(program: ESTree.Program): Set<string> {
	const names = new Set<string>();
	for (const statement of program.body) {
		const declaration =
			statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
		if (
			declaration?.type === "TSTypeAliasDeclaration" ||
			declaration?.type === "TSInterfaceDeclaration"
		) {
			names.add(declaration.id.name);
		}
		if (declaration?.type === "ImportDeclaration") {
			for (const specifier of declaration.specifiers) {
				if (
					declaration.importKind === "type" ||
					(specifier.type === "ImportSpecifier" && specifier.importKind === "type")
				) {
					names.add(specifier.local.name);
				}
			}
		}
	}
	return names;
}

/** Require top-level export type for exports that carry only types. */
export const useExportTypeRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Require top-level `export type` for syntactically identifiable type-only exports. Ambiguous re-exports are ignored.",
		},
		messages: {
			exportType:
				"This export carries only types. Use top-level `export type { ... }` to make the public boundary explicit.",
		},
	},
	createOnce(context) {
		let typeOnlyNames = new Set<string>();

		return {
			Program(node: ESTree.Program) {
				typeOnlyNames = collectTypeOnlyNames(node);
			},
			ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
				if (node.exportKind === "type" || node.specifiers.length === 0) return;
				const allTypeOnly = node.specifiers.every((specifier) => {
					if (specifier.exportKind === "type") return true;
					if (node.source !== null) return false;
					const local = moduleName(specifier.local);
					return local !== null && typeOnlyNames.has(local);
				});
				if (allTypeOnly) context.report({ node, messageId: "exportType" });
			},
		};
	},
});
