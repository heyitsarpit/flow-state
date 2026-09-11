import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function typeName(node: ESTree.TSTypeReference["typeName"]): string {
	if (node.type === "Identifier") return node.name;
	return node.type === "TSQualifiedName" ? node.right.name : "";
}

function isReadonlyName(name: string): boolean {
	return name.toLowerCase().startsWith("readonly");
}

/** Review readonly spellings against the public contract and owning boundary. */
export const noReadonlyRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Review readonly syntax and Readonly-prefixed types against the public contract; use Data where it is the appropriate immutable representation.",
		},
		messages: {
			readonly:
				"Review this readonly shape against its public contract and owner boundary; it may be required for the observable type.",
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
