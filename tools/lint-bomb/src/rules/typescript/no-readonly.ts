import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function typeName(node: ESTree.TSTypeReference["typeName"]): string {
	if (node.type === "Identifier") return node.name;
	return node.type === "TSQualifiedName" ? node.right.name : "";
}

function isReadonlyName(name: string): boolean {
	return name.toLowerCase().startsWith("readonly");
}

function isInsideExportedType(node: ESTree.Node): boolean {
	let current: ESTree.Node | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (current.type === "TSTypeAliasDeclaration" || current.type === "TSInterfaceDeclaration") {
			return current.parent?.type === "ExportNamedDeclaration";
		}
		current = current.parent;
	}
	return false;
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
				"Review whether this readonly declaration is required by the observable contract. Keep ordinary internal trusted records plain and retain required public readonly guarantees. Protect retained facts through ownership and detached publication where needed; readonly syntax alone does not provide runtime isolation. Do not introduce Data merely to replace readonly spelling.",
		},
		schema: [
			{
				type: "object",
				properties: {
					allowInExportedTypes: { type: "boolean" },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{ allowInExportedTypes: false }],
	},
	createOnce(context) {
		const report = (node: ESTree.Node) => {
			const option = context.options?.[0];
			const allowInExportedTypes =
				typeof option === "object" &&
				option !== null &&
				!Array.isArray(option) &&
				option.allowInExportedTypes === true;
			if (allowInExportedTypes && isInsideExportedType(node)) return;
			context.report({ node, messageId: "readonly" });
		};

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
