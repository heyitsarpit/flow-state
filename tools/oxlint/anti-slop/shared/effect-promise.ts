import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "./effect-import.ts";

export type EffectPromiseMethod = "promise" | "tryPromise";

export type EffectPromiseWrapper = "call" | "apply" | "bind" | null;

export interface EffectPromiseCall {
	readonly method: EffectPromiseMethod;
	readonly wrapper: EffectPromiseWrapper;
	readonly argument: ESTree.Expression | ESTree.SpreadElement | undefined;
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
		if (isImportedFromEffect(sourceCode, unwrapped, new Set(["promise"]))) return "promise";
		if (isImportedFromEffect(sourceCode, unwrapped, new Set(["tryPromise"]))) return "tryPromise";
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
