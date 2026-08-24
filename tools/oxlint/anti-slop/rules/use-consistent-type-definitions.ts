import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

type Preference = "interface" | "type";
type RuleOptions = [{ preference?: Preference }];

const DEFAULT_PREFERENCE: Preference = "type";

function preferenceFromOption(option: unknown): Preference {
	if (typeof option !== "object" || option === null || Array.isArray(option)) {
		return DEFAULT_PREFERENCE;
	}
	return (option as Record<string, unknown>).preference === "interface"
		? "interface"
		: DEFAULT_PREFERENCE;
}

function isSimpleInterface(node: ESTree.TSInterfaceDeclaration): boolean {
	return !node.declare && node.extends.length === 0;
}

function isSimpleObjectAlias(node: ESTree.TSTypeAliasDeclaration): boolean {
	return node.typeAnnotation.type === "TSTypeLiteral";
}

/** Keep ordinary object contracts on one spelling while preserving constructs that do not translate cleanly. */
export const useConsistentTypeDefinitionsRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Prefer one spelling for simple object type definitions. Default preference: `type`; interfaces with heritage and ambient declarations are ignored.",
			defaultPreference: DEFAULT_PREFERENCE,
		},
		messages: {
			preferType:
				"Prefer a `type` alias for this simple object contract. The project default is `type`.",
			preferInterface:
				"Prefer an `interface` for this simple object contract. Configure `preference: \"type\"` if this module intentionally uses type aliases.",
		},
		schema: [
			{
				type: "object",
				properties: {
					preference: { type: "string", enum: ["interface", "type"] },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{ preference: DEFAULT_PREFERENCE }] satisfies RuleOptions,
	},
	createOnce(context) {
		const preference = preferenceFromOption(context.options?.[0]);
		return {
			TSInterfaceDeclaration(node: ESTree.TSInterfaceDeclaration) {
				if (preference === "type" && isSimpleInterface(node)) {
					context.report({ node, messageId: "preferType" });
				}
			},
			TSTypeAliasDeclaration(node: ESTree.TSTypeAliasDeclaration) {
				if (preference === "interface" && isSimpleObjectAlias(node)) {
					context.report({ node, messageId: "preferInterface" });
				}
			},
		};
	},
});
