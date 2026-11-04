import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

import { importedEffectFunctionName } from "../../shared/effect/effect-import.ts";
import { unwrapExpression } from "../../shared/effect/effect-call.ts";

function isEmptyMap(sourceCode: SourceCode, node: ESTree.Expression): boolean {
	const value = unwrapExpression(node);
	if (value.type !== "NewExpression") return false;
	const callee = unwrapExpression(value.callee);
	if (callee.type !== "Identifier" || callee.name !== "Map") return false;
	let scope: Scope | null = sourceCode.getScope(callee);
	while (scope !== null) {
		const variable = scope.set.get(callee.name);
		if (variable !== undefined) {
			if (variable.defs.length !== 0) return false;
			break;
		}
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
			empty: "Use Context.empty() for an empty context. Context.makeUnsafe retains the supplied Map as its base; do not mutate the map after construction. For populated contexts, prefer typed Context.make or Context.add; reserve Context.makeUnsafe for a documented adapter whose map contract is already established.",
		},
	},
	createOnce(context) {
		return {
			CallExpression(node: ESTree.CallExpression) {
				const callee = unwrapExpression(node.callee);
				if (importedEffectFunctionName(context.sourceCode, node.callee, new Set(["Context"]), new Set(["makeUnsafe"])) !== "makeUnsafe") return;
				const value = node.arguments[0];
				if (value !== undefined && value.type !== "SpreadElement" && isEmptyMap(context.sourceCode, value)) context.report({ node, messageId: "empty" });
			},
		};
	},
});
