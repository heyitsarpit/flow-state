import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "./effect-import.ts";

const workflowNames = new Set(["fn", "fnUntraced", "fnUntracedEager", "gen"]);

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

function memberName(expression: ESTree.MemberExpression): string | null {
	if (!expression.computed && expression.property.type === "Identifier") {
		return expression.property.name;
	}
	return expression.computed && expression.property.type === "Literal" && typeof expression.property.value === "string"
		? expression.property.value
		: null;
}

function isTransparentWrapper(node: ESTree.Node): node is ESTree.Expression & { expression: ESTree.Expression } {
	return (
		node.type === "ParenthesizedExpression" ||
		node.type === "TSAsExpression" ||
		node.type === "TSSatisfiesExpression" ||
		node.type === "TSTypeAssertion" ||
		node.type === "TSNonNullExpression" ||
		node.type === "TSInstantiationExpression"
	);
}

export function isEffectWorkflowCallee(
	sourceCode: SourceCode,
	callee: ESTree.Expression,
): boolean {
	callee = unwrapExpression(callee);
	if (
		callee.type === "MemberExpression" &&
		workflowNames.has(memberName(callee) ?? "")
	) {
		return isImportedFromEffect(sourceCode, callee.object, new Set(["Effect"]));
	}

	return (
		callee.type === "CallExpression" && isEffectWorkflowCallee(sourceCode, callee.callee)
	);
}

export function isInsideEffectWorkflow(sourceCode: SourceCode, node: ESTree.Node): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null) {
		if (
			current.type === "FunctionDeclaration" ||
			current.type === "FunctionExpression" ||
			current.type === "ArrowFunctionExpression"
		) {
			let parent: ESTree.Node | null = current.parent;
			while (parent !== null && isTransparentWrapper(parent)) parent = parent.parent;
			if (parent?.type === "CallExpression" && isEffectWorkflowCallee(sourceCode, parent.callee)) {
				return true;
			}
		}
		current = current.parent;
	}
	return false;
}
