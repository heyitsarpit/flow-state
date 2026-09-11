import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect/effect-import.ts";
import { isExplicitUnsafeMethod, memberName, unwrapExpression } from "../../shared/effect/effect-call.ts";
import { isTestFile } from "../../shared/file-scope.ts";

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

type FunctionState = {
	readonly node: FunctionNode;
	readonly effectReturning: boolean;
	readonly lazyCallback: boolean;
};

function isEffectType(sourceCode: SourceCode, type: ESTree.TSType): boolean {
	if (type.type === "TSParenthesizedType") return isEffectType(sourceCode, type.typeAnnotation);
	if (type.type !== "TSTypeReference") return false;
	return type.typeName.type === "Identifier"
		? isImportedFromEffect(sourceCode, type.typeName, new Set(["Effect"]))
		: type.typeName.type === "TSQualifiedName" &&
			type.typeName.right.name === "Effect" &&
			type.typeName.left.type === "Identifier" &&
			isImportedFromEffect(sourceCode, type.typeName.left, new Set(["Effect"]));
}

function isEffectCall(sourceCode: SourceCode, expression: ESTree.Expression): boolean {
	const value = unwrapExpression(expression);
	if (value.type !== "CallExpression") return false;
	const callee = unwrapExpression(value.callee);
	if (callee.type !== "MemberExpression") return false;
	return isImportedFromEffect(sourceCode, callee.object, new Set(["Effect", "Deferred", "Queue", "Scope"]));
}

function isEffectReturningExpression(sourceCode: SourceCode, expression: ESTree.Expression, seen = new Set<ESTree.Node>()): boolean {
	const value = unwrapExpression(expression);
	if (seen.has(value)) return false;
	seen.add(value);
	if (isEffectCall(sourceCode, value)) return true;
	if (value.type === "MemberExpression" && isImportedFromEffect(sourceCode, value.object, new Set(["Effect"]))) return true;
	if (value.type !== "ArrowFunctionExpression" && value.type !== "FunctionExpression") return false;
	if (value.body === null) return false;
	if (value.returnType !== null && value.returnType !== undefined && isEffectType(sourceCode, value.returnType.typeAnnotation)) {
		return true;
	}
	if (value.body.type !== "BlockStatement") return isEffectReturningExpression(sourceCode, value.body, seen);
	return value.body.body.some(
		(statement) => statement.type === "ReturnStatement" && statement.argument !== null &&
			isEffectReturningExpression(sourceCode, statement.argument, seen),
	);
}

function isEffectReturningFunction(sourceCode: SourceCode, node: FunctionNode): boolean {
	if (node.returnType !== null && node.returnType !== undefined && isEffectType(sourceCode, node.returnType.typeAnnotation)) {
		return true;
	}
	if (node.body === null) return false;
	if (node.body.type !== "BlockStatement") return isEffectReturningExpression(sourceCode, node.body);
	return node.body.body.some(
		(statement) => statement.type === "ReturnStatement" && statement.argument !== null &&
		isEffectReturningExpression(sourceCode, statement.argument),
	);
}

