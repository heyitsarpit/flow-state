import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

import { resolveVariable } from "../scope.ts";

function importedName(node: ESTree.ImportSpecifier): string {
	return node.imported.type === "Identifier" ? node.imported.name : node.imported.value;
}

function isEffectModule(source: string): boolean {
	return source === "effect" || source.startsWith("effect/");
}

function effectModuleNamespace(source: string): string | null {
	if (source === "effect") return null;
	if (!source.startsWith("effect/")) return null;
	const namespace = source.slice("effect/".length).replace(/\.js$/, "");
	return namespace.length > 0 && !namespace.includes("/") ? namespace : null;
}

function isEffectModuleForNamespace(source: string, namespace: string): boolean {
	return source === "effect" || effectModuleNamespace(source) === namespace;
}

function namespaceImportMatches(source: string, allowedNames?: ReadonlySet<string>): boolean {
	if (!isEffectModule(source)) return false;
	const namespace = effectModuleNamespace(source);
	return namespace === null || allowedNames === undefined || allowedNames.has(namespace);
}

function namedImportMatches(
	source: string,
	name: string,
	allowedNames?: ReadonlySet<string>,
): boolean {
	if (!isEffectModule(source)) return false;
	return (
		allowedNames === undefined ||
		(allowedNames.has(name) && isEffectModuleForNamespace(source, name))
	);
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

function isEffectNamespaceImport(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference,
	allowedNames?: ReadonlySet<string>,
): boolean {
	if (typeof sourceCode.getScope !== "function") {
		return sourceCode.ast.body.some(
			(statement) =>
				statement.type === "ImportDeclaration" &&
				isEffectModule(statement.source.value) &&
				statement.specifiers.some(
					(specifier) => {
						if (specifier.local.name !== identifier.name) return false;
						if (specifier.type === "ImportNamespaceSpecifier") {
							return namespaceImportMatches(statement.source.value, allowedNames);
						}
						return (
							specifier.type === "ImportSpecifier" &&
							namedImportMatches(statement.source.value, importedName(specifier), allowedNames)
						);
					}),
		);
	}
	const variable = resolveVariable(sourceCode, identifier);
	return variable !== null &&
		variable.defs.some(
			(definition) => {
				if (definition.type !== "ImportBinding" || definition.parent?.type !== "ImportDeclaration") {
					return false;
				}
				if (definition.node.type === "ImportNamespaceSpecifier") {
					return namespaceImportMatches(definition.parent.source.value, allowedNames);
				}
				return (
					definition.node.type === "ImportSpecifier" &&
					namedImportMatches(definition.parent.source.value, importedName(definition.node), allowedNames)
				);
			},
		);
}

function isEffectNamespaceReference(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	allowedNames?: ReadonlySet<string>,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type === "MemberExpression") {
		const name = memberName(unwrapped);
		return (
			name !== null &&
			(allowedNames === undefined || allowedNames.has(name)) &&
			isEffectNamespaceReference(sourceCode, unwrapped.object, allowedNames, seen)
		);
	}
	if (unwrapped.type !== "Identifier") return false;
	if (isEffectNamespaceImport(sourceCode, unwrapped, allowedNames)) return true;
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || seen.has(variable)) return false;
	const initializer = variableInitializer(variable);
	return initializer !== null && isEffectNamespaceReference(
		sourceCode,
		initializer,
		allowedNames,
		new Set([...seen, variable]),
	);
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
			isEffectNamespaceReference(sourceCode, expression.object, allowedNames)
		);
	}
	if (expression.type !== "Identifier") return false;
	if (typeof sourceCode.getScope !== "function") {
		return sourceCode.ast.body.some(
			(statement) =>
				statement.type === "ImportDeclaration" &&
				statement.specifiers.some((specifier) => {
					if (specifier.local.name !== expression.name) return false;
					if (specifier.type === "ImportNamespaceSpecifier") {
						return namespaceImportMatches(statement.source.value, allowedNames);
					}
					return (
						specifier.type === "ImportSpecifier" &&
						namedImportMatches(
							statement.source.value,
							specifier.imported.type === "Identifier"
								? specifier.imported.name
								: specifier.imported.value,
							allowedNames,
						)
					);
				}),
		);
	}
	const variable = resolveVariable(sourceCode, expression);
	if (variable === null || seen.has(variable)) return false;
	if (
		variable.defs.some((definition) => {
			if (definition.type !== "ImportBinding" || definition.parent?.type !== "ImportDeclaration") {
				return false;
			}
			if (definition.node.type === "ImportNamespaceSpecifier") {
				return namespaceImportMatches(definition.parent.source.value, allowedNames);
			}
			if (definition.node.type !== "ImportSpecifier") return false;
			return namedImportMatches(definition.parent.source.value, importedName(definition.node), allowedNames);
		})
	) return true;
	const initializer = variableInitializer(variable);
	return initializer !== null && isImportedFromEffect(sourceCode, initializer, allowedNames, new Set([...seen, variable]));
}

/** Resolve a known Effect function by its owning public module and exported name. */
export function importedEffectFunctionName(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	owners: ReadonlySet<string>,
	functionNames: ReadonlySet<string>,
	seen: ReadonlySet<Variable> = new Set(),
): string | null {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type === "MemberExpression") {
		const name = memberName(unwrapped);
		return name !== null && functionNames.has(name) &&
			isEffectNamespaceReference(sourceCode, unwrapped.object, owners)
			? name
			: null;
	}
	if (unwrapped.type !== "Identifier") return null;
	if (typeof sourceCode.getScope !== "function") {
		for (const statement of sourceCode.ast.body) {
			if (statement.type !== "ImportDeclaration") continue;
			for (const specifier of statement.specifiers) {
				if (specifier.type !== "ImportSpecifier" || specifier.local.name !== unwrapped.name) continue;
				const imported = importedName(specifier);
				if (functionNames.has(imported) && owners.has(effectModuleNamespace(statement.source.value) ?? "")) {
					return imported;
				}
			}
		}
		return null;
	}
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || seen.has(variable)) return null;
	const nextSeen = new Set([...seen, variable]);
	for (const definition of variable.defs) {
		if (definition.type === "ImportBinding" && definition.parent?.type === "ImportDeclaration" &&
			definition.node.type === "ImportSpecifier") {
			const imported = importedName(definition.node);
			if (functionNames.has(imported) && owners.has(effectModuleNamespace(definition.parent.source.value) ?? "")) {
				return imported;
			}
		}
		if (definition.type !== "Variable" || definition.node.type !== "VariableDeclarator" ||
			definition.parent?.type !== "VariableDeclaration" || definition.parent.kind !== "const") continue;
		const declarator = definition.node;
		if (declarator.id.type === "ObjectPattern") {
			for (const property of declarator.id.properties) {
				if (property.type !== "Property" || property.value.type !== "Identifier" ||
					property.value.name !== unwrapped.name) continue;
				const key = property.computed
					? property.key.type === "Literal" && typeof property.key.value === "string" ? property.key.value : null
					: property.key.type === "Identifier" ? property.key.name : null;
				if (key !== null && functionNames.has(key) && declarator.init !== null &&
					isEffectNamespaceReference(sourceCode, declarator.init, owners)) return key;
			}
		}
	}
	const initializer = variableInitializer(variable);
	return initializer === null ? null :
		importedEffectFunctionName(sourceCode, initializer, owners, functionNames, nextSeen);
}
