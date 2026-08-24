import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

function resolveVariable(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): Variable | null {
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
	}
	return null;
}

function importedName(node: ESTree.ImportSpecifier): string {
	return node.imported.type === "Identifier" ? node.imported.name : node.imported.value;
}

function isEffectModule(source: string): boolean {
	return source === "effect" || source.startsWith("effect/");
}

/** Resolve only bindings that came from the installed Effect package. */
export function isImportedFromEffect(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	allowedNames?: ReadonlySet<string>,
): boolean {
	if (expression.type !== "Identifier") return false;
	if (typeof sourceCode.getScope !== "function") {
		return sourceCode.ast.body.some(
			(statement) =>
				statement.type === "ImportDeclaration" &&
				isEffectModule(statement.source.value) &&
				statement.specifiers.some((specifier) => {
					if (specifier.local.name !== expression.name) return false;
					if (specifier.type === "ImportNamespaceSpecifier") return true;
					return (
						specifier.type === "ImportSpecifier" &&
						(allowedNames === undefined ||
							allowedNames.has(
								specifier.imported.type === "Identifier"
								? specifier.imported.name
								: specifier.imported.value,
							))
					);
				}),
		);
	}
	const variable = resolveVariable(sourceCode, expression);
	if (variable === null) return false;

	return variable.defs.some((definition) => {
		if (
			definition.type !== "ImportBinding" ||
			definition.parent?.type !== "ImportDeclaration" ||
			!isEffectModule(definition.parent.source.value)
		) {
			return false;
		}

		if (definition.node.type === "ImportNamespaceSpecifier") return true;
		if (definition.node.type !== "ImportSpecifier") return false;
		return allowedNames === undefined || allowedNames.has(importedName(definition.node));
	});
}
