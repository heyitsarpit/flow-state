import { defineRule } from "@oxlint/plugins";

import type { ESTree, Variable } from "@oxlint/plugins";

const typeSyntaxNodes = new Set([
	"TSAnyKeyword",
	"TSBigIntKeyword",
	"TSBooleanKeyword",
	"TSClassImplements",
	"TSConditionalType",
	"TSConstructorType",
	"TSFunctionType",
	"TSCallSignatureDeclaration",
	"TSConstructSignatureDeclaration",
	"TSImportType",
	"TSIndexedAccessType",
	"TSInferType",
	"TSInterfaceHeritage",
	"TSInterfaceBody",
	"TSInterfaceDeclaration",
	"TSIntersectionType",
	"TSIntrinsicKeyword",
	"TSLiteralType",
	"TSMappedType",
	"TSNamedTupleMember",
	"TSNeverKeyword",
	"TSNullKeyword",
	"TSNumberKeyword",
	"TSObjectKeyword",
	"TSParenthesizedType",
	"TSStringKeyword",
	"TSSymbolKeyword",
	"TSTemplateLiteralType",
	"TSThisType",
	"TSTupleType",
	"TSTypeLiteral",
	"TSMethodSignature",
	"TSPropertySignature",
	"TSIndexSignature",
	"TSTypeOperator",
	"TSTypePredicate",
	"TSTypeReference",
	"TSUndefinedKeyword",
	"TSUnionType",
	"TSUnknownKeyword",
	"TSVoidKeyword",
	"JSDocNonNullableType",
	"JSDocNullableType",
	"JSDocUnknownType",
]);

function isTypePosition(identifier: ESTree.Node): boolean {
	let current: ESTree.Node | null = identifier.parent;
	while (current !== null && current.type !== "Program") {
		if (current.type === "TSTypeQuery") return true;
		if (
			current.type === "TSAsExpression" ||
			current.type === "TSSatisfiesExpression" ||
			current.type === "TSInstantiationExpression" ||
			current.type === "TSNonNullExpression" ||
			current.type === "TSParameterProperty"
		) {
			return false;
		}
		if (typeSyntaxNodes.has(current.type)) return true;
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
				"This import is used only as a type. Use top-level `import type { ... }` so runtime dependencies remain explicit. Preserve any required module side effects with a separate side-effect import.",
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
