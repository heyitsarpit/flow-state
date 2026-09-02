import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isPathWithin } from "../shared/module-path.ts";

type RuleOptions = [{ sourceRoots?: string[] }];

const defaultSourceRoots = ["packages/flow-state-rewrite"] as const;

/** Reject the TypeScript `object` keyword in configured source roots. */
export const noObjectTypeRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow the broad TypeScript object type; use a named owner type or an explicit domain contract.",
		},
		messages: {
			objectType:
				"The TypeScript `object` type is forbidden. Use a named owner type or an explicit domain contract.",
		},
		schema: [
			{
				type: "object",
				properties: {
					sourceRoots: { type: "array", items: { type: "string" } },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{ sourceRoots: [...defaultSourceRoots] }] satisfies RuleOptions,
	},
	createOnce(context) {
		let sourceFile = false;
		return {
			Program() {
				const option = context.options?.[0];
				const rawSourceRoots =
					typeof option === "object" && option !== null && !Array.isArray(option)
						? option.sourceRoots
						: undefined;
				const sourceRoots =
					Array.isArray(rawSourceRoots) &&
					rawSourceRoots.every((root): root is string => typeof root === "string")
						? rawSourceRoots
						: defaultSourceRoots;
				sourceFile = sourceRoots.some((root) => isPathWithin(context.filename, root));
			},
			TSObjectKeyword(node: ESTree.TSObjectKeyword) {
				if (sourceFile) context.report({ node, messageId: "objectType" });
			},
		};
	},
});
