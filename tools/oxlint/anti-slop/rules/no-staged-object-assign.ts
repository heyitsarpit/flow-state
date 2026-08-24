import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

type IdentifierNode = ESTree.IdentifierName | ESTree.IdentifierReference | ESTree.BindingIdentifier;

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

function resolveVariable(
	sourceCode: SourceCode,
	identifier: IdentifierNode,
): Variable | null {
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
	}
	return null;
}

function isGlobalObject(sourceCode: SourceCode, identifier: IdentifierNode): boolean {
	if (sourceCode.isGlobalReference(identifier)) return true;
	const variable = resolveVariable(sourceCode, identifier);
	return variable === null || variable.defs.length === 0;
}

function objectAssignCall(
	sourceCode: SourceCode,
	expression: ESTree.Expression,
): ESTree.CallExpression | null {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type !== "CallExpression") return null;
	const callee = unwrapped.callee;
	if (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.object.type === "Identifier" &&
		callee.object.name === "Object" &&
		isGlobalObject(sourceCode, callee.object) &&
		callee.property.type === "Identifier" &&
		callee.property.name === "assign"
	) {
		return unwrapped;
	}
	return null;
}

/** Disallow mutating a local Object.assign result through a second Object.assign call. */
export const noStagedObjectAssignRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow repeated Object.assign mutation of a local object assembled by Object.assign.",
		},
		messages: {
			stagedObjectAssign:
				"Do not stage object construction through repeated Object.assign calls. Compute derived values first and return one object literal.",
		},
	},
	createOnce(context) {
		const stagedVariables = new Set<Variable>();

		return {
			VariableDeclarator(node: ESTree.VariableDeclarator) {
				if (node.id.type !== "Identifier" || node.init === null) return;
				const initialCall = objectAssignCall(context.sourceCode, node.init);
				if (initialCall === null || initialCall.arguments.length < 2) {
					return;
				}
				const variable = resolveVariable(context.sourceCode, node.id);
				if (variable !== null) stagedVariables.add(variable);
			},
				CallExpression(node: ESTree.CallExpression) {
				const assignCall = objectAssignCall(context.sourceCode, node);
				if (assignCall === null || assignCall.arguments.length < 2) return;
				const [target] = assignCall.arguments;
				if (target?.type !== "Identifier") return;
				const variable = resolveVariable(context.sourceCode, target);
					if (variable !== null && stagedVariables.has(variable)) {
						context.report({ node, messageId: "stagedObjectAssign" });
					}
				},
				AssignmentExpression(node: ESTree.AssignmentExpression) {
					if (node.operator !== "=" || node.left.type !== "Identifier") return;
					const variable = resolveVariable(context.sourceCode, node.left);
					if (variable !== null) stagedVariables.delete(variable);
				},
		};
	},
});
