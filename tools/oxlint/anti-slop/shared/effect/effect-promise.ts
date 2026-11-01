import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isImportedFromEffect } from "./effect-import.ts";

export type EffectPromiseMethod = "promise" | "tryPromise";

export type EffectPromiseWrapper = "call" | "apply" | "bind" | null;

export interface EffectPromiseCall {
	readonly method: EffectPromiseMethod;
	readonly wrapper: EffectPromiseWrapper;
	readonly argument: ESTree.Expression | ESTree.SpreadElement | undefined;
}

function resolveVariable(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): Variable | null {
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
	}
	return null;
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

function effectPromiseModule(source: string): boolean {
	return source === "effect" || source === "effect/Effect" || source === "effect/Effect.js";
}

function importedName(node: ESTree.ImportSpecifier): string {
	return node.imported.type === "Identifier" ? node.imported.name : node.imported.value;
}

function isNamedEffectPromiseImport(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference,
	method: EffectPromiseMethod,
): boolean {
	const matches = (statement: ESTree.Program["body"][number]): boolean =>
		statement.type === "ImportDeclaration" &&
		effectPromiseModule(statement.source.value) &&
		statement.specifiers.some(
			(specifier) =>
				specifier.local.name === identifier.name &&
				specifier.type === "ImportSpecifier" &&
				importedName(specifier) === method,
		);

	if (typeof sourceCode.getScope !== "function") return sourceCode.ast.body.some(matches);
	const variable = resolveVariable(sourceCode, identifier);
	return variable !== null && variable.defs.some(
		(definition) =>
			definition.type === "ImportBinding" &&
			definition.parent?.type === "ImportDeclaration" &&
			effectPromiseModule(definition.parent.source.value) &&
			definition.node.type === "ImportSpecifier" &&
			importedName(definition.node) === method,
	);
}

function isEffectPromiseReference(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	method: EffectPromiseMethod,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type === "MemberExpression") {
		return memberName(unwrapped) === method &&
			isImportedFromEffect(sourceCode, unwrapped.object, new Set(["Effect"]));
	}
	if (unwrapped.type !== "Identifier") return false;
	if (isNamedEffectPromiseImport(sourceCode, unwrapped, method)) return true;
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || seen.has(variable)) return false;
	const initializer = variableInitializer(variable);
	return initializer !== null && isEffectPromiseReference(
		sourceCode,
		initializer,
		method,
		new Set([...seen, variable]),
	);
}

function unwrapExpression(expression: ESTree.Expression | ESTree.SpreadElement): ESTree.Expression | ESTree.SpreadElement {
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

function memberName(expression: ESTree.MemberExpression): string | null {
	if (!expression.computed && expression.property.type === "Identifier") return expression.property.name;
	if (!expression.computed) return null;
	if (expression.property.type === "Literal" && typeof expression.property.value === "string") {
		return expression.property.value;
	}
	return expression.property.type === "TemplateLiteral" && expression.property.expressions.length === 0 && expression.property.quasis.length === 1
		? expression.property.quasis[0]?.value.cooked ?? expression.property.quasis[0]?.value.raw ?? null
		: null;
}

function effectPromiseMethod(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
): EffectPromiseMethod | null {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type === "MemberExpression") {
		const name = memberName(unwrapped);
		if (
			(name === "promise" || name === "tryPromise") &&
			isImportedFromEffect(sourceCode, unwrapped.object, new Set(["Effect"]))
		) {
			return name;
		}
		if (name === "call" || name === "apply" || name === "bind") {
			return effectPromiseMethod(sourceCode, unwrapped.object);
		}
	}
	if (unwrapped.type === "CallExpression") {
		const inner = unwrapExpression(unwrapped.callee);
		if (inner.type === "MemberExpression" && memberName(inner) === "bind") {
			return effectPromiseMethod(sourceCode, inner.object);
		}
	}
	if (unwrapped.type === "Identifier") {
		if (isEffectPromiseReference(sourceCode, unwrapped, "promise")) return "promise";
		if (isEffectPromiseReference(sourceCode, unwrapped, "tryPromise")) return "tryPromise";
	}
	return null;
}

function promiseWrapper(expression: ESTree.Expression): EffectPromiseWrapper {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type === "MemberExpression") {
		const name = memberName(unwrapped);
		return name === "call" || name === "apply" || name === "bind" ? name : null;
	}
	if (unwrapped.type === "CallExpression") {
		const inner = unwrapExpression(unwrapped.callee);
		return inner.type === "MemberExpression" && memberName(inner) === "bind" ? "bind" : null;
	}
	return null;
}

function promiseArgument(node: ESTree.CallExpression, wrapper: EffectPromiseWrapper): ESTree.Expression | ESTree.SpreadElement | undefined {
	if (wrapper === "call") return node.arguments[1];
	if (wrapper === "apply") {
		const argumentsArray = node.arguments[1];
		return argumentsArray?.type === "ArrayExpression" && argumentsArray.elements.length === 1
			? argumentsArray.elements[0] ?? undefined
			: undefined;
	}
	return node.arguments[0];
}

export function getEffectPromiseCall(sourceCode: SourceCode, node: ESTree.CallExpression): EffectPromiseCall | null {
	const wrapper = promiseWrapper(node.callee);
	const method = effectPromiseMethod(sourceCode, node.callee);
	if (method === null) return null;
	// Calling bind creates a new function; the outer call is the actual Effect API invocation.
	if (wrapper === "bind" && unwrapExpression(node.callee).type === "MemberExpression") return null;
	return { method, wrapper, argument: promiseArgument(node, wrapper) };
}
