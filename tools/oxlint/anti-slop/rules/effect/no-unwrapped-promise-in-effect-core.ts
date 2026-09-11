import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect/effect-import.ts";
import { getEffectPromiseCall } from "../../shared/effect/effect-promise.ts";
import { isTestSupportFile, normalizedFilename } from "../../shared/file-scope.ts";

const adapterNames = new Set(["async", "promise", "tryPromise"]);
const allowedPathFragments = ["/src/cli/", "/src/host/", "/src/react/", "/src/server/", "/src/testing/"] as const;
const allowedFiles = ["src/inspect.ts", "src/react-entry.ts", "src/server.ts"] as const;

function isAllowedBoundary(filename: string): boolean {
	const normalized = normalizedFilename(filename);
	const matchesFile = (file: string) => normalized.endsWith(`/${file}`);
	return (
		isTestSupportFile(filename) ||
		allowedPathFragments.some((fragment) => normalized.includes(fragment)) ||
		allowedFiles.some(matchesFile) ||
		normalized.endsWith("/src/core/inspection/trace-artifact.ts") ||
		normalized.endsWith("/src/core/scheduling/ready-work.ts")
	);
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

function isNamedEffectMethod(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference,
	method: string,
): boolean {
	const variable = resolveVariable(sourceCode, identifier);
	return variable !== null && variable.defs.some((definition) =>
		definition.type === "ImportBinding" &&
		definition.parent?.type === "ImportDeclaration" &&
		(definition.parent.source.value === "effect" ||
			definition.parent.source.value === "effect/Effect" ||
			definition.parent.source.value === "effect/Effect.js") &&
		definition.node.type === "ImportSpecifier" &&
		(definition.node.imported.type === "Identifier"
			? definition.node.imported.name
			: definition.node.imported.value) === method,
	);
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
	) return null;
	return definition.node.id.type === "Identifier" ? definition.node.init : null;
}

function staticMemberName(expression: ESTree.MemberExpression): string | null {
	if (!expression.computed && expression.property.type === "Identifier") return expression.property.name;
	if (expression.computed && expression.property.type === "Literal" && typeof expression.property.value === "string") {
		return expression.property.value;
	}
	return null;
}

function isStableEffectAsyncReference(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	if (expression.type === "MemberExpression") {
		return staticMemberName(expression) === "async" &&
			isImportedFromEffect(sourceCode, expression.object, new Set(["Effect"]));
	}
	if (expression.type !== "Identifier") return false;
	if (isNamedEffectMethod(sourceCode, expression, "async")) return true;
	const variable = resolveVariable(sourceCode, expression);
	if (variable === null || seen.has(variable)) return false;
	const initializer = variableInitializer(variable);
	return initializer !== null &&
		isStableEffectAsyncReference(sourceCode, initializer, new Set([...seen, variable]));
}

function effectAdapterMethodName(node: ESTree.CallExpression): string | null {
	const callee = node.callee;
	if (callee.type !== "MemberExpression") return null;
	return staticMemberName(callee);
}

function isEffectAdapterCall(sourceCode: SourceCode, node: ESTree.Node): boolean {
	if (node.type !== "CallExpression") return false;
	if (getEffectPromiseCall(sourceCode, node) !== null) return true;
	const callee = node.callee;
	if (callee.type === "Identifier") return isStableEffectAsyncReference(sourceCode, callee);
	if (callee.type !== "MemberExpression") return false;
	const method = effectAdapterMethodName(node);
	return method !== null && adapterNames.has(method) &&
		isStableEffectAsyncReference(sourceCode, callee);
}

function isInsideEffectAdapter(sourceCode: Parameters<typeof isImportedFromEffect>[0], node: ESTree.Node): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (isEffectAdapterCall(sourceCode, current)) return true;
		current = current.parent;
	}
	return false;
}

function isGlobalPromise(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): boolean {
	if (typeof sourceCode.getScope !== "function") return identifier.name === "Promise";
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable.defs.length === 0;
		scope = scope.upper;
	}
	return true;
}

function memberName(expression: ESTree.MemberExpression): string | null {
	if (!expression.computed && expression.property.type === "Identifier") return expression.property.name;
	if (expression.computed && expression.property.type === "Literal" && typeof expression.property.value === "string") {
		return expression.property.value;
	}
	return null;
}

function isStablePromiseReference(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	if (expression.type !== "Identifier") return false;
	if (expression.name === "Promise" && isGlobalPromise(sourceCode, expression)) return true;
	const variable = resolveVariable(sourceCode, expression);
	if (variable === null || seen.has(variable) || variable.defs.length !== 1) return false;
	const definition = variable.defs[0];
	if (
		definition?.type !== "Variable" ||
		definition.node.type !== "VariableDeclarator" ||
		definition.parent?.type !== "VariableDeclaration" ||
		definition.parent.kind !== "const" ||
		definition.node.init === null
	) return false;
	return isStablePromiseReference(sourceCode, definition.node.init, new Set([...seen, variable]));
}

function isPromiseCall(sourceCode: SourceCode, callee: ESTree.Expression): boolean {
	return (
		callee.type === "MemberExpression" &&
		isStablePromiseReference(sourceCode, callee.object) &&
		["all", "allSettled", "any", "race", "reject", "resolve"].includes(memberName(callee) ?? "")
	);
}

/** Keep foreign Promise construction inside an explicit Effect adapter. */
export const noUnwrappedPromiseInEffectCoreRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow unwrapped Promise construction in Effect core; normalize foreign async work at the adapter boundary.",
		},
		messages: {
			promise:
				"This Promise escapes the Effect adapter boundary. Use object-form Effect.tryPromise in the named foreign adapter or Effect.async, or move the host conversion outward.",
		},
	},
	createOnce(context) {
		let allowedBoundary = false;
		let effectFile = false;

		const reportIfUnwrapped = (node: ESTree.Node) => {
			if (allowedBoundary || !effectFile) return;
			if (!isInsideEffectAdapter(context.sourceCode, node)) context.report({ node, messageId: "promise" });
		};

		return {
			Program(node: ESTree.Program) {
				allowedBoundary = isAllowedBoundary(context.filename);
				effectFile = node.body.some(
					(statement) =>
						statement.type === "ImportDeclaration" &&
						statement.importKind !== "type" &&
						(statement.specifiers.length === 0 ||
							statement.specifiers.some(
								(specifier) => specifier.type !== "ImportSpecifier" || specifier.importKind !== "type",
							)) &&
						(statement.source.value === "effect" || statement.source.value.startsWith("effect/")),
				);
			},
			NewExpression(node: ESTree.NewExpression) {
				if (
					node.callee.type === "Identifier" &&
					node.callee.name === "Promise" &&
					isGlobalPromise(context.sourceCode, node.callee)
				) {
					reportIfUnwrapped(node);
				}
			},
			CallExpression(node: ESTree.CallExpression) {
				if (isPromiseCall(context.sourceCode, node.callee)) reportIfUnwrapped(node);
			},
		};
	},
});
