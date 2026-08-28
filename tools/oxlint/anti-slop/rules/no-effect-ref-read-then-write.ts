import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";

type RefOperation = { readonly method: "get" | "set"; readonly reference: ESTree.IdentifierReference };

type FunctionState = { readonly reads: ESTree.IdentifierReference[] };

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSSatisfiesExpression" ||
		current.type === "TSTypeAssertion" ||
		current.type === "TSNonNullExpression"
	) {
		current = current.expression;
	}
	return current;
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

function sameReference(
	sourceCode: SourceCode,
	left: ESTree.IdentifierReference,
	right: ESTree.IdentifierReference,
): boolean {
	if (left.name !== right.name) return false;
	const leftVariable = resolveVariable(sourceCode, left);
	const rightVariable = resolveVariable(sourceCode, right);
	if (leftVariable !== null || rightVariable !== null) return leftVariable === rightVariable;
	return true;
}

function isImportedRefNamespace(sourceCode: SourceCode, expression: ESTree.Expression): boolean {
	if (expression.type === "Identifier") {
		return isImportedFromEffect(sourceCode, expression, new Set(["Ref"]));
	}
	if (expression.type !== "MemberExpression") return false;
	const property = expression.computed
		? expression.property.type === "Literal" && typeof expression.property.value === "string"
			? expression.property.value
			: null
		: expression.property.type === "Identifier"
			? expression.property.name
			: null;
	return (
		expression.object.type === "Identifier" &&
		property === "Ref" &&
		isImportedFromEffect(sourceCode, expression.object, new Set(["Ref"]))
	);
}

function referenceIdentifier(argument: ESTree.Expression | ESTree.SpreadElement): ESTree.IdentifierReference | null {
	if (argument.type === "SpreadElement") return null;
	const expression = unwrapExpression(argument);
	return expression.type === "Identifier" ? expression : null;
}

function refOperation(sourceCode: SourceCode, node: ESTree.CallExpression): RefOperation | null {
	if (
		node.callee.type !== "MemberExpression" ||
		!isImportedRefNamespace(sourceCode, node.callee.object) ||
		node.arguments.length === 0
	) {
		return null;
	}
	const method = node.callee.computed
		? node.callee.property.type === "Literal" && typeof node.callee.property.value === "string"
			? node.callee.property.value
			: null
		: node.callee.property.type === "Identifier"
			? node.callee.property.name
			: null;
	if (method === null) return null;
	if (method !== "get" && method !== "set") return null;
	const reference = referenceIdentifier(node.arguments[0]);
	return reference === null ? null : { method, reference };
}

/** Prefer one atomic Ref transition over a stale read followed by a write. */
export const noEffectRefReadThenWriteRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow Effect Ref.get followed by Ref.set on the same Ref inside one function or method body.",
		},
		messages: {
			readThenWrite:
				"This Ref.set follows a separate Ref.get on the same Ref. Use Ref.modify or Ref.update for an atomic transition.",
		},
	},
	createOnce(context) {
		const functions: FunctionState[] = [];
		const enterFunction = () => functions.push({ reads: [] });
		const exitFunction = () => {
			functions.pop();
		};

		return {
			FunctionDeclaration: enterFunction,
			"FunctionDeclaration:exit": exitFunction,
			FunctionExpression: enterFunction,
			"FunctionExpression:exit": exitFunction,
			ArrowFunctionExpression: enterFunction,
			"ArrowFunctionExpression:exit": exitFunction,
			"CallExpression:exit"(node: ESTree.CallExpression) {
				const state = functions.at(-1);
				if (state === undefined) return;
				const operation = refOperation(context.sourceCode, node);
				if (operation === null) return;
				if (operation.method === "get") {
					state.reads.push(operation.reference);
					return;
				}
				if (
					state.reads.some((reference) =>
						sameReference(context.sourceCode, reference, operation.reference),
					)
				) {
					context.report({ node, messageId: "readThenWrite" });
				}
			},
		};
	},
});
