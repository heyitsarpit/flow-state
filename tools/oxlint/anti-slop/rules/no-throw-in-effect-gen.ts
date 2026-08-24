import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { isImportedFromEffect } from "../shared/effect-import.ts";

function isEffectGeneratorCallee(
	sourceCode: SourceCode,
	callee: ESTree.Expression,
): boolean {
	if (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.object.type === "Identifier" &&
		callee.property.type === "Identifier" &&
		(callee.property.name === "gen" || callee.property.name === "fn")
	) {
		return isImportedFromEffect(sourceCode, callee.object, new Set(["Effect"]));
	}

	return (
		callee.type === "CallExpression" && isEffectGeneratorCallee(sourceCode, callee.callee)
	);
}

/** Keep recoverable failures in Effect's E channel instead of native throws. */
export const noThrowInEffectGenRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description: "Disallow native throw statements inside Effect.gen and Effect.fn workflows.",
		},
		messages: {
			throw:
				"Do not throw inside Effect.gen or Effect.fn. Use Effect.fail for a typed failure or Effect.die for an explicit defect.",
		},
	},
	createOnce(context) {
		return {
			ThrowStatement(node: ESTree.ThrowStatement) {
				let current: ESTree.Node | null = node.parent;
				while (current !== null) {
					if (
						(current.type === "FunctionDeclaration" ||
							current.type === "FunctionExpression" ||
							current.type === "ArrowFunctionExpression")
					) {
						const parent = current.parent;
						if (parent.type !== "CallExpression" || !isEffectGeneratorCallee(context.sourceCode, parent.callee)) return;
					}
					if (current.type === "CallExpression" && isEffectGeneratorCallee(context.sourceCode, current.callee)) {
						context.report({ node, messageId: "throw" });
						return;
					}
					current = current.parent;
				}
			},
		};
	},
});
