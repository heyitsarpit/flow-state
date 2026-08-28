import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect-import.ts";
import { normalizedFilename } from "../../shared/file-scope.ts";

const taggedErrorNames = new Set(["TaggedError", "TaggedErrorClass"]);

function isFlowRewriteSource(filename: string): boolean {
	return normalizedFilename(filename).includes("/packages/flow-state-rewrite/src/");
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

function resolveVariable(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): Variable | null {
	if (typeof sourceCode.getScope !== "function") return null;
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
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
	return definition.node.type === "VariableDeclarator"
		? definition.node.id.type === "Identifier"
			? definition.node.init
			: null
		: null;
}

function isImportedNamespaceAlias(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
	allowedNames: ReadonlySet<string>,
	seen: ReadonlySet<Variable> = new Set(),
): boolean {
	const unwrapped = unwrapExpression(expression);
	if (isImportedFromEffect(sourceCode, unwrapped, allowedNames)) return true;
	if (unwrapped.type !== "Identifier") return false;
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || seen.has(variable)) return false;
	const initializer = variableInitializer(variable);
	return initializer !== null && isImportedNamespaceAlias(sourceCode, initializer, allowedNames, new Set([...seen, variable]));
}

function taggedErrorMember(
	sourceCode: Parameters<typeof isImportedFromEffect>[0],
	expression: ESTree.MemberExpression,
): boolean {
	const name = memberName(expression);
	if (name === null || !taggedErrorNames.has(name)) return false;
	return (
		isImportedNamespaceAlias(sourceCode, expression.object, new Set(["Data"])) ||
		isImportedNamespaceAlias(sourceCode, expression.object, new Set(["Schema"]))
	);
}

function isTaggedErrorReceiver(sourceCode: SourceCode, expression: ESTree.Expression): boolean {
	const unwrapped = unwrapExpression(expression);
	return isImportedNamespaceAlias(sourceCode, unwrapped, new Set(["Data", "Schema"]));
}

function isDestructuredTaggedErrorAlias(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference,
): boolean {
	const variable = resolveVariable(sourceCode, identifier);
	if (variable === null || variable.defs.length !== 1) return false;
	const definition = variable.defs[0];
	if (definition?.type !== "Variable" || definition.node.type !== "VariableDeclarator") return false;
	const declarator = definition.node;
	if (declarator.id.type !== "ObjectPattern" || declarator.init === null) return false;
	const initializer = declarator.init;
	return declarator.id.properties.some((property) => {
		if (property.type !== "Property" || property.value.type !== "Identifier") return false;
		if (property.value.name !== identifier.name) return false;
		const key = property.computed
			? property.key.type === "Literal" && typeof property.key.value === "string"
				? property.key.value
				: null
			: property.key.type === "Identifier"
				? property.key.name
				: null;
		return key !== null && taggedErrorNames.has(key) && isTaggedErrorReceiver(sourceCode, initializer);
	});
}

function isCanonicalDiagnostic(
	filename: string,
	sourceCode: Parameters<typeof isImportedFromEffect>[0],
	node: ESTree.MemberExpression,
): boolean {
	if (!normalizedFilename(filename).endsWith("/packages/flow-state-rewrite/src/diagnostic/diagnostic.ts")) {
		return false;
	}
	let child: ESTree.Node = node;
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== "ClassDeclaration" && current.type !== "ClassExpression") {
		child = current;
		current = current.parent;
	}
	if (current === null || current.id?.type !== "Identifier" || current.id.name !== "Diagnostic") return false;
	return current.superClass === child && isImportedNamespaceAlias(sourceCode, node.object, new Set(["Schema"]));
}

function isErrorSuperclass(node: ESTree.Class): boolean {
	return node.superClass?.type === "Identifier" && node.superClass.name === "Error";
}

/** Require every rewrite failure to use the package-owned Diagnostic union. */
export const noParallelDiagnosticErrorsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow parallel Flow State error classes and tagged-error constructors outside the canonical Diagnostic owner.",
		},
		messages: {
			parallel:
				"Do not define another Flow State error type. Use Diagnostic; add a diagnostic code and owned projector when a new failure needs representation.",
		},
	},
	createOnce(context) {
		return {
			MemberExpression(node: ESTree.MemberExpression) {
				if (
					isFlowRewriteSource(context.filename) &&
					taggedErrorMember(context.sourceCode, node) &&
					!isCanonicalDiagnostic(context.filename, context.sourceCode, node)
				) {
					context.report({ node, messageId: "parallel" });
				}
			},
			CallExpression(node: ESTree.CallExpression) {
				if (
					isFlowRewriteSource(context.filename) &&
					node.callee.type === "Identifier" &&
					isDestructuredTaggedErrorAlias(context.sourceCode, node.callee)
				) {
					context.report({ node, messageId: "parallel" });
				}
			},
			ClassDeclaration(node: ESTree.Class) {
				if (isFlowRewriteSource(context.filename) && isErrorSuperclass(node)) {
					context.report({ node: node.superClass ?? node, messageId: "parallel" });
				}
			},
			ClassExpression(node: ESTree.Class) {
				if (isFlowRewriteSource(context.filename) && isErrorSuperclass(node)) {
					context.report({ node: node.superClass ?? node, messageId: "parallel" });
				}
			},
		};
	},
});
