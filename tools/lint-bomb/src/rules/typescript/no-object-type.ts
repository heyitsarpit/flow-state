import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isPathWithin } from "../../shared/module-path.ts";

type RuleOptions = [{ sourceRoots?: string[] }];

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
				"The TypeScript object type does not describe the facts this consumer needs. Declare the required protocol fields or preserve the input/output relationship with a generic. A pure value needs no state owner, and giving an equally broad type a name does not strengthen its contract.",
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
		defaultOptions: [{}] satisfies RuleOptions,
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
						: undefined;
				sourceFile = sourceRoots === undefined || sourceRoots.some((root) => isPathWithin(context.filename, root, context.cwd));
			},
			TSObjectKeyword(node: ESTree.TSObjectKeyword) {
				if (sourceFile) context.report({ node, messageId: "objectType" });
			},
		};
	},
});
