import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect/effect-import.ts";
import { isExplicitUnsafeMethod, memberName, unwrapExpression } from "../../shared/effect/effect-call.ts";
import { isTestFile } from "../../shared/file-scope.ts";

function resolveVariable(sourceCode: SourceCode, identifier: ESTree.IdentifierReference): Variable | null {
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
	}
	return null;
}

function isUnsafeCallableReference(
	sourceCode: SourceCode,
	node: ESTree.Expression,
	seen: ReadonlySet<Variable> = new Set<Variable>(),
): boolean {
	const value = unwrapExpression(node);
	if (value.type === "ArrowFunctionExpression" || value.type === "FunctionExpression") {
		return value.body !== null && containsStatefulExpression(sourceCode, value.body, seen);
	}
	if (value.type !== "Identifier") {
		return value.type === "MemberExpression" && isExplicitUnsafeMethod(value);
	}
	const variable = resolveVariable(sourceCode, value);
	if (variable === null || seen.has(variable) || variable.defs.length !== 1) return false;
	const nextSeen = new Set(seen).add(variable);
	const definition = variable.defs[0];
	if (
		definition?.type === "Variable" &&
		definition.node.type === "VariableDeclarator" &&
		definition.parent?.type === "VariableDeclaration" &&
		definition.parent.kind === "const" &&
		definition.node.init !== null
	) {
		return isUnsafeCallableReference(sourceCode, definition.node.init, nextSeen);
	}
	if (definition?.type === "FunctionName" && definition.node.type === "FunctionDeclaration") {
		if (definition.node.body === null) return false;
		return containsStatefulExpression(sourceCode, definition.node.body, nextSeen);
	}
	return false;
}

function containsStatefulExpression(
	sourceCode: SourceCode,
	node: ESTree.Node,
	seen: ReadonlySet<Variable> = new Set<Variable>(),
): boolean {
	if (node.type === "AssignmentExpression" || node.type === "UpdateExpression") return true;
	if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") return false;
	if (node.type === "CallExpression") {
		const callee = unwrapExpression(node.callee);
		if (callee.type === "MemberExpression") {
			if (isExplicitUnsafeMethod(callee)) return true;
		}
		if (callee.type === "Identifier" && isUnsafeCallableReference(sourceCode, callee, seen)) return true;
	}
	for (const [key, value] of Object.entries(node)) {
		if (key === "parent" || key === "loc" || key === "range" || key === "tokens" || key === "comments") continue;
		if (Array.isArray(value)) {
			if (value.some((child) => child !== null && typeof child === "object" && "type" in child &&
				containsStatefulExpression(sourceCode, child as ESTree.Node, seen))) return true;
		} else if (value !== null && typeof value === "object" && "type" in value &&
			containsStatefulExpression(sourceCode, value as ESTree.Node, seen)) {
			return true;
		}
	}
	return false;
}

/** Keep Effect.succeed value construction pure; use Effect.sync for eager stateful work. */
export const noEagerStatefulEffectSucceedRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Review explicitly unsafe calls and assignments passed to Effect.succeed; syntax cannot establish whether a value is stateful.",
		},
		messages: {
			eager:
				"Review this eager value construction. If it performs owner stateful work, move it into Effect.sync or use the native Effect operation so construction stays inert.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				if (isTestFile(context.filename)) return;
				const callee = unwrapExpression(node.callee);
				if (callee.type !== "MemberExpression" || memberName(callee) !== "succeed" ||
					!isImportedFromEffect(context.sourceCode, callee.object, new Set(["Effect"]))) return;
				const value = node.arguments[0];
				if (value !== undefined && value.type !== "SpreadElement" && containsStatefulExpression(context.sourceCode, value)) {
					context.report({ node: value, messageId: "eager" });
				}
			},
		};
	},
});
