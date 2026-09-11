import { defineRule } from "@oxlint/plugins";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

function resolveVariable(sourceCode: SourceCode, identifier: ESTree.Node): Variable | null {
	if (identifier.type !== "Identifier") return null;
	let scope: Scope | null = sourceCode.getScope(identifier);
	while (scope !== null) {
		const variable = scope.set.get(identifier.name);
		if (variable !== undefined) return variable;
		scope = scope.upper;
	}
	return null;
}

function isGlobalObjectReference(sourceCode: SourceCode, node: ESTree.Node): boolean {
	if (node.type !== "Identifier" || node.name !== "Object") return false;
	if (sourceCode.isGlobalReference(node)) return true;
	const variable = resolveVariable(sourceCode, node);
	return variable === null || variable.defs.length === 0;
}

function isFreezeProperty(node: ESTree.MemberExpression): boolean {
	return node.computed
		? node.property.type === "Literal" && node.property.value === "freeze"
		: node.property.type === "Identifier" && node.property.name === "freeze";
}

/** Review Object.freeze against the owning boundary; syntax cannot classify its contract. */
export const noObjectFreezeRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Review Object.freeze against the owner contract; observable snapshots may require it.",
		},
		messages: {
			objectFreeze:
				"Review this Object.freeze call at its owner boundary. It may be valid for an observable snapshot or admission proof.",
		},
	},
	createOnce(context) {
		return {
			MemberExpression(node: ESTree.MemberExpression) {
				if (!isGlobalObjectReference(context.sourceCode, node.object) || !isFreezeProperty(node)) return;
				context.report({ node, messageId: "objectFreeze" });
			},
		};
	},
});