function isLazyEffectCallback(sourceCode: SourceCode, node: FunctionNode): boolean {
	let parent: ESTree.Node = node.parent;
	while (
		parent.type === "ParenthesizedExpression" ||
		parent.type === "TSAsExpression" ||
		parent.type === "TSSatisfiesExpression" ||
		parent.type === "TSNonNullExpression" ||
		parent.type === "TSInstantiationExpression"
	) {
		parent = parent.parent;
	}
	if (parent.type !== "CallExpression") return false;
	const callee = unwrapExpression(parent.callee);
	return callee.type === "MemberExpression" &&
		isImportedFromEffect(sourceCode, callee.object, new Set(["Effect"])) &&
		memberName(callee) !== null;
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

function rootIdentifier(expression: ESTree.Expression): ESTree.IdentifierReference | null {
	let current = unwrapExpression(expression);
	while (current.type === "MemberExpression") {
		current = unwrapExpression(current.object);
	}
	return current.type === "Identifier" ? current : null;
}

function isCaptured(sourceCode: SourceCode, expression: ESTree.Expression, state: FunctionState): boolean {
	const identifier = rootIdentifier(expression);
	if (identifier === null) return false;
	const variable = resolveVariable(sourceCode, identifier);
	if (variable === null) return true;
	const functionScope = sourceCode.getScope(state.node);
	// This is intentionally a review signal: the rule cannot prove that a local
	// mutable cell is private to the returned Effect, so report the mutation for
	// owner review instead of silently treating scope shape as semantic proof.
	return variable.scope !== functionScope;
}

function isMutatingCall(sourceCode: SourceCode, node: ESTree.CallExpression, state: FunctionState): boolean {
	const callee = unwrapExpression(node.callee);
	if (callee.type === "MemberExpression") {
		const method = memberName(callee);
		if (method !== null && isExplicitUnsafeMethod(callee)) {
			return isCaptured(sourceCode, callee.object, state) || method.endsWith("Unsafe");
		}
		if (method === "make" && isImportedFromEffect(sourceCode, callee.object, new Set(["Deferred", "Scope"]))) {
			return true;
		}
	}
	return false;
}

function isInsideEffectSucceed(sourceCode: SourceCode, node: ESTree.Node): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (current.type === "CallExpression") {
			const callee = unwrapExpression(current.callee);
			return callee.type === "MemberExpression" && memberName(callee) === "succeed" &&
				isImportedFromEffect(sourceCode, callee.object, new Set(["Effect"]));
		}
		current = current.parent;
	}
	return false;
}

/** Review captured assignments and explicitly unsafe calls made while constructing an Effect. */
export const noStatefulEffectConstructionRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Review captured assignments and explicitly unsafe API calls made while constructing an Effect-returning function; syntax cannot prove owner semantics.",
		},
		messages: {
			construction:
				"Review this construction-time captured mutation or explicitly unsafe call. If it is an owner claim, reservation, or cancellation, move it into Effect.suspend/Effect.sync or another executed Effect callback.",
		},
	},
	createOnce(context) {
		const functions: FunctionState[] = [];
		const enterFunction = (node: FunctionNode) => {
			functions.push({
				node,
				effectReturning: isEffectReturningFunction(context.sourceCode, node),
				lazyCallback: isLazyEffectCallback(context.sourceCode, node),
			});
		};
		const exitFunction = () => {
			functions.pop();
		};
		const reportIfConstruction = (node: ESTree.Node, captured: boolean) => {
			const state = functions.at(-1);
			if (state === undefined || !state.effectReturning || state.lazyCallback || !captured) return;
			context.report({ node, messageId: "construction" });
		};

		return {
			ArrowFunctionExpression: enterFunction,
			"ArrowFunctionExpression:exit": exitFunction,
			FunctionExpression: enterFunction,
			"FunctionExpression:exit": exitFunction,
			FunctionDeclaration: enterFunction,
			"FunctionDeclaration:exit": exitFunction,
			AssignmentExpression(node: ESTree.AssignmentExpression) {
				if (isTestFile(context.filename)) return;
				const state = functions.at(-1);
				if (state !== undefined) reportIfConstruction(node, isCaptured(context.sourceCode, node.left as ESTree.Expression, state));
			},
			UpdateExpression(node: ESTree.UpdateExpression) {
				if (isTestFile(context.filename)) return;
				const state = functions.at(-1);
				if (state !== undefined) reportIfConstruction(node, isCaptured(context.sourceCode, node.argument as ESTree.Expression, state));
			},
			CallExpression(node: ESTree.CallExpression) {
				if (isTestFile(context.filename)) return;
				const state = functions.at(-1);
				if (state !== undefined && state.effectReturning && !state.lazyCallback && !isInsideEffectSucceed(context.sourceCode, node) && isMutatingCall(context.sourceCode, node, state)) {
					context.report({ node, messageId: "construction" });
				}
			},
		};
	},
});
