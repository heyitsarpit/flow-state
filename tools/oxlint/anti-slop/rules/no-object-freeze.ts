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

/** Ban Object.freeze so readonly types and ownership, rather than runtime freezing, define boundaries. */
export const noObjectFreezeRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow Object.freeze; keep mutation private and expose readonly values or copy once at the ownership boundary.",
		},
		messages: {
			objectFreeze:
				"Do not use Object.freeze. Keep mutation private and expose a readonly value or copy once at the ownership boundary.",
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
