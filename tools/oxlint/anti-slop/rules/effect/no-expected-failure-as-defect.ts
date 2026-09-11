import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect/effect-import.ts";
import { memberName, unwrapExpression } from "../../shared/effect/effect-call.ts";

function isErrorConstruction(node: ESTree.Expression): boolean {
	const value = unwrapExpression(node);
	if (value.type !== "NewExpression") return false;
	const constructor = value.callee;
	const name = constructor.type === "Identifier"
		? constructor.name
		: constructor.type === "MemberExpression"
			? memberName(constructor)
			: null;
	return name === "Error" || name?.endsWith("Error") === true;
}

function isErrorType(type: ESTree.TSType): boolean {
	if (type.type === "TSParenthesizedType") return isErrorType(type.typeAnnotation);
	if (type.type !== "TSTypeReference") return false;
	const name = type.typeName.type === "Identifier"
		? type.typeName.name
		: type.typeName.type === "TSQualifiedName" && type.typeName.right.type === "Identifier"
			? type.typeName.right.name
			: null;
	return name === "Error" || name?.endsWith("Error") === true;
}

function isErrorTypedIdentifier(sourceCode: SourceCode, node: ESTree.IdentifierReference): boolean {
	let scope: Scope | null = sourceCode.getScope(node);
	while (scope !== null) {
		const variable = scope.set.get(node.name);
		if (variable !== undefined) {
			return variable.defs.some((definition) => {
				const defined = definition.node;
				if (defined.type === "VariableDeclarator" && defined.id.type === "Identifier") {
					return defined.id.typeAnnotation !== null && defined.id.typeAnnotation !== undefined && isErrorType(defined.id.typeAnnotation.typeAnnotation);
				}
				return defined.type === "Identifier" && defined.typeAnnotation !== null && defined.typeAnnotation !== undefined && isErrorType(defined.typeAnnotation.typeAnnotation);
			});
		}
		scope = scope.upper;
	}
	return false;
}

function isKnownError(sourceCode: SourceCode, node: ESTree.Expression): boolean {
	const value = unwrapExpression(node);
	return isErrorConstruction(value) || (value.type === "Identifier" && isErrorTypedIdentifier(sourceCode, value));
}

function isEffectMethod(sourceCode: SourceCode, node: ESTree.CallExpression, method: string): boolean {
	const callee = unwrapExpression(node.callee);
	return callee.type === "MemberExpression" && memberName(callee) === method &&
		isImportedFromEffect(sourceCode, callee.object, new Set(["Effect"]));
}

/** Keep recoverable diagnostics in Effect's typed error channel. */
export const noExpectedFailureAsDefectRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Review non-Error values passed to Effect.die or thrown from Effect.sync; syntax cannot classify an expected failure.",
		},
		messages: {
			defect:
				"Review this defect encoding against the owner contract. If the failure is expected, use Effect.fail or Effect.failCause; reserve Effect.die for invariant defects.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				if (
					isEffectMethod(context.sourceCode, node, "die") &&
					node.arguments[0]?.type !== "SpreadElement" &&
					node.arguments[0] !== undefined &&
					!isKnownError(context.sourceCode, node.arguments[0])
				) {
					context.report({ node, messageId: "defect" });
				}
			},
			ThrowStatement(node: ESTree.ThrowStatement) {
				let current: ESTree.Node = node.parent;
				while (
					current.type !== "FunctionExpression" &&
					current.type !== "ArrowFunctionExpression" &&
					current.type !== "Program"
				) current = current.parent;
				if (current.type !== "FunctionExpression" && current.type !== "ArrowFunctionExpression") return;
				const parent = current.parent;
				if (parent.type !== "CallExpression" || !isEffectMethod(context.sourceCode, parent, "sync")) return;
				if (node.argument !== null && !isKnownError(context.sourceCode, node.argument)) {
					context.report({ node, messageId: "defect" });
				}
			},
		};
	},
});
