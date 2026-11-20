import { defineRule } from "@oxlint/plugins";

import { resolveVariable as resolveLexicalVariable } from "../../shared/scope.ts";

import type { ESTree, Reference, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { importedEffectFunctionName } from "../../shared/effect/effect-import.ts";

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
	return resolveLexicalVariable(sourceCode, identifier);
}

function sameReference(
	sourceCode: SourceCode,
	left: ESTree.IdentifierReference,
	right: ESTree.IdentifierReference,
): boolean {
	const leftIdentity = referenceIdentity(sourceCode, left);
	const rightIdentity = referenceIdentity(sourceCode, right);
	if (leftIdentity !== null || rightIdentity !== null) {
		if (leftIdentity === null || rightIdentity === null || leftIdentity.kind !== rightIdentity.kind) {
			return false;
		}
		if (leftIdentity.kind === "unknown") return false;
		if (leftIdentity.kind === "variable" && rightIdentity.kind === "variable") {
			return leftIdentity.variable === rightIdentity.variable;
		}
		if (leftIdentity.kind === "write" && rightIdentity.kind === "write") {
			return leftIdentity.reference === rightIdentity.reference;
		}
		return false;
	}
	return left.name === right.name;
}

type ReferenceIdentity =
	| { readonly kind: "variable"; readonly variable: Variable }
	| { readonly kind: "write"; readonly reference: Reference }
	| { readonly kind: "unknown" };

function enclosingFunctionScope(scope: Scope | null): Scope | null {
	while (scope !== null && scope.type !== "function") scope = scope.upper;
	return scope;
}

function isAncestorFunction(ancestor: Scope | null, descendant: Scope | null): boolean {
	if (ancestor === null) return true;
	let scope = descendant;
	while (scope !== null) {
		if (scope === ancestor) return true;
		scope = scope.upper;
	}
	return false;
}

function isConditionallyExecuted(identifier: ESTree.Node): boolean {
	let current: ESTree.Node = identifier;
	while (current.parent !== null) {
		const parent: ESTree.Node = current.parent;
		if (
			parent.type === "IfStatement" && (parent.consequent === current || parent.alternate === current) ||
			parent.type === "ConditionalExpression" && (parent.consequent === current || parent.alternate === current) ||
			parent.type === "LogicalExpression" && parent.right === current ||
			parent.type === "SwitchCase" ||
			parent.type === "ForStatement" || parent.type === "ForInStatement" || parent.type === "ForOfStatement" ||
			parent.type === "WhileStatement" || parent.type === "DoWhileStatement" ||
			parent.type === "TryStatement" || parent.type === "CatchClause"
		) return true;
		if (parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" || parent.type === "ArrowFunctionExpression") {
			return false;
		}
		current = parent;
	}
	return false;
}

function writesBefore(
	sourceCode: SourceCode,
	variable: Variable,
	identifier: ESTree.IdentifierReference,
) {
	const useFunction = enclosingFunctionScope(sourceCode.getScope(identifier));
	let definite: Reference | null = null;
	let uncertain = false;
	const references = variable.references
		.filter((reference) => reference.isWrite() && reference.identifier.start <= identifier.start)
		.sort((left, right) => left.identifier.start - right.identifier.start);
	for (const reference of references) {
		const writeFunction = enclosingFunctionScope(reference.from);
		if (!isAncestorFunction(writeFunction, useFunction)) continue;
		if (isConditionallyExecuted(reference.identifier)) {
			uncertain = true;
		} else {
			definite = reference;
			uncertain = false;
		}
	}
	return { definite, uncertain };
}

function assignedIdentifierValue(reference: Reference): ESTree.Expression | null {
	const identifier = reference.identifier;
	if (reference.init && identifier.parent?.type === "VariableDeclarator" && identifier.parent.id === identifier) {
		return identifier.parent.init;
	}
	if (
		!reference.init && identifier.parent?.type === "AssignmentExpression" &&
		identifier.parent.left === identifier
	) return identifier.parent.right;
	return null;
}

function referenceIdentity(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference,
	seen: ReadonlySet<Variable> = new Set(),
): ReferenceIdentity | null {
	const variable = resolveVariable(sourceCode, identifier);
	if (variable === null) return null;
	if (seen.has(variable)) return { kind: "variable", variable };
	const writes = writesBefore(sourceCode, variable, identifier);
	if (writes.uncertain) return { kind: "unknown" };
	const write = writes.definite;
	if (write === null) return { kind: "variable", variable };
	const value = assignedIdentifierValue(write);
	if (value === null) return { kind: "write", reference: write };
	const initializer = unwrapExpression(value);
	if (initializer.type !== "Identifier") return { kind: "write", reference: write };
	return referenceIdentity(sourceCode, initializer, new Set([...seen, variable]));
}

function referenceIdentifier(argument: ESTree.Expression | ESTree.SpreadElement): ESTree.IdentifierReference | null {
	if (argument.type === "SpreadElement") return null;
	const expression = unwrapExpression(argument);
	return expression.type === "Identifier" ? expression : null;
}

function refOperation(sourceCode: SourceCode, node: ESTree.CallExpression): RefOperation | null {
	const argument = node.arguments[0];
	if (argument === undefined) return null;
	const callee = unwrapExpression(node.callee);
	if (callee.type === "CallExpression" && callee.arguments.length === 1 && node.arguments.length === 1 &&
		importedEffectFunctionName(sourceCode, callee.callee, new Set(["Ref"]), new Set(["set"])) === "set") {
		const reference = referenceIdentifier(argument);
		return reference === null ? null : { method: "set", reference };
	}
	const method = importedEffectFunctionName(sourceCode, node.callee, new Set(["Ref"]), new Set(["get", "set"]));
	if (method !== "get" && method !== "set") return null;
	if (node.arguments.length !== (method === "get" ? 1 : 2)) return null;
	const reference = referenceIdentifier(argument);
	return reference === null ? null : { method, reference };
}

function exclusiveBranches(left: ESTree.Node, right: ESTree.Node): boolean {
	const branches = new Map<ESTree.Node, ESTree.Node>();
	let current = left;
	while (current.parent !== null) {
		const parent = current.parent;
		if ((parent.type === "IfStatement" || parent.type === "ConditionalExpression") &&
			(parent.consequent === current || parent.alternate === current)) branches.set(parent, current);
		current = parent;
	}
	current = right;
	while (current.parent !== null) {
		const parent = current.parent;
		if ((parent.type === "IfStatement" || parent.type === "ConditionalExpression") &&
			(parent.consequent === current || parent.alternate === current)) {
			const leftBranch = branches.get(parent);
			if (leftBranch !== undefined && leftBranch !== current) return true;
		}
		current = parent;
	}
	return false;
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
				"This Ref.set follows a separate Ref.get on the same Ref. If the decision depends on that read, publish it atomically with Ref.update for a state-only transition or Ref.modify when returning a result. Keep external effects outside the transition; preserve any intentional separate observations or existing synchronization.",
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
						!exclusiveBranches(reference, operation.reference) &&
							sameReference(context.sourceCode, reference, operation.reference),
					)
				) {
					context.report({ node, messageId: "readThenWrite" });
				}
			},
		};
	},
});
