import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function moduleName(node: ESTree.ModuleExportName): string | null {
	return node.type === "Identifier" ? node.name : null;
}

function addBindingNames(
	pattern: ESTree.BindingPattern | ESTree.BindingRestElement | null,
	names: Set<string>,
): void {
	if (pattern === null) return;
	if (pattern.type === "Identifier") {
		names.add(pattern.name);
		return;
	}
	if (pattern.type === "RestElement") {
		addBindingNames(pattern.argument, names);
		return;
	}
	if (pattern.type === "AssignmentPattern") {
		addBindingNames(pattern.left, names);
		return;
	}
	if (pattern.type === "ArrayPattern") {
		for (const element of pattern.elements) addBindingNames(element, names);
		return;
	}
	if (pattern.type === "ObjectPattern") {
		for (const property of pattern.properties) {
			addBindingNames(property.type === "RestElement" ? property.argument : property.value, names);
		}
	}
}

function collectProgramNames(program: ESTree.Program): {
	typeOnly: Set<string>;
	value: Set<string>;
} {
	const names = new Set<string>();
	const valueNames = new Set<string>();
	for (const statement of program.body) {
		const declaration =
			statement.type === "ExportNamedDeclaration" ||
			statement.type === "ExportDefaultDeclaration"
				? statement.declaration
				: statement;
		if (
			declaration?.type === "TSTypeAliasDeclaration" ||
			declaration?.type === "TSInterfaceDeclaration"
		) {
			names.add(declaration.id.name);
		}
		if (
			declaration?.type === "ClassDeclaration" ||
			declaration?.type === "FunctionDeclaration" ||
			declaration?.type === "TSEnumDeclaration" ||
			declaration?.type === "TSModuleDeclaration"
		) {
			if (declaration.id?.type === "Identifier") valueNames.add(declaration.id.name);
		}
		if (declaration?.type === "TSImportEqualsDeclaration") {
			if (declaration.importKind === "type") names.add(declaration.id.name);
			else valueNames.add(declaration.id.name);
		}
		if (declaration?.type === "VariableDeclaration") {
			for (const declarator of declaration.declarations) {
				addBindingNames(declarator.id, valueNames);
			}
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
	return { typeOnly: names, value: valueNames };
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
				const { typeOnly, value } = collectProgramNames(node);
				typeOnlyNames = new Set([...typeOnly].filter((name) => !value.has(name)));
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
