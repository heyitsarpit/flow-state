import { defineRule } from "@oxlint/plugins";

import type { ESTree, Variable } from "@oxlint/plugins";

function isTypePosition(identifier: ESTree.Node): boolean {
	let current: ESTree.Node | null = identifier.parent;
	while (current !== null && current.type !== "Program") {
		if (current.type === "TSTypeQuery") return false;
		if (
			current.type === "TSAsExpression" ||
			current.type === "TSSatisfiesExpression" ||
			current.type === "TSInstantiationExpression"
		) {
			return false;
		}
		if (current.type.startsWith("TS") || current.type.startsWith("JSDoc")) return true;
		current = current.parent;
	}
	return false;
}

function importedVariable(
	variables: readonly Variable[],
	localName: string,
): Variable | undefined {
	return variables.find((variable) => variable.name === localName);
}

function isTypeOnlyBinding(
	declaration: ESTree.ImportDeclaration,
	specifier: ESTree.ImportDeclarationSpecifier,
	variable: Variable | undefined,
): boolean {
	if (
		declaration.importKind === "type" ||
		(specifier.type === "ImportSpecifier" && specifier.importKind === "type")
	) {
		return true;
	}
	if (variable === undefined || variable.references.length === 0) return false;
	return variable.references.every((reference) => isTypePosition(reference.identifier));
}

/** Require a top-level import type when every imported binding is used only as a type. */
export const useImportTypeRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Require top-level `import type` for imports whose bindings are used only in type positions. Ambiguous and unused imports are ignored.",
		},
		messages: {
			importType:
				"This import is used only as a type. Use top-level `import type { ... }` so the runtime boundary is explicit.",
		},
	},
	createOnce(context) {
		return {
			ImportDeclaration(node: ESTree.ImportDeclaration) {
				if (node.importKind === "type" || node.specifiers.length === 0) return;
				const variables = context.sourceCode.getDeclaredVariables(node);
				const allTypeOnly = node.specifiers.every((specifier) => {
					const variable = importedVariable(
						variables,
						specifier.local.name,
					);
					return isTypeOnlyBinding(node, specifier, variable);
				});
				if (allTypeOnly) context.report({ node, messageId: "importType" });
			},
		};
	},
});
