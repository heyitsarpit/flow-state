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

function memberName(expression: ESTree.MemberExpression): string | null {
	if (!expression.computed && expression.property.type === "Identifier") {
		return expression.property.name;
	}
	if (!expression.computed) return null;
	if (expression.property.type === "Literal" && typeof expression.property.value === "string") {
		return expression.property.value;
	}
	if (
		expression.property.type === "TemplateLiteral" &&
		expression.property.expressions.length === 0 &&
		expression.property.quasis.length === 1
	) {
		return expression.property.quasis[0]?.value.cooked ?? expression.property.quasis[0]?.value.raw ?? null;
	}
	return null;
}

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSSatisfiesExpression" ||
		current.type === "TSTypeAssertion" ||
		current.type === "TSNonNullExpression" ||
		current.type === "TSInstantiationExpression"
	) {
		current = current.expression;
	}
	return current;
}

function variableInitializer(variable: Variable): ESTree.Expression | null {
	if (variable.defs.length !== 1) return null;
	const definition = variable.defs[0];
	if (
		definition?.type !== "Variable" ||
		definition.node.type !== "VariableDeclarator" ||
		definition.parent?.type !== "VariableDeclaration" ||
		definition.parent.kind !== "const" ||
		variable.references.some((reference) => reference.isWrite() && !reference.init)
	) {
		return null;
	}
	return definition.node.id.type === "Identifier" ? definition.node.init : null;
}

function isEffectNamespaceImport(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): boolean {
	if (typeof sourceCode.getScope !== "function") {
		return sourceCode.ast.body.some(
			(statement) =>
				statement.type === "ImportDeclaration" &&
				isEffectModule(statement.source.value) &&
				statement.specifiers.some(
					(specifier) =>
						specifier.local.name === identifier.name &&
						(specifier.type === "ImportNamespaceSpecifier" ||
							(specifier.type === "ImportSpecifier" && importedName(specifier) === "Effect")),
				),
		);
	}
	const variable = resolveVariable(sourceCode, identifier);
	return variable !== null &&
		variable.defs.some(
			(definition) =>
				definition.type === "ImportBinding" &&
				definition.parent?.type === "ImportDeclaration" &&
				isEffectModule(definition.parent.source.value) &&
				(definition.node.type === "ImportNamespaceSpecifier" ||
					(definition.node.type === "ImportSpecifier" && importedName(definition.node) === "Effect")),
		);
}

function isEffectNamespaceReference(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type === "MemberExpression") {
		return memberName(unwrapped) === "Effect" && isEffectNamespaceReference(sourceCode, unwrapped.object, seen);
	}
	if (unwrapped.type !== "Identifier") return false;
	if (isEffectNamespaceImport(sourceCode, unwrapped)) return true;
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || seen.has(variable)) return false;
	const initializer = variableInitializer(variable);
	return initializer !== null && isEffectNamespaceReference(sourceCode, initializer, new Set([...seen, variable]));
}

/** Resolve only bindings that came from the installed Effect package. */
export function isImportedFromEffect(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	allowedNames?: ReadonlySet<string>,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	expression = unwrapExpression(expression);
	if (expression.type === "MemberExpression") {
		const name = memberName(expression);
		return (
			name !== null &&
			(allowedNames === undefined || allowedNames.has(name)) &&
			isEffectNamespaceReference(sourceCode, expression.object)
		);
	}
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
	if (variable === null || seen.has(variable)) return false;
	if (
		variable.defs.some((definition) => {
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
		})
	) return true;
	const initializer = variableInitializer(variable);
	return initializer !== null && isImportedFromEffect(sourceCode, initializer, allowedNames, new Set([...seen, variable]));
}
