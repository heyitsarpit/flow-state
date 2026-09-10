import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function typeName(node: ESTree.TSTypeReference["typeName"]): string {
	if (node.type === "Identifier") return node.name;
	return node.type === "TSQualifiedName" ? node.right.name : "";
}

function isReadonlyName(name: string): boolean {
	return name.toLowerCase().startsWith("readonly");
}

/** Ban readonly spellings so immutable values have one owner: Data. */
export const noReadonlyRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow readonly syntax and Readonly-prefixed types; use Data for immutable values and owned mutable state for transitions.",
		},
		messages: {
			readonly:
				"Do not use readonly or Readonly-prefixed types. Use Data for immutable values and an owning boundary for mutable state.",
		},
	},
	createOnce(context) {
		const report = (node: ESTree.Node) => context.report({ node, messageId: "readonly" });

		return {
			TSTypeOperator(node: ESTree.TSTypeOperator) {
				if (node.operator === "readonly") report(node);
			},
			TSTypeReference(node: ESTree.TSTypeReference) {
				if (isReadonlyName(typeName(node.typeName))) report(node);
			},
			TSPropertySignature(node: ESTree.TSPropertySignature) {
				if (node.readonly) report(node);
			},
			TSIndexSignature(node: ESTree.TSIndexSignature) {
				if (node.readonly) report(node);
			},
			PropertyDefinition(node: ESTree.PropertyDefinition) {
				if (node.readonly === true) report(node);
			},
			TSAbstractPropertyDefinition(node: ESTree.PropertyDefinition) {
				if (node.readonly === true) report(node);
			},
			TSParameterProperty(node: ESTree.TSParameterProperty) {
				if (node.readonly) report(node);
			},
			TSMappedType(node: ESTree.TSMappedType) {
				if (node.readonly !== null) report(node);
			},
		};
	},
});
