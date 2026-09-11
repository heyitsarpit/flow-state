import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../../shared/effect/effect-import.ts";
import { memberName, unwrapExpression } from "../../shared/effect/effect-call.ts";

function isEmptyMap(sourceCode: SourceCode, node: ESTree.Expression): boolean {
	const value = unwrapExpression(node);
	if (value.type !== "NewExpression") return false;
	const callee = unwrapExpression(value.callee);
	if (callee.type !== "Identifier" || callee.name !== "Map") return false;
	let scope: Scope | null = sourceCode.getScope(callee);
	while (scope !== null) {
		const variable = scope.set.get(callee.name);
		if (variable !== undefined) return variable.defs.length === 0;
		scope = scope.upper;
	}
	if (value.arguments.length === 0) return true;
	const argument = value.arguments[0];
	return value.arguments.length === 1 && argument?.type === "ArrayExpression" && argument.elements.length === 0;
}

/** Use Context.empty for an empty context instead of bypassing its constructor invariants. */
export const noEmptyContextMakeUnsafeRule = defineRule({
	meta: {
		type: "problem",
		docs: { description: "Disallow Context.makeUnsafe for an empty Map." },
		messages: {
			empty: "Use Context.empty() for an empty context. Reserve Context.makeUnsafe for a populated, already-validated context map.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				const callee = unwrapExpression(node.callee);
				if (callee.type !== "MemberExpression" || memberName(callee) !== "makeUnsafe" ||
					!isImportedFromEffect(context.sourceCode, callee.object, new Set(["Context"]))) return;
				const value = node.arguments[0];
				if (value !== undefined && value.type !== "SpreadElement" && isEmptyMap(context.sourceCode, value)) context.report({ node, messageId: "empty" });
			},
		};
	},
});
